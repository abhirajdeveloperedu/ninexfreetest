import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mcopfvshhvajrtgbqsem.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabase = SUPABASE_SERVICE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
}) : null;

function randomString(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
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
            error: 'Server not configured. Set SUPABASE_SERVICE_KEY.'
        });
    }

    const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.socket?.remoteAddress || 'unknown';

    try {
        const body = req.body || {};
        let hours = parseInt(body.hours) || 1;
        if (hours < 1) hours = 1;
        if (hours > 2) hours = 2;

        // ═══════════════════════════════════════════════════════════
        // ANTI-BYPASS: Verify IP completed the shortener
        // ═══════════════════════════════════════════════════════════
        const requiredStep = hours; // 1-hour needs step 1, 2-hours needs step 2

        const { data: verification, error: verifyError } = await supabase
            .from('link_verifications')
            .select('*')
            .eq('ip_address', clientIP)
            .eq('step', requiredStep)
            .eq('used', false)
            .gte('expires_at', new Date().toISOString())
            .order('verified_at', { ascending: false })
            .limit(1)
            .single();

        if (verifyError || !verification) {
            console.log(`🚫 Anti-bypass blocked: IP ${clientIP} - no valid verification for step ${requiredStep}`);
            return res.status(403).json({
                success: false,
                error: 'Please complete the verification link first. No valid verification found.'
            });
        }

        // Mark verification as used
        await supabase
            .from('link_verifications')
            .update({ used: true, used_at: new Date().toISOString() })
            .eq('id', verification.id);

        console.log(`✅ Anti-bypass passed: IP ${clientIP} verified for ${hours}h`);

        // ═══════════════════════════════════════════════════════════
        // Generate the key
        // ═══════════════════════════════════════════════════════════
        const timestamp = Date.now().toString(36);
        const username = `trial_${timestamp}${randomString(4)}`;
        const password = randomString(8);

        // Hash password
        const { data: passwordHash, error: hashError } = await supabase.rpc('hash_password', {
            password: password
        });

        if (hashError) {
            console.error('Hash error:', hashError);
            throw new Error('Password hashing failed');
        }

        // Calculate expiry
        const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

        // Create user
        const { error: createError } = await supabase
            .from('users')
            .insert({
                username: username,
                password_hash: passwordHash,
                account_type: 'user',
                device_type: 'single',
                purchased_days: 0,
                first_login_at: new Date().toISOString(),
                expires_at: expiresAt.toISOString(),
                is_active: true,
                is_banned: false,
                payment_status: 'trial',
                notes: `Trial ${hours}h | IP: ${clientIP} | Anti-bypass verified`
            });

        if (createError) {
            console.error('Create error:', createError);
            throw new Error('Failed to create user');
        }

        console.log(`🎉 Generated ${hours}h key: ${username} for IP ${clientIP}`);

        return res.status(200).json({
            success: true,
            username: username,
            password: password,
            hours: hours,
            expires_at: expiresAt.toISOString()
        });

    } catch (error) {
        console.error('Generate error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to generate key. Try again.'
        });
    }
}
