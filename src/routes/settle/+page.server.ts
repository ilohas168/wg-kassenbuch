import { fail } from '@sveltejs/kit';
import { computeBalances, simplifyDebts, type Transfer } from '$lib/money/index.js';
import {
	createSettlement,
	listParticipants,
	listReceipts,
	listSettlementHistory,
	listSettlements
} from '$lib/server/repository.js';
import type { Actions, PageServerLoad } from './$types';

/** Der aktuelle Ausgleichsvorschlag - einmal fuer die Anzeige, einmal zum Nachpruefen. */
async function currentTransfers(supabase: App.Locals['supabase']) {
	const [participants, receipts, settlements] = await Promise.all([
		listParticipants(supabase),
		listReceipts(supabase),
		listSettlements(supabase)
	]);
	const balances = computeBalances(participants, receipts, settlements);
	return { participants, balances, transfers: simplifyDebts(balances) };
}

export const load: PageServerLoad = async ({ locals }) => {
	try {
		const { participants, balances, transfers } = await currentTransfers(locals.supabase);
		const nameOf = (id: string) =>
			participants.find((participant) => participant.id === id)?.displayName ?? 'Unbekannt';

		const history = await listSettlementHistory(locals.supabase);

		return {
			error: null,
			openTotalMinor: [...balances.values()].filter((balance) => balance > 0).reduce((sum, balance) => sum + balance, 0),
			transfers: transfers.map((transfer) => ({
				fromParticipant: transfer.fromParticipant,
				toParticipant: transfer.toParticipant,
				amountChfMinor: transfer.amountChfMinor,
				fromName: nameOf(transfer.fromParticipant),
				toName: nameOf(transfer.toParticipant)
			})),
			history: history.map((entry) => ({
				...entry,
				fromName: nameOf(entry.fromParticipant),
				toName: nameOf(entry.toParticipant)
			}))
		};
	} catch (error) {
		return {
			error: error instanceof Error ? error.message : String(error),
			openTotalMinor: 0,
			transfers: [],
			history: []
		};
	}
};

/**
 * Beim Buchen wird der Vorschlag neu gerechnet und die Zahlung darin gesucht. Was das
 * Formular schickt, ist ein Verweis auf einen Vorschlag - kein Auftrag, irgendetwas zu
 * buchen. Sonst koennte ein veraltetes Formular eine Zahlung buchen, die es nicht mehr gibt.
 */
function findTransfer(transfers: Transfer[], from: string, to: string, amount: number) {
	return transfers.find(
		(transfer) =>
			transfer.fromParticipant === from &&
			transfer.toParticipant === to &&
			transfer.amountChfMinor === amount
	);
}

export const actions: Actions = {
	pay: async ({ request, locals }) => {
		const form = await request.formData();
		const from = String(form.get('from') ?? '');
		const to = String(form.get('to') ?? '');
		const amount = Number(form.get('amount') ?? NaN);

		try {
			const { transfers } = await currentTransfers(locals.supabase);
			const transfer = findTransfer(transfers, from, to, amount);
			if (!transfer) {
				return fail(409, {
					error: 'Diese Zahlung steht nicht mehr im Vorschlag. Die Seite zeigt jetzt den aktuellen Stand.'
				});
			}
			await createSettlement(locals.supabase, transfer);
		} catch (error) {
			return fail(500, { error: error instanceof Error ? error.message : String(error) });
		}

		return { paid: true };
	},

	payAll: async ({ locals }) => {
		try {
			const { transfers } = await currentTransfers(locals.supabase);
			if (transfers.length === 0) return { paid: true };

			// Nacheinander, nicht parallel: jede Buchung veraendert die Salden, und der
			// Vorschlag ist als Ganzes gerechnet.
			for (const transfer of transfers) {
				await createSettlement(locals.supabase, transfer);
			}
		} catch (error) {
			return fail(500, { error: error instanceof Error ? error.message : String(error) });
		}

		return { paid: true };
	}
};
