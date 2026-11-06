'use strict';
// Kiểm tra nhanh API key TikHub:
//   npm run check               → key còn hoạt động không, quyền (scope), số dư
//   npm run check -- tiktok     → tra thử 1 username (tốn ~1 lượt ≈ $0.001),
//                                 lưu dữ liệu gốc vào tikhub-sample.json để đối chiếu

const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
try { process.loadEnvFile(path.join(root, '.env')); } catch { /* dùng biến môi trường hệ thống */ }

const { getAccountInfo, fetchUserProfile, normalizeUsername } = require('../tikhub');

(async () => {
    const key = (process.env.TIKHUB_API_KEY || '').trim();
    if (!key) {
        console.error('✗ Chưa có TIKHUB_API_KEY trong file .env (xem HUONG_DAN_TIKHUB.md, Bước 3).');
        process.exit(1);
    }
    console.log(`→ Key: ${key.slice(0, 4)}…${key.slice(-4)} (${key.length} ký tự)`);

    // 1) Thông tin tài khoản
    console.log('→ Kiểm tra tài khoản TikHub...');
    try {
        const info = await getAccountInfo(key);
        const k = (info && info.data && info.data.api_key_data) || {};
        const u = (info && info.data && info.data.user_data) || {};
        console.log('✓ API key hoạt động');
        if (k.api_key_name) console.log('  Tên key     :', k.api_key_name);
        if (Array.isArray(k.api_key_scopes)) console.log('  Quyền       :', k.api_key_scopes.join(', ') || '(trống)');
        if (k.expires_at !== undefined) console.log('  Hết hạn     :', k.expires_at || 'không bao giờ');
        if (u.balance !== undefined) console.log('  Số dư       : $' + u.balance);
        if (u.free_credit !== undefined) console.log('  Free credit : $' + u.free_credit);
    } catch (e) {
        console.warn('! Không xem được thông tin tài khoản: ' + (e.detail || e.message));
        if (/TikHub 403/.test(e.detail || '')) console.warn('  (Key chưa có quyền /api/v1/tikhub/user/ — không sao, vẫn tra cứu user được nếu có quyền /api/v1/tiktok/web/)');
        if (/TikHub 401/.test(e.detail || '')) { console.error('  → Key sai hoặc hết hạn. Tạo key mới rồi dán lại vào .env'); process.exitCode = 1; return; }
    }

    // 2) Tra thử 1 username
    const arg = process.argv[2];
    if (!arg) {
        console.log('\nMẹo: chạy  npm run check -- tiktok  để tra thử 1 tài khoản (tốn ~1 lượt).');
        return;
    }
    const username = normalizeUsername(arg);
    if (!username) { console.error(`✗ "${arg}" không phải username TikTok hợp lệ.`); process.exitCode = 1; return; }

    console.log(`\n→ Tra cứu @${username} (tốn ~1 lượt)...`);
    const samplePath = path.join(root, 'tikhub-sample.json');
    try {
        const { profile, raw } = await fetchUserProfile(username, key);
        fs.writeFileSync(samplePath, JSON.stringify(raw, null, 2));
        console.log('✓ Tìm thấy:');
        console.log('  Username    : @' + profile.uniqueId);
        console.log('  Tên hiển thị:', profile.nickname || '(trống)');
        console.log('  Tích xanh   :', profile.verified ? 'có' : 'không');
        console.log('  Riêng tư    :', profile.privateAccount ? 'có' : 'không');
        console.log('  Follower    :', profile.followerCount ?? '?');
        console.log('  Đang follow :', profile.followingCount ?? '?');
        console.log('  Lượt thích  :', profile.heartCount ?? '?');
        console.log('  Video       :', profile.videoCount ?? '?');
        console.log('  Avatar      :', profile.avatar ? profile.avatar.slice(0, 80) + '…' : '(không có)');
        console.log(`\nDữ liệu gốc đã lưu vào ${path.basename(samplePath)}`);
    } catch (e) {
        if (e.raw) {
            fs.writeFileSync(samplePath, JSON.stringify(e.raw, null, 2));
            console.error(`✗ ${e.detail}\n  Dữ liệu gốc đã lưu vào ${path.basename(samplePath)} để kiểm tra cấu trúc.`);
        } else {
            console.error('✗ ' + (e.detail || e.message));
        }
        process.exitCode = 1; // không dùng process.exit() ngay sau fetch: Node trên Windows có thể báo lỗi assertion
    }
})();
