-- ═══════════════════════════════════════════════════════════════════
-- NineX Anti-Bypass System - UPDATED with Token System
-- Run this SQL in your Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- Drop old table if exists and create new one with token support
DROP TABLE IF EXISTS link_verifications;

CREATE TABLE link_verifications (
    id BIGSERIAL PRIMARY KEY,
    ip_address VARCHAR(64) NOT NULL,
    step INTEGER NOT NULL DEFAULT 1,
    token VARCHAR(64) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',  -- pending, completed
    verified_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    used_at TIMESTAMPTZ
);

-- Create indexes for fast lookups
CREATE INDEX idx_verifications_ip ON link_verifications(ip_address);
CREATE INDEX idx_verifications_status ON link_verifications(status);
CREATE INDEX idx_verifications_lookup ON link_verifications(ip_address, step, status, used, expires_at);

-- Enable Row Level Security
ALTER TABLE link_verifications ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role access" ON link_verifications
    FOR ALL USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════
-- Verify
-- ═══════════════════════════════════════════════════════════════════
SELECT 'link_verifications table created with token support!' AS status;
