-- V1: Question schema extensions
--
-- No DDL changes — `job_posting.questions` is already JSONB. This migration
-- documents the extended question shape that V1 code expects, and adds a
-- light structural CHECK to keep the column well-formed.
--
-- Extended FormQuestion shape (JSONB, per src/lib/types/index.ts):
--   {
--     id: string,                          -- existing
--     type: 'input' | 'textarea' | ...,    -- existing
--     title: string,                       -- existing
--     ...existing fields...
--
--     team_scope?: 'shared' | { teams: string[] },
--       -- 'shared' (default) = always visible.
--       -- { teams: ['infinitum', 'astra'] } = only shown when applicant
--       --   selected one of these team slugs in the team picker.
--
--     reject_if?: {
--       op: 'eq' | 'neq' | 'in' | 'not_in' | 'lt' | 'gt' | 'truthy' | 'falsy',
--       value?: unknown
--     }
--       -- If the rule fires on submit, the applicant is auto-set to status
--       -- 'denied' with metadata.auto_reject_reason naming this question id.
--
--     blinded?: boolean
--       -- When true, reviewer-role users see this field redacted on the
--       -- review page (used for name/email/year fields).
--   }
--
-- The CHECK below ensures `questions` is an object with a `steps` array if
-- non-empty. Forward-compatible: extra keys on questions are not validated.

DO $$ BEGIN
  ALTER TABLE public.job_posting
    ADD CONSTRAINT job_posting_questions_shape CHECK (
      questions IS NULL
      OR (jsonb_typeof(questions::jsonb) = 'object'
          AND (questions::jsonb ? 'steps' = false
               OR jsonb_typeof((questions::jsonb)->'steps') = 'array'))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
