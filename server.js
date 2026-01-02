// NineX Key Generator - Local Development Server
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Supabase config
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mcopfvshhvajrtgbqsem.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabase = SUPABASE_SERVICE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
}) : null;

// Rate limiting
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

const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon'
};

async function parseBody(req) {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try { resolve(JSON.parse(body || '{}')); }
            catch { resolve({}); }
        });
    });
}

async function handleRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.socket.remoteAddress || 'unknown';

    // ═══════════════════════════════════════════════════════════════
    // CALLBACK ENDPOINT - Shortener redirects here
    // URL: /api/callback?step=1 or /api/callback?step=2
    // ═══════════════════════════════════════════════════════════════
    if (pathname === '/api/callback') {
        const step = url.searchParams.get('step');

        if (!step) {
            res.writeHead(302, { 'Location': '/?error=missing_step' });
            res.end();
            return;
        }

        console.log(`✅ Callback received: Step ${step} completed`);

        // Redirect to homepage with verification status
        res.writeHead(302, { 'Location': `/?verified=${step}` });
        res.end();
        return;
    }

    // ═══════════════════════════════════════════════════════════════
    // GENERATE KEY ENDPOINT
    // ═══════════════════════════════════════════════════════════════
    if (pathname === '/api/generate' && req.method === 'POST') {
        const rateLimit = checkRateLimit(`gen:${clientIP}`, 5, 3600000);
        if (!rateLimit.allowed) {
            res.writeHead(429, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                error: `Rate limited. Try again in ${rateLimit.retryAfter} seconds.`
            }));
            return;
        }

        if (!supabase) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                error: 'Server not configured. Set SUPABASE_SERVICE_KEY.'
            }));
            return;
        }

        try {
            const body = await parseBody(req);
            let hours = parseInt(body.hours) || 1;
            if (hours < 1) hours = 1;
            if (hours > 2) hours = 2;

            const timestamp = Date.now().toString(36);
            const username = `trial_${timestamp}${randomString(4)}`;
            const password = randomString(8);

            const { data: passwordHash, error: hashError } = await supabase.rpc('hash_password', {
                password: password
            });
            if (hashError) throw hashError;

            const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

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
            if (createError) throw createError;

            console.log(`✅ Generated ${hours}h key: ${username}`);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                username,
                password,
                hours,
                expires_at: expiresAt.toISOString()
            }));
        } catch (error) {
            console.error('Generate error:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Failed to generate key' }));
        }
        return;
    }

    // ═══════════════════════════════════════════════════════════════
    // STATIC FILES
    // ═══════════════════════════════════════════════════════════════
    let filePath = pathname === '/' ? '/index.html' : pathname;
    let fullPath = path.join(__dirname, filePath);

    if (!fs.existsSync(fullPath)) {
        fullPath = path.join(__dirname, 'public', filePath);
    }

    const ext = path.extname(fullPath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    try {
        const content = fs.readFileSync(fullPath);
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
    } catch {
        try {
            const content = fs.readFileSync(path.join(__dirname, 'index.html'));
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(content);
        } catch {
            res.writeHead(404);
            res.end('Not Found');
        }
    }
}

const PORT = process.env.PORT || 3001;
http.createServer(handleRequest).listen(PORT, () => {
    console.log(`
🎮 NineX Key Generator Server
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 Site:      http://localhost:${PORT}
📦 Supabase:  ${supabase ? '✅ Connected' : '❌ Not configured'}

📋 SHORTENER CALLBACK URLS (use these in your shortener):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Step 1:  http://localhost:${PORT}/api/callback?step=1
   Step 2:  http://localhost:${PORT}/api/callback?step=2

💡 For production (Vercel), use:
   Step 1:  https://YOUR-DOMAIN.vercel.app/api/callback?step=1
   Step 2:  https://YOUR-DOMAIN.vercel.app/api/callback?step=2
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);
});
