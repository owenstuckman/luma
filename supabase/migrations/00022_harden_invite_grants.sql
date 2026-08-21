-- Tighten the grants around org_invites.
--
-- Two things Supabase does by default that the advisor (correctly) flags:
--
--  1. New tables in `public` inherit full CRUD grants for `anon` and
--     `authenticated`, leaving RLS as the only thing standing between an
--     anonymous request and the table. RLS *does* hold here — the SELECT policy
--     requires `has_org_role(org_id, 'admin')`, and there is no INSERT/UPDATE/
--     DELETE policy at all, so anon reads zero rows and writes nothing. But
--     `org_invites` stores join tokens, and "one policy away from leaking every
--     token" is not where that table should sit. Nothing needs direct DML on it:
--     every write goes through a SECURITY DEFINER function.
--
--  2. Functions are `EXECUTE`-able by PUBLIC unless revoked, so the GRANTs in
--     00021 added `authenticated` without removing `anon`. Each admin function
--     already fails closed for an anonymous caller (`has_org_role` resolves
--     `auth.uid()` to NULL), so this is defence in depth rather than a fix for a
--     live hole — but an anonymous role should not be able to reach an RPC named
--     `create_org_invite` at all.
--
-- `get_invite_details` deliberately KEEPS its anon grant: the invite landing page
-- has to render before the visitor has an account. That one is designed for
-- untrusted callers and returns strictly less than it knows.

REVOKE ALL ON public.org_invites FROM anon, authenticated;
GRANT SELECT ON public.org_invites TO authenticated; -- still filtered by RLS to org admins

REVOKE ALL ON FUNCTION public.create_org_invite(bigint, text, text, text[], integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_org_invite(bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_org_invites(bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_org_invite(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_org_invite(bigint, text, text, text[], integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_org_invite(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_invites(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_org_invite(text) TO authenticated;
