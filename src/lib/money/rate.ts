/**
 * Wechselkurs-Arithmetik ohne Gleitkomma.
 *
 * Ein Kurs ist eine Dezimalzahl, Geld ist es nie. Damit die Umrechnung trotzdem exakt
 * und reproduzierbar bleibt, wird der Kurs als skalierter Integer gefuehrt
 * (Wert = scaled / 10^RATE_SCALE) und die Multiplikation in BigInt gerechnet.
 * RATE_SCALE entspricht der Spaltendefinition numeric(18, 10).
 */

export const RATE_SCALE = 10;

const DENOMINATOR = 10n ** BigInt(RATE_SCALE);

export interface Rate {
	/** Kurswert * 10^RATE_SCALE. */
	readonly scaled: bigint;
}

export const RATE_ONE: Rate = { scaled: DENOMINATOR };

const RATE_PATTERN = /^(\d+)(?:\.(\d+))?$/;

/**
 * Parst einen Kurs aus der Dezimaldarstellung, wie sie in der DB steht ("1", "0.9537").
 * Mehr als RATE_SCALE Nachkommastellen sind ein Fehler und keine stille Rundung -
 * ein abgeschnittener Kurs waere ein anderer Kurs als der gespeicherte.
 */
export function parseRate(value: string): Rate {
	const trimmed = value.trim();
	const match = RATE_PATTERN.exec(trimmed);
	if (!match) {
		throw new Error(`Ungueltiger Wechselkurs: ${JSON.stringify(value)}`);
	}
	const [, whole, fraction = ''] = match;
	if (fraction.length > RATE_SCALE) {
		throw new Error(
			`Wechselkurs ${trimmed} hat mehr als ${RATE_SCALE} Nachkommastellen und passt nicht in numeric(18, ${RATE_SCALE}).`
		);
	}
	const padded = fraction.padEnd(RATE_SCALE, '0');
	const scaled = BigInt(whole + padded);
	if (scaled <= 0n) {
		throw new Error(`Wechselkurs muss groesser als 0 sein, war ${trimmed}.`);
	}
	return { scaled };
}

/** Dezimaldarstellung fuer die DB. Ohne ueberfluessige Nullen am Ende. */
export function formatRate(rate: Rate): string {
	const whole = rate.scaled / DENOMINATOR;
	const fraction = (rate.scaled % DENOMINATOR).toString().padStart(RATE_SCALE, '0').replace(/0+$/, '');
	return fraction.length === 0 ? whole.toString() : `${whole}.${fraction}`;
}

export function isRateOne(rate: Rate): boolean {
	return rate.scaled === DENOMINATOR;
}

/**
 * Effektivkurs aus der tatsaechlichen Kartenbelastung: chargedChf / totalForeign.
 * Auf RATE_SCALE Stellen kaufmaennisch gerundet, damit er in die Spalte passt.
 */
export function effectiveRate(chargedChfMinor: number, foreignTotalMinor: number): Rate {
	if (!Number.isInteger(chargedChfMinor) || !Number.isInteger(foreignTotalMinor)) {
		throw new Error('Effektivkurs braucht Betraege in Minor Units als Integer.');
	}
	if (foreignTotalMinor <= 0 || chargedChfMinor <= 0) {
		throw new Error('Effektivkurs braucht positive Betraege.');
	}
	const numerator = BigInt(chargedChfMinor) * DENOMINATOR;
	const denominator = BigInt(foreignTotalMinor);
	const quotient = numerator / denominator;
	const remainder = numerator % denominator;
	const scaled = remainder * 2n >= denominator ? quotient + 1n : quotient;
	return { scaled };
}

/**
 * Wandelt einen Betrag in Minor Units mit dem Kurs um.
 * Gibt den gerundeten Wert (kaufmaennisch, von der Null weg) und den exakten Rest
 * zurueck. Der Rest ist die Grundlage fuer die Grösstrest-Verteilung in Schritt 4.
 */
export function convertMinor(amountMinor: number, rate: Rate): { rounded: number; residual: bigint } {
	if (!Number.isInteger(amountMinor)) {
		throw new Error(`Betrag muss ein Integer in Minor Units sein, war ${amountMinor}.`);
	}
	const exact = BigInt(amountMinor) * rate.scaled;
	const truncated = exact / DENOMINATOR;
	const remainder = exact % DENOMINATOR;
	const roundsAway = (remainder < 0n ? -remainder : remainder) * 2n >= DENOMINATOR;
	const rounded = roundsAway ? truncated + (exact < 0n ? -1n : 1n) : truncated;
	return { rounded: Number(rounded), residual: exact - rounded * DENOMINATOR };
}
