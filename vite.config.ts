import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { readdirSync } from 'node:fs';

// Migration names known to this build, for the admin Setup tab's schema check.
const migrations = readdirSync('supabase/migrations')
	.filter((f) => f.endsWith('.sql'))
	.map((f) => f.replace(/\.sql$/, ''));

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	define: {
		__LUMA_MIGRATIONS__: JSON.stringify(migrations)
	},
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
