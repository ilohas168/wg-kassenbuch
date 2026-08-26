import { fail, redirect } from '@sveltejs/kit';
import { allowedEmails, isAllowedEmail } from '$lib/server/supabase.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { user } = await locals.safeGetSession();
	if (user) redirect(303, url.searchParams.get('weiter') ?? '/');

	// Ohne Allowlist kaeme jede Adresse an einen Magic Link. Lieber gar kein Login als das.
	return { configured: allowedEmails().length > 0, weiter: safeNext(url.searchParams.get('weiter')) };
};

export const actions: Actions = {
	default: async ({ request, locals, url }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim();

		if (!email) return fail(400, { error: 'E-Mail fehlt.' });
		if (!isAllowedEmail(email)) {
			// Bewusst dieselbe Formulierung wie bei einem Tippfehler: die Antwort soll nicht
			// verraten, welche Adressen in der WG hinterlegt sind.
			return fail(403, { error: 'Diese Adresse gehört nicht zur WG.', email });
		}

		const weiter = safeNext(url.searchParams.get('weiter'));
		const { error } = await locals.supabase.auth.signInWithOtp({
			email,
			options: {
				emailRedirectTo: `${url.origin}/auth/callback?weiter=${encodeURIComponent(weiter)}`
			}
		});

		if (error) return fail(500, { error: `Der Link konnte nicht verschickt werden: ${error.message}`, email });

		return { sent: true, email };
	}
};

/**
 * Nur eigene Pfade als Ziel zulassen. Ohne das waere aus dem Link im Postfach eine
 * offene Weiterleitung auf eine fremde Seite zu machen.
 */
function safeNext(value: string | null): string {
	if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
	return value;
}
