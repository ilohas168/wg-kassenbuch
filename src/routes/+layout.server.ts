import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		user: locals.user ? { email: locals.user.email ?? null } : null,
		participant: locals.participant
	};
};
