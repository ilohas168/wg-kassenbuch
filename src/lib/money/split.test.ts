import { describe, expect, it } from 'vitest';
import { splitLargestRemainder } from './split.js';

describe('splitLargestRemainder', () => {
	it('teilt 1000 durch 3 zu [334, 333, 333] und trifft die Summe exakt', () => {
		const shares = splitLargestRemainder(1000, [1, 1, 1]);
		expect(shares).toEqual([334, 333, 333]);
		expect(sum(shares)).toBe(1000);
	});

	it('gibt einem einzelnen Teilnehmer den vollen Betrag', () => {
		expect(splitLargestRemainder(1860, [1])).toEqual([1860]);
	});

	it('haelt bei negativen Betraegen das Vorzeichen und spiegelt die positive Aufteilung', () => {
		const rabatt = splitLargestRemainder(-1000, [1, 1, 1]);
		expect(rabatt).toEqual([-334, -333, -333]);
		expect(sum(rabatt)).toBe(-1000);
		expect(rabatt.every((share) => share <= 0)).toBe(true);

		// Einkauf und Rabatt heben sich pro Person exakt auf.
		const einkauf = splitLargestRemainder(1000, [1, 1, 1]);
		expect(einkauf.map((share, index) => share + rabatt[index])).toEqual([0, 0, 0]);
	});

	it('verteilt Betraege, die kleiner sind als die Teilnehmerzahl', () => {
		expect(splitLargestRemainder(1, [1, 1, 1])).toEqual([1, 0, 0]);
		expect(splitLargestRemainder(-1, [1, 1, 1])).toEqual([-1, 0, 0]);
		expect(splitLargestRemainder(0, [1, 1, 1])).toEqual([0, 0, 0]);
	});

	it('beachtet Gewichte, auch wenn v1 sie nicht nutzt', () => {
		const shares = splitLargestRemainder(1000, [2, 1, 1]);
		expect(shares).toEqual([500, 250, 250]);
		expect(sum(shares)).toBe(1000);
	});

	it('trifft die Summe fuer beliebige Betraege und Teilnehmerzahlen', () => {
		const random = lcg(20260826);
		for (let run = 0; run < 2000; run++) {
			const participants = 1 + (random() % 6);
			const weights = Array.from({ length: participants }, () => 1 + (random() % 3));
			const amount = (random() % 200000) - 100000;
			const shares = splitLargestRemainder(amount, weights);
			expect(sum(shares)).toBe(amount);
			expect(shares.every((share) => (amount < 0 ? share <= 0 : share >= 0))).toBe(true);
		}
	});

	it('weist unbrauchbare Eingaben ab', () => {
		expect(() => splitLargestRemainder(100, [])).toThrow(/ohne Teilnehmer/);
		expect(() => splitLargestRemainder(10.5, [1])).toThrow(/Integer/);
		expect(() => splitLargestRemainder(100, [0, 1])).toThrow(/positiver Integer/);
	});
});

function sum(values: number[]): number {
	return values.reduce((total, value) => total + value, 0);
}

/** Deterministischer Pseudozufall, damit ein Fehlschlag reproduzierbar bleibt. */
function lcg(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		return state;
	};
}
