import { formatRate, rateFromNumber } from '$lib/money/index.js';

/** Ein Referenzkurs, wie ihn die Frankfurter-API liefert. */
export interface ReferenceRate {
	/** Kurs als Dezimalstring, direkt speicherbar. */
	rate: string;
	/** Der Tag, fuer den der Kurs gilt. An Wochenenden der letzte Handelstag davor. */
	date: string;
}

/**
 * SPEC.md nennt https://api.frankfurter.app/{datum}. Diese Adresse antwortet seit einiger
 * Zeit mit einem 301 auf api.frankfurter.dev/v1 (geprueft am 27.08.2026); dieselben
 * EZB-Daten, dieselbe Antwortstruktur, weiterhin ohne Key. Hier steht direkt das Ziel,
 * damit nicht jede Kursabfrage erst einen Umweg laeuft.
 */
export const FRANKFURTER_URL = 'https://api.frankfurter.dev/v1';

export function referenceRateUrl(purchasedAt: string): string {
	return `${FRANKFURTER_URL}/${purchasedAt}?from=EUR&to=CHF`;
}

/**
 * Liest die Antwort der Frankfurter-API (EZB-Daten).
 *
 * Gibt null zurueck statt zu werfen: ein fehlender Referenzkurs darf die Erfassung nicht
 * blockieren - dann wird der Kurs eben von Hand eingetragen.
 */
export function parseReferenceRate(payload: unknown): ReferenceRate | null {
	if (typeof payload !== 'object' || payload === null) return null;
	const body = payload as Record<string, unknown>;

	const rates = body.rates;
	if (typeof rates !== 'object' || rates === null) return null;

	const chf = (rates as Record<string, unknown>).CHF;
	if (typeof chf !== 'number' || !Number.isFinite(chf) || chf <= 0) return null;

	const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null;
	if (!date) return null;

	try {
		return { rate: formatRate(rateFromNumber(chf)), date };
	} catch {
		return null;
	}
}
