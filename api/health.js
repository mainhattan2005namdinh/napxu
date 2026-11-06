'use strict';
// Vercel:  GET /api/health  → kiểm tra function chạy + đã có API key chưa (không lộ key)
const { cfg } = require('./_lib/lookup');

module.exports = (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ ok: true, tikhubKey: Boolean(cfg().apiKey) }));
};
