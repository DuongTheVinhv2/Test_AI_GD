# Báo cáo kiểm thử Sandloop

Ngày: 02/11/2026. Chỉ kiểm thử, chưa sửa mã game.

## Phạm vi và phương pháp

- Chạy bản `dist/index.html` bằng Edge headless với WebGL software và profile riêng; thử qua HTTP local và mở file trực tiếp.
- Build lại từ source vào `qa/build`; SHA-256 trùng bản dist hiện tại. Typecheck và production build đều thành công.
- Thao tác chuột thật: Play, chọn xô, Pause, Levels, đóng Levels, Resume, Next. Màn 1 được chơi bằng 5 click, sau đó tăng tốc mô phỏng đến thắng: nhận 35 xu, mở khóa và chuyển sang màn 2.
- Với case biên, dừng animation loop và gọi trạng thái nội bộ để dựng đúng điều kiện. Không coi các trạng thái dựng này là lượt chơi tự nhiên.
- Kiểm tra tâm/vùng chọn xô của cả 10 màn ở 390×844. Chụp thêm 360×640, 844×390, 1366×768.
- 300 lượt mô phỏng: 10 seed × 10 màn × 3 chính sách chọn xô. Giới hạn mỗi lượt 150 giây mô phỏng. Các lần timeout là giới hạn của bộ kiểm thử, không phải thời hạn trong game.
- 8 kiểm tra luật chuyên biệt đều PASS: blocked tap; capacity/duplicate tap; mystery reveal; hole/path; lớp chặn 4 hạt; win một lần; lose một lần; clone tiếp tục cùng trạng thái.
- Không kiểm tra bằng điện thoại vật lý, không nghe âm thanh/rung trên phần cứng. Kết luận âm thanh dựa trên trạng thái WebAudio và đường nối trong source. Không dùng FPS từ software rendering để kết luận hiệu năng máy thật.
- Đây là kiểm thử có hệ thống với các nhóm case quan trọng, không phải chứng minh vét cạn mọi tổ hợp thao tác/seed/trình duyệt.

## Các vấn đề tái hiện được

### 1. P1 — Có thể mất mở khóa màn và thưởng sau khi đã thắng

**Tái hiện:** thắng màn 1, reload trước khi màn hình kết quả xuất hiện (khoảng chờ 1,6 giây). Hoặc thắng → Pause ngay → Restart trong khoảng chờ.

**Đo được:** trước reload `wins=1, coins=0, unlocked=1`. Sau reload vẫn như vậy. Thắng lại và hiện kết quả: `wins=2, coins=5, unlocked=1`.

**Ảnh hưởng:** thắng đã được ghi nhưng thưởng/mở khóa chưa ghi. Những lần thắng tiếp theo bị tính replay nên không tự khôi phục mở khóa trong bộ chọn màn. Nút Next sau lần thắng tiếp theo vẫn cho sang màn 2, vì vậy đây không phải chặn tuyệt đối mọi cách tiếp tục; lỗi nằm ở trạng thái lưu, thưởng và khóa màn.

**Nguyên nhân:** `src/app/app.ts:260` ghi thắng trong `finishLevel`, còn thưởng/mở khóa làm sau tại `showResult:280`; logic mở khóa phụ thuộc `rec.wins === 1`.

**Hướng sửa:** commit kết quả, thưởng, mở khóa thành một giao dịch ngay lúc thắng; animation chỉ trình bày. Có cơ chế phục hồi pending reward và bảo đảm không trả trùng.

### 2. P2 — Hàng cuối màn 10 bị cắt, tâm xô nằm ngoài màn hình

**Tái hiện:** mở màn 10 ở 360×640, 844×390 hoặc 1366×768.

**Đo được:** tọa độ y tâm 5 xô hàng cuối lần lượt khoảng `640,41`, `390,25`, `768,49`, đều lớn hơn chiều cao viewport. Ở 390×844 chúng hiển thị đủ.

**Ảnh hưởng:** mất phần dưới xô, vùng bấm hữu dụng nhỏ đi; không thể click đúng tâm vì tâm ngoài viewport. Phần trên vẫn có thể bấm, chưa kết luận toàn bộ hàng không tương tác được.

**Nguồn:** `src/render/layout3d.ts` dùng kích thước sân cố định; `src/render/stage.ts:135` fit camera không tính bounds thực tế theo số hàng và góc nghiêng.

**Ảnh:** `results/verified-level10-360x640.png`, `results/verified-level10-844x390.png`.

**Hướng sửa:** fit bounds theo bàn của từng màn, có lề cho kích thước xô và safe area; kiểm tra lại hit-test sau resize/parallax.

### 3. P2 — Restart/thoát giữa lượt không được tính vào số lần thử

**Tái hiện:** vào màn 1 → bấm một xô → Restart. `attempts` trước/sau đều 0, log vẫn rỗng.

**Ảnh hưởng:** có thể thử lại nhiều lần nhưng lần thắng cuối vẫn nhận bonus “first try”; thống kê và seed theo số lần thử không phản ánh lượt chơi thực tế.

**Nguồn:** `src/app/app.ts:109`, `src/app/save.ts:83`. Chỉ ghi attempt khi thắng/thua; kiểu `quit` đã khai báo nhưng không được luồng Restart sử dụng.

**Hướng sửa:** xác định quy tắc bắt đầu/kết thúc lượt; ghi quit khi Restart/chuyển màn sau khi đã chơi; tránh đếm thao tác mở màn chưa chơi nếu thiết kế không muốn.

### 4. P2 — Texture GPU không được giải phóng khi load/restart màn

**Tái hiện:** render màn 1, ghi `renderer.info.memory`, restart/render cùng màn 30 lần.

**Đo được:** geometry giữ nguyên 46; texture tăng `152 → 482`, tức thêm 330 texture. Một bài thử độc lập khác tăng `115 → 348` sau 20 lần chuyển về màn 1 từ màn khác.

**Ảnh hưởng:** chơi lâu/retry nhiều làm tăng tài nguyên GPU, có nguy cơ giật hoặc mất context trên máy yếu. Chưa đo ngưỡng crash hay FPS trên thiết bị thật.

**Nguồn:** `src/render/scene.ts:118` chỉ dispose geometry; `SandView.dispose()` không được gọi khi tháo cảnh. Material/texture canvas của window, belt, counter, actor cũng chưa có vòng đời đầy đủ.

**Hướng sửa:** dispose tài nguyên riêng từng màn, giữ riêng tài nguyên dùng chung của kit; thêm bài soak test 100+ retry và theo dõi texture ổn định.

### 5. P2 — Lưu Sound OFF nhưng tải lại vẫn mở đường âm thanh cát

**Tái hiện:** lưu Sound=false → reload → Play.

**Đo được:** `audio.sound=false`, nhưng `sfxBus.gain≈0,9`, thay vì 0. `tick()` vẫn cập nhật âm lượng pour/crackle theo cát chuyển động.

**Ảnh hưởng:** các one-shot kiểm tra `sound` sẽ im, nhưng noise cát liên tục vẫn có đường phát khi cát chảy. Chưa xác nhận bằng nghe trên loa thật.

**Nguồn:** `src/app/app.ts:70` gán cờ; `src/audio/audio.ts:54` luôn khởi tạo sfx gain 0,9, không áp dụng setting đã lưu.

**Hướng sửa:** áp dụng setting tại thời điểm tạo audio graph, kiểm tra cả nguồn liên tục và one-shot.

### 6. P2 — Marks làm lộ danh tính màu của xô bí ẩn

**Tái hiện:** bật Marks rồi mở màn 10. Sáu xô còn `mode=mystery` đều có badge màu thật với opacity 0,55.

**Ảnh hưởng:** mỗi màu có glyph riêng; người biết glyph có thể suy ra màu xô trước khi mở. Chế độ hỗ trợ màu vô tình thay đổi thông tin/độ khó của puzzle.

**Nguồn:** `src/render/bucketmodel.ts:191–235`, `src/render/scene.ts:318–334`. Badge dùng `trueColor`, không bị ẩn theo mystery.

**Ảnh:** `results/mystery-marks.png`.

**Hướng sửa:** ẩn glyph màu ở mystery chưa reveal; chỉ hiện dấu hỏi trung tính.

### 7. P2 — Bật/tắt Marks không cập nhật xô đã lên băng chuyền

**Tái hiện:** bật Marks → đưa xô lên belt → tắt Marks → update. Badge xô trên board về 0, badge xô đã deploy vẫn 0,55. Trường hợp bật lên sau khi deploy có vấn đề đối xứng.

**Ảnh hưởng:** cùng một setting nhưng board/belt có biểu diễn khác nhau; đặc biệt ảnh hưởng người cần hỗ trợ phân biệt màu.

**Nguồn:** `src/render/scene.ts:334` cập nhật setting trong `syncBoard`, không có trong `syncBelt`.

**Hướng sửa:** cập nhật badge tất cả actor khi setting thay đổi, có kiểm tra trạng thái mystery.

### 8. P3 — Continue sau khi hoàn thành toàn bộ lại bắt đầu màn 1

**Tái hiện:** save `finished=true,current=10`, hiện title. Nút ghi Continue, sau bấm thì level=1.

**Ảnh hưởng:** nhãn hứa tiếp tục nhưng hành vi bắt đầu lại; người chơi khó hiểu save có bị mất hay không.

**Nguồn:** `src/ui/ui.ts:350`, `src/app/app.ts:102`.

**Hướng sửa:** dùng Play again khi đã hoàn thành, hoặc Continue thực sự mở màn được chọn/lưu.

### 9. P3 — HUD vẫn hiện nút Pause trong trạng thái không hoạt động

**Tái hiện:** màn thắng: HUD vẫn hiện Pause nhưng `setPaused(true)` không đổi `mode=won`. Chuyển sang màn All Cleared, chạy một frame: HUD vẫn hiện (`class=hud`), trong khi `mode=finished`.

**Ảnh hưởng:** một nút nhìn như bấm được nhưng không phản hồi. Trên màn thắng có thể bị overlay/stacking che thêm; trạng thái UI vẫn không nhất quán.

**Nguồn:** `src/app/app.ts:134,196,280,318`; `src/ui/ui.ts:312`.

**Hướng sửa:** ẩn/disable Pause trên kết quả và màn hoàn thành, đồng bộ HUD theo mode.

### 10. P3 — Save đúng JSON nhưng dữ liệu không hợp lệ có thể khiến game không khởi động

**Tái hiện biên:** localStorage chứa object `version=1,current=0` → reload. Không có `window.__app`; lỗi `Cannot read properties of undefined (reading 'art')`.

**Ảnh hưởng:** save hỏng về cấu trúc có thể làm màn hình không chơi được. Đây là thử nghiệm độ bền bằng dữ liệu dựng, chưa thấy luồng chơi bình thường tự tạo `current=0`.

**Nguồn:** `src/app/save.ts:64` chỉ kiểm version rồi merge; `src/app/app.ts:77,95` clamp tối đa nhưng không clamp tối thiểu trước khi load attract.

**Hướng sửa:** validate số màn, levels/log/settings/coins trước khi dùng; fallback hoặc migrate save không hợp lệ.

## Nhận xét UX và vấn đề xác định qua mã nguồn

### 11. P2 — Thiếu hướng dẫn trong game, độ khó tăng mạnh từ màn 4

Không có tutorial/hint giải thích đường thoát, xô bí ẩn, lớp cát chặn hoặc việc cần giữ chỗ để đào xô bên dưới. README có luật nhưng người chơi mở HTML không tự thấy README. Không có Undo/hint để học từ lỗi chọn xô.

Thử nhanh màn 9: deploy 5 xô bấm được ban đầu, không thay đổi dữ liệu màn → thua ở khoảng 1,9 giây mô phỏng, còn nguyên 16.384 hạt. Đây là case bấm liên tục tức thời, không đại diện thời gian suy nghĩ người thật.

Mẫu 300 lượt dưới đây cho thấy cần chiến lược từ khá sớm. Đây là bot đơn giản, 10 seed/ô; không dùng để khẳng định màn vô nghiệm hoặc ước lượng tỷ lệ thắng người thật. Bot lookahead chỉ tìm đường đào ngắn đến màu lộ ra, không phải solver tối ưu.

| Màn | Ngẫu nhiên | Ưu tiên màu lộ ra | Có tìm đường đào ngắn |
|---|---:|---:|---:|
| 1 | 10/10 | 10/10 | 10/10 |
| 2 | 10/10 | 10/10 | 10/10 |
| 3 | 10/10 | 10/10 | 10/10 |
| 4 | 0/10 | 4/10 | 3/10 |
| 5 | 0/10 | 1/10 | 8/10 |
| 6 | 0/10 | 1/10 | 0/10 |
| 7 | 0/10 | 0/10 | 8/10 |
| 8 | 0/10 | 0/10 | 2/10 |
| 9 | 0/10 | 0/10 | 0/10 |
| 10 | 0/10 | 0/10 | 3/10 |

Trong nhóm lookahead có 1 lượt màn 7 và 5 lượt màn 10 chạm giới hạn 150 giây. Các lượt còn lại kết thúc thắng/thua.

**Khuyến nghị thiết kế:** đưa từng cơ chế vào tutorial ngắn trước khi yêu cầu áp dụng; cung cấp feedback vì sao xô bị chặn và vì sao giữ chỗ trên belt; cân nhắc hint/undo theo mục tiêu thiết kế thay vì tự động làm dễ mọi màn.

### 12. P2 — Khả năng tiếp cận và nút quá nhỏ khi xoay ngang

- Nút Pause đo ở 844×390 chỉ 19×19 CSS px; 360×640 là khoảng 31×31. Dễ bấm trượt.
- Xô nằm trong canvas, không có DOM semantic từng xô, tên trạng thái hay điều khiển chọn xô bằng bàn phím. Người chỉ dùng bàn phím hoặc screen reader không thực hiện được gameplay chính. `aria-label` chung của canvas không giải quyết điều này.
- Marks chỉ thêm glyph cho xô; cát vẫn biểu diễn bằng màu, nên hỗ trợ phân biệt màu chưa trọn vẹn.

**Nguồn:** `src/ui/ui.ts:173`, `src/style.css:116`, `src/app/app.ts:79–86,215`, `src/render/sandview.ts`.

**Hướng sửa:** giữ kích thước vùng chạm tối thiểu theo thiết kế, thêm thao tác bàn phím và mô tả xô; kiểm thử với người cần hỗ trợ màu.

### 13. P2 — Music OFF có đường reverb đi vòng qua music bus (source review)

`setMusic(false)` hạ gain musicBus, nhưng `musicBusLP()` nối thẳng vào `reverbSend`, và một số nốt cũng gửi trực tiếp vào `reverbSend`. `reverbSend → reverb → master` không đi qua musicBus. `scheduleMusic` còn tiếp tục lên lịch khi music bị tắt.

**Ảnh hưởng dự kiến:** vẫn nghe phần nhạc vang sau khi tắt Music, kể cả nốt mới được lên lịch. Chưa đo tín hiệu âm thanh đầu ra/kiểm nghe nên tách khỏi lỗi đã tái hiện trên UI.

**Nguồn:** `src/audio/audio.ts:116,312–358`.

**Hướng sửa:** tất cả đường dry/wet của nhạc phải chịu cùng mute hoặc ngừng scheduler/nguồn nhạc khi tắt; kiểm tra nhạc và SFX riêng.

### 14. P3 — Haptics ON phụ thuộc Sound ON (source review)

`tap/reject/reveal/complete/win/lose` return sớm khi `!sound` rồi mới gọi `vibrate`. Vì vậy chọn Sound OFF và Haptics ON vẫn không rung cho các sự kiện này, dù giao diện thể hiện hai setting độc lập. Chưa thử thiết bị rung vật lý.

**Nguồn:** `src/audio/audio.ts:181–265`.

**Hướng sửa:** điều khiển rung độc lập, ngoài nhánh mute âm thanh.

## Các kiểm tra đã qua và giới hạn còn lại

- Build/typecheck; mở game file trực tiếp và HTTP; WebGL khởi tạo thành công.
- Luồng màn 1 thắng hợp lệ, thưởng lần đầu 35 xu, unlock 2, Next sang 2; Pause/Levels/back/Resume bằng chuột.
- 10 tranh đều 32×32; tổng 16.384 hạt/màn; tổng capacity từng màu bằng lượng cát từng màu.
- Ở 390×844, tâm tất cả xô 10 màn trong viewport và hit-test trả đúng id.
- Không thấy vượt 5 slot hoặc sand.total âm trong 300 lượt; 8 kiểm tra riêng nêu trên PASS.
- Chưa chơi thắng mọi màn bằng thao tác chuột theo thời gian thực, chưa kiểm tra Chrome/Safari/Firefox, thiết bị cảm ứng thật, âm thanh/rung thật, mất WebGL context, nhiều tab đồng thời, và soak test dài trên GPU thật.
- Không có cơ sở kết luận tất cả màn đều có lời giải với mọi seed từ bộ bot này; cũng không có bằng chứng màn nào vô nghiệm.

## Thứ tự xử lý đề xuất

1. Giao dịch lưu kết quả/thưởng/unlock (#1).
2. Fit bàn màn 10 (#2), vòng đời texture (#4), mute audio (#5/#13).
3. Đồng bộ Marks và giữ kín mystery (#6/#7), tính attempts (#3).
4. Tutorial/feedback và vùng chạm/điều khiển hỗ trợ (#11/#12).
5. Hoàn thiện trạng thái HUD, Continue, save validation, haptics (#8/#9/#10/#14).

## Bằng chứng và cách chạy lại

- `results/browser-results.json`: đo UI/flow và save/audio/texture.
- `results/followup-results.json`: xác nhận resize, menu và gameplay bằng chuột. Lần chạy cuối đã tắt CSS animation trong trang kiểm thử để tránh click trượt khi card đang chuyển động.
- `results/core-results.json`: từng seed của 300 lượt, dữ liệu cấu trúc 10 màn.
- `results/targeted-results.json`: 8 kiểm tra luật.
- Các PNG trong `results/`; dùng ảnh có tiền tố `verified-` cho kết luận resize. Ảnh `level10-844x390.png` ban đầu chụp trước khi render lại sau resize, không dùng làm bằng chứng lỗi game.
- `node qa/browser-audit.mjs`
- `node qa/browser-followup.mjs`
- `node --import tsx qa/core-audit.ts`
- `node --import tsx qa/targeted-audit.ts`

Các script browser dùng Edge cài sẵn tại đường dẫn Windows trong script, profile kiểm thử tạm. Đã cài dependency theo package-lock để chạy kiểm thử. Không chỉnh source game, package manifest, lockfile hay dist.
