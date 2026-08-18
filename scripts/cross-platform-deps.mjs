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
//
// IMPORTANT: a dependency can appear more than once in the tree at different
// versions — this repo has esbuild three times (top-level 0.27.x, plus nested
// copies under vite and @sveltejs/adapter-vercel at 0.25.x). Each copy loads a
// binary of its *own* version and refuses a mismatch:
//
//   Cannot start service: Host version "0.25.12" does not match binary version "0.27.7"
//
// So we walk the whole tree and install one correctly-versioned binary next to
// every copy, rather than assuming a single top-level version.

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

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

// Read package.json straight off disk rather than via require(): rollup and
// lightningcss both declare an "exports" map that blocks the ./package.json
// subpath, so require('rollup/package.json') throws ERR_PACKAGE_PATH_NOT_EXPORTED.
function readVersion(pkgJsonPath) {
	return JSON.parse(readFileSync(pkgJsonPath, 'utf8')).version;
}

/**
 * Find every installed copy of `hostName`, at any depth.
 *
 * Returns `{ version, prefix }` per copy, where `prefix` is the directory to
 * hand `npm install --prefix` so the binary lands in the same `node_modules`
 * folder as that copy of the host.
 */
function findHostCopies(hostName) {
	const found = [];

	function walk(nodeModulesDir) {
		if (!existsSync(nodeModulesDir)) return;

		// The host itself, directly inside this node_modules.
		const hostDir = join(nodeModulesDir, hostName);
		const hostPkg = join(hostDir, 'package.json');
		if (existsSync(hostPkg)) {
			found.push({
				version: readVersion(hostPkg),
				// `npm --prefix X` installs into X/node_modules, so point at the
				// directory that *contains* this node_modules.
				prefix: dirname(nodeModulesDir)
			});
		}

		// Recurse into nested node_modules of every package here (including the
		// members of scoped @org/ directories).
		for (const entry of readdirSync(nodeModulesDir, { withFileTypes: true })) {
			if (!entry.isDirectory() || entry.name === '.bin') continue;
			const entryPath = join(nodeModulesDir, entry.name);

			if (entry.name.startsWith('@')) {
				for (const scoped of readdirSync(entryPath, { withFileTypes: true })) {
					if (!scoped.isDirectory()) continue;
					walk(join(entryPath, scoped.name, 'node_modules'));
				}
				continue;
			}
			walk(join(entryPath, 'node_modules'));
		}
	}

	walk(join(repoRoot, 'node_modules'));
	return found;
}

console.log(`Running on ${here}; installing ${other} binaries so both environments work.\n`);

// Group the work by install location: one npm call per prefix.
const byPrefix = new Map();

for (const { host, pkg } of NATIVE_DEPS) {
	const copies = findHostCopies(host);
	if (copies.length === 0) {
		console.log(`  skip ${host} — not installed`);
		continue;
	}
	for (const { version, prefix } of copies) {
		const spec = `${pkg[other]}@${version}`;
		if (!byPrefix.has(prefix)) byPrefix.set(prefix, new Set());
		byPrefix.get(prefix).add(spec);

		const where = relative(repoRoot, prefix) || '.';
		console.log(`  + ${spec}  (for ${host}@${version} in ${where})`);
	}
}

if (byPrefix.size === 0) {
	console.log('Nothing to do.');
	process.exit(0);
}
console.log();

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const rootPrefix = repoRoot;

// Top level is a normal install: npm treats the repo as the project root and
// resolves everything as usual.
const rootSpecs = byPrefix.get(rootPrefix);
if (rootSpecs?.size) {
	// --force is required: npm refuses foreign-platform packages with EBADPLATFORM.
	// --no-save keeps package.json and package-lock.json untouched.
	execFileSync(npm, ['install', '--no-save', '--include=optional', '--force', ...rootSpecs], {
		stdio: 'inherit',
		cwd: repoRoot
	});
	byPrefix.delete(rootPrefix);
}

// Nested copies can't go through `npm install --prefix <dir>` — npm would treat
// that dependency's own package.json as a project manifest, and vite's declares
// `link:./src/types`, which only resolves inside vite's own repo
// (EUNSUPPORTEDPROTOCOL). These platform packages are just a prebuilt binary
// plus a package.json with no install scripts, so fetching the tarball and
// unpacking it into place is both sufficient and faster.
if (byPrefix.size > 0) {
	const tmp = mkdtempSync(join(tmpdir(), 'luma-crossdeps-'));

	try {
		for (const [prefix, specs] of byPrefix) {
			for (const spec of specs) {
				// `npm pack` prints the tarball filename it produced.
				const out = execFileSync(npm, ['pack', spec, '--pack-destination', tmp, '--silent'], {
					cwd: repoRoot,
					encoding: 'utf8'
				});
				const tarball = join(tmp, out.trim().split(/\r?\n/).pop().trim());

				// Tarball contents live under a top-level `package/` directory;
				// --strip-components=1 unwraps it straight into the destination.
				const name = spec.slice(0, spec.lastIndexOf('@'));
				const dest = join(prefix, 'node_modules', name);
				rmSync(dest, { recursive: true, force: true });
				mkdirSync(dest, { recursive: true });
				execFileSync('tar', ['-xzf', tarball, '-C', dest, '--strip-components=1'], {
					stdio: 'inherit'
				});

				console.log(`  unpacked ${spec} -> ${relative(repoRoot, dest)}`);
			}
		}
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
}

console.log(`\nDone. ${here} and ${other} can now both run npm run dev.`);
