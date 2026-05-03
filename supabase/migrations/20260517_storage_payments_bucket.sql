-- Create the 'payments' bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('payments', 'payments', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public access to read files in the 'payments' bucket
CREATE POLICY "Public Access" ON storage.objects
  FOR SELECT USING (bucket_id = 'payments');

-- Allow authenticated users to upload files to the 'payments' bucket
CREATE POLICY "Authenticated Upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'payments' 
    AND auth.role() = 'authenticated'
  );
