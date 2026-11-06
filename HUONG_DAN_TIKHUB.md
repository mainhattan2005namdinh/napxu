# Hướng dẫn tích hợp TikHub: lấy thông tin user TikTok thật

Khi khách nhập ID TikTok và bấm **Đăng nhập**, web sẽ hỏi TikHub để:

- kiểm tra ID có tồn tại không. Nếu không tồn tại, web báo "Không tìm thấy tài khoản TikTok này".
- lấy **avatar, tên hiển thị, tích xanh, số Follower, lượt Thích và số Video** để hiện trên thẻ tài khoản.

Phần code đã được cấu hình sẵn. Bạn chỉ cần làm **Bước 1 → Bước 5** bên dưới, mất khoảng 10 phút.

---

## 0. Hiểu nhanh cách hoạt động (nên đọc)

```
Trình duyệt của khách                Server của bạn (server.js)               TikHub
─────────────────────                ──────────────────────────               ──────
Nhập "@abc" → Đăng nhập ──────────▶  GET /api/tiktok/user?username=abc
                                     • kiểm tra cache, giới hạn spam
                                     • gắn API key (lấy từ file .env) ──────▶  /api/v1/tiktok/web/fetch_user_profile
                                     ◀────────────────────────────────────────  dữ liệu user
◀──────── avatar, tên, follower...   • lọc lại, chỉ trả các trường cần thiết
```

**Vì sao cần server, không gọi thẳng TikHub từ index.html?**
API key giống như thẻ ngân hàng gắn với số dư TikHub của bạn. Nếu đặt key trong `index.html`, bất kỳ ai bấm F12 cũng đọc được và dùng hết tiền của bạn. Vì vậy key chỉ nằm trong file `.env` trên server, trình duyệt không bao giờ thấy được.

> ⚠️ Từ giờ **không mở index.html bằng cách bấm đúp file nữa**. Hãy chạy server (Bước 5) rồi mở `http://localhost:3000`. Nếu mở bằng bấm đúp, phần đăng nhập sẽ báo lỗi.

---

## 1. Tạo API Token trên TikHub

1. Vào **https://user.tikhub.io** và đăng nhập tài khoản bạn vừa tạo.
2. Trong trang quản lý (User Center), mở mục **API Token** (có thể tên là "API Keys" hoặc "API Token") và bấm **tạo token mới**.
3. Đặt tên dễ nhớ, ví dụ `napxu`.
4. **Quyền (scope):** token của TikHub chỉ gọi được những đường dẫn API mà bạn cấp quyền. Khi tạo token, giao diện hiện một danh sách dài khoảng 70 quyền (douyin, instagram, youtube, tiktok/app, tiktok/shop, /mcp...). **Chỉ tick đúng 2 dòng:**
   - ✅ `/api/v1/tiktok/web/`: **bắt buộc**, dùng để tra cứu user khi khách đăng nhập.
   - ✅ `/api/v1/tikhub/user/`: nên tick, dùng để xem số dư bằng lệnh `npm run check`.

   Các dòng còn lại **để trống**. Web không dùng đến chúng, và nếu key bị lộ thì người khác cũng không thể dùng key gọi các API đó để tiêu tiền của bạn.

5. **Hạn dùng (expiry):** chọn "không hết hạn" hoặc một hạn dài. Key hết hạn thì web sẽ báo lỗi bảo trì.
6. **Copy token ngay** và cất ở chỗ an toàn. Một số trang chỉ hiện token đúng một lần.

> Tên menu trên giao diện TikHub có thể khác một chút so với mô tả trên, vì họ hay cập nhật. Tài liệu chính thức chỉ ghi: _"vào user center, bấm menu API token và tạo API token"_.

**Không gửi token cho ai, không dán vào chat, không commit lên GitHub.** Nếu lỡ để lộ, vào lại mục API Token, **xoá token đó** rồi tạo token mới.

---

## 2. Kiểm tra Node.js

Server chạy bằng Node.js, **không cần cài thêm thư viện nào**. Máy bạn đã có Node **v24**, đạt yêu cầu tối thiểu là v20.12.

Kiểm tra lại bằng lệnh sau (mở Terminal trong VS Code bằng `` Ctrl+` ``):

```bash
node -v
```

Nếu sau này chạy trên máy khác chưa có Node, tải bản LTS tại https://nodejs.org.

---

## 3. Dán API key vào file `.env`

File `.env` đã được tạo sẵn ở thư mục gốc dự án (`E:\napxu\.env`).

1. Mở file `.env` trong VS Code.
2. Dán token vào sau dấu `=` ở dòng `TIKHUB_API_KEY`, viết liền, không có dấu cách hay dấu ngoặc kép:

   ```env
   TIKHUB_API_KEY=dán_token_của_bạn_vào_đây
   ```

3. Lưu file (Ctrl+S).

File `.env` đã nằm trong `.gitignore`, nên `git add` / `git commit` sẽ **không** đưa nó lên GitHub. File `.env.example` là bản mẫu không chứa bí mật, được phép commit.

Các thông số khác trong `.env` để mặc định là dùng được (xem chi tiết ở mục 7).

---

## 4. Kiểm tra key hoạt động

Trong Terminal, đứng ở thư mục `E:\napxu`, chạy:

```bash
npm run check
```

Kết quả mong đợi:

```
→ Key: abcd…wxyz (xx ký tự)
→ Kiểm tra tài khoản TikHub...
✓ API key hoạt động
  Quyền       : /api/v1/tiktok/web/, /api/v1/tikhub/user/
  Free credit : $0.05
```

Tiếp theo, tra thử một tài khoản thật. Lệnh này tốn khoảng 1 lượt, tức khoảng $0.001:

```bash
npm run check -- tiktok
```

Nếu thấy `✓ Tìm thấy:` kèm tên, follower và avatar, nghĩa là mọi thứ đã thông. Dữ liệu gốc TikHub trả về được lưu vào file `tikhub-sample.json` để đối chiếu. File này cũng đã được `.gitignore` chặn.

> 💡 Nếu lệnh tra thử báo `✗ ... không có user ... trong dữ liệu` dù tài khoản có thật, có thể TikHub đã đổi cấu trúc dữ liệu. Khi đó hãy nhắn Claude: _"đọc tikhub-sample.json và sửa lại"_. File đó chỉ chứa thông tin công khai của tài khoản TikTok, không chứa key.

---

## 5. Chạy web

```bash
npm start
```

Terminal sẽ hiện:

```
XuLive đang chạy:  http://localhost:3000
TikHub: đã có API key · cache 30 phút · 5 lượt/phút/IP · tối đa 200 lượt/ngày
```

Mở trình duyệt vào **http://localhost:3000**, nhập ID TikTok của bạn và bấm **Đăng nhập**. Thẻ tài khoản sẽ hiện avatar, tên, tích xanh và số Follower / Thích / Video thật.

Mỗi lần tra cứu, Terminal sẽ in một dòng log, ví dụ:

```
[tikhub] ✓ @tenban (1/200 lượt hôm nay)
[tikhub] ✗ @khongtontai: TikHub 404: không có dữ liệu user
```

Muốn tắt server thì bấm `Ctrl+C` trong Terminal.

---

## 6. Chi phí và cách web tiết kiệm credit

| Mục                        | Giá trị                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------- |
| Giá mỗi lượt tra cứu       | từ **$0.001** (giá đúng của từng endpoint xem ở API Marketplace trên trang TikHub) |
| Free credit tài khoản mới  | **$0.05**, tương đương khoảng **50 lượt**                                          |
| Nạp tối thiểu              | $5 (Alipay, PayPal, USDT...)                                                       |
| Giới hạn tốc độ của TikHub | 10 request/giây                                                                    |

Web đã có sẵn 4 lớp để không đốt tiền vô ích:

1. **Cache trên server (30 phút):** cùng một ID được tra nhiều lần trong 30 phút thì chỉ tốn 1 lượt. ID không tồn tại cũng được nhớ trong 10 phút.
2. **Cache trên trình duyệt (24 giờ):** khách đăng nhập lại hoặc chọn tài khoản cũ trong danh sách thì không tốn lượt nào. Sau 24 giờ, web tự cập nhật ngầm một lần vì link avatar TikTok có hạn dùng.
3. **Chặn spam:** mỗi IP chỉ được tra tối đa 5 ID mới mỗi phút.
4. **Trần mỗi ngày:** quá 200 lượt/ngày thì server ngừng gọi TikHub, để không ai có thể làm cạn số dư của bạn.

Xem số dư bất cứ lúc nào bằng `npm run check` hoặc trên trang https://user.tikhub.io.

---

## 7. Các thông số trong `.env`

| Biến                        | Mặc định | Ý nghĩa                                                                                             |
| --------------------------- | -------- | --------------------------------------------------------------------------------------------------- |
| `TIKHUB_API_KEY`            | (trống)  | Token TikHub. **Bắt buộc.**                                                                         |
| `PORT`                      | `3000`   | Cổng chạy web.                                                                                      |
| `CACHE_TTL_MINUTES`         | `30`     | Số phút server nhớ kết quả tra cứu.                                                                 |
| `LOOKUPS_PER_IP_PER_MINUTE` | `5`      | Số lượt tra ID mới tối đa của mỗi IP trong 1 phút.                                                  |
| `DAILY_TIKHUB_LIMIT`        | `200`    | Trần số lần gọi TikHub mỗi ngày. Khi đang dùng free credit, có thể hạ xuống `40`.                   |
| `TRUST_PROXY`               | `0`      | Đặt `1` khi deploy lên Render, Railway hoặc chạy sau Nginx/Cloudflare, để server lấy đúng IP khách. |

Sửa `.env` xong thì tắt server (`Ctrl+C`) và chạy lại `npm start`.

---

## 8. Lỗi thường gặp

| Khách thấy / Terminal báo                                    | Nguyên nhân                                     | Cách xử lý                                                              |
| ------------------------------------------------------------ | ----------------------------------------------- | ----------------------------------------------------------------------- |
| `Thiếu TIKHUB_API_KEY trong file .env`                       | Chưa dán key hoặc chưa lưu file                 | Làm lại Bước 3, rồi chạy lại `npm start`.                               |
| `TikHub 401: API key sai hoặc đã hết hạn`                    | Copy thiếu hoặc thừa ký tự, hoặc token hết hạn  | Copy lại token, hoặc tạo token mới.                                     |
| `TikHub 403: API key thiếu quyền (scope)`                    | Token chưa được cấp quyền `/api/v1/tiktok/web/` | Sửa quyền của token, hoặc tạo token mới có quyền đó.                    |
| `TikHub 402: tài khoản TikHub đã hết số dư`                  | Hết $0.05 free                                  | Nạp thêm (tối thiểu $5).                                                |
| `TikHub 429` / khách thấy "thao tác quá nhanh"               | Gọi quá nhanh, hoặc 1 IP tra quá 5 ID/phút      | Chờ 1 phút. Nếu cần, tăng `LOOKUPS_PER_IP_PER_MINUTE`.                  |
| `TikHub không phản hồi sau 30s`                              | Mạng chậm hoặc TikHub đang chậm                 | Thử lại. Tài liệu TikHub khuyên dùng `api.tikhub.io` (đã cấu hình sẵn). |
| Khách thấy "Không tìm thấy tài khoản TikTok này"             | ID gõ sai, hoặc tài khoản bị khoá/xoá           | Kiểm tra lại ID. Nếu ID chắc chắn đúng, xem mẹo ở Bước 4.               |
| Khách thấy "Hãy chạy npm start rồi mở http://localhost:3000" | Đang mở index.html bằng bấm đúp                 | Chạy `npm start` rồi mở `http://localhost:3000`.                        |
| `Error: listen EADDRINUSE :::3000`                           | Cổng 3000 đang bị chương trình khác dùng        | Tắt server cũ đang chạy, hoặc đổi `PORT=3001` trong `.env`.             |
| Avatar chỉ hiện chữ cái đầu                                  | Link ảnh TikTok hết hạn hoặc bị chặn            | Không ảnh hưởng chức năng. Sau 24 giờ web tự lấy lại.                   |

Khách chỉ thấy thông báo chung chung như "đang bảo trì". Lý do kỹ thuật chi tiết chỉ in ra Terminal của server, để không lộ thông tin hệ thống.

---

## 9. Đưa web lên mạng (deploy)

Trang web giờ cần **chạy server Node**. Các dịch vụ chỉ host file tĩnh như **GitHub Pages không chạy được** phần tra cứu.

### Cách dễ nhất: Render.com (có gói miễn phí)

1. Commit và push code lên GitHub (file `.env` sẽ tự động **không** bị đẩy lên).
2. Vào https://render.com, đăng nhập bằng GitHub, chọn **New → Web Service** rồi chọn repo `napxu`.
3. Điền cấu hình:
   - **Runtime:** Node
   - **Build Command:** `npm install` (dự án không có thư viện nên bước này chạy rất nhanh)
   - **Start Command:** `npm start`
   - **Instance Type:** Free
4. Trong mục **Environment Variables**, thêm:
   - `TIKHUB_API_KEY` = token của bạn
   - `TRUST_PROXY` = `1`
   - (tuỳ chọn) `DAILY_TIKHUB_LIMIT` và các biến khác ở mục 7

   Không cần đặt `PORT`, Render tự cấp.

5. Bấm **Create Web Service** và chờ build xong. Render sẽ cấp link dạng `https://napxu.onrender.com`.

> Gói Free của Render tự "ngủ" khi không có ai truy cập một lúc. Người vào đầu tiên sau đó phải chờ server khởi động lại, mất vài chục giây. Muốn luôn nhanh thì nâng gói trả phí hoặc dùng VPS.

### Nếu dùng VPS (Ubuntu...)

```bash
git clone https://github.com/ngtuanthanh2002/napxu.git && cd napxu
cp .env.example .env && nano .env        # dán TIKHUB_API_KEY, đặt TRUST_PROXY=1 nếu có Nginx phía trước
npm install -g pm2 && pm2 start server.js --name napxu && pm2 save
```

Sau đó cấu hình Nginx trỏ tên miền về cổng 3000 và bật HTTPS.

---

## 10. Các file liên quan

| File                      | Vai trò                                                                                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `server.js`               | Server: phục vụ trang web và API `/api/tiktok/user`, kèm cache và chống spam. Chỉ cho tải về file `.html` và ảnh ở thư mục gốc, nên `.env` và code server không bao giờ lộ ra ngoài. |
| `tikhub.js`               | Gọi TikHub và chuẩn hoá dữ liệu user. Hỗ trợ cả 2 dạng dữ liệu TikTok Web và TikTok App.                                                                                             |
| `scripts/check-tikhub.js` | Lệnh `npm run check` để kiểm tra key, số dư và tra thử user.                                                                                                                         |
| `.env`                    | **Bí mật**, chứa API key. Không commit.                                                                                                                                              |
| `.env.example`            | Bản mẫu của `.env`, được phép commit.                                                                                                                                                |
| `.gitignore`              | Chặn `.env` và `tikhub-sample.json` khỏi git.                                                                                                                                        |
| `package.json`            | Khai báo 2 lệnh `npm start` và `npm run check`.                                                                                                                                      |
| `index.html`              | Hàm `loginTikTok()` gọi `/api/tiktok/user`, rồi hiện avatar, tên và số liệu thật lên thẻ tài khoản.                                                                                  |

**API server trả về cho trình duyệt** (`GET /api/tiktok/user?username=...`):

```json
{
  "ok": true,
  "user": {
    "uniqueId": "tiktok",
    "nickname": "TikTok",
    "avatar": "https://...tiktokcdn...",
    "verified": true,
    "privateAccount": false,
    "followerCount": 92300000,
    "followingCount": 3,
    "heartCount": 451000000,
    "videoCount": 1234
  }
}
```

Khi lỗi, server trả `{ "ok": false, "error": "Câu thông báo cho khách" }` kèm mã HTTP 400, 404, 429, 500, 502, 503 hoặc 504.

Kiểm tra server còn sống: mở `http://localhost:3000/api/health`. Kết quả `"tikhubKey": true` nghĩa là server đã đọc được key.

---

## Checklist bảo mật

- [ ] API key chỉ nằm trong `.env` (máy bạn) hoặc Environment Variables (Render/VPS), **không bao giờ** nằm trong `index.html`.
- [ ] Chạy `git status` trước khi commit, và **không** thấy `.env` trong danh sách.
- [ ] Token chỉ cấp đúng quyền cần dùng (`/api/v1/tiktok/web/`, thêm `/api/v1/tikhub/user/` nếu muốn xem số dư).
- [ ] Đặt `DAILY_TIKHUB_LIMIT` phù hợp với số dư hiện có.
- [ ] Nếu nghi ngờ key bị lộ: xoá token trên TikHub, tạo token mới rồi cập nhật lại `.env` hoặc Render.
