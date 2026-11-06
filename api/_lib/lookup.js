'use strict';
// Logic tra cứu user dùng chung cho:
//   - server.js            (chạy local / VPS / Render:  npm start)
//   - api/tiktok/user.js   (Vercel Serverless Function)
// Thư mục api/_lib bắt đầu bằng "_" nên Vercel không biến nó thành endpoint.

const { TikHubError, NOT_FOUND_MSG, normalizeUsername, fetchUserProfile } = require('./tikhub');

const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
// Đọc cấu hình lúc chạy (server.js nạp .env trước; Vercel lấy từ Environment Variables)
const cfg = () => ({
    apiKey: (process.env.TIKHUB_API_KEY || '').trim(),
    cacheTtlMs: num(process.env.CACHE_TTL_MINUTES, 30) * 60_000,
    perIpPerMin: num(process.env.LOOKUPS_PER_IP_PER_MINUTE, 5),
    dailyLimit: num(process.env.DAILY_TIKHUB_LIMIT, 200),
});
const NOT_FOUND_TTL_MS = 10 * 60_000;
const BUSY_MSG = 'Hệ thống kiểm tra ID đang bảo trì, vui lòng liên hệ Admin.';

// Bộ nhớ tạm trong RAM. Trên Vercel mỗi instance có bộ nhớ riêng và mất khi instance tắt,
// nên cache / giới hạn ở đây là "cố gắng hết sức", không tuyệt đối như khi chạy 1 server.
const cache = new Map();     // username → { at, ttl, profile | null }
const inflight = new Map();  // username → Promise (hỏi trùng cùng lúc chỉ tốn 1 lượt)
const ipHits = new Map();    // ip → [mốc thời gian]
let daily = { day: '', count: 0 };

function remember(username, profile, ttl) {
    cache.delete(username);
    cache.set(username, { at: Date.now(), ttl, profile });
    if (cache.size > 2000) for (const k of [...cache.keys()].slice(0, 500)) cache.delete(k);
}

function allowIp(ip, limit) {
    const now = Date.now();
    if (ipHits.size > 5000) for (const [k, hits] of ipHits) if (!hits.some((t) => now - t < 60_000)) ipHits.delete(k);
    const hits = (ipHits.get(ip) || []).filter((t) => now - t < 60_000);
    const ok = hits.length < limit;
    if (ok) hits.push(now);
    ipHits.set(ip, hits);
    return ok;
}

function takeDailyQuota(limit) {
    const today = new Date().toISOString().slice(0, 10);
    if (daily.day !== today) daily = { day: today, count: 0 };
    if (daily.count >= limit) return false;
    daily.count++;
    return true;
}

// IP của khách. Trên Vercel dùng x-real-ip (Vercel tự đặt, khách không giả được).
function clientIp(req) {
    const h = req.headers || {};
    if (process.env.VERCEL && h['x-real-ip']) return String(h['x-real-ip']);
    if (process.env.TRUST_PROXY === '1' && h['x-forwarded-for']) return String(h['x-forwarded-for']).split(',')[0].trim();
    return (req.socket && req.socket.remoteAddress) || 'unknown';
}

// Trả về { status, body } để server.js hoặc Vercel tự gửi đi.
async function lookupUser(rawUsername, ip) {
    const { apiKey, cacheTtlMs, perIpPerMin, dailyLimit } = cfg();
    const username = normalizeUsername(rawUsername);
    if (!username) return { status: 400, body: { ok: false, error: 'ID TikTok không hợp lệ (chỉ gồm chữ, số, dấu chấm, gạch dưới).' } };

    const hit = cache.get(username);
    if (hit && Date.now() - hit.at < hit.ttl) {
        return hit.profile
            ? { status: 200, body: { ok: true, user: hit.profile, cached: true } }
            : { status: 404, body: { ok: false, error: NOT_FOUND_MSG } };
    }

    if (!apiKey) {
        console.error('[tikhub] Thiếu TIKHUB_API_KEY (local: file .env · Vercel: Settings → Environment Variables)');
        return { status: 500, body: { ok: false, error: BUSY_MSG } };
    }
    if (!allowIp(ip, perIpPerMin)) {
        return { status: 429, body: { ok: false, error: 'Bạn thao tác quá nhanh, vui lòng thử lại sau 1 phút.' } };
    }

    let job = inflight.get(username);
    if (!job) {
        if (!takeDailyQuota(dailyLimit)) {
            console.warn(`[tikhub] Đã chạm giới hạn ${dailyLimit} lần/ngày (DAILY_TIKHUB_LIMIT)`);
            return { status: 503, body: { ok: false, error: BUSY_MSG } };
        }
        job = fetchUserProfile(username, apiKey).finally(() => inflight.delete(username));
        inflight.set(username, job);
    }

    try {
        const { profile } = await job;
        remember(username, profile, cacheTtlMs);
        console.log(`[tikhub] ✓ @${profile.uniqueId} (${daily.count}/${dailyLimit} lượt hôm nay)`);
        return { status: 200, body: { ok: true, user: profile } };
    } catch (e) {
        if (e instanceof TikHubError) {
            if (e.status === 404) remember(username, null, NOT_FOUND_TTL_MS);
            console.warn(`[tikhub] ✗ @${username}: ${e.detail}`);
            return { status: e.status, body: { ok: false, error: e.message } };
        }
        console.error('[tikhub] Lỗi không mong muốn:', e);
        return { status: 500, body: { ok: false, error: 'Lỗi máy chủ, vui lòng thử lại.' } };
    }
}

module.exports = { lookupUser, clientIp, cfg };
