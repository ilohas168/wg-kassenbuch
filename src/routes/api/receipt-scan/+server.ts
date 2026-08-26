import { error, json } from '@sveltejs/kit';
import { parseReceiptSuggestion, type ReceiptSuggestion } from '$lib/ocr/parse.js';
import { readReceiptImage, SUPPORTED_IMAGE_TYPES, type SupportedImageType } from '$lib/server/anthropic.js';
import { supabaseAdmin } from '$lib/server/supabase.js';
import type { RequestHandler } from './$types';

/** 6 MB - die API nimmt maximal 5 MB Bilddaten, der Client schickt normalerweise unter 1 MB. */
const MAX_BYTES = 6 * 1024 * 1024;

const EXTENSIONS: Record<SupportedImageType, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/gif': 'gif'
};

/**
 * Nimmt ein Belegfoto entgegen, legt es im privaten Bucket ab und laesst es lesen.
 *
 * Das Ergebnis ist ein Vorschlag, kein Eintrag (harte Regel 5): der Beleg wird hier nicht
 * gespeichert, sondern zurueck ins Formular gegeben, wo der Nutzer ihn bestaetigt.
 * Scheitert die Erkennung, ist das kein Fehler, sondern ein leerer Vorschlag - das Foto
 * liegt trotzdem schon da und das Formular ist eben von Hand auszufuellen.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.participant) error(401, 'Nicht angemeldet.');

	const form = await request.formData();
	const photo = form.get('photo');

	if (!(photo instanceof File)) error(400, 'Kein Foto erhalten.');
	if (photo.size === 0) error(400, 'Das Foto ist leer.');
	if (photo.size > MAX_BYTES) error(413, 'Das Foto ist zu gross. Bitte kleiner als 6 MB.');

	const mediaType = photo.type as SupportedImageType;
	if (!SUPPORTED_IMAGE_TYPES.includes(mediaType)) {
		error(415, `Format ${photo.type || 'unbekannt'} wird nicht unterstützt. JPEG, PNG, WebP oder GIF.`);
	}

	const bytes = new Uint8Array(await photo.arrayBuffer());
	const photoPath = `${new Date().getFullYear()}/${crypto.randomUUID()}.${EXTENSIONS[mediaType]}`;

	const upload = await supabaseAdmin()
		.storage.from('receipts')
		.upload(photoPath, bytes, { contentType: mediaType, upsert: false });

	if (upload.error) {
		error(500, `Das Foto konnte nicht abgelegt werden: ${upload.error.message}`);
	}

	let suggestion: ReceiptSuggestion | null = null;
	let ocrError: string | null = null;

	try {
		suggestion = parseReceiptSuggestion(await readReceiptImage(Buffer.from(bytes).toString('base64'), mediaType));
		if (!suggestion) ocrError = 'Der Beleg war nicht lesbar.';
	} catch (caught) {
		ocrError = caught instanceof Error ? caught.message : String(caught);
	}

	return json({ photoPath, suggestion, ocrError });
};
