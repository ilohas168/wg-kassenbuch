import { describe, expect, it } from 'vitest';
import { formatRate, parseRate } from './rate.js';
import { computeReceiptShares, freezeTotalChf, sumLineItems } from './receipt.js';
import type { LineItem, Receipt } from './types.js';

const M1 = 'm1';
const M2 = 'm2';
const M3 = 'm3';

describe('computeReceiptShares', () => {
	it('gibt einem einzeln zugeordneten Teilnehmer den vollen Positionsbetrag', () => {
		const shares = computeReceiptShares(
			chfReceipt([item('Waschmittel', 1860, [M1, M2, M3]), item('Zigaretten', 890, [M2])])
		);
		expect(shares.get(M2)).toBe(620 + 890);
		expect(shares.get(M1)).toBe(620);
		expect(shares.get(M3)).toBe(620);
		expect(total(shares)).toBe(2750);
	});

	it('behandelt einen Beleg ohne Quittung als Beleg mit genau einer Position', () => {
		const shares = computeReceiptShares(chfReceipt([item('Getraenke', 1000, [M1, M2, M3])]));
		expect([...shares.values()]).toEqual([334, 333, 333]);
		expect(total(shares)).toBe(1000);
	});

	it('trifft bei einem EUR-Beleg mit krummem Kurs die eingefrorene CHF-Summe exakt', () => {
		const rate = parseRate('0.9537');
		const lineItems = [
			item('Getraenke', 1860, [M1, M2, M3]),
			item('Kaese', 1240, [M1, M2]),
			item('Pfand', 1630, [M3])
		];
		const totalMinor = sumLineItems(lineItems);
		expect(totalMinor).toBe(4730);

		const totalChfMinor = freezeTotalChf(totalMinor, rate);
		expect(totalChfMinor).toBe(4511);

		const shares = computeReceiptShares({
			currency: 'EUR',
			paidBy: M2,
			totalMinor,
			fxRateToChf: '0.9537',
			totalChfMinor,
			lineItems
		});

		// Ungerundet waeren es 1182.588 / 1182.588 / 2145.825 - die Summe der gerundeten
		// Werte liegt einen Rappen zu hoch, der wird beim am staerksten aufgerundeten
		// Betrag wieder abgezogen.
		expect(shares.get(M1)).toBe(1182);
		expect(shares.get(M2)).toBe(1183);
		expect(shares.get(M3)).toBe(2146);
		expect(total(shares)).toBe(totalChfMinor);
	});

	it('teilt eine negative Position auf und behaelt das Vorzeichen', () => {
		const lineItems = [
			item('Kaffee', 1000, [M1, M2, M3]),
			item('Cumulus-Bon', -1000, [M1, M2, M3]),
			item('Depot', 100, [M1, M2, M3])
		];
		expect(sumLineItems(lineItems)).toBe(100);

		const shares = computeReceiptShares(chfReceipt(lineItems));
		// Der Rabatt hebt den Einkauf pro Person exakt auf, es bleibt nur das Depot.
		expect(shares.get(M1)).toBe(34);
		expect(shares.get(M2)).toBe(33);
		expect(shares.get(M3)).toBe(33);
		expect(total(shares)).toBe(100);
	});

	it('teilt einen reinen Rueckgabebeleg vollstaendig negativ auf', () => {
		const lineItems = [item('Pfandrueckgabe', -250, [M1, M2, M3])];
		const shares = computeReceiptShares(chfReceipt(lineItems));
		expect([...shares.values()].every((share) => share <= 0)).toBe(true);
		expect(total(shares)).toBe(-250);
	});

	it('liefert unabhaengig von der Reihenfolge aus der DB dasselbe Ergebnis', () => {
		const lineItems = [
			item('Getraenke', 1860, [M1, M2, M3]),
			item('Kaese', 1241, [M2, M1]),
			item('Pfand', 1629, [M3])
		];
		const receipt = { ...chfReceipt(lineItems), currency: 'EUR' as const, fxRateToChf: '0.9537' };
		const frozen = { ...receipt, totalChfMinor: freezeTotalChf(receipt.totalMinor, parseRate('0.9537')) };

		const forward = computeReceiptShares(frozen);
		const reversed = computeReceiptShares({
			...frozen,
			lineItems: [...frozen.lineItems].reverse().map((line) => ({ ...line, shares: [...line.shares].reverse() }))
		});
		expect([...reversed.entries()].sort()).toEqual([...forward.entries()].sort());
	});

	it('trifft die eingefrorene Summe fuer beliebige Belege', () => {
		const random = lcg(4711);
		const rates = ['1', '0.9537', '1.0842', '0.93', '1.000001'];
		for (let run = 0; run < 1000; run++) {
			const rate = parseRate(rates[random() % rates.length]);
			const participants = [M1, M2, M3, 'g1'].slice(0, 1 + (random() % 4));
			const lineItems = Array.from({ length: 1 + (random() % 5) }, (_, index) => {
				const amount = (random() % 40000) - 8000;
				const assigned = participants.filter(() => random() % 2 === 0);
				return item(`Position ${index}`, amount, assigned.length > 0 ? assigned : [participants[0]]);
			});
			const totalMinor = sumLineItems(lineItems);
			const totalChfMinor = freezeTotalChf(totalMinor, rate);
			const shares = computeReceiptShares({
				currency: 'EUR',
				paidBy: M1,
				totalMinor,
				fxRateToChf: formatRate(rate),
				totalChfMinor,
				lineItems
			});
			expect(total(shares)).toBe(totalChfMinor);
		}
	});

	it('meldet sich, wenn Beleg-Total und Positionen weit auseinanderliegen', () => {
		expect(() =>
			computeReceiptShares({
				currency: 'CHF',
				paidBy: M1,
				totalMinor: 5000,
				fxRateToChf: '1',
				totalChfMinor: 5000,
				lineItems: [item('Nur die Haelfte erfasst', 2500, [M1, M2, M3])]
			})
		).toThrow(/Restdifferenz/);
	});

	it('weist Positionen ohne Teilnehmer ab', () => {
		expect(() => computeReceiptShares(chfReceipt([item('Niemand', 100, [])]))).toThrow(/keinem Teilnehmer/);
	});
});

function item(label: string, amountMinor: number, participantIds: string[]): LineItem {
	return {
		label,
		amountMinor,
		shares: participantIds.map((participantId) => ({ participantId, weight: 1 }))
	};
}

function chfReceipt(lineItems: LineItem[]): Receipt {
	const totalMinor = sumLineItems(lineItems);
	return {
		currency: 'CHF',
		paidBy: M1,
		totalMinor,
		fxRateToChf: '1',
		totalChfMinor: totalMinor,
		lineItems
	};
}

function total(shares: Map<string, number>): number {
	let sum = 0;
	for (const share of shares.values()) sum += share;
	return sum;
}

function lcg(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		return state;
	};
}
