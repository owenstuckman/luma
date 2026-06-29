import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	css: {
		preprocessorOptions: {
			scss: {
				// Bootstrap 5.3 hasn't migrated to the modern Sass module system yet.
				// Silence the deprecation noise originating from inside node_modules/bootstrap.
				silenceDeprecations: [
					'import',
					'global-builtin',
					'color-functions',
					'if-function',
					'legacy-js-api'
				],
				quietDeps: true
			}
		}
	}
});
