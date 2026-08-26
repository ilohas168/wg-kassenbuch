/// <reference types="@sveltejs/kit" />
import { build, files, version } from '$service-worker';

/**
 * Service Worker: macht die App installierbar und laedt die eigenen Dateien schnell.
 *
 * Bewusst zurueckhaltend: gecached werden nur die von SvelteKit gebauten Assets und die
 * statischen Dateien - beide tragen einen Hash bzw. aendern sich mit der Version. Seiten
 * und Daten gehen immer zuerst ins Netz. Ein Kassenbuch, das offline munter alte Salden
 * anzeigt, waere schlimmer als eines, das offline ehrlich sagt, dass es nicht kann.
 */

const worker = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `wg-kassenbuch-${version}`;
const PRECACHED = [...build, ...files];

worker.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(PRECACHED))
			.then(() => worker.skipWaiting())
	);
});

worker.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
			.then(() => worker.clients.claim())
	);
});

worker.addEventListener('fetch', (event) => {
	const request = event.request;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== location.origin) return;

	// Eigene Assets: aus dem Cache, das spart auf dem Handy jede Menge Wartezeit.
	if (PRECACHED.includes(url.pathname)) {
		event.respondWith(
			caches.open(CACHE).then(async (cache) => (await cache.match(url.pathname)) ?? fetch(request))
		);
		return;
	}

	// Alles andere: Netz. Faellt es aus, gibt es eine ehrliche Antwort statt alter Zahlen.
	event.respondWith(
		fetch(request).catch(
			() =>
				new Response('Offline - das Kassenbuch braucht eine Verbindung.', {
					status: 503,
					headers: { 'content-type': 'text/plain; charset=utf-8' }
				})
		)
	);
});
