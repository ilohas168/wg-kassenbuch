/**
 * Grösstrest-Methode (largest remainder) auf Integer-Minor-Units.
 *
 * Die Summe der Anteile ist exakt der Ausgangsbetrag - das ist harte Regel 7 und
 * gilt auch fuer negative Betraege (Rabatt, Pfandrueckgabe).
 *
 * Negative Betraege werden ueber den Absolutwert aufgeteilt und danach negiert.
 * Damit ist die Aufteilung von -1000 exakt das Spiegelbild von +1000: wer beim
 * Einkauf den zusaetzlichen Rappen traegt, bekommt ihn beim Rabatt auch wieder
 * gutgeschrieben. Wuerde man stattdessen direkt abrunden, driftete beides um
 * einen Rappen auseinander.
 *
 * Gleichstand bei den Resten wird nach Eingabereihenfolge aufgeloest. Aufrufer,
 * die Reproduzierbarkeit brauchen, sortieren die Teilnehmer vorher stabil.
 */
export function splitLargestRemainder(amountMinor: number, weights: number[]): number[] {
	if (!Number.isInteger(amountMinor)) {
		throw new Error(`Betrag muss ein Integer in Minor Units sein, war ${amountMinor}.`);
	}
	if (weights.length === 0) {
		throw new Error('Aufteilung ohne Teilnehmer ist nicht moeglich.');
	}
	let totalWeight = 0;
	for (const weight of weights) {
		if (!Number.isInteger(weight) || weight <= 0) {
			throw new Error(`Gewicht muss ein positiver Integer sein, war ${weight}.`);
		}
		totalWeight += weight;
	}

	const sign = amountMinor < 0 ? -1 : 1;
	const absolute = Math.abs(amountMinor);

	// Ganzzahliger Anteil und exakter Rest, beides ohne Gleitkomma:
	// remainder = (absolute * weight) mod totalWeight.
	const shares = new Array<number>(weights.length);
	const remainders = new Array<number>(weights.length);
	let distributed = 0;
	for (let i = 0; i < weights.length; i++) {
		const product = absolute * weights[i];
		shares[i] = Math.floor(product / totalWeight);
		remainders[i] = product - shares[i] * totalWeight;
		distributed += shares[i];
	}

	// Die verbleibenden Einheiten gehen an die groessten Reste, bei Gleichstand
	// an den frueheren Index.
	let rest = absolute - distributed;
	const order = remainders
		.map((remainder, index) => ({ remainder, index }))
		.sort((a, b) => b.remainder - a.remainder || a.index - b.index);
	for (let i = 0; i < order.length && rest > 0; i++, rest--) {
		shares[order[i].index] += 1;
	}

	// share === 0 gesondert, sonst entstuende -0: gleich gross wie 0, aber nicht identisch,
	// und in JSON und Tests ein Stolperstein.
	return shares.map((share) => (share === 0 ? 0 : share * sign));
}
