-- Member Management Functions
-- SECURITY DEFINER functions that join auth.users for email lookups

-- ============================================
-- Get org members with their emails
-- ============================================
CREATE OR REPLACE FUNCTION public.get_org_members_with_email(target_org_id bigint)
RETURNS TABLE(id bigint, created_at timestamptz, org_id bigint, user_id uuid, role org_role, email text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.created_at, m.org_id, m.user_id, m.role, u.email::text
  FROM public.org_members m
  JOIN auth.users u ON u.id = m.user_id
  WHERE m.org_id = target_org_id
  ORDER BY m.role, u.email;
$$;

-- ============================================
-- Invite a member by email
-- ============================================
CREATE OR REPLACE FUNCTION public.invite_member_by_email(
  target_org_id bigint,
  target_email text,
  target_role text DEFAULT 'recruiter'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user_id uuid;
BEGIN
  -- Find the user by email
  SELECT id INTO target_user_id FROM auth.users WHERE email = target_email;
  IF target_user_id IS NULL THEN
    RETURN json_build_object('error', 'No user found with email: ' || target_email);
  END IF;

  -- Check if already a member
  IF EXISTS (SELECT 1 FROM public.org_members WHERE org_id = target_org_id AND user_id = target_user_id) THEN
    RETURN json_build_object('error', 'User is already a member of this organization');
  END IF;

  -- Insert the member
  INSERT INTO public.org_members (org_id, user_id, role)
  VALUES (target_org_id, target_user_id, target_role::org_role);

  RETURN json_build_object('success', true);
END;
$$;

-- ============================================
-- Remove a member (cannot remove owners)
-- ============================================
CREATE OR REPLACE FUNCTION public.remove_org_member(
  target_org_id bigint,
  target_user_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Cannot remove owners
  IF EXISTS (SELECT 1 FROM public.org_members WHERE org_id = target_org_id AND user_id = target_user_id AND role = 'owner') THEN
    RETURN json_build_object('error', 'Cannot remove the owner');
  END IF;

  DELETE FROM public.org_members WHERE org_id = target_org_id AND user_id = target_user_id;
  RETURN json_build_object('success', true);
END;
$$;

-- ============================================
-- Update a member's role
-- ============================================
CREATE OR REPLACE FUNCTION public.update_member_role(
  target_org_id bigint,
  target_user_id uuid,
  new_role text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.org_members
  SET role = new_role::org_role
  WHERE org_id = target_org_id AND user_id = target_user_id;

  RETURN json_build_object('success', true);
END;
$$;
