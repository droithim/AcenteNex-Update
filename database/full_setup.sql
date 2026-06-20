-- Acentenex Database Schema & Security Policies

-- Enable RLS
ALTER TABLE musteriler ENABLE ROW LEVEL SECURITY;
ALTER TABLE policeler ENABLE ROW LEVEL SECURITY;

-- Policies (Ensure users only see their own data based on licenseKey or auth.uid)
CREATE POLICY "Users can only access their own customers" 
ON musteriler FOR ALL 
USING (auth.uid() = user_id);

-- Constraints
ALTER TABLE policeler ADD CONSTRAINT unique_police_no UNIQUE (police_no);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_musteri_ad_soyad ON musteriler (ad, soyad);
CREATE INDEX IF NOT EXISTS idx_police_no ON policeler (police_no);
