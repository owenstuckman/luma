#!/usr/bin/env node

/**
 * LUMA tenant config — move an organization's configuration (and optionally its
 * applicants) in and out of a database as plain files.
 *
 *   npm run tenant -- export <slug> [--out <dir>] [--with-applicants] [--keep-urls]
 *   npm run tenant -- import <dir|tenant.json> [--owner <email>] [--with-applicants] [--dry-run]
 *   npm run tenant -- import-applicants <slug> <file.csv|file.json> --job <id|name> [--dry-run]
 *
 * A tenant directory looks like:
 *
 *   instance/<slug>/tenant/
 *     tenant.json         org, settings, teams, job postings (questions included)
 *     assets/…            images referenced from tenant.json by relative path
 *     applicants.json     optional, written by --with-applicants
 *
 * Org-specific setup lives in files like these, under the untracked `instance/`
 * folder — never in migrations. See docs/INSTANCE.md → "Tenant config files".
 *
 * Needs PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (from .env / .env.local,
 * or the environment). The service role bypasses RLS, so this is an operator
 * tool: run it from a trusted machine only.
 *
 * Plain fetch against the Supabase REST, Storage and Auth APIs — no dependencies.
 */

import {
	existsSync,
	readFileSync,
	writeFileSync,
	mkdirSync,
	statSync,
	copyFileSync
} from 'node:fs';
import { join, dirname, resolve, relative, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUCKET = 'org-assets';
const FORMAT = 'luma-tenant';
const VERSION = 1;

// ─── args + env ──────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const command = argv[0];
const positional = argv.slice(1).filter((a, i, all) => !a.startsWith('--') && !isFlagValue(all, i));
function isFlagValue(all, i) {
	return i > 0 && ['--out', '--owner', '--job'].includes(all[i - 1]);
}
const flag = (name) => argv.includes(name);
const option = (name) => {
	const i = argv.indexOf(name);
	return i !== -1 ? argv[i + 1] : undefined;
};
const DRY = flag('--dry-run');

function parseEnvFile(path) {
	const out = {};
	if (!existsSync(path)) return out;
	for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
		const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
		if (!m) continue;
		let v = m[2];
		if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
			v = v.slice(1, -1);
		}
		out[m[1]] = v;
	}
	return out;
}

const env = {
	...parseEnvFile(join(ROOT, '.env')),
	...parseEnvFile(join(ROOT, '.env.local')),
	...process.env
};
const SUPABASE_URL = (env.PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.PRIVATE_SUPABASE_SERVICE_KEY || '';

const log = (s = '') => console.log(s);
const warn = (s) => console.log(`  ! ${s}`);
function die(msg) {
	console.error(`\n✗ ${msg}\n`);
	process.exit(1);
}

// ─── Supabase REST ──────────────────────────────────────────────────────────

const headers = (extra = {}) => ({
	apikey: SERVICE_KEY,
	Authorization: `Bearer ${SERVICE_KEY}`,
	...extra
});

async function rest(method, path, body, extraHeaders = {}) {
	const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
		method,
		headers: headers({ 'Content-Type': 'application/json', ...extraHeaders }),
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	const text = await res.text();
	let json = null;
	try {
		json = text ? JSON.parse(text) : null;
	} catch {
		json = null;
	}
	if (!res.ok)
		throw new Error(`${method} ${path.split('?')[0]}: ${json?.message || text || res.status}`);
	return json;
}

const select = (table, query) => rest('GET', `${table}?${query}`);
const insert = (table, rows) => rest('POST', `${table}`, rows, { Prefer: 'return=representation' });
const update = (table, query, patch) =>
	rest('PATCH', `${table}?${query}`, patch, { Prefer: 'return=representation' });

/** Fetch every row, paging past PostgREST's max-rows cap. */
async function selectAll(table, query, pageSize = 1000) {
	const out = [];
	for (let from = 0; ; from += pageSize) {
		const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
			headers: headers({ Range: `${from}-${from + pageSize - 1}`, 'Range-Unit': 'items' })
		});
		if (!res.ok) throw new Error(`GET ${table}: ${await res.text()}`);
		const rows = await res.json();
		out.push(...rows);
		if (rows.length < pageSize) return out;
	}
}

const publicUrl = (path) => `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;

async function uploadFile(localPath, objectPath) {
	const ext = extname(localPath).toLowerCase();
	const type =
		{
			'.png': 'image/png',
			'.jpg': 'image/jpeg',
			'.jpeg': 'image/jpeg',
			'.gif': 'image/gif',
			'.webp': 'image/webp',
			'.svg': 'image/svg+xml'
		}[ext] || 'application/octet-stream';
	const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${objectPath}`, {
		method: 'POST',
		headers: headers({
			'Content-Type': type,
			'x-upsert': 'true',
			'Cache-Control': 'max-age=31536000'
		}),
		body: readFileSync(localPath)
	});
	if (!res.ok) throw new Error(`upload ${objectPath}: ${await res.text()}`);
	return publicUrl(objectPath);
}

async function findUserIdByEmail(email) {
	for (let page = 1; page <= 100; page++) {
		const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=200`, {
			headers: headers()
		});
		if (!res.ok) throw new Error(`listing users: HTTP ${res.status}`);
		const { users = [] } = await res.json();
		const hit = users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
		if (hit) return hit.id;
		if (users.length < 200) return null;
	}
	return null;
}

// ─── images ─────────────────────────────────────────────────────────────────

const isRemote = (v) => typeof v === 'string' && /^https?:\/\//.test(v);
const isRelativeFile = (v) =>
	typeof v === 'string' && v !== '' && !isRemote(v) && !v.startsWith('/') && !v.startsWith('data:');

/** Every checkbox_image-style question image in a questions schema. */
function* questionImages(questions) {
	for (const step of questions?.steps ?? []) {
		for (const q of step?.questions ?? []) {
			if (q && typeof q.imageSrc === 'string' && q.imageSrc) yield q;
		}
	}
}

/**
 * Export side: bring an image into <out>/assets so the tenant is portable to
 * another Supabase project. Images in this project's bucket are downloaded;
 * site-relative paths (`/images/…`, the old in-repo `static/` images) are copied
 * from `static/` when present. Anything else is left as an absolute URL.
 */
async function localizeImage(value, outDir, sub, keepUrls) {
	if (!value || typeof value !== 'string') return value ?? null;
	if (value.startsWith('/')) {
		const local = join(ROOT, 'static', value);
		if (existsSync(local)) {
			const rel = join('assets', sub, basename(value)).replaceAll('\\', '/');
			mkdirSync(join(outDir, 'assets', sub), { recursive: true });
			copyFileSync(local, join(outDir, rel));
			return rel;
		}
		warn(`site-relative image ${value} not found under static/ — kept as-is`);
		return value;
	}
	if (keepUrls || !value.startsWith(`${SUPABASE_URL}/storage/`)) return value;
	const res = await fetch(value);
	if (!res.ok) {
		warn(`couldn't download ${value} (HTTP ${res.status}) — kept as URL`);
		return value;
	}
	const name = basename(new URL(value).pathname);
	const rel = join('assets', sub, name).replaceAll('\\', '/');
	mkdirSync(join(outDir, 'assets', sub), { recursive: true });
	writeFileSync(join(outDir, rel), Buffer.from(await res.arrayBuffer()));
	return rel;
}

/** Import side: upload a relative image file and return its public URL. */
async function publishImage(value, baseDir, orgId, kind) {
	if (!isRelativeFile(value)) return value ?? null;
	const local = resolve(baseDir, value);
	if (!existsSync(local) || !statSync(local).isFile()) {
		warn(`image file ${value} not found — left unset`);
		return null;
	}
	// Content-addressed name: re-importing the same file reuses the same object.
	const hash = createHash('sha256').update(readFileSync(local)).digest('hex').slice(0, 16);
	const objectPath = `orgs/${orgId}/${kind}/${hash}${extname(local).toLowerCase()}`;
	if (DRY) return `(dry-run) ${objectPath}`;
	return uploadFile(local, objectPath);
}

// ─── export ─────────────────────────────────────────────────────────────────

async function exportTenant(slug) {
	if (!slug) die('Usage: npm run tenant -- export <slug> [--out <dir>]');
	const outDir = resolve(ROOT, option('--out') || join('instance', slug, 'tenant'));
	const keepUrls = flag('--keep-urls');

	const [org] = await select('organizations', `slug=eq.${encodeURIComponent(slug)}&select=*`);
	if (!org) die(`No organization with slug "${slug}".`);
	const teams = await select('teams', `org_id=eq.${org.id}&select=*&order=display_order.asc`).catch(
		() => []
	);
	const jobs = await select('job_posting', `org_id=eq.${org.id}&select=*&order=id.asc`);

	mkdirSync(outDir, { recursive: true });
	log(`Exporting ${org.name} (${slug}) → ${relative(ROOT, outDir) || outDir}`);

	const tenant = {
		format: FORMAT,
		version: VERSION,
		exported_at: new Date().toISOString(),
		organization: {
			slug: org.slug,
			name: org.name,
			primary_color: org.primary_color,
			secondary_color: org.secondary_color,
			logo: await localizeImage(org.logo_url, outDir, 'logo', keepUrls),
			settings: org.settings ?? {},
			email_settings: org.email_settings ?? null
		},
		teams: [],
		jobs: []
	};

	for (const t of teams) {
		tenant.teams.push({
			slug: t.slug,
			name: t.name,
			description: t.description,
			display_order: t.display_order,
			active: t.active,
			image: await localizeImage(t.image_url, outDir, 'teams', keepUrls)
		});
	}

	for (const j of jobs) {
		const questions = structuredClone(j.questions ?? { steps: [] });
		for (const q of questionImages(questions)) {
			q.imageSrc = await localizeImage(q.imageSrc, outDir, 'questions', keepUrls);
		}
		tenant.jobs.push({
			name: j.name,
			description: j.description,
			active: j.active_flg,
			applications_closed: j.applications_closed ?? false,
			scheduled: j.scheduled,
			schedule: j.schedule ?? {},
			metadata: j.metadata ?? null,
			image: await localizeImage(j.image_url, outDir, 'jobs', keepUrls),
			questions
		});
	}

	writeFileSync(join(outDir, 'tenant.json'), JSON.stringify(tenant, null, '\t') + '\n');
	log(`  ✓ tenant.json — ${tenant.teams.length} teams, ${tenant.jobs.length} job postings`);

	if (flag('--with-applicants')) {
		const rows = await selectAll('applicants', `org_id=eq.${org.id}&select=*&order=id.asc`);
		const jobName = new Map(jobs.map((j) => [j.id, j.name]));
		const teamSlug = new Map(teams.map((t) => [t.id, t.slug]));
		const out = rows.map((a) => ({
			name: a.name,
			email: a.email,
			job: jobName.get(a.job) ?? null,
			team: teamSlug.get(a.team_id) ?? null,
			team_rank: a.team_rank ?? null,
			status: a.status,
			created_at: a.created_at,
			submission_group: a.submission_group ?? null,
			selected_team_slugs: a.selected_team_slugs ?? [],
			recruitInfo: a.recruitInfo ?? {},
			metadata: a.metadata ?? null,
			comments: a.comments ?? { comments: [] }
		}));
		writeFileSync(join(outDir, 'applicants.json'), JSON.stringify(out, null, '\t') + '\n');
		log(
			`  ✓ applicants.json — ${out.length} applications (contains personal data; keep it private)`
		);
	}
	log('');
}

// ─── import ─────────────────────────────────────────────────────────────────

function readTenant(pathArg) {
	if (!pathArg) die('Usage: npm run tenant -- import <dir|tenant.json>');
	const abs = resolve(process.cwd(), pathArg);
	const file = existsSync(abs) && statSync(abs).isDirectory() ? join(abs, 'tenant.json') : abs;
	if (!existsSync(file)) die(`${file} not found.`);
	const tenant = JSON.parse(readFileSync(file, 'utf8'));
	if (tenant.format !== FORMAT)
		die(`${file} is not a ${FORMAT} file (missing "format": "${FORMAT}").`);
	if (tenant.version > VERSION)
		die(`${file} is format version ${tenant.version}; this tool reads up to ${VERSION}.`);
	if (!tenant.organization?.slug || !tenant.organization?.name)
		die('organization.slug and organization.name are required.');
	return { tenant, baseDir: dirname(file) };
}

async function importTenant(pathArg) {
	const { tenant, baseDir } = readTenant(pathArg);
	const o = tenant.organization;
	log(`Importing ${o.name} (${o.slug})${DRY ? ' — DRY RUN, nothing is written' : ''}`);

	// Organization
	let [org] = await select('organizations', `slug=eq.${encodeURIComponent(o.slug)}&select=*`);
	if (!org) {
		const ownerEmail = option('--owner');
		if (!ownerEmail) die(`Org "${o.slug}" doesn't exist yet — pass --owner <email> to create it.`);
		const ownerId = await findUserIdByEmail(ownerEmail);
		if (!ownerId) die(`No account for ${ownerEmail}. Sign up at /auth first.`);
		if (DRY) {
			log(`  + would create org ${o.slug} owned by ${ownerEmail}`);
			org = { id: 0, settings: {} };
		} else {
			[org] = await insert('organizations', { name: o.name, slug: o.slug, owner_id: ownerId });
			await insert('org_members', {
				org_id: org.id,
				user_id: ownerId,
				role: 'owner',
				roles: ['owner']
			});
			log(`  + created org ${o.slug} (id ${org.id}) owned by ${ownerEmail}`);
		}
	} else log(`  = org ${o.slug} exists (id ${org.id}) — updating`);

	const orgPatch = {
		name: o.name,
		...(o.primary_color ? { primary_color: o.primary_color } : {}),
		...(o.secondary_color ? { secondary_color: o.secondary_color } : {}),
		// Merge, so settings sections not in the file are kept.
		settings: { ...(org.settings ?? {}), ...(o.settings ?? {}) },
		...(o.email_settings ? { email_settings: o.email_settings } : {})
	};
	if (o.logo !== undefined) orgPatch.logo_url = await publishImage(o.logo, baseDir, org.id, 'logo');
	if (!DRY) await update('organizations', `id=eq.${org.id}`, orgPatch);
	log(`  ✓ org profile + settings`);

	// Teams — upsert by slug
	const existingTeams = DRY && !org.id ? [] : await select('teams', `org_id=eq.${org.id}&select=*`);
	const teamBySlug = new Map(existingTeams.map((t) => [t.slug, t]));
	for (const [i, t] of (tenant.teams ?? []).entries()) {
		if (!t.slug || !t.name) {
			warn(`team #${i + 1} needs slug and name — skipped`);
			continue;
		}
		const row = {
			name: t.name,
			description: t.description ?? null,
			display_order: t.display_order ?? i + 1,
			active: t.active ?? true,
			...(t.image !== undefined
				? { image_url: await publishImage(t.image, baseDir, org.id, 'teams') }
				: {})
		};
		const existing = teamBySlug.get(t.slug);
		if (DRY) log(`  ${existing ? '=' : '+'} team ${t.slug}`);
		else if (existing) await update('teams', `id=eq.${existing.id}`, row);
		else
			teamBySlug.set(t.slug, (await insert('teams', { org_id: org.id, slug: t.slug, ...row }))[0]);
	}
	log(`  ✓ ${(tenant.teams ?? []).length} teams`);

	// Jobs — upsert by name within the org
	const existingJobs =
		DRY && !org.id ? [] : await select('job_posting', `org_id=eq.${org.id}&select=id,name`);
	const jobByName = new Map(existingJobs.map((j) => [j.name, j]));
	for (const j of tenant.jobs ?? []) {
		if (!j.name) {
			warn('a job without a name — skipped');
			continue;
		}
		const questions = structuredClone(j.questions ?? { steps: [] });
		for (const q of questionImages(questions)) {
			q.imageSrc = (await publishImage(q.imageSrc, baseDir, org.id, 'questions')) ?? '';
		}
		const row = {
			name: j.name,
			owner: o.slug,
			description: j.description ?? null,
			active_flg: j.active ?? true,
			applications_closed: j.applications_closed ?? false,
			scheduled: j.scheduled ?? false,
			schedule: j.schedule ?? {},
			metadata: j.metadata ?? null,
			questions,
			...(j.image !== undefined
				? { image_url: await publishImage(j.image, baseDir, org.id, 'jobs') }
				: {})
		};
		const existing = jobByName.get(j.name);
		if (DRY) log(`  ${existing ? '=' : '+'} job "${j.name}"`);
		else if (existing) await update('job_posting', `id=eq.${existing.id}`, row);
		else jobByName.set(j.name, (await insert('job_posting', { org_id: org.id, ...row }))[0]);
	}
	log(`  ✓ ${(tenant.jobs ?? []).length} job postings`);

	if (flag('--with-applicants')) {
		const file = join(baseDir, 'applicants.json');
		if (!existsSync(file))
			warn('--with-applicants given but no applicants.json next to tenant.json');
		else await importApplicantRows(org, JSON.parse(readFileSync(file, 'utf8')), null);
	}
	log('');
}

// ─── applicants ─────────────────────────────────────────────────────────────

/** RFC 4180-ish CSV: quoted fields, escaped quotes, newlines inside quotes. */
function parseCsv(text) {
	const rows = [];
	let row = [];
	let field = '';
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (quoted) {
			if (c === '"' && text[i + 1] === '"') {
				field += '"';
				i++;
			} else if (c === '"') quoted = false;
			else field += c;
		} else if (c === '"') quoted = true;
		else if (c === ',') {
			row.push(field);
			field = '';
		} else if (c === '\n' || c === '\r') {
			if (c === '\r' && text[i + 1] === '\n') i++;
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
		} else field += c;
	}
	if (field !== '' || row.length) {
		row.push(field);
		rows.push(row);
	}
	const [header = [], ...body] = rows.filter((r) => r.some((f) => f.trim() !== ''));
	const keys = header.map((h) => h.trim());
	return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ''])));
}

/** Columns with a meaning of their own; every other CSV column becomes an answer. */
const KNOWN = new Set([
	'name',
	'first_name',
	'last_name',
	'email',
	'team',
	'teams',
	'job',
	'status',
	'created_at',
	'team_rank',
	'submission_group',
	'selected_team_slugs',
	'recruitInfo',
	'metadata',
	'comments'
]);
const STATUSES = new Set(['pending', 'interview', 'accepted', 'denied']);

async function importApplicantRows(org, rows, defaultJob) {
	const jobs = await select('job_posting', `org_id=eq.${org.id}&select=id,name`);
	const teams = await select('teams', `org_id=eq.${org.id}&select=id,slug,name`).catch(() => []);
	const jobOf = (ref) =>
		ref == null || ref === ''
			? defaultJob
			: (jobs.find((j) => String(j.id) === String(ref) || j.name === ref) ?? null);
	const teamOf = (ref) => {
		if (!ref) return null;
		const r = String(ref).trim().toLowerCase();
		return teams.find((t) => t.slug === r || t.name.toLowerCase() === r) ?? null;
	};

	const existing = await selectAll('applicants', `org_id=eq.${org.id}&select=job,email,team_id`);
	const key = (job, email, team) =>
		`${job ?? ''}|${String(email).trim().toLowerCase()}|${team ?? ''}`;
	const seen = new Set(existing.map((a) => key(a.job, a.email, a.team_id)));
	const groups = new Map();

	const out = [];
	let skippedDup = 0;
	const problems = [];
	rows.forEach((r, i) => {
		const line = i + 2;
		const name = (r.name || [r.first_name, r.last_name].filter(Boolean).join(' ')).trim();
		const email = String(r.email || '').trim();
		if (!name || !email.includes('@')) return problems.push(`row ${line}: needs name and email`);
		const job = jobOf(r.job);
		if (!job) return problems.push(`row ${line}: unknown job "${r.job ?? ''}" (use --job)`);
		const teamRef = r.team ?? (typeof r.teams === 'string' ? r.teams.split(/[;|]/)[0] : null);
		const team = teamOf(teamRef);
		if (teamRef && !team) return problems.push(`row ${line}: unknown team "${teamRef}"`);
		const k = key(job.id, email, team?.id);
		if (seen.has(k)) return skippedDup++;
		seen.add(k);

		const answers =
			r.recruitInfo && typeof r.recruitInfo === 'object'
				? r.recruitInfo
				: Object.fromEntries(Object.entries(r).filter(([c, v]) => !KNOWN.has(c) && v !== ''));
		const status = STATUSES.has(r.status) ? r.status : 'pending';
		const groupKey = `${job.id}|${email.toLowerCase()}`;
		if (!groups.has(groupKey)) groups.set(groupKey, r.submission_group || randomUUID());

		out.push({
			org_id: org.id,
			job: job.id,
			name,
			email,
			status,
			team_id: team?.id ?? null,
			team_rank: r.team_rank ? Number(r.team_rank) || null : null,
			selected_team_slugs: team
				? [team.slug]
				: Array.isArray(r.selected_team_slugs)
					? r.selected_team_slugs
					: [],
			submission_group: groups.get(groupKey),
			recruitInfo: answers,
			metadata:
				r.metadata && typeof r.metadata === 'object'
					? r.metadata
					: { imported_at: new Date().toISOString() },
			comments: r.comments && typeof r.comments === 'object' ? r.comments : { comments: [] },
			...(r.created_at ? { created_at: r.created_at } : {})
		});
	});

	for (const p of problems.slice(0, 20)) warn(p);
	if (problems.length > 20) warn(`…and ${problems.length - 20} more`);
	log(
		`  applicants: ${out.length} to add, ${skippedDup} already present, ${problems.length} skipped`
	);
	if (DRY || !out.length) return;
	for (let i = 0; i < out.length; i += 200) await insert('applicants', out.slice(i, i + 200));
	log(`  ✓ ${out.length} applications imported`);
}

async function importApplicants(slug, file) {
	if (!slug || !file)
		die('Usage: npm run tenant -- import-applicants <slug> <file.csv|file.json> --job <id|name>');
	const [org] = await select('organizations', `slug=eq.${encodeURIComponent(slug)}&select=id,slug`);
	if (!org) die(`No organization with slug "${slug}".`);
	const abs = resolve(process.cwd(), file);
	if (!existsSync(abs)) die(`${abs} not found.`);
	const text = readFileSync(abs, 'utf8');
	const rows = abs.toLowerCase().endsWith('.json') ? JSON.parse(text) : parseCsv(text);
	if (!Array.isArray(rows)) die('JSON input must be an array of applicant objects.');

	let defaultJob = null;
	const jobRef = option('--job');
	if (jobRef) {
		const jobs = await select('job_posting', `org_id=eq.${org.id}&select=id,name`);
		defaultJob = jobs.find((j) => String(j.id) === jobRef || j.name === jobRef);
		if (!defaultJob)
			die(
				`No job "${jobRef}" in ${slug}. Jobs: ${jobs.map((j) => `${j.id} "${j.name}"`).join(', ')}`
			);
	}
	log(`Importing ${rows.length} rows into ${slug}${DRY ? ' — DRY RUN, nothing is written' : ''}`);
	await importApplicantRows(org, rows, defaultJob);
	log('');
}

// ─── main ───────────────────────────────────────────────────────────────────

const USAGE = `LUMA tenant config

  npm run tenant -- export <slug> [--out <dir>] [--with-applicants] [--keep-urls]
      Write the org's settings, teams and job postings (and images) to
      instance/<slug>/tenant/ (or --out). --with-applicants adds applicants.json.

  npm run tenant -- import <dir|tenant.json> [--owner <email>] [--with-applicants] [--dry-run]
      Create or update an org from a tenant directory. Teams match by slug, job
      postings by name; relative image paths are uploaded to storage. --owner is
      required when the org doesn't exist yet.

  npm run tenant -- import-applicants <slug> <file.csv|file.json> --job <id|name> [--dry-run]
      Import existing applications. Columns: name (or first_name + last_name),
      email, optional team (slug or name), status, created_at, team_rank, job.
      Every other column is stored as an answer, keyed by its header.
      Already-present (job, email, team) applications are skipped.
`;

async function main() {
	if (!command || command === 'help' || flag('--help')) return log(USAGE);
	if (!SUPABASE_URL || !SERVICE_KEY) {
		die('PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (run `npm run setup`).');
	}
	if (command === 'export') return exportTenant(positional[0]);
	if (command === 'import') return importTenant(positional[0]);
	if (command === 'import-applicants') return importApplicants(positional[0], positional[1]);
	log(USAGE);
	process.exit(1);
}

main().catch((e) => die(e.message));
