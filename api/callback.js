import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mcopfvshhvajrtgbqsem.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabase = SUPABASE_SERVICE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
}) : null;

// Allowed referrer domains (shortener services)
const ALLOWED_REFERRERS = [
    'gplinks.co',
    'gplinks.in',
    'shrinkme.io',
    'linkvertise.com',
    'link-hub.net',
    'ouo.io',
    'exe.io'
];

function isValidReferrer(referer) {
    if (!referer) return false;
    try {
        const url = new URL(referer);
        return ALLOWED_REFERRERS.some(domain =>
            url.hostname === domain || url.hostname.endsWith('.' + domain)
        );
    } catch {
        return false;
    }
}

export default async function handler(req, res) {
    const { step } = req.query;

    if (!step) {
        return res.redirect('/?error=missing_step');
    }

    const stepNum = parseInt(step);
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.socket?.remoteAddress || 'unknown';
    const referer = req.headers['referer'] || req.headers['referrer'] || '';

    // ═══════════════════════════════════════════════════════════════
    // ANTI-BYPASS: Check if request came from allowed shortener
    // ═══════════════════════════════════════════════════════════════
    const validReferrer = isValidReferrer(referer);

    console.log(`📥 Callback: IP=${clientIP}, step=${stepNum}, referer=${referer}, valid=${validReferrer}`);

    // If referrer is not from shortener, don't store verification
    // But still redirect (to not reveal the check)
    if (!validReferrer) {
        console.log(`🚫 Blocked: Invalid referrer - not from shortener`);
        // Redirect without storing - acts like it worked but won't
        return res.redirect(`/?verified=${stepNum}`);
    }

    if (supabase) {
        try {
            await supabase
                .from('link_verifications')
                .insert({
                    ip_address: clientIP,
                    step: stepNum,
                    verified_at: new Date().toISOString(),
                    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
                    used: false,
                    referrer: referer.substring(0, 255)
                });

            console.log(`✅ Verified: IP ${clientIP}, step ${stepNum}`);
        } catch (error) {
            console.error('Verification storage failed:', error);
        }
    }

    return res.redirect(`/?verified=${stepNum}`);
}
