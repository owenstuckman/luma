import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { loadEnv } from 'vite';

// Hosting target: `vercel` (default) or `node` (self-hosted / Docker). A real
// environment variable wins, so the Dockerfile's `ENV ADAPTER=node` and CI keep
// working; otherwise the value `npm run setup` wrote to `.env` is used.
const ADAPTER = process.env.ADAPTER ?? loadEnv('', process.cwd(), '').ADAPTER ?? 'vercel';

const adapter =
	ADAPTER === 'node'
		? (await import('@sveltejs/adapter-node')).default()
		: (await import('@sveltejs/adapter-vercel')).default({ runtime: 'nodejs22.x' });

const config = {
	preprocess: [vitePreprocess()],
	kit: {
		adapter,
		paths: {
			base: ''
		}
	}
};

export default config;
