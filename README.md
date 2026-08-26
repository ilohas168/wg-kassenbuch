# WG-Kassenbuch

Gemeinsame Ausgaben einer 3er-WG in Basel. CHF ist Basiswährung, EUR-Belege werden
mit eingefrorenem Kurs erfasst. Verbindliche Spezifikation: **[SPEC.md](SPEC.md)** —
bei Widersprüchen gilt die Spec, nicht dieses README.

## Stand

- [x] **Phase 0** — Repo, SvelteKit, Schema, Migrationen, Seed mit drei Mitgliedern
- [ ] **Phase 1** — Manuelle Erfassung, Aufteilung, Saldoberechnung, Tests
- [x] **Phase 2** — Magic Link, RLS-Policies, PWA, Vercel
- [ ] **Phase 3** — Fotoupload, OCR-Endpoint, Review-Screen
- [ ] **Phase 4** — EUR-Flow in der UI
- [ ] **Phase 5** — Gästeverwaltung und Abrechnung

## Setup

```sh
npm install
```

Supabase-Projekt (einmalig, im Browser): auf [supabase.com](https://supabase.com/dashboard)
ein Projekt anlegen, Region `eu-central-1` (Frankfurt) — das ist von Basel aus die
nächstgelegene. DB-Passwort notieren.

```sh
npx supabase login                          # oeffnet den Browser
npx supabase link --project-ref <project-ref>   # ref steht in der Projekt-URL
npm run db:push                             # Schema + Seed ins Cloud-Projekt
cp .env.example .env                        # Werte aus Project Settings -> API
```

## Anmeldung

Login läuft über Magic Link, ohne Passwort. Zwei Dinge müssen dafür stimmen:

1. **`ALLOWED_EMAILS`** in `.env` bzw. in den Vercel-Variablen — kommagetrennt die drei
   WG-Adressen. Ohne diese Liste ist der Login gesperrt: Supabase verschickt Magic Links
   sonst an jede Adresse, die danach fragt, und die App hängt öffentlich im Netz.
2. Im Supabase-Dashboard unter **Authentication → URL Configuration**: Site URL auf die
   Vercel-Domain, und `http://localhost:5173/auth/callback` sowie
   `https://<domain>/auth/callback` als Redirect URLs eintragen.

Beim ersten Login wählt jede Person einmalig ihr Mitglied aus („Wer bist du?"). Das setzt
`participants.auth_user_id` und passiert genau einmal pro Person. Die Spec sagt nicht, wie
diese Verknüpfung zustande kommen soll — eine E-Mail-Spalte im Schema wäre die Alternative
gewesen, aber die steht nicht im Datenmodell.

## Deploy

```sh
npx vercel link
npx vercel env add PUBLIC_SUPABASE_URL          # und die anderen drei aus .env.example
npx vercel --prod
```

Die Runtime ist auf `fra1` festgenagelt, passend zur Datenbank in Frankfurt.

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

## Datenbank

Migrationen liegen in `supabase/migrations/` und sind die einzige Quelle der Wahrheit
für das Schema — keine Änderungen von Hand im Dashboard, sonst driftet der Stand
auseinander.

Der Seed der drei Mitglieder ist bewusst eine Migration und keine `seed.sql`:
`supabase db push` führt nur Migrationen aus, `seed.sql` liefe nur bei einem lokalen
`db reset`. Die Inserts sind über feste UUIDs idempotent.

RLS ist auf allen Tabellen aktiv, aber es gibt noch keine Policies — die Datenbank ist
damit für den anon key dicht. Bis die Policies in Phase 2 kommen, läuft jeder Zugriff
serverseitig über den `service_role` key.

## Konventionen

- Prosa, Kommentare und UI auf Deutsch. Bezeichner in Code und Schema auf Englisch.
- Geld ist ausnahmslos `integer` in Minor Units (Rappen/Eurocent), Spalten enden auf
  `_minor`. Formatiert wird nur in einer zentralen Display-Funktion.
- Salden werden berechnet, nie gespeichert.
