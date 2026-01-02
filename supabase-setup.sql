-- ═══════════════════════════════════════════════════════════════════
-- NineX Anti-Bypass System - Link Verifications Table
-- Run this SQL in your Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- Create the link_verifications table
CREATE TABLE IF NOT EXISTS link_verifications (
    id BIGSERIAL PRIMARY KEY,
    ip_address VARCHAR(64) NOT NULL,
    step INTEGER NOT NULL DEFAULT 1,
    verified_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    used_at TIMESTAMPTZ
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_link_verifications_ip ON link_verifications(ip_address);
CREATE INDEX IF NOT EXISTS idx_link_verifications_step ON link_verifications(step);
CREATE INDEX IF NOT EXISTS idx_link_verifications_expires ON link_verifications(expires_at);
CREATE INDEX IF NOT EXISTS idx_link_verifications_used ON link_verifications(used);

-- Combined index for the main query
CREATE INDEX IF NOT EXISTS idx_link_verifications_lookup 
ON link_verifications(ip_address, step, used, expires_at);

-- Enable Row Level Security
ALTER TABLE link_verifications ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role can manage verifications" ON link_verifications
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════
-- Optional: Auto-cleanup old records (run manually or as cron)
-- ═══════════════════════════════════════════════════════════════════
-- DELETE FROM link_verifications WHERE expires_at < NOW() - INTERVAL '1 hour';

-- ═══════════════════════════════════════════════════════════════════
-- Verify table creation
-- ═══════════════════════════════════════════════════════════════════
SELECT 'link_verifications table created successfully!' AS status;
