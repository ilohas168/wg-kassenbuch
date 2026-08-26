import { computeReceiptShares } from './receipt.js';
import type { Participant, ParticipantId, Receipt, Settlement, Transfer } from './types.js';

/**
 * Salden in CHF-Rappen, aggregiert aus den Anteilen (harte Regel 2: nie gespeichert).
 *
 * Positiv  = hat mehr bezahlt als konsumiert, bekommt Geld.
 * Negativ  = schuldet der WG Geld.
 *
 * is_active wird bewusst ignoriert. Ein archivierter Gast faellt aus der Erfassungs-UI
 * heraus, nicht aus der Vergangenheit - seine alten Belege und Anteile bleiben unveraendert.
 * Die Summe aller Salden ist immer exakt 0.
 */
export function computeBalances(
	participants: Participant[],
	receipts: Receipt[],
	settlements: Settlement[]
): Map<ParticipantId, number> {
	const balances = new Map<ParticipantId, number>();
	const add = (id: ParticipantId, delta: number) => {
		balances.set(id, (balances.get(id) ?? 0) + delta);
	};

	for (const participant of participants) {
		balances.set(participant.id, 0);
	}

	for (const receipt of receipts) {
		add(receipt.paidBy, receipt.totalChfMinor);
		for (const [participantId, shareChfMinor] of computeReceiptShares(receipt)) {
			add(participantId, -shareChfMinor);
		}
	}

	// Eine Ausgleichszahlung verschiebt den Saldo, sie loescht keine Belege:
	// wer zahlt, verbessert seinen Saldo um den Betrag, wer empfaengt, verschlechtert ihn.
	for (const settlement of settlements) {
		add(settlement.fromParticipant, settlement.amountChfMinor);
		add(settlement.toParticipant, -settlement.amountChfMinor);
	}

	return balances;
}

/**
 * Minimale Anzahl Ueberweisungen, um alle Salden auszugleichen.
 *
 * Exakte Suche statt Greedy: Greedy ist bei drei bis vier Personen zwar meistens optimal,
 * aber nicht immer (z.B. wenn sich zwei Schulden exakt zu einem Guthaben ergaenzen).
 * Die Tiefensuche ist bei dieser Gruppengroesse ohnehin sofort fertig.
 */
export function simplifyDebts(balances: Map<ParticipantId, number>): Transfer[] {
	const open = [...balances.entries()]
		.filter(([, amount]) => amount !== 0)
		.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

	const ids = open.map(([id]) => id);
	const amounts = open.map(([, amount]) => amount);

	const sum = amounts.reduce((total, amount) => total + amount, 0);
	if (sum !== 0) {
		throw new Error(`Salden summieren sich auf ${sum} statt auf 0 - da fehlt ein Beleg oder ein Anteil.`);
	}

	let best: Transfer[] | null = null;

	const search = (start: number, current: Transfer[]) => {
		if (best !== null && current.length >= best.length) return;

		let index = start;
		while (index < amounts.length && amounts[index] === 0) index++;
		if (index === amounts.length) {
			best = [...current];
			return;
		}

		for (let other = index + 1; other < amounts.length; other++) {
			// Nur gegenlaeufige Salden koennen sich ausgleichen.
			if (amounts[index] > 0 === amounts[other] > 0 || amounts[other] === 0) continue;

			const moved = amounts[index];
			amounts[other] += moved;
			amounts[index] = 0;
			current.push(
				moved < 0
					? { fromParticipant: ids[index], toParticipant: ids[other], amountChfMinor: -moved }
					: { fromParticipant: ids[other], toParticipant: ids[index], amountChfMinor: moved }
			);

			search(index + 1, current);

			current.pop();
			amounts[index] = moved;
			amounts[other] -= moved;
		}
	};

	search(0, []);
	return best ?? [];
}
