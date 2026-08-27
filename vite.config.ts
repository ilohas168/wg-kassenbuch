import adapter from '@sveltejs/adapter-vercel';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// Explizit statt adapter-auto: das Ziel ist Vercel. Die Region folgt der
			// Datenbank - das Supabase-Projekt liegt in eu-west-1 (Irland), also laeuft
			// die Runtime in dub1. Jede Anfrage macht mehrere DB-Roundtrips; App und
			// Datenbank auf zwei Kontinente zu verteilen waere Latenz ohne Gegenwert.
			adapter: adapter({ runtime: 'nodejs22.x', regions: ['dub1'] })
		})
	],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
		environment: 'node'
	}
});
