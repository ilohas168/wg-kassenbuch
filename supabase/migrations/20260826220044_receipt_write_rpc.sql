-- Schreibpfad fuer Belege als eine Transaktion.
--
-- Ein Beleg besteht aus drei Tabellen (receipts, line_items, line_item_shares). Ueber
-- einzelne PostgREST-Aufrufe geschrieben, kann ein Abbruch nach dem ersten Insert einen
-- Beleg ohne Positionen hinterlassen - und damit einen Saldo, der stillschweigend falsch
-- ist. Deshalb schreibt die App ueber diese Funktionen: ein Aufruf, eine Transaktion.
--
-- security invoker: die Funktionen laufen mit den Rechten des Aufrufers, damit die
-- RLS-Policies aus Phase 2 auch hier greifen.

-- Ersetzt alle Positionen eines Belegs. Gedacht als Helfer fuer die beiden Funktionen
-- darunter, aber bewusst ohne Rechteentzug: create_receipt laeuft als security invoker,
-- also wird diese Funktion mit den Rechten des Aufrufers ausgefuehrt und braucht dessen
-- execute-Recht. Ein Entzug haette den ganzen Schreibpfad blockiert. Schaden richtet ein
-- Direktaufruf nicht an - die Policies auf line_items und line_item_shares gelten auch hier.
create or replace function public.set_line_items(target_receipt_id uuid, items jsonb)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  item jsonb;
  item_index integer;
  new_item_id uuid;
  share jsonb;
begin
  if items is null or jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 then
    raise exception 'Ein Beleg braucht mindestens eine Position.';
  end if;

  delete from line_items where receipt_id = target_receipt_id;

  for item, item_index in
    select value, ordinality from jsonb_array_elements(items) with ordinality
  loop
    if jsonb_typeof(item->'shares') <> 'array' or jsonb_array_length(item->'shares') = 0 then
      raise exception 'Position "%" ist keinem Teilnehmer zugeordnet.', item->>'label';
    end if;

    insert into line_items (receipt_id, label, amount_minor, sort_order)
    values (
      target_receipt_id,
      item->>'label',
      (item->>'amount_minor')::integer,
      item_index - 1
    )
    returning id into new_item_id;

    for share in select value from jsonb_array_elements(item->'shares')
    loop
      insert into line_item_shares (line_item_id, participant_id, weight)
      values (
        new_item_id,
        (share->>'participant_id')::uuid,
        coalesce((share->>'weight')::integer, 1)
      );
    end loop;
  end loop;
end;
$function$;

create or replace function public.create_receipt(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  new_receipt_id uuid;
begin
  insert into receipts (
    merchant, purchased_at, currency, total_minor,
    fx_rate_to_chf, total_chf_minor, paid_by, photo_path, created_by
  )
  values (
    payload->>'merchant',
    (payload->>'purchased_at')::date,
    (payload->>'currency')::currency_code,
    (payload->>'total_minor')::integer,
    (payload->>'fx_rate_to_chf')::numeric,
    (payload->>'total_chf_minor')::integer,
    (payload->>'paid_by')::uuid,
    nullif(payload->>'photo_path', ''),
    nullif(payload->>'created_by', '')::uuid
  )
  returning id into new_receipt_id;

  perform set_line_items(new_receipt_id, payload->'line_items');
  return new_receipt_id;
end;
$function$;

create or replace function public.update_receipt(target_receipt_id uuid, payload jsonb)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
begin
  -- created_at und created_by bleiben stehen: sie beschreiben die Erfassung, nicht den Beleg.
  update receipts set
    merchant = payload->>'merchant',
    purchased_at = (payload->>'purchased_at')::date,
    currency = (payload->>'currency')::currency_code,
    total_minor = (payload->>'total_minor')::integer,
    fx_rate_to_chf = (payload->>'fx_rate_to_chf')::numeric,
    total_chf_minor = (payload->>'total_chf_minor')::integer,
    paid_by = (payload->>'paid_by')::uuid
  where id = target_receipt_id;

  if not found then
    raise exception 'Beleg % existiert nicht.', target_receipt_id;
  end if;

  perform set_line_items(target_receipt_id, payload->'line_items');
end;
$function$;
