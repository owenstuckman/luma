import { mdsvex } from 'mdsvex';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const useNodeAdapter = process.env.ADAPTER === 'node';

const adapter = useNodeAdapter
	? (await import('@sveltejs/adapter-node')).default()
	: (await import('@sveltejs/adapter-vercel')).default({ runtime: 'nodejs22.x' });

const config = {
	preprocess: [vitePreprocess(), mdsvex()],
	kit: {
		adapter,
		paths: {
			base: ''
		}
	},
	extensions: ['.svelte', '.svx']
};

export default config;
