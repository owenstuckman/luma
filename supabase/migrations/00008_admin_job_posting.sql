-- Admin: Create job posting as platform admin
-- Also add INSERT/UPDATE/DELETE policies for platform admins on job_posting

-- ============================================
-- RPC: Create job posting as platform admin
-- ============================================
CREATE OR REPLACE FUNCTION admin_create_job_posting(
  job_name text,
  job_description text DEFAULT '',
  job_owner text DEFAULT '',
  job_org_id bigint DEFAULT NULL,
  job_questions jsonb DEFAULT '{"steps":[]}'::jsonb,
  job_schedule jsonb DEFAULT '{}'::jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_job_id bigint;
BEGIN
  IF NOT is_platform_admin() THEN
    RETURN json_build_object('error', 'Not authorized');
  END IF;

  IF job_org_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organizations WHERE id = job_org_id) THEN
    RETURN json_build_object('error', 'Organization not found');
  END IF;

  INSERT INTO job_posting (name, description, owner, org_id, questions, schedule, active_flg)
    VALUES (job_name, job_description, job_owner, job_org_id, job_questions, job_schedule, false)
    RETURNING id INTO new_job_id;

  RETURN json_build_object('success', true, 'job_id', new_job_id);
END;
$$;

-- ============================================
-- Platform admin INSERT/UPDATE/DELETE policies for job_posting
-- ============================================
CREATE POLICY "Platform admins can insert job_postings"
  ON job_posting FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "Platform admins can update job_postings"
  ON job_posting FOR UPDATE TO authenticated
  USING (is_platform_admin());

CREATE POLICY "Platform admins can delete job_postings"
  ON job_posting FOR DELETE TO authenticated
  USING (is_platform_admin());
