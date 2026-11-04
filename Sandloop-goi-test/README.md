# Sand Loop

Game puzzle xếp xô hút cát, làm bằng three.js (TypeScript + Vite). 15 màn.

## Chạy game

Cần Node.js 22 (hoặc 20.19 trở lên).

```
npm install
npm run dev        # mở http://127.0.0.1:5173
npm run build      # kiểm tra kiểu + build vào dist/
npm run preview    # chạy bản build ở http://127.0.0.1:4173
```

`dist/index.html` là một file duy nhất (đã gói sẵn script, style, font), bấm đúp là chơi được.

## Luật chơi

- Một bức tranh pixel làm bằng cát (32 x 32 điểm ảnh, mỗi điểm 4 x 4 hạt). Cát rơi và chồng lên nhau như cát thật.
- Dưới tranh là băng chuyền, chứa tối đa 5 xô, xếp vào các ô cách đều nhau. Xô chạy dọc băng chuyền và chỉ hút cát **đúng màu của nó**
  ở đáy tranh, trong tầm gần xô. Một lớp cát màu khác dày từ 4 hạt trở lên sẽ chặn xô.
- Xô đầy thì nổ và nhường chỗ. Hút hết cát là thắng.
- Các xô nằm trên bảng bên dưới. Chỉ bấm được xô có đường ô trống dẫn lên hàng trên cùng. Xô có dấu `?` giấu màu cho tới khi ô bên cạnh trống.
- Thua khi không xô nào trên băng chuyền hút được nữa và không thể thêm xô có ích: **băng chuyền kẹt**.
- Kích thước xô không đặt tay: các xô cùng màu chia đều đúng lượng cát màu đó.
- Cơ chế thêm (màn 11 đến 15): **hầm** nhả xô khi ô trước mặt trống, **xô đóng băng** tan sau vài xô nổ, **thanh chắn** trượt đi khi ô trước mũi tên trống, **chìa/khóa** (khóa mở khi xô chìa đầy và nổ). Xem `gd/CO-CHE-MOI.md`.
- Chặng cuối: còn 5 xô cuối thì cả màn tự chạy x3, bất kể nút x1/x2 (hằng số `FINAL_STRETCH` trong `config.ts`).
- Main menu: đường đi qua các màn, nút Play, tim, xu, quà ngày, cửa hàng. Trong màn: Tạm dừng có nút Home.
- Tim: tối đa 5, hồi 1 tim/20 phút; mất 1 tim khi thua rồi rời màn thua (Undo thì không mất) hoặc rời giữa màn. Hết tim thì không vào màn được: mở cửa hàng hồi tim bằng xu hoặc xem quảng cáo (giả lập).
- Booster (nút ở mép dưới màn): Hand Pick (mở ở màn 5), Sand Pull (màn 8), Shuffle (màn 11); 100 đến 150 xu, mua ở cửa hàng hoặc ngay trong màn. Dùng booster thì mất thưởng lượt đầu.
- Thưởng: 25 xu khi qua màn lần đầu (màn HARD 50), thêm 10 xu nếu qua ngay lượt đầu, 5 xu khi chơi lại; quà ngày 7 ngày. Xu tiêu vào tim. Đề xuất booster và vòng sink - source: `gd/ECONOMY-SINK-SOURCE.md`.

## Cấu trúc mã

```
src/core      luật và mô phỏng (không vẽ): sand.ts, grid.ts, game.ts, levels.ts, level-data.ts, art-data.ts, economy.ts, config.ts
src/render    cảnh three.js: shader cát, khung tranh, băng chuyền, bảng, xô, cúp, bầu trời, hạt, hậu kỳ
src/audio     âm thanh và nhạc tạo bằng WebAudio, rung
src/app       luồng màn hình, tim (hearts.ts) và lưu tiến trình (localStorage)
src/ui        giao diện DOM: HUD, màn hình tiêu đề, tạm dừng, thắng, thua, chọn màn
gd            bộ dữ liệu phân tích 10 màn (xlsx và csv, tiếng Việt)
```

Những chỗ hay cần sửa:

- `src/core/level-data.ts`: bàn cờ, xô và tranh của từng màn. Mỗi xô là một mã màu viết theo cơ số 36, `?` đứng trước là xô bí ẩn, `.` là ô trống.
- `src/core/config.ts`: tốc độ băng chuyền, tầm hút, tốc độ mô phỏng.
- `src/core/economy.ts`: xu thưởng, giá, tim, quà ngày.
- `src/core/game.ts`: luật băng chuyền, điều kiện thắng thua.

Mô phỏng chạy cố định 150 bước mỗi giây và không phụ thuộc phần vẽ, nên có thể viết script chạy luật trong `src/core` mà không cần trình duyệt.

## Gửi lại

1. Xóa thư mục `node_modules` (cài lại được bằng `npm install`).
2. Kiểm tra `npm run build` chạy không lỗi.
3. Nén cả thư mục và gửi lại, kèm một file `THAY-DOI.md` ghi: đã sửa gì, vì sao, và đã kiểm tra bằng cách nào.
