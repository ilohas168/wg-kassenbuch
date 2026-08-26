import type { Currency } from './types.js';

/**
 * Die zentrale Display-Funktion (harte Regel 1). Geld wird ausschliesslich hier zu Text.
 *
 * Bewusst kein Intl.NumberFormat: das nimmt eine Gleitkommazahl entgegen, und dafuer
 * muesste man den Minor-Betrag durch 100 teilen. Die Formatierung passiert deshalb
 * direkt auf den Integer-Stellen. Schweizer Schreibweise, also Tausender-Apostroph und
 * Punkt als Dezimaltrennzeichen, auch bei EUR - alles andere waere in derselben Liste
 * eine Stolperfalle.
 */
export function formatMoney(minorUnits: number, currency: Currency = 'CHF'): string {
	return `${currency} ${formatMinor(minorUnits)}`;
}

/** Nur der Betrag, ohne Waehrungscode. Fuer Eingabefelder und enge Tabellen. */
export function formatMinor(minorUnits: number): string {
	if (!Number.isInteger(minorUnits)) {
		throw new Error(`Betrag muss ein Integer in Minor Units sein, war ${minorUnits}.`);
	}
	const negative = minorUnits < 0;
	const absolute = Math.abs(minorUnits);
	const whole = Math.floor(absolute / 100);
	const fraction = absolute % 100;
	return `${negative ? '-' : ''}${groupThousands(whole)}.${fraction.toString().padStart(2, '0')}`;
}

/** Saldo mit explizitem Vorzeichen, damit "+" und "-" in der Uebersicht sofort lesbar sind. */
export function formatBalance(minorUnits: number, currency: Currency = 'CHF'): string {
	const sign = minorUnits > 0 ? '+' : '';
	return `${currency} ${sign}${formatMinor(minorUnits)}`;
}

/**
 * Liest eine Betragseingabe in Minor Units ein - ohne den Umweg ueber parseFloat.
 * Akzeptiert Punkt und Komma als Dezimaltrennzeichen (deutsche Belege schreiben "2,49"),
 * Apostroph und Leerzeichen als Tausendertrenner, und ein fuehrendes Minus fuer Rabatte.
 */
export function parseMoneyInput(input: string): number {
	const cleaned = input.trim().replace(/[\s'’]/g, '').replace(',', '.');
	const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
	if (!match) {
		throw new Error(`"${input}" ist kein gueltiger Betrag.`);
	}
	const [, sign, whole, fraction = '0'] = match;
	const minorUnits = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
	if (!Number.isSafeInteger(minorUnits)) {
		throw new Error(`Betrag ${input} ist zu gross.`);
	}
	return sign === '-' ? -minorUnits : minorUnits;
}

/** Wie parseMoneyInput, aber ohne Ausnahme - fuer Formulare, die live validieren. */
export function tryParseMoneyInput(input: string): number | null {
	try {
		return parseMoneyInput(input);
	} catch {
		return null;
	}
}

function groupThousands(value: number): string {
	return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '’');
}
