// Kiểm tra logic tim (không cần trình duyệt). Chạy: npx tsx qa/hearts-check.ts
import { Hearts, freshHearts } from '../src/app/hearts';
import { HEART_MAX, HEART_REGEN_S } from '../src/core/economy';

let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};
const T0 = 1_700_000_000_000;
const STEP = HEART_REGEN_S * 1000;

let h = new Hearts(freshHearts(T0));
eq('mới có đủ tim', h.count(T0), HEART_MAX);
eq('đủ tim: đồng hồ = 0', h.secondsLeft(T0), 0);

h.consume(T0);
eq('mất 1 tim', h.count(T0), HEART_MAX - 1);
eq('đồng hồ chạy từ lúc mất tim đầu', h.secondsLeft(T0), HEART_REGEN_S);
h.consume(T0 + STEP / 2);
eq('mất thêm tim giữa chừng không reset đồng hồ', h.secondsLeft(T0 + STEP / 2), HEART_REGEN_S / 2);
eq('còn 3 tim', h.count(T0 + STEP / 2), HEART_MAX - 2);
eq('hết nửa chu kỳ nữa thì hồi 1 tim', h.count(T0 + STEP), HEART_MAX - 1);
eq('đồng hồ giữ phần dư', h.secondsLeft(T0 + STEP), HEART_REGEN_S);

h = new Hearts(freshHearts(T0));
for (let i = 0; i < HEART_MAX; i++) h.consume(T0);
eq('hết tim', h.count(T0), 0);
eq('hết tim không chơi được', h.canPlay(T0), false);
eq('consume khi hết tim trả false', h.consume(T0), false);
eq('đóng app lâu: hồi đầy, không vượt max', h.count(T0 + STEP * 50), HEART_MAX);

h = new Hearts(freshHearts(T0));
for (let i = 0; i < HEART_MAX; i++) h.consume(T0);
eq('2.5 chu kỳ => 2 tim', h.count(T0 + STEP * 2.5), 2);
eq('dư nửa chu kỳ', h.secondsLeft(T0 + STEP * 2.5), HEART_REGEN_S / 2);

h = new Hearts(freshHearts(T0));
h.consume(T0);
eq('đồng hồ chỉnh lùi: neo lại, không trả tim âm', h.count(T0 - STEP * 3), HEART_MAX - 1);
eq('... và đếm tiếp từ mốc mới', h.secondsLeft(T0 - STEP * 3), HEART_REGEN_S);

h = new Hearts(freshHearts(T0));
h.consume(T0);
h.consume(T0);
h.add(1, T0);
eq('xem quảng cáo +1', h.count(T0), HEART_MAX - 1);
h.add(Infinity, T0);
eq('refill đầy', h.count(T0), HEART_MAX);
eq('đầy thì đồng hồ = 0', h.secondsLeft(T0), 0);

h = new Hearts(freshHearts(T0));
h.consume(T0);
h.addInfinite(30, T0);
eq('vô hạn: luôn chơi được', h.canPlay(T0), true);
eq('vô hạn: đủ tim', h.count(T0), HEART_MAX);
h.consume(T0);
eq('vô hạn: không mất tim', h.count(T0), HEART_MAX);
eq('vô hạn: đếm ngược 30 phút', h.secondsLeft(T0), 1800);
h.addInfinite(10, T0 + 600_000);
eq('mua thêm thì cộng dồn (còn 20 phút + 10 phút = 30 phút)', h.secondsLeft(T0 + 600_000), 1800);
eq('hết hạn vô hạn thì về bình thường', h.infinite(T0 + 3_000_000), false);
h.consume(T0 + 3_000_000);
eq('sau khi hết hạn lại mất tim', h.count(T0 + 3_000_000), HEART_MAX - 1);

console.log(fails ? `\n${fails} lỗi` : '\ntất cả đạt');
process.exit(fails ? 1 : 0);
