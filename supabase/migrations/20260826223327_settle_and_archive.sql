-- "Abrechnen und archivieren" fuer Gaeste, in einem Schritt.
--
-- Die zwei Teile - Ausgleichszahlung buchen und den Gast auf inaktiv setzen - gehoeren
-- zusammen. Einzeln geschickt kann der zweite fehlschlagen, und dann steht ein
-- abgerechneter Gast weiter in der Erfassung oder ein archivierter Gast mit offenem
-- Saldo in der Uebersicht.
--
-- Das Vorzeichen folgt der Saldo-Konvention der App:
--   balance > 0  = hat mehr bezahlt als konsumiert, bekommt Geld
--   balance < 0  = schuldet der WG Geld
create or replace function public.settle_and_archive(
  target_participant_id uuid,
  counterpart_id uuid,
  balance_chf_minor integer,
  note text default null
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
begin
  if balance_chf_minor <> 0 then
    if counterpart_id is null then
      raise exception 'Für die Abrechnung fehlt die Gegenseite.';
    end if;
    if counterpart_id = target_participant_id then
      raise exception 'Abrechnung mit sich selbst ergibt keinen Sinn.';
    end if;

    if balance_chf_minor > 0 then
      insert into settlements (from_participant, to_participant, amount_chf_minor, note)
      values (counterpart_id, target_participant_id, balance_chf_minor, note);
    else
      insert into settlements (from_participant, to_participant, amount_chf_minor, note)
      values (target_participant_id, counterpart_id, -balance_chf_minor, note);
    end if;
  end if;

  -- Harte Regel 8: nur inaktiv, nie geloescht. Alte Belege bleiben, wie sie sind.
  update participants set is_active = false where id = target_participant_id;
  if not found then
    raise exception 'Teilnehmer % existiert nicht.', target_participant_id;
  end if;
end;
$function$;
