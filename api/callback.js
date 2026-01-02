import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mcopfvshhvajrtgbqsem.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabase = SUPABASE_SERVICE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
}) : null;

export default async function handler(req, res) {
    const { step } = req.query;

    if (!step) {
        return res.redirect('/?error=missing_step');
    }

    const stepNum = parseInt(step);
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.socket?.remoteAddress || 'unknown';

    console.log(`📥 Callback: IP=${clientIP}, step=${stepNum}`);

    if (!supabase) {
        return res.redirect(`/?verified=${stepNum}`);
    }

    try {
        // ═══════════════════════════════════════════════════════════
        // ANTI-BYPASS: Check if this IP has a PENDING token for this step
        // Token must be created within last 5 minutes
        // ═══════════════════════════════════════════════════════════
        const { data: pendingToken, error: findError } = await supabase
            .from('link_verifications')
            .select('*')
            .eq('ip_address', clientIP)
            .eq('step', stepNum)
            .eq('status', 'pending')
            .eq('used', false)
            .gte('expires_at', new Date().toISOString())
            .order('verified_at', { ascending: false })
            .limit(1)
            .single();

        if (findError || !pendingToken) {
            console.log(`🚫 BLOCKED: No pending token for IP ${clientIP}, step ${stepNum}`);
            // Silently redirect but don't mark as verified
            // User will see "verified" but key generation will fail
            return res.redirect(`/?error=no_pending`);
        }

        // Update token status to "completed"
        await supabase
            .from('link_verifications')
            .update({
                status: 'completed',
                completed_at: new Date().toISOString()
            })
            .eq('id', pendingToken.id);

        console.log(`✅ VERIFIED: IP ${clientIP}, step ${stepNum}, token ${pendingToken.token.substring(0, 8)}...`);

        return res.redirect(`/?verified=${stepNum}`);

    } catch (error) {
        console.error('Callback error:', error);
        return res.redirect('/?error=server_error');
    }
}
