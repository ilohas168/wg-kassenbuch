import { fail } from '@sveltejs/kit';
import { computeReceiptShares } from '$lib/money/index.js';
import { deleteReceipt, listParticipants, listReceipts } from '$lib/server/repository.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	try {
		const [participants, receipts] = await Promise.all([listParticipants(locals.supabase), listReceipts(locals.supabase)]);
		const nameOf = (id: string) =>
			participants.find((participant) => participant.id === id)?.displayName ?? 'Unbekannt';

		return {
			error: null,
			receipts: receipts.map((receipt) => {
				let shares: { name: string; amountChfMinor: number }[] = [];
				let warning: string | null = null;
				try {
					shares = [...computeReceiptShares(receipt).entries()]
						.map(([participantId, amountChfMinor]) => ({
							name: nameOf(participantId),
							amountChfMinor
						}))
						.sort((a, b) => b.amountChfMinor - a.amountChfMinor);
				} catch (error) {
					// Ein einzelner kaputter Beleg darf nicht den ganzen Verlauf blockieren.
					warning = error instanceof Error ? error.message : String(error);
				}

				return {
					id: receipt.id,
					merchant: receipt.merchant,
					purchasedAt: receipt.purchasedAt,
					currency: receipt.currency,
					totalMinor: receipt.totalMinor,
					totalChfMinor: receipt.totalChfMinor,
					paidByName: nameOf(receipt.paidBy),
					photoPath: receipt.photoPath,
					lineItems: receipt.lineItems.map((item) => ({
						id: item.id,
						label: item.label,
						amountMinor: item.amountMinor,
						names: item.shares.map((share) => nameOf(share.participantId))
					})),
					shares,
					warning
				};
			})
		};
	} catch (error) {
		return { error: error instanceof Error ? error.message : String(error), receipts: [] };
	}
};

export const actions: Actions = {
	delete: async ({ request, locals }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { error: 'Kein Beleg angegeben.' });

		try {
			await deleteReceipt(locals.supabase, id);
		} catch (error) {
			return fail(500, { error: error instanceof Error ? error.message : String(error) });
		}
		return { deleted: true };
	}
};
