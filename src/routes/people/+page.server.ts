import { fail } from '@sveltejs/kit';
import { computeBalances } from '$lib/money/index.js';
import {
	createGuest,
	listParticipants,
	listReceipts,
	listSettlements,
	settleAndArchive
} from '$lib/server/repository.js';
import type { Actions, PageServerLoad } from './$types';

async function balancesNow(supabase: App.Locals['supabase']) {
	const [participants, receipts, settlements] = await Promise.all([
		listParticipants(supabase),
		listReceipts(supabase),
		listSettlements(supabase)
	]);
	return { participants, balances: computeBalances(participants, receipts, settlements) };
}

export const load: PageServerLoad = async ({ locals }) => {
	try {
		const { participants, balances } = await balancesNow(locals.supabase);

		const withBalance = participants.map((participant) => ({
			...participant,
			balanceMinor: balances.get(participant.id) ?? 0
		}));

		return {
			error: null,
			members: withBalance.filter((participant) => participant.kind === 'member'),
			guests: withBalance.filter((participant) => participant.kind === 'guest'),
			// Wer den Gast auszahlt oder von ihm kassiert: die aktiven Mitglieder.
			counterparts: withBalance.filter(
				(participant) => participant.kind === 'member' && participant.isActive
			)
		};
	} catch (error) {
		return {
			error: error instanceof Error ? error.message : String(error),
			members: [],
			guests: [],
			counterparts: []
		};
	}
};

export const actions: Actions = {
	addGuest: async ({ request, locals }) => {
		const form = await request.formData();
		const displayName = String(form.get('displayName') ?? '').trim();

		if (displayName.length === 0) return fail(400, { error: 'Der Name fehlt.' });
		if (displayName.length > 60) return fail(400, { error: 'Der Name ist zu lang.' });

		try {
			await createGuest(locals.supabase, displayName);
		} catch (error) {
			return fail(500, { error: error instanceof Error ? error.message : String(error) });
		}
		return { added: displayName };
	},

	settle: async ({ request, locals }) => {
		const form = await request.formData();
		const participantId = String(form.get('participantId') ?? '');
		const counterpartId = String(form.get('counterpartId') ?? '');

		try {
			const { participants, balances } = await balancesNow(locals.supabase);
			const guest = participants.find((participant) => participant.id === participantId);

			if (!guest || guest.kind !== 'guest') return fail(400, { error: 'Das ist kein Gast.' });
			if (!guest.isActive) return fail(409, { error: 'Dieser Gast ist bereits archiviert.' });

			// Der Saldo kommt aus der Datenbank, nicht aus dem Formular: das Formular kann
			// alt sein, und eine Ausgleichszahlung ueber den falschen Betrag faellt sonst
			// niemandem auf.
			const balanceMinor = balances.get(participantId) ?? 0;
			if (balanceMinor !== 0 && !counterpartId) {
				return fail(400, { error: 'Bitte angeben, mit wem abgerechnet wird.' });
			}

			await settleAndArchive(
				locals.supabase,
				participantId,
				balanceMinor === 0 ? null : counterpartId,
				balanceMinor,
				`Abrechnung ${guest.displayName}`
			);
		} catch (error) {
			return fail(500, { error: error instanceof Error ? error.message : String(error) });
		}

		return { settled: true };
	}
};
