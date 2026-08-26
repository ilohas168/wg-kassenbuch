-- Ablage fuer die Belegfotos.
--
-- Der Bucket ist privat und bekommt bewusst keine Policies auf storage.objects: an die
-- Fotos kommt nur der Server mit dem service_role key. Die App reicht sie ueber einen
-- eigenen Endpoint als signierte, kurzlebige URL weiter. Ein oeffentlicher Bucket waere
-- eine Sammlung von Einkaufszetteln mit erratbaren Adressen.
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;
