# Vòng sink - source của Sandloop

Đối chiếu từ `D:\Project\sand-storm-2` (đọc `HeartSystem`, `BoosterController`, `DailyGiftConfigSO`, `IAPProductSO`, `LevelMetaConfig`). Các hằng số của bản Sandloop nằm tập trung trong `src/core/economy.ts`.

## 1. Sand-storm-2 làm gì (số liệu đọc từ dự án)

**Nguồn xu**: thưởng thắng màn (Normal 25, Hard 50, Extreme 75), gấp đôi thưởng bằng quảng cáo, quà ngày 7 ngày (50 đến 150 xu), 100 xu miễn phí mỗi 24 giờ, mỗi quảng cáo thêm 100 xu (tối đa 5 lần/ngày), nhiệm vụ ngày/tuần (150 đến 500 xu), thử thách ngày (100 đến 200), IAP.
**Tiêu xu**: booster 300 xu/cái, hồi đầy tim 500 xu, hồi sinh khi sắp thua 500 xu và tăng 500 mỗi lần kẹt, mua thêm ô băng chuyền (số lần mua + 1) x 500, chơi lại thử thách ngày 100, đặt lại nhiệm vụ 150 x 2^(n-1), avatar và khung.
**Tim**: tối đa 5, hồi 1 tim mỗi 20 phút (giá trị từ xa; file cấu hình ghi 10 phút). Mất tim khi **thua rồi chơi lại / về menu** và khi **rời giữa màn** qua popup "Keep playing". Thắng không mất, không hoàn tim. Hết tim thì Play mở popup hồi tim: xem 1 quảng cáo được 1 tim, hoặc 500 xu hồi đầy, hoặc chờ. Có "tim vô hạn" tính bằng phút (quà ngày, gói IAP).
**Booster**: AutoFill (hút mọi cát cùng màu vào một xô trên băng chuyền), HandPick (đưa thẳng một xô trên bàn lên băng chuyền, bỏ qua đường đi), Shuffle (xáo vị trí các xô trên bàn). Mở khóa ở màn 1/4/8, tặng 2 cái ở màn hướng dẫn, 300 xu hoặc 1 quảng cáo mỗi cái.

## 2. Đã làm trong Sandloop (đổi so với bản trước)

### Tim (`src/app/hearts.ts`, hằng số trong `economy.ts`)
| | Sandloop | sand-storm-2 |
|---|---|---|
| Tối đa | 5 | 5 |
| Hồi | 20 phút/tim, đồng hồ là mốc thời gian nên đóng tab vẫn hồi, phần dư không mất | giống |
| Mất tim | thua (trừ khi **rời** màn thua mà không Undo), rời/Restart/Home giữa màn đã bấm ít nhất 1 lần | thua rồi chơi lại / về menu; rời giữa màn |
| Không mất | bắt đầu màn, thắng, Undo sau khi thua, reload hoặc đóng tab giữa màn | giống (bản gốc cũng không phạt đóng app) |
| Hết tim | Play hoặc Retry mở cửa hàng "Out of hearts", không vào màn | popup hồi tim |
| Hồi tim | 40 xu/tim thiếu (đầy từ 0 là 200), xem quảng cáo (demo) +1 tim, chờ | 500 xu hồi đầy, quảng cáo +1 |
| Vô hạn | 30 phút = 250 xu, cộng dồn nếu mua thêm; quà ngày cũng tặng | tính bằng phút, cộng dồn |
| Chỉnh đồng hồ máy | lùi giờ: neo lại, không cộng tim âm; tiến giờ: được tim (như bản gốc, không có máy chủ) | không chống |

Khác một chút: Sandloop tính "thua" lúc người chơi **rời màn thua**, nên nút Undo trên màn thua miễn phí thật sự (bản gốc trừ lúc bấm Replay/Home).

Quảng cáo trong bản này **chỉ là giả lập** (2,5 giây rồi cộng tim): chưa có SDK quảng cáo.

### Nguồn xu (`economy.ts`)
- Qua màn lần đầu: 25 xu, màn HARD 50 xu (mới, theo sand-storm-2).
- Qua ngay lượt đầu và không Undo: +10.
- Chơi lại: 5.
- Quà ngày 7 ngày (mới): 50 xu / 100 xu / +2 tim / 100 xu + 10 phút vô hạn / 100 xu / +3 tim / 150 xu + 20 phút vô hạn. Mỗi ngày dương lịch nhận một lần; bỏ lỡ không mất chuỗi (chuỗi chạy tiếp ngày kế).

### Nơi tiêu xu hiện có
Tim (hồi tim, tim vô hạn) và booster (150 / 150 / 100 xu). Phần còn lại ở mục 4 là đề xuất.

## 3. Booster (đã cài, 3 cái)

Chọn theo **kiểu thua thật** của Sandloop (`failReason` trong `app.ts`): (a) băng chuyền đầy mà không xô nào khớp cát ở mép đáy, (b) không xô nào trên bàn thoát ra được, (c) lớp cát màu khác dày chặn xô.

| # | Booster | Làm gì | Giải quyết | Giá / mở khóa |
|---|---|---|---|---|
| 1 | **Hand Pick** | Bấm một xô bất kỳ trên bàn, xô bay thẳng lên băng chuyền, bỏ qua đường đi bị chặn. Xô băng / xô khóa bị từ chối; xô `?` thì lộ màu | thua kiểu (b) | 150 xu; mở ở màn 5; tặng 2 cái |
| 2 | **Sand Pull** | Chọn một xô đang chạy trên băng chuyền, hút ngay cát đúng màu của nó từ cả bức tranh cho tới khi đầy (mỗi cột lấy hạt thấp nhất của màu đó, nên lớp chặn mỏng đi) | thua kiểu (a)(c) | 150 xu; mở ở màn 8; tặng 2 cái |
| 3 | **Shuffle** | Các xô thường còn trên bàn (không `?`, băng, chìa, khóa, không ở trong hầm) đổi màu cho nhau; cỡ xô đi theo màu nên cát vẫn vừa đủ; bảo đảm ít nhất một xô đang bấm được đổi màu | kẹt do bố cục xấu | 100 xu; mở ở màn 11; không tặng |

Cách dùng trong màn: ba nút ở mép dưới màn hình. Có booster thì nút hiện số lượng; hết thì hiện giá và bấm vào sẽ hỏi mua (có đủ xu mới hỏi); chưa mở khóa thì hiện "Lv N". Hand Pick và Sand Pull chuyển sang chế độ chọn mục tiêu: **cả màn đứng yên** (như sand-storm-2), mục tiêu sáng lên, bấm lại nút hoặc Esc hoặc Pause để hủy mà không mất booster. Shuffle dùng ngay.

Luật đi kèm:
- Dùng bất kỳ booster nào là mất thưởng "qua ngay lượt đầu" (như Undo) và lịch sử Undo bắt đầu lại, vì khôi phục lại trước lúc dùng booster sẽ làm mất booster mà không có tác dụng.
- Booster được tặng một lần, lúc vào màn mở khóa nó lần đầu.
- Cửa hàng có tab Boosters (mua ở menu); quà ngày 5 tặng 1 Hand Pick, ngày 7 tặng 1 Sand Pull.
- Bảng cheat có nút `+3 boosters`.

Không làm "mua thêm ô băng chuyền" như sand-storm-2: ô của Sandloop cách đều nhau theo thời gian (`LOOP_TIME / slots`), thêm ô giữa màn sẽ làm mọi xô đang chạy nhảy vị trí. Nếu muốn, làm thành quyền lợi **hồi sinh** (xem 4.3).

Nên chỉnh **Undo hiện tại**: 3 lần miễn phí mỗi lượt làm giảm nhu cầu booster. Gợi ý: 1 lần miễn phí, các lần sau 50 xu hoặc 1 quảng cáo. (Chưa đổi.)

Cài đặt: `Game.handPick / sandPull / shuffleBoard` trong `src/core/game.ts`, `SandSim.take` trong `sand.ts`, giá và mở khóa trong `economy.ts` (`BOOSTERS`), luồng dùng và mua trong `app.ts`, nút trong `ui.ts`. Test: `qa/mech-unit.ts` (luật) và `qa/flow-check.mjs` (luồng thật trong Chrome).

## 4. Đề xuất cho vòng sink - source

### 4.1 Vấn đề của bản hiện tại (đo bằng bot)
Thu nhập qua 15 màn: khoảng 12 x 25 + 3 x 50 = **450 xu** nếu qua hết lần đầu, tối đa **600 xu** nếu lượt nào cũng qua ngay. Quà ngày thêm khoảng 70 xu/ngày. Trước khi có booster, tiền tiêu duy nhất là tim: một lần hồi đầy 200 xu. Giờ thêm booster 100 đến 150 xu mỗi cái (xem mục 3).
- Người chơi giỏi (thua ít hơn 1 lần mỗi 5 màn) có 5 tim đủ cho cả game, **không bao giờ chạm tường tim**, xu tích lũy không có chỗ tiêu.
- Người chơi trung bình bấm sai khoảng 0,3 đến 0,5 lần mỗi màn (bot "exposed" thắng khoảng 55 đến 80% ở các màn mới nên người thật chắc cao hơn một chút nhờ Undo): hết 5 tim sau khoảng 10 đến 15 màn, đúng lúc có khoảng 250 xu: đủ để hồi tim một lần. Vòng tim chạy được nhưng chỉ có **một** cái để tiêu.

### 4.2 Tỉ lệ nên giữ
- Một lần "chữa cháy" (hồi tim hoặc hồi sinh) nên bằng 4 đến 8 lần thưởng một màn thường (100 đến 200 xu).
- Một booster bằng 4 đến 6 lần thưởng một màn (100 đến 150 xu); sand-storm-2 đặt 12 lần (300) vì họ có 700 màn và nhiều nguồn xu hơn.
- Tổng tiền tiêu của một người chơi tích cực nên bằng 70 đến 90% tổng tiền kiếm: dư xu thì mất lý do chơi tiếp, thiếu xu quá thì chặn tiến trình. Giữ phần dư nhỏ, khoảng 10 đến 30%, để người chơi thấy mình "giàu lên".
- Tường tim không nên xuất hiện trước màn 10. Lúc 5 tim đủ cho người trung bình ở mười màn đầu thì đúng ý đồ.

### 4.3 Các mắt xích nên thêm (theo thứ tự ưu tiên)
1. **Booster (mục 3, đã cài)**: sink chính, tiêu 100 đến 150 xu mỗi lần. Tặng 2 cái ở màn mở khóa để người chơi nếm. Cần đo xem người chơi có mua không (mục 4.4).
2. **Hồi sinh khi kẹt** (sink thứ hai): màn thua có nút "Tiếp tục" giá 100 xu, +100 mỗi lần kẹt trong cùng một màn (sand-storm-2: 500 + 500 mỗi lần). Hiệu ứng: lấy lại 1 xô đã dùng, hoặc cho thêm 1 lượt Hand Pick tự động.
3. **Nhân đôi thưởng bằng quảng cáo** ở màn thắng (source có điều kiện, giữ người chơi quảng cáo; sand-storm-2 làm từ màn 21). Thêm "100 xu miễn phí mỗi 24 giờ" nếu muốn nguồn cho người không xem quảng cáo.
4. **Cửa hàng trang trí** (sink dài hạn, không ảnh hưởng độ khó): giao diện xô, nền băng chuyền, khung tranh. Sink này hút xu dư của người chơi giỏi, người mà các sink khác không chạm tới.
5. **Hộp quà theo mốc**: mở sau mỗi 5 màn, tặng booster hoặc xu: kéo người chơi qua các màn khó thay vì kẹt ở tường tim.

### 4.4 Cần đo để chỉnh số
Ghi lại theo ngày và theo màn: xu kiếm / xu tiêu, tỉ lệ người chơi hết tim ở mỗi màn, số lần mở cửa hàng khi hết tim và tỉ lệ mua, số booster dùng trên mỗi màn và màn thua ngay sau khi dùng hết booster, số tim trung bình khi bắt đầu màn. Trả lời hai câu: (1) ở màn nào người chơi bắt đầu hết tim, (2) họ chọn đợi, xem quảng cáo hay tiêu xu. Nếu hầu hết chọn đợi thì giá xu quá cao hoặc nguồn xu quá ít; nếu hầu hết mua thì tim quá khắt khe.

## 5. Con số nên chỉnh trước tiên khi test
Tất cả ở `src/core/economy.ts`: `HEART_PRICE`, `INFINITE_PRICE`, `HEART_REGEN_S`, `HARD_REWARD`, `DAILY_GIFTS`. Bảng cheat (J, K, L) có thêm nút `Hearts 0`, `Hearts full`, `+30m ∞` và `Reset daily gift` để thử nhanh luồng hết tim và quà ngày.
