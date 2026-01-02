import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mcopfvshhvajrtgbqsem.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabase = SUPABASE_SERVICE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
}) : null;

export default async function handler(req, res) {
    const { hours } = req.query;
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
    const hoursNum = parseInt(hours) || 1;

    console.log(`📥 CALLBACK: IP=${clientIP}, hours=${hoursNum}`);

    if (supabase) {
        try {
            // Find pending verification for this IP
            const { data, error } = await supabase
                .from('link_verifications')
                .select('*')
                .eq('ip_address', clientIP)
                .eq('status', 'pending')
                .gte('expires_at', new Date().toISOString())
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (error || !data) {
                console.log(`❌ No pending verification for IP ${clientIP}`);
                return res.redirect(`/?error=no_verification`);
            }

            // Mark as completed
            await supabase
                .from('link_verifications')
                .update({
                    status: 'completed',
                    completed_at: new Date().toISOString(),
                    hours: hoursNum  // Update with actual hours from callback
                })
                .eq('id', data.id);

            console.log(`✅ Verified: IP=${clientIP}, hours=${hoursNum}`);
        } catch (e) {
            console.error('Callback error:', e);
        }
    }

    // Redirect to success page with hours
    return res.redirect(`/?success=true&hours=${hoursNum}`);
}
