-- V1: Multi-role membership
-- The original `org_members.role` is a single enum (owner|admin|recruiter|viewer).
-- V1 introduces additional roles (advisor, eboard, reviewer) and lets a user
-- hold multiple roles at once (e.g., advisor + interviewer). We add a `roles`
-- text[] alongside the existing column; the singular `role` stays as the
-- primary org-permission role (used by has_org_role / RLS), and `roles`
-- carries the app-level fine-grained role set.
--
-- Allowed values in `roles` (validated in app code, not DB enum, to keep this
-- forward-compatible):
--   'owner', 'admin', 'eboard', 'advisor', 'interviewer', 'reviewer', 'viewer'
--
-- The existing 'recruiter' enum value is preserved as an alias for
-- 'interviewer' on the legacy column.

ALTER TABLE public.org_members
  ADD COLUMN IF NOT EXISTS roles text[] NOT NULL DEFAULT ARRAY[]::text[];

-- Backfill: any member without an entry in `roles` gets seeded from `role`.
-- 'recruiter' (legacy) → both 'interviewer' and 'recruiter' for back-compat.
UPDATE public.org_members
SET roles = CASE
  WHEN role::text = 'recruiter' THEN ARRAY['interviewer', 'recruiter']
  ELSE ARRAY[role::text]
END
WHERE cardinality(roles) = 0;

CREATE INDEX IF NOT EXISTS idx_org_members_roles ON public.org_members USING GIN (roles);

-- Helper: does the calling user hold a specific app-level role in org?
CREATE OR REPLACE FUNCTION public.has_app_role(check_org_id bigint, role_name text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = check_org_id
      AND user_id = auth.uid()
      AND (role_name = ANY(roles) OR role::text = role_name)
  );
$$;
