-- ══════════════════════════════════════════════════════════════════════
-- NineX Verification System - Simple & Clean
-- Run this in Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════════════

-- Drop old table and create new one
DROP TABLE IF EXISTS link_verifications;

CREATE TABLE link_verifications (
    id BIGSERIAL PRIMARY KEY,
    ip_address VARCHAR(64) NOT NULL,
    hours INTEGER DEFAULT 1,
    status VARCHAR(20) DEFAULT 'pending',  -- pending, completed, used
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL
);

-- Create index for fast lookups
CREATE INDEX idx_verifications_lookup ON link_verifications(ip_address, status, expires_at);

-- Enable RLS
ALTER TABLE link_verifications ENABLE ROW LEVEL SECURITY;

-- Allow service role access
CREATE POLICY "Service access" ON link_verifications FOR ALL USING (true) WITH CHECK (true);

-- Verify
SELECT '✅ link_verifications table created!' AS result;
