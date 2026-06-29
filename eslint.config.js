import prettier from 'eslint-config-prettier';
import js from '@eslint/js';
import { includeIgnoreFile } from '@eslint/compat';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import { fileURLToPath } from 'node:url';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url));

export default ts.config(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		},
		rules: {
			'no-undef': 'off',
			// Pre-existing patterns from earlier eslint-plugin-svelte; warn-only for V1 to keep lint green.
			'svelte/require-each-key': 'warn',
			'svelte/no-navigation-without-resolve': 'warn',
			'svelte/prefer-svelte-reactivity': 'warn',
			'svelte/prefer-writable-derived': 'warn',
			'svelte/infinite-reactive-loop': 'warn',
			'svelte/valid-prop-names-in-kit-pages': 'warn',
			'svelte/no-immutable-reactive-statements': 'warn',
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/no-unused-expressions': 'warn'
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser,
				svelteConfig
			}
		},
		// svelte-check handles unused-vars in Svelte files; typescript-eslint's
		// no-unused-vars crashes on svelte-eslint-parser ASTs with projectService on.
		rules: {
			'@typescript-eslint/no-unused-vars': 'off',
			'no-unused-vars': 'off'
		}
	}
);
