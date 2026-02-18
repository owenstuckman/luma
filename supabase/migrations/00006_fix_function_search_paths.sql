-- Fix search_path on all functions to prevent search path injection

ALTER FUNCTION is_platform_admin() SET search_path = public;
ALTER FUNCTION is_org_member(bigint) SET search_path = public;
ALTER FUNCTION has_org_role(bigint, org_role) SET search_path = public;
ALTER FUNCTION invite_member_by_email(bigint, text, org_role) SET search_path = public;
ALTER FUNCTION get_org_members_with_email(bigint) SET search_path = public;
ALTER FUNCTION remove_org_member(bigint, uuid) SET search_path = public;
ALTER FUNCTION update_member_role(bigint, uuid, org_role) SET search_path = public;
