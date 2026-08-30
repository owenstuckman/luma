-- V1: One application per team
--
-- Until now a single `applicants` row carried `selected_team_slugs = {astra,
-- terra}` — one application tagged with several teams. That conflates things
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

-- Restrict applicant addresses to one domain for Archimedes (a VT club).
-- Generic: any org can set `settings.application.email_domain`, and null (the
-- default for every other org) means no restriction.
UPDATE public.organizations
SET settings = jsonb_set(
      coalesce(settings::jsonb, '{}'::jsonb),
      '{application}',
      coalesce((settings::jsonb)->'application', '{}'::jsonb) || '{"email_domain": "vt.edu"}'::jsonb,
      true
    )
WHERE slug = 'archimedes';

-- Seed the 2026 Fall Recruitment form.
--
-- Three things in this schema are worth reading as the reference example for
-- other orgs:
--   * `team_scope: {"teams": [...]}`  — asked only of applicants to that team.
--   * `reject_if`                     — auto-denies THAT team's application
--                                       only; the sibling rows are unaffected.
--   * `team_scope: {"per_team": true}` — asked once per team the applicant
--                                       picked, with {team} substituted. This
--                                       is how "why this team?" gets a distinct
--                                       answer on every application.
INSERT INTO public.job_posting (name, owner, questions, scheduled, schedule, active_flg, description, org_id)
SELECT
  '2026 Fall Recruitment',
  o.slug,
  '{
    "steps": [
      {
        "title": "Academics",
        "icon": "fi-br-graduation-cap",
        "questions": [
          {
            "id": "major",
            "type": "input",
            "title": "What is your major?",
            "subtitle": "Include a second major or minor here if you have one.",
            "placeholder": "e.g. Aerospace Engineering",
            "required": true,
            "maxLength": 120
          },
          {
            "id": "graduation_year",
            "type": "dropdown",
            "title": "Expected graduation year",
            "options": ["2026", "2027", "2028", "2029", "2030", "Other"],
            "required": true,
            "blinded": true
          }
        ]
      },
      {
        "title": "Eligibility",
        "icon": "fi-br-shield-check",
        "questions": [
          {
            "id": "astra_us_person",
            "type": "radio",
            "title": "Are you a U.S. citizen or permanent resident?",
            "subtitle": "Asked only for Astra, and only affects your Astra application.",
            "options": ["Yes", "No"],
            "required": true,
            "team_scope": { "teams": ["astra"] },
            "reject_if": { "op": "eq", "value": "No" }
          },
          {
            "id": "infinitum_age",
            "type": "radio",
            "title": "Are you 18 years of age or older?",
            "subtitle": "Asked only for Infinitum, and only affects your Infinitum application.",
            "options": ["Yes", "No"],
            "required": true,
            "team_scope": { "teams": ["infinitum"] },
            "reject_if": { "op": "eq", "value": "No" }
          }
        ]
      },
      {
        "title": "Your Interest",
        "icon": "fi-br-comment-heart",
        "questions": [
          {
            "id": "why_archimedes",
            "type": "textarea",
            "title": "Why are you interested in Archimedes?",
            "subtitle": "Tell us what draws you to the society as a whole.",
            "placeholder": "A few sentences is plenty.",
            "required": true,
            "maxLength": 2000
          },
          {
            "id": "why_team",
            "type": "textarea",
            "title": "Why are you interested in {team}?",
            "subtitle": "You answer this separately for every team you apply to.",
            "placeholder": "What draws you to {team} specifically?",
            "required": true,
            "maxLength": 2000,
            "team_scope": { "per_team": true }
          }
        ]
      }
    ]
  }'::json,
  false,
  '{}'::json,
  true,
  'Applications for Fall 2026. Choose any teams you would like to be considered for — each team reviews its own application separately.',
  o.id
FROM public.organizations o
WHERE o.slug = 'archimedes'
  AND NOT EXISTS (
    SELECT 1 FROM public.job_posting j
    WHERE j.org_id = o.id AND j.name = '2026 Fall Recruitment'
  );
