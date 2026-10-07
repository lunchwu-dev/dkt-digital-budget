/**
 * mock 数据覆盖探针（只读，不改任何数据）
 * 目的：把三大能力（年度预算计划 / 预算消耗 / 对账单）用到的**所有展示分支**
 *      逐条跑一遍，输出「已覆盖 / 未覆盖」，作为重构 mock 的依据。
 *
 * 编排层必须在 Bash 里直接跑 node（node 进程内无法 spawn 子进程）。
 *   node scripts/probe-coverage.mjs
 */
import { INITIAL_DATA } from '../src/data/mock.js';
import * as C from '../src/domain/calc.js';

const data = INITIAL_DATA;
const P = (v) => C.fmtPct(v, 1);
const W = (v) => C.fmtWan(v);
const line = (s = '') => console.log(s);
const head = (s) => {
  line();
  line('='.repeat(78));
  line(s);
  line('='.repeat(78));
};

const tally = (arr) => {
  const m = {};
  arr.forEach((v) => {
    m[v] = (m[v] || 0) + 1;
  });
  return m;
};

/* ------------------------------------------------------------------ *
 * 一、年度预算计划（FY2027 编制口径）
 * ------------------------------------------------------------------ */
head('一、年度预算计划 · 编制项状态分布（annualPlanRows(2027)）');
const planRows = C.annualPlanRows(data, 2027);
line(`BU 数：${planRows.length}`);
line();
line('按部门：');
line(
  ['部门', 'BP', '项目预算', '运维', '已确认额(万)', '运维额(万)', '总预算(万)', '待核定条数', '草稿'].join('\t')
);
planRows.forEach((r) => {
  line(
    [
      r.deptName,
      r.bpStatus,
      r.demandStatus,
      r.opsStatus,
      W(r.demandConfirmedAmount || 0),
      W(r.opsAmount),
      W(r.projectAmount + r.opsAmount),
      r.demandEvalPending,
      r.demandHasInProgress ? `${r.demandDraftStatus}(${r.demandInProgressCount})` : '—'
    ].join('\t')
  );
});
line();
line(`① BP 状态分布：${JSON.stringify(tally(planRows.map((r) => r.bpStatus)))}`);
line(`② 项目预算状态：${JSON.stringify(tally(planRows.map((r) => r.demandStatus)))}`);
line(`③ 运维状态：    ${JSON.stringify(tally(planRows.map((r) => r.opsStatus)))}`);
line(`运维「已出具」分布：${JSON.stringify(tally(planRows.map((r) => (r.opsIssued ? '已出具' : '未出具'))))}`);
line(`总预算 = 项目 + 运维 恒等式：${planRows.every((r) => Math.abs(r.projectAmount + r.opsAmount - (r.projectAmount + r.opsAmount)) < 1e-9)}`);

head('二、BP 版本内容四态（bpVersionsOf）');
const bpStates = [];
data.departments.forEach((d) => {
  const vs = C.bpVersionsOf(data, d.code, 2027);
  vs.forEach((v) => bpStates.push(C.bpSummaryStateOf(v).source || 'null'));
});
line(`BP 版本总数：${bpStates.length}`);
line(`摘要四态分布：${JSON.stringify(tally(bpStates))}`);
line(`各部门版本数：${planRows.map((r) => `${r.short}:${r.bpVersions.length}`).join(' ')}`);
const docForms = [];
data.departments.forEach((d) => C.bpVersionsOf(data, d.code, 2027).forEach((v) => docForms.push(C.bpDocFormLabel(v))));
line(`文档形式分布：${JSON.stringify(tally(docForms))}`);

head('三、需求清单版本状态（demandProjectPage(2027)）');
const pageStates = [];
data.departments.forEach((d) => {
  const p = C.demandProjectPage(data, d.code, 2027);
  pageStates.push(p.status);
  line(
    [
      p.deptName.padEnd(6),
      `状态=${p.status}`,
      `条数=${p.demandCount}`,
      `待核定=${p.demandEvalPending}`,
      `金额(万)=${W(p.demandAmount)}`,
      `确认版本=${p.confirmedVersionLabel || '—'}`,
      `版本数=${p.versions.length}`,
      `流水=${p.timeline.length}`,
      `进行中=${p.hasInProgress ? p.inProgressStatus : '—'}`
    ].join('\t')
  );
});
line();
line(`页面级状态分布：${JSON.stringify(tally(pageStates))}`);

head('四、系统运维预算计划页（opsPlanPage(2027)）');
data.departments.forEach((d) => {
  const p = C.opsPlanPage(data, d.code, 2027);
  line(
    [
      p.deptName.padEnd(6),
      `状态=${p.status}`,
      `usingDerived=${p.usingDerived}`,
      `明细=${p.itemCount}`,
      `计费模式种类=${p.billingKindCount}`,
      `合计(万)=${W(p.totalAmount)}`,
      `版本=${p.versions.length}`,
      `流水=${p.timeline.length}`,
      `草稿=${p.hasInProgress ? p.inProgressStatus : '—'}`
    ].join('\t')
  );
});
line();
/* 校验：mock 字面量 items 与模型派生值是否逐行相等（口径一致性） */
let mismatch = 0;
let checked = 0;
data.departments.forEach((d) => {
  const derived = C
    .opsPlanBySystem(data, d.code, 2027)
    .map((r) => ({ sysId: r.sys.id, amount: r.amount }));
  const derivedMap = new Map(derived.map((x) => [x.sysId, x.amount]));
  const src = (data.opsPlans.find((o) => o.dept === d.code) || {}).items || null;
  const drf = C.opsDraftOf(data, d.code, 2027);
  const list = src || (drf && drf.status === '待业务确认' ? drf.items : null);
  if (!list) return;
  list.forEach((it) => {
    checked += 1;
    if (derivedMap.get(it.sysId) !== it.amount) {
      mismatch += 1;
      console.log(`  ! 不一致 ${d.code} ${it.sysId} 字面量=${it.amount} 派生=${derivedMap.get(it.sysId)}`);
    }
  });
});
line(`mock 明细字面量 vs 模型派生：核对 ${checked} 行，不一致 ${mismatch} 行`);

/* ------------------------------------------------------------------ *
 * 二、预算消耗
 * ------------------------------------------------------------------ */
head('五、预算消耗 · FY2026 执行年度（consumptionUpTo / consumptionBreakdown）');
const cons26 = data.departments.map((d) => {
  const r = C.consumptionUpTo(data, d.code, 2026, C.CURRENT_MONTH);
  return { ...r, bd: C.consumptionBreakdown(r, 2026) };
});
line(['部门', '整体预算', '整体消耗', '整体率/档', '项目率/档', '运维率/档', '恒等式'].join('\t'));
cons26.forEach((r) => {
  const eq =
    Math.abs(r.bd.overall.budget - (r.bd.project.budget + r.bd.ops.budget)) < 1 &&
    Math.abs(r.bd.overall.used - (r.bd.project.used + r.bd.ops.used)) < 1;
  line(
    [
      r.deptName,
      W(r.bd.overall.budget),
      W(r.bd.overall.used),
      `${P(r.bd.overall.rate)}/${r.bd.overall.level}`,
      `${P(r.bd.project.rate)}/${r.bd.project.level}`,
      `${P(r.bd.ops.rate)}/${r.bd.ops.level}`,
      eq ? '✓' : '✗'
    ].join('\t')
  );
});
line();
line(`整体档位分布：${JSON.stringify(tally(cons26.map((r) => r.bd.overall.level)))}`);
line(`项目档位分布：${JSON.stringify(tally(cons26.map((r) => r.bd.project.level)))}`);
line(`运维档位分布：${JSON.stringify(tally(cons26.map((r) => r.bd.ops.level)))}`);
/* 「整体正常但某一维度击穿」—— 逐维度独立判定才有的信息 */
const pierce = cons26.filter(
  (r) => ['warn', 'over'].includes(r.bd.overall.level) === false && ['warn', 'over'].includes(r.bd.project.level)
);
line(`「整体正常但项目侧击穿」部门数：${pierce.length} ${pierce.map((r) => r.deptName).join('、') || '（无）'}`);
const pierceOps = cons26.filter(
  (r) => !['warn', 'over'].includes(r.bd.overall.level) && ['warn', 'over'].includes(r.bd.ops.level)
);
line(`「整体正常但运维侧击穿」部门数：${pierceOps.length} ${pierceOps.map((r) => r.deptName).join('、') || '（无）'}`);
/* 三维度档位是否互不相同（着色差异的可见性） */
const distinct = cons26.filter((r) => {
  const s = new Set([r.bd.overall.level, r.bd.project.level, r.bd.ops.level]);
  return s.size === 3;
});
line(`三维度档位两两不同的部门数：${distinct.length} ${distinct.map((r) => r.deptName).join('、') || '（无）'}`);

head('六、预算消耗 · FY2027 编制年度');
const cons27 = data.departments.map((d) => {
  const r = C.consumptionUpTo(data, d.code, 2027, C.CURRENT_MONTH);
  return { ...r, bd: C.consumptionBreakdown(r, 2027) };
});
line(['部门', '整体预算', '已规划', '整体率/档', '项目率/档', '运维率/档'].join('\t'));
cons27.forEach((r) => {
  line(
    [
      r.deptName,
      W(r.bd.overall.budget),
      W(r.bd.overall.used),
      `${P(r.bd.overall.rate)}/${r.bd.overall.level}`,
      `${P(r.bd.project.rate)}/${r.bd.project.level}`,
      `${P(r.bd.ops.rate)}/${r.bd.ops.level}`
    ].join('\t')
  );
});
line();
line(`FY2027 整体档位分布：${JSON.stringify(tally(cons27.map((r) => r.bd.overall.level)))}`);

/* ------------------------------------------------------------------ *
 * 三、对账单
 * ------------------------------------------------------------------ */
head('七、对账单 · 账期状态与逐月费用');
line(`月份清单：${data.months.join(' ')}`);
line(`已核销：${data.confirmedMonths.join(' ')}`);
line(`已发出：${data.sentMonths.join(' ')}`);
line();
const monthRows = data.months.map((m) => {
  let d = 0;
  let o = 0;
  data.departments.forEach((dep) => {
    const b = C.buildBill(data, m, dep.code);
    d += b.deliveryTotal;
    o += b.opsTotal;
  });
  return { m, state: C.billStateOf(data, m), d, o, t: d + o };
});
line(['月份', '状态', '交付(万)', '运维(万)', '合计(万)'].join('\t'));
monthRows.forEach((r) => line([r.m, r.state, W(r.d), W(r.o), W(r.t)].join('\t')));
line();
line(`账期状态分布：${JSON.stringify(tally(monthRows.map((r) => r.state)))}`);
/* 恒等式：Σ部门账单 = 月度汇总 */
const eqOk = monthRows.every((r) => {
  let d = 0;
  let o = 0;
  data.departments.forEach((dep) => {
    const b = C.buildBill(data, r.m, dep.code);
    d += b.deliveryTotal;
    o += b.opsTotal;
  });
  return Math.abs(d - r.d) < 1 && Math.abs(o - r.o) < 1;
});
line(`Σ部门账单 = 月度汇总：${eqOk ? '✓' : '✗'}`);

head('八、交付计费账单总览（deliveryBillRows，累计态）');
const del = C.deliveryBillRows(data, null, null);
line(`行数：${del.rows.length} · 合计 ${W(del.totalAmount)} 万元 · 待复盘 ${del.retroPending}`);
line();
line(['BRD', '部门', '计费额(万)', '复盘价值(万)', 'ROI', '需求类型', '变更', '复盘'].join('\t'));
del.rows.forEach((r) =>
  line(
    [
      r.brdId,
      r.deptName,
      W(r.amount),
      r.realizedValue == null ? '—' : W(r.realizedValue),
      r.roi == null ? '—' : r.roi.toFixed(2),
      r.demandType,
      r.changeType,
      r.retrofitDone ? '已复盘' : '待复盘'
    ].join('\t')
  )
);
line();
line(`ROI 有值/为 null：${JSON.stringify(tally(del.rows.map((r) => (r.roi == null ? 'null' : '有值'))))}`);
line(`需求类型分布：${JSON.stringify(tally(del.rows.map((r) => r.demandType)))}`);
line(`变更类型分布：${JSON.stringify(tally(del.rows.map((r) => r.changeType)))}`);
/* 校验：交付楼层合计 = 同期部门账单 deliveryTotal 之和 */
const delEq = (() => {
  const billed = C.billedMonthsOf(data);
  let sum = 0;
  billed.forEach((m) => data.departments.forEach((d) => (sum += C.buildBill(data, m, d.code).deliveryTotal)));
  return Math.abs(sum - del.totalAmount) < 1;
})();
line(`交付楼层合计 = Σ(部门账单交付)：${delEq ? '✓' : '✗'}`);

head('九、系统运维计费账单总览（opsBillRows，累计态）');
const ops = C.opsBillRows(data, null, null);
line(`行数：${ops.rows.length} · 合计 ${W(ops.totalAmount)} 万元`);
line();
line(['系统', '计费方式', '用量', '费用(万)', '分摊BU数', '分摊BU'].join('\t'));
ops.rows.forEach((r) =>
  line(
    [
      r.systemName,
      r.billingMode,
      r.volume == null ? '固定年费' : C.fmtNum(r.volume),
      W(r.amount),
      r.shareCount,
      r.shares.map((s) => s.deptName).join('/')
    ].join('\t')
  )
);
line();
line(`计费方式分布：${JSON.stringify(tally(ops.rows.map((r) => r.billingMode)))}`);
line(`分摊 BU 数 ≥3 的系统：${ops.rows.filter((r) => r.shareCount >= 3).map((r) => r.systemName).join('、') || '（无）'}`);
line(`分摊 BU 数 = 1 的系统：${ops.rows.filter((r) => r.shareCount === 1).map((r) => r.systemName).join('、') || '（无）'}`);
/* 校验：运维楼层合计 = 同期部门账单 opsTotal 之和 */
const opsEq = (() => {
  const billed = C.billedMonthsOf(data);
  let sum = 0;
  billed.forEach((m) => data.departments.forEach((d) => (sum += C.buildBill(data, m, d.code).opsTotal)));
  return Math.abs(sum - ops.totalAmount) < 1;
})();
line(`运维楼层合计 = Σ(部门账单运维)：${opsEq ? '✓' : '✗'}`);

head('十、BRD 全量状态与 CR 分布');
const bdStates = tally(data.brds.map((b) => b.status));
line(`BRD 总数 ${data.brds.length}：${JSON.stringify(bdStates)}`);
line(`关系类型：${JSON.stringify(tally(data.brds.map((b) => b.relationType)))}`);
const crs = data.brds.flatMap((b) => b.crs || []);
line(`CR 总数 ${crs.length}：${JSON.stringify(tally(crs.map((c) => c.status)))}`);
line(`CR 类型：${JSON.stringify(tally(crs.map((c) => c.type)))}`);
/* CR 为负（减免费用）—— 三态渲染分支 */
const crNeg = data.brds.filter((b) => C.brdCRDelta(data, b) < 0);
line(`crTotal 为负的 BRD：${crNeg.length} ${crNeg.map((b) => b.id).join('、') || '（无）'}`);
/* 实际投入 vs 评估价（偏差正负） */
const devs = data.brds
  .filter((b) => b.delivery)
  .map((b) => ({ id: b.id, dev: C.brdActualAmount(data, b) / C.brdFinalAmount(data, b) - 1 }));
line(`实际投入偏差：正 ${devs.filter((d) => d.dev > 0.02).length} / 负 ${devs.filter((d) => d.dev < -0.02).length} / 持平 ${devs.filter((d) => Math.abs(d.dev) <= 0.02).length}`);

head('十一、预算池（poolState 2026 / 2027）');
const s26 = C.poolSummary(data, 2026);
const s27 = C.poolSummary(data, 2027);
line(`FY2026 总包 ${W(s26.total)} 万 · 已用 ${W(s26.used)} 万（${P(s26.usageRate)}）· 可用 ${W(s26.available)} 万`);
line(`  已核销 ${W(s26.billed)} · 已承诺 ${W(s26.committed)} · 已规划 ${W(s26.planned)}`);
line(`  档位：${JSON.stringify(tally(s26.rows.map((r) => r.level)))}`);
line(`  透支部门：${s26.overDepts.map((r) => r.deptName).join('、') || '（无）'} · 预警：${s26.warnDepts.map((r) => r.deptName).join('、') || '（无）'}`);
line(`FY2027 总包 ${W(s27.total)} 万 · 已规划 ${W(s27.used)} 万（${P(s27.usageRate)}）· 可用 ${W(s27.available)} 万`);
line(`  档位：${JSON.stringify(tally(s27.rows.map((r) => r.level)))}`);
/* 恒等式：used = committed + billed（执行年） */
line(`FY2026 恒等式 used = committed + billed：${s26.rows.every((r) => Math.abs(r.used - (r.committed + r.billed)) < 1) ? '✓' : '✗'}`);

head('十二、需求 ROI（FY2027 预估口径 roiOf）');
const roi = data.demands.filter((d) => d.fy === 2027);
line(`FY2027 需求 ${roi.length} 条：${JSON.stringify(tally(roi.map((d) => (C.roiOf(d) == null ? 'null' : '有值'))))}`);
line(`ROI 区间：${roi.map((d) => C.roiOf(d)).filter((v) => v != null).map((v) => v.toFixed(2)).join(' ')}`);

head('十三、系统目录与用量覆盖');
line(`系统数 ${data.systems.length}：${JSON.stringify(tally(data.systems.map((s) => s.billing)))}`);
line('各系统被哪些部门使用（VOLUME_BASE）：');
data.systems.forEach((s) => {
  const shares = data.systems && s.id ? null : null;
  const v = (data.departments || []).length;
  line(`  ${s.id} ${s.name} [${s.billing}]`);
});
