'use strict';
// Server của XuLive:
//   1) Phục vụ trang web (index.html + ảnh).
//   2) API  GET /api/tiktok/user?username=...  → gọi TikHub để lấy thông tin user TikTok thật.
// API key TikHub chỉ nằm ở server (file .env), trình duyệt không bao giờ nhìn thấy.
// Chạy:  npm start   rồi mở  http://localhost:3000

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

try { process.loadEnvFile(path.join(__dirname, '.env')); } catch { /* không có .env → dùng biến môi trường của hệ thống (khi deploy) */ }

const { TikHubError, NOT_FOUND_MSG, normalizeUsername, fetchUserProfile } = require('./tikhub');

const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
const PORT = num(process.env.PORT, 3000);
const API_KEY = (process.env.TIKHUB_API_KEY || '').trim();
const CACHE_TTL_MS = num(process.env.CACHE_TTL_MINUTES, 30) * 60_000;   // nhớ kết quả tìm thấy
const NOT_FOUND_TTL_MS = 10 * 60_000;                                     // nhớ kết quả "không tồn tại"
const PER_IP_PER_MIN = num(process.env.LOOKUPS_PER_IP_PER_MINUTE, 5);    // chống spam đốt credit
const DAILY_LIMIT = num(process.env.DAILY_TIKHUB_LIMIT, 200);            // trần số lần gọi TikHub mỗi ngày
const TRUST_PROXY = process.env.TRUST_PROXY === '1';                     // bật khi chạy sau Render/Nginx/Cloudflare

// ---------- Tra cứu user (có cache + giới hạn) ----------
const cache = new Map();     // username → { at, ttl, profile | null }
const inflight = new Map();  // username → Promise (nhiều người hỏi cùng lúc chỉ tốn 1 lượt)
const ipHits = new Map();    // ip → [mốc thời gian]
let daily = { day: '', count: 0 };

function remember(username, profile, ttl) {
    cache.delete(username);
    cache.set(username, { at: Date.now(), ttl, profile });
    if (cache.size > 2000) for (const k of [...cache.keys()].slice(0, 500)) cache.delete(k);
}

function clientIp(req) {
    if (TRUST_PROXY && req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',')[0].trim();
    return req.socket.remoteAddress || 'unknown';
}

function allowIp(ip) {
    const now = Date.now();
    const hits = (ipHits.get(ip) || []).filter((t) => now - t < 60_000);
    const ok = hits.length < PER_IP_PER_MIN;
    if (ok) hits.push(now);
    ipHits.set(ip, hits);
    return ok;
}
setInterval(() => {
    const now = Date.now();
    for (const [ip, hits] of ipHits) if (!hits.some((t) => now - t < 60_000)) ipHits.delete(ip);
}, 10 * 60_000).unref();

function takeDailyQuota() {
    const today = new Date().toISOString().slice(0, 10);
    if (daily.day !== today) daily = { day: today, count: 0 };
    if (daily.count >= DAILY_LIMIT) return false;
    daily.count++;
    return true;
}

async function handleUserLookup(req, res, url) {
    const username = normalizeUsername(url.searchParams.get('username'));
    if (!username) return sendJson(res, 400, { ok: false, error: 'ID TikTok không hợp lệ (chỉ gồm chữ, số, dấu chấm, gạch dưới).' });

    const hit = cache.get(username);
    if (hit && Date.now() - hit.at < hit.ttl) {
        return hit.profile
            ? sendJson(res, 200, { ok: true, user: hit.profile, cached: true })
            : sendJson(res, 404, { ok: false, error: NOT_FOUND_MSG });
    }

    if (!API_KEY) {
        console.error('[tikhub] Thiếu TIKHUB_API_KEY trong .env — xem HUONG_DAN_TIKHUB.md, Bước 3');
        return sendJson(res, 500, { ok: false, error: 'Hệ thống kiểm tra ID đang bảo trì, vui lòng liên hệ Admin.' });
    }
    if (!allowIp(clientIp(req))) {
        return sendJson(res, 429, { ok: false, error: 'Bạn thao tác quá nhanh, vui lòng thử lại sau 1 phút.' });
    }

    let job = inflight.get(username);
    if (!job) {
        if (!takeDailyQuota()) {
            console.warn(`[tikhub] Đã chạm giới hạn ${DAILY_LIMIT} lần/ngày (DAILY_TIKHUB_LIMIT)`);
            return sendJson(res, 503, { ok: false, error: 'Hệ thống kiểm tra ID tạm ngưng, vui lòng liên hệ Admin.' });
        }
        job = fetchUserProfile(username, API_KEY).finally(() => inflight.delete(username));
        inflight.set(username, job);
    }

    try {
        const { profile } = await job;
        remember(username, profile, CACHE_TTL_MS);
        console.log(`[tikhub] ✓ @${profile.uniqueId} (${daily.count}/${DAILY_LIMIT} lượt hôm nay)`);
        return sendJson(res, 200, { ok: true, user: profile });
    } catch (e) {
        if (e instanceof TikHubError) {
            if (e.status === 404) remember(username, null, NOT_FOUND_TTL_MS);
            console.warn(`[tikhub] ✗ @${username}: ${e.detail}`);
            return sendJson(res, e.status, { ok: false, error: e.message });
        }
        console.error('[tikhub] Lỗi không mong muốn:', e);
        return sendJson(res, 500, { ok: false, error: 'Lỗi máy chủ, vui lòng thử lại.' });
    }
}

// ---------- Phục vụ file tĩnh ----------
// Chỉ phục vụ file nằm ngay thư mục gốc, có đuôi trong danh sách dưới đây.
// → .env, server.js, tikhub.js, .git... KHÔNG BAO GIỜ bị tải về được.
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
        return handleUserLookup(req, res, url).catch((e) => { console.error(e); sendJson(res, 500, { ok: false, error: 'Lỗi máy chủ.' }); });
    }
    if (url.pathname === '/api/health') return sendJson(res, 200, { ok: true, tikhubKey: Boolean(API_KEY) });
    if (url.pathname.startsWith('/api/')) return sendJson(res, 404, { ok: false, error: 'Not found' });
    serveStatic(res, url.pathname);
});

server.listen(PORT, () => {
    console.log(`XuLive đang chạy:  http://localhost:${PORT}`);
    console.log(API_KEY
        ? `TikHub: đã có API key · cache ${CACHE_TTL_MS / 60_000} phút · ${PER_IP_PER_MIN} lượt/phút/IP · tối đa ${DAILY_LIMIT} lượt/ngày`
        : '⚠  Chưa có TIKHUB_API_KEY trong .env → đăng nhập bằng ID TikTok sẽ báo lỗi. Xem HUONG_DAN_TIKHUB.md');
});
