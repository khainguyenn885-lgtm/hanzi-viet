# Tra cứu ngược, thành tích và study groups

## Dữ liệu đã nhập

`pnpm import:hsk30-main` đọc dữ liệu tĩnh trong `apps/api/data/hsk30-main-source` và hợp nhất vào `apps/api/data/hsk-words.json`. Bộ nhập không `eval`/import các JavaScript nộp kèm. Nó nạp danh sách HSK 1–6, danh sách cấp 7–9 gộp, nghĩa Việt, English fallback và câu ví dụ; từ trùng được làm giàu khi trường tương ứng còn trống.

Sau lần hợp nhất: **18.625 mục từ**, trong đó 1.018 bề mặt từ mới được thêm, 4.837 nghĩa Việt và 1.346 bộ ví dụ được bổ sung ở lần nhập đầu. HSK 7–9 trong nguồn có một bucket chung; giao diện ghi rõ “HSK 7–9 (gộp)”. Dữ liệu thiếu Hán-Việt, Việt hoặc English vẫn là “Chưa có dữ liệu”.

`HSK-3.0-explorer-main.zip` không được dùng để thay thế bộ từ điển: file `hskData.ts` chỉ có vài ví dụ mẫu, còn package chứa mã dịch ngoài và AI. Không có code của ZIP đó được đưa vào app. ZIP `hsk30-main` không có LICENSE riêng trong archive; nghĩa English ghi nguồn CC-CEDICT, còn quyền tái phân phối phần Việt/ví dụ chưa được xác nhận. Xem `apps/api/data/hsk30-main-source/SOURCE_NOTES.md` trước khi public dataset.

## Reverse lookup

API chuẩn hóa `đ → d`, bỏ dấu tổ hợp Unicode, hạ chữ thường và chuẩn hóa khoảng trắng cho các cột `vi_search`, `en_search`, `hv_search`. Pinyin tạo `pinyin_search` riêng, bỏ dấu thanh/số thanh và khoảng trắng. Search chạy theo thứ tự prefix (có index) rồi contains, nên `xin chao`, `hello`, `ni3hao3` đều dùng dữ liệu từ điển. Chữ giản thể/phồn thể tìm qua các bề mặt từ đã nhập.

Đây là khớp không dấu/substring; chưa có edit-distance để sửa lỗi gõ tùy ý. Tìm kiếm luôn trả bản ghi nguồn, không sinh nghĩa. Các cột và index ở migration `0003_reverse_lookup.sql`, còn API local/Worker nằm trong `apps/api/src/app.ts` và `apps/cloud/src/index.ts`.

## Roles, account ID và group safety

Migration `0004_groups_achievements.sql` thêm `roles`, `user_roles`, `study_groups`, `group_members`, `group_invites`, `group_deck_shares`, `review_events`, `badge_awards` và `users.study_uid`. SQLite `id` là UUID nội bộ; Firebase UID được lưu riêng trong `firebase_uid`. Study UID dạng `#` + 6 chữ số ngẫu nhiên, có unique index. `guest` là trạng thái chưa đăng nhập, không phải tài khoản/role gán trong database. Chỉ server được gán role `admin`; không nhận role từ request body.

- Group đôi tối đa 2 người; study group tối đa 5 người tính cả chủ nhóm. Trigger DB chặn thành viên vượt giới hạn.
- Khi tạo lời mời, server tra UID trong cơ sở dữ liệu, chỉ lưu người nhận + trạng thái + hạn hết hạn. Khi nhận lời, server xác minh lời mời còn hạn và kiểm tra membership limit trong một thao tác atomic.
- Leaderboard chỉ trả tên hiển thị, Study ID và số từ trong ngày/tuần; không trả danh sách từ cá nhân.
- `group_deck_shares` cấp quyền đọc deck cho thành viên nhóm; khi rời nhóm hoặc thu hồi chia sẻ, quyền đọc bị thu hồi.
- Admin CRUD từ điển phải kiểm tra role `admin` ở backend và ghi audit event; ẩn nút ở frontend không phải cơ chế phân quyền.

## Chỉ số và định nghĩa

Mỗi lần ôn tạo một `review_events` có `client_event_id` chống ghi trùng, UTC timestamp, timezone người dùng và `local_date` được backend tính. Ngày học mới bắt đầu 00:00 theo timezone IANA của user. Nguồn sự thật cho biểu đồ là event table.

- `learnedToday`: số `word_id` khác nhau có event hôm nay.
- `reviewing`: số từ đã thêm vào lịch nhưng chưa đạt mốc thuộc.
- `mastered`: số từ có 5 lần trả lời “đã nhớ” liên tiếp; “chưa nhớ” đặt `success_streak` về 0. Ngưỡng này đang được dùng cho huy hiệu.
- `streak`: đếm các ngày `local_date` liên tục có ít nhất một lượt ôn. Ngày nghỉ không tạo streak giả; không có phạt hay mất dữ liệu.
- Huy hiệu trao một lần khi tổng từ mastered đạt 50/100/500/1000; `badge_awards` có khóa `(user_id,badge_key)`.
- Leaderboard ngày/tuần nhóm lấy aggregate từ `review_events`, chỉ cho thành viên nhóm đó. Giao diện component poll mỗi 60 giây.

## Frontend và API đã nối

`apps/web/src/community.tsx` chứa `AchievementsDashboard` và `StudyCommunityDashboard`, hiện được mount trong app cho người đã đăng nhập. Cả hai gửi Firebase ID token dạng Bearer. API local hiện triển khai:

- `GET /api/community/me` → `{studyUid, metrics, groups, decks}`
- `GET /api/community/activity?days=84` → `{days: number[]}`
- `POST /api/groups` với `{name, kind}`
- `POST /api/groups/:id/invites` với `{studyUid}`
- `GET /api/groups/:id/leaderboard?period=day-week`
- `POST /api/groups/:id/decks` với `{deckId}`
- `GET /api/community/invites`, `PATCH /api/community/invites/:id` để nhận/từ chối lời mời.

Component gửi token; middleware `firebase-admin` kiểm tra chữ ký, `aud`, `iss`, `exp` và trạng thái thu hồi, ánh xạ Firebase UID sang profile/role SQLite. API nhóm kiểm tra membership cho từng truy vấn; endpoint không nhận user ID do frontend gửi.

## Còn cần cấu hình trước khi dùng Auth

Firebase Web SDK và Admin SDK đã được khai báo, cùng endpoint sync/RBAC và các API user/admin/group. Web config và ADC chưa có trong workspace, do đó sign-in thật chưa chạy cho tới khi cấu hình theo [AUTH_SETUP.md](AUTH_SETUP.md). Group/analytics/admin dùng SQLite của máy chạy Node; đây chưa phải backend internet-facing cho nhiều người.
