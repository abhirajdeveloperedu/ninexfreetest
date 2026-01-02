import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mcopfvshhvajrtgbqsem.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabase = SUPABASE_SERVICE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
}) : null;

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

    const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
    const body = req.body || {};
    const hours = parseInt(body.hours) || 1;

    console.log(`🎫 START: IP=${clientIP}, hours=${hours}`);

    if (supabase) {
        try {
            // Create verification record
            await supabase.from('link_verifications').insert({
                ip_address: clientIP,
                hours: hours,
                status: 'pending',
                created_at: new Date().toISOString(),
                expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
            });
        } catch (e) {
            console.error('Start error:', e);
        }
    }

    return res.status(200).json({ success: true });
}
