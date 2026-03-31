-- Storage Policy: Allow public upload/read/delete on qris bucket
-- Run this in Supabase SQL Editor

-- Allow anyone to upload files to the qris bucket
CREATE POLICY "Allow public upload to qris"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'qris');

-- Allow anyone to read files from the qris bucket  
CREATE POLICY "Allow public read from qris"
ON storage.objects
FOR SELECT
USING (bucket_id = 'qris');

-- Allow anyone to update files in the qris bucket
CREATE POLICY "Allow public update qris"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'qris');

-- Allow anyone to delete files from the qris bucket
CREATE POLICY "Allow public delete from qris"
ON storage.objects
FOR DELETE
USING (bucket_id = 'qris');

-- Also add policies for receipts bucket if not already set
CREATE POLICY "Allow public upload to receipts"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'receipts');

CREATE POLICY "Allow public read from receipts"
ON storage.objects
FOR SELECT
USING (bucket_id = 'receipts');

CREATE POLICY "Allow public update receipts"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'receipts');

CREATE POLICY "Allow public delete from receipts"
ON storage.objects
FOR DELETE
USING (bucket_id = 'receipts');
