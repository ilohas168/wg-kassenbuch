import { fail, redirect } from '@sveltejs/kit';
import { DraftError, parseReceiptDraft } from '$lib/server/draft.js';
import { createReceipt, listParticipants } from '$lib/server/repository.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	return { participants: await listParticipants() };
};

export const actions: Actions = {
	default: async ({ request }) => {
		const form = await request.formData();
		const raw = form.get('draft');

		try {
			const participants = await listParticipants();
			const draft = parseReceiptDraft(JSON.parse(String(raw ?? '')), participants);
			await createReceipt(draft);
		} catch (error) {
			return fail(400, {
				error:
					error instanceof DraftError || error instanceof Error
						? error.message
						: 'Der Beleg konnte nicht gespeichert werden.'
			});
		}

		// Ausserhalb des try: redirect() arbeitet in SvelteKit mit einer Exception.
		redirect(303, '/receipts');
	}
};
