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

    if (!supabase) {
        return res.status(500).json({
            success: false,
            error: 'Server not configured'
        });
    }

    try {
        const body = req.body || {};
        const { token, session_id } = body;

        if (!token || !session_id) {
            return res.status(400).json({
                success: false,
                error: 'Missing token or session_id'
            });
        }

        const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
            req.socket?.remoteAddress || 'unknown';

        // Find and validate token
        const { data: tokenData, error: findError } = await supabase
            .from('verification_tokens')
            .select('*')
            .eq('token', token)
            .eq('session_id', session_id)
            .eq('used', false)
            .single();

        if (findError || !tokenData) {
            console.log(`❌ Invalid token attempt: ${token.substring(0, 8)}...`);
            return res.status(400).json({
                success: false,
                error: 'Invalid or expired token. Please start verification again.'
            });
        }

        // Check if token is expired
        if (new Date(tokenData.expires_at) < new Date()) {
            return res.status(400).json({
                success: false,
                error: 'Token expired. Please start verification again.'
            });
        }

        // Mark token as used
        const { error: updateError } = await supabase
            .from('verification_tokens')
            .update({
                used: true,
                used_at: new Date().toISOString(),
                used_ip: clientIP
            })
            .eq('token', token);

        if (updateError) {
            console.error('Token update error:', updateError);
            throw new Error('Failed to verify token');
        }

        console.log(`✅ Verified token for session ${session_id}, step ${tokenData.step}`);

        return res.status(200).json({
            success: true,
            plan: tokenData.plan,
            step: tokenData.step,
            message: 'Verification successful!'
        });

    } catch (error) {
        console.error('Verify token error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Verification failed'
        });
    }
}
