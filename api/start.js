import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mcopfvshhvajrtgbqsem.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabase = SUPABASE_SERVICE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
}) : null;

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.socket?.remoteAddress || 'unknown';

    try {
        const body = req.body || {};
        const step = parseInt(body.step) || 1;

        if (!supabase) {
            return res.status(200).json({ success: true, message: 'No DB configured' });
        }

        // Generate unique token
        const token = Math.random().toString(36).substring(2) + Date.now().toString(36);

        // Store pending verification
        await supabase
            .from('link_verifications')
            .insert({
                ip_address: clientIP,
                step: step,
                token: token,
                status: 'pending',
                verified_at: new Date().toISOString(),
                expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 min expiry
                used: false
            });

        console.log(`🎫 Token created: IP=${clientIP}, step=${step}, token=${token.substring(0, 8)}...`);

        return res.status(200).json({
            success: true,
            token: token,
            message: 'Verification started'
        });

    } catch (error) {
        console.error('Start error:', error);
        return res.status(500).json({ success: false, error: 'Failed to start' });
    }
}
