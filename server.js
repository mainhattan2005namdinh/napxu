'use strict';
// Server chạy local / VPS / Render (Vercel KHÔNG dùng file này — Vercel chạy api/tiktok/user.js):
//   1) Phục vụ trang web (index.html + ảnh).
//   2) API  GET /api/tiktok/user?username=...  → gọi TikHub lấy thông tin user TikTok thật.
// API key TikHub chỉ nằm ở server (file .env), trình duyệt không bao giờ nhìn thấy.
// Chạy:  npm start   rồi mở  http://localhost:3000

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

try { process.loadEnvFile(path.join(__dirname, '.env')); } catch { /* không có .env → dùng biến môi trường của hệ thống (khi deploy) */ }

const { lookupUser, clientIp, cfg } = require('./api/_lib/lookup');
const PORT = Number(process.env.PORT) > 0 ? Number(process.env.PORT) : 3000;

// ---------- Phục vụ file tĩnh ----------
// Chỉ phục vụ file nằm ngay thư mục gốc, có đuôi trong danh sách dưới đây.
// → .env, server.js, api/, .git... KHÔNG BAO GIỜ bị tải về được.
const PUBLIC_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
    '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

function serveStatic(res, pathname) {
    let name;
    try { name = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1)); } catch { return sendText(res, 400, 'Bad request'); }
    const ext = path.extname(name).toLowerCase();
    if (/[\\/]/.test(name) || name.startsWith('.') || !PUBLIC_TYPES[ext]) return sendText(res, 404, 'Not found');
    fs.readFile(path.join(__dirname, name), (err, buf) => {
        if (err) return sendText(res, 404, 'Not found');
        res.writeHead(200, {
            'Content-Type': PUBLIC_TYPES[ext],
            'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400',
            'X-Content-Type-Options': 'nosniff',
        });
        res.end(buf);
    });
}

// ---------- Tiện ích ----------
function sendJson(res, status, obj) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(obj));
}
function sendText(res, status, text) {
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(text);
}

// ---------- Khởi động ----------
const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendText(res, 405, 'Method not allowed');
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/tiktok/user') {
        return lookupUser(url.searchParams.get('username'), clientIp(req))
            .then(({ status, body }) => sendJson(res, status, body))
            .catch((e) => { console.error(e); sendJson(res, 500, { ok: false, error: 'Lỗi máy chủ.' }); });
    }
    if (url.pathname === '/api/health') return sendJson(res, 200, { ok: true, tikhubKey: Boolean(cfg().apiKey) });
    if (url.pathname.startsWith('/api/')) return sendJson(res, 404, { ok: false, error: 'Not found' });
    serveStatic(res, url.pathname);
});

server.listen(PORT, () => {
    const c = cfg();
    console.log(`XuLive đang chạy:  http://localhost:${PORT}`);
    console.log(c.apiKey
        ? `TikHub: đã có API key · cache ${c.cacheTtlMs / 60_000} phút · ${c.perIpPerMin} lượt/phút/IP · tối đa ${c.dailyLimit} lượt/ngày`
        : '⚠  Chưa có TIKHUB_API_KEY trong .env → đăng nhập bằng ID TikTok sẽ báo lỗi. Xem HUONG_DAN_TIKHUB.md');
});
