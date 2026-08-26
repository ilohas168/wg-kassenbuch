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

			// Explizit statt adapter-auto: das Ziel ist Vercel, und die Runtime soll in
			// Europa laufen - die Daten liegen in Frankfurt, jeder Hop ueber die USA waere
			// eine Latenz ohne Gegenwert.
			adapter: adapter({ runtime: 'nodejs22.x', regions: ['fra1'] })
		})
	],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
		environment: 'node'
	}
});
