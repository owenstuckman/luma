-- Create storage bucket for organization assets (logos, etc.)
INSERT INTO storage.buckets (id, name, public) VALUES ('org-assets', 'org-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to their org's folder
CREATE POLICY "Authenticated users can upload org assets"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'org-assets'
    AND auth.role() = 'authenticated'
  );

-- Allow anyone to view org assets (public bucket)
CREATE POLICY "Anyone can view org assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'org-assets');

-- Allow authenticated users to update/delete their uploads
CREATE POLICY "Authenticated users can update org assets"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'org-assets'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Authenticated users can delete org assets"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'org-assets'
    AND auth.role() = 'authenticated'
  );
