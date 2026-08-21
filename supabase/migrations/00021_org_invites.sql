-- V1: Self-serve org invite links
--
-- Before this migration the only way to add someone to an org was
-- `invite_member_by_email()`, which requires the person to ALREADY have an
-- account — it looks them up in auth.users and fails if they aren't there.
-- That makes onboarding a new recruiter a two-step dance: "go sign up, tell me
-- when you're done, then I'll add you."
--
-- `org_invites` stores a shareable token instead. An admin creates one, sends
-- the link, and the recipient signs up (or logs in) and is joined to the org
-- automatically. Two shapes:
--   * email-bound  (email IS NOT NULL, max_uses = 1) — only that address can accept
--   * open link    (email IS NULL, max_uses = N)     — anyone with the link, N times
--
-- Tokens are 64 hex chars (256 bits) from two gen_random_uuid() calls, so no
-- pgcrypto dependency. The table is never read directly by the accept flow —
-- everything goes through the SECURITY DEFINER functions below, because the
-- person accepting is by definition not yet a member and RLS would hide it.

CREATE TABLE IF NOT EXISTS public.org_invites (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id bigint NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  email text,
  role org_role NOT NULL DEFAULT 'recruiter',
  roles text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '14 days',
  max_uses integer NOT NULL DEFAULT 1,
  used_count integer NOT NULL DEFAULT 0,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_org_invites_org_id ON public.org_invites (org_id);
CREATE INDEX IF NOT EXISTS idx_org_invites_token ON public.org_invites (token);

ALTER TABLE public.org_invites ENABLE ROW LEVEL SECURITY;

-- Admins and owners can see their own org's invites. Nobody writes directly;
-- creation/revocation/acceptance all go through the functions below.
DROP POLICY IF EXISTS "Org admins can view invites" ON public.org_invites;
CREATE POLICY "Org admins can view invites"
  ON public.org_invites FOR SELECT
  USING (public.has_org_role(org_id, 'admin'::org_role));

-- ============================================
-- Create an invite
-- ============================================
CREATE OR REPLACE FUNCTION public.create_org_invite(
  target_org_id bigint,
  target_email text DEFAULT NULL,
  target_role text DEFAULT 'recruiter',
  target_roles text[] DEFAULT ARRAY[]::text[],
  expires_in_days integer DEFAULT 14,
  target_max_uses integer DEFAULT 1
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_token text;
  normalized_email text;
  new_row public.org_invites;
BEGIN
  IF NOT public.has_org_role(target_org_id, 'admin'::org_role) THEN
    RETURN json_build_object('error', 'Only owners and admins can create invites');
  END IF;

  -- Never let an invite hand out more power than the caller has.
  IF target_role = 'owner' AND NOT public.has_org_role(target_org_id, 'owner'::org_role) THEN
    RETURN json_build_object('error', 'Only an owner can invite another owner');
  END IF;

  normalized_email := NULLIF(lower(trim(COALESCE(target_email, ''))), '');

  IF normalized_email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.org_members m
    JOIN auth.users u ON u.id = m.user_id
    WHERE m.org_id = target_org_id AND lower(u.email) = normalized_email
  ) THEN
    RETURN json_build_object('error', 'That person is already a member of this organization');
  END IF;

  new_token := replace(gen_random_uuid()::text, '-', '')
            || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.org_invites (
    org_id, token, email, role, roles, created_by, expires_at, max_uses
  ) VALUES (
    target_org_id,
    new_token,
    normalized_email,
    target_role::org_role,
    COALESCE(target_roles, ARRAY[]::text[]),
    auth.uid(),
    now() + (GREATEST(expires_in_days, 1) || ' days')::interval,
    GREATEST(COALESCE(target_max_uses, 1), 1)
  )
  RETURNING * INTO new_row;

  RETURN json_build_object(
    'success', true,
    'token', new_row.token,
    'expires_at', new_row.expires_at
  );
END;
$$;

-- ============================================
-- Look up an invite by token (pre-login — callable by anon)
-- ============================================
-- Returns only what the landing page needs to render "You've been invited to
-- join <org>". Deliberately does NOT leak the invited email address to an
-- unauthenticated caller who guessed a token.
CREATE OR REPLACE FUNCTION public.get_invite_details(invite_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.org_invites;
  org public.organizations;
BEGIN
  SELECT * INTO inv FROM public.org_invites WHERE token = invite_token;
  IF inv.id IS NULL THEN
    RETURN json_build_object('valid', false, 'reason', 'not_found');
  END IF;

  SELECT * INTO org FROM public.organizations WHERE id = inv.org_id;

  IF inv.revoked_at IS NOT NULL THEN
    RETURN json_build_object('valid', false, 'reason', 'revoked', 'org_name', org.name);
  END IF;
  IF inv.expires_at < now() THEN
    RETURN json_build_object('valid', false, 'reason', 'expired', 'org_name', org.name);
  END IF;
  IF inv.used_count >= inv.max_uses THEN
    RETURN json_build_object('valid', false, 'reason', 'used_up', 'org_name', org.name);
  END IF;

  RETURN json_build_object(
    'valid', true,
    'org_name', org.name,
    'org_slug', org.slug,
    'logo_url', org.logo_url,
    'role', inv.role,
    'requires_email', inv.email IS NOT NULL,
    'expires_at', inv.expires_at
  );
END;
$$;

-- ============================================
-- Accept an invite (requires a logged-in user)
-- ============================================
CREATE OR REPLACE FUNCTION public.accept_org_invite(invite_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.org_invites;
  org_slug text;
  caller_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'You must be signed in to accept an invite');
  END IF;

  -- Lock the row so two simultaneous accepts can't both slip past max_uses.
  SELECT * INTO inv FROM public.org_invites WHERE token = invite_token FOR UPDATE;
  IF inv.id IS NULL THEN
    RETURN json_build_object('error', 'This invite link is not valid');
  END IF;

  SELECT slug INTO org_slug FROM public.organizations WHERE id = inv.org_id;

  IF inv.revoked_at IS NOT NULL THEN
    RETURN json_build_object('error', 'This invite has been revoked');
  END IF;
  IF inv.expires_at < now() THEN
    RETURN json_build_object('error', 'This invite has expired');
  END IF;
  IF inv.used_count >= inv.max_uses THEN
    RETURN json_build_object('error', 'This invite has already been used');
  END IF;

  SELECT lower(email) INTO caller_email FROM auth.users WHERE id = auth.uid();

  IF inv.email IS NOT NULL AND inv.email <> caller_email THEN
    RETURN json_build_object(
      'error', 'This invite was sent to ' || inv.email || '. Sign in with that address to accept it.'
    );
  END IF;

  -- Already a member: treat as success so a double-click on the link is
  -- harmless, but don't burn a use.
  IF EXISTS (
    SELECT 1 FROM public.org_members WHERE org_id = inv.org_id AND user_id = auth.uid()
  ) THEN
    RETURN json_build_object('success', true, 'already_member', true, 'slug', org_slug);
  END IF;

  INSERT INTO public.org_members (org_id, user_id, role, roles)
  VALUES (
    inv.org_id,
    auth.uid(),
    inv.role,
    CASE WHEN cardinality(inv.roles) > 0 THEN inv.roles ELSE ARRAY[inv.role::text] END
  );

  UPDATE public.org_invites SET used_count = used_count + 1 WHERE id = inv.id;

  RETURN json_build_object('success', true, 'already_member', false, 'slug', org_slug);
END;
$$;

-- ============================================
-- Revoke an invite
-- ============================================
CREATE OR REPLACE FUNCTION public.revoke_org_invite(invite_id bigint)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.org_invites;
BEGIN
  SELECT * INTO inv FROM public.org_invites WHERE id = invite_id;
  IF inv.id IS NULL THEN
    RETURN json_build_object('error', 'Invite not found');
  END IF;
  IF NOT public.has_org_role(inv.org_id, 'admin'::org_role) THEN
    RETURN json_build_object('error', 'Only owners and admins can revoke invites');
  END IF;

  UPDATE public.org_invites SET revoked_at = now() WHERE id = invite_id;
  RETURN json_build_object('success', true);
END;
$$;

-- ============================================
-- List an org's invites (with creator email)
-- ============================================
CREATE OR REPLACE FUNCTION public.get_org_invites(target_org_id bigint)
RETURNS TABLE(
  id bigint,
  created_at timestamptz,
  token text,
  email text,
  role org_role,
  roles text[],
  expires_at timestamptz,
  max_uses integer,
  used_count integer,
  revoked_at timestamptz,
  created_by_email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_org_role(target_org_id, 'admin'::org_role) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT i.id, i.created_at, i.token, i.email, i.role, i.roles,
         i.expires_at, i.max_uses, i.used_count, i.revoked_at,
         u.email::text
  FROM public.org_invites i
  LEFT JOIN auth.users u ON u.id = i.created_by
  WHERE i.org_id = target_org_id
  ORDER BY i.created_at DESC;
END;
$$;

-- The landing page must render before the visitor has an account.
GRANT EXECUTE ON FUNCTION public.get_invite_details(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_org_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_org_invite(bigint, text, text, text[], integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_org_invite(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_invites(bigint) TO authenticated;
