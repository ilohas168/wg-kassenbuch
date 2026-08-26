import { describe, expect, it } from 'vitest';
import { parseReceiptDraft } from './draft.js';
import type { Participant } from '$lib/money/index.js';

const participants: Participant[] = [
	{ id: 'm1', displayName: 'Shinichiro', kind: 'member', isActive: true },
	{ id: 'm2', displayName: 'Fabian', kind: 'member', isActive: true },
	{ id: 'g1', displayName: 'Yuki', kind: 'guest', isActive: true }
];

const valid = {
	merchant: 'Migros',
	purchasedAt: '2026-08-27',
	currency: 'CHF',
	paidBy: 'm1',
	lineItems: [
		{ label: 'Grillgut', amountMinor: 3000, participantIds: ['m1', 'm2', 'g1'] },
		{ label: 'Cumulus-Bon', amountMinor: -250, participantIds: ['m1', 'm2'] }
	]
};

describe('parseReceiptDraft', () => {
	it('rechnet Total und CHF-Total selbst aus, statt dem Client zu glauben', () => {
		const draft = parseReceiptDraft({ ...valid, totalMinor: 999999, totalChfMinor: 1 }, participants);
		expect(draft.totalMinor).toBe(2750);
		expect(draft.totalChfMinor).toBe(2750);
		expect(draft.fxRateToChf).toBe('1');
	});

	it('nimmt bei leerer Bezeichnung den Ladennamen', () => {
		const draft = parseReceiptDraft(
			{ ...valid, lineItems: [{ label: '  ', amountMinor: 4730, participantIds: ['m1'] }] },
			participants
		);
		expect(draft.lineItems[0].label).toBe('Migros');
	});

	it('rechnet einen EUR-Beleg mit dem uebergebenen Kurs um', () => {
		const draft = parseReceiptDraft(
			{
				...valid,
				currency: 'EUR',
				fxRateToChf: '0.9537',
				lineItems: [{ label: 'Kaese', amountMinor: 4730, participantIds: ['m1', 'm2'] }]
			},
			participants
		);
		expect(draft.totalMinor).toBe(4730);
		expect(draft.totalChfMinor).toBe(4511);
	});

	it('erzwingt bei CHF den Kurs 1, auch wenn der Client etwas anderes schickt', () => {
		const draft = parseReceiptDraft({ ...valid, fxRateToChf: '0.5' }, participants);
		expect(draft.fxRateToChf).toBe('1');
	});

	it('weist unvollstaendige oder manipulierte Entwuerfe ab', () => {
		const cases: [string, unknown, RegExp][] = [
			['ohne Laden', { ...valid, merchant: '   ' }, /Laden fehlt/],
			['mit kaputtem Datum', { ...valid, purchasedAt: '27.08.2026' }, /kein gueltiges Datum/],
			['mit fremder Waehrung', { ...valid, currency: 'USD' }, /wird nicht unterstuetzt/],
			['mit unbekanntem Zahler', { ...valid, paidBy: 'x' }, /kein bekannter Teilnehmer/],
			['ohne Positionen', { ...valid, lineItems: [] }, /mindestens eine Position/],
			[
				'mit unzugeordneter Position',
				{ ...valid, lineItems: [{ label: 'A', amountMinor: 100, participantIds: [] }] },
				/keinem Teilnehmer zugeordnet/
			],
			[
				'mit Kommabetrag',
				{ ...valid, lineItems: [{ label: 'A', amountMinor: 10.5, participantIds: ['m1'] }] },
				/keinen gueltigen Betrag/
			],
			[
				'mit unbekanntem Teilnehmer',
				{ ...valid, lineItems: [{ label: 'A', amountMinor: 100, participantIds: ['nope'] }] },
				/unbekannten Teilnehmer/
			],
			[
				'mit doppeltem Teilnehmer',
				{ ...valid, lineItems: [{ label: 'A', amountMinor: 100, participantIds: ['m1', 'm1'] }] },
				/denselben Teilnehmer doppelt/
			]
		];

		for (const [name, input, pattern] of cases) {
			expect(() => parseReceiptDraft(input, participants), name).toThrow(pattern);
		}
	});
});
