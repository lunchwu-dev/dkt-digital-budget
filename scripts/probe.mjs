/**
 * 领域层探针：独立核算 demo 的关键数值，作为 UI 冒烟测试的基线。
 * 用法：node scripts/probe.mjs
 */
import { INITIAL_DATA } from '../src/data/mock.js';
import * as C from '../src/domain/calc.js';

const data = INITIAL_DATA;

const s26 = C.poolSummary(data, 2026);
const s27 = C.poolSummary(data, 2027);
const kpi = C.dashboardKpi(data);

const out = {
  pool26Total: s26.total,
  pool26TotalWan: C.fmtWan(s26.total),
  pool26Planned: s26.planned,
  pool26Committed: s26.committed,
  pool26Billed: s26.billed,
  pool26Used: s26.used,
  pool26Usage: C.fmtPct(s26.usageRate, 1),
  pool26OverDepts: s26.overDepts.map((d) => `${d.deptName}(${C.fmtPct(d.usageRate, 1)})`),
  pool26WarnDepts: s26.warnDepts.map((d) => `${d.deptName}(${C.fmtPct(d.usageRate, 1)})`),
  pool27Total: s27.total,
  pool27TotalWan: C.fmtWan(s27.total),
  planTotal: data.digitalPlan.planItems.reduce((s, p) => s + p.budget, 0),
  demand27Amount: data.demands.filter((d) => d.fy === 2027).reduce((s, d) => s + d.estAmount, 0)
};

console.log('=== 预算池 FY2026 ===');
console.log(JSON.stringify(out, null, 2));

console.log('\n=== 各部门 FY2026 预算池 ===');
s26.rows.forEach((r) => {
  console.log(
    `${r.deptName.padEnd(6)} 总包 ${C.fmtWan(r.total).padStart(9)} | 已规划 ${C.fmtWan(r.planned).padStart(9)} | 已承诺 ${C.fmtWan(r.committed).padStart(9)} | 已核销 ${C.fmtWan(r.billed).padStart(9)} | 可用 ${C.fmtWan(r.available).padStart(9)} | ${r.level} ${C.fmtPct(r.usageRate, 1)}`
  );
});

console.log('\n=== 关键 BRD 核算 ===');
['BRD-2026-0101', 'BRD-2026-0103', 'BRD-2026-0118'].forEach((id) => {
  const b = data.brds.find((x) => x.id === id);
  console.log(
    `${id} ${b.title} | 评估人天 ${C.mdTotal(b.evalLines)} | 评估价 ${C.fmtYuan(C.brdEvalAmount(data, b))} | CR ${C.fmtYuan(C.brdCRDelta(data, b))} | 最终 ${C.fmtYuan(C.brdFinalAmount(data, b))}`
  );
});

console.log('\n=== FY2026 月度账单 ===');
data.months.forEach((m) => {
  let d = 0;
  let o = 0;
  data.departments.forEach((dep) => {
    const b = C.buildBill(data, m, dep.code);
    d += b.deliveryTotal;
    o += b.opsTotal;
  });
  console.log(`${m} 交付 ${C.fmtWan(d).padStart(9)} 运维 ${C.fmtWan(o).padStart(9)} 合计 ${C.fmtWan(d + o).padStart(9)} 状态 ${C.billStateOf(data, m)}`);
});

console.log('\n=== 追溯样例 ===');
const t = C.traceOfDemand(data, 'DM-2026-0003');
console.log(
  `${t.demand.id} ${t.demand.title} | 清单预估 ${C.fmtYuan(t.estAmount)} / ${t.estMD}人天 | 派生 BRD ${t.chains.length} 条 | 已承诺 ${C.fmtYuan(t.committedSum)} | 偏差 ${C.signedPct(t.deviation, 1)}`
);

console.log('\n=== 年度新增需求 ===');
console.log(JSON.stringify(C.crossYearImpact(data), null, 2));

console.log('\n=== KPI ===');
console.log(
  `已核销合计 ${C.fmtWan(kpi.billedTotal)} (交付 ${C.fmtWan(kpi.billedDelivery)} / 运维 ${C.fmtWan(kpi.billedOps)}) | CR ${kpi.crCount}单 ${C.fmtWan(kpi.crAmount)} | 已交付 ${kpi.deliveredCount} | 已签收 ${kpi.signedCount} | 待评估 ${kpi.pendingEvalCount}`
);
