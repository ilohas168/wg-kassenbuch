import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

/**
 * Supabase-Client fuer den Server.
 *
 * Bis die RLS-Policies in Phase 2 stehen, ist die Datenbank fuer den anon key dicht,
 * und jeder Zugriff laeuft hier durch - mit dem service_role key, der RLS umgeht.
 * Diese Datei liegt deshalb bewusst unter lib/server/: SvelteKit bricht den Build ab,
 * wenn sie je aus Client-Code importiert wird.
 */
let client: SupabaseClient | null = null;

export function supabaseServer(): SupabaseClient {
	if (client) return client;

	const url = publicEnv.PUBLIC_SUPABASE_URL;
	const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

	if (!url || !serviceRoleKey) {
		throw new Error(
			'PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY fehlen. .env aus .env.example anlegen und die Werte aus dem Supabase-Dashboard eintragen.'
		);
	}

	client = createClient(url, serviceRoleKey, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
	return client;
}
