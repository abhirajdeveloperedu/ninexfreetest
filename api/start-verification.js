import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mcopfvshhvajrtgbqsem.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabase = SUPABASE_SERVICE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
}) : null;

// Generate secure random token
function generateToken() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 32; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
}

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

    if (!supabase) {
        return res.status(500).json({
            success: false,
            error: 'Server not configured'
        });
    }

    try {
        const body = req.body || {};
        const { plan, step, session_id } = body;

        // Validate input
        if (!plan || !step || !session_id) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: plan, step, session_id'
            });
        }

        const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
            req.socket?.remoteAddress || 'unknown';

        // Generate unique token
        const token = generateToken();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

        // Store token in database
        const { error: insertError } = await supabase
            .from('verification_tokens')
            .insert({
                token: token,
                session_id: session_id,
                plan: parseInt(plan),
                step: parseInt(step),
                ip_address: clientIP,
                created_at: new Date().toISOString(),
                expires_at: expiresAt.toISOString(),
                used: false
            });

        if (insertError) {
            console.error('Token insert error:', insertError);
            throw new Error('Failed to create verification token');
        }

        console.log(`🔑 Created token for session ${session_id}, step ${step}`);

        return res.status(200).json({
            success: true,
            token: token,
            expires_at: expiresAt.toISOString()
        });

    } catch (error) {
        console.error('Start verification error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to start verification'
        });
    }
}
