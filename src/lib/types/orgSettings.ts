// Canonical shape of `organizations.settings` (JSONB). Hand-rolled validator
// (no zod) to keep the dependency surface small.
//
// To consume: import { readOrgSettings } from '$lib/types/orgSettings' and
// always pass an org row through it before accessing settings — never read
// `org.settings.foo` directly.

export interface ReviewThresholds {
	approve_to_advance: number;
	reject_to_deny: number;
	blinded_review: boolean;
	weighted_scoring: boolean;
}

export interface SchedulingDefaults {
	default_algorithm:
		| 'greedy-first-available'
		| 'round-robin'
		| 'balanced-load'
		| 'batch-scheduler'
		| 'max-placement';
	buffer_minutes: number;
	exclude_advisors_from_r1: boolean;
}

export interface EmailSettings {
	auto_send_application_confirmation: boolean;
	auto_send_auto_reject: boolean;
	auto_send_interview_scheduled: boolean;
	auto_send_decision_hire: boolean;
	auto_send_decision_reject: boolean;
	auto_send_decision_waitlist: boolean;
	from_address: string | null;
	from_name: string | null;
}

export interface OrgSettings {
	review_thresholds: ReviewThresholds;
	scheduling: SchedulingDefaults;
	email: EmailSettings;
}

export const DEFAULT_ORG_SETTINGS: OrgSettings = {
	review_thresholds: {
		approve_to_advance: 3,
		reject_to_deny: 2,
		blinded_review: true,
		weighted_scoring: false
	},
	scheduling: {
		default_algorithm: 'greedy-first-available',
		buffer_minutes: 5,
		exclude_advisors_from_r1: true
	},
	email: {
		auto_send_application_confirmation: true,
		auto_send_auto_reject: false,
		auto_send_interview_scheduled: true,
		auto_send_decision_hire: false,
		auto_send_decision_reject: false,
		auto_send_decision_waitlist: false,
		from_address: null,
		from_name: null
	}
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function pickNumber(v: unknown, fallback: number): number {
	return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function pickBool(v: unknown, fallback: boolean): boolean {
	return typeof v === 'boolean' ? v : fallback;
}

function pickString(v: unknown, fallback: string | null): string | null {
	return typeof v === 'string' ? v : fallback;
}

function pickEnum<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
	return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

const ALGORITHMS = [
	'greedy-first-available',
	'round-robin',
	'balanced-load',
	'batch-scheduler',
	'max-placement'
] as const;

/**
 * Read and normalize an org's settings JSON. Missing or malformed keys fall
 * back to DEFAULT_ORG_SETTINGS — never throws. Use this everywhere instead
 * of reading `org.settings` directly.
 */
export function readOrgSettings(raw: unknown): OrgSettings {
	const src = isPlainObject(raw) ? raw : {};
	const rt = isPlainObject(src.review_thresholds) ? src.review_thresholds : {};
	const sc = isPlainObject(src.scheduling) ? src.scheduling : {};
	const em = isPlainObject(src.email) ? src.email : {};
	const d = DEFAULT_ORG_SETTINGS;

	return {
		review_thresholds: {
			approve_to_advance: pickNumber(rt.approve_to_advance, d.review_thresholds.approve_to_advance),
			reject_to_deny: pickNumber(rt.reject_to_deny, d.review_thresholds.reject_to_deny),
			blinded_review: pickBool(rt.blinded_review, d.review_thresholds.blinded_review),
			weighted_scoring: pickBool(rt.weighted_scoring, d.review_thresholds.weighted_scoring)
		},
		scheduling: {
			default_algorithm: pickEnum(sc.default_algorithm, ALGORITHMS, d.scheduling.default_algorithm),
			buffer_minutes: pickNumber(sc.buffer_minutes, d.scheduling.buffer_minutes),
			exclude_advisors_from_r1: pickBool(
				sc.exclude_advisors_from_r1,
				d.scheduling.exclude_advisors_from_r1
			)
		},
		email: {
			auto_send_application_confirmation: pickBool(
				em.auto_send_application_confirmation,
				d.email.auto_send_application_confirmation
			),
			auto_send_auto_reject: pickBool(em.auto_send_auto_reject, d.email.auto_send_auto_reject),
			auto_send_interview_scheduled: pickBool(
				em.auto_send_interview_scheduled,
				d.email.auto_send_interview_scheduled
			),
			auto_send_decision_hire: pickBool(
				em.auto_send_decision_hire,
				d.email.auto_send_decision_hire
			),
			auto_send_decision_reject: pickBool(
				em.auto_send_decision_reject,
				d.email.auto_send_decision_reject
			),
			auto_send_decision_waitlist: pickBool(
				em.auto_send_decision_waitlist,
				d.email.auto_send_decision_waitlist
			),
			from_address: pickString(em.from_address, d.email.from_address),
			from_name: pickString(em.from_name, d.email.from_name)
		}
	};
}
