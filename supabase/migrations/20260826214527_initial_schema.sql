-- Initiales Schema fuer das WG-Kassenbuch (eine WG, keine Mandantenfaehigkeit).
--
-- Harte Regeln aus SPEC.md, die hier im Schema verankert sind:
--   * Geld ist immer integer in Minor Units (Rappen / Eurocent), Spalten enden auf _minor.
--   * Es gibt kein Saldo-Feld und keine Saldo-Cache-Tabelle. Salden werden aus den
--     Anteilen aggregiert, nie gespeichert.
--   * Der Wechselkurs wird beim Erfassen eingefroren: receipts.fx_rate_to_chf und
--     receipts.total_chf_minor sind Momentaufnahmen, kein Tageskurs beim Lesen.
--   * Aufteilung haengt ausschliesslich an line_items, nie an receipts. Ein Beleg ohne
--     Quittung ist ein Beleg mit genau einer Position.
--   * Teilnehmer werden nie geloescht, nur is_active = false. Alle Fremdschluessel auf
--     participants sind deshalb on delete restrict.

create type participant_kind as enum ('member', 'guest');
create type currency_code as enum ('CHF', 'EUR');

-- Mitglieder und Gaeste. Gaeste haben kein Konto und keine E-Mail, verhalten sich in der
-- Aufteilung aber exakt wie Mitglieder.
create table participants (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (length(btrim(display_name)) > 0),
  kind participant_kind not null,
  auth_user_id uuid references auth.users (id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint participants_guest_has_no_auth_user check (kind = 'member' or auth_user_id is null)
);

create unique index participants_auth_user_id_key
  on participants (auth_user_id)
  where auth_user_id is not null;

comment on column participants.is_active is
  'Archiviert statt geloescht. Inaktive Teilnehmer verschwinden aus der Erfassungs-UI, bleiben in alten Belegen sichtbar.';

-- Ein Beleg. total_minor ist in Belegwaehrung, total_chf_minor ist der eingefrorene
-- CHF-Gegenwert zum Zeitpunkt der Erfassung.
create table receipts (
  id uuid primary key default gen_random_uuid(),
  merchant text not null,
  purchased_at date not null,
  currency currency_code not null,
  total_minor integer not null,
  fx_rate_to_chf numeric(18, 10) not null check (fx_rate_to_chf > 0),
  total_chf_minor integer not null,
  paid_by uuid not null references participants (id) on delete restrict,
  photo_path text,
  created_at timestamptz not null default now(),
  created_by uuid references participants (id) on delete restrict,
  constraint receipts_chf_rate_is_one check (currency <> 'CHF' or fx_rate_to_chf = 1),
  constraint receipts_chf_totals_match check (currency <> 'CHF' or total_chf_minor = total_minor)
);

create index receipts_purchased_at_idx on receipts (purchased_at desc, created_at desc);
create index receipts_paid_by_idx on receipts (paid_by);

comment on column receipts.total_minor is 'Beleg-Total in Belegwaehrung, Minor Units.';
comment on column receipts.fx_rate_to_chf is
  'Beim Erfassen eingefroren. Bei CHF exakt 1. Bei EUR entweder Referenzkurs (Frankfurter/EZB) oder Effektivkurs (CHF-Kartenbelastung / EUR-Total).';
comment on column receipts.total_chf_minor is 'Eingefrorener CHF-Gegenwert in Rappen. Nie beim Lesen neu berechnen.';

-- Positionen eines Belegs. Betraege duerfen negativ sein (Rabatt, Aktion, Pfandrueckgabe).
create table line_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references receipts (id) on delete cascade,
  label text not null,
  amount_minor integer not null,
  sort_order integer not null default 0
);

create index line_items_receipt_id_idx on line_items (receipt_id, sort_order, id);

comment on column line_items.amount_minor is
  'In Belegwaehrung, Minor Units. Negativ bei Rabatt / Pfandrueckgabe.';
comment on column line_items.sort_order is
  'Anzeigereihenfolge auf dem Beleg. Nicht in SPEC.md, aber noetig fuer eine stabile Positionsliste.';

-- Wer traegt welche Position mit. weight bleibt in v1 ueberall 1; die Spalte existiert,
-- damit ungleiche Aufteilung spaeter ohne Schema-Migration nachruestbar ist. Keine UI dafuer.
create table line_item_shares (
  line_item_id uuid not null references line_items (id) on delete cascade,
  participant_id uuid not null references participants (id) on delete restrict,
  weight integer not null default 1 check (weight > 0),
  primary key (line_item_id, participant_id)
);

create index line_item_shares_participant_id_idx on line_item_shares (participant_id);

-- Ausgleichszahlungen. Markieren eine Schuld als beglichen, bewegen kein Geld.
create table settlements (
  id uuid primary key default gen_random_uuid(),
  from_participant uuid not null references participants (id) on delete restrict,
  to_participant uuid not null references participants (id) on delete restrict,
  amount_chf_minor integer not null check (amount_chf_minor > 0),
  settled_at timestamptz not null default now(),
  note text,
  constraint settlements_distinct_parties check (from_participant <> to_participant)
);

create index settlements_from_participant_idx on settlements (from_participant);
create index settlements_to_participant_idx on settlements (to_participant);
create index settlements_settled_at_idx on settlements (settled_at desc);

-- RLS ist ab jetzt auf allen Tabellen aktiv. Ohne Policies heisst das: deny by default.
-- Der anon key kommt damit an keine Daten. Die Policies fuer eingeloggte Mitglieder
-- folgen in Phase 2; bis dahin laeuft jeder Zugriff serverseitig ueber den service_role
-- key, der RLS umgeht.
alter table participants enable row level security;
alter table receipts enable row level security;
alter table line_items enable row level security;
alter table line_item_shares enable row level security;
alter table settlements enable row level security;
