-- 00040: per-tenant images
--
-- Images used to ship in the repo (static/images/team/*), which tied the app to
-- one organization. They are now uploaded per tenant into the public
-- `org-assets` bucket (00012) and referenced by URL:
--
--   organizations.logo_url  — already existed
--   teams.image_url         — shown on the team picker of the application form
--   job_posting.image_url   — cover image at the top of a posting's form
--   question imageSrc       — `checkbox_image` questions (lives in the JSON)
--
-- Object paths are tenant-scoped:  orgs/<org_id>/<kind>/<file>
-- (logos keep their existing  logos/<org_id>/logo.<ext>).

ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.job_posting ADD COLUMN IF NOT EXISTS image_url text;

COMMENT ON COLUMN public.teams.image_url IS
  'Public URL of the team image (org-assets bucket). Null = no image.';
COMMENT ON COLUMN public.job_posting.image_url IS
  'Public URL of the posting cover image (org-assets bucket). Null = no image.';

-- ------------------------------------------------------------ storage writes
--
-- 00012 let ANY signed-in user insert, overwrite or delete ANY object in the
-- bucket — a recruiter in one org could replace another org's logo. Writes are
-- now limited to the org's own folder, by its admins (or a platform admin).
-- Reads stay public: these are public assets shown on public application forms.
-- The service role (used by `npm run tenant import`) bypasses RLS as before.

CREATE OR REPLACE FUNCTION public.can_write_org_asset(object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (storage.foldername(object_name))[1] IN ('logos', 'orgs')
    AND (storage.foldername(object_name))[2] ~ '^[0-9]+$'
    AND (
      public.has_org_role(((storage.foldername(object_name))[2])::bigint, 'admin'::org_role)
      OR public.is_platform_admin()
    );
$$;

REVOKE EXECUTE ON FUNCTION public.can_write_org_asset(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_write_org_asset(text) TO authenticated;

DROP POLICY IF EXISTS "Authenticated users can upload org assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update org assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete org assets" ON storage.objects;

CREATE POLICY "Org admins can upload org assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'org-assets' AND public.can_write_org_asset(name));

CREATE POLICY "Org admins can update org assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'org-assets' AND public.can_write_org_asset(name))
  WITH CHECK (bucket_id = 'org-assets' AND public.can_write_org_asset(name));

CREATE POLICY "Org admins can delete org assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'org-assets' AND public.can_write_org_asset(name));
