/**
 * 重构测算台（只读）：给定目标档位，反解各部门的 poolFY26 / poolFY27 与需求侧规模。
 *
 * 关键自由度（决定重构可行性）：
 *   · DELIVERED BRD（有 delivery）→ 进账单楼层 / 部门账单 / 复盘 ROI
 *   · SIGNED    BRD（无 delivery）→ 只进 committed（消耗），**不影响账单**
 *   · EVALUATING / SUBMITTED      → 只进 inFlightCount
 *   ⇒ 调 SIGNED BRD 的规模 = 纯调节消耗档位而不扰动账单数据。
 *
 * 运维侧档位的数学约束（必须先确认，否则整个设计白做）：
 *   opsLineAmount(fixed)  12月求和 = rate×share，全恒定   ⇒ 7月/12月 = 7/12   = 58.33%
 *   opsLineAmount(order/member) 随 SEASON 波动           ⇒ Σ₁₋₇/Σ₁₋₁₂ = 6.75/11.21 = 60.21%
 *   混合 ⇒ ops 消耗率恒落在 [58.33%, 60.21%]，**永远 < 70% ⇒ 恒为 ok 档**。
 *   这是计量模型的硬约束，不改 calc.js 就无法让运维侧出现 watch/warn/over。
 */
import { INITIAL_DATA } from '../src/data/mock.js';
import * as C from '../src/domain/calc.js';

const data = INITIAL_DATA;
const THRU = C.CURRENT_MONTH;
const LEVELS = ['ok', 'watch', 'warn', 'over'];
const lv = (r) => (r >= 1 ? 'over' : r >= 0.9 ? 'warn' : r >= 0.7 ? 'watch' : 'ok');

const fmt = (n) => n.toLocaleString('zh-CN', { maximumFractionDigits: 1 });

console.log('='.repeat(96));
console.log('A. 各部门「运维侧」三项基础量（由 VOLUME_BASE × 计费模型决定，FY2026）');
console.log('='.repeat(96));
const base = [];
data.departments.forEach((d) => {
  const row = C.consumptionUpTo(data, d.code, 2026, THRU);
  const bd = C.consumptionBreakdown(row, 2026);
  const opsBudget = bd.ops.budget;
  const opsBilled = bd.ops.billed;
  const projectUsed = bd.project.used;
  const pool = bd.overall.budget;
  base.push({ code: d.code, name: d.name, opsBudget, opsBilled, projectUsed, pool, projectBudget: pool - opsBudget });
  console.log(
    [
      d.name.padEnd(6),
      `运维预算=${fmt(opsBudget)}`.padEnd(20),
      `运维已核销=${fmt(opsBilled)}`.padEnd(22),
      `运维率=${(opsBilled / opsBudget * 100).toFixed(2)}%`.padEnd(14),
      `运维档=${lv(opsBilled / opsBudget)}`.padEnd(12),
      `项目消耗=${fmt(projectUsed)}`,
      `现池=${fmt(pool)}`
    ].join(' ')
  );
});

console.log();
console.log('='.repeat(96));
console.log('B. 反解：给定「项目侧目标消耗率 pr」，求使 pr 命中的 poolFY26，并观察整体档位 or');
console.log('   公式： projectBudget = projectUsed / pr  ⇒  pool = projectUsed / pr + opsBudget');
console.log('          or = (projectUsed + opsBilled) / pool');
console.log('='.repeat(96));
const TARGET = {
  'D-RETAIL': { pr: 0.62, note: '大盘健康' },
  'D-ECOM': { pr: 0.78, note: '关注档' },
  'D-MKT': { pr: 1.15, note: '项目击穿 · 整体预警' },
  'D-CRM': { pr: 0.93, note: '预警档' },
  'D-SCM': { pr: 0.45, note: '消耗低' },
  'D-SVC': { pr: 1.3, note: '双击穿' },
  'D-FIN': { pr: 0.72, note: '关注档' },
  'D-HR': { pr: 0.04, note: '几乎未启动' }
};
console.log(
  ['部门', '项目消耗(万)', '运维预算(万)', '目标pr', '反解poolFY26(万)', '实际pr', 'pr档', '整体or', 'or档', '项目预算(万)', '备注'].join('\t')
);
const solved = {};
base.forEach((b) => {
  const t = TARGET[b.code];
  const projectBudget = b.projectUsed / t.pr;
  const pool = projectBudget + b.opsBudget;
  const pr = b.projectUsed / projectBudget;
  const or = (b.projectUsed + b.opsBilled) / pool;
  solved[b.code] = { pool, projectBudget, pr, or };
  console.log(
    [
      b.name,
      fmt(b.projectUsed / 10000),
      fmt(b.opsBudget / 10000),
      t.pr.toFixed(2),
      fmt(pool / 10000),
      pr.toFixed(4),
      lv(pr),
      or.toFixed(4),
      lv(or),
      fmt(projectBudget / 10000),
      t.note
    ].join('\t')
  );
});

console.log();
console.log('池合计（万元）：', fmt(Object.values(solved).reduce((s, x) => s + x.pool, 0) / 10000));
console.log('现池合计（万元）：', fmt(base.reduce((s, x) => s + x.pool, 0) / 10000));

console.log();
console.log('='.repeat(96));
console.log('C. 反解 FY2027 编制年：projectUsed = planned（需求清单预估），运维 used = 0');
console.log('   公式： projectBudget = planned / pr ⇒ pool = planned / pr + opsBudget');
console.log('          or = planned / pool');
console.log('='.repeat(96));
const T27 = {
  'D-RETAIL': 0.72,
  'D-ECOM': 0.88,
  'D-MKT': 1.08,
  'D-CRM': 0.95,
  'D-SCM': 0.6,
  'D-SVC': 1.02,
  'D-FIN': 0.8,
  'D-HR': 0.5
};
console.log(['部门', '已规划(万)', '运维预算(万)', '目标pr', '反解poolFY27(万)', 'pr档', '整体or', 'or档'].join('\t'));
const s27 = {};
data.departments.forEach((d) => {
  const row = C.consumptionUpTo(data, d.code, 2027, THRU);
  const bd = C.consumptionBreakdown(row, 2027);
  const planned = bd.project.used;
  const opsBudget = bd.ops.budget;
  const pr = T27[d.code];
  const projectBudget = planned / pr;
  const pool = projectBudget + opsBudget;
  const or = planned / pool;
  s27[d.code] = pool;
  console.log(
    [
      d.name,
      fmt(planned / 10000),
      fmt(opsBudget / 10000),
      pr.toFixed(2),
      fmt(pool / 10000),
      lv(pr),
      or.toFixed(4),
      lv(or)
    ].join('\t')
  );
});
console.log();
console.log('FY2027 池合计（万元）：', fmt(Object.values(s27).reduce((s, x) => s + x, 0) / 10000));

console.log();
console.log('='.repeat(96));
console.log('D. 校验：pool 必须是「万元整数 × 10000」的整数值，验证取整后档位不漂移');
console.log('='.repeat(96));
Object.entries(solved).forEach(([code, x]) => {
  const rounded = Math.round(x.pool / 10000) * 10000;
  const pr = x.projectUsed / (rounded - x.opsBudget);
  const or = (x.projectUsed + x.opsBilled) / rounded;
  console.log(
    `${code} 池=${fmt(rounded / 10000)}万 → pr=${pr.toFixed(4)}(${lv(pr)}) or=${or.toFixed(4)}(${lv(or)})`
  );
});
Object.entries(s27).forEach(([code, x]) => {
  const rounded = Math.round(x / 10000) * 10000;
  const row = C.consumptionUpTo(data, code, 2027, THRU);
  const bd = C.consumptionBreakdown(row, 2027);
  const pr = bd.project.used / (rounded - bd.ops.budget);
  const or = bd.project.used / rounded;
  console.log(`FY27 ${code} 池=${fmt(rounded / 10000)}万 → pr=${pr.toFixed(4)}(${lv(pr)}) or=${or.toFixed(4)}(${lv(or)})`);
});
