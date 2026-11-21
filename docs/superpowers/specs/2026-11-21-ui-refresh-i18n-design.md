# AgentSync — Làm mới giao diện, đa ngôn ngữ, dark mode

*Ngày: 2026-11-21 · Trạng thái: chờ duyệt · Nền tảng: AgentSync giai đoạn 1 (đã merge vào `main`)*

## 1. Mục đích và lý do

AgentSync sẽ được phát hành dạng **mã nguồn mở** cho người ngoài dùng. Vì vậy cần ba thứ:
- **Giao diện hiện đại, nhất quán.** Hiện màu được viết thẳng rải rác trong từng component, nên form trông mỗi nơi một kiểu.
- **Đa ngôn ngữ, gồm tiếng Việt và tiếng Anh.** Hiện toàn bộ chữ là tiếng Việt viết cứng, kể cả thông báo lỗi phía server và nội dung MCP trả cho agent.
- **Dark mode có nút chuyển.** Hiện chỉ tự theo cài đặt của hệ điều hành.

Người dùng đã chọn **hướng thiết kế A, "gọn, sắc nét"** (kiểu Linear/Vercel): nền trung tính, viền mảnh, một màu nhấn indigo, bo góc vừa phải. Mockup tham khảo nằm ở `.superpowers/brainstorm/*/content/visual-direction.html`, mục A.

## 2. Mục tiêu / Không phải mục tiêu / Phản mục tiêu

**Mục tiêu**
- Mọi màn hình (đăng nhập, trang chủ, trang một người, chi tiết việc, cài đặt, quản trị, 404, lỗi) dùng chung một hệ màu và một bộ component.
- **Mọi form** dùng chung một bộ thành phần:
  - Nhãn, gợi ý, và thông báo lỗi ngay dưới ô, kèm viền đỏ.
  - Nút chính, phụ, nguy hiểm, ghost.
  - Trạng thái "đang gửi" khi submit.
  - Toast báo thành công sau khi thao tác xong.
  - Hộp xác nhận trước mọi thao tác nguy hiểm: vô hiệu hóa người dùng, thu hồi token, hủy việc.
- Đa ngôn ngữ trọn vẹn (vi, en) cho:
  - giao diện web;
  - thông báo lỗi từ server;
  - nội dung MCP trả cho agent;
  - ngày giờ và thời gian tương đối;
  - skill của agent;
  - tài liệu.
- Dark mode có 3 lựa chọn: Theo hệ thống, Sáng, Tối. Không nháy màu khi tải trang.
- Đạt độ tương phản WCAG AA ở cả hai chế độ sáng và tối. Focus luôn nhìn thấy được khi dùng bàn phím.

**Không phải mục tiêu**
- Không đổi kiến trúc thông tin hay tính năng: các trang, dữ liệu hiển thị và luồng xác nhận/review giữ nguyên như giai đoạn 1. Thứ tự các mục trong từng trang có thể tinh chỉnh để dễ đọc hơn.
- Không thêm ngôn ngữ thứ ba. Cấu trúc file dịch phải cho phép thêm sau mà không sửa code.
- Không hỗ trợ ngôn ngữ viết từ phải sang trái (RTL), không làm trang giới thiệu hay marketing.

**Phản mục tiêu** (vẫn chạy nhưng coi là thất bại)
- Màn hình lẫn lộn hai ngôn ngữ, hoặc còn chuỗi chưa dịch.
- Trang bị nháy sáng hoặc tối sai khi tải.
- Còn form nào trông khác bộ chuẩn.
- Trang nặng hơn đáng kể so với hiện tại, hoặc gọi dịch vụ bên ngoài lúc chạy (vi phạm ràng buộc self-host).

## 3. Các cách đã cân nhắc

| Cách | Được | Mất | Kết luận |
|---|---|---|---|
| **1. Component kiểu shadcn/ui** (mã nguồn copy vào repo; Radix primitives + Tailwind + biến CSS), **next-intl** cho i18n, class `dark` đọc từ cookie | Phong cách mặc định gần đúng hướng A. Xử lý tốt bàn phím và trình đọc màn hình. Quen thuộc với người đóng góp mã nguồn mở. Tùy biến tự do | Thêm vài phụ thuộc Radix. Phải kiểm tra tương thích với Next 16 | **Đã chọn** |
| 2. Tự viết bộ component nhỏ, chỉ dùng Tailwind | Gần như không thêm phụ thuộc | Phải tự làm dropdown, hộp thoại, focus trap, dễ sót lỗi truy cập | Loại |
| 3. Thư viện UI trọn gói (MUI, Mantine) | Có sẵn nhiều thứ | Nặng, phong cách riêng khó ép về hướng A, xung đột với Tailwind | Loại |

## 4. Hệ thiết kế (design tokens)

Tất cả màu khai báo bằng biến CSS trên `:root` (chế độ sáng) và `.dark` (chế độ tối), rồi map vào theme của Tailwind v4 (`@theme inline`). **Component không được dùng mã màu trực tiếp** như `red-600` hay `#fff`. Chúng chỉ dùng token.

- **Nền và bề mặt:** `background`, `surface` (thẻ), `surface-muted`, `border`, `input`, `ring` (focus).
- **Chữ:** `foreground`, `muted-foreground`.
- **Màu nhấn:** `primary` và `primary-foreground`. Chế độ sáng dùng indigo-600, chế độ tối dùng indigo-400 (giống mockup A).
- **Ngữ nghĩa** (mỗi màu có bản nền nhạt và bản chữ):
  - `success`: đã xong, đúng hạn.
  - `warning`: có rủi ro, trễ hạn, lâu không cập nhật.
  - `danger`: đang kẹt, lỗi, thao tác nguy hiểm.
  - `info`: chờ review, chờ xác nhận.
- **Bảng ánh xạ duy nhất** từ trạng thái và sức khỏe của việc sang màu ngữ nghĩa, dùng chung cho badge, thanh timeline và mục cần chú ý. Hiện màu đang khai báo lặp lại ở nhiều nơi.
- **Kích thước:** bo góc `md` 6px cho ô nhập và nút, `lg` 8px cho thẻ. Bước khoảng cách theo Tailwind.
- **Font:** Inter, tự host bằng gói `@fontsource-variable/inter` đóng gói vào build, không tải từ mạng. Nếu không dùng được Inter thì quay về font hệ thống.
- **Icon:** `lucide-react`, đóng gói vào build.

## 5. Bộ component

Đặt tại `components/ui/*` theo cấu trúc của shadcn:
- **Cơ bản:** Button (primary, secondary, outline, ghost, destructive; size sm/md; trạng thái loading), Input, Textarea, Select (Radix), Checkbox, Label.
- **Form:** FormField, gồm nhãn, ô nhập, gợi ý và lỗi. Thuộc tính `aria-invalid` và `aria-describedby` được nối đúng.
- **Hiển thị:** Card, Badge (theo màu ngữ nghĩa), Avatar (ảnh, nếu không có thì chữ cái đầu), Separator, Skeleton, EmptyState.
- **Tương tác:** Dialog và AlertDialog (xác nhận thao tác nguy hiểm), DropdownMenu (menu người dùng, chọn ngôn ngữ, chọn giao diện), Toast (dùng `sonner`, cũng đóng gói vào build), Tooltip.
- **Khung trang:**
  - Header cố định gồm logo, điều hướng (Trang chủ, Cài đặt, Quản trị chỉ admin thấy), nút chọn ngôn ngữ, nút chọn giao diện và menu người dùng có mục đăng xuất.
  - Dưới 640px, điều hướng thu vào menu.
  - Nội dung giới hạn độ rộng, căn giữa.
- **Gửi form:** `ActionForm` hiện có được nâng cấp. Khi submit: nút chuyển sang loading và bị khóa. Khi lỗi: lỗi chung hiện ở đầu form, lỗi theo từng trường hiện dưới ô. Khi thành công: hiện toast.

## 6. Đa ngôn ngữ

**Thư viện:** next-intl, dùng chế độ không có tiền tố ngôn ngữ trong URL. URL giữ nguyên như giai đoạn 1.

**File dịch:** `messages/en.json` và `messages/vi.json`, chia theo namespace: `common`, `nav`, `auth`, `home`, `person`, `task`, `settings`, `admin`, `status`, `health`, `attention`, `errors`, `mcp`. Tiếng Anh là ngôn ngữ gốc. Một test bắt buộc hai file có cùng tập khóa.

**Cách chọn ngôn ngữ trên web** (theo thứ tự ưu tiên):
1. `users.locale`, cột mới, nullable, nhận `vi` hoặc `en`. Migration không gán giá trị cho tài khoản hiện có.
2. Cookie `locale`, dùng cho người chưa đăng nhập, ví dụ ở trang login.
3. Header `Accept-Language` của trình duyệt.
4. Biến môi trường **`DEFAULT_LOCALE`**, mặc định `en`. *(Người dùng đã chọn: mỗi bản cài tự đặt, server của team anh đặt `vi`.)*

**Cách chọn ngôn ngữ trên MCP:** `users.locale` của chủ token, nếu không có thì dùng `DEFAULT_LOCALE`. Không dùng cookie hay trình duyệt, vì agent không gửi hai thứ đó.

`DEFAULT_LOCALE` phải được ghi vào `.env.example`, `docker-compose.prod.yml` và README. Giá trị nằm ngoài danh sách `vi`/`en` thì quay về `en` và ghi cảnh báo vào log.

Đổi ngôn ngữ ở header hoặc ở trang Cài đặt sẽ ghi vào cả DB lẫn cookie.

**Ngoại lệ:** mô tả tool MCP và tham số (chuỗi `description` / `.describe()` trong `src/mcp/tools.ts`) viết bằng **tiếng Anh cố định**, không đưa vào file dịch. Đây là chữ cho agent đọc, không phải cho người dùng. Nội dung tool trả về thì vẫn dịch theo ngôn ngữ chủ token. *(Quyết định của tôi.)*

**Lỗi từ server:**
- `DomainError` có thêm `key` (khóa trong namespace `errors`) và `params`. Message tiếng Việt hiện tại chuyển vào `vi.json`.
- Web dịch lỗi theo ngôn ngữ người xem. MCP dịch theo ngôn ngữ của chủ token.
- `src/server` không được chứa chuỗi hiển thị cho người dùng nữa, chỉ còn khóa.

**Nhãn:**
- `src/server/labels.ts` được thay bằng các namespace `status`, `health`, `level`, `mode`, `attention`, `verdict`, `sendMode`, `action`.
- MCP `format.ts` nhận hàm dịch theo ngôn ngữ của người gọi.

**Ngày giờ:** dùng `Intl.DateTimeFormat` và `Intl.RelativeTimeFormat` theo ngôn ngữ, múi giờ vẫn là `Asia/Ho_Chi_Minh`. Múi giờ cấu hình được vẫn nằm ngoài phạm vi.

**Skill của agent:** viết lại bằng tiếng Anh, kèm quy tắc "trả lời member bằng ngôn ngữ họ dùng". Tên tool và field không đổi. Test plugin-files vẫn phải pass.

**Tài liệu:**
- `README.md` và `docs/install-agent.md` chuyển sang tiếng Anh làm bản chính.
- Bản tiếng Việt đặt ở `README.vi.md` và `docs/install-agent.vi.md`.
- Hai bản liên kết qua lại ở dòng đầu.

## 7. Dark mode

**Lựa chọn:** `system`, `light` hoặc `dark`, lưu ở `users.theme` (cột mới, mặc định `system`) và cookie `theme`.

**Chống nháy màu:**
- Layout gốc đọc cookie ở phía server rồi đặt sẵn class `dark` lên `<html>` khi người dùng chọn Tối.
- Với `system`, một script inline nhỏ trong `<head>` đặt class theo `prefers-color-scheme` trước khi trang hiển thị.
- Phải bỏ cách làm hiện tại là `@media (prefers-color-scheme)` trong `globals.css`.

**Nút chuyển:** dropdown ở header có 3 mục kèm icon. Trang Cài đặt có lựa chọn tương tự.

**Khi DB và cookie khác nhau** (ví dụ đăng nhập trên máy mới): sau khi đăng nhập, giá trị trong DB thắng và cookie được ghi lại theo DB. Ngôn ngữ cũng áp dụng quy tắc này. *(Quyết định của tôi.)*

## 8. Các trang

Áp dụng bộ component và token cho từng trang. Bố cục giữ nguyên như giai đoạn 1, chỉ nâng cấp cách trình bày:
- **Đăng nhập:** thẻ căn giữa, logo, chọn ngôn ngữ ngay trên trang.
- **Trang chủ:**
  - Mục "Cần anh chú ý" thành danh sách có icon theo loại và badge màu ngữ nghĩa.
  - Các tầng hiện thành lưới thẻ người. Thẻ có avatar, số liệu và badge "kẹt" / "chờ review" theo token. Badge đặt trong khung flex thay cho cách định vị tuyệt đối hiện tại.
  - Trạng thái rỗng dùng component EmptyState.
- **Trang một người:** timeline dùng màu ngữ nghĩa và giữ nhãn chữ trạng thái. Header có avatar và tóm tắt.
- **Chi tiết việc:**
  - Phần đầu là Card gồm badge trạng thái, thanh tiến độ và các nút hành động.
  - Xác nhận dùng nút primary. Yêu cầu sửa và Cần sửa mở Dialog có ô ghi chú bắt buộc, thay cho `<details>`.
  - Các khối còn lại là Card riêng.
  - "Xem thêm" chuyển thành "Thu gọn" khi đã mở.
- **Cài đặt:**
  - Các mục ngôn ngữ, giao diện, chế độ gửi, đổi mật khẩu và token tách thành Card riêng.
  - Token mới hiện một lần, có nút copy kèm toast "Đã sao chép".
  - Thu hồi token phải qua AlertDialog.
- **Quản trị:**
  - Desktop hiện bảng người dùng, mobile hiện thẻ.
  - Sửa người dùng trong Dialog. Vô hiệu hóa phải qua AlertDialog.
  - Ô ngưỡng "lâu không cập nhật" dùng FormField.
- **404 / lỗi:** dùng EmptyState, đã dịch theo ngôn ngữ.

## 9. Ràng buộc

- Giữ nguyên các ràng buộc toàn cục của giai đoạn 1:
  - phân quyền theo quản lý trực tiếp;
  - việc riêng tư chỉ chủ việc thấy;
  - không gọi dịch vụ ngoài lúc chạy;
  - self-host bằng Docker;
  - container chạy với user không phải root.
- Mọi test hiện có (vitest, Playwright, plugin-files) vẫn phải pass. Selector e2e đang dựa vào chữ tiếng Việt thì chuyển sang `data-testid` hoặc chạy với locale cố định.
- Thêm e2e cho:
  - chuyển ngôn ngữ (chữ trên trang đổi và giữ nguyên sau khi reload);
  - chuyển giao diện (class `dark` giữ nguyên sau khi reload và không nháy);
  - lỗi form hiển thị đúng ngôn ngữ;
  - không cuộn ngang ở chiều rộng 375px.
- Migration DB thêm `users.locale` và `users.theme`.
- Next.js 16: đọc tài liệu trong `node_modules/next/dist/docs/` trước khi viết code (theo AGENTS.md). Kiểm tra next-intl và Radix chạy được với Next 16 và React 19.

## 10. Để builder quyết định

- Bảng màu chi tiết (giá trị OKLCH hoặc hex) theo đúng tinh thần mockup A, miễn là đạt tương phản AA ở cả hai chế độ.
- Cách chia file dịch bên trong từng namespace.
- Dùng CLI shadcn hay copy tay. Kết quả phải là mã nằm trong repo.
- Chi tiết animation, nếu có thì nhẹ và tôn trọng `prefers-reduced-motion`.
