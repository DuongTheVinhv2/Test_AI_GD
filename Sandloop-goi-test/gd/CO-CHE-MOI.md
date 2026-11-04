# Cơ chế mới (đối chiếu sand-storm-2) và các thay đổi so với bản gốc

Nguồn đối chiếu: `D:\Project\sand-storm-2` (đọc `MechanicDescription.asset`, `Level_N.asset`, các lớp `*Mechanic`, `Tunnel`, `DirectionalKey`).

## 1. Năm cơ chế xuất hiện sớm nhất trong sand-storm-2

Thứ tự xuất hiện (số màn là số màn thật của sand-storm-2, đọc từ dữ liệu màn, đối chiếu với popup hướng dẫn):

| # | Cơ chế (tên trong sand-storm-2) | Màn đầu tiên | Trạng thái trong Sandloop |
|---|---|---|---|
| 0 | Wall (ô bị chặn) | 3 | **Đã có** từ trước: ô `x` (hố) trên bàn |
| 1 | Hidden (`hidden_bucket`) | 5 | **Đã có** từ trước: xô `?`. Giữ nguyên, xem mục 2.1 |
| 2 | Tunnel (`tunnels`) | 11 | **Mới**, màn 11 |
| 3 | Frozen (`sand_crust`) | 21 | **Mới**, màn 12 |
| 4 | DirectionalKey (`direction_rod`) | 32 | **Mới** (gọi là "thanh chắn"), màn 13 |
| 5 | Key / Lock (`key_and_lock`) | 42 | **Mới**, màn 14 |

Tôi tính "5 cơ chế sớm nhất" là Hidden, Tunnel, Frozen, DirectionalKey, Key/Lock (Wall chỉ là địa hình và Sandloop đã có sẵn ô hố). Nếu bạn muốn tính Wall là một trong năm thì Key/Lock chỉ là cơ chế thứ sáu, làm dư ra, không ảnh hưởng gì.

Màn 15 (Castle, đánh dấu HARD) trộn tất cả.

## 2. Logic từng cơ chế và chỗ khác với sand-storm-2

### 2.1 Hidden / xô `?` (không đổi)
- sand-storm-2: xô bị che khi cả 4 ô lân cận đều có xô, lộ ra khi một xô chắn ban đầu rời đi.
- Sandloop: xô `?` lộ màu khi **một ô sàn lân cận trống** (ô trống do xô rời đi, do hầm vừa nhả xô thì không tính, do thanh chắn còn đóng thì không tính).
- Hai luật cho cùng kết quả trong thực tế nên giữ nguyên, không đổi. Điều duy nhất đổi: ô nằm dưới thanh chắn còn đóng không được tính là "trống".

### 2.2 Tunnel / hầm (màn 11)
- sand-storm-2: hầm có hướng và hàng đợi xô; khi ô trước mặt trống thì nhả xô kế tiếp ra ô đó; viền đổi màu theo xô sắp ra.
- Sandloop: giống luật nhả. Khác:
  - Hầm là một **ô riêng trên bàn** (ô `t`), không đi được, có 4 hướng, mặt hầm luôn hướng vào một ô sàn.
  - Hàng đợi ghi sẵn trong dữ liệu màn (`tunnels: [{ r, c, dir, queue: ['1','7'] }]`).
  - Trên hầm có **vòng tròn tô đúng màu xô sắp ra** và **số xô còn lại** (sand-storm-2 chỉ hiện màu viền và số).
  - Nhả xô được xử lý ngay trong lượt bấm làm trống ô (không chờ hoạt ảnh); xô trượt ra khỏi miệng hầm trong 0,4 giây.
  - Xô trong hầm đã tính vào số xô của màn (chia cát, bộ đếm chặng cuối x3).
  - Hầm có thể nhả ngay từ đầu nếu ô trước mặt trống (màn 11 cố ý để ô trước mặt có xô).
- Tại sao: người chơi nhìn thấy trước màu sắp ra nên lập kế hoạch được, không phải đoán.

### 2.3 Frozen / xô đóng băng (màn 12)
- sand-storm-2: xô có số lượt, **mỗi lần bất kỳ xô khác di chuyển** thì giảm 1; về 0 thì tan.
- Sandloop (**khác**): số trên băng giảm khi **một xô trên băng chuyền đầy và nổ (pop)**, không phải mỗi lần bấm.
  - Lý do: bấm là hành động rẻ, người chơi có thể bấm bừa để tan băng. Pop phải đi vòng băng chuyền, nên băng tan theo nhịp thật của màn.
  - Quy tắc **chống thua oan**: nếu người chơi hết nước đi (không xô nào mở được, không xô nào trên băng chuyền còn hút được) mà vẫn còn xô đóng băng, tất cả băng tan ngay. Một màn không bao giờ thua chỉ vì một bộ đếm. (sand-storm-2 không có luật này.)
  - Bấm vào xô đóng băng: lắc và báo "Frozen: it thaws when more buckets fill up and pop".
  - Khai báo: token `F2:1` = đóng băng 2 pop, màu 1.

### 2.4 Thanh chắn (DirectionalKey, màn 13)
- sand-storm-2: thanh dài `size` ô, quay về một hướng, chặn các ô; khi ô trước đầu thanh trống thì thanh rung và trượt ra, xóa chặn.
- Sandloop: giữ luật (ô trước đầu thanh trống thì thanh trượt đi, mở vĩnh viễn). Khác:
  - Thanh nằm đè lên các ô sàn **trống** (không có xô dưới thanh; dữ liệu sai sẽ báo lỗi ngay khi tải màn).
  - Đường đi của xô (BFS) không xuyên qua thanh đang đóng; xô `?` cũng không coi ô dưới thanh là "trống".
  - Thanh có mũi tên ở đầu cho biết ô nào cần làm trống; khi mở nó trượt một ô theo hướng mũi tên và mờ dần (0,5 giây).
  - Khai báo: `rods: [{ r, c, dir, size }]`, (r, c) là ô đầu thanh, thân kéo lùi `size - 1` ô.
  - Nếu ô trước mặt trống ngay từ đầu thì thanh mở luôn (vô nghĩa), nên đặt xô lên ô đó.

### 2.5 Key / Lock, chìa khóa (màn 14)
- sand-storm-2: bấm xô chìa thì chìa bay tới xô khóa cùng màu và mở ngay.
- Sandloop (**khác**): xô khóa mở khi **xô chìa cùng cặp đã đầy và nổ**, không phải lúc bấm.
  - Lý do: nếu mở ngay lúc bấm thì chìa chỉ là "bấm xô này trước". Phải đổ đầy xô chìa nên chìa có giá trị thật, và xô chìa ưu tiên hút được.
  - Cặp đánh số 1 đến 9 (`K1:5` xô chìa màu 5, `L1:5` xô khóa màu 5); màu biểu tượng theo cặp (vàng, hồng, xanh trời, tím) để tách các cặp.
  - Xô chìa vẫn là xô thường (có biểu tượng chìa ở góc), xô khóa là phiến xám có ổ khóa, không bấm được.
  - Bấm xô khóa: "Locked: fill the key bucket first".
  - Không có luật chống thua oan cho khóa, vì xô chìa luôn bấm được nếu màn thiết kế đúng. Màn không hợp lệ (khóa mà không có chìa) là lỗi thiết kế.

## 3. Cú pháp dữ liệu màn

```
tiles   : '.' trống  'o' sàn  'x' hố  't' miệng hầm
buckets : '5' xô thường màu 5   '?5' xô bí ẩn   'F2:5' xô băng 2 pop   'K1:5' xô chìa 1   'L1:5' xô khóa 1
tunnels : [{ r, c, dir: 'u'|'d'|'l'|'r', queue: ['1','7'] }]
rods    : [{ r, c, dir, size }]
```

Chi tiết cài đặt: `src/core/grid.ts` (luật), `src/core/game.ts` (sự kiện, luật chống thua oan), `src/render/boardview.ts` (hầm, thanh chắn), `src/render/bucketmodel.ts` (băng, khóa, chìa).

## 4. Các màn mới

| Màn | Tên | Cơ chế | Ghi chú |
|---|---|---|---|
| 11 | Apple | 2 hầm, 4 xô trong hầm | bàn 5x3 + hàng hầm |
| 12 | Mushroom | 2 xô băng (2 pop, 3 pop) | bàn 5x3 |
| 13 | Sunflower | 1 thanh chắn dài 3 ô | bàn 5x4 |
| 14 | Rocket | 2 cặp chìa/khóa | bàn 5x4 |
| 15 | Castle (HARD) | hầm + băng + chìa/khóa + thanh chắn + xô `?` | bàn 5x5 + hầm |

Năm bức tranh mới vẽ bằng `qa/gen-art.py`. Màu xô của từng màn được chọn bằng `qa/mech-search.ts`: giữ nguyên bàn và cơ chế, hoán vị màu xô, chọn bố cục mà bot "exposed" thắng gần tỉ lệ mục tiêu (bảng kết quả ở cuối file).

## 5. Hạn chế đã biết

- **Công cụ thiết kế web (`designer.html`) chưa hiểu các token mới** (`F`, `K`, `L`, hầm, thanh chắn). Màn có cơ chế mới phải sửa tay trong `src/core/level-data.ts`. Màn cũ 1 đến 10 vẫn dùng được trong designer như trước.
- Bot đo độ khó dùng "xô mở được" của `Game`, nên hiểu đúng cơ chế mới; chính sách `lookahead` của bot chưa mô phỏng việc băng tan / khóa mở khi duyệt trước, nên số `lookahead` ở các màn có băng thấp hơn thực tế.
- Chưa có hướng dẫn bắt buộc: mỗi cơ chế chỉ hiện một thông báo giải thích ở màn đầu tiên có nó (một lần duy nhất).

## 6. Kết quả đo bằng bot (30 seed mỗi màn, `qa/difficulty-sim.ts`)

| Màn | Xô | random | exposed | lookahead |
|---|---|---|---|---|
| 11 Apple | 16 (4 trong hầm) | 27% | 87% | 90% |
| 12 Mushroom | 15 | 37% | 80% | 47% (*) |
| 13 Sunflower | 15 | 0% | 50% | 93% |
| 14 Rocket | 17 | 47% | 70% | 70% |
| 15 Castle (HARD) | 20 (2 trong hầm) | 10% | 53% | 97% |

(*) `lookahead` không mô phỏng băng tan nên thấp giả ở màn có băng.

Bot không phải người thật: dùng để chắc chắn màn **thắng được** và để so độ khó giữa các màn, không phải số liệu cuối. Màn 11 dễ nhất (87%) là cố ý vì là màn giới thiệu hầm. Các màn 1 đến 10 không đổi (màn 7 đến 10 vẫn gần 0% với bot, đã ghi từ trước).

Khi làm màn mới đã gặp một lỗi đáng nhớ: tranh có một nhóm điểm ảnh màu mà **không có xô nào** màu đó (ô sáng của hoa, ngọn lửa tên lửa) thì cát màu ấy không bao giờ hút được và màn không thể thắng. `qa/mech-check.ts` giờ báo `!!` cho mọi màu có cát mà không có xô; hiện cả 15 màn đều sạch.

## 7. Cách kiểm tra lại

```
npx tsx qa/mech-unit.ts       # luật 4 cơ chế (hầm, băng, thanh chắn, chìa), chặng cuối x3
npx tsx qa/hearts-check.ts    # luật tim (hồi, mất, vô hạn, chỉnh đồng hồ)
npx tsx qa/mech-check.ts 1,2,...,15   # xô/cát từng màn, báo màu cát không có xô
node qa/flow-check.mjs        # luồng thật trong Chrome: tim, hết tim, mua, quà ngày, x3
node qa/meta-ui-check.mjs     # chụp ảnh menu, cửa hàng, màn 11 đến 15 vào qa/results/new-*.png
```
