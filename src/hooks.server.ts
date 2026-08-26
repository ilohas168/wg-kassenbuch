import { createServerClient } from '@supabase/ssr';
import { error, json, redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { env } from '$env/dynamic/public';
import { participantForAuthUser } from '$lib/server/repository.js';

/** Routen, die ohne Login erreichbar sein muessen. */
const PUBLIC_PATHS = ['/login', '/auth'];

const isPublic = (pathname: string) =>
	PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

/**
 * Pro Anfrage ein Supabase-Client, der die Session aus den Cookies liest und im Namen
 * des Nutzers arbeitet. Damit sind die RLS-Policies die tatsaechliche Zugriffskontrolle
 * und nicht nur eine zweite Meinung.
 */
const supabase: Handle = async ({ event, resolve }) => {
	if (!env.PUBLIC_SUPABASE_URL || !env.PUBLIC_SUPABASE_ANON_KEY) {
		error(
			500,
			'PUBLIC_SUPABASE_URL und PUBLIC_SUPABASE_ANON_KEY fehlen. .env aus .env.example anlegen und die Werte aus dem Supabase-Dashboard eintragen.'
		);
	}

	event.locals.supabase = createServerClient(
		env.PUBLIC_SUPABASE_URL,
		env.PUBLIC_SUPABASE_ANON_KEY,
		{
			cookies: {
				getAll: () => event.cookies.getAll(),
				setAll: (cookiesToSet) => {
					for (const { name, value, options } of cookiesToSet) {
						event.cookies.set(name, value, { ...options, path: '/' });
					}
				}
			}
		}
	);

	// getSession() liest das Token nur aus dem Cookie. getUser() laesst es von Supabase
	// pruefen - serverseitig ist nur das zweite belastbar.
	event.locals.safeGetSession = async () => {
		const {
			data: { user },
			error
		} = await event.locals.supabase.auth.getUser();
		if (error || !user) return { session: null, user: null };

		const {
			data: { session }
		} = await event.locals.supabase.auth.getSession();
		return { session, user };
	};

	return resolve(event, {
		filterSerializedResponseHeaders: (name) =>
			name === 'content-range' || name === 'x-supabase-api-version'
	});
};

const authGuard: Handle = async ({ event, resolve }) => {
	const { user } = await event.locals.safeGetSession();
	event.locals.user = user;
	event.locals.participant = null;

	if (isPublic(event.url.pathname)) return resolve(event);

	// Die Endpoints unter /api werden per fetch gerufen. Eine Weiterleitung auf die
	// Login-Seite kaeme dort als HTML mit Status 200 an - der Aufrufer haelt das fuer
	// eine Antwort und stolpert erst beim Parsen. Also ehrlich 401.
	const isApi = event.url.pathname.startsWith('/api/');

	if (!user) {
		if (isApi) return json({ error: 'Nicht angemeldet.' }, { status: 401 });
		redirect(303, `/login?weiter=${encodeURIComponent(event.url.pathname)}`);
	}

	// Ein Konto ohne verknuepftes Mitglied kommt an keine Daten - die Policies geben
	// ihm nichts. Statt einer leeren App bekommt es den Verknuepfungsschritt.
	const participant = await participantForAuthUser(event.locals.supabase, user.id);
	if (!participant) {
		if (isApi) return json({ error: 'Dieses Konto gehört zu keinem Mitglied.' }, { status: 403 });
		redirect(303, '/auth/claim');
	}

	event.locals.participant = participant;
	return resolve(event);
};

export const handle = sequence(supabase, authGuard);
