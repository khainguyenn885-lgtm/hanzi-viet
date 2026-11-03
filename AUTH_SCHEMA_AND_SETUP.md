# Tài khoản, thư viện và ôn tập

## Schema hiện tại

MVP dùng SQLite khi chạy trên máy và Cloudflare D1 khi publish. Migration `apps/cloud/migrations/0002_offline_learning.sql` tạo bảng tài khoản, danh tính đăng nhập, bộ từ cá nhân, lịch ôn và góp ý. Bảng `users` chỉ chứa Firebase UID và hồ sơ công khai; mật khẩu/OTP không được lưu vào SQLite.

| Bảng | Mục đích | Khóa/index chính |
| --- | --- | --- |
| `users` | Hồ sơ, email/điện thoại, avatar, cấp HSK theo dõi | UUID nội bộ; `firebase_uid` và `study_uid` unique |
| `user_auth_identities` | Liên kết email, Facebook và phone OTP với user | PK `(provider, provider_uid)` |
| `user_decks` | Nhiều bộ từ riêng của từng user | `UNIQUE(user_id, name)` |
| `user_deck_words` | Từ từ điển hoặc từ tự nhập trong deck | `deck_id`; lưu các trường custom khi không có `word_id` |
| `flashcard_reviews` | Lịch ôn từng từ của từng user | PK `(user_id, word_id)`; index `(user_id, due_at)` |
| `feedbacks` | Góp ý phân loại, nội dung, ảnh đã nén, trạng thái | `id`, `created_at`, tùy chọn `user_id` |
| `review_events`, `daily_study_stats` | Sự kiện ôn chống gửi trùng và tổng hợp theo múi giờ | `(user_id, client_event_id)`, `(user_id, study_date)` |
| `roles`, `user_roles`, `admin_audit_log` | RBAC và audit admin | role membership và actor/action/entity |
| `study_groups`, `group_members`, `group_invites`, `group_deck_shares` | Nhóm Study UID, giới hạn thành viên và chia sẻ deck | unique membership; trigger tối đa 2/5 người |
| `vocabulary` | Từ điển tĩnh HSK | index theo Hán tự, cấp và Pinyin chuẩn hóa |

SQLite tạo `INTEGER PRIMARY KEY AUTOINCREMENT`; PostgreSQL tương ứng bằng `BIGINT GENERATED ALWAYS AS IDENTITY`. `due_at` dùng Unix milliseconds UTC để tránh lỗi múi giờ. Không lưu mật khẩu thô ở bất kỳ bảng nào.

## Lịch flashcard

Hành vi được cài trong `apps/web/src/App.tsx`:

```ts
dueAt = Date.now() + (remembered ? 24 * 60 * 60_000 : 5 * 60_000);
```

- Vuốt phải / phím →: đánh dấu đã nhớ, hẹn sau 24 giờ.
- Vuốt trái / phím ←: đánh dấu chưa nhớ, đưa lại hàng đợi sau 5 phút.
- Space lật thẻ. Trên mobile, thao tác vuốt dùng Pointer Events nên không cần thư viện gesture ngoài.
- Lịch bản local lưu trong SQLite `flashcard_reviews`; mỗi lượt đồng bộ vào `review_events` và `daily_study_stats` sau khi backend xác thực Firebase ID token.

## Thiết lập đăng nhập email, Facebook và phone OTP

Firebase Authentication có thể cung cấp cả ba phương thức qua cùng một Firebase UID. Cấu hình dự án:

1. Tạo Firebase project và ứng dụng Web. Bật Email/Password, Phone và Facebook trong Authentication → Sign-in method.
2. Tạo Facebook app ở Meta for Developers, thêm OAuth redirect URI mà Firebase hiển thị; nhập App ID/Secret trong Firebase Console. Giới hạn domain callback và domain được phép.
3. Phone Auth cần bật số điện thoại, reCAPTCHA/anti-abuse và giới hạn SMS. Dùng số kiểm thử khi phát triển; kiểm tra cước và quota trước khi mở công khai.
4. Đưa Firebase web config vào biến `VITE_FIREBASE_*` của frontend (Firebase web `apiKey` là cấu hình public, không phải service credential). Không commit service-account key.
5. Frontend dùng Firebase SDK để đăng nhập, lấy ID token và gửi `Authorization: Bearer <ID token>` đến backend. Không tin `user_id` do client tự gửi.
6. Backend xác thực chữ ký, `aud`, `iss`, `exp` của ID token bằng Firebase Admin SDK (Node local) hoặc thư viện xác minh JWT tương thích Workers; sau đó upsert `users` và `user_auth_identities`. Chỉ API đã xác thực mới được đọc/ghi deck, review và profile.
7. Bật liên kết provider trong Firebase để người dùng có thể gắn email, Facebook và phone vào cùng UID. Không tự gộp tài khoản chỉ vì email trùng nếu provider chưa xác minh email.

**Trạng thái cấu hình:** mã frontend/backend và RBAC đã được nối. Workspace chưa có giá trị Web config hay ADC credentials nên đăng nhập thật chưa thể chạy cho đến khi cấu hình theo [AUTH_SETUP.md](AUTH_SETUP.md). Không gửi service-account private key qua chat hoặc commit vào Git.

## Góp ý

`FeedbackForm` trong `apps/web/src/App.tsx` nhận một trong bốn loại, nội dung và ảnh tùy chọn. Ảnh được scale tối đa 1200 px, mã hóa JPEG rồi kiểm tra giới hạn 650 KB trước khi gửi đến `/api/feedback`; API giới hạn kích thước, loại ảnh và ghi vào bảng `feedbacks`. Chỉ admin đọc/cập nhật phản hồi qua `/api/admin/feedbacks`.

## Giới hạn bộ HSK

File `hsk30-master` gộp các từ cấp 7, 8, 9 thành nhãn `7-9`. Không có dữ liệu nguồn để phân rã đáng tin cậy thành ba cấp riêng. UI vì thế giữ rõ nhãn **HSK 7–9 (gộp)**; không tự suy đoán cấp cụ thể. `hsk30-grammar.csv` và `hsk30-chars.csv` là dữ liệu phụ riêng, không phải nghĩa từ hay ví dụ câu.
