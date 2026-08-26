import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Ziel des Magic Links. Supabase haengt einen einmaligen Code an; hier wird er gegen
 * eine Session getauscht, die als Cookie am Server haengt.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	const code = url.searchParams.get('code');
	// Nur eigene Pfade: der Parameter kommt aus einer E-Mail und ist damit von aussen.
	const requested = url.searchParams.get('weiter');
	const weiter = requested && requested.startsWith('/') && !requested.startsWith('//') ? requested : '/';

	if (!code) redirect(303, '/login?fehler=kein-code');

	const { error } = await locals.supabase.auth.exchangeCodeForSession(code);
	if (error) redirect(303, '/login?fehler=abgelaufen');

	redirect(303, weiter);
};
