-- Email log table for tracking sent notifications
CREATE TABLE public.email_log (
  id          bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  org_id      bigint REFERENCES organizations(id) ON DELETE CASCADE,
  interview_id bigint REFERENCES interviews(id) ON DELETE SET NULL,
  recipient   text NOT NULL,
  type        text NOT NULL,  -- 'applicant_confirmation' | 'interviewer_schedule' | 'applicant_reminder' | 'interviewer_reminder'
  provider_id text,           -- Resend message ID
  status      text NOT NULL DEFAULT 'sent',  -- 'sent' | 'failed'
  error       text
);

ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can view email log"
  ON public.email_log FOR SELECT
  USING (is_org_member(org_id));

-- email_settings per org (stored as JSONB on organizations)
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS email_settings jsonb NOT NULL DEFAULT '{}';
