#!/usr/bin/env node

/**
 * LUMA setup — first-run (and re-runnable) instance configuration.
 *
 *   npm run setup                 interactive
 *   npm run setup -- --no-start   don't offer to start the dev server at the end
 *
 * The terminal covers what has to exist before the app can boot: which database
 * and auth backend, the keys, the hosting target, the schema, and the first
 * platform admin. It writes `.env` (instance settings) and `.env.local` (keys),
 * both untracked, then starts the app on the admin Setup tab, where everything
 * else (platform branding, orgs, teams, rules, forms, members) is configured.
 *
 * Re-running is safe: every prompt defaults to the current value, and keys this
 * script doesn't know about are left untouched in both files.
 *
 * Plain Node, no dependencies — it has to run before `npm install` has worked.
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, copyFileSync } from 'node:fs';
import { spawnSync, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = join(ROOT, '.env');
const ENV_LOCAL_PATH = join(ROOT, '.env.local');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const IS_WINDOWS = process.platform === 'win32';
const ARGS = new Set(process.argv.slice(2));

// ─── terminal helpers ─────────────────────────────────────────────────────────

const color = (code) => (s) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = color('1');
const dim = color('2');
const green = color('32');
const yellow = color('33');
const red = color('31');
const cyan = color('36');

const INTERACTIVE = Boolean(process.stdin.isTTY);
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: INTERACTIVE });
let muted = false;
// Hide secret input: in a terminal, readline echoes keystrokes through _writeToOutput.
const writeOut = rl._writeToOutput?.bind(rl);
if (writeOut) {
	rl._writeToOutput = (s) => {
		if (!muted) return writeOut(s);
		if (s.includes('\n') || s.includes('\r')) writeOut('\n');
	};
}

// Buffer lines rather than using rl.question(), so answers piped in ahead of the
// prompts (`printf '1\n...' | npm run setup`) are queued instead of dropped.
const lineQueue = [];
const waiters = [];
let inputClosed = false;
rl.on('line', (line) => (waiters.length ? waiters.shift()(line) : lineQueue.push(line)));
rl.on('close', () => {
	inputClosed = true;
	while (waiters.length) waiters.shift()('');
});

function question(q) {
	process.stdout.write(q);
	const echo = (line) => {
		if (!INTERACTIVE) process.stdout.write(muted ? '\n' : `${line}\n`);
		return line;
	};
	if (lineQueue.length) return Promise.resolve(echo(lineQueue.shift()));
	if (inputClosed) {
		process.stdout.write('\n');
		return Promise.resolve('');
	}
	return new Promise((resolve) => waiters.push((line) => resolve(echo(line))));
}

/** Guard for re-ask loops: with stdin exhausted they would spin forever. */
function assertInput() {
	if (inputClosed && !lineQueue.length) throw new Error('input ended before setup finished');
}

/** Prompt with a default shown in brackets; Enter keeps it. */
async function ask(label, def = '') {
	const shown = def ? dim(` [${def}]`) : '';
	const answer = (await question(`  ${label}${shown}: `)).trim();
	return answer || def;
}

/** Secret prompt: input hidden, existing value kept on Enter and never printed. */
async function askSecret(label, current = '') {
	const shown = current ? dim(' [keep current]') : dim(' [blank to skip]');
	process.stdout.write(`  ${label}${shown}: `);
	muted = true;
	const answer = (await question('')).trim();
	muted = false;
	return answer || current;
}

async function confirm(label, def = true) {
	const answer = (await question(`  ${label} ${dim(def ? '(Y/n)' : '(y/N)')}: `))
		.trim()
		.toLowerCase();
	if (!answer) return def;
	return answer === 'y' || answer === 'yes';
}

/** Numbered menu. `options`: [{ value, label, hint? }]. Returns the value. */
async function choose(label, options, defValue) {
	console.log(`  ${label}`);
	options.forEach((o, i) => {
		const isDefault = o.value === defValue;
		console.log(
			`    ${cyan(String(i + 1))}) ${o.label}${isDefault ? dim(' (default)') : ''}${o.hint ? dim(` — ${o.hint}`) : ''}`
		);
	});
	const defIndex = Math.max(
		0,
		options.findIndex((o) => o.value === defValue)
	);
	for (;;) {
		const raw = await ask('Choose', String(defIndex + 1));
		const n = Number(raw);
		if (Number.isInteger(n) && n >= 1 && n <= options.length) return options[n - 1].value;
		console.log(red(`    Pick a number from 1 to ${options.length}.`));
		assertInput();
	}
}

const step = (n, title) =>
	console.log(
		`\n${bold(`─── ${n}. ${title} `)}${dim('─'.repeat(Math.max(4, 50 - title.length)))}\n`
	);
const ok = (s) => console.log(`  ${green('✓')} ${s}`);
const warn = (s) => console.log(`  ${yellow('!')} ${s}`);
const fail = (s) => console.log(`  ${red('✗')} ${s}`);
const info = (s) => console.log(`  ${dim(s)}`);

// ─── env files ────────────────────────────────────────────────────────────────

function parseEnv(path) {
	const out = {};
	if (!existsSync(path)) return out;
	for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
		const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
		if (!m) continue;
		let v = m[2];
		if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
			v = v.slice(1, -1);
		}
		out[m[1]] = v;
	}
	return out;
}

const quote = (v) => (/[\s#"']/.test(v) ? JSON.stringify(v) : v);

/**
 * Write `values` into an env file. Existing lines for those keys are replaced in
 * place (comments and unknown keys survive); a key set to '' is written empty;
 * new keys are appended. With no file yet, the `.example` template is the base,
 * so its comments come along.
 */
function writeEnv(path, values, templatePath) {
	const base = existsSync(path)
		? readFileSync(path, 'utf8')
		: existsSync(templatePath)
			? readFileSync(templatePath, 'utf8')
			: '';
	if (existsSync(path)) copyFileSync(path, `${path}.bak`);
	const lines = base.split(/\r?\n/);
	const pending = new Map(Object.entries(values));
	const out = lines.map((line) => {
		const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
		if (!m || !pending.has(m[1])) return line;
		const v = pending.get(m[1]);
		pending.delete(m[1]);
		return `${m[1]}=${quote(v)}`;
	});
	while (out.length && out.at(-1) === '') out.pop();
	for (const [k, v] of pending) out.push(`${k}=${quote(v)}`);
	writeFileSync(path, out.join('\n') + '\n');
}

// ─── commands ────────────────────────────────────────────────────────────────

/** Run a command attached to this terminal. Returns true on exit code 0. */
function run(cmd, args, opts = {}) {
	info(`$ ${[cmd, ...args].join(' ')}`);
	const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT, shell: IS_WINDOWS, ...opts });
	return r.status === 0;
}

function capture(cmd, args) {
	const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', shell: IS_WINDOWS });
	return r.status === 0 ? r.stdout : null;
}

const hasCommand = (cmd) => capture(cmd, ['--version']) !== null;

/** The Supabase CLI if installed, else via npx (downloads on first use). */
function supabaseCli() {
	if (hasCommand('supabase')) return { cmd: 'supabase', pre: [] };
	return { cmd: 'npx', pre: ['--yes', 'supabase@latest'] };
}

const runSupabase = (args) => {
	const cli = supabaseCli();
	return run(cli.cmd, [...cli.pre, ...args]);
};

// ─── network checks ──────────────────────────────────────────────────────────

async function checkSupabase(url, anonKey) {
	try {
		const res = await fetch(`${url.replace(/\/$/, '')}/auth/v1/health`, {
			headers: { apikey: anonKey },
			signal: AbortSignal.timeout(8000)
		});
		if (res.ok) return { ok: true };
		return { ok: false, detail: `HTTP ${res.status}` };
	} catch (e) {
		return { ok: false, detail: e.cause?.code || e.message };
	}
}

// ─── steps ───────────────────────────────────────────────────────────────────

function checkPrerequisites() {
	step(0, 'Prerequisites');
	const major = Number(process.versions.node.split('.')[0]);
	if (major >= 22) ok(`Node ${process.versions.node}`);
	else {
		fail(
			`Node ${process.versions.node} — LUMA needs Node 22+ (Supabase realtime needs a global WebSocket).`
		);
		info('Install Node 22 (see .nvmrc), then re-run `npm run setup`.');
	}
	if (existsSync(join(ROOT, 'node_modules'))) ok('Dependencies installed');
	else warn('node_modules missing — will offer `npm install` at the end of this step.');
	return major >= 22;
}

async function installDeps() {
	if (existsSync(join(ROOT, 'node_modules'))) return;
	if (await confirm('Run `npm install` now?')) run('npm', ['install']);
}

async function setupDatabase(env, envLocal) {
	step(1, 'Database & auth');
	info('LUMA stores everything in Supabase: Postgres for data, Supabase Auth for sign-in,');
	info('Storage for logos. Pick where that Supabase lives.\n');

	const provider = await choose(
		'Database',
		[
			{
				value: 'supabase-cloud',
				label: 'Supabase Cloud',
				hint: 'hosted at supabase.com — quickest'
			},
			{
				value: 'supabase-self-hosted',
				label: 'Self-hosted Supabase',
				hint: 'your own Docker/Kubernetes stack'
			},
			{
				value: 'supabase-local',
				label: 'Local Supabase',
				hint: '`supabase start` on this machine, for development'
			}
		],
		env.LUMA_DB_PROVIDER || 'supabase-cloud'
	);

	console.log('');
	const auth = await choose(
		'Auth',
		[
			{
				value: 'supabase',
				label: 'Supabase Auth',
				hint: 'email + password and magic links; SSO providers can be enabled inside it'
			}
		],
		'supabase'
	);

	let url = envLocal.PUBLIC_SUPABASE_URL || '';
	let anon = envLocal.PUBLIC_SUPABASE_ANON_KEY || '';
	let service = envLocal.SUPABASE_SERVICE_ROLE_KEY || envLocal.PRIVATE_SUPABASE_SERVICE_KEY || '';
	const placeholder = (v) => !v || v.includes('your-project') || v.includes('your-anon');
	if (placeholder(url)) url = '';
	if (placeholder(anon)) anon = '';

	console.log('');
	if (provider === 'supabase-local') {
		const local = await setupLocalSupabase();
		if (local)
			({ url, anon, service } = { url: local.url, anon: local.anon, service: local.service });
	} else if (provider === 'supabase-self-hosted') {
		info('Self-hosting guide: https://supabase.com/docs/guides/self-hosting/docker');
		info("Use the stack's public API URL (Kong), and ANON_KEY / SERVICE_ROLE_KEY from its .env.\n");
	} else {
		info(
			'Supabase dashboard → Project Settings → API. New project: https://supabase.com/dashboard/new\n'
		);
	}

	if (provider !== 'supabase-local' || !url) {
		for (;;) {
			const raw = await ask(
				provider === 'supabase-cloud' ? 'Project URL (or project ref)' : 'API URL',
				url
			);
			url = /^[a-z0-9]{20}$/.test(raw) ? `https://${raw}.supabase.co` : raw.replace(/\/$/, '');
			if (/^https?:\/\//.test(url)) break;
			console.log(red('    That needs to be a URL, e.g. https://abcd1234.supabase.co'));
			assertInput();
		}
		anon = await askSecret('Anon (public) key', anon);
		service = await askSecret('Service role key (optional, server-only)', service);
	}

	if (url && anon) {
		const check = await checkSupabase(url, anon);
		if (check.ok) ok(`Reached Supabase at ${new URL(url).host}`);
		else warn(`Couldn't reach Supabase (${check.detail}). Saving anyway — check the URL and key.`);
	} else {
		warn(
			'No URL/key — the app will not start until PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY are set.'
		);
	}

	return { provider, auth, url, anon, service };
}

async function setupLocalSupabase() {
	info('Local Supabase runs in Docker via the Supabase CLI.');
	if (!hasCommand('docker')) {
		fail('Docker not found. Install Docker Desktop, then re-run setup.');
		return null;
	}
	if (!existsSync(join(ROOT, 'supabase', 'config.toml'))) {
		if (!(await confirm('No supabase/config.toml yet — run `supabase init`?'))) return null;
		if (!runSupabase(['init'])) return null;
	}
	if (await confirm('Start local Supabase now (`supabase start`, applies migrations)?')) {
		if (!runSupabase(['start'])) {
			fail('`supabase start` failed — see the output above.');
			return null;
		}
	}
	const cli = supabaseCli();
	const out = capture(cli.cmd, [...cli.pre, 'status', '-o', 'env']);
	if (!out) {
		warn('Could not read `supabase status`; enter the values by hand.');
		return null;
	}
	const s = {};
	for (const line of out.split(/\r?\n/)) {
		const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
		if (m) s[m[1]] = m[2];
	}
	if (!s.API_URL || !s.ANON_KEY) return null;
	ok(`Local Supabase at ${s.API_URL}`);
	return { url: s.API_URL, anon: s.ANON_KEY, service: s.SERVICE_ROLE_KEY || '' };
}

async function setupHosting(env) {
	step(2, 'Hosting');
	const target = await choose(
		'Where will this run in production?',
		[
			{ value: 'vercel', label: 'Vercel', hint: 'serverless; `vercel` CLI or Git integration' },
			{ value: 'node', label: 'Node server', hint: 'self-hosted: `npm run build && node build`' },
			{ value: 'docker', label: 'Docker', hint: 'self-hosted: docker compose (Node server inside)' }
		],
		env.ADAPTER === 'node' ? 'node' : 'vercel'
	);
	console.log('');
	const appUrl = (
		await ask('Public URL of this deployment', env.PUBLIC_APP_URL || 'http://localhost:5173')
	).replace(/\/$/, '');
	return { target, adapter: target === 'vercel' ? 'vercel' : 'node', appUrl };
}

async function setupAnalytics(env, envLocal) {
	step(3, 'Analytics (optional)');
	info('PostHog product analytics + error tracking. Leave the key blank to turn it off.');
	const key = await ask('PostHog project key (phc_...)', envLocal.PUBLIC_POSTHOG_KEY || '');
	if (key && key.startsWith('phx_')) {
		warn('That is a personal API key (phx_), not a project ingest key (phc_). Not saving it.');
		return { key: '', host: env.PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com' };
	}
	const host = key
		? await ask(
				'PostHog host',
				envLocal.PUBLIC_POSTHOG_HOST || env.PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'
			)
		: env.PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';
	return { key, host };
}

function saveEnv(db, hosting, analytics, envLocal) {
	step(4, 'Writing configuration');
	writeEnv(
		ENV_PATH,
		{
			LUMA_DB_PROVIDER: db.provider,
			LUMA_AUTH_PROVIDER: db.auth,
			ADAPTER: hosting.adapter,
			PUBLIC_APP_URL: hosting.appUrl,
			PUBLIC_POSTHOG_HOST: analytics.host
		},
		join(ROOT, '.env.example')
	);
	ok('.env        — instance settings');

	const local = {
		PUBLIC_SUPABASE_URL: db.url,
		PUBLIC_SUPABASE_ANON_KEY: db.anon,
		SUPABASE_SERVICE_ROLE_KEY: db.service,
		PUBLIC_POSTHOG_KEY: analytics.key
	};
	// .env.local wins over .env in Vite, so an old host there would shadow the new one.
	if ('PUBLIC_POSTHOG_HOST' in envLocal) local.PUBLIC_POSTHOG_HOST = analytics.host;
	writeEnv(ENV_LOCAL_PATH, local, join(ROOT, '.env.local.example'));
	ok('.env.local  — keys (previous versions saved as *.bak)');
}

async function setupMigrations(db) {
	step(5, 'Database schema');
	const files = readdirSync(MIGRATIONS_DIR)
		.filter((f) => f.endsWith('.sql'))
		.sort();
	info(`${files.length} migrations in supabase/migrations (${files[0]} … ${files.at(-1)}).`);
	info('They are forward-only; applying them to a database that already has them is a no-op');
	info('through the Supabase CLI, which records what it has applied.\n');

	if (db.provider === 'supabase-local') {
		info(
			'`supabase start` applies migrations automatically. To rebuild from scratch: `supabase db reset`.'
		);
		return;
	}

	const how = await choose(
		'Apply migrations now?',
		[
			{ value: 'cli', label: 'Yes, with the Supabase CLI', hint: '`supabase db push`' },
			{ value: 'skip', label: 'Skip', hint: "already applied, or I'll do it myself" }
		],
		'skip'
	);
	if (how === 'skip') {
		info('Later: `supabase link --project-ref <ref>` then `supabase db push`');
		info('(self-hosted: `supabase db push --db-url postgres://...`).');
		return;
	}

	if (db.provider === 'supabase-cloud') {
		const ref = new URL(db.url).hostname.split('.')[0];
		if (!runSupabase(['link', '--project-ref', ref])) return fail('`supabase link` failed.');
		if (runSupabase(['db', 'push'])) ok('Schema up to date');
		else fail('`supabase db push` failed — see the output above.');
	} else {
		info(
			"Connection string: your stack's Postgres, e.g. postgres://postgres:PASSWORD@host:5432/postgres"
		);
		const dbUrl = await askSecret('Postgres connection string');
		if (!dbUrl) return warn('Skipped.');
		if (runSupabase(['db', 'push', '--db-url', dbUrl])) ok('Schema up to date');
		else fail('`supabase db push` failed — see the output above.');
	}
}

async function setupEmail(db) {
	step(6, 'Email (optional)');
	info('Emails go out through Resend from two Supabase Edge Functions. Without a Resend key');
	info('they run in dry-run mode: they report what they would send, and send nothing.');
	if (
		db.provider === 'supabase-local' ||
		!(await confirm('Configure Resend + deploy the email functions now?', false))
	) {
		info(
			'Later: `supabase secrets set RESEND_API_KEY=re_... LUMA_FROM_EMAIL="Org <noreply@yourdomain>"`'
		);
		info('       `supabase functions deploy notify-interviews send-reminders`');
		return;
	}
	const key = await askSecret('Resend API key (re_...)');
	const from = await ask('From address', 'LUMA <noreply@example.com>');
	if (key) runSupabase(['secrets', 'set', `RESEND_API_KEY=${key}`, `LUMA_FROM_EMAIL=${from}`]);
	if (runSupabase(['functions', 'deploy', 'notify-interviews'])) ok('notify-interviews deployed');
	if (runSupabase(['functions', 'deploy', 'send-reminders'])) ok('send-reminders deployed');
	info('Verify your sending domain in Resend (SPF/DKIM) before real delivery works.');
}

/** GoTrue admin + PostgREST with the service role key. */
async function adminFetch(db, path, init = {}) {
	const res = await fetch(`${db.url}${path}`, {
		...init,
		headers: {
			apikey: db.service,
			Authorization: `Bearer ${db.service}`,
			'Content-Type': 'application/json',
			...(init.headers || {})
		},
		signal: AbortSignal.timeout(10000)
	});
	const body = await res.text();
	let json = null;
	try {
		json = body ? JSON.parse(body) : null;
	} catch {
		// non-JSON error body
	}
	return { ok: res.ok, status: res.status, json, body };
}

async function findUserByEmail(db, email) {
	for (let page = 1; page <= 50; page++) {
		const r = await adminFetch(db, `/auth/v1/admin/users?page=${page}&per_page=200`);
		if (!r.ok) throw new Error(`listing users failed (HTTP ${r.status})`);
		const users = r.json?.users ?? [];
		const hit = users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
		if (hit) return hit;
		if (users.length < 200) return null;
	}
	return null;
}

async function setupPlatformAdmin(db, hosting) {
	step(7, 'First platform admin');
	info("A platform admin can open /admin: create orgs, manage every org's settings, add admins.");
	const sqlHint = (email) =>
		`insert into platform_admins (user_id) select id from auth.users where email = '${email || 'you@example.com'}' on conflict do nothing;`;

	if (!(await confirm('Set one up now?'))) return;
	const email = (await ask('Admin email')).toLowerCase();
	if (!email) return;

	if (!db.service || !db.url) {
		warn('No service role key, so this has to be done by hand:');
		info(`1. Sign up at ${hosting.appUrl}/auth with ${email}`);
		info('2. Run in the Supabase SQL editor:');
		console.log(`     ${cyan(sqlHint(email))}`);
		return;
	}

	try {
		let user = await findUserByEmail(db, email);
		if (!user) {
			info('No account with that email yet — creating one.');
			const password = await askSecret('Password for the new account (min 8 chars)');
			if (password.length < 8)
				return fail('Too short; nothing created. Re-run setup to try again.');
			const r = await adminFetch(db, '/auth/v1/admin/users', {
				method: 'POST',
				body: JSON.stringify({ email, password, email_confirm: true })
			});
			if (!r.ok)
				return fail(`Creating the account failed: ${r.json?.msg || r.json?.message || r.body}`);
			user = r.json;
			ok(`Account created for ${email}`);
		} else ok(`Found existing account for ${email}`);

		const r = await adminFetch(db, '/rest/v1/platform_admins?on_conflict=user_id', {
			method: 'POST',
			headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
			body: JSON.stringify({ user_id: user.id })
		});
		if (r.ok) ok(`${email} is a platform admin`);
		else if (r.status === 404 || /platform_admins/.test(r.body))
			fail('platform_admins table not found — apply the migrations first, then re-run setup.');
		else fail(`Couldn't grant platform admin (HTTP ${r.status}): ${r.body}`);
	} catch (e) {
		fail(`${e.message}. Do it by hand in the SQL editor:`);
		console.log(`     ${cyan(sqlHint(email))}`);
	}
}

function printAuthUrls(hosting) {
	step(8, 'Auth redirect URLs');
	info('Supabase dashboard → Authentication → URL Configuration:');
	console.log(`    Site URL:       ${cyan(hosting.appUrl)}`);
	for (const p of ['/auth/confirm', '/auth/reset', '/invite/*']) {
		console.log(`    Redirect URL:   ${cyan(hosting.appUrl + p)}`);
	}
	if (!hosting.appUrl.includes('localhost')) {
		info('Add http://localhost:5173/** too if you also develop against this project.');
	}
}

function printDeploy(hosting) {
	if (hosting.target === 'vercel') {
		info('Deploy: import the repo in Vercel and copy the variables from .env and .env.local');
		info(
			'into Project → Settings → Environment Variables (SUPABASE_SERVICE_ROLE_KEY: server only).'
		);
	} else if (hosting.target === 'docker') {
		info('Deploy: `docker compose --env-file .env --env-file .env.local up -d --build`');
	} else {
		info(
			'Deploy: `npm run build && node build` (PORT=3000 by default), behind your reverse proxy.'
		);
	}
}

async function finish(hosting) {
	console.log(`\n${bold('─── Done ')}${dim('─'.repeat(46))}\n`);
	printDeploy(hosting);
	info('Re-run `npm run setup` any time to change any of this.\n');
	console.log(`  Everything else — platform branding, organizations, teams, recruiting rules,`);
	console.log(
		`  interview forms, members — is configured in the app: ${cyan('/admin/?tab=setup')}\n`
	);

	if (ARGS.has('--no-start')) return rl.close();
	const start = await confirm('Start the dev server and open the setup dashboard?');
	rl.close();
	if (!start) {
		info('Later: `npm run dev`, then open http://localhost:5173/admin/?tab=setup');
		return;
	}
	spawn('npm', ['run', 'dev', '--', '--open', '/admin/?tab=setup'], {
		stdio: 'inherit',
		cwd: ROOT,
		shell: IS_WINDOWS
	});
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
	console.log(`\n${bold(yellow('LUMA'))} ${bold('setup')}`);
	console.log(dim('Configure this deployment. Enter keeps the value in [brackets].'));

	const nodeOk = checkPrerequisites();
	await installDeps();

	const env = parseEnv(ENV_PATH);
	const envLocal = parseEnv(ENV_LOCAL_PATH);
	// Older installs kept everything in .env.local; read instance values from there too.
	for (const k of ['LUMA_DB_PROVIDER', 'ADAPTER', 'PUBLIC_APP_URL', 'PUBLIC_POSTHOG_HOST']) {
		if (!env[k] && envLocal[k]) env[k] = envLocal[k];
	}

	const db = await setupDatabase(env, envLocal);
	const hosting = await setupHosting(env);
	const analytics = await setupAnalytics(env, envLocal);
	saveEnv(db, hosting, analytics, envLocal);
	await setupMigrations(db);
	await setupEmail(db);
	await setupPlatformAdmin(db, hosting);
	printAuthUrls(hosting);
	if (!nodeOk) warn('Reminder: upgrade to Node 22+ before starting the app.');
	await finish(hosting);
}

main().catch((e) => {
	console.error(red(`\nSetup failed: ${e.message}`));
	rl.close();
	process.exit(1);
});
