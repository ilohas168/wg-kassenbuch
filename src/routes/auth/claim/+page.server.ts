import { fail, redirect } from '@sveltejs/kit';
import { claimMember, unlinkedMembers } from '$lib/server/auth.js';
import { isAllowedEmail } from '$lib/server/supabase.js';
import { participantForAuthUser } from '$lib/server/repository.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) redirect(303, '/login');

	// Wer schon verknuepft ist, hat hier nichts verloren.
	const existing = await participantForAuthUser(locals.supabase, user.id);
	if (existing) redirect(303, '/');

	return { email: user.email ?? null, members: await unlinkedMembers() };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const { user } = await locals.safeGetSession();
		if (!user) redirect(303, '/login');
		if (!user.email || !isAllowedEmail(user.email)) {
			return fail(403, { error: 'Diese Adresse gehört nicht zur WG.' });
		}

		const form = await request.formData();
		const participantId = String(form.get('participantId') ?? '');
		if (!participantId) return fail(400, { error: 'Kein Mitglied ausgewählt.' });

		const claimed = await claimMember(participantId, user.id);
		if (!claimed) {
			return fail(409, { error: 'Dieses Mitglied ist inzwischen schon verknüpft.' });
		}

		redirect(303, '/');
	}
};
