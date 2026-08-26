import { convertMinor, isRateOne, parseRate, type Rate } from './rate.js';
import { splitLargestRemainder } from './split.js';
import type { LineItem, ParticipantId, Receipt } from './types.js';

/**
 * Aufteilungs- und Rundungsalgorithmus aus SPEC.md, Schritt fuer Schritt:
 *
 *   1. Jede Position per Grösstrest auf ihre Teilnehmer aufteilen (Belegwaehrung).
 *   2. Pro Teilnehmer ueber alle Positionen summieren (Belegwaehrung).
 *   3. Jeden Teilnehmerbetrag mit dem eingefrorenen Kurs in CHF umrechnen und runden.
 *   4. Die Differenz zur eingefrorenen total_chf_minor erneut per Grösstrest verteilen.
 *
 * Danach gilt: sum(Anteile) === receipt.totalChfMinor, exakt.
 *
 * Die Teilnehmer werden intern nach id sortiert. Damit liefert derselbe Beleg immer
 * dasselbe Ergebnis, egal in welcher Reihenfolge die Zeilen aus der DB kommen.
 */
export function computeReceiptShares(receipt: Receipt): Map<ParticipantId, number> {
	const rate = parseRate(receipt.fxRateToChf);
	const inCurrency = sumByParticipant(receipt.lineItems);
	return convertToChf(inCurrency, rate, receipt.totalChfMinor);
}

/** Schritte 1 und 2: Anteile pro Teilnehmer in Belegwaehrung. */
export function sumByParticipant(lineItems: LineItem[]): Map<ParticipantId, number> {
	const totals = new Map<ParticipantId, number>();
	for (const item of lineItems) {
		if (item.shares.length === 0) {
			throw new Error(`Position "${item.label}" ist keinem Teilnehmer zugeordnet.`);
		}
		const shares = [...item.shares].sort((a, b) =>
			a.participantId < b.participantId ? -1 : a.participantId > b.participantId ? 1 : 0
		);
		const seen = new Set<ParticipantId>();
		for (const share of shares) {
			if (seen.has(share.participantId)) {
				throw new Error(`Position "${item.label}" hat denselben Teilnehmer doppelt.`);
			}
			seen.add(share.participantId);
		}
		const amounts = splitLargestRemainder(
			item.amountMinor,
			shares.map((share) => share.weight)
		);
		shares.forEach((share, index) => {
			totals.set(share.participantId, (totals.get(share.participantId) ?? 0) + amounts[index]);
		});
	}
	return totals;
}

/** Schritte 3 und 4: Umrechnung in CHF, Restverteilung auf die eingefrorene Belegsumme. */
export function convertToChf(
	amountsInCurrency: Map<ParticipantId, number>,
	rate: Rate,
	totalChfMinor: number
): Map<ParticipantId, number> {
	const ids = [...amountsInCurrency.keys()].sort();
	const converted = ids.map((id) => {
		const amountMinor = amountsInCurrency.get(id) as number;
		const { rounded, residual } = convertMinor(amountMinor, rate);
		return { id, amountMinor, rounded, residual };
	});

	let sum = 0;
	for (const entry of converted) sum += entry.rounded;
	let difference = totalChfMinor - sum;

	if (difference !== 0) {
		// Nur wer ueberhaupt etwas mittraegt, kann Restrappen abbekommen.
		const candidates = converted.filter((entry) => entry.amountMinor !== 0);
		const pool = candidates.length > 0 ? candidates : converted;

		if (Math.abs(difference) > pool.length) {
			// Das ist keine Rundungsdifferenz mehr. Praktisch heisst das:
			// total_minor und die Summe der Positionen widersprechen sich.
			throw new Error(
				`Restdifferenz von ${difference} Rappen ist groesser als die Zahl der Teilnehmer (${pool.length}). ` +
					`Stimmt total_minor mit der Summe der Positionen ueberein?`
			);
		}

		const direction = difference > 0 ? 1 : -1;
		const order = [...pool].sort((a, b) => {
			// Bei positiver Differenz zuerst an die am staerksten abgerundeten Betraege,
			// bei negativer zuerst weg von den am staerksten aufgerundeten.
			const byResidual = direction > 0 ? compareBigInt(b.residual, a.residual) : compareBigInt(a.residual, b.residual);
			if (byResidual !== 0) return byResidual;
			return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
		});

		for (let i = 0; i < order.length && difference !== 0; i++) {
			order[i].rounded += direction;
			difference -= direction;
		}
	}

	const result = new Map<ParticipantId, number>();
	for (const entry of converted) result.set(entry.id, entry.rounded);
	return result;
}

/** Summe aller Positionen in Belegwaehrung. Muss beim Erfassen dem Beleg-Total entsprechen. */
export function sumLineItems(lineItems: LineItem[]): number {
	let sum = 0;
	for (const item of lineItems) {
		if (!Number.isInteger(item.amountMinor)) {
			throw new Error(`Position "${item.label}" hat keinen Integer-Betrag.`);
		}
		sum += item.amountMinor;
	}
	return sum;
}

/**
 * Prueft vor dem Speichern die Invarianten, auf die sich alles Weitere verlaesst.
 * Wirft mit einer Meldung, die man dem Nutzer zeigen kann.
 */
export function assertReceiptIsConsistent(receipt: Receipt): void {
	if (receipt.lineItems.length === 0) {
		throw new Error('Ein Beleg braucht mindestens eine Position.');
	}

	const positionsTotal = sumLineItems(receipt.lineItems);
	if (positionsTotal !== receipt.totalMinor) {
		throw new Error(
			`Die Positionen ergeben ${positionsTotal}, das Beleg-Total ist ${receipt.totalMinor} (Minor Units).`
		);
	}

	const rate = parseRate(receipt.fxRateToChf);
	if (receipt.currency === 'CHF') {
		if (!isRateOne(rate)) {
			throw new Error('Ein CHF-Beleg hat immer den Kurs 1.');
		}
		if (receipt.totalChfMinor !== receipt.totalMinor) {
			throw new Error('Bei einem CHF-Beleg muessen total_minor und total_chf_minor uebereinstimmen.');
		}
	} else {
		// Beim Effektivkurs ist total_chf_minor die Kartenbelastung, nicht das Produkt aus
		// Total und Kurs - ein Rappen Abweichung ist deshalb normal, mehr nicht.
		const expected = freezeTotalChf(receipt.totalMinor, rate);
		if (Math.abs(expected - receipt.totalChfMinor) > 1) {
			throw new Error(
				`Kurs und CHF-Total passen nicht zusammen: erwartet waeren rund ${expected}, gespeichert ist ${receipt.totalChfMinor}.`
			);
		}
	}

	// Wirft bei Positionen ohne Teilnehmer und bei einer Restdifferenz, die keine
	// Rundungsdifferenz mehr sein kann.
	computeReceiptShares(receipt);
}

/** Beim Erfassen: das Beleg-Total in CHF einfrieren. */
export function freezeTotalChf(totalMinor: number, rate: Rate): number {
	return convertMinor(totalMinor, rate).rounded;
}

function compareBigInt(a: bigint, b: bigint): number {
	return a < b ? -1 : a > b ? 1 : 0;
}
