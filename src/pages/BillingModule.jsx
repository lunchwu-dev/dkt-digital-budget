/**
 * 计费账单模块（v0.2 IA 拆分，**v1.4 起①重定义**）
 *
 * 设计系统：dkt-digital-budget · design-system v0.2（DESIGN.md）
 * 本模块由 v0.1 的三个旧页面（「计费期」+「全链路追溯」+「基础数据」）迁移重组而来：
 *   ① 对账单总览 ← v1.4 由「月度账单」重定义（详见下方 MonthlyView 头注释）
 *   ② 消耗与对账 ← 全链路追溯的分析职能（三重口径 / 对账校验 / 偏差 / 双视角 / 溯源全景）
 *   ③ 计费规则   ← 基础数据的主数据（费率表 + 系统目录与运维计费）
 *
 * v1.4 变更摘要（详见 docs/v1.4-billing-overview-brief.md 与 -design.md）：
 *   - ①「月度账单」→「对账单总览」：定位改为全局观察 Digital 费用发生（交付 + 运维两类）。
 *   - ② 首屏板块 = 3 张指标卡（**删「年度新增/变更」卡**），横向一行。
 *   - ②' 月度趋势图**独立成板块**（v1.4.1：从指标板块移出，置于列表上方），
 *        柱状图**叠加月度合计趋势线**（SVG 覆盖层，折线即柱顶连线）。
 *   - ③ **移除**月份 chip 控件与 FilterBar 全部筛项（含部门筛选，**彻底不做替代**）。
 *      页面**只保留 1 个「账期」下拉**（v1.4.4 起置于页首，对全页生效）；
 *      点趋势柱 ↔ 该下拉**双向联动**。
 *   - ④「账单详情」由 Drawer 改为**独立页** BillDetailPage（#/billing/bill/{billId}）。
 *     原「查账」视图（全年账单流水）的能力已并入该页，查账入口改跳独立页。
 *   - v1.4.3 新增**《交付项目计费账单总览》**与**《系统运维计费账单总览》**两块逐行明细，
 *     顺序置于《部门计费账单总览》之前（用户裁定：明细在汇总之前）；
 *     部门账单每行末尾新增「查账」按钮 → 跳独立页《部门账单详情页》（#/billing/dept/{deptCode}）。
 *   - v1.4.3 **「消耗与对账」（reconcile）彻底下线** —— 其逐月核对职责已由交付 / 运维
 *     两块逐行明细承担；旧 hash 走 App.jsx 的 LEGACY_VIEWS 重定向并提示，不静默失败。
 *   - v1.4.4 板块标题改用 FloorHead（16px 标题 + 顶部色条 + 通栏细线）以强化分隔。
 *   - v1.4.4 **移除全部「楼层 N」序号胶囊**（用户裁定：编号无语义、增删板块即过期）。
 *   - v1.4.4 **账期筛选移到页首**并明示「对全页生效」—— 原先它挂在页面最末端的
 *     部门账单标题行里，却驱动整页口径，属控件位置与作用范围错配。
 *   - v1.4.5 本页首屏与《部门账单详情页》**共用 `BillingHeadBar`**：同底色、同左侧
 *     4px 色条、同图标块、同「账期 + 下拉」位置。原 PageHead 的 80+ 字业务解释
 *     下沉到各板块脚注 —— 首屏条只留「这是哪张账单 + 正在看哪个账期」。
 *
 * 约束：
 *   - 金额一律取自 domain/calc.js，本文件不硬编码任何金额；
 *   - 颜色一律取 useT()，零硬编码色值；
 *   - 字重仅 400 / 500；
 *   - 年度控件全局唯一（Header），本模块只读 store.globalFy，不渲染年度下拉。
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Card, Table, Button, Flex, Typography, Tag, Modal, Row, Col, Drawer, Descriptions,
  Divider, Alert, Tooltip, Segmented, Input, App as AntApp
} from 'antd';
import {
  CheckCircleOutlined, FileTextOutlined, InfoCircleOutlined, LockFilled, MessageOutlined
} from '@ant-design/icons';
import { useT } from '../theme.js';
import { billingMonthlyHash } from '../domain/routes.js';
import { useStore, calc } from '../store.jsx';
import {
  PageHead, Metric, BillStatusTag, DemandTypeTag, Hint, BlockTitle, Blank,
  PoolMeter, POOL_CAPTION, PoolLevelTag, FilterBar, TraceChain, TextTag, FloorHead, BillingHeadBar
} from '../components/common.jsx';
import { DeliveryBillFloor, OpsBillFloor } from '../components/BillFloors.jsx';
import { brdChainNodes, demandChainNodes, drillTargetOf } from '../components/traceNodes.js';

const { Text } = Typography;
const {
  fmtWan, fmtYuan, fmtNum, fmtPct, signedPct, buildBill, billStateOf, opsLineAmount,
  poolState, isConfirmed, billIdOf, mdTotal, brdFinalAmount, brdEvalAmount, brdCRDelta, traceOfDemand,
  billedMonthsOf
} = calc;

const BILLING_MODE_LABEL = { order: '按订单量', member: '按会员规模', fixed: '固定年费' };
const FY_LABEL = { 2026: 'FY2026', 2027: 'FY2027' };

/* v1.4：「月度账单」重定义为「对账单总览」（view key 不变，仅改 label，老深链不失效）。
   v1.4.3：「消耗与对账」（reconcile）已**彻底下线** —— 含对账校验 / 偏差 / 双视角 / 溯源全景
   的一整块业务能力，其承载的「逐月核对」职责已由《交付项目计费账单总览》与
   《系统运维计费账单总览》的逐行明细承担。旧 hash 走 LEGACY_VIEWS 重定向并提示。

   注：《部门账单详情页》独立页（key = dept）由 App.jsx 直接渲染，不进本清单。 */
const VIEWS = [
  { key: 'monthly', label: '对账单总览' },
  { key: 'rules', label: '计费规则' }
];

const ROLE_NAME = {
  ARCH: '解决方案架构师', PM: '产品经理', PMO: '项目经理', BA: '需求分析师',
  UX: '交互 / 视觉设计', FE: '前端工程师', BE: '后端工程师', DE: '数据工程师',
  QA: '测试工程师', OPS: '运维工程师'
};

const deptOptions = (data) => [
  { value: 'all', label: '全部部门' },
  ...data.departments.map((d) => ({ value: d.code, label: d.name }))
];
const systemOptions = (data) => [
  { value: 'all', label: '全部系统' },
  ...data.systems.map((s) => ({ value: s.id, label: `${s.id} ${s.name}` }))
];

/** BILL-202609-FIN → { month:'2026-09', deptCode:'D-FIN' }（与 calc.billIdOf 同构） */
function parseBillId(billId) {
  const m = /^BILL-(\d{4})(\d{2})-(.+)$/.exec(billId || '');
  if (!m) return null;
  return { month: `${m[1]}-${m[2]}`, deptCode: `D-${m[3]}` };
}

const statusText = (s) => (s === 'CONFIRMED' ? '已核销' : s === 'SENT' ? '已发出' : '待出账');

import { TrendChart } from '../components/TrendChart.jsx';

/* ================================================================== *
 * ① 对账单总览（v1.4 由「月度账单」重定义）
 * ------------------------------------------------------------------
 * 定位从「按月生成应收账单」改为「全局观察 Digital 费用发生情况」。
 * 口径要点（docs/v1.4-billing-overview-brief.md §0）：
 *   · **空态 = 累计态 = 默认态**。账期下拉为空 ⇒ 全页显示「截至最近已出账月
 *     的累计账单」。选月份 ⇒ 全页切到该月口径。
 *   · **累计边界用 `billStateOf(data,m) !== 'DRAFT'` 判定，绝不用 CURRENT_MONTH**。
 *     理由：点一次「确认核销」，CURRENT_MONTH 不变而累计范围应自动延到 9 个月；
 *     用 DRAFT 判定则自动同步。当前数据 01-07 CONFIRMED / 08 SENT / 09 DRAFT
 *     ⇒ 累计 = 01…08 共 8 个月。
 *   · **总览页不出现任何「新增 / 变更 / 增减」概念**（含 tooltip）：账单只客观
 *     呈现实际发生，不与年度预算规划比较。此类标记归属详情页。
 *   · 部门列在累计态**不得显示单个 BILL 单号** —— 一个部门累计 8 张账单就有
 *     8 个单号，显示 `BILL-202608-RETAIL` 是错的，改为「8 张账单 · 01–08」。
 * ================================================================== */
function MonthlyView({ fy, param, tail, sub2, msgApi, modal, onNavigate }) {
  const c = useT();
  const { data, derived, confirmMonths, sendMonths, log } = useStore();

  /* ---------------- 累计边界：最近已出账月（DRAFT 判定） ----------------
     v1.6：改走 `billedMonthsOf(data)` 具名口径，与领域层单点定义同源。
     此前此处内联 `months.filter(m => billStateOf(...) !== 'DRAFT')`，
     与消耗页的 CONFIRMED 门槛并存时无任何说明，两页对同一公司差 369.4 万。 */
  const billedMonths = useMemo(() => billedMonthsOf(data), [data]);
  /** 累计范围中「已发出待确认」的月份（SENT）—— 账单已成立但预算尚未核销 */
  const sentMonthsInScope = useMemo(
    () => billedMonths.filter((m) => billStateOf(data, m) === 'SENT'),
    [billedMonths, data]
  );
  const lastBilledMonth = billedMonths.length ? billedMonths[billedMonths.length - 1] : null;
  const lastBilledIdx = data.months.indexOf(lastBilledMonth);

  /**
   * 选中月份 = 趋势图 / 月份下拉的唯一真源（双向联动）。
   *
   * v1.6：账期与《部门账单详情页》一样**以 URL 第 4 段 `tail` 为准**，
   * 进页从 tail 初始化、切账期 replace 回写。App.jsx 已把 tail 传进来
   * （原先传了但本页没读，账期因此只活在 useState 里、跨页必丢）。
   * 深链形如 `#/billing/monthly/2026-08`；累计态不带该段。
   * 用 replace 而非 push：改账期不该在历史栈里堆一串记录。
   */
  const [month, setMonth] = useState(tail || null);
  const isCumulative = month === null;

  const [appeal, setAppeal] = useState(null); // { billId, refId, refTitle }
  const [appealReason, setAppealReason] = useState('计量口径存疑');
  const [appealNote, setAppealNote] = useState('');

  useEffect(() => {
    setMonth(tail || null);
  }, [tail]);

  /** 切账期：改 URL（第 4 段），URL 变化再回流到 state —— 单一真源是 URL。
   *  v1.6：URL 拼接收敛到 `billingMonthlyHash`（见 domain/routes.js）——
   *  手拼 `${base}/${next}` 会把账期写进 param 位，导致 deep-link 段位错位。 */
  const pickMonth = (m) => {
    const next = m || null;
    setMonth(next);
    window.location.replace(billingMonthlyHash({ month: next }));
  };
  const clearMonth = () => pickMonth(null);

  /* ---------------- 深链定位：#/billing/monthly/{month}/{deptCode}
   * v1.6：第 4 段 `tail` 已被账期占用，故定位部门改用第 5 段 `sub2`。
   * 「定位 ≠ 筛选」：只高亮 + 滚动到该行，**不改变行数与合计**。 */
  const [deptFocus, setDeptFocus] = useState(null);
  const tableWrapRef = useRef(null);
  const prevFocusRef = useRef(null);
  useEffect(() => {
    const prev = prevFocusRef.current;
    prevFocusRef.current = sub2;
    if (!sub2) {
      if (prev) setDeptFocus(null);
      return;
    }
    if (data.departments.some((d) => d.code === sub2)) setDeptFocus(sub2);
  }, [sub2, data.departments]);

  /* 定位行滚动到可视区 —— 仅当目标行**不在视口内**时才滚。
   * v1.6 P1-3：原实现无条件 `scrollIntoView({block:'center'})`，
   * 若用户已滚到页面底部的明细楼层，定位会把整个视口拽回列表顶部。 */
  useEffect(() => {
    if (!deptFocus || !tableWrapRef.current) return;
    const el = tableWrapRef.current.querySelector('[data-focus-row="true"]');
    if (!el || !el.scrollIntoView) return;
    const rect = el.getBoundingClientRect();
    const inView = rect.top >= 0 && rect.bottom <= (window.innerHeight || 0);
    if (!inView) el.scrollIntoView({ block: 'center' });
  }, [deptFocus, isCumulative, month]);

  /* ---------------- 列表数据：两态共用一份取数入口 ---------------- */
  const rows = useMemo(() => {
    if (isCumulative) {
      // 累计态：行 = 部门，金额 = 截至最近已出账月逐月累加
      return data.departments.map((d) => {
        let delivery = 0;
        let ops = 0;
        let deliveryCount = 0;
        let billCount = 0;
        for (let i = 0; i <= lastBilledIdx; i += 1) {
          const b = buildBill(data, data.months[i], d.code);
          delivery += b.deliveryTotal;
          ops += b.opsTotal;
          billCount += 1;
          deliveryCount += b.lines.filter((l) => l.type === 'DELIVERY').length;
        }
        return {
          key: d.code,
          dept: d.code,
          deptName: d.name,
          id: null, // 累计态无单一单号（8 张账单 = 8 个单号）
          billCount,
          rangeLabel: lastBilledIdx > 0 ? `${data.months[0].slice(5)}-${lastBilledMonth.slice(5)}` : lastBilledMonth,
          status: null, // 跨月无单一状态
          deliveryTotal: delivery,
          opsTotal: ops,
          total: delivery + ops,
          deliveryCount
        };
      });
    }
    // 单月态：行 = 该月各部门的账单
    return data.departments.map((d) => {
      const b = buildBill(data, month, d.code);
      return { ...b, billCount: 1, rangeLabel: month, deliveryCount: b.lines.filter((l) => l.type === 'DELIVERY').length };
    });
  }, [data, isCumulative, month, lastBilledIdx, lastBilledMonth]);

  /** 合计：与列内可见值同源（Σ 可见行），视图内不另行累加出另一套数 */
  const agg = useMemo(
    () => ({
      delivery: rows.reduce((s, r) => s + (r.deliveryTotal || 0), 0),
      ops: rows.reduce((s, r) => s + (r.opsTotal || 0), 0),
      total: rows.reduce((s, r) => s + (r.total || 0), 0),
      deliveryCount: rows.reduce((s, r) => s + (r.deliveryCount || 0), 0)
    }),
    [rows]
  );

  const status = month ? billStateOf(data, month) : null;

  const monthOptions = useMemo(
    () => data.months.map((m) => ({ value: m, label: `${m} · ${statusText(billStateOf(data, m))}` })),
    [data]
  );

  /** 累计态无单一账单状态 ⇒ 核销/出账动作不可用（否则会一次性批量核销 8 个月且不可逆） */
  const canOperate = !isCumulative;

  const deptColumns = [
    {
      title: '业务部门',
      dataIndex: 'deptName',
      width: 168,
      render: (v, r) => (
        <Flex vertical gap={2}>
          <Text style={{ fontSize: 13, fontWeight: 500 }}>{v}</Text>
          <Text style={{ fontSize: 11, color: c.t3 }}>
            {/* 累计态：无单一单号 → 报「N 张账单 · 区间」；单月态：报单号 */}
            {isCumulative ? `${r.billCount} 张账单 · ${r.rangeLabel}` : r.id}
          </Text>
        </Flex>
      )
    },
    {
      title: '交付计费（万元）',
      dataIndex: 'deliveryTotal',
      width: 170,
      align: 'right',
      render: (v, r) => (
        <Flex vertical gap={2} style={{ alignItems: 'flex-end' }}>
          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, color: v ? c.brand : c.t3 }}>
            {fmtWan(v)}
          </span>
          {r.deliveryCount > 0 && <Text style={{ fontSize: 11, color: c.t3 }}>{r.deliveryCount} 条上线需求</Text>}
        </Flex>
      )
    },
    {
      title: '运维计费（万元）',
      dataIndex: 'opsTotal',
      width: 170,
      align: 'right',
      render: (v) => (
        <span style={{ fontVariantNumeric: 'tabular-nums', color: v ? c.meterCommitted : c.t3 }}>{fmtWan(v)}</span>
      )
    },
    {
      title: '合计应收（万元）',
      dataIndex: 'total',
      width: 172,
      align: 'right',
      render: (v) => <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtWan(v)}</strong>
    },
    {
      /* v1.4.3：行内「查账」入口 → 独立页《部门账单详情页》。
         v1.4.4：整行点击与行内「查账」同落点（原按单张账单下钻的路径已下线），
         两者只是入口冗余，不是不同粒度。 */
      title: '操作',
      key: 'op',
      width: 84,
      align: 'right',
      fixed: 'right',
      render: (_, r) => (
        <Button
          type="link"
          size="small"
          data-testid={`billing-check-${r.dept}`}
          onClick={(e) => {
            e.stopPropagation(); // 不触发整行的「进单张账单」
            onNavigate('billing', 'dept', r.dept, month || undefined);
          }}
        >
          查账
        </Button>
      )
    }
  ];

  /* 两态共用同一份列宽表 ⇒ 切月时列不跳动（design §0.1 ④）
   * 核算式：168 + 170 + 170 + 172 + 84（操作列）= 764
   * 有效可用宽 = 视口 − Sider(224) − Content padding(48) − Card body padding(32) − 竖向滚动条(15)
   * ⇒ 1366 屏 ≈ 1047px，764 低于该值，不横滚。 */
  const LIST_SCROLL_X = 168 + 170 + 170 + 172 + 84; // = 764（v1.4.3 新增「操作」列 84px）

  /* v1.4.3：整行点击与行内「查账」**同落点** ——
     原《业务部门账单详情页》（单张账单视图）已按用户裁定彻底重写为《部门账单详情页》，
     不再保留「按单张账单下钻」这条路径。整行 = 点该部门 = 看该部门全部费用。 */
  const gotoDept = (r) => onNavigate('billing', 'dept', r.dept, month || undefined);

  return (
    <div>
      {/* ============ 首屏条（v1.4.5）：标题 + 账期 + 页面级动作 ============
          v1.4.4 把账期从页面末尾提到页首，但当时仍用「PageHead + 独立灰底口径条」两段式，
          与《部门账单详情页》的主色横幅不同构 —— 跨页操作时找不到同一处控件。
          现两页统一走 `BillingHeadBar`：同底色、同左侧 4px 色条、同图标块、
          同「账期 + 下拉」位置。原 PageHead 的 80+ 字业务解释下沉到各板块脚注。 */}
      <BillingHeadBar
        testId="billing-month-scope"
        scopeTestId="billing-month-filter"
        icon={<FileTextOutlined />}
        title="对账单总览"
        subtitle={`全局 Digital 费用发生情况 —— 交付计费 + 运维计费两类，应收口径，出账即视为发生${
          isCumulative
            ? `。当前为累计口径：截至最近已出账月 ${lastBilledMonth || '—'}，共 ${billedMonths.length} 个月`
            : `。当前为单月口径：${month} · ${statusText(status)}`
        }`}
        scopeValue={month}
        scopeOptions={monthOptions}
        onScopeChange={pickMonth}
        scopeHint="账期对本页全部指标、趋势图与明细同时生效"
        tag={
          /* v1.6 P0-5：把「累计应收」与预算「已核销」的口径差异显式化。
             累计范围含 SENT（已发出待确认）月份，这些账单金额已成立但**尚未核销**，
             因此本页「累计应收」会比《预算消耗》页的「已核销」大（实测差 369.4 万）。
             不说清这一点，用户点进查账对不上数会以为数据错。 */
          isCumulative && sentMonthsInScope.length ? (
            <Tag
              data-testid="billing-sent-scope-note"
              color="warning"
              style={{ marginInlineEnd: 0, fontSize: 11 }}
            >
              含已发出待确认 {sentMonthsInScope.length} 个月
            </Tag>
          ) : null
        }
        actions={
          canOperate ? (
            <>
              <BillStatusTag status={status} />
              {status !== 'CONFIRMED' && (
                <Button
                  icon={<FileTextOutlined />}
                  onClick={() => {
                    sendMonths([month]);
                    log('郑亦凡', '发出账单', month);
                    msgApi.success(`${month} 账单已发出，等待业务部门确认`);
                  }}
                >
                  发出账单
                </Button>
              )}
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                disabled={status === 'CONFIRMED'}
                onClick={() =>
                  modal.confirm({
                    title: `确认核销 ${month} 全部部门账单？`,
                    content: `合计 ${fmtWan(agg.total)} 万元。确认后该月账单进入「已核销」口径，并计入各部门预算池消耗。`,
                    okText: '确认核销',
                    cancelText: '取消',
                    onOk: () => {
                      confirmMonths([month]);
                      log('郑亦凡', '确认核销账单', month);
                      msgApi.success(`${month} 账单已核销`);
                    }
                  })
                }
              >
                确认核销
              </Button>
            </>
          ) : null
        }
      />

      {/* ================= 费用构成指标（3 张卡） =================
          v1.4.1：趋势图已移出本板块，独立为下方《月度趋势》板块。 */}
      <Card
        data-testid="billing-overview-floor1"
        styles={{ body: { padding: 16 } }}
        style={{ marginBottom: 12, borderTop: `3px solid ${c.brand}` }}
      >
        <FloorHead
          note={
            isCumulative
              ? `累计至最近已出账月 ${lastBilledMonth || '—'}（${billedMonths.length} 个月，含交付与运维两类）`
              : `${month} 费用构成（交付 + 运维）`
          }
        >
          费用构成
        </FloorHead>
        <Row gutter={[12, 12]} align="stretch">
          {/* 3 张卡：删掉「年度新增/变更」卡（总览页不做预算规划比较） */}
          <Col xs={24} md={8}>
            <Metric
              compact
              label="交付计费"
              value={fmtWan(agg.delivery)}
              sub={`${agg.deliveryCount} 条上线需求`}
              tone="brand"
              tip="按当月交付上线的需求逐条计价 = 评估价 + 已批准变更"
            />
          </Col>
          <Col xs={24} md={8}>
            <Metric
              compact
              label="运维计费"
              value={fmtWan(agg.ops)}
              sub="按订单量 / 会员规模 / 固定年费"
              tone="plain"
              tip="按系统逐条计费；费率预算期锁定、全年不调价"
            />
          </Col>
          <Col xs={24} md={8}>
            <Metric
              compact
              label={isCumulative ? `合计应收 · 截至 ${lastBilledMonth}` : `${month} 合计应收`}
              value={fmtWan(agg.total)}
              sub={isCumulative
                ? `累计 ${billedMonths.length} 个月（不含待出账月，含已发出待确认）`
                : `账单状态：${statusText(status)}`}
              tone="plain"
              accentBar
            />
          </Col>
        </Row>
      </Card>

      {/* ============ 月度费用趋势（独立板块） ============
          v1.4.1：趋势图从指标板块移到这里，**不与指标卡并列** ——
          它服务的是「列表看的是哪一段时间」，故必须紧贴列表、放在其上方。 */}
      <Card
        data-testid="billing-overview-trend"
        styles={{ body: { padding: 16 } }}
        style={{ marginBottom: 12, borderTop: `3px solid ${c.brand}` }}
      >
        <FloorHead
          extra={
            <Flex align="center" gap={14} style={{ fontSize: 12, color: c.t3, fontWeight: 400 }}>
              <Flex align="center" gap={5}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: c.brand, display: 'inline-block' }} />
                交付计费（下段）
              </Flex>
              <Flex align="center" gap={5}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: c.meterCommitted, display: 'inline-block' }} />
                运维计费（上段）
              </Flex>
              <Flex align="center" gap={5}>
                <svg width="14" height="8" aria-hidden style={{ display: 'inline-block' }}>
                  <line x1="0" y1="7" x2="14" y2="1" stroke={c.t1} strokeWidth="1.5" opacity="0.55" />
                </svg>
                月度合计趋势
              </Flex>
            </Flex>
          }
        >
          月度费用趋势
        </FloorHead>
        <TrendChart
          rows={derived.monthRows}
          active={month}
          onPick={pickMonth}
          onClear={clearMonth}
          cumulativeHint={`当前为累计口径：截至最近已出账月 ${lastBilledMonth || '—'}，不含待出账月`}
        />
      </Card>

      {/* ===== 账单明细：交付 / 运维（v1.4.3 调整顺序：置于部门账单之前）=====
          用户裁定顺序为「明细 → 部门汇总」，故交付/运维两个明细板块升到部门账单之前。
          两板块与趋势图、部门账单同区间，随页首账期联动。 */}
      <DeliveryBillFloor
        month={month}
        isCumulative={isCumulative}
        lastBilledMonth={lastBilledMonth}
        floorTitle="交付项目计费账单总览"
      />
      <OpsBillFloor
        month={month}
        isCumulative={isCumulative}
        lastBilledMonth={lastBilledMonth}
        billedMonthCount={billedMonths.length}
        floorTitle="系统运维计费账单总览"
      />
      {/* ============ 部门计费账单总览 ============
          v1.4.3：新增行内「查账」入口 → 跳独立页《部门账单详情页》。
          v1.4.4：账期下拉移至页首（全页生效），本板块标题行不再挂控件。 */}
      <Card
        data-testid="billing-monthly-table"
        styles={{ body: { padding: 16 } }}
        style={{ marginBottom: 12, borderTop: `3px solid ${c.brand}` }}
      >
        <FloorHead
          note={
            isCumulative
              ? `累计至最近已出账月 ${lastBilledMonth || '—'}（${billedMonths.length} 个月），各部门费用构成`
              : `${month} 各部门应收账单`
          }
        >
          部门计费账单总览
        </FloorHead>

        <div ref={tableWrapRef}>
          <Table
            size="small"
            rowKey="dept"
            columns={deptColumns}
            dataSource={rows}
            pagination={false}
            scroll={{ x: LIST_SCROLL_X }}
            data-testid="billing-overview-list"
            onRow={(r) => ({
              onClick: () => gotoDept(r),
              'data-testid': `billing-row-${r.dept}`,
              'data-focus-row': deptFocus === r.dept ? 'true' : undefined,
              style: {
                cursor: 'pointer',
                /* 查账返回的定位高亮：只高亮本行，不改行数与合计 */
                background: deptFocus === r.dept ? c.brandBg : undefined
              }
            })}
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0}>
                  <Text strong>合计</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  <Text strong style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtWan(agg.delivery)}</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right">
                  <Text strong style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtWan(agg.ops)}</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="right">
                  <Text strong style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtWan(agg.total)}</Text>
                </Table.Summary.Cell>
                {/* v1.4.3：叶子列数由 4 变 5（新增「操作」列），合计行必须补第 5 格，
                    否则 antd 按叶子列数对齐会错位。 */}
                <Table.Summary.Cell index={4} />
              </Table.Summary.Row>
            )}
          />
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: c.t3 }}>
          点击任意行或「查账」进入《部门账单详情页》，查看该部门全部费用构成与逐项明细。
          {isCumulative ? ' 累计口径下进入的是该部门最近已出账月的账单。' : ''}
        </div>
      </Card>
    </div>
  );
}

/* ================================================================== *
 * ③ 计费规则（承接原「基础数据」主数据）
 * ================================================================== */
function RulesView({ fy }) {
  const c = useT();
  const { data } = useStore();
  const [f, setF] = useState({ system: 'all', mode: 'all', kw: '' });

  const rateCard = data.rateCards[fy] || data.rateCards[2026];
  const roles = Object.keys(rateCard).filter((k) => k !== '__fy');

  const systemRows = useMemo(
    () =>
      data.systems.filter((s) => {
        if (f.system !== 'all' && s.id !== f.system) return false;
        if (f.mode !== 'all' && s.billing !== f.mode) return false;
        if (f.kw && !`${s.id}${s.name}${s.line}${s.desc}`.toLowerCase().includes(f.kw.toLowerCase())) return false;
        return true;
      }),
    [data.systems, f]
  );

  const fields = [
    { key: 'system', label: '系统', type: 'select', options: systemOptions(data), width: 180 },
    {
      key: 'mode',
      label: '计费模式',
      type: 'select',
      width: 150,
      options: [
        { value: 'all', label: '全部模式' },
        { value: 'order', label: '按订单量' },
        { value: 'member', label: '按会员规模' },
        { value: 'fixed', label: '固定年费' }
      ]
    },
    { key: 'kw', label: '关键词', type: 'keyword', placeholder: '搜索系统编号 / 名称 / 产品线' }
  ];

  return (
    <div>
      <PageHead
        title="计费规则"
        desc="平台运行所依赖的主数据：费率表（Rate Card）、系统目录与运维计费方式。这些数据的变更会直接改变所有评估价与账单金额，因此需要独立管控与审计。"
        extra={<Text style={{ fontSize: 12, color: c.t3 }}>年度语境 {FY_LABEL[fy]} · 跟随顶部全局年度</Text>}
      />

      {/* 费率表 */}
      <Card data-testid="billing-rules-rate" styles={{ body: { padding: 16 } }}>
        <BlockTitle extra={<Text style={{ fontSize: 12, color: c.t3 }}>{FY_LABEL[fy]} 现行价 · 10 类角色</Text>}>
          角色人天费率（元 / 人天）
        </BlockTitle>
        <Alert
          type="info"
          showIcon
          icon={<LockFilled />}
          style={{ marginBottom: 12 }}
          message="费率在预算期一次性锁定、全年不调价"
          description={
            <span style={{ fontSize: 12 }}>
              月度动态调价虽然成本上更精确，但会让接收方的预算彻底失管（典型反例：某部门减员后，人均 license 成本上升，
              其他部门因单价上涨而莫名超支）。年度末的差异统一在调节窗口处理。
            </span>
          }
        />
        <Table
          size="small"
          rowKey="code"
          pagination={false}
          dataSource={roles.map((r) => ({ code: r, name: ROLE_NAME[r] || r, rate: rateCard[r], base: data.rateCards[2026][r] }))}
          columns={[
            { title: '角色代码', dataIndex: 'code', width: 110, render: (v) => <Text style={{ fontSize: 12, color: c.brand }}>{v}</Text> },
            { title: '角色名称', dataIndex: 'name' },
            { title: '费率（元/人天）', dataIndex: 'rate', width: 170, align: 'right', render: (v) => <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtYuan(v)}</strong> },
            {
              title: '相对 FY2026',
              key: 'delta',
              width: 140,
              align: 'right',
              render: (_, r) => (r.rate === r.base ? <Text style={{ fontSize: 12, color: c.t3 }}>基准年</Text> : <Text style={{ color: c.warning }}>{signedPct(r.rate / r.base - 1, 1)}</Text>)
            }
          ]}
        />
        <Flex justify="space-between" wrap gap={8} style={{ marginTop: 12 }}>
          <Text style={{ fontSize: 12, color: c.t3 }}>需求清单预估阶段使用混岗均价 <strong>{fmtYuan(2850)}/人天</strong>；BRD 签收后切换为上述明细费率。</Text>
          <Text style={{ fontSize: 12, color: c.t3 }}>费率变更需经 Digital 负责人 + 财务双签</Text>
        </Flex>
      </Card>

      {/* 系统目录与运维计费 */}
      <Card data-testid="billing-rules-systems" style={{ marginTop: 12 }} styles={{ body: { padding: 16 } }}>
        <BlockTitle extra={<Text style={{ fontSize: 12, color: c.t3 }}>运维费用按订单量或会员规模计费，亦可为固定年费</Text>}>
          系统目录与运维计费
        </BlockTitle>
        <Alert
          type="info"
          showIcon
          icon={<InfoCircleOutlined />}
          style={{ marginBottom: 12 }}
          message="计费驱动程序（Driver）必须可测量、可审计"
          description={
            <span style={{ fontSize: 12 }}>
              订单量与会员规模由系统运维平台按月采集，计量值直接进入账单行；账单争议时可用「关联到源系统查询明细」的方式逐笔核对，这是消除争议的关键。
            </span>
          }
        />
        <FilterBar
          fields={fields}
          value={f}
          onChange={setF}
          resultCount={systemRows.length}
          onReset={() => setF({ system: 'all', mode: 'all', kw: '' })}
          fyLabel={FY_LABEL[fy]}
        />
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={systemRows}
          columns={[
            { title: '系统编号', dataIndex: 'id', width: 96, render: (v) => <Text style={{ fontSize: 12, color: c.brand }}>{v}</Text> },
            { title: '系统名称', dataIndex: 'name', width: 170 },
            { title: '所属产品线', dataIndex: 'line', width: 150, render: (v) => <Tag style={{ marginInlineEnd: 0 }}>{v}</Tag> },
            { title: '说明', dataIndex: 'desc', ellipsis: true, render: (v) => <Text style={{ fontSize: 12, color: c.t2 }}>{v}</Text> },
            { title: '计费方式', dataIndex: 'billing', width: 120, render: (v) => <TextTag tone={v === 'fixed' ? 'default' : 'info'}>{BILLING_MODE_LABEL[v]}</TextTag> },
            {
              title: '单价',
              key: 'rate',
              width: 170,
              align: 'right',
              render: (_, r) => (
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {r.billing === 'fixed' ? `${fmtYuan(r.rate)} / 年` : `¥${r.rate} / ${r.unit.replace('元/', '')}`}
                </span>
              )
            },
            {
              title: '年化金额（万元）',
              key: 'annual',
              width: 150,
              align: 'right',
              render: (_, r) => {
                if (r.billing === 'fixed') return <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtWan(r.rate)}</strong>;
                const probe = ['2026-06', '2026-07', '2026-08'];
                const avg = probe.reduce((s, m) => s + data.departments.reduce((ss, d) => ss + opsLineAmount(r, d.code, m), 0), 0) / probe.length;
                return <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtWan(avg * 12)}</strong>;
              }
            }
          ]}
        />
      </Card>

      {/* 口径与规则说明 */}
      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col xs={24} lg={12}>
          <Card style={{ height: '100%' }} styles={{ body: { padding: 16 } }}>
            <BlockTitle>三重口径定义</BlockTitle>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="已规划 Planned">年度需求清单的预估金额（混岗均价估算）。影子占用，仅用于编排与预警，不锁定额度。</Descriptions.Item>
              <Descriptions.Item label="已承诺 Committed">BRD 签收后锁定的评估价（含已批准变更）。已占用额度，但尚未出账。</Descriptions.Item>
              <Descriptions.Item label="已核销 Billed">已确认账单的实际金额，含交付计费与运维计费。真实消耗。</Descriptions.Item>
              <Descriptions.Item label="可用余额">预算总包 − 已承诺 − 已核销（已规划不计入）</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card style={{ height: '100%' }} styles={{ body: { padding: 16 } }}>
            <BlockTitle>计费与核销规则</BlockTitle>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="账单 A · 交付计费">按交付上线的需求逐条计价；结算基准为评估价 + 已批准变更；账单行强制标注需求类型（年初计划内 / 年度新增）与变更情况。</Descriptions.Item>
              <Descriptions.Item label="账单 B · 运维计费">按订单量或会员规模收取已有系统的运维费用，或采用固定年费。费率预算期锁定。</Descriptions.Item>
              <Descriptions.Item label="出账时点">以实际上线月份的次月起出账</Descriptions.Item>
              <Descriptions.Item label="核销流程">出账 → 发出 → 业务确认（可申诉）→ 核销</Descriptions.Item>
              <Descriptions.Item label="变更（CR）">独立计价，不并入原评估价，单独标注审批人</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

/* ================================================================== *
 * 模块壳
 * ================================================================== */
export default function BillingModule({ view = 'monthly', param, tail, sub2, onNavigate }) {
  const { globalFy } = useStore();
  const { message: msgApi, modal } = AntApp.useApp();
  const fy = globalFy;
  const go = (v, p) => onNavigate && onNavigate('billing', v, p);

  return (
    <div>
      {view === 'monthly' && <MonthlyView fy={fy} param={param} tail={tail} sub2={sub2} msgApi={msgApi} modal={modal} onNavigate={onNavigate} />}
      {view === 'rules' && <RulesView fy={fy} />}
    </div>
  );
}
