import type { Currency } from '$lib/money/index.js';

/** Was die Belegerkennung im besten Fall liefert. */
export interface ReceiptSuggestion {
	merchant: string;
	purchasedAt: string;
	currency: Currency;
	/** Beleg-Total laut Modell. Kann von der Summe der Positionen abweichen. */
	totalMinor: number;
	lineItems: { label: string; amountMinor: number }[];
}

/**
 * Parst die Antwort des Modells - defensiv, weil ein Modell kein Parser ist.
 *
 * Gibt null zurueck, statt zu werfen: ein unlesbarer Beleg ist kein Fehlerfall, sondern
 * der Normalfall "dann eben von Hand". Der Aufrufer schickt den Nutzer in die manuelle
 * Erfassung, nicht in einen Fehlerdialog.
 */
export function parseReceiptSuggestion(raw: string): ReceiptSuggestion | null {
	const json = extractJson(raw);
	if (!json) return null;

	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch {
		return null;
	}

	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
	const candidate = parsed as Record<string, unknown>;

	const merchant = typeof candidate.merchant === 'string' ? candidate.merchant.trim() : '';
	const purchasedAt = typeof candidate.purchased_at === 'string' ? candidate.purchased_at.trim() : '';
	const currency = candidate.currency;
	const totalMinor = candidate.total_minor;

	if (currency !== 'CHF' && currency !== 'EUR') return null;
	if (!Number.isSafeInteger(totalMinor)) return null;
	if (!Array.isArray(candidate.line_items)) return null;

	const lineItems: { label: string; amountMinor: number }[] = [];
	for (const entry of candidate.line_items) {
		if (typeof entry !== 'object' || entry === null) continue;
		const item = entry as Record<string, unknown>;
		if (!Number.isSafeInteger(item.amount_minor)) continue;
		const label = typeof item.label === 'string' ? item.label.trim() : '';
		lineItems.push({ label, amountMinor: item.amount_minor as number });
	}

	// Ein Beleg ohne erkennbare Position ist kein Vorschlag, sondern ein leeres Blatt.
	if (lineItems.length === 0) return null;

	return {
		merchant,
		// Ein unplausibles Datum wird nicht geraten - das Formular nimmt dann heute.
		purchasedAt: /^\d{4}-\d{2}-\d{2}$/.test(purchasedAt) && !Number.isNaN(Date.parse(purchasedAt))
			? purchasedAt
			: '',
		currency,
		totalMinor: totalMinor as number,
		lineItems
	};
}

/**
 * Holt den JSON-Teil aus der Antwort: Markdown-Fences abstreifen, sonst vom ersten
 * "{" bis zur letzten "}". Das Modell ist angewiesen, nur JSON zu liefern - diese
 * Funktion ist die Versicherung dagegen, dass es sich doch einmal erklaeren will.
 */
export function extractJson(raw: string): string | null {
	const text = raw.trim();
	if (text.length === 0) return null;

	const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
	const body = fenced ? fenced[1].trim() : text;

	const start = body.indexOf('{');
	const end = body.lastIndexOf('}');
	if (start === -1 || end === -1 || end < start) return null;

	return body.slice(start, end + 1);
}

/**
 * Die Pruefung, die laut Spec im Code passiert und nicht im Prompt: stimmt die Summe
 * der Positionen mit dem Beleg-Total ueberein? Die Differenz gehoert dem Nutzer gezeigt,
 * verbieten tut sie nichts.
 */
export function totalMismatch(suggestion: ReceiptSuggestion): number {
	const sum = suggestion.lineItems.reduce((total, item) => total + item.amountMinor, 0);
	return suggestion.totalMinor - sum;
}
