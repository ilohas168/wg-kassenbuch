import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import type { Participant } from '$lib/money/index.js';

declare global {
	namespace App {
		interface Locals {
			/** Supabase im Namen des eingeloggten Nutzers. Alle Policies gelten. */
			supabase: SupabaseClient;
			/** Session mit serverseitig geprueftem Token. */
			safeGetSession: () => Promise<{ session: Session | null; user: User | null }>;
			user: User | null;
			/** Der Teilnehmer, der zu diesem Konto gehoert. Null, solange nicht verknuepft. */
			participant: Participant | null;
		}
		interface PageData {
			user?: { email: string | null } | null;
			participant?: Participant | null;
		}
	}
}

export {};
