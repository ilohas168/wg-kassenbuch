import { json } from '@sveltejs/kit';
import { parseReferenceRate, referenceRateUrl } from '$lib/fx.js';
import type { RequestHandler } from './$types';

/** Nach dieser Zeit gilt der Kursdienst als nicht erreichbar. Die Erfassung wartet nicht. */
const TIMEOUT_MS = 4000;

/**
 * Referenzkurs EUR -> CHF fuer einen Tag (EZB-Daten ueber frankfurter.app, ohne Key).
 *
 * Antwortet immer mit 200: ein fehlender Kurs ist kein Fehler, sondern der Hinweis, ihn
 * von Hand einzutragen. Der Aufruf laeuft ueber den Server, damit das Handy des Nutzers
 * nicht bei einem Dritten anklopfen muss.
 */
export const GET: RequestHandler = async ({ url, fetch }) => {
	const date = url.searchParams.get('date') ?? '';
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
		return json({ rate: null, error: 'Kein gültiges Datum.' });
	}

	try {
		const response = await fetch(referenceRateUrl(date), {
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});
		if (!response.ok) {
			return json({ rate: null, error: `Kursdienst antwortet mit ${response.status}.` });
		}

		const reference = parseReferenceRate(await response.json());
		if (!reference) return json({ rate: null, error: 'Der Kursdienst lieferte nichts Brauchbares.' });

		return json({ rate: reference.rate, date: reference.date, error: null });
	} catch {
		return json({ rate: null, error: 'Der Kursdienst ist nicht erreichbar.' });
	}
};
