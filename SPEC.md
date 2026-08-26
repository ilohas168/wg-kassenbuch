# SPEC.md — WG-Kassenbuch

## Kontext

Ich baue eine App für meine 3er-WG in Basel, um gemeinsame Ausgaben zu verwalten.
Zwei von uns haben iPhones, einer Android. Wir kaufen meist in der Schweiz (CHF)
ein, gelegentlich in Deutschland (EUR). Manchmal sind Gäste da, für die wir
mitkaufen und die später zurückzahlen.

Diese Datei ist die verbindliche Spezifikation. Halte dich daran. Wo etwas
unklar oder widersprüchlich ist: frag nach, statt zu raten oder Features zu
erfinden.

## Nicht-Ziele

Das ist bewusst ausgeschlossen — bau es nicht, auch nicht "schon mal vorbereitend":

- Keine native App, kein React Native, kein App Store.
- Keine Zahlungsabwicklung. Die App markiert Schulden als beglichen, sie
  überweist kein Geld.
- Keine Mandantenfähigkeit. Genau eine WG, keine Workspaces, keine Einladungslinks.
- Kein Budgeting, keine Kategorien, keine Auswertungen, keine Diagramme in v1.
- Keine Push-Notifications.

## Stack

- **Frontend:** SvelteKit + Vite, als installierbare PWA (Manifest + Service Worker).
- **Backend/DB:** Supabase (Postgres, Auth via Magic Link, Storage für Belegfotos).
  Row Level Security aktiv.
- **Hosting:** Vercel.
- **Belegerkennung:** Anthropic Messages API mit Bild-Input, aufgerufen aus einem
  serverseitigen SvelteKit-Endpoint (`+server.ts`).

Schlag das aktuelle Modell-ID unter https://docs.claude.com/en/docs/about-claude/models
nach, bevor du es fest verdrahtest — nimm nichts aus dem Gedächtnis. Leg die ID
in eine Konstante, nicht verstreut in den Code.

Sprache: Prosa und UI auf Deutsch, Bezeichner im Code und Schema auf Englisch.

## Harte Regeln

Diese sind nicht verhandelbar. Wenn eine Änderung eine davon verletzen würde,
brich ab und sag mir Bescheid.

1. **Geld ist immer Integer in Minor Units** (Rappen bzw. Eurocent). Nie Float,
   nie `numeric` mit Nachkommastellen, nie Rechnen auf formatierten Strings.
   Spaltennamen enden auf `_minor`. Formatierung passiert ausschliesslich in
   einer zentralen Display-Funktion.
2. **Salden werden immer berechnet, nie gespeichert.** Kein `balance`-Feld,
   keine Cache-Tabelle. Aggregation aus den Anteilen.
3. **Der Wechselkurs wird beim Erfassen eingefroren** und auf dem Beleg
   gespeichert. Kein Umrechnen mit Tageskurs beim Lesen.
4. **Aufteilung passiert auf Positionsebene, nie auf Belegebene.** Ein Beleg ohne
   Quittung ist ein Beleg mit genau einer Position — kein Sonderfall im Code.
5. **Die KI trägt nie direkt ein.** Jeder OCR-Vorschlag geht durch einen
   Bestätigungs-Screen.
6. **Der API-Key liegt ausschliesslich serverseitig.** Er darf in keinem
   Client-Bundle landen. Prüf das nach Phase 3 explizit im gebauten Bundle.
7. **Restrappen werden deterministisch verteilt.** Die Summe der Anteile muss
   exakt dem Positionsbetrag entsprechen. Dafür gibt es Tests (siehe unten).
8. **Teilnehmer werden nie gelöscht**, nur auf inaktiv gesetzt. Historische
   Belege müssen korrekt bleiben.

## Datenmodell

```
participants
  id, display_name
  kind            'member' | 'guest'
  auth_user_id    nullable, nur bei kind='member'
  is_active       boolean, default true

receipts
  id
  merchant, purchased_at
  currency            'CHF' | 'EUR'
  total_minor         Beleg-Total in Belegwährung
  fx_rate_to_chf      numeric, bei CHF exakt 1
  total_chf_minor     eingefroren beim Anlegen
  paid_by             -> participants.id
  photo_path          nullable, Supabase Storage
  created_at, created_by

line_items
  id, receipt_id
  label
  amount_minor        in Belegwährung, darf negativ sein (Rabatt, Pfandrückgabe)

line_item_shares
  line_item_id, participant_id
  weight              integer, default 1

settlements
  id, from_participant, to_participant
  amount_chf_minor, settled_at, note
```

`weight` bleibt in v1 überall 1, aber die Spalte existiert von Anfang an, damit
ungleiche Aufteilung später ohne Schema-Migration nachrüstbar ist. Bau dafür
keine UI.

## Währungslogik

Basiswährung ist CHF. Alle Salden und Abrechnungen sind in CHF.

Beim Erfassen eines EUR-Belegs bekommt der Nutzer zwei Wege für den Kurs:

- **Referenzkurs:** Vorschlag von `https://api.frankfurter.app/{purchased_at}?from=EUR&to=CHF`
  (EZB-Daten, kein API-Key nötig). Wenn der Aufruf fehlschlägt, blockiere nicht —
  lass manuelle Eingabe zu.
- **Effektivkurs:** Der Zahler gibt den CHF-Betrag ein, der seiner Karte belastet
  wurde. Daraus wird `fx_rate_to_chf = chf_belastet / total_eur` berechnet. Das
  ist der genauere Weg, weil Kartengebühren enthalten sind. Mach das zur
  bevorzugten Option in der UI.

**Aufteilungs- und Rundungsalgorithmus** (genau so implementieren):

1. Teile jeden `amount_minor` in Belegwährung nach Grösstrest-Methode auf die
   zugeordneten Teilnehmer auf. Summe der Anteile == `amount_minor`.
2. Summiere pro Teilnehmer über alle Positionen des Belegs → Betrag in Belegwährung.
3. Rechne jeden Teilnehmerbetrag in CHF um und runde.
4. Verteile die Differenz zwischen der Summe der gerundeten CHF-Beträge und
   `total_chf_minor` erneut per Grösstrest. Danach muss die Summe exakt
   `total_chf_minor` sein.

Bei negativen Positionen (Rabatt, Pfandrückgabe) muss der Grösstrest-Ansatz
vorzeichenkorrekt funktionieren. Das ist eine typische Fehlerquelle — teste es.

## Gäste

- Ein Gast wird von einem Mitglied mit blossem Namen angelegt. Kein Login,
  keine E-Mail, kein Konto.
- Ein Gast verhält sich in der Aufteilungs-UI exakt wie ein Mitglied: er kann
  Positionen zugeordnet bekommen und hat einen eigenen Saldo.
- Ein Gast kann auch `paid_by` sein.
- In der Split-UI erscheinen standardmässig nur die drei Mitglieder. Aktive Gäste
  stehen darunter, klar abgesetzt, und sind bei "alles gemeinsam" **nicht**
  mitgemeint. Sonst zahlt der Gast versehentlich das Waschmittel mit.
- "Abrechnen und archivieren" legt ein `settlement` an und setzt `is_active=false`.
  Der Gast verschwindet aus der Erfassungs-UI, bleibt aber in allen alten Belegen
  sichtbar.

## Belegerkennung

Server-Endpoint nimmt das Bild entgegen und schickt es an die Messages API mit
der Anweisung, ausschliesslich JSON zurückzugeben — kein Fliesstext, keine
Markdown-Fences:

```json
{
  "merchant": "string",
  "purchased_at": "YYYY-MM-DD",
  "currency": "CHF | EUR",
  "total_minor": 4730,
  "line_items": [{ "label": "string", "amount_minor": 1860 }]
}
```

Parse defensiv: Fences abstreifen, `try/catch`, bei Parse-Fehler den Nutzer in
die manuelle Erfassung schicken statt einen Fehlerdialog zu zeigen.

**Validierung im Code, nicht im Prompt:** Wenn `sum(line_items) != total_minor`,
zeig das im Review-Screen als deutliche Warnung mit der Differenz an. Speichern
bleibt erlaubt — es könnte ein Beleg mit Zeilen sein, die das Modell nicht lesen
konnte. Aber der Nutzer muss es sehen.

Eigenheiten, die im Prompt an das Modell adressiert werden müssen:

- **Schweiz:** Migros/Coop. Rabatte (Aktion, Cumulus-Bon, Supercard) erscheinen als
  eigene negative Zeilen und gehören als negative Positionen übernommen. Depot
  (Pfand) ist eine eigene Position. Die MwSt-Aufstellung am Belegende ist keine
  Position.
- **Deutschland:** Rewe/Lidl/Aldi/Edeka. Dezimaltrennzeichen ist das **Komma**
  ("2,49"). Pfand und Pfandrückgabe sind eigene Zeilen, Rückgabe negativ. Die
  Steuerübersicht (A 19%, B 7%) ist keine Position.
- Artikelnamen können über zwei Zeilen umbrechen und gehören zusammengefasst.
- Menge×Einzelpreis-Zeilen ("2 x 1,29") ergeben eine Position mit dem Gesamtbetrag.

## Screens

1. **Übersicht** — wer schuldet wem wieviel, in CHF, maximal vereinfacht
   (bei 3–4 Personen minimale Anzahl Transaktionen berechnen).
2. **Erfassen** — Foto schiessen oder manuell. Kamera über
   `<input type="file" accept="image/*" capture="environment">`.
3. **Review & Aufteilen** — Positionsliste, pro Zeile Avatare der Teilnehmer,
   Mitglieder default aktiv. Oben zwei Shortcuts: "alles gemeinsam" und
   "alles privat". Bei EUR-Belegen die Kurseingabe. Ziel: ein normaler Einkauf
   ist in unter 15 Sekunden erfasst.
4. **Verlauf** — Belege chronologisch, editierbar.
5. **Abrechnung** — Zeitraum abschliessen, Ausgleichszahlungen anzeigen,
   als bezahlt markieren.
6. **Personen** — Gäste anlegen, abrechnen, archivieren.

## Tests, die existieren müssen

Schreib diese als echte Tests (Vitest), nicht als manuelle Checkliste:

- `1000` durch 3 → `[334, 333, 333]`, Summe exakt 1000.
- Position nur einem Teilnehmer zugeordnet → er trägt den vollen Betrag.
- EUR-Beleg mit krummem Kurs: Summe der CHF-Anteile == `total_chf_minor`.
- Negative Position (Rabatt) wird korrekt aufgeteilt, Vorzeichen bleibt erhalten.
- Beleg mit Gast: Saldo des Gasts stimmt, Mitglieder tragen den Rest.
- Gast auf `is_active=false` gesetzt → historische Belege und deren Aufteilung
  bleiben unverändert.
- Saldo-Aggregation über mehrere Belege in beiden Währungen.

## Arbeitsweise

Bau in dieser Reihenfolge. **Stopp nach jeder Phase**, zeig mir was läuft, und
warte auf mein Go, bevor du weitermachst.

- **Phase 0** — Repo, SvelteKit, Supabase-Projekt, vollständiges Schema inklusive
  Währungs- und Gästefelder, Migrationen, Seed mit drei Mitgliedern.
- **Phase 1** — Manuelle Erfassung, Aufteilung, Saldoberechnung, alle Tests aus
  der Liste oben grün. Noch ohne Auth, noch ohne Foto. Das ist das Fundament;
  hier nicht schludern.
- **Phase 2** — Auth per Magic Link, RLS-Policies, PWA-Manifest, Deploy auf Vercel.
  Ab hier auf dem Handy testbar.
- **Phase 3** — Fotoupload, OCR-Endpoint, Review-Screen. Key-Leak-Check.
- **Phase 4** — EUR-Flow in der UI: Währungsauswahl, Kursvorschlag, Effektivkurs.
- **Phase 5** — Gästeverwaltung und Abrechnung.

Halte dich beim Bauen an die harten Regeln oben. Wenn dir während einer Phase
auffällt, dass die Spec einen Fall nicht abdeckt: frag, bevor du eine Annahme
triffst.
