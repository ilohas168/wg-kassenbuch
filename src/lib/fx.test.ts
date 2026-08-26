import { describe, expect, it } from 'vitest';
import { parseReferenceRate, referenceRateUrl } from './fx.js';

describe('Referenzkurs', () => {
	it('baut die Abfrage fuer den Kauftag', () => {
		expect(referenceRateUrl('2026-08-26')).toBe(
			'https://api.frankfurter.dev/v1/2026-08-26?from=EUR&to=CHF'
		);
	});

	it('liest die echte Antwortstruktur des Dienstes', () => {
		// Woertlich die Antwort von api.frankfurter.dev/v1/2026-08-26?from=EUR&to=CHF.
		const live = { amount: 1.0, base: 'EUR', date: '2026-08-26', rates: { CHF: 0.938 } };
		expect(parseReferenceRate(live)).toEqual({ rate: '0.938', date: '2026-08-26' });
	});

	it('liest die Antwort der EZB-Daten', () => {
		expect(parseReferenceRate({ amount: 1, base: 'EUR', date: '2026-08-26', rates: { CHF: 0.9312 } })).toEqual({
			rate: '0.9312',
			date: '2026-08-26'
		});
	});

	it('behaelt den Tag, den die API zurueckmeldet - am Wochenende ist das der Handelstag davor', () => {
		const parsed = parseReferenceRate({ date: '2026-08-21', rates: { CHF: 0.93 } });
		expect(parsed?.date).toBe('2026-08-21');
	});

	it('gibt null zurueck, statt die Erfassung mit einer Ausnahme zu blockieren', () => {
		for (const payload of [
			null,
			'kaputt',
			{},
			{ date: '2026-08-26' },
			{ date: '2026-08-26', rates: {} },
			{ date: '2026-08-26', rates: { CHF: 0 } },
			{ date: '2026-08-26', rates: { CHF: -1 } },
			{ date: '26.08.2026', rates: { CHF: 0.93 } }
		]) {
			expect(parseReferenceRate(payload), JSON.stringify(payload)).toBeNull();
		}
	});
});
