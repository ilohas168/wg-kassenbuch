import { describe, expect, it } from 'vitest';
import { convertMinor, effectiveRate, formatRate, parseRate, RATE_ONE } from './rate.js';

describe('Wechselkurs', () => {
	it('liest und schreibt Kurse verlustfrei', () => {
		expect(formatRate(parseRate('0.9537'))).toBe('0.9537');
		expect(formatRate(parseRate('1'))).toBe('1');
		expect(formatRate(parseRate('1.0000000000'))).toBe('1');
		expect(formatRate(parseRate('0.9539112050'))).toBe('0.953911205');
	});

	it('weist Kurse ab, die nicht in numeric(18, 10) passen', () => {
		expect(() => parseRate('0.95391120501')).toThrow(/Nachkommastellen/);
		expect(() => parseRate('0')).toThrow(/groesser als 0/);
		expect(() => parseRate('-1.2')).toThrow(/Ungueltiger Wechselkurs/);
		expect(() => parseRate('abc')).toThrow(/Ungueltiger Wechselkurs/);
	});

	it('laesst CHF-Betraege bei Kurs 1 unveraendert', () => {
		expect(convertMinor(4730, RATE_ONE)).toEqual({ rounded: 4730, residual: 0n });
		expect(convertMinor(-1250, RATE_ONE)).toEqual({ rounded: -1250, residual: 0n });
	});

	it('rundet kaufmaennisch von der Null weg, in beide Richtungen', () => {
		const half = parseRate('0.005');
		expect(convertMinor(100, half).rounded).toBe(1); // 0.5 -> 1
		expect(convertMinor(-100, half).rounded).toBe(-1); // -0.5 -> -1
		expect(convertMinor(1240, parseRate('0.9537')).rounded).toBe(1183); // 1182.588
		expect(convertMinor(2250, parseRate('0.9537')).rounded).toBe(2146); // 2145.825
	});

	it('berechnet den Effektivkurs aus der Kartenbelastung', () => {
		// 47.30 EUR wurden mit 45.12 CHF belastet.
		expect(formatRate(effectiveRate(4512, 4730))).toBe('0.9539112051');
		expect(formatRate(effectiveRate(4730, 4730))).toBe('1');
	});
});
