import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mcopfvshhvajrtgbqsem.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabase = SUPABASE_SERVICE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
}) : null;

// In-memory rate limiting for Vercel (resets on cold start)
const rateLimitMap = new Map();

function checkRateLimit(identifier, maxAttempts = 5, windowMs = 3600000) {
    const now = Date.now();
    if (!rateLimitMap.has(identifier)) {
        rateLimitMap.set(identifier, { count: 1, resetAt: now + windowMs });
        return { allowed: true };
    }
    const record = rateLimitMap.get(identifier);
    if (now > record.resetAt) {
        rateLimitMap.set(identifier, { count: 1, resetAt: now + windowMs });
        return { allowed: true };
    }
    if (record.count >= maxAttempts) {
        return { allowed: false, retryAfter: Math.ceil((record.resetAt - now) / 1000) };
    }
    record.count++;
    return { allowed: true };
}

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
        return res.status(405).json({ success: false, error: { message: 'Method not allowed' } });
    }

    if (!supabase) {
        return res.status(500).json({
            success: false,
            error: { message: 'Server not configured. Set SUPABASE_SERVICE_KEY.' }
        });
    }

    // Get client IP for rate limiting
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.socket?.remoteAddress || 'unknown';

    // Rate limit: 5 per hour per IP
    const rateLimit = checkRateLimit(`gen:${clientIP}`, 5, 3600000);
    if (!rateLimit.allowed) {
        return res.status(429).json({
            success: false,
            error: { message: `Rate limited. Try again in ${rateLimit.retryAfter} seconds.` }
        });
    }

    try {
        // Parse request body
        const body = req.body || {};
        
        // Validate hours (1 or 2)
        let hours = parseInt(body.hours) || 1;
        if (hours < 1) hours = 1;
        if (hours > 2) hours = 2;

        // Generate username & password
        const timestamp = Date.now().toString(36);
        const username = `trial_${timestamp}${randomString(4)}`;
        const password = randomString(8);

        // Hash password via Supabase RPC
        const { data: passwordHash, error: hashError } = await supabase.rpc('hash_password', {
            password: password
        });

        if (hashError) {
            console.error('Hash error:', hashError);
            throw new Error('Password hashing failed');
        }

        // Calculate expiry based on selected hours
        const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

        // Create user in database
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
                notes: `Trial ${hours}h from IP: ${clientIP}`
            });

        if (createError) {
            console.error('Create error:', createError);
            throw new Error('Failed to create user');
        }

        console.log(`✅ Generated ${hours}h trial: ${username} (expires: ${expiresAt.toISOString()})`);

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
            error: { message: error.message || 'Failed to generate key. Try again.' }
        });
    }
}
