import { computeBalances, simplifyDebts, type Participant } from '$lib/money/index.js';
import { listParticipants, listReceipts, listSettlements } from '$lib/server/repository.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	try {
		const [participants, receipts, settlements] = await Promise.all([
			listParticipants(),
			listReceipts(),
			listSettlements()
		]);

		const balances = computeBalances(participants, receipts, settlements);
		const nameOf = (id: string) =>
			participants.find((participant) => participant.id === id)?.displayName ?? 'Unbekannt';

		return {
			error: null,
			receiptCount: receipts.length,
			balances: participants
				// Archivierte Teilnehmer ohne offenen Saldo muessen hier nicht mehr stehen.
				.filter((participant: Participant) => participant.isActive || balances.get(participant.id) !== 0)
				.map((participant) => ({
					id: participant.id,
					displayName: participant.displayName,
					kind: participant.kind,
					isActive: participant.isActive,
					balanceMinor: balances.get(participant.id) ?? 0
				}))
				.sort((a, b) => b.balanceMinor - a.balanceMinor),
			transfers: simplifyDebts(balances).map((transfer) => ({
				from: nameOf(transfer.fromParticipant),
				to: nameOf(transfer.toParticipant),
				amountChfMinor: transfer.amountChfMinor
			}))
		};
	} catch (error) {
		return {
			error: error instanceof Error ? error.message : String(error),
			receiptCount: 0,
			balances: [],
			transfers: []
		};
	}
};
