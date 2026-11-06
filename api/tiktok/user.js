'use strict';
// Vercel Serverless Function:  GET /api/tiktok/user?username=...
// API key lấy từ Vercel → Project → Settings → Environment Variables → TIKHUB_API_KEY
const { lookupUser, clientIp } = require('../_lib/lookup');

module.exports = async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') {
        res.statusCode = 405;
        return res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
    }
    const username = new URL(req.url, 'http://localhost').searchParams.get('username');
    const { status, body } = await lookupUser(username, clientIp(req));
    res.statusCode = status;
    res.end(JSON.stringify(body));
};
