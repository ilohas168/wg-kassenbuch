import { describe, expect, it } from 'vitest';
import { formatBalance, formatMinor, formatMoney, parseMoneyInput, tryParseMoneyInput } from './format.js';

describe('formatMoney', () => {
	it('schreibt Betraege in Schweizer Konvention', () => {
		expect(formatMoney(4730)).toBe('CHF 47.30');
		expect(formatMoney(4730, 'EUR')).toBe('EUR 47.30');
		expect(formatMoney(5)).toBe('CHF 0.05');
		expect(formatMoney(0)).toBe('CHF 0.00');
		expect(formatMoney(-1250, 'EUR')).toBe('EUR -12.50');
		expect(formatMinor(123456789)).toBe('1’234’567.89');
	});

	it('zeigt Salden mit explizitem Vorzeichen', () => {
		expect(formatBalance(3250)).toBe('CHF +32.50');
		expect(formatBalance(-3250)).toBe('CHF -32.50');
		expect(formatBalance(0)).toBe('CHF 0.00');
	});

	it('formatiert nur Integer', () => {
		expect(() => formatMoney(47.3)).toThrow(/Integer/);
	});
});

describe('parseMoneyInput', () => {
	it('liest Punkt und Komma als Dezimaltrennzeichen', () => {
		expect(parseMoneyInput('47.30')).toBe(4730);
		expect(parseMoneyInput('2,49')).toBe(249); // deutscher Beleg
		expect(parseMoneyInput('12')).toBe(1200);
		expect(parseMoneyInput('0.5')).toBe(50);
		expect(parseMoneyInput(" 1'234.50 ")).toBe(123450);
		expect(parseMoneyInput('1’234.50')).toBe(123450);
		expect(parseMoneyInput('-3.20')).toBe(-320);
	});

	it('weist ab, was kein Betrag ist', () => {
		for (const input of ['', 'abc', '1.234', '4.', '.5', '1.2.3', '1e3', '--1']) {
			expect(() => parseMoneyInput(input), input).toThrow();
			expect(tryParseMoneyInput(input)).toBeNull();
		}
	});

	it('kehrt die Formatierung exakt um', () => {
		for (const minorUnits of [0, 5, 99, 100, 4730, -4730, 123456789, -1]) {
			expect(parseMoneyInput(formatMinor(minorUnits))).toBe(minorUnits);
		}
	});
});
