import { error, fail, redirect } from '@sveltejs/kit';
import { DraftError, parseReceiptDraft } from '$lib/server/draft.js';
import { deleteReceipt, getReceipt, listParticipants, updateReceipt } from '$lib/server/repository.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const [participants, receipt] = await Promise.all([listParticipants(locals.supabase), getReceipt(locals.supabase, params.id)]);
	if (!receipt) error(404, 'Diesen Beleg gibt es nicht.');

	return { participants, receipt };
};

export const actions: Actions = {
	default: async ({ request, params, locals }) => {
		const form = await request.formData();
		const raw = form.get('draft');

		try {
			const participants = await listParticipants(locals.supabase);
			const draft = parseReceiptDraft(JSON.parse(String(raw ?? '')), participants);
			await updateReceipt(locals.supabase, params.id, draft);
		} catch (caught) {
			return fail(400, {
				error:
					caught instanceof DraftError || caught instanceof Error
						? caught.message
						: 'Der Beleg konnte nicht gespeichert werden.'
			});
		}

		redirect(303, '/receipts');
	},

	delete: async ({ params, locals }) => {
		try {
			await deleteReceipt(locals.supabase, params.id);
		} catch (caught) {
			return fail(500, { error: caught instanceof Error ? caught.message : String(caught) });
		}
		redirect(303, '/receipts');
	}
};
