/**
 * 《部门账单详情页》（v1.4.3，**非浮层独立页**；v1.4.4 再调整）
 *
 * 路由：#/billing/dept/{deptCode}   deptCode 形如 D-RETAIL
 *
 * 页面结构与《对账单总览》**同源同区间**（同一套组件，保证两页口径一致）：
 *   顶部部门横幅（含账期筛选）→ 费用构成（3 卡）→ 月度费用趋势
 *   → 交付项目计费账单总览 → 系统运维计费账单总览
 *
 * 与总览页的**差异**（均按用户要求）：
 *   ① **没有「部门计费账单总览」板块** —— 已锁定单一部门，再列一张部门汇总是同源重复；
 *   ② **运维费用没有「分摊费用的BU清单」列** —— 同理，「摊给了谁」在单部门页是既定事实；
 *   ③ 顶部必须**一眼看出这是哪个业务部门的账单** —— 用带部门名的主色横幅承载。
 *
 * v1.4.4 两处调整：
 *   - **移除页面末尾的「预算池状态」板块**（原 dept-bill-pool）。本页是**账单**页，
 *     预算是另一个口径域：预算池按 FY 口径、含未出账的已承诺额度，与「已出账应收」
 *     混排会让读者把「可用余额」误读成「账单还欠多少」。预算视角统一由
 *     《预算消耗》页承担，账单页只讲发生额。
 *   - 与总览页一致，**不再显示「楼层 N」序号**。
 *   - v1.4.5 首屏改走**与总览页同一个 `BillingHeadBar`**：此前本页是主色横幅、
 *     总览页是「PageHead + 灰底口径条」两段式，跨页操作时账期控件的位置与
 *     视觉都对不上，等于让用户每跳一层重新找一次控件。
 *
 * 取数纪律：所有金额一律经 calc.js（deliveryBillRows / opsBillRows 传 deptCode），
 * 本文件只负责板块编排与页面级外壳，不做任何累加。
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Card, Tag, Flex, Button, Row, Col, App as AntApp
} from 'antd';
import { ArrowLeftOutlined, ShopOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useT } from '../theme.js';
import { billingMonthlyHash } from '../domain/routes.js';
import { useStore, calc } from '../store.jsx';
import { PageHead, Metric, Blank, FloorHead, BillingHeadBar } from '../components/common.jsx';
import { DeliveryBillFloor, OpsBillFloor } from '../components/BillFloors.jsx';
import { TrendChart } from '../components/TrendChart.jsx';

const {
  fmtWan, billStateOf, billedMonthsOf, lastBilledMonthOf,
  opsLineAmount, brdEvalAmount, brdCRDelta, billMonthOf
} = calc;

/**
 * 部门趋势数据：复用总览页趋势图的取数口径。
 * 趋势图组件的 rows 形状为 `{ month, status, delivery, ops, total }`。
 * 这里按部门逐月重算 —— **不复用 store.derived.monthRows**（那是全公司合计）。
 */
function deptMonthRows(data, deptCode) {
  return data.months.map((m) => {
    let delivery = 0;
    let ops = 0;
    data.systems.forEach((sys) => {
      ops += opsLineAmount(sys, deptCode, m);
    });
    data.brds
      .filter((b) => b.dept === deptCode && billMonthOf(b) === m)
      .forEach((b) => {
        delivery += brdEvalAmount(data, b) + brdCRDelta(data, b);
      });
    return { month: m, status: billStateOf(data, m), delivery, ops, total: delivery + ops };
  });
}

export default function DeptBillPage({ param, tail, onNavigate }) {
  const c = useT();
  const { data, confirmMonths } = useStore();
  const { message: msgApi, modal: Modal } = AntApp.useApp();

  const deptCode = param;
  const dept = data.departments.find((d) => d.code === deptCode) || null;

  /**
   * 月份选择：空 = 累计态（与总览页同一套语义）。
   *
   * v1.6：账期改为**以 URL 为准**（第 4 段 `tail`，如 `#/billing/dept/D-RETAIL/2026-08`），
   * 进页时从 tail 初始化、切账期时 replace 回写。此前账期只存在组件 useState 里，
   * 而 `goView` 只改 hash、组件重新挂载 ⇒ state 回到 null，两页各存一份、无任何同步，
   * 表现为「总览选 8 月 → 查账看到累计 8 个月 → 返回总览也是累计」。
   * 用 `replace` 而非 `push`：改账期不该在历史栈里堆一串记录，返回按钮才有意义。
   */
  const [month, setMonth] = useState(tail || null);
  const isCumulative = month === null;
  const billedMonths = useMemo(() => billedMonthsOf(data), [data]);
  const lastBilledMonth = lastBilledMonthOf(data);
  /** 累计范围内「已发出待确认」的月份 —— v1.6 P1-4：部门视角要能看见"还差你一个确认" */
  const sentMonthsInScope = useMemo(
    () => (month ? [] : billedMonths.filter((m) => billStateOf(data, m) === 'SENT')),
    [billedMonths, data, month]
  );

  /* tail 变化（浏览器前进/后退、直接改 hash）→ 同步回 state */
  useEffect(() => {
    setMonth(tail || null);
  }, [tail]);

  /** 切账期：改 URL（第 4 段），URL 变化再回流到 state —— 单一真源是 URL */
  const pickMonth = (m) => {
    const next = m || null;
    setMonth(next);
    const base = `#/billing/dept/${encodeURIComponent(deptCode || '')}`;
    window.location.replace(next ? `${base}/${next}` : base);
  };

  const rows = useMemo(
    () => (deptCode ? deptMonthRows(data, deptCode) : []),
    [data, deptCode]
  );

  /**
   * 3 张卡的合计 —— **与下方两个明细楼层同源同边界**。
   *
   * v1.6 修复（P0-2）：原实现直接 Σ `rows`（全量 9 个月，含 2026-09 DRAFT），
   * 而两个明细楼层走 `billedMonthsOf(data)`（8 个月的 NOT_DRAFT）。结果同一屏
   * 头部 3 卡与向下滚到的明细合计对不上，实测 8/8 部门全部命中（差异 0.5~119.4 万，
   * D-RETAIL 相对偏差 16.8%），且**默认态必然触发**。
   *
   * 根因是 `deptMonthRows` 的取数口径是**趋势图**（该含 DRAFT，并用空心点标注
   * 待出账），被直接当成"累计合计"复用了。
   *
   * 现在：`rows` 保持全月份（趋势图仍需），但合计只累加已出账月 ——
   * 复用账单行函数本身而**不在本文件做任何金额累加**（遵守文件头 :25 纪律）。
   * 单月态下 `month` 显式传入，自动收敛为该月，与楼层完全一致。
   */
  const agg = useMemo(() => {
    const dl = calc.deliveryBillRows(data, month, deptCode);
    const op = calc.opsBillRows(data, month, deptCode);
    return {
      delivery: dl.totalAmount,
      ops: op.totalAmount,
      total: dl.totalAmount + op.totalAmount,
      deliveryCount: dl.rows.length,
      opsCount: op.rows.length
    };
  }, [data, month, deptCode]);

  const monthOptions = useMemo(
    () => data.months.map((m) => ({ value: m, label: `${m} · ${billStateOf(data, m) === 'CONFIRMED' ? '已核销' : billStateOf(data, m) === 'SENT' ? '已发出' : '待出账'}` })),
    [data]
  );

  if (!dept) {
    return (
      <div data-testid="dept-bill-page">
        <PageHead title="部门账单详情" desc="部门代码无法识别，请从《对账单总览》的「查账」入口进入。" />
        <Card>
          <Blank text={`未找到部门：${deptCode || '（空）'}`} />
          <div style={{ textAlign: 'center' }}>
            <Button type="primary" onClick={() => onNavigate('billing', 'monthly')}>
              返回对账单总览
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div data-testid="dept-bill-page">
      {/* ============ 首屏条：一眼看出「这是谁的账单」+ 账期 ============
          v1.4.5：改走与《对账单总览》**同一个** `BillingHeadBar` —— 此前本页是
          主色横幅、总览页是「PageHead + 灰底口径条」两段式，跨页操作时
          「账期」控件的位置与视觉都对不上，等于让用户每跳一层重新找控件。 */}
      <BillingHeadBar
        testId="dept-bill-banner"
        scopeTestId="dept-bill-month-filter"
        icon={<ShopOutlined />}
        title={`${dept.name} · 部门账单详情`}
        tag={
          <Flex gap={6} align="center">
            <Tag color="blue" style={{ marginInlineEnd: 0 }}>
              {dept.code}
            </Tag>
            {/* v1.6 P1-4：把 SENT（已发出待确认）在部门视角显式化。
                此前这个中间态在详情页完全不可见 —— 3 卡 sub 只写"账单状态：已发出"，
                用户既不知道要确认、也不知道去哪里确认，账单闭环最后一公里断链。
                《计费规则》声称的"出账 → 发出 → 业务确认（可申诉）→ 核销"四态，
                实际只有两态可操作。现在单月态给出状态标签 + 确认入口，
                累计态给出「待确认 N 个月」聚合提示。 */}
            {isCumulative ? (
              sentMonthsInScope.length ? (
                <Tag color="warning" data-testid="dept-bill-sent-note" style={{ marginInlineEnd: 0 }}>
                  含已发出待确认 {sentMonthsInScope.length} 个月
                </Tag>
              ) : null
            ) : billStateOf(data, month) === 'SENT' ? (
              <Tag color="warning" data-testid="dept-bill-sent-tag" style={{ marginInlineEnd: 0 }}>
                已发出待确认
              </Tag>
            ) : null}
          </Flex>
        }
        subtitle={`本页仅呈现 ${dept.name} 的费用发生情况，全部数字取自该部门账单行，与总览页口径一致${
          isCumulative
            ? `。当前为累计口径：截至最近已出账月 ${lastBilledMonth || '—'}，共 ${billedMonths.length} 个月`
            : `。当前为单月口径：${month}`
        }`}
        scopeValue={month}
        scopeOptions={monthOptions}
        onScopeChange={pickMonth}
        actions={
          <Flex gap={8} align="center">
            {/* v1.6 P1-4：详情页补账单推进入口（此前本页 actions 只有"返回"）。
                单月且为 SENT 时可确认核销；累计态不给批量核销 ——
                那会一次性核销多个月且不可逆，与总览页 :217 的同一纪律一致。 */}
            {month && billStateOf(data, month) === 'SENT' ? (
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                data-testid="dept-bill-confirm"
                onClick={() =>
                  Modal.confirm({
                    title: `确认核销 ${month} 账单？`,
                    content: `确认后 ${month} 账单进入「已核销」口径，并计入该部门预算池消耗。`,
                    okText: '确认核销',
                    cancelText: '取消',
                    onOk: () => {
                      confirmMonths([month]);
                      msgApi.success(`${month} 账单已核销`);
                    }
                  })
                }
              >
                确认核销
              </Button>
            ) : null}
            <Button
              icon={<ArrowLeftOutlined />}
              data-testid="dept-bill-back"
              onClick={() => {
                /* 直接改 hash 以同时携带 tail(账期) 与 sub2(定位部门) ——
                   go() 的第五段在总览页无消费方，这里不走 onNavigate。
                   v1.6：拼接收敛到 billingMonthlyHash —— 手拼 `#/billing/monthly${m}${focus}`
                   会让累计态退化成 `#/billing/monthly/D-RETAIL`（部门占 param 位），
                   单月态退化成 `.../2026-08/D-RETAIL`（部门占 tail 位 ⇒ 月份下拉出现
                   一个叫 "D-RETAIL" 的账期，已实测复现）。空 param 段不可省。 */
                window.location.hash = billingMonthlyHash({ month, dept: deptCode });
              }}
            >
              返回总览
            </Button>
          </Flex>
        }
      />

      {/* ============ 费用构成（3 卡） ============ */}
      <Card
        data-testid="dept-bill-floor1"
        styles={{ body: { padding: 16 } }}
        style={{ marginBottom: 12, borderTop: `3px solid ${c.brand}` }}
      >
        <FloorHead>费用构成 · {dept.name}</FloorHead>
        <Row gutter={[12, 12]} align="stretch">
          <Col xs={24} md={8}>
            <Metric
              compact
              label="交付计费"
              value={fmtWan(agg.delivery)}
              sub={`${agg.deliveryCount} 条上线需求`}
              tone="brand"
              tip="该部门交付上线需求的计费金额（评估价 + 已批准变更）"
            />
          </Col>
          <Col xs={24} md={8}>
            <Metric
              compact
              label="运维计费"
              value={fmtWan(agg.ops)}
              sub="按订单量 / 会员规模 / 固定年费"
              tone="plain"
              tip="该部门分摊到的系统运维费用"
            />
          </Col>
          <Col xs={24} md={8}>
            <Metric
              compact
              label={isCumulative ? `合计应收 · 截至 ${lastBilledMonth}` : `${month} 合计应收`}
              value={fmtWan(agg.total)}
              sub={isCumulative ? `累计 ${billedMonths.length} 个月（不含待出账月）` : `账单状态：${billStateOf(data, month) === 'CONFIRMED' ? '已核销' : billStateOf(data, month) === 'SENT' ? '已发出' : '待出账'}`}
              tone="plain"
              accentBar
            />
          </Col>
        </Row>
      </Card>

      {/* ============ 月度费用趋势（复用同一 Trend 组件） ============ */}
      <Card
        data-testid="dept-bill-trend"
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
            </Flex>
          }
        >
          月度费用趋势 · {dept.name}
        </FloorHead>
        <TrendChart
          rows={rows}
          active={month}
          onPick={setMonth}
          onClear={() => setMonth(null)}
          cumulativeHint={`当前为累计口径：截至最近已出账月 ${lastBilledMonth || '—'}`}
        />
      </Card>

      {/* ============ 明细：交付 / 运维（复用总览页同款组件，传入 deptCode） ============ */}
      <DeliveryBillFloor
        month={month}
        isCumulative={isCumulative}
        lastBilledMonth={lastBilledMonth}
        deptCode={deptCode}
        floorTitle={`交付项目计费账单总览 · ${dept.name}`}
      />
      <OpsBillFloor
        month={month}
        isCumulative={isCumulative}
        lastBilledMonth={lastBilledMonth}
        billedMonthCount={billedMonths.length}
        deptCode={deptCode}
        floorTitle={`系统运维计费账单总览 · ${dept.name}`}
      />
    </div>
  );
}
