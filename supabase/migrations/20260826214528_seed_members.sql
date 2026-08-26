-- Seed: die drei WG-Mitglieder.
--
-- Bewusst eine Migration und keine supabase/seed.sql: seed.sql laeuft nur bei einem
-- lokalen `supabase db reset`, nicht bei `supabase db push` auf das Cloud-Projekt.
-- Idempotent ueber feste UUIDs, damit ein erneutes Anwenden nichts dupliziert.
--
-- auth_user_id bleibt hier null. Die Verknuepfung mit dem Magic-Link-Konto passiert in
-- Phase 2 beim ersten Login.

insert into participants (id, display_name, kind, auth_user_id, is_active) values
  ('00000000-0000-4000-8000-000000000001', 'Shinichiro', 'member', null, true),
  ('00000000-0000-4000-8000-000000000002', 'Fabian',     'member', null, true),
  ('00000000-0000-4000-8000-000000000003', 'Pierre',     'member', null, true)
on conflict (id) do nothing;
