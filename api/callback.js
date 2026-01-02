import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mcopfvshhvajrtgbqsem.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabase = SUPABASE_SERVICE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
}) : null;

export default async function handler(req, res) {
    // Get step from URL
    const { step } = req.query;

    if (!step) {
        return res.redirect('/?error=missing_step');
    }

    const stepNum = parseInt(step);
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.socket?.remoteAddress || 'unknown';

    console.log(`📥 Callback: IP ${clientIP} completed step ${stepNum}`);

    if (supabase) {
        try {
            // Store verification in database
            await supabase
                .from('link_verifications')
                .insert({
                    ip_address: clientIP,
                    step: stepNum,
                    verified_at: new Date().toISOString(),
                    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 min expiry
                    used: false
                });

            console.log(`✅ Stored verification: IP ${clientIP}, step ${stepNum}`);
        } catch (error) {
            console.error('Failed to store verification:', error);
            // Continue anyway - redirect user
        }
    }

    // Redirect to homepage with verification status
    return res.redirect(`/?verified=${stepNum}`);
}
