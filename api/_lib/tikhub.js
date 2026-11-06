'use strict';
// Gọi TikHub API (https://api.tikhub.io) và chuẩn hoá dữ liệu user TikTok.
// File này chỉ chạy trên server — KHÔNG được nhúng vào index.html (sẽ lộ API key).

const TIKHUB_BASE = (process.env.TIKHUB_BASE_URL || 'https://api.tikhub.io').replace(/\/+$/, '');
const TIMEOUT_MS = 30_000; // TikHub khuyến nghị timeout 30–60s

const NOT_FOUND_MSG = 'Không tìm thấy tài khoản TikTok này, vui lòng kiểm tra lại ID.';
const CONFIG_MSG = 'Hệ thống kiểm tra ID đang bảo trì, vui lòng liên hệ Admin.';

// status = mã HTTP trả cho trình duyệt; message = câu hiển thị cho khách;
// detail = thông tin kỹ thuật chỉ in ra log server.
class TikHubError extends Error {
    constructor(status, message, detail) {
        super(message);
        this.status = status;
        this.detail = detail || message;
    }
}

// Nhận "@abc", "abc" hoặc link "https://www.tiktok.com/@abc?..." → "abc".
// Username TikTok: chữ, số, dấu chấm, gạch dưới; tối đa 24 ký tự; không phân biệt hoa thường.
function normalizeUsername(raw) {
    let u = String(raw || '').trim();
    const fromLink = u.match(/tiktok\.com\/@([^/?#\s]+)/i);
    if (fromLink) u = fromLink[1];
    u = u.replace(/^@+/, '').toLowerCase();
    return /^[a-z0-9._]{2,24}$/.test(u) ? u : null;
}

function mapHttpError(status, remote) {
    const tail = remote ? ` — TikHub: ${remote}` : '';
    switch (status) {
        case 400:
        case 404: return new TikHubError(404, NOT_FOUND_MSG, `TikHub ${status}: không có dữ liệu user${tail}`);
        case 401: return new TikHubError(500, CONFIG_MSG, `TikHub 401: API key sai hoặc đã hết hạn${tail}`);
        case 402: return new TikHubError(503, CONFIG_MSG, `TikHub 402: tài khoản TikHub đã hết số dư — cần nạp thêm${tail}`);
        case 403: return new TikHubError(500, CONFIG_MSG, `TikHub 403: API key thiếu quyền (scope) cho endpoint này, hoặc tài khoản bị khoá${tail}`);
        case 429: return new TikHubError(429, 'Đang có nhiều yêu cầu, vui lòng thử lại sau vài giây.', `TikHub 429: vượt giới hạn tốc độ${tail}`);
        default:  return new TikHubError(502, 'Không lấy được thông tin TikTok, vui lòng thử lại sau.', `TikHub ${status}${tail}`);
    }
}

async function callTikHub(pathAndQuery, apiKey) {
    if (!apiKey) throw new TikHubError(500, CONFIG_MSG, 'Thiếu TIKHUB_API_KEY trong file .env');
    let res;
    try {
        res = await fetch(TIKHUB_BASE + pathAndQuery, {
            headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
    } catch (e) {
        const detail = e.name === 'TimeoutError' ? `TikHub không phản hồi sau ${TIMEOUT_MS / 1000}s` : `Lỗi mạng khi gọi TikHub: ${e.message}`;
        throw new TikHubError(504, 'Máy chủ kiểm tra ID không phản hồi, vui lòng thử lại.', detail);
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) throw mapHttpError(res.status, body ? JSON.stringify(body).slice(0, 300) : '');
    return body;
}

// ---- Chuẩn hoá dữ liệu user ----
const toNum = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const firstUrl = (o) => (o && Array.isArray(o.url_list) && o.url_list[0]) || '';
const safeUrl = (u) => (typeof u === 'string' && u.startsWith('https://') ? u : '');

// Hỗ trợ 2 dạng dữ liệu:
//  - TikTok Web: data.userInfo.user (camelCase) + data.userInfo.stats
//  - TikTok App: data.user (snake_case: unique_id, avatar_larger.url_list, follower_count...)
function extractProfile(data) {
    if (!data || typeof data !== 'object') return null;
    const info = data.userInfo || data.user_info || data;
    const u = info && info.user;
    if (!u || typeof u !== 'object') return null;
    const uniqueId = u.uniqueId || u.unique_id;
    if (!uniqueId) return null;
    const st = info.stats || info.statsV2 || {};
    return {
        uniqueId: String(uniqueId),
        nickname: String(u.nickname || ''),
        avatar: safeUrl(u.avatarLarger || u.avatarMedium || u.avatarThumb || firstUrl(u.avatar_larger) || firstUrl(u.avatar_medium) || firstUrl(u.avatar_thumb)),
        verified: Boolean(u.verified ?? (Number(u.verification_type) > 0)),
        privateAccount: Boolean(u.privateAccount ?? u.secret),
        followerCount: toNum(st.followerCount ?? u.follower_count),
        followingCount: toNum(st.followingCount ?? u.following_count),
        heartCount: toNum(st.heartCount ?? st.heart ?? u.total_favorited),
        videoCount: toNum(st.videoCount ?? u.aweme_count),
    };
}

// Lấy hồ sơ TikTok theo username. Endpoint: TikTok Web → fetch_user_profile (tham số uniqueId).
async function fetchUserProfile(username, apiKey) {
    const raw = await callTikHub(`/api/v1/tiktok/web/fetch_user_profile?uniqueId=${encodeURIComponent(username)}`, apiKey);
    const profile = extractProfile(raw && raw.data);
    if (!profile) {
        const err = new TikHubError(404, NOT_FOUND_MSG, `TikHub trả 200 nhưng không có user "${username}" trong dữ liệu`);
        err.raw = raw; // để scripts/check-tikhub.js lưu lại xem cấu trúc thật
        throw err;
    }
    return { profile, raw };
}

// Thông tin tài khoản TikHub (tên key, quyền, số dư).
function getAccountInfo(apiKey) {
    return callTikHub('/api/v1/tikhub/user/get_user_info', apiKey);
}

module.exports = { TikHubError, NOT_FOUND_MSG, normalizeUsername, extractProfile, fetchUserProfile, getAccountInfo };
