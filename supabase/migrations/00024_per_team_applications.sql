-- V1: One application per team
--
-- Until now a single `applicants` row carried `selected_team_slugs = {team-a,
-- team-b}` — one application tagged with several teams. That conflates things
-- that are genuinely separate: each team reviews, interviews and decides on its
-- own, and a candidate can be a strong fit for one and a poor fit for another.
--
-- From here a submission is SPLIT: picking two teams creates two rows, each
-- with its own `team_id`, its own status, and only the answers that team asked
-- for. `submission_group` ties the siblings together for auditing without the
-- reviewer UI ever presenting them as one combined application.

ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS team_id bigint REFERENCES public.teams(id) ON DELETE SET NULL;

ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS submission_group uuid;

CREATE INDEX IF NOT EXISTS idx_applicants_team_id ON public.applicants(team_id);
CREATE INDEX IF NOT EXISTS idx_applicants_submission_group
  ON public.applicants(submission_group);

-- Backfill only the rows where the mapping is unambiguous: exactly one slug.
-- Historical multi-team rows are deliberately LEFT ALONE — splitting them here
-- would have to invent which answers belonged to which team, and the per-team
-- essays those rows would need were never collected. They keep their array and
-- render as a legacy multi-team application.
UPDATE public.applicants a
SET team_id = t.id
FROM public.teams t
WHERE a.team_id IS NULL
  AND a.org_id = t.org_id
  AND array_length(a.selected_team_slugs, 1) = 1
  AND a.selected_team_slugs[1] = t.slug;

-- Applicant email-domain restriction lives in
-- `organizations.settings.application.email_domain` (null = unrestricted) and is
-- set per org in Org Settings → Recruiting Rules.

-- Example form: docs/examples/tenant/tenant.json shows the three schema
-- features this model adds — `team_scope: {"teams": [...]}`, `reject_if` (denies
-- only THAT team's application), and `team_scope: {"per_team": true}`.
