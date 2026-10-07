/**
 * v1.6 mock 数据重构 · 数据完整性断言（可重跑）
 *
 * 为什么要固化：一次性的 `node -e` 跑完就没了，下次改mock 无法回归。
 * 这些断言覆盖的是**口径恒等式**而非具体数值 —— 数值会随业务场景变，
 * 恒等式不会变，漂移了就是真的坏了。
 *
 * 用法：node scripts/assert-data.mjs
 */
import { INITIAL_DATA, DEPARTMENTS } from '../src/data/mock.js';
import {
  buildBillsForMonth, consumptionBreakdown, poolState, opsPlanBySystem
} from '../src/domain/calc.js';

const d = INITIAL_DATA;
let fail = 0;
const ck = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —— ' + detail : ''}`);
  if (!ok) fail++;
};

/* ---- 规模与状态维度（本轮扩充目标） ---- */
ck('BRD 规模 ≥ 30（本轮由 21 扩到 33）', d.brds.length >= 30, `${d.brds.length} 条`);
ck('BRD 四态齐全', new Set(d.brds.map((b) => b.status)).size === 4,
  JSON.stringify(d.brds.reduce((a, b) => ((a[b.status] = (a[b.status] || 0) + 1), a), {})));
ck('CR 状态 ≥ 3 态（含待审批 / 已驳回）',
  new Set(d.brds.flatMap((b) => (b.crs || []).map((c) => c.status))).size >= 3,
  JSON.stringify(d.brds.flatMap((b) => b.crs || []).reduce((a, c) => ((a[c.status] = (a[c.status] || 0) + 1), a), {})));

/* ---- 账单覆盖（本轮核心目标） ---- */
const noDeliv = d.months.filter((mm) => buildBillsForMonth(d, mm).every((b) => b.deliveryTotal === 0));
ck('9 个账期均有交付计费', noDeliv.length === 0, noDeliv.length ? `空交付月: ${noDeliv.join(',')}` : '无空月');

/* ---- 口径破洞检测（本轮踩过：池 < 运维 → 负消耗率） ---- */
const neg = [];
DEPARTMENTS.forEach((x) => {
  [2026, 2027].forEach((fy) => {
    const b = consumptionBreakdown(d, x.code, fy);
    ['overall', 'project', 'ops'].forEach((k) => {
      if (b[k] && b[k].rate != null && b[k].rate < 0) neg.push(`${x.code}/${fy}/${k}=${(b[k].rate * 100).toFixed(1)}%`);
    });
  });
});
ck('无负消耗率（池 ≥ 运维）', neg.length === 0, neg.join(' ') || '全部非负');

/* ---- 恒等式（数值会变，这些不会） ---- */
let idOk = true; const idBad = [];
DEPARTMENTS.forEach((x) => {
  const st = poolState(d, x.code, 2026);
  if (Math.abs(st.used - (st.committed + st.billed)) > 1) { idOk = false; idBad.push(x.code); }
});
ck('FY2026 恒等式 used = committed + billed', idOk, idOk ? `${DEPARTMENTS.length} 部门全成立` : idBad.join(','));

let sumOk = true;
d.months.forEach((mm) => {
  const bs = buildBillsForMonth(d, mm);
  if (Math.abs(bs.reduce((a, b) => a + b.total, 0) - bs.reduce((a, b) => a + b.deliveryTotal + b.opsTotal, 0)) > 1) sumOk = false;
});
ck('Σ部门账单 = delivery + ops 合计', sumOk, sumOk ? `${d.months.length} 个月全成立` : '有偏差');

/* ---- mock 字面量 vs 模型派生（唯一真相源纪律） ---- */
const mis = [];
d.opsVersions.forEach((v) => {
  const derived = opsPlanBySystem(d, v.dept, v.fy);
  v.items.forEach((it) => {
    const dv = derived.find((r) => r.sys.id === it.sysId);
    if (!dv || Math.round(dv.amount) !== it.amount) {
      mis.push(`${v.dept}/${it.sysId} 字面${it.amount} vs 派生${dv ? Math.round(dv.amount) : 'null'}`);
    }
  });
});
ck('运维明细字面量 = 模型派生', mis.length === 0, mis.length ? mis.join(' | ') : '全部逐行相等');

/* ---- 草稿与版本表一一对应 ---- */
const draftDepts = d.demandDrafts.map((x) => x.dept).sort();
const vDept = d.demandVersions.filter((v) => !v.confirmedAt).map((v) => v.dept).sort();
ck('草稿与进行中版本一一对应', JSON.stringify(draftDepts) === JSON.stringify(vDept),
  `${draftDepts.join(',')}`);

console.log('\n' + (fail ? `${fail} 项失败` : '全部通过'));
process.exit(fail ? 1 : 0);