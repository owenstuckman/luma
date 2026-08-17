#!/usr/bin/env node
// Install the *other* platform's native binaries into node_modules.
//
// Why this exists: the repo lives on a Windows drive (C:\...) and is used from
// both PowerShell and WSL, which share one node_modules directory. Rollup,
// esbuild, and lightningcss each ship their native binary as a separate
// platform-specific optional package, and `npm install` only installs the one
// matching the machine doing the installing. So whichever environment installed
// last works, and the other fails with "Cannot find module
// @rollup/rollup-win32-x64-msvc" (or the linux equivalent).
//
// These packages are inert when they don't match the running platform — each
// library resolves its binary from process.platform at runtime — so having both
// present is safe. Run this after any `npm install` to restore the other side.
//
//   npm run deps:cross
//
// Deliberately NOT a postinstall hook: Vercel runs `npm install` on Linux at
// deploy time and has no use for Windows binaries.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// Read package.json straight off disk rather than via require(): rollup and
// lightningcss both declare an "exports" map that blocks the ./package.json
// subpath, so require('rollup/package.json') throws ERR_PACKAGE_PATH_NOT_EXPORTED.
function installedVersion(host) {
	const raw = readFileSync(join(repoRoot, 'node_modules', host, 'package.json'), 'utf8');
	return JSON.parse(raw).version;
}

// Host package -> the platform-specific binary package it loads at runtime.
const NATIVE_DEPS = [
	{
		host: 'rollup',
		pkg: { win32: '@rollup/rollup-win32-x64-msvc', linux: '@rollup/rollup-linux-x64-gnu' }
	},
	{ host: 'esbuild', pkg: { win32: '@esbuild/win32-x64', linux: '@esbuild/linux-x64' } },
	{
		host: 'lightningcss',
		pkg: { win32: 'lightningcss-win32-x64-msvc', linux: 'lightningcss-linux-x64-gnu' }
	}
];

const here = process.platform === 'win32' ? 'win32' : 'linux';
const other = here === 'win32' ? 'linux' : 'win32';

console.log(`Running on ${here}; installing ${other} binaries so both environments work.\n`);

const targets = [];
for (const { host, pkg } of NATIVE_DEPS) {
	let version;
	try {
		// Pin to the version of the host package that is actually installed —
		// a mismatched binary is worse than a missing one.
		version = installedVersion(host);
	} catch {
		console.log(`  skip ${host} — not installed`);
		continue;
	}
	targets.push(`${pkg[other]}@${version}`);
}

if (targets.length === 0) {
	console.log('Nothing to do.');
	process.exit(0);
}

for (const t of targets) console.log(`  + ${t}`);
console.log();

// --force is required: npm refuses foreign-platform packages with EBADPLATFORM.
// --no-save keeps package.json and package-lock.json untouched.
execFileSync(
	process.platform === 'win32' ? 'npm.cmd' : 'npm',
	['install', '--no-save', '--include=optional', '--force', ...targets],
	{ stdio: 'inherit' }
);

console.log(`\nDone. ${here} and ${other} can now both run npm run dev.`);
