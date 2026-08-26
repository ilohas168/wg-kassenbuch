-- Phase 2: RLS-Policies.
--
-- Die Regel ist in einem Satz: wer als aktives Mitglied mit seinem Konto verknuepft ist,
-- sieht und aendert alles; alle anderen sehen nichts. Es gibt genau eine WG, also braucht
-- es keine Zeile-fuer-Zeile-Unterscheidung.
--
-- Gaeste haben kein Konto und tauchen hier nicht als Rolle auf - sie sind Daten, keine Nutzer.

-- Ein SQL-Blick auf "bin ich Mitglied?".
--
-- security definer ist hier kein Komfort, sondern noetig: die Funktion wird in den Policies
-- auf participants selbst benutzt. Als invoker wuerde die Policy sich selbst aufrufen.
-- Der Eigentuemer (postgres) umgeht RLS, damit bricht die Rekursion.
create or replace function public.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select exists (
    select 1
    from participants
    where auth_user_id = auth.uid()
      and kind = 'member'
      and is_active
  );
$function$;

comment on function public.is_active_member() is
  'Ist der eingeloggte Nutzer ein aktives Mitglied der WG? Basis aller Policies.';

grant usage on schema public to anon, authenticated;

-- anon bekommt nichts. Vor dem Login gibt es in dieser App keine Daten zu sehen.
revoke all on all tables in schema public from anon;

grant select, insert, update, delete on all tables in schema public to authenticated;

-- Harte Regel 8: Teilnehmer werden nie geloescht. Kein Recht, keine Policy, kein Weg.
revoke delete on participants from authenticated;

-- Auf participants darf der Client nur zwei Spalten anfassen: umbenennen und archivieren.
-- Wer zu welchem Konto gehoert (auth_user_id) und wer Mitglied statt Gast ist (kind),
-- wird ausschliesslich serverseitig mit dem service_role key gesetzt.
--
-- Reihenfolge und Form sind hier wichtig: ein Recht auf Spaltenebene laesst sich nicht
-- aus einem Recht auf Tabellenebene herausschneiden. Das grobe Recht muss weg, bevor
-- das feine gesetzt wird.
revoke update on participants from authenticated;
grant update (display_name, is_active) on participants to authenticated;

create policy participants_select on participants
  for select to authenticated
  using (is_active_member());

create policy participants_insert_guest on participants
  for insert to authenticated
  with check (is_active_member() and kind = 'guest');

create policy participants_update on participants
  for update to authenticated
  using (is_active_member())
  with check (is_active_member());

create policy receipts_read_write on receipts
  for all to authenticated
  using (is_active_member())
  with check (is_active_member());

create policy line_items_read_write on line_items
  for all to authenticated
  using (is_active_member())
  with check (is_active_member());

create policy line_item_shares_read_write on line_item_shares
  for all to authenticated
  using (is_active_member())
  with check (is_active_member());

create policy settlements_read_write on settlements
  for all to authenticated
  using (is_active_member())
  with check (is_active_member());
