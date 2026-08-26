import { describe, expect, it } from 'vitest';
import { extractJson, parseReceiptSuggestion, totalMismatch } from './parse.js';

const migros = {
	merchant: 'Migros',
	purchased_at: '2026-08-27',
	currency: 'CHF',
	total_minor: 4730,
	line_items: [
		{ label: 'Rispentomaten', amount_minor: 380 },
		{ label: 'Cumulus-Bon', amount_minor: -250 },
		{ label: 'Depot', amount_minor: 50 },
		{ label: 'Milch 2 x 1.29', amount_minor: 258 }
	]
};

describe('extractJson', () => {
	it('nimmt blankes JSON', () => {
		expect(extractJson('{"a":1}')).toBe('{"a":1}');
	});

	it('streift Markdown-Fences ab', () => {
		expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
		expect(extractJson('```\n{"a":1}\n```')).toBe('{"a":1}');
	});

	it('findet das JSON auch zwischen Fliesstext', () => {
		expect(extractJson('Hier ist der Beleg:\n{"a":1}\nAlles klar?')).toBe('{"a":1}');
	});

	it('gibt null zurueck, wenn nichts drin ist', () => {
		expect(extractJson('')).toBeNull();
		expect(extractJson('Das kann ich nicht lesen.')).toBeNull();
	});
});

describe('parseReceiptSuggestion', () => {
	it('liest einen sauberen Vorschlag', () => {
		const suggestion = parseReceiptSuggestion(JSON.stringify(migros));
		expect(suggestion).not.toBeNull();
		expect(suggestion?.merchant).toBe('Migros');
		expect(suggestion?.currency).toBe('CHF');
		expect(suggestion?.totalMinor).toBe(4730);
		expect(suggestion?.lineItems).toHaveLength(4);
		// Der Rabatt bleibt negativ.
		expect(suggestion?.lineItems[1].amountMinor).toBe(-250);
	});

	it('ueberlebt Fliesstext und Fences um das JSON herum', () => {
		const raw = '```json\n' + JSON.stringify(migros) + '\n```';
		expect(parseReceiptSuggestion(raw)?.merchant).toBe('Migros');
	});

	it('gibt null statt einer Ausnahme zurueck, wenn nichts brauchbar ist', () => {
		for (const raw of ['', 'Tut mir leid, das Bild ist unscharf.', '{kaputt', '[]', 'null']) {
			expect(parseReceiptSuggestion(raw), raw).toBeNull();
		}
	});

	it('weist Vorschlaege ohne brauchbare Pflichtfelder ab', () => {
		expect(parseReceiptSuggestion(JSON.stringify({ ...migros, currency: 'USD' }))).toBeNull();
		expect(parseReceiptSuggestion(JSON.stringify({ ...migros, total_minor: 47.3 }))).toBeNull();
		expect(parseReceiptSuggestion(JSON.stringify({ ...migros, line_items: [] }))).toBeNull();
	});

	it('wirft einzelne unbrauchbare Positionen weg, nicht den ganzen Beleg', () => {
		const suggestion = parseReceiptSuggestion(
			JSON.stringify({
				...migros,
				line_items: [{ label: 'Brot', amount_minor: 380 }, { label: 'Krumm', amount_minor: '3.80' }]
			})
		);
		expect(suggestion?.lineItems).toEqual([{ label: 'Brot', amountMinor: 380 }]);
	});

	it('laesst ein unplausibles Datum leer, statt es zu raten', () => {
		expect(parseReceiptSuggestion(JSON.stringify({ ...migros, purchased_at: '27.08.2026' }))?.purchasedAt).toBe('');
		expect(parseReceiptSuggestion(JSON.stringify({ ...migros, purchased_at: '2026-13-45' }))?.purchasedAt).toBe('');
	});
});

describe('totalMismatch', () => {
	it('meldet 0, wenn Positionen und Total zusammenpassen', () => {
		const suggestion = parseReceiptSuggestion(
			JSON.stringify({ ...migros, total_minor: 438, line_items: migros.line_items })
		);
		expect(totalMismatch(suggestion!)).toBe(0);
	});

	it('meldet die Differenz, wenn eine Zeile fehlt', () => {
		const suggestion = parseReceiptSuggestion(JSON.stringify(migros));
		// 380 - 250 + 50 + 258 = 438, auf dem Beleg stehen 4730.
		expect(totalMismatch(suggestion!)).toBe(4292);
	});
});
