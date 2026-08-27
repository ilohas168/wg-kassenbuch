# WG-Kassenbuch

Gemeinsame Ausgaben einer 3er-WG in Basel. CHF ist Basiswährung, EUR-Belege werden
mit eingefrorenem Kurs erfasst. Verbindliche Spezifikation: **[SPEC.md](SPEC.md)** —
bei Widersprüchen gilt die Spec, nicht dieses README.

## Stand

Alle sechs Phasen sind gebaut. Was noch fehlt, ist nichts am Code, sondern die
Verbindung nach draussen: Supabase-Projekt, Deploy, Keys (siehe **Setup**).

- [x] **Phase 0** — Repo, SvelteKit, Schema, Migrationen, Seed mit drei Mitgliedern
- [x] **Phase 1** — Manuelle Erfassung, Aufteilung, Saldoberechnung, Tests
- [x] **Phase 2** — Magic Link, RLS-Policies, PWA, Vercel-Adapter
- [x] **Phase 3** — Fotoupload, Belegerkennung, Review-Screen, Key-Leak-Check
- [x] **Phase 4** — EUR-Flow: Währungsauswahl, Referenzkurs, Effektivkurs
- [x] **Phase 5** — Gästeverwaltung und Abrechnung

## Setup

```sh
npm install
```

**Supabase-Projekt** (einmalig, im Browser): auf [supabase.com](https://supabase.com/dashboard)
ein Projekt anlegen und das DB-Passwort notieren. Die Region bestimmt, wo die Daten liegen;
dieses Projekt läuft in `eu-west-1` (Irland). Der Vercel-Adapter in `vite.config.ts` ist
darauf abgestimmt (`dub1`) — wer die Datenbank woanders anlegt, zieht die Region dort mit.

```sh
npx supabase login                              # öffnet den Browser
npx supabase link --project-ref <project-ref>   # ref steht in der Projekt-URL
npm run db:push                                 # Schema, Seed, Policies, Storage-Bucket
cp .env.example .env                            # Werte aus Project Settings -> API
```

**Anmeldung** freischalten:

1. `ALLOWED_EMAILS` in `.env` (und in den Vercel-Variablen) auf die drei WG-Adressen
   setzen, kommagetrennt. Ohne diese Liste ist der Login gesperrt — Supabase verschickt
   Magic Links sonst an jede Adresse, die danach fragt, und die App hängt öffentlich im Netz.
2. Im Dashboard unter **Authentication → URL Configuration**: Site URL auf die
   Vercel-Domain, und `http://localhost:5173/auth/callback` sowie
   `https://<domain>/auth/callback` als Redirect URLs eintragen.

**Belegerkennung**: `ANTHROPIC_API_KEY` in `.env` bzw. bei Vercel. Der Key wird
ausschliesslich serverseitig gelesen (`src/lib/server/anthropic.ts`).

Beim ersten Login wählt jede Person einmalig ihr Mitglied aus („Wer bist du?"). Das setzt
`participants.auth_user_id` und passiert genau einmal pro Person.

## Deploy

```sh
npx vercel link
npx vercel env add PUBLIC_SUPABASE_URL          # und die vier anderen aus .env.example
npx vercel --prod
```

Die Runtime ist auf `dub1` festgenagelt, passend zur Datenbank in Irland.

## Skripte

| Befehl | Zweck |
| --- | --- |
| `npm run dev` | Dev-Server |
| `npm run build` | Produktions-Build |
| `npm test` | Vitest einmalig |
| `npm run test:watch` | Vitest im Watch-Modus |
| `npm run check` | svelte-check / TypeScript |
| `npm run db:new -- <name>` | neue Migration anlegen |
| `npm run db:push` | Migrationen ins verknüpfte Projekt pushen |

## Aufbau

```
src/lib/money/      Rechenkern: Aufteilung, Kurse, Salden, Formatierung. Ohne DB, ohne UI.
src/lib/ocr/        Parser für die Antwort der Belegerkennung. Rein, ohne SDK.
src/lib/server/     Supabase-Clients, Repository, Entwurfsprüfung, Anthropic-Aufruf.
src/lib/components/ ReceiptForm — Erfassen, Review und Bearbeiten in einem Formular.
src/routes/         Übersicht, Erfassen, Verlauf, Abrechnen, Personen, Login, Auth.
supabase/migrations Schema, Seed, RPCs, Policies, Storage-Bucket.
```

Der Rechenkern kennt weder Datenbank noch Browser. Dieselbe Funktion, die den Saldo
rechnet, zeigt im Formular die Vorschau der Anteile.

## Datenbank

Migrationen in `supabase/migrations/` sind die einzige Quelle der Wahrheit — keine
Änderungen von Hand im Dashboard, sonst driftet der Stand auseinander.

Der Seed der drei Mitglieder ist bewusst eine Migration und keine `seed.sql`:
`supabase db push` führt nur Migrationen aus. Die Inserts sind über feste UUIDs idempotent.

Beleg, Positionen und Anteile werden über die RPC `create_receipt` / `update_receipt`
geschrieben — ein Aufruf, eine Transaktion. Einzeln geschickt könnte ein Abbruch einen
Beleg ohne Positionen hinterlassen, und damit einen Saldo, der stillschweigend falsch ist.

RLS ist auf allen Tabellen aktiv: wer als aktives Mitglied mit seinem Konto verknüpft ist,
sieht und schreibt alles, alle anderen nichts. `anon` hat keinerlei Rechte. Auf
`participants` darf der Client nur `display_name` und `is_active` ändern; ein DELETE-Recht
gibt es dort nicht (harte Regel 8).

## Tests

```sh
npm test
```

92 Tests, davon 29 gegen **echtes Postgres**: [PGlite](https://pglite.dev) startet
Postgres 18 als WebAssembly im Testprozess, spielt die Migrationen ein und prüft
Constraints, RPC-Transaktionen und die RLS-Policies mit echten Rollen und JWT-Claim.
Dafür braucht es weder Docker noch das Cloud-Projekt.

Die von der Spec geforderten Rechentests liegen in `src/lib/money/*.test.ts`.

## Konventionen

- Prosa, Kommentare und UI auf Deutsch. Bezeichner in Code und Schema auf Englisch.
- Geld ist ausnahmslos `integer` in Minor Units (Rappen/Eurocent), Spalten enden auf
  `_minor`. Formatiert wird nur in `src/lib/money/format.ts`.
- Wechselkurse werden als skalierte Integer in BigInt gerechnet, nie als Gleitkommazahl.
- Salden werden berechnet, nie gespeichert.
