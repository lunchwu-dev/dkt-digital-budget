/**
 * 迪卡侬中国 · 数字化项目预算管理平台 — 领域计算层
 *
 * 设计原则：本文件全部为纯函数，不依赖 React、不触及 UI。
 * 真实实施时，这一层应整体下沉到服务端（或 BFF），前端只做展示。
 * 这样做的目的是让「钱怎么算」这件事只有一个真相来源。
 */

import {
  VOLUME_BASE, FY2026_MONTHS, billStatusOf, CONFIRMED_THROUGH, seeded, TODAY
} from '../data/mock.js';

/* ================================================================== *
 * 一、格式化
 * ================================================================== */

export function fmtWan(v, digits = 1) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const wan = v / 10000;
  return wan.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtYuan(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return '¥' + Math.round(v).toLocaleString('zh-CN');
}

export function fmtNum(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return Math.round(v).toLocaleString('zh-CN');
}

export function fmtPct(v, digits = 1) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return (v * 100).toFixed(digits) + '%';
}

export function signedPct(v, digits = 1) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const s = (v * 100).toFixed(digits) + '%';
  return v > 0 ? '+' + s : s;
}

/* ================================================================== *
 * 二、费率表与金额计算
 * ================================================================== */

/** 取某年度某角色的费率（元/人天）。费率表在预算期锁定，全年不调价。 */
export function rateOf(rateCards, fy, role) {
  const card = rateCards[fy] || rateCards[2026];
  return card[role] || 0;
}

/** 按 [角色, 人天] 明细计算金额 */
export function mdAmount(rateCards, fy, lines) {
  if (!lines || !lines.length) return 0;
  return lines.reduce((sum, [role, md]) => sum + md * rateOf(rateCards, fy, role), 0);
}

/** 人天合计 */
export function mdTotal(lines) {
  if (!lines || !lines.length) return 0;
  return lines.reduce((s, [, md]) => s + md, 0);
}

/** 交付费用评估价（BRD 签收时锁定） */
export function brdEvalAmount(data, brd) {
  return mdAmount(data.rateCards, brd.fy, brd.evalLines);
}

/** 已批准变更（CR）累计增减金额 */
export function brdCRDelta(data, brd) {
  return (brd.crs || [])
    .filter((c) => c.status === '已批准')
    .reduce((s, c) => s + mdAmount(data.rateCards, brd.fy, c.delta), 0);
}

/** BRD 最终结算基准 = 评估价 + 已批准 CR 增减 */
export function brdFinalAmount(data, brd) {
  return brdEvalAmount(data, brd) + brdCRDelta(data, brd);
}

/** 实际投入金额（按交付确认的实际人天 × 同一费率表） */
export function brdActualAmount(data, brd) {
  if (!brd.delivery || !brd.delivery.actualLines) return null;
  return mdAmount(data.rateCards, brd.fy, brd.delivery.actualLines);
}

/** 估算口径：需求清单预估金额（混岗均价系数） */
export function demandEstAmount(demand) {
  return demand.estAmount;
}

/* ================================================================== *
 * 三、运维计费（Run 费用）
 *     order  → 订单量 × 单价
 *     member → 规模（千人）× 单价
 *     fixed  → 年费 / 12 × 份额
 * ================================================================== */

const SEASON = [0.86, 0.82, 0.95, 0.98, 1.02, 1.08, 1.04, 1.0, 1.06, 1.1, 1.12, 1.18];

function fnv1a(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * 某系统在某月被某部门消耗的计量值。
 * 使用确定性伪随机 + 季节性系数，保证同一月份任意次打开看到的数据一致。
 */
export function opVolume(systemId, deptCode, month) {
  const base = (VOLUME_BASE[systemId] || {})[deptCode];
  if (!base) return 0;
  const mi = Number(month.slice(5, 7)) - 1;
  const rnd = seeded(fnv1a(`${systemId}|${deptCode}`));
  const noise = 0.96 + rnd() * 0.08;
  const v = base * SEASON[mi] * noise;
  return Math.round(v / 50) * 50;
}

/** 某系统某月对某部门的运维计费金额 */
export function opsLineAmount(sys, deptCode, month) {
  const shares = VOLUME_BASE[sys.id] || {};
  if (!shares[deptCode]) return 0;
  if (sys.billing === 'fixed') {
    const total = Object.values(shares).reduce((a, b) => a + b, 0) || 1;
    return Math.round((sys.rate / 12) * (shares[deptCode] / total));
  }
  return Math.round(opVolume(sys.id, deptCode, month) * sys.rate);
}

/* ================================================================== *
 * 四、账单（Bill of IT）
 * ================================================================== */

/** 账单是否已确认（进入核销口径） */
export function isConfirmed(data, month) {
  return (data.confirmedMonths || []).includes(month);
}

export function billStateOf(data, month) {
  return billStatusOf(month, data.confirmedMonths, data.sentMonths);
}

/** BRD 在哪个月出账 —— 以实际上线月为准 */
export function billMonthOf(brd) {
  return brd.delivery ? brd.delivery.goLiveDate.slice(0, 7) : null;
}

export function billIdOf(month, deptCode) {
  return `BILL-${month.replace('-', '')}-${deptCode.replace('D-', '')}`;
}

/**
 * 生成某部门某月的应收账单。
 * 账单由两部分构成：
 *   A. 交付计费 —— 按当月交付上线的需求，逐条计价
 *   B. 运维计费 —— 按订单量 / 会员规模，逐系统计价
 */
export function buildBill(data, month, deptCode) {
  const dept = data.departments.find((d) => d.code === deptCode);
  const lines = [];

  /* A. 交付计费 */
  data.brds
    .filter((b) => b.dept === deptCode && billMonthOf(b) === month)
    .forEach((b) => {
      const evalAmt = brdEvalAmount(data, b);
      const crAmt = brdCRDelta(data, b);
      const crApproved = (b.crs || []).filter((c) => c.status === '已批准');
      const actualAmt = brdActualAmount(data, b);
      lines.push({
        key: `D-${b.id}`,
        type: 'DELIVERY',
        refId: b.id,
        refTitle: b.title,
        systemId: b.system,
        amount: evalAmt + crAmt,
        evalAmount: evalAmt,
        crAmount: crAmt,
        actualAmount: actualAmt,
        demandType: b.relationType === 'NEW' ? '年度新增需求' : '年初计划内',
        changeType: crApproved.length ? `范围 / 需求变更 ×${crApproved.length}` : '无变更',
        pricingBasis: crApproved.length ? '变更后价' : '评估价',
        evalMD: mdTotal(b.evalLines),
        actualMD: b.delivery ? mdTotal(b.delivery.actualLines) : null,
        goLiveDate: b.delivery ? b.delivery.goLiveDate : null
      });
    });

  /* B. 运维计费 */
  data.systems.forEach((sys) => {
    const amt = opsLineAmount(sys, deptCode, month);
    if (amt <= 0) return;
    lines.push({
      key: `O-${sys.id}`,
      type: 'OPS',
      refId: sys.id,
      refTitle: sys.name,
      systemId: sys.id,
      amount: amt,
      billingMode: sys.billing,
      unit: sys.unit,
      rate: sys.rate,
      volume: sys.billing === 'fixed' ? null : opVolume(sys.id, deptCode, month)
    });
  });

  const deliveryTotal = lines.filter((l) => l.type === 'DELIVERY').reduce((s, l) => s + l.amount, 0);
  const opsTotal = lines.filter((l) => l.type === 'OPS').reduce((s, l) => s + l.amount, 0);

  return {
    id: billIdOf(month, deptCode),
    month,
    dept: deptCode,
    deptName: dept ? dept.name : deptCode,
    status: billStateOf(data, month),
    lines,
    deliveryTotal,
    opsTotal,
    total: deliveryTotal + opsTotal,
    newDemandTotal: lines
      .filter((l) => l.type === 'DELIVERY' && l.demandType === '年度新增需求')
      .reduce((s, l) => s + l.amount, 0),
    crTotal: lines.filter((l) => l.type === 'DELIVERY').reduce((s, l) => s + l.crAmount, 0)
  };
}

/** 某月全部部门账单 */
export function buildBillsForMonth(data, month) {
  return data.departments.map((d) => buildBill(data, month, d.code));
}

/** 某月某部门账单总额（预算池核销用） */
export function monthDeptTotal(data, month, deptCode) {
  return buildBill(data, month, deptCode).total;
}

/* ================================================================== *
 * 五、预算池（额度的三重口径）
 *     Planned   已规划 —— 需求清单预估，影子占用，用于预警
 *     Committed 已承诺 —— BRD 签收锁定评估价，尚未出账
 *     Billed    已核销 —— 已确认账单的实际金额
 *     可用余额 = 总包 - 已承诺 - 已核销
 * ================================================================== */

export const POOL_LEVEL = {
  ok: { text: '正常', tone: 'success' },
  watch: { text: '关注', tone: 'processing' },
  warn: { text: '预警', tone: 'warning' },
  over: { text: '已透支', tone: 'error' }
};

export function poolLevel(rate) {
  if (rate >= 1) return 'over';
  if (rate >= 0.9) return 'warn';
  if (rate >= 0.7) return 'watch';
  return 'ok';
}

/**
 * 计算某部门某年度的预算池状态。
 * @param fy 2026 表示执行中（按 Committed + Billed 口径）；2027 表示编制中（按 Planned 口径）
 */
export function poolState(data, deptCode, fy) {
  const dept = data.departments.find((d) => d.code === deptCode);
  if (!dept) return null;
  const isExecuting = fy === 2026;
  const total = isExecuting ? dept.poolFY26 : dept.poolFY27;

  const planned = data.demands
    .filter((d) => d.fy === fy && d.dept === deptCode)
    .reduce((s, d) => s + d.estAmount, 0);

  let committed = 0;
  let deliveredPending = 0;
  let inFlightCount = 0;

  data.brds
    .filter((b) => b.dept === deptCode && b.fy === fy)
    .forEach((b) => {
      const amt = brdFinalAmount(data, b);
      if (b.status === 'SIGNED') {
        committed += amt;
      } else if (b.status === 'DELIVERED') {
        const m = billMonthOf(b);
        if (!isConfirmed(data, m)) {
          committed += amt;
          deliveredPending += amt;
        }
      } else if (b.status === 'SUBMITTED' || b.status === 'EVALUATING') {
        inFlightCount += 1;
      }
    });

  let billed = 0;
  if (isExecuting) {
    data.months
      .filter((m) => isConfirmed(data, m))
      .forEach((m) => {
        billed += monthDeptTotal(data, m, deptCode);
      });
  }

  const used = isExecuting ? committed + billed : planned;
  const available = total - used;
  const usageRate = total ? used / total : 0;

  return {
    deptCode,
    deptName: dept.name,
    fy,
    mode: isExecuting ? 'executing' : 'planning',
    total,
    planned,
    committed,
    billed,
    deliveredPending,
    inFlightCount,
    used,
    available,
    usageRate,
    plannedRate: total ? planned / total : 0,
    level: poolLevel(usageRate),
    overAmount: available < 0 ? -available : 0
  };
}

/** 全部部门某年度预算池汇总 */
export function poolSummary(data, fy) {
  const rows = data.departments.map((d) => poolState(data, d.code, fy));
  const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
  const total = sum('total');
  const used = sum('used');
  return {
    rows,
    total,
    planned: sum('planned'),
    committed: sum('committed'),
    billed: sum('billed'),
    used,
    available: total - used,
    usageRate: total ? used / total : 0,
    overDepts: rows.filter((r) => r.level === 'over'),
    warnDepts: rows.filter((r) => r.level === 'warn')
  };
}

/* ================================================================== *
 * 六、全链路追溯
 * ================================================================== */

/** 由 BRD 反查完整链条：BP → 需求 → BRD → 评估/CR → 交付 → 账单 */
export function traceOfBrd(data, brd) {
  const demand = brd.relatedDemandId
    ? data.demands.find((d) => d.id === brd.relatedDemandId) || null
    : null;
  // 当前版本 = 该部门版本列表最新一条（唯一真相源：bpVersions，不再读 bpRecords）
  const bp = bpVersionsOf(data, brd.dept, brd.fy)[0] || null;
  const month = billMonthOf(brd);
  return {
    brd,
    bp,
    demand,
    evalAmount: brdEvalAmount(data, brd),
    crAmount: brdCRDelta(data, brd),
    finalAmount: brdFinalAmount(data, brd),
    actualAmount: brdActualAmount(data, brd),
    evalMD: mdTotal(brd.evalLines),
    actualMD: brd.delivery ? mdTotal(brd.delivery.actualLines) : null,
    billMonth: month,
    billId: month ? billIdOf(month, brd.dept) : null,
    billStatus: month ? billStateOf(data, month) : null
  };
}

/** 由需求反查：该需求派生了几条 BRD、预估 vs 实际偏差 */
export function traceOfDemand(data, demandId) {
  const demand = data.demands.find((d) => d.id === demandId);
  if (!demand) return null;
  const chains = data.brds
    .filter((b) => b.relatedDemandId === demandId)
    .map((b) => traceOfBrd(data, b));
  const actualSum = chains
    .map((c) => (c.brd.delivery ? c.finalAmount : null))
    .filter((v) => v !== null)
    .reduce((s, v) => s + v, 0);
  const committedSum = chains
    .filter((c) => c.brd.status === 'SIGNED' || c.brd.status === 'DELIVERED')
    .reduce((s, c) => s + c.finalAmount, 0);
  return {
    demand,
    bp: bpVersionsOf(data, demand.dept, demand.fy)[0] || null,
    chains,
    estAmount: demand.estAmount,
    estMD: demand.estMD,
    actualSum,
    committedSum,
    deviation: demand.estAmount ? committedSum / demand.estAmount - 1 : 0
  };
}

/* ================================================================== *
 * 七、跨年度影响分析（当年新增需求对次年预算的冲击）
 * ================================================================== */

export function crossYearImpact(data) {
  const newBrds = data.brds.filter((b) => b.fy === 2026 && b.relationType === 'NEW');
  const byDept = {};
  newBrds.forEach((b) => {
    const amt = b.status === 'SIGNED' || b.status === 'DELIVERED' ? brdFinalAmount(data, b) : 0;
    if (!byDept[b.dept]) byDept[b.dept] = { dept: b.dept, count: 0, amount: 0, pending: 0 };
    byDept[b.dept].count += 1;
    if (amt) byDept[b.dept].amount += amt;
    else byDept[b.dept].pending += 1;
  });
  return Object.values(byDept).map((r) => {
    const dept = data.departments.find((d) => d.code === r.dept);
    const pool26 = dept.poolFY26;
    return {
      ...r,
      deptName: dept.name,
      poolFY26: pool26,
      share: pool26 ? r.amount / pool26 : 0
    };
  }).sort((a, b) => b.amount - a.amount);
}

/* ================================================================== *
 * 八、总览指标
 * ================================================================== */

export function dashboardKpi(data) {
  const s26 = poolSummary(data, 2026);
  const s27 = poolSummary(data, 2027);
  const delivered = data.brds.filter((b) => b.status === 'DELIVERED');
  const signed = data.brds.filter((b) => b.status === 'SIGNED');
  const pendingEval = data.brds.filter((b) => b.status === 'SUBMITTED' || b.status === 'EVALUATING');
  const newDemands = data.brds.filter((b) => b.fy === 2026 && b.relationType === 'NEW');

  const crCount = data.brds.reduce((s, b) => s + (b.crs || []).length, 0);
  const crAmount = data.brds.reduce((s, b) => s + brdCRDelta(data, b), 0);

  const confirmedMonths = FY2026_MONTHS.filter((m) => isConfirmed(data, m));
  const billedOps = confirmedMonths.reduce(
    (s, m) => s + data.departments.reduce((ss, d) => ss + buildBill(data, m, d.code).opsTotal, 0), 0
  );
  const billedDelivery = confirmedMonths.reduce(
    (s, m) => s + data.departments.reduce((ss, d) => ss + buildBill(data, m, d.code).deliveryTotal, 0), 0
  );

  return {
    pool26: s26,
    pool27: s27,
    deliveredCount: delivered.length,
    signedCount: signed.length,
    pendingEvalCount: pendingEval.length,
    newDemandCount: newDemands.length,
    newDemandAmount: newDemands.reduce(
      (s, b) => s + (b.status === 'SIGNED' || b.status === 'DELIVERED' ? brdFinalAmount(data, b) : 0), 0
    ),
    crCount,
    crAmount,
    billedOps,
    billedDelivery,
    billedTotal: billedOps + billedDelivery,
    confirmedThrough: CONFIRMED_THROUGH,
    avgOpsRatio: s26.total ? billedOps / s26.total : 0
  };
}

/* ================================================================== *
 * 九、年度预算计划口径（v0.3 新增）
 *
 * 业务部门年度 Digital 预算 = ① 业务规划 BP 文档
 *                          + ② 需求清单及其费用预估（业务产出、Digital 复核确认）
 *                          + ③ 系统运维预估费用（Digital 产出、业务复核确认）
 * 本节的职责：把 ② ③ 的金额算出来，并给出「总包 = 项目费用预算 + 系统运维费用预算」的拆分。
 * ================================================================== */

/** 当前账期（截止当月）—— 与 TODAY 同源，避免各处自行推导 */
export function currentMonthOf() {
  return TODAY.slice(0, 7);
}

export const CURRENT_MONTH = currentMonthOf();

/** 某年度的 12 个自然月（用于把月度计费模型年化） */
function monthsOfYear(fy) {
  return Array.from({ length: 12 }, (_, i) => `${fy}-${String(i + 1).padStart(2, '0')}`);
}

/**
 * 系统运维预估费用（按系统逐项）。
 * 口径：以运维计费模型（订单量 / 会员规模 / 固定年费）对 12 个自然月求和，
 *       再乘以该部门在编制年度的业务量增长系数（执行年度恒为 1，不影响当年账单）。
 */
export function opsPlanBySystem(data, deptCode, fy) {
  const dept = data.departments.find((d) => d.code === deptCode);
  const growth = fy === 2026 || !dept || !dept.opsGrowth ? 1 : dept.opsGrowth;
  const months = monthsOfYear(fy);
  return data.systems
    .map((sys) => {
      const annual = months.reduce((s, m) => s + opsLineAmount(sys, deptCode, m), 0) * growth;
      return { key: sys.id, sys, amount: Math.round(annual), monthlyAvg: annual / 12, months };
    })
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

/**
 * 某部门某年度**清单当前版本费用合计**（元）—— 全部页面的项目费用真相源。
 *
 * 口径：已核定取 Digital 核定值 `evalAmount`，未核定回退业务预估 `estAmount`。
 * 与《年度预算计划》主表 ② 列、下钻页「项目总费用」**逐字同源**。
 *
 * **必须单点定义**：此前本算法在 annualPlanRow(:761) 与 demandProjectPage(:993)
 * 各写一份。两份一致时看不出问题，一旦其中一处调整口径，两页静默分叉 ——
 * 这正是「同一业务事实多条取数路径」这类缺陷的典型成因。
 */
export function demandAmountOf(data, deptCode, fy) {
  return data.demands
    .filter((d) => d.dept === deptCode && d.fy === fy)
    .reduce((s, d) => s + (d.evalAmount != null ? d.evalAmount : d.estAmount), 0);
}

/** 系统运维预估费用合计（元） */
export function opsAnnualEstimate(data, deptCode, fy) {
  return opsPlanBySystem(data, deptCode, fy).reduce((s, r) => s + r.amount, 0);
}

/**
 * 预算构成：**总包 = 项目预算额度 + 运维预算**，另有「清单预估」独立成字段。
 *
 * 三个金额是三个不同的事实，v1.6 起必须分名承载，禁止再互相代入：
 *   · total          总包（财务给 BU 的额度）= 部门年度预算池
 *   · projectBudget  **项目预算额度** = 总包 − 运维预算（残差；钱不够时就是不够）
 *   · projectDemand  **清单预估**     = 需求清单当前版本费用合计（业务要花多少）
 *   · projectGap     缺口 = 清单预估 − 项目预算额度（>0 表示清单超出额度）
 *
 * **为什么 projectBudget 不改成直取 projectDemand**（曾评估并否决）：
 * 残差口径下 D-SVC 项目侧消耗率 437% 是**真实超支**（总包 140 万，运维计费模型
 * 年化吃掉 109.1 万，剩余额度 30.9 万，而清单预估 172.5 万）。若把分母换成
 * 清单预估，同样的数会显示成 78.4%「正常」—— **超支信号被掩盖**。
 * 额度就是额度：它回答"钱够不够"，清单预估回答"业务要花多少"，两者不可互相替代。
 *
 * v1.6 之前的缺陷不是取值错，而是**两个不同语义共用「项目预算」一个名字**，
 * 且 projectOver（缺口）虽已在领域层算出却全站无消费方 ⇒ 用户看不到超支。
 * 现把缺口提升为一级字段并上界面。
 */
export function budgetComposition(data, deptCode, fy) {
  const pool = poolState(data, deptCode, fy);
  const opsBudget = opsAnnualEstimate(data, deptCode, fy);
  const projectBudget = pool.total - opsBudget;
  const projectDemand = demandAmountOf(data, deptCode, fy);
  return {
    pool,
    total: pool.total,
    opsBudget,
    projectBudget,
    /** 清单预估（业务侧要花的钱），与年度预算计划页 ② 列同源 */
    projectDemand,
    /** 缺口 = 清单预估 − 项目预算额度；>0 即清单超出额度（超支） */
    projectGap: projectDemand - projectBudget,
    opsShare: pool.total ? opsBudget / pool.total : 0,
    /** 额度口径占比（分母总包） */
    projectShare: pool.total ? projectBudget / pool.total : 0
  };
}

/**
 * 预算消耗进度（截止当月口径）。
 *   执行年度：已核销（已确认账单，并按项目 / 运维分列）+ 已承诺（签收锁价未出账）
 *   编制年度：执行期未开始，消耗为 0，改以「已规划（需求清单预估）」口径呈现
 *
 * v1.6 P0-5：已核销口径**显式走 `billedMonthsOf(data, 'CONFIRMED')`**。
 * 此前此处用 `months.filter(m => isConfirmed(...))` 内联，与账单页的
 * `NOT_DRAFT` 门槛并存且无说明，两页对同一公司差 369.4 万。现在口径单点定义。
 *
 * @param throughMonth 截止月（含），默认当前账期
 */
export function consumptionUpTo(data, deptCode, fy, throughMonth = CURRENT_MONTH) {
  const executing = fy === 2026;
  const confirmed = executing
    ? billedMonthsOf(data, 'CONFIRMED').filter((m) => m <= throughMonth)
    : [];

  let projectBilled = 0;
  let opsBilled = 0;
  confirmed.forEach((m) => {
    const b = buildBill(data, m, deptCode);
    projectBilled += b.deliveryTotal;
    opsBilled += b.opsTotal;
  });

  const comp = budgetComposition(data, deptCode, fy);
  const pool = comp.pool;
  const billed = executing ? projectBilled + opsBilled : 0;
  const committed = executing ? pool.committed : 0;
  const planned = pool.planned;
  const used = executing ? billed + committed : planned;

  return {
    ...comp,
    deptCode,
    deptName: pool.deptName,
    fy,
    throughMonth,
    confirmedMonths: confirmed,
    projectBilled,
    opsBilled,
    billed,
    committed,
    planned,
    used,
    available: comp.total - used,
    usageRate: comp.total ? used / comp.total : 0,
    level: poolLevel(comp.total ? used / comp.total : 0),
    overAmount: comp.total - used < 0 ? used - comp.total : 0,
    plannedRate: comp.total ? planned / comp.total : 0
  };
}

/* ================================================================== *
 * 九之二、预算消耗的三段式拆解（v0.7 新增）
 *
 * 「预算消耗」板块的两个楼层共用同一个口径，因此拆解必须下沉到这里 ——
 * 卡片与表格各行若各算各的，早晚会出现「卡片 4,440.0 / 表格合计 4,439.6」这类
 * 自相矛盾。本函数是唯一来源。
 *
 * 三段的关系（恒等式，可用于回归校验）：
 *   整体预算 = 项目预算 + 运维预算
 *   整体消耗 = 项目消耗 + 运维消耗
 *
 * 消耗口径：
 *   执行年度（2026）
 *     项目侧 = 项目已核销 + 已承诺
 *              —— 「已承诺」全部来自 BRD 签收锁价、尚未出账的交付费用，属**项目侧**；
 *                 运维是按月计费的，不存在「承诺」这一中间态。
 *     运维侧 = 运维已核销
 *   编制年度（2027）
 *     执行期尚未开始，两个侧都没有实际消耗；
 *     项目侧改以「已规划」呈现（需求清单预估费用），运维侧恒为 0
 *     —— 运维由计费模型在编制期只给出年化预算，不做「已规划」这种影子占用。
 *
 * @param row consumptionUpTo() 的返回值
 * ================================================================== */
export function consumptionBreakdown(row, fy) {
  const executing = fy === 2026;
  const seg = (budget, used, billed) => ({
    budget,
    used,
    billed,
    rate: budget ? used / budget : 0,
    level: poolLevel(budget ? used / budget : 0)
  });

  const projectUsed = executing ? row.projectBilled + row.committed : row.planned;
  const opsUsed = executing ? row.opsBilled : 0;
  const overallUsed = projectUsed + opsUsed;

  return {
    executing,
    /** 执行年「已消耗」/ 编制年「已规划」—— 文案标签由调用方取自此处，避免各处硬编码 */
    usedLabel: executing ? '已消耗' : '已规划',
    overall: {
      ...seg(row.total, overallUsed, row.billed),
      committed: row.committed,
      planned: row.planned
    },
    project: {
      ...seg(row.projectBudget, projectUsed, row.projectBilled),
      committed: executing ? row.committed : 0,
      planned: row.planned,
      /**
       * 清单预估与额度缺口（v1.6 新增，此前 projectGap 只在领域层，无消费方）。
       * `overGap > 0` = 清单要花的钱超过总包分给项目的额度，是**真实超支信号**；
       * 绝不能通过把分母换成清单预估来「消化」它（会把 437% 显示成 78% 正常）。
       */
      demand: row.projectDemand,
      overGap: row.projectGap
    },
    ops: {
      ...seg(row.opsBudget, opsUsed, row.opsBilled),
      committed: 0,
      planned: 0
    }
  };
}

/**
 * 某 BU 的 BP 版本记录（最新在前）。
 *
 * 排序必须是**合法全序**：`at` 只有分钟精度，同分钟连续提交时两条 `at` 完全相等，
 * 而 `(a, b) => (a.at < b.at ? 1 : -1)` 对相等返回 -1（不是 0）—— 这不是合法比较器，
 * 结果不可预期（实测会出现新版本不置顶）。故显式补 tie-breaker：
 *   版本 id 形如 `BPV-RETAIL-3`（mock）/ `BPV-D-RETAIL-4`（store 新建），末段数字即版本序号；
 *   先按提交时间降序，同分钟再按版本序号降序（序号大的更新、靠前）。
 * 不依赖引擎的稳定排序，也不改 `at` 的格式（改全站时间格式副作用过大）。
 */
export function bpVersionsOf(data, deptCode, fy) {
  const seqOf = (id) => {
    const n = Number(String(id || '').split('-').pop());
    return Number.isNaN(n) ? 0 : n;
  };
  return (data.bpVersions || [])
    .filter((v) => v.dept === deptCode && v.fy === fy)
    .slice()
    .sort((a, b) => (a.at !== b.at ? (a.at < b.at ? 1 : -1) : seqOf(b.id) - seqOf(a.id)));
}

/* ------------------------------------------------------------------ *
 * BP 版本内容的共享派生工具（v1.0）
 *   目的：让「文档形式文案」与「摘要来源文案」在主表 title、综合视图卡片、
 *   新页面列表**三处同源**，避免同一事实多处手写导致文案漂移。
 * ------------------------------------------------------------------ */

/** 某 BP 版本的文档数组（无则空数组） */
export function bpDocsOf(v) {
  return (v && v.docs) || [];
}

/**
 * BP 版本的「文档形式」文案：
 *   无文档        → 「未提供文档」
 *   全部为链接     → 「文档链接」
 *   含附件（或混合）→ 「{n} 份附件」
 */
export function bpDocFormLabel(v) {
  const docs = bpDocsOf(v);
  if (!docs.length) return '未提供文档';
  const allLink = docs.every((d) => d.kind === 'link');
  if (allLink) return '文档链接';
  return `${docs.length} 份附件`;
}

/**
 * BP 版本摘要的渲染状态（摘要列四态 + 兜底，唯一来源）。
 * 返回 { text, source, sourceLabel, pending, failed }：
 *   business   → { text: summary, sourceLabel:'业务填写' }
 *   ai         → { text: summary, sourceLabel:'AI 生成' }
 *   ai_pending → { text:'AI 生成中…', pending:true, sourceLabel:null }
 *   ai_failed  → { text:'AI 生成失败 · 可在「修正年度 BP」中补充', failed:true, sourceLabel:null }
 *   其它 / null→ { text:'—' }
 */
export function bpSummaryStateOf(v) {
  const src = v && v.summarySource;
  const body = (v && v.summary) || null;
  if (src === 'business') return { text: body, source: 'business', sourceLabel: '业务填写', pending: false, failed: false };
  if (src === 'ai') return { text: body, source: 'ai', sourceLabel: 'AI 生成', pending: false, failed: false };
  if (src === 'ai_pending') return { text: 'AI 生成中…', source: 'ai_pending', sourceLabel: null, pending: true, failed: false };
  if (src === 'ai_failed') {
    return {
      text: 'AI 生成失败 · 可在「修正年度 BP」中补充',
      source: 'ai_failed',
      sourceLabel: null,
      pending: false,
      failed: true
    };
  }
  return { text: '—', source: null, sourceLabel: null, pending: false, failed: false };
}

/** 某 BU 的需求清单版本记录（最新在前） */
export function demandVersionsOf(data, deptCode, fy) {
  return (data.demandVersions || [])
    .filter((v) => v.dept === deptCode && v.fy === fy)
    .slice()
    .sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1));
}

/**
 * 次版本号自增：传入已有版本记录（含 version 字段），返回下一个版本号。
 * 无历史 → V1.0；否则取最大版本递增次版本号（V1.0 → V1.1 → V1.2 …）。
 * BP 与需求清单版本共用同一规则。
 */
export function nextMinorVersion(versions) {
  const nums = (versions || [])
    .map((v) => /^V(\d+)\.(\d+)$/.exec((v && v.version) || ''))
    .filter(Boolean)
    .map((m) => [Number(m[1]), Number(m[2])]);
  if (!nums.length) return 'V1.0';
  const [major, minor] = nums.sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(-1)[0];
  return `V${major}.${minor + 1}`;
}

/**
 * 年度预算计划：单个 BU 一行的编制情况。
 *
 * 三个编制项（v0.5 口径）：
 *   ① 年度 BP            —— 只有「已提交 / 未提交」，记录版本号、更新时间与变更说明
 *   ② 需求清单及费用预估   —— **整份清单**为一个版本：待评估费用 → 已确认（V1.0、V1.1 …）
 *   ③ 系统运维预算        —— Digital 出具、业务复核确认（沿用 v0.3 口径）
 * 「总项目费用」不再独立成项：它等于需求清单当前版本的费用合计。
 */
export function annualPlanRow(data, deptCode, fy) {
  const dept = data.departments.find((d) => d.code === deptCode) || {};
  // 先算版本列表，当前版本 = 列表首行（最新在前）；bp 不再单独读 bpRecords（避免双真相源）
  const bpVersions = bpVersionsOf(data, deptCode, fy);
  const bp = bpVersions[0] || null;

  const demands = data.demands.filter((d) => d.dept === deptCode && d.fy === fy);
  const demandMD = demands.reduce((s, d) => s + d.estMD, 0);
  const demandEstAmount = demands.reduce((s, d) => s + d.estAmount, 0);
  const demandEvalAmount = demands.reduce((s, d) => s + (d.evalAmount || 0), 0);
  const demandEvalPending = demands.filter((d) => d.evalAmount == null).length;
  /** 当前清单费用合计：已核定取核定值，未核定回退业务预估（单点定义见 demandAmountOf） */
  const demandAmount = demandAmountOf(data, deptCode, fy);

  const demandVersions = demandVersionsOf(data, deptCode, fy);
  const latestDemandVersion = demandVersions[0] || null;
  const confirmedDemandVersion = demandVersions.find((v) => v.status === '已确认') || null;
  const demandStatus = !latestDemandVersion
    ? '未提交'
    : latestDemandVersion.status === '已确认'
    ? '已确认'
    : '待评估费用';

  /**
   * 进行中的新版本（v0.8）：内容独立于 demands，主表只取"状态 + 条数"用于徽标/提示。
   * `draft` 与 `demandVersions` 的进行中版本（version=null、status ∈ {待评估费用, 待复核确认}）
   * **一一对应**，mock 侧已保证两者同步存在（无 draft 即无进行中版本）。
   */
  const demandDraft = (data.demandDrafts || []).find((dr) => dr.dept === deptCode && dr.fy === fy) || null;
  const demandHasInProgress = !!demandDraft;
  const demandInProgressCount = demandDraft ? demandDraft.items.length : 0;
  const demandDraftStatus = demandDraft ? demandDraft.status : null;

  const opsPlan = (data.opsPlans || []).find((o) => o.dept === deptCode && o.fy === fy) || null;
  /**
   * v1.1（R4 裁决）：③ 系统运维预算主表金额改为**三级回退**：
   *   1. 已确认明细（opsPlan.items 落库）→ 明细快照即真相源（主表与页面严格同源）；
   *   2. 待业务确认草稿合计（draft.status === '待业务确认'）→ 提交即生效于主表，
   *      与 submitOpsDraft 置 issueDate = TODAY 配套（主表格即时显示待确认金额）；
   *   3. 未确认且无待确认草稿（items 为 null）→ 保留 opsPlanBySystem 派生回退
   *      （否则"主表 0 / 页面有值"）。
   * 因 mock 草稿字面量与派生值逐行相等（验证 20/20），初始态主表格金额不因本轮改动而跳。
   */
  const opsRowFromItems = (items) =>
    items
      .map((it) => {
        const sys =
          data.systems.find((s) => s.id === it.sysId) ||
          { id: it.sysId, name: it.name, line: '', billing: it.billing, rate: it.rate, unit: '' };
        return { key: it.sysId, sys, amount: it.amount, monthlyAvg: it.amount / 12, months: [] };
      })
      .slice()
      .sort((a, b) => b.amount - a.amount);
  const opsDraft = (data.opsDrafts || []).find((dr) => dr.dept === deptCode && dr.fy === fy) || null;
  const opsItems =
    opsPlan && Array.isArray(opsPlan.items) && opsPlan.items.length
      ? opsPlan.items
      : opsDraft && opsDraft.status === '待业务确认' && Array.isArray(opsDraft.items) && opsDraft.items.length
      ? opsDraft.items
      : null;
  const opsSystems = opsItems ? opsRowFromItems(opsItems) : opsPlanBySystem(data, deptCode, fy);
  const opsAmount = opsSystems.reduce((s, r) => s + r.amount, 0);

  const activities = (data.planActivities || []).filter((a) => a.dept === deptCode && a.fy === fy);
  const lastOf = (stage) =>
    activities
      .filter((a) => a.stage === stage)
      .slice()
      .sort((a, b) => (a.at < b.at ? 1 : -1))[0] || null;

  const bpDone = !!bp;
  const demandDone = demandStatus === '已确认';
  const opsDone = !!opsPlan && opsPlan.status === '已确认';
  const comp = budgetComposition(data, deptCode, fy);

  /**
   * 该 BU **当前版本已确认**的项目预算费用（元）；未确认时为 null。
   * 口径说明：这是主表「项目预算」列展示的那个数，也是合计行唯一计入来源。
   * 一旦业务提交了整体变更，最新版本回到「待评估费用」，此值即为 null ——
   * 旧版本的钱仍留在版本记录里可回溯，但**不再计入当前合计**，避免与列内显示自相矛盾。
   *
   * v1.6：提取为局部 const —— 它同时被返回对象的 `demandConfirmedAmount` 与
   * 「列内可见口径」的 `projectCountedAmount` 消费。留在对象字面量里内联写两遍，
   * 就是又一处双真相源（改一处漏一处的经典来源）。
   */
  const demandConfirmedAmount = demandDone
    ? confirmedDemandVersion && confirmedDemandVersion.totalAmount != null
      ? confirmedDemandVersion.totalAmount
      : demandAmount
    : null;

  return {
    key: deptCode,
    deptCode,
    deptName: dept.name,
    short: dept.short,
    digitalOwner: dept.digitalOwner,
    bpOwner: dept.bpOwner,

    /* ---- ① 年度 BP ---- */
    bp,
    bpVersions,
    bpStatus: bp ? '已提交' : '未提交',
    bpDone,
    bpLast: lastOf('BP'),

    /* ---- ② 需求清单及费用预估（整份清单一个版本） ---- */
    demands,
    /**
     * 该部门项目条数 = **正式版本（`demands`）条数**，口径与原实现一致（未动）。
     * 进行中内容另存 `demandDrafts`，是同一批项目的更新版而非新增项，**不计入本计数**
     * （避免"显示 6 条、列表只有 3 条"的双计）；进行中与否由 `demandHasInProgress` 单独表达。
     */
    demandCount: demands.length,
    demandMD,
    demandEstAmount,
    demandEvalAmount,
    demandEvalPending,
    demandAmount,
    projectAmount: demandAmount, // 兼容旧字段名：总项目费用 = 清单当前版本费用合计
    demandVersions,
    demandLatestVersion: latestDemandVersion,
    demandConfirmedVersion: confirmedDemandVersion,
    demandVersionLabel: confirmedDemandVersion ? confirmedDemandVersion.version : null,
    demandStatus,
    demandDone,
    /** 进行中版本（v0.8 新增，供主表/下钻页判断是否显示"进行中"入口） */
    demandDraftStatus,
    demandHasInProgress,
    demandInProgressCount,
    /**
     * 该 BU **当前版本已确认**的项目预算费用（元）；未确认时为 null。
     * 口径说明：这是主表「项目预算」列展示的那个数，也是合计行唯一计入来源。
     * 一旦业务提交了整体变更，最新版本回到「待评估费用」，此值即为 null ——
     * 旧版本的钱仍留在版本记录里可回溯，但**不再计入当前合计**，避免与列内显示自相矛盾。
     */
    demandConfirmedAmount,
    /**
     * v1.6 P0-3 补齐：项目侧与运维侧**对称**的「列内可见口径」。
     *
     * 背景：P0-3 只把运维侧拆成 `opsAmount`（模型年化）/ `opsCountedAmount`（已出具才计），
     *   项目侧漏了 —— 「总预算费用」列用 `projectAmount`（清单当前版本合计，未核定也按
     *   业务预估），而 ②「项目预算」列用 `demandConfirmedAmount`（**仅已确认**，否则显示
     *   「待核定」/「—」）。两者口径不同 ⇒ 同一行的「总预算费用」比用户能看到的
     *   ②③ 之和**多出一截无法解释的钱**（实测 D-ECOM 多 324.9 万、D-MKT 多 142.5 万，
     *   8 行合计多 1,063.9 万）。这与运维侧刚修掉的是**同一个缺陷**。
     *
     * 取值 = ②列当前渲染的那个数（已确认 ? demandConfirmedAmount : 0），
     *   保证「总预算费用」列 ≡ ② + ③ 在**每一行**都成立，且合计行无需解释。
     * 未确认/待核定的部分不是消失，而是由 `demandAmount`（含预估）继续承载 ——
     *   页头「总项目费用（清单当前版本）」卡读它，仍能看到业务申报的全量。
     */
    projectCountedAmount: demandConfirmedAmount != null ? demandConfirmedAmount : 0,
    demandLast: lastOf('DEMAND'),

    /* ---- ③ 系统运维预算 ---- */
    opsPlan,
    opsSystems,
    /** 纳入该 BU 运维计费范围的系统数量（按计费模型年化后金额 > 0 计） */
    opsSystemCount: opsSystems.length,
    /** Digital 是否已出具运维预估（出具后才有「总费用」） */
    opsIssued: !!(opsPlan && opsPlan.issueDate),
    opsAmount,
    /**
     * **纳入合计的运维金额**（v1.6 新增，P0-3）。
     *
     * 原实现里 `opsAmount` 承担了两个互斥角色：列内按 `opsIssued ? fmtWan(opsAmount)
     * : '待出具'` 显示，合计却无条件 `Σ opsAmount`。于是 D-MKT（编制中）与 D-HR
     * （未启动）两行在列内显示「待出具」，用户逐列相加却比合计行少 442.2 万，
     * 且无任何解释 —— 合计与列内不是同一口径。
     *
     * 现在按「**列内是否可见**」这一唯一判据拆成两个字段：
     *   · `opsAmount`         —— 模型年化值，模型侧事实，不受流程状态影响
     *   · `opsCountedAmount`  —— 计入合计的值 = 列内可见时的 opsAmount，否则 0
     * 合计行与 ④ 列一律改用 `opsCountedAmount`，恒等式 `Σ列 = Σ合计` 才成立。
     */
    opsCountedAmount: opsPlan && opsPlan.issueDate ? opsAmount : 0,
    opsStatus: opsPlan ? opsPlan.status : '未启动',
    opsDone,
    opsLast: lastOf('OPS'),

    /** 项目费用预算额度（总包 − 运维预算）与实际清单预估的差额，>0 表示清单超出额度 */
    projectBudget: comp.projectBudget,
    /** 清单预估（= ② 列显示值，与本行 projectAmount 同源） */
    projectDemand: comp.projectDemand,
    opsBudget: comp.opsBudget,
    poolTotal: comp.total,
    /** 超支缺口：清单预估 − 项目预算额度（v1.6 起上界面，不再只停留在领域层） */
    projectOver: comp.projectGap,

    activities,
    lastAt: activities.length ? activities.map((a) => a.at).sort().slice(-1)[0] : null,
    done: [bpDone, demandDone, opsDone].filter(Boolean).length,
    total: 3
  };
}

/** 全部 BU 的年度预算计划行 */
export function annualPlanRows(data, fy) {
  return data.departments.map((d) => annualPlanRow(data, d.code, fy));
}

/* ================================================================== *
 * 十、《项目预算计划》下钻页页面模型（v0.8 新增）
 *
 * 页面作用域 = 一个业务部门 × 一个编制年。页面与主表**同源取数**（都读 demands /
 * demandVersions / demandDrafts），页面内**不得自行累加**，避免"表上一个数、页上又一个数"。
 *
 * 关键口径（v0.8 §6.1 / §6.5）：
 *   · 基础视图列表恒为**正式版本（已确认）内容** —— 直接取 `data.demands`，
 *     进行中内容（`demandDrafts`）**不合并**进列表，仅由入口徽标提示；
 *   · `/new` 视图的数据源 = `draft`，与正式版本相互独立；
 *   · 得号（`demandVersions.status='已确认'`）由「业务复核确认」触发（store.confirmDraft）。
 * ================================================================== */

/** 进行中版本状态 → 页面级状态文案（'待反馈费用' 与既有枚举 '待评估费用' 对齐） */
const DRAFT_STATUS_LABEL = {
  草稿: '编辑中',
  待反馈费用: '待评估费用',
  待复核确认: '待复核确认'
};

/** 留痕动作 → 统一流水动作词（v0.8 §3.5：v0.5 的"提交 / 完成评估"归一为新词） */
const DEMAND_ACTIVITY_LABEL = {
  保存草稿: '保存草稿',
  提交: '提交更新',
  提交更新: '提交更新',
  完成评估: 'Digital反馈费用',
  Digital反馈费用: 'Digital反馈费用',
  业务复核确认: '业务复核确认',
  退回: '退回',
  废弃新版本: '废弃新版本'
};

/** 留痕原始动作 → 该时刻的版本状态（用于统一流水的「状态」列）。
 *  注意：'完成评估' 是 v0.5 动作、语义即"得号"，故其历史状态为 '已确认'；
 *  v0.8 的 'Digital反馈费用' 才是"待复核确认"。两者动作词归一，但状态取值不同。 */
const DEMAND_ACTIVITY_STATUS = {
  保存草稿: '草稿',
  提交: '待评估费用',
  提交更新: '待评估费用',
  完成评估: '已确认',
  Digital反馈费用: '待复核确认',
  业务复核确认: '已确认',
  退回: '待评估费用',
  废弃新版本: '已废弃'
};

/**
 * ROI（v0.8.2 §2）= 预估业务价值 ÷ Digital预算费用。
 *
 * 口径与空值规则（唯一口径，页面与测试都只经此函数）：
 *   · 分子 `bizValueAmount`（元，v0.8.2 新字段，替代 v0.8 的自由文本 bizValue）；
 *   · 分母 `evalAmount`（元，Digital 核定费用）；
 *   · **任一为 null / undefined，或分母为 0 → 返回 null**，页面显示「—」。
 *     绝不能返回 0（会误读为"没有回报"），也绝不能返回 Infinity（会撑破列宽）。
 *
 * @returns {number|null} ROI 比值（无单位倍数，如 6.87）；不可计算时为 null
 */
export function roiOf(demand) {
  if (!demand) return null;
  const v = demand.bizValueAmount;
  const f = demand.evalAmount;
  if (v == null || f == null) return null;
  if (f === 0) return null;
  return v / f;
}

/**
 * 页面模型：《项目预算计划》页（`#/budget/project/{deptCode}`、`.../new`、`.../new/{demandId}`）。
 *
 * `status` 可选值共 **5 个**：`未提交 | 编辑中 | 待评估费用 | 待复核确认 | 已确认`
 *   （'编辑中' 为草稿态映射值，其余取自版本状态）。
 *
 * @returns {{
 *   dept, deptName, digitalOwner, bpOwner, fy,
 *   demands, demandCount, demandAmount, demandEvalPending,
 *   versions, confirmedVersion, confirmedVersionLabel, status,
 *   draft, inProgressStatus, hasInProgress, inProgressCount,
 *   timeline
 * }}
 */
export function demandProjectPage(data, deptCode, fy) {
  const dept = data.departments.find((d) => d.code === deptCode) || {};

  /* —— 正式版本（基础视图列表的数据源）—— */
  const demands = data.demands.filter((d) => d.dept === deptCode && d.fy === fy);
  const demandCount = demands.length;
  /** 项目总费用：Digital 核定（evalAmount）优先，未核定回退业务预估（estAmount） */
  const demandAmount = demandAmountOf(data, deptCode, fy);
  const demandEvalPending = demands.filter((d) => d.evalAmount == null).length;

  /* —— 版本与状态 —— */
  const versions = demandVersionsOf(data, deptCode, fy);
  const confirmedVersion = versions.find((v) => v.status === '已确认') || null;
  const confirmedVersionLabel = confirmedVersion ? confirmedVersion.version : null;
  const latestVersion = versions[0] || null;

  /* —— 进行中版本（/new 视图的数据源）—— */
  const draft = (data.demandDrafts || []).find((dr) => dr.dept === deptCode && dr.fy === fy) || null;
  const inProgressStatus = draft ? draft.status : null;
  const hasInProgress = !!draft;
  const inProgressCount = draft ? draft.items.length : 0;

  /* —— 页面级状态推导：有草稿 → draft.status 映射；否则取最新版本状态；无版本 → 未提交 —— */
  const status = draft
    ? DRAFT_STATUS_LABEL[draft.status] || draft.status
    : !latestVersion
    ? '未提交'
    : latestVersion.status === '已确认'
    ? '已确认'
    : '待评估费用';

  /* —— 统一流水（v0.8 §3.5）：以留痕为事件主轴（actor/role/note 最准、动作词已归一），
   *    再用版本记录**补漏**（只补留痕里没有的 at，避免同一次动作出现两行），按 at 倒序。 —— */
  const events = [];
  const seenAt = new Set();
  (data.planActivities || [])
    .filter((a) => a.stage === 'DEMAND' && a.dept === deptCode && a.fy === fy)
    .forEach((a) => {
      events.push({
        at: a.at,
        version: a.version || '—',
        status: DEMAND_ACTIVITY_STATUS[a.action] || null,
        action: DEMAND_ACTIVITY_LABEL[a.action] || a.action,
        actor: a.actor,
        role: a.role,
        note: a.note || ''
      });
      seenAt.add(a.at);
    });
  versions.forEach((v) => {
    // 补漏 ①：提交事件（留痕里没有同 at 才补）
    if (v.submittedAt && !seenAt.has(v.submittedAt)) {
      events.push({
        at: v.submittedAt,
        version: v.version || '—',
        status: '待评估费用',
        action: '提交更新',
        actor: v.submitter,
        role: '业务部门',
        note: v.changeNote || ''
      });
      seenAt.add(v.submittedAt);
    }
    // 补漏 ②：确认事件
    if (v.confirmedAt && !seenAt.has(v.confirmedAt)) {
      events.push({
        at: v.confirmedAt,
        version: v.version || '—',
        status: '已确认',
        action: '业务复核确认',
        actor: v.submitter,
        role: '业务部门',
        note: v.changeNote || ''
      });
      seenAt.add(v.confirmedAt);
    }
  });
  const timeline = events.sort((a, b) => (a.at < b.at ? 1 : -1));

  return {
    dept: deptCode,
    deptName: dept.name,
    digitalOwner: dept.digitalOwner,
    bpOwner: dept.bpOwner,
    fy,

    demands,
    demandCount,
    demandAmount,
    demandEvalPending,

    versions,
    confirmedVersion,
    confirmedVersionLabel,
    status,

    draft,
    inProgressStatus,
    hasInProgress,
    inProgressCount,

    timeline
  };
}

/* ================================================================== *
 * 十之二、《系统运维预算计划》页面模型（v1.1 新增）
 *
 * 页面作用域 = 一个业务部门 × 一个编制年（PLAN_FY = 2027）。页面与主表同源取数，
 * 页面内不得自行累加（合计与列同源）。
 *
 * **两个明细键的分工（防混用，页面必须各取所需）：**
 *   · `items`（只读页用）    —— 当前**正式版本**明细：已确认取 `opsPlans[].items`，
 *          否则回退 `opsPlanBySystem` 模型派生（此时 `usingDerived: true`）。
 *          **严禁把 draft.items 混进只读页**（进行中内容在业务确认前不展示；
 *          注意主表 `annualPlanRow` 已改为三级回退、待业务确认即显示草稿合计，
 *          但页面只读视图仍只认正式明细 —— 这是"提交生效"与"页面只读"的分工）。
 *   · `draftItems`（仅 /new）—— 进行中草稿明细 = `draft.items`；无草稿时回退 `items`。
 *
 * 明细行结构：{ sysId, name, line, billing, rate, usage, amount }，其中
 *   usage = **有效用量（已含业务量增长系数）**、amount = round(rate × usage)。
 * ================================================================== */

const round1 = (v) => Math.round(v * 10) / 10;
const round2 = (v) => Math.round(v * 100) / 10 / 10;

/**
 * 某系统在某部门编制年的有效用量（字面量口径，与 mock.items 逐行相等，已验证 20/20）：
 *   order / member → Σ(12 月 opVolume，恒为 50 的倍数) × 增长系数，至多 1 位小数；
 *   fixed          → (BU 份额 / 总份额) × 增长系数，至多 2 位小数（「份」）。
 * 只在「首次生成清单」时折进增长系数一次，此后编辑只做覆盖写、不再二次叠加。
 */
function opsUsageOf(data, sys, deptCode, fy) {
  const shares = VOLUME_BASE[sys.id] || {};
  const base = shares[deptCode];
  if (base == null) return 0;
  const dept = data.departments.find((d) => d.code === deptCode);
  const growth = fy === 2026 || !dept || !dept.opsGrowth ? 1 : dept.opsGrowth;
  if (sys.billing === 'fixed') {
    const total = Object.values(shares).reduce((a, b) => a + b, 0) || 1;
    return round2((base / total) * growth);
  }
  return round1(monthsOfYear(fy).reduce((s, m) => s + opVolume(sys.id, deptCode, m), 0) * growth);
}

/** 由模型派生一行明细（amount = round(rate × usage)，与 opsPlanBySystem().amount 相等） */
function opsDerivedItem(data, sys, deptCode, fy) {
  const usage = opsUsageOf(data, sys, deptCode, fy);
  return {
    sysId: sys.id,
    name: sys.name,
    line: sys.line || '',
    billing: sys.billing,
    rate: sys.rate,
    usage,
    amount: Math.round(sys.rate * usage)
  };
}

/** 明细行补 line（系统目录主数据），供「系统名称」列副行渲染；不改写入参 */
function withLine(items, systems) {
  return (items || []).map((it) => ({ ...it, line: it.line != null ? it.line : (systems.find((s) => s.id === it.sysId) || {}).line || '' }));
}

/**
 * 《系统运维预算计划》页视图模型（只读视图与 /new 视图共用一次取数）。
 * 严禁在页面内重复累加 —— 合计/计数一律由本函数给出。
 */
export function opsPlanPage(data, deptCode, fy) {
  const dept = data.departments.find((d) => d.code === deptCode) || {};
  const plan = (data.opsPlans || []).find((o) => o.dept === deptCode && o.fy === fy) || null;
  const draft = opsDraftOf(data, deptCode, fy);
  const versions = opsVersionsOf(data, deptCode, fy);

  /* —— 正式版本明细：已确认快照优先，否则模型派生（usingDerived 标记口径来源） —— */
  const confirmedItems = plan && Array.isArray(plan.items) && plan.items.length ? plan.items : null;
  const usingDerived = !confirmedItems;
  const items = confirmedItems
    ? withLine(confirmedItems, data.systems).slice().sort((a, b) => b.amount - a.amount)
    : opsPlanBySystem(data, deptCode, fy).map((r) => opsDerivedItem(data, r.sys, deptCode, fy));

  /* —— 进行中草稿明细（仅 /new 用）—— */
  const draftItems = draft ? withLine(draft.items, data.systems) : items;

  const totalAmount = items.reduce((s, it) => s + it.amount, 0);
  const itemCount = items.length;
  const billingKinds = Array.from(new Set(items.map((it) => it.billing)));

  return {
    dept: deptCode,
    deptName: dept.name,
    digitalOwner: plan ? plan.digitalOwner : dept.digitalOwner,
    bizOwner: plan ? plan.bizOwner : dept.bpOwner,
    opsGrowth: dept.opsGrowth || 1,
    fy,

    plan,
    items,
    draftItems,
    totalAmount,
    itemCount,
    billingKindCount: billingKinds.length,
    status: plan ? plan.status : '未启动',

    draft,
    hasInProgress: !!draft,
    inProgressStatus: draft ? draft.status : null,

    versions,
    isConfirmed: !!plan && plan.status === '已确认',
    usingDerived,

    /* 统一流水 = 版本记录 ∪ planActivities(stage==='OPS')（版本行携 _snapshot 供明细浮层） */
    timeline: opsTimeline(data, deptCode, fy)
  };
}

/**
 * 首版草稿明细（store.startOpsDraft 用）：把「当前已确认明细 / 模型派生值」一次性
 * 固化为**字面量**（增长系数只折进这一次，此后编辑只做覆盖写、不二次叠加）。
 */
export function opsFirstDraftItems(data, deptCode, fy) {
  const plan = (data.opsPlans || []).find((o) => o.dept === deptCode && o.fy === fy) || null;
  if (plan && Array.isArray(plan.items) && plan.items.length) {
    return plan.items.map((it) => ({ ...it }));
  }
  return opsPlanBySystem(data, deptCode, fy).map((r) => opsDerivedItem(data, r.sys, deptCode, fy));
}

/** 该部门进行中草稿（每部门至多一条） */
export function opsDraftOf(data, deptCode, fy) {
  return (data.opsDrafts || []).find((d) => d.dept === deptCode && d.fy === fy) || null;
}

/**
 * 某 BU 的运维预算版本记录（最新在前）。
 * 排序必须是**合法全序**：相等键必须返回 0，并以版本 id 末段序号做 tie-breaker
 * （复用 bpVersionsOf 的教训：`(a,b)=>(a.k<b.k?1:-1)` 对相等键返回 -1 不是合法比较器，
 *  实测会出现最新版本不置顶）。
 */
export function opsVersionsOf(data, deptCode, fy) {
  const seqOf = (id) => {
    const n = Number(String(id || '').split('-').pop());
    return Number.isNaN(n) ? 0 : n;
  };
  return (data.opsVersions || [])
    .filter((v) => v.dept === deptCode && v.fy === fy)
    .slice()
    .sort((a, b) =>
      a.confirmedAt !== b.confirmedAt ? (a.confirmedAt < b.confirmedAt ? 1 : -1) : seqOf(b.id) - seqOf(a.id)
    );
}

/** 留痕动作 → 统一流水动作词（brief §十一：出具 ≡ 提交预算、退回 ≡ 退回补充） */
const OPS_ACTIVITY_LABEL = {
  保存草稿: '保存草稿',
  提交预算: '提交预算',
  出具: '提交预算',
  业务复核确认: '业务复核确认',
  复核确认: '业务复核确认',
  退回: '退回补充',
  退回补充: '退回补充',
  废弃新版本: '废弃新版本'
};

/** 留痕原始动作 → 该时刻的版本状态（统一流水「状态」列） */
const OPS_ACTIVITY_STATUS = {
  保存草稿: '编制中',
  提交预算: '待业务确认',
  出具: '待业务确认',
  业务复核确认: '已确认',
  复核确认: '已确认',
  退回: '编制中',
  退回补充: '编制中',
  废弃新版本: '已废弃'
};

/**
 * 版本与操作流水：`opsVersions`（版本头 + 明细快照）∪ `planActivities(stage==='OPS')`，
 * 按时间**倒序**（合法全序 + id 末段序号 tie-breaker）。
 * 去重口径（P0-2 修复，需求第 6 点「所有确认更新都需要被记录」）：
 *   **按事件身份去重** —— 仅当「某版本的快照行」与「该版本对应的那条确认留痕」（动作=业务复核确认
 *   且 version 相同）同时存在时保留快照行（同一件事的两面）；**其余同分钟事件一律各自成行**。
 *   不得用时间戳（nowStr 只到分钟）一刀切去重 —— 那会把同分钟内的「保存草稿」「提交预算」
 *   等不同动作连坐吞掉，造成审计链缺口（变异实测：同分钟两动作只出 1 行）。
 */
export function opsTimeline(data, deptCode, fy) {
  const seqOf = (id) => {
    const n = Number(String(id || '').split('-').pop());
    return Number.isNaN(n) ? 0 : n;
  };
  const events = [];
  const versions = opsVersionsOf(data, deptCode, fy);
  /** 已有版本快照的版本号集合：用于与「该版本的确认留痕」配对去重 */
  const confirmedBySnapshot = new Set(versions.map((v) => v.version).filter(Boolean));
  versions.forEach((v) => {
    const at = v.confirmedAt || v.submittedAt;
    if (!at) return;
    events.push({
      at,
      version: v.version,
      status: v.status,
      action: '业务复核确认',
      actor: v.confirmer,
      role: '业务部门',
      note: v.changeNote || '',
      refId: v.id,
      _snapshot: v
    });
  });
  (data.planActivities || [])
    .filter((a) => a.stage === 'OPS' && a.dept === deptCode && a.fy === fy)
    .forEach((a) => {
      const action = OPS_ACTIVITY_LABEL[a.action] || a.action;
      // 仅「确认留痕 ↔ 同版本快照」这一对去重；同分钟的其他动作不连坐
      if (action === '业务复核确认' && a.version && confirmedBySnapshot.has(a.version)) return;
      events.push({
        at: a.at,
        version: a.version || null,
        status: OPS_ACTIVITY_STATUS[a.action] || null,
        action,
        actor: a.actor,
        role: a.role,
        note: a.note || '',
        refId: a.id
      });
    });
  return events.sort((a, b) =>
    a.at !== b.at ? (a.at < b.at ? 1 : -1) : seqOf(b.refId) - seqOf(a.refId)
  );
}

/* ================================================================== *
 * 六之二、账单明细楼层取数（v1.4.2）
 *
 * 《对账单总览》新增两个楼层，二者都必须**随月份选择器联动**：
 *   · 交付计费账单总览 —— 行 = 交付计费行（每行一个计费项目 / 需求）
 *   · 系统运维计费账单总览 —— 行 = 运维系统（每行一个计费项目）
 *
 * 两条硬约束（否则页面会自相矛盾）：
 *   ① **取数一律经本文件**，视图内不自行累加、不硬编码金额；
 *   ② **交付计费行的「digital 费用」= buildBill().lines[].amount**，
 *      即真正进入账单的那个数（评估价 + 已批准变更），**不是** evalAmount。
 *      两者在有 CR 时不相等，用错会让「楼层合计 ≠ 部门账单合计」。
 *
 * 区间口径：month 为 null（累计态）⇒ 累计至最近已出账月；否则只看该月。
 * 与 MonthlyView 的空态定义完全一致（billStateOf !== 'DRAFT'）。
 * ================================================================== */

/** 已出账月份（累计边界）。与 store.derived 口径一致，禁止各处另算。 */
/**
 * 已出账月份清单。**scope 决定门槛，两个口径都合法但回答不同问题**（v1.6 P0-5）。
 *
 * `'CONFIRMED'` —— 仅已核销（CONFIRMED）月份。
 *   用于《预算消耗》页的「已核销」：预算是**已确认核销账单**才占用的，
 *   已发出待确认（SENT）的钱**还没核销**，不应算作预算消耗。
 *
 * `'NOT_DRAFT'` —— 除待出账（DRAFT）外的全部月份，含已发出待确认（SENT）。
 *   用于《对账单》页的「累计应收」：账单是**已出账就成立的事实**，
 *   SENT 的月已发出账单、金额已确定，只是等对方确认。
 *
 * v1.6 之前：消耗页直接用 `isConfirmed`、账单页用 `billStateOf !== 'DRAFT'`，
 * 两处各写门槛且**无任何说明**。实测同一公司「已核销」1964.9 万 vs
 * 「累计应收」2334.3 万，差 369.4 万 —— 而"查账"的唯一用途就是核对，
 * 对不上则整页失去参考价值。现由本函数单点定义，名字自带口径。
 *
 * @param {'CONFIRMED'|'NOT_DRAFT'} [scope]
 */
export function billedMonthsOf(data, scope = 'NOT_DRAFT') {
  if (scope === 'CONFIRMED') {
    return data.months.filter((m) => isConfirmed(data, m));
  }
  return data.months.filter((m) => billStateOf(data, m) !== 'DRAFT');
}

/** 某月是否计入「已核销」口径的预算消耗（消耗页用） */
export function inConfirmedScope(data, month) {
  return isConfirmed(data, month);
}

/** 最近已出账月；无一月出账时返回 null（不退回最后一个月，避免把待出账月算进来） */
export function lastBilledMonthOf(data) {
  const b = billedMonthsOf(data);
  return b.length ? b[b.length - 1] : null;
}

/**
 * 楼层四《交付计费账单总览》。
 *
 * 行的粒度 = **账单里的交付计费行**（= buildBill 产出的 `type:'DELIVERY'` 行）。
 * 同一 BRD 只在「交付上线月」出账一次，故累计态下每个项目只出现一行，
 * 不存在同项目跨月重复计数的问题。
 *
 * 列口径：
 *   · digital 费用  = 该计费行金额（评估价 + 已批准变更）—— 与账单同源
 *   · 业务量化价值  = `brd.realizedValue`（**上线后复盘认定的实际增量价值**）
 *   · ROI           = realizedValue / digital 费用；任一为空或分母 0 ⇒ null（页面显「—」）
 *   · 项目描述      = `brd.value`（立项时的业务价值陈述；非复盘结论）
 *
 * @returns {{ rows: Array, totalAmount: number, retroPending: number }}
 */
export function deliveryBillRows(data, month, deptCode) {
  const months = month ? [month] : billedMonthsOf(data);
  /* deptCode 有值 = 只取该部门（供《部门账单详情页》用）。用 filter 而非
     「遍历全部门再跳��」—— 后者会在 rows 里塞入空部门行。 */
  const depts = deptCode ? data.departments.filter((d) => d.code === deptCode) : data.departments;
  const rows = [];
  months.forEach((m) => {
    depts.forEach((d) => {
      const bill = buildBill(data, m, d.code);
      bill.lines
        .filter((l) => l.type === 'DELIVERY')
        .forEach((l) => {
          const brd = data.brds.find((b) => b.id === l.refId) || null;
          const dept = data.departments.find((x) => x.code === bill.dept) || null;
          /* 复盘口径：只认上线后复盘认定的实际增量价值。**不用 brd.value 折算**。
             任一为 null ⇒ ROI 返 null（页面显「—」），绝不能返 0（会误读为「没有回报」）。 */
          const realized = brd ? brd.realizedValue ?? null : null;
          const roi = realized == null || !l.amount ? null : realized / l.amount;
          rows.push({
            key: `${m}-${l.key}`,
            month: m,
            billId: bill.id,
            billStatus: bill.status,
            brdId: l.refId,
            title: l.refTitle,
            /* BRD.value 是立项时的业务价值陈述（文本），与 realizedValue（金额）是两回事 */
            desc: brd ? brd.value || '' : '',
            deptCode: bill.dept,
            deptName: dept ? dept.name : bill.dept,
            goLiveDate: l.goLiveDate,
            retrofitDone: !!(brd && brd.retrofitDone),
            retroDoc: brd ? brd.retroDoc || null : null,
            realizedValue: realized,
            /* ROI 用「实际增量价值 / digital 费用」；分母用账单行金额（与账单同源） */
            roi,
            amount: l.amount,
            demandType: l.demandType,
            changeType: l.changeType,
            pricingBasis: l.pricingBasis,
            crAmount: l.crAmount
          });
        });
    });
  });
  /* 排序：上线时间倒序（同月内按编号），并以「月份 + 编号」做稳定 tie-breaker
     —— 不用时间精度不足的键排序，避免「首行 = 最新」语义不稳定。 */
  rows.sort((a, b) =>
    a.goLiveDate !== b.goLiveDate
      ? a.goLiveDate < b.goLiveDate
        ? 1
        : -1
      : a.brdId < b.brdId
        ? -1
        : a.brdId > b.brdId
          ? 1
          : 0
  );
  return {
    rows,
    totalAmount: rows.reduce((s, r) => s + r.amount, 0),
    /* 待复盘计数：已上线但复盘未完成 —— 这是「复盘文档为—」的唯一合法原因 */
    retroPending: rows.filter((r) => !r.retrofitDone).length
  };
}

/**
 * 楼层五《系统运维计费账单总览》。
 *
 * 行的粒度 = **系统**（每个系统一行），不按「系统 × 部门」展开。
 * 理由：运维计费是「系统级计费程序 → 按 BU 分摊」，用户要回答的问题是
 * 「这个系统这个区间一共收了多少、摊给了谁」，所以金额要聚合，分摊 BU 单列成清单。
 *
 * 列口径：
 *   · 用量 = 区间内**各月计量值之和**（固定年费类系统无用量 ⇒ null，页面显「固定年费 / 月」）
 *   · 总费用 = 区间内各月 `opsLineAmount` 之和
 *   · 分摊 BU 清单 = 该系统各月金额 > 0 的部门去重后按金额降序
 *
 * @returns {{ rows: Array, totalAmount: number }}
 */
export function opsBillRows(data, month, deptCode) {
  const months = month ? [month] : billedMonthsOf(data);
  const depts = deptCode ? data.departments.filter((d) => d.code === deptCode) : data.departments;
  const rows = data.systems.map((sys) => {
    /* 同一部门跨月的分摊额累加 —— 分子分母同源，页面不自行累加 */
    const byDept = new Map();
    let volume = 0;
    let hasVolume = false;
    let amount = 0;
    months.forEach((m) => {
      depts.forEach((d) => {
        const amt = opsLineAmount(sys, d.code, m);
        if (amt <= 0) return;
        amount += amt;
        byDept.set(d.code, (byDept.get(d.code) || 0) + amt);
        /* 固定年费类无计量值（buildBill 里 volume = null），不能把 null 当 0 求和 */
        if (sys.billing === 'fixed') return;
        const v = opVolume(sys.id, d.code, m);
        if (v != null) {
          volume += v;
          hasVolume = true;
        }
      });
    });
    const shares = Array.from(byDept.entries())
      .map(([code, amt]) => {
        const dept = data.departments.find((x) => x.code === code);
        return { deptCode: code, deptName: dept ? dept.name : code, amount: amt };
      })
      /* 按金额降序；同额时按部门代码升序做 tie-breaker，保证次序稳定 */
      .sort((a, b) => (a.amount !== b.amount ? b.amount - a.amount : a.deptCode < b.deptCode ? -1 : 1));
    return {
      key: sys.id,
      systemId: sys.id,
      systemName: sys.name,
      line: sys.line,
      billingMode: sys.billing,
      rate: sys.rate,
      unit: sys.unit,
      /* 固定年费类不产出用量（null），页面据此显示「固定年费 / 月」而非 0 */
      volume: hasVolume ? volume : null,
      amount,
      shares,
      shareCount: shares.length
    };
  });
  /* 过滤掉区间内完全没产生费用的系统（全部为 0），避免 8 行里出现空行 */
  const visible = rows.filter((r) => r.amount > 0);
  return {
    rows: visible,
    totalAmount: visible.reduce((s, r) => s + r.amount, 0)
  };
}
