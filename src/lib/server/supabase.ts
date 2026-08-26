import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

/**
 * Der service_role key umgeht RLS. Er gehoert deshalb an genau zwei Stellen und
 * sonst nirgendwohin:
 *
 *   1. die Verknuepfung Konto -> Mitglied beim ersten Login (der Nutzer ist da noch
 *      kein Mitglied und kaeme an seinen eigenen Datensatz gar nicht heran),
 *   2. das Anzeigen der noch freien Mitglieder auf genau diesem Schritt.
 *
 * Alles andere laeuft ueber locals.supabase, also im Namen des Nutzers und unter
 * seinen Policies. Diese Datei liegt unter lib/server/: SvelteKit bricht den Build ab,
 * wenn sie je in Client-Code importiert wird.
 */
let admin: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
	if (admin) return admin;

	const url = publicEnv.PUBLIC_SUPABASE_URL;
	const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

	if (!url || !serviceRoleKey) {
		throw new Error(
			'PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY fehlen. .env aus .env.example anlegen und die Werte aus dem Supabase-Dashboard eintragen.'
		);
	}

	admin = createClient(url, serviceRoleKey, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
	return admin;
}

/**
 * Wer sich einloggen darf. Die App haengt oeffentlich im Netz, und Supabase verschickt
 * Magic Links an jede Adresse, die danach fragt - ohne diese Liste koennte sich jeder
 * ein Konto holen und beim naechsten Schritt ein Mitglied fuer sich beanspruchen.
 */
export function allowedEmails(): string[] {
	return (env.ALLOWED_EMAILS ?? '')
		.split(',')
		.map((email) => email.trim().toLowerCase())
		.filter((email) => email.length > 0);
}

export function isAllowedEmail(email: string): boolean {
	return allowedEmails().includes(email.trim().toLowerCase());
}
