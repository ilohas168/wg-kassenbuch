import { error, redirect } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase.js';
import type { RequestHandler } from './$types';

/** Wie lange eine Foto-URL gilt. Kurz, weil sie nur fuer das eine Anschauen gebraucht wird. */
const SIGNED_URL_SECONDS = 60;

/**
 * Zeigt ein Belegfoto - ohne den Bucket oeffentlich zu machen.
 *
 * Der Pfad wird nicht geglaubt, sondern nachgeschlagen: nur wenn es einen Beleg gibt,
 * den dieser Nutzer laut Policies sehen darf, gibt es eine signierte URL. Damit ist
 * Raten von Pfaden zwecklos.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.participant) error(401, 'Nicht angemeldet.');

	const path = url.searchParams.get('path');
	if (!path) error(400, 'Kein Pfad angegeben.');

	const { data, error: lookupError } = await locals.supabase
		.from('receipts')
		.select('id')
		.eq('photo_path', path)
		.maybeSingle();

	if (lookupError) error(500, lookupError.message);
	if (!data) error(404, 'Zu diesem Foto gibt es keinen Beleg.');

	const signed = await supabaseAdmin().storage.from('receipts').createSignedUrl(path, SIGNED_URL_SECONDS);
	if (signed.error || !signed.data) error(500, signed.error?.message ?? 'Signierte URL fehlgeschlagen.');

	redirect(302, signed.data.signedUrl);
};
