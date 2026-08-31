-- Auth/authorization hardening pass. Three things, all found in the 2026-08-30
-- audits and left open until now.

-- ---------------------------------------------------------------------------
-- 1. Atomic org registration
--
-- /register did two unguarded client inserts: `organizations`, then
-- `org_members`. If the second failed the org existed with NO owner row, which
-- is unrecoverable from the UI — nobody can administer it and the slug is
-- taken. One SECURITY DEFINER function makes it a single transaction.
--
-- It also enforces a reserved-slug list. Slugs currently only appear under
-- /apply/[slug] and /private/[slug] so nothing collides today, but an org
-- called "auth" or "admin" is a phishing-shaped footgun the moment a bare
-- /[slug] route is ever added.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_organization(
  org_name text,
  org_slug text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  clean_slug text;
  new_org_id bigint;
BEGIN
  IF caller IS NULL THEN
    RETURN json_build_object('error', 'You must be signed in to create an organization.');
  END IF;

  clean_slug := lower(trim(org_slug));

  IF clean_slug !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' THEN
    RETURN json_build_object('error', 'Slug may only contain lowercase letters, numbers and hyphens.');
  END IF;

  IF length(clean_slug) < 2 OR length(clean_slug) > 40 THEN
    RETURN json_build_object('error', 'Slug must be between 2 and 40 characters.');
  END IF;

  IF clean_slug IN (
    'admin','auth','api','apply','invite','private','register','login','logout',
    'signup','settings','dashboard','static','assets','images','public','new','edit'
  ) THEN
    RETURN json_build_object('error', 'That URL is reserved. Please choose another.');
  END IF;

  IF coalesce(trim(org_name), '') = '' THEN
    RETURN json_build_object('error', 'Organization name is required.');
  END IF;

  INSERT INTO public.organizations (name, slug, owner_id)
  VALUES (trim(org_name), clean_slug, caller)
  RETURNING id INTO new_org_id;

  INSERT INTO public.org_members (org_id, user_id, role, roles)
  VALUES (new_org_id, caller, 'owner', ARRAY['owner']::text[]);

  RETURN json_build_object('success', true, 'org_id', new_org_id, 'slug', clean_slug);
EXCEPTION
  WHEN unique_violation THEN
    -- Both inserts roll back together, so no half-created org survives.
    RETURN json_build_object('error', 'That URL slug is already taken. Please choose a different name.');
END;
$$;

REVOKE ALL ON FUNCTION public.register_organization(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_organization(text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Keep `role` and `roles[]` in agreement
--
-- `has_org_role()` (every org permission) reads only the singular `role`.
-- `has_app_role()` reads `roles[] OR role`. They drifted: org 2 had an admin
-- whose roles[] was ['admin'], so has_app_role(2,'interviewer') was false even
-- though they hold full admin authority. A feature gated on roles[] would
-- silently under-grant admins.
--
-- `role` stays authoritative for org permissions. These writers now keep
-- roles[] containing at least the org role, so the two can't disagree.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_member_role(
  target_org_id bigint,
  target_user_id uuid,
  new_role org_role
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_org_role(target_org_id, 'admin') THEN
    RETURN json_build_object('error', 'Not authorized');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = target_org_id AND user_id = target_user_id AND role = 'owner'
  ) THEN
    RETURN json_build_object('error', 'Cannot change the owner role.');
  END IF;

  IF new_role = 'owner' AND NOT public.has_org_role(target_org_id, 'owner') THEN
    RETURN json_build_object('error', 'Only the owner can transfer ownership.');
  END IF;

  UPDATE public.org_members
  SET role = new_role,
      -- Drop any stale org-role entries, keep non-org app roles (e.g.
      -- 'interviewer', 'advisor'), then add the new one.
      roles = (
        SELECT array_agg(DISTINCT r)
        FROM unnest(
          array_remove(
            array_remove(
              array_remove(array_remove(roles, 'owner'), 'admin'),
              'recruiter'),
            'viewer')
          || ARRAY[new_role::text]
        ) AS r
      )
  WHERE org_id = target_org_id AND user_id = target_user_id;

  RETURN json_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.invite_member_by_email(
  target_org_id bigint,
  target_email text,
  target_role org_role DEFAULT 'recruiter'::org_role
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user_id uuid;
BEGIN
  IF NOT public.has_org_role(target_org_id, 'admin') THEN
    RETURN json_build_object('error', 'Not authorized');
  END IF;

  IF target_role = 'owner' AND NOT public.has_org_role(target_org_id, 'owner') THEN
    RETURN json_build_object('error', 'Only the owner can grant owner access.');
  END IF;

  SELECT id INTO target_user_id FROM auth.users WHERE lower(email) = lower(target_email);

  IF target_user_id IS NULL THEN
    RETURN json_build_object('error', 'No user found with that email. They must sign up first.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.org_members WHERE org_id = target_org_id AND user_id = target_user_id
  ) THEN
    RETURN json_build_object('error', 'User is already a member of this organization.');
  END IF;

  -- roles[] seeded to match, rather than left empty as before.
  INSERT INTO public.org_members (org_id, user_id, role, roles)
  VALUES (target_org_id, target_user_id, target_role, ARRAY[target_role::text]);

  RETURN json_build_object('success', true, 'user_id', target_user_id);
END;
$$;

-- Backfill the existing drift so the invariant holds for current rows too.
UPDATE public.org_members
SET roles = (
  SELECT array_agg(DISTINCT r)
  FROM unnest(roles || ARRAY[role::text]) AS r
)
WHERE NOT (role::text = ANY(roles));
