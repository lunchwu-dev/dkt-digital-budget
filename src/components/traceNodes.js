/**
 * TraceChain 节点构造器
 *
 * 设计约束（团队裁决）：
 *   节点状态的唯一来源是 calc.traceOfBrd() / calc.traceOfDemand() 的返回字段，
 *   本文件只做「按给定映射表把字段翻译成 state」，不新增任何业务判断。
 */
import { traceOfBrd, traceOfDemand, mdTotal, fmtWan, fmtNum } from '../domain/calc.js';

/** 账单状态中文（与 BillStatusTag 口径一致） */
export const BILL_STATUS_TEXT = {
  CONFIRMED: '已确认核销',
  SENT: '已发出待确认',
  DRAFT: '待出账'
};

/** 聚合档位：0/total → pending；c>=total → done；0<c<total → active */
function aggState(c, total) {
  if (!total || c <= 0) return 'pending';
  return c >= total ? 'done' : 'active';
}

/** BP 节点（①）：三处复用同一规则。v0.5 起 BP 只有「已提交 / 未提交」两态 */
function bpNode(bp) {
  return {
    key: 'bp',
    index: 1,
    label: 'BP提交',
    value: bp ? bp.version : '—',
    meta: bp ? '已提交' : '未提交',
    state: bp ? 'done' : 'pending',
    drillable: true
  };
}

/**
 * BRD 六节点链路（delivery/brd、delivery/eval 详情抽屉共用）。
 * 严格按映射表：
 *   ① bp：!bp→pending；bp 存在→done（BP 只有已提交/未提交两态）
 *   ② demand：存在→done；null→pending（灰态，不隐藏）
 *   ③ brd：REJECTED→error；SUBMITTED/EVALUATING→active；SIGNED/DELIVERED→done
 *   ④ eval：signedDate→done；evalLines.length>0→active；否则 pending
 *   ⑤ deliver：delivery→done；status==='SIGNED'→active；否则 pending
 *   ⑥ bill：无 billMonth→pending；CONFIRMED→done；SENT/DRAFT→active
 */
export function brdChainNodes(data, brd) {
  if (!brd) return [];
  const t = traceOfBrd(data, brd);
  const b = t.brd;
  const demand = t.demand;

  const evalDone = !!b.signedDate;
  const evalActive = !evalDone && b.evalLines && b.evalLines.length > 0;

  const deliverDone = !!b.delivery;
  const deliverActive = !deliverDone && b.status === 'SIGNED';

  return [
    bpNode(t.bp),
    {
      key: 'demand',
      index: 2,
      label: '年度需求',
      value: demand ? demand.id : '无',
      meta: demand ? demand.title.slice(0, 10) : '年度新增（无年初需求）',
      state: demand ? 'done' : 'pending',
      drillable: true
    },
    {
      key: 'brd',
      index: 3,
      label: 'BRD提报',
      value: b.id,
      meta: b.submitDate,
      state: b.status === 'REJECTED' ? 'error' : b.status === 'SUBMITTED' || b.status === 'EVALUATING' ? 'active' : 'done',
      drillable: true
    },
    {
      key: 'eval',
      index: 4,
      label: '评估签收',
      value: b.signedDate || '—',
      meta: b.evalLines && b.evalLines.length ? `评估价 ${fmtWan(t.evalAmount)} 万` : '未评估',
      state: evalDone ? 'done' : evalActive ? 'active' : 'pending',
      drillable: true
    },
    {
      key: 'deliver',
      index: 5,
      label: '交付上线',
      value: b.delivery ? b.delivery.goLiveDate : '—',
      meta: b.delivery ? `实际 ${fmtNum(mdTotal(b.delivery.actualLines))} 人天` : '未上线',
      state: deliverDone ? 'done' : deliverActive ? 'active' : 'pending',
      drillable: true
    },
    {
      key: 'bill',
      index: 6,
      label: '月度账单',
      value: t.billMonth || '—',
      meta: t.billMonth ? BILL_STATUS_TEXT[t.billStatus] || '—' : '未出账',
      state: !t.billMonth ? 'pending' : t.billStatus === 'CONFIRMED' ? 'done' : 'active',
      drillable: true
    }
  ];
}

/**
 * 年度需求六节点链路（budget/demand 详情抽屉）。
 * ② = 需求本身（done）；③~⑥ 由该需求派生的全部 BRD 聚合（全部完成→done；部分→active；无→pending）。
 * 聚合输入全部来自 traceOfDemand() 的 chains（即 traceOfBrd 输出）。
 */
export function demandChainNodes(data, demandId) {
  const t = traceOfDemand(data, demandId);
  if (!t) return [];
  const chains = t.chains || [];
  const n = chains.length;

  const signedCount = chains.filter((x) => !!x.brd.signedDate).length;
  const deliveredCount = chains.filter((x) => !!x.brd.delivery).length;
  const billedChains = chains.filter((x) => !!x.billMonth);
  const confirmedCount = billedChains.filter((x) => x.billStatus === 'CONFIRMED').length;
  const firstSubmit = n ? chains.map((x) => x.brd.submitDate).sort()[0] : null;

  return [
    bpNode(t.bp),
    {
      key: 'demand',
      index: 2,
      label: '年度需求',
      value: t.demand.id,
      meta: `${t.demand.status} · 预估 ${fmtWan(t.estAmount)} 万`,
      state: 'done',
      drillable: true
    },
    {
      key: 'brd',
      index: 3,
      label: 'BRD提报',
      value: n ? `${n} 条` : '—',
      meta: n ? `最早 ${firstSubmit}` : '尚未提报',
      state: n ? 'done' : 'pending',
      drillable: true
    },
    {
      key: 'eval',
      index: 4,
      label: '评估签收',
      value: `${signedCount} / ${n || 0}`,
      meta: signedCount ? '已签收锁定评估价' : '待签收',
      state: aggState(signedCount, n),
      drillable: true
    },
    {
      key: 'deliver',
      index: 5,
      label: '交付上线',
      value: `${deliveredCount} / ${n || 0}`,
      meta: deliveredCount ? '已登记上线' : '未上线',
      state: aggState(deliveredCount, n),
      drillable: true
    },
    {
      key: 'bill',
      index: 6,
      label: '月度账单',
      value: `${confirmedCount} / ${n || 0}`,
      meta: billedChains.length ? '已出账' : '未出账',
      state: aggState(confirmedCount, n),
      drillable: true
    }
  ];
}

/** 节点点击 → 路由目标（返回 [module, view, param]） */
export function drillTargetOf(nodeKey, ctx = {}) {
  switch (nodeKey) {
    case 'bp':
      return ['budget', 'annual', null];
    case 'demand':
      // v0.3：年度需求清单并入《年度预算计划》，DM- 单号直接打开需求详情
      return ctx.demandId ? ['budget', 'annual', ctx.demandId] : ['budget', 'annual', null];
    case 'brd':
      return ctx.brdId ? ['delivery', 'brd', ctx.brdId] : ['delivery', 'brd', null];
    case 'eval':
      return ctx.brdId ? ['delivery', 'eval', ctx.brdId] : ['delivery', 'eval', null];
    case 'deliver':
      return ctx.brdId ? ['delivery', 'deliver', ctx.brdId] : ['delivery', 'deliver', null];
    case 'bill':
      return ctx.billId ? ['billing', 'monthly', ctx.billId] : ['billing', 'monthly', null];
    default:
      return null;
  }
}
