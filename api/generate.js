import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mcopfvshhvajrtgbqsem.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabase = SUPABASE_SERVICE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
}) : null;

function randomString(len) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let r = '';
    for (let i = 0; i < len; i++) r += chars[Math.floor(Math.random() * chars.length)];
    return r;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
    if (!supabase) return res.status(500).json({ success: false, error: 'Server not configured' });

    const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
    const body = req.body || {};
    let hours = parseInt(body.hours) || 1;
    if (hours < 1) hours = 1;
    if (hours > 2) hours = 2;

    console.log(`🔑 GENERATE: IP=${clientIP}, hours=${hours}`);

    try {
        // Check for completed verification
        const { data: verification, error: verifyErr } = await supabase
            .from('link_verifications')
            .select('*')
            .eq('ip_address', clientIP)
            .eq('status', 'completed')
            .gte('expires_at', new Date().toISOString())
            .order('completed_at', { ascending: false })
            .limit(1)
            .single();

        if (verifyErr || !verification) {
            console.log(`🚫 BLOCKED: No completed verification for IP ${clientIP}`);
            return res.status(403).json({
                success: false,
                error: 'Please complete the verification link first!'
            });
        }

        // Use hours from verification if available
        const keyHours = verification.hours || hours;

        // Mark verification as used
        await supabase
            .from('link_verifications')
            .update({ status: 'used', used_at: new Date().toISOString() })
            .eq('id', verification.id);

        // Generate key
        const username = `trial_${Date.now().toString(36)}${randomString(4)}`;
        const password = randomString(8);

        const { data: hash, error: hashErr } = await supabase.rpc('hash_password', { password });
        if (hashErr) throw hashErr;

        const expiresAt = new Date(Date.now() + keyHours * 60 * 60 * 1000);

        const { error: createErr } = await supabase.from('users').insert({
            username,
            password_hash: hash,
            account_type: 'user',
            device_type: 'single',
            purchased_days: 0,
            first_login_at: new Date().toISOString(),
            expires_at: expiresAt.toISOString(),
            is_active: true,
            is_banned: false,
            payment_status: 'trial',
            notes: `Trial ${keyHours}h | IP: ${clientIP}`
        });

        if (createErr) throw createErr;

        console.log(`🎉 SUCCESS: ${username} (${keyHours}h)`);

        return res.status(200).json({
            success: true,
            username,
            password,
            hours: keyHours,
            expires_at: expiresAt.toISOString()
        });

    } catch (error) {
        console.error('Generate error:', error);
        return res.status(500).json({ success: false, error: 'Failed to generate key' });
    }
}
