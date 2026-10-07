/**
 * 预算管理模块（v0.3 重构）
 *
 * 本轮 IA 调整（依据业务口径修订，不是样式微调）：
 *   ① 业务部门年度 Digital 预算 = ①业务规划 BP 文档
 *                              + ②需求清单及其费用预估（业务产出、Digital 复核确认）
 *                              + ③系统运维预估费用（Digital 产出、业务复核确认）
 *   ② 「业务规划 BP」+「年度需求清单」两个视图融合为《年度预算计划》：
 *      页面主体是一张纵向主表，按 BU 罗列四个编制项的「提交及更新情况」，逐项可点击下钻；
 *      所有提交 / 更新 / 复核确认动作都写入操作记录（store.planAction）。
 *   ③ 「预算池总览」更名为《预算消耗》：展示预算费用总包、项目费用预算、系统运维费用预算、
 *      截至当月的消耗进度；行操作由「深钻」改为「查账」，明细一律由账单模块承载。
 *   ④ 移除「Digital 整合规划」「部门预算池」两个视图；额度调节能力收口到预算消耗视图。
 *
 * 约束（沿用 v0.2 设计系统）：
 *   - 金额一律取自 domain/calc.js，本文件不硬编码任何金额；
 *   - 颜色一律取 useT()，零硬编码色值；字重仅 400 / 500；
 *   - 年度控件全局唯一（Header），本模块只读 store.globalFy。
 *
 * v0.7 变更（仅「预算消耗」视图）：
 *   ① 楼层一由「四个并列指标卡」改为《整体预算消耗情况》三张卡 —— 整体 / 项目 / 运维预算总包
 *      各自带消耗进度；原来独立成卡的「截至当月消耗进度」并回第①张卡（它本就是整体消耗进度）。
 *   ② 楼层二定名《部门预算消耗情况》，表格改为三组「预算及消耗」列（整体 / 项目 / 运维）。
 *   ③ 行内「调节额度」更名「调整预算计划」，点击进入「调整项目预算」业务分支（含影响预览与
 *      「不得低于已消耗」硬校验），不再是一步到位的数值编辑。
 *      —— **该入口已于 v1.3 下线**（见下方 v1.3 变更说明），本条仅存历史沿革。
 *
 * v0.7.1 变更（仅《部门预算消耗情况》表格，去噪不加功能）：
 *   ① 消耗格去掉进度条：一行三组共 6 根细条并排，密度已超过它承载的信息量；
 *      健康度改由**消耗率数字自身着色**承载（按该维度各自的档位取色）。
 *   ② 移除「状态」列 —— 它只是整行档位，与「整体预算及消耗」的消耗率颜色同源重复。
 *      透支 / 预警的部门级计数迁移到楼层二标题行右上角。
 *   ③ 列宽随之从 116/(108+156)×3/120/158 = 1186 收到 116/(108+120)×3/158 = 958。
 *
 * v0.7.2 变更（《部门预算消耗情况》再收一步：两列并一列）：
 *   ① 三个维度各占**一列**，不再拆「预算（万元）/ 消耗（万元）」两子列 ——
 *      格内上行 = 总预算金额（+ 万元小字），下行 = 已消耗百分比（着档位色）。
 *      分组表头随之取消，表头回到单行 5 格。
 *   ② 消耗金额不再单独展示（= 总预算 × 消耗率，可由两个可见数算出）；
 *      消耗金额 / 已核销 / 已承诺 / 可用余额 / 占比一律进单元格 title 原生提示。
 *   ③ 列宽 116/132×3/158 = 670（比 v0.7.1 再省 288px）。
 *
 * v1.2 变更（仅《年度预算计划》主表：两列减法 + 一列加法）：
 *   ① 移除「编制完整度」列 —— `done/3` 是 ①②③ 三格状态圆点的派生量（同源重复），
 *      用户已能逐格看出齐备与否，整列进度条 + n/3 只是把同一信息说第二遍；
 *      随之移除筛选栏的「编制完整度」下拉 —— 它筛选的是页面上已看不到的属性。
 *   ② 移除「操作」列 —— 「查看 / 更新」的全部去向已由业务部门格与 ①②③ 格点击下钻覆盖，
 *      操作列是第三份冗余入口；下钻抽屉内的运维动作（出具 / 复核确认 / 退回）不受影响。
 *   ③ 新增「总预算费用」列 = 项目预算 + 系统运维预算。口径（用户确认）：
 *      项目预算取「清单当前版本合计」（Digital 已核定优先，未核定按业务预估），
 *      与页头「总项目费用（清单当前版本）」指标卡同源；运维取计费模型年化值，
 *      与页头「系统运维预算」指标卡同源。合计行同源：Σ(行总预算) = Σ项目 + Σ运维。
 *      列宽 858 → 754（170/112/164/168/140）。
 *
 * v1.3 变更（《部门预算消耗情况》行操作只留读，不留写）：
 *   ① 移除行内「调整预算计划」按钮 —— 预算调整权收归《项目预算计划》页，
 *      消耗页退回纯只读视图：看数 + 查账，不再提供改写预算的入口。
 *   ② 连带下线整条「调整项目预算」业务分支：AdjustPlanForm / 抽屉 / ADJUST_MODE /
 *      store.adjustProjectBudget / poolAdjustments 流水一并移除（无死代码）。
 *      注：mock 的 POOL_ADJUSTMENTS 是历史流水，只随分支展示，一并移除；
 *      部门预算总额早已包含这些调整，删除不影响任何预算数值。
 *   ③ 操作列宽 158 → 76（只剩「查账」一个 2 字 link 按钮），表格总宽 670 → 588。
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Card, Table, Tag, Flex, Typography, Button, Modal, Form, Input, message,
  Row, Col, Tooltip, Progress, Drawer, Descriptions, Divider, Alert, Badge
} from 'antd';
import {
  FileTextOutlined, HistoryOutlined, ExportOutlined, ArrowLeftOutlined,
  PlusOutlined, DeleteOutlined, LoadingOutlined
} from '@ant-design/icons';
import { useT, levelColor } from '../theme.js';
import { useStore, calc } from '../store.jsx';
import {
  PageHead, Metric, PoolMeter, POOL_CAPTION, PoolLevelTag, Hint, BlockTitle, Blank, TextTag,
  FilterBar, TraceChain
} from '../components/common.jsx';
import { demandChainNodes, drillTargetOf } from '../components/traceNodes.js';
import ProjectBudgetPage from './ProjectBudgetPage.jsx';
import OpsBudgetPage from './OpsBudgetPage.jsx';

const { Text } = Typography;
const {
  fmtWan, fmtPct, fmtNum, consumptionUpTo, consumptionBreakdown, poolLevel,
  annualPlanRows, CURRENT_MONTH, billStateOf, billIdOf,
  bpVersionsOf, bpDocsOf, bpDocFormLabel, bpSummaryStateOf, nextMinorVersion
} = calc;

const VIEWS = [
  { key: 'annual', label: '年度预算计划' },
  { key: 'consume', label: '预算消耗' }
];

/** 年度预算计划 = 次年编制口径（BP / 需求清单 / 运维预估均为次年编制产物） */
const PLAN_FY = 2027;
const FY_LABEL = { 2026: 'FY2026', 2027: 'FY2027' };
const LEVEL_RANK = { over: 0, warn: 1, watch: 2, ok: 3 };

/**
 * 编制项名称（v0.6 术语统一）：
 *   ① 年度 BP           —— 业务提交 BP 文档 / 文档链接并填写版本基本信息
 *   ② 项目预算           —— 需求清单 + Digital 逐条给出的项目预算费用（整份清单一个版本）
 *   ③ 系统运维预算       —— Digital 出具、业务复核确认
 * 去掉「提交及更新」后缀：状态已由列内的状态标识承载，标题不再重复。
 */
const STAGE_LABEL = { BP: '① 年度 BP', DEMAND: '② 项目预算', OPS: '③ 系统运维预算' };

/**
 * 编制状态 → antd Tag 语义色（v0.5 口径）
 *   BP：只有 已提交 / 未提交
 *   需求清单版本：未提交 / 待评估费用 / 已确认
 */
const STATUS_TONE = {
  未提交: 'default',
  已提交: 'processing',
  待评估费用: 'warning',
  已确认: 'success',
  待评估: 'warning',
  未启动: 'default',
  编制中: 'warning',
  待业务确认: 'warning'
};

/**
 * 编制项动作元数据。
 * v0.5 修订：
 *   · BP —— 提交文档或文档链接 + 填写该版本基本信息即算一次「提交 / 更新」，
 *           系统按次版本号递增生成版本记录；不设归档 / 复核 / 编制中等状态。
 * v0.8 修订：
 *   · ② 需求清单 —— 改走独立《项目预算计划》页（draft 状态机 S0–S5），
 *           本表**不再承载 DEMAND 动作**。
 * v1.1 修订：
 *   · ③ 系统运维预算 —— 改走独立《系统运维预算计划》页（opsDrafts 状态机 S0–S3），
 *           原 OPS_复核确认 / OPS_出具 / OPS_退回 三个动作元数据**一并移除**；
 *           主表仅保留「格 / 综合视图」两个入口跳转，动作全部在页面内完成。
 * v1.2 清理：ACTION_META 已空、openAction / PlanActionModal 随 OpsPanel 一并移除（死代码）。
 */

function deptOptions(data, includeAll = true) {
  const base = data.departments.map((d) => ({ value: d.code, label: d.name }));
  return includeAll ? [{ value: 'all', label: '全部部门' }, ...base] : base;
}

/* ================================================================== *
 * 通用件
 * ================================================================== */

/**
 * 编制项单元格（v0.6）：**产物在前，状态退居辅助**。整格可点击下钻。
 *
 * 版面自上而下共两级：
 *   第 1 级（主信息）  主数值 16px / 500 / tabular-nums，「万元」以 12px 小字后缀；
 *                     无产物时（`—` / `待核定` / `待出具`）降为 t3 淡色 —— 空白一眼可辨；
 *   第 2 级（辅助）    状态圆点（antd Badge，语义色）+ `状态 · 次数值`，12px / t3。
 *
 * 为什么不用 Tag：Tag 有底色和边框，视觉重量与主数值同级甚至更高，
 * 会把「已确认」这种**过程信息**顶到第一眼，而真正要看的是钱和条数。
 * 圆点是纯色小点，能扫、能辨色，但不抢焦点。
 *
 * 其余旁注（提交时间、文档形式、变更说明、版本流水）一律移入抽屉，
 * 单元格仅以原生 title 保留一行摘要提示，不占任何版面。
 *
 * @param status    状态文案（同时决定 Badge 语义色）
 * @param value     主数值（费用数字 / 版本号 / 占位文案）
 * @param unit      主数值单位（如「万元」），无则不渲染
 * @param muted     主数值是否为「暂无产物」，true 时整体降为淡色
 * @param secondary 次数值（`4 条需求` / `3 个系统`），无则状态行只显示状态
 * @param title     悬停摘要，纯提示用途
 *
 * v0.6.1 屏效：内边距 4→2、行间距 4→2，配合表格 size="small"，
 * 单元格行高由 ~74px 降到 ~60px，一屏可多显示约 2 行。
 */
function PlanCell({ c, testid, status, value, unit, muted, secondary, title, onClick }) {
  const [hover, setHover] = React.useState(false);
  const aria = [status, value, unit, secondary].filter(Boolean).join(' ');
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={testid}
      aria-label={aria}
      title={title || undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick && onClick();
        }
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        marginLeft: -6,
        padding: '2px 6px',
        borderRadius: c.radiusSm,
        border: `1px solid ${hover ? c.brandBorder : 'transparent'}`,
        background: hover ? c.brandBg : 'transparent',
        cursor: 'pointer',
        transition: 'background 0.2s ease, border-color 0.2s ease'
      }}
    >
      <Flex vertical gap={2}>
        <Flex align="baseline" gap={4}>
          <Text
            style={{
              fontSize: 16,
              fontWeight: 500,
              lineHeight: 1.25,
              color: muted ? c.t3 : c.t1,
              fontVariantNumeric: 'tabular-nums'
            }}
          >
            {value}
          </Text>
          {unit ? <Text style={{ fontSize: 12, color: c.t3 }}>{unit}</Text> : null}
        </Flex>
        <Flex align="center" gap={6}>
          <Badge status={STATUS_TONE[status] || 'default'} />
          <Text style={{ fontSize: 12, color: c.t3, fontVariantNumeric: 'tabular-nums' }}>
            {secondary ? `${status} · ${secondary}` : status}
          </Text>
        </Flex>
      </Flex>
    </div>
  );
}

/** 合计行单元格：与编制项单元格同构（主数值 / 辅助行两级），字号各降一档以免压过数据行 */
function SumCell({ c, value, unit, secondary, muted }) {
  return (
    <Flex vertical gap={2}>
      <Flex align="baseline" gap={4}>
        <Text
          style={{
            fontSize: 14,
            fontWeight: 500,
            lineHeight: 1.3,
            color: muted ? c.t3 : c.t1,
            fontVariantNumeric: 'tabular-nums'
          }}
        >
          {value}
        </Text>
        {unit ? <Text style={{ fontSize: 11, color: c.t3 }}>{unit}</Text> : null}
      </Flex>
      {secondary ? <Text style={{ fontSize: 11, color: c.t3, fontVariantNumeric: 'tabular-nums' }}>{secondary}</Text> : null}
    </Flex>
  );
}

/** 提交与更新记录（所有操作都有记录的唯一呈现入口） */
function ActivityTable({ items, c, emptyText = '暂无操作记录' }) {
  if (!items || !items.length) return <Blank text={emptyText} compact />;
  return (
    <Table
      size="small"
      rowKey="id"
      pagination={false}
      dataSource={items}
      columns={[
        { title: '时间', dataIndex: 'at', width: 140, render: (v) => <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{v}</span> },
        { title: '编制项', dataIndex: 'stage', width: 130, render: (v) => <Text style={{ fontSize: 12 }}>{STAGE_LABEL[v] || v}</Text> },
        { title: '动作', dataIndex: 'action', width: 96, render: (v) => <TextTag tone={v === '退回' || v === '催办' ? 'warn' : v === '复核确认' || v === '归档' ? 'ok' : 'info'}>{v}</TextTag> },
        { title: '操作人', dataIndex: 'actor', width: 96 },
        {
          title: '角色',
          dataIndex: 'role',
          width: 100,
          render: (v) => <Text style={{ fontSize: 12, color: v === 'Digital' ? c.brand : c.t2 }}>{v}</Text>
        },
        { title: '说明', dataIndex: 'note', ellipsis: true, render: (v) => <Text style={{ fontSize: 12, color: c.t2 }}>{v || '—'}</Text> }
      ]}
    />
  );
}

/* ================================================================== *
 * ① 年度预算计划 —— 主视图
 * ================================================================== */

export function AnnualPlanView({ param, msgApi, onNavigate }) {
  const c = useT();
  const { data, globalFy } = useStore();
  const fy = PLAN_FY;

  const [f, setF] = useState({ dept: 'all', kw: '' });
  const [ctx, setCtx] = useState(null); // { stage, dept, demandId }

  const rows = useMemo(
    () =>
      annualPlanRows(data, fy).filter((r) => {
        if (f.dept !== 'all' && r.deptCode !== f.dept) return false;
        if (f.kw && !`${r.deptName}${r.deptCode}${r.digitalOwner}${r.bpOwner}`.includes(f.kw)) return false;
        return true;
      }),
    [data, fy, f]
  );

  /* 深链：DM- 单号 → 需求详情；部门代码 → 该 BU 综合视图 */
  useEffect(() => {
    if (!param) return;
    if (param.startsWith('DM-')) {
      const d = data.demands.find((x) => x.id === param);
      if (d) setCtx({ stage: 'DEMAND', dept: d.dept, demandId: d.id });
      return;
    }
    if (data.departments.some((x) => x.code === param)) setCtx({ stage: 'SUMMARY', dept: param, demandId: null });
  }, [param, data.demands, data.departments]);

  const rowOf = (deptCode) => annualPlanRows(data, fy).find((r) => r.deptCode === deptCode) || null;
  const ctxRow = ctx ? rowOf(ctx.dept) : null;

  const sum = useMemo(
    () => ({
      demandCount: rows.reduce((s, r) => s + r.demandCount, 0),
      projectAmount: rows.reduce((s, r) => s + r.projectAmount, 0),
      /**
       * 已确认版本的费用合计 —— 与列内口径**严格同源**：
       * 列内只有「当前版本已确认」才出金额，其余显示「待核定」，
       * 因此合计只累加 demandConfirmedAmount，不做任何回退估算。
       */
      confirmedAmount: rows.reduce((s, r) => s + (r.demandConfirmedAmount || 0), 0),
      confirmedCount: rows.filter((r) => r.demandConfirmedAmount != null).length,
      bpDoneCount: rows.filter((r) => r.bpDone).length,
      /**
       * 系统运维预算合计 —— **与列内严格同源**（v1.6 P0-3）。
       * 必须用 `opsCountedAmount`（列内可见时才计入），不能用 `opsAmount`：
       * 后者对「编制中 / 未启动」的行也有值，而那些行在列内显示「待出具」，
       * 无条件累加会让用户逐列相加比合计少 442.2 万且无任何解释。
       */
      opsAmount: rows.reduce((s, r) => s + r.opsCountedAmount, 0),
      /** 未出具（不计入合计）的运维金额，用于脚注显式说明差额来源 */
      opsPendingAmount: rows.reduce((s, r) => s + (r.opsIssued ? 0 : r.opsAmount), 0),
      /** 运维覆盖的**去重**系统数（同一系统被多部门共用只计一次；逐行相加会重复计数，不可用） */
      opsSystems: new Set(rows.flatMap((r) => r.opsSystems.map((s) => s.sys.id))).size,
      /**
       * 总预算费用合计 —— 与列内**严格同源**：Σ(行 projectCountedAmount + 行 opsCountedAmount)。
       * v1.6 P0-3 补齐：项目侧此前误用 `projectAmount`（含未核定预估），而 ② 列只显示
       * 已确认金额 ⇒ 合计比用户逐列相加多 1,063.9 万且无法解释。改用列内可见口径后，
       * 「②+③ = 总预算费用」在每行与合计行同时成立。
       */
      totalBudget: rows.reduce((s, r) => s + r.projectCountedAmount + r.opsCountedAmount, 0),
      /** 未确认（不计入合计）的项目预算金额，用于脚注显式说明差额来源 */
      projectPendingAmount: rows.reduce(
        (s, r) => s + (r.demandConfirmedAmount != null ? 0 : r.projectAmount),
        0
      )
    }),
    [rows]
  );

  const fields = [
    { key: 'dept', label: '部门', type: 'select', options: deptOptions(data) },
    { key: 'kw', label: '关键词', type: 'keyword', placeholder: '搜索部门 / 责任人' }
  ];

  const columns = [
    {
      title: '业务部门',
      dataIndex: 'deptName',
      width: 170,
      fixed: 'left',
      render: (v, r) => (
        <div
          role="button"
          tabIndex={0}
          data-testid={`budget-annual-dept-${r.deptCode}`}
          aria-label={`${v} 年度预算计划综合视图`}
          onClick={() => setCtx({ stage: 'SUMMARY', dept: r.deptCode })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setCtx({ stage: 'SUMMARY', dept: r.deptCode });
          }}
          style={{ cursor: 'pointer' }}
        >
          <Flex vertical gap={2}>
            <Text style={{ fontSize: 13, fontWeight: 500 }}>{v}</Text>
            <Text style={{ fontSize: 11, color: c.t3 }}>
              {r.deptCode} · Digital {r.digitalOwner}
            </Text>
          </Flex>
        </div>
      )
    },
    {
      title: '① 年度 BP',
      key: 'bp',
      width: 112,
      render: (_, r) => (
        <PlanCell
          c={c}
          testid={`budget-annual-cell-bp-${r.deptCode}`}
          status={r.bpStatus}
          value={r.bp ? r.bp.version : '—'}
          muted={!r.bp}
          title={
            r.bp
              ? `最近更新 ${r.bp.at} · ${bpDocFormLabel(r.bp)} · 点击查看版本记录`
              : '尚未提交 · 点击查看'
          }
          onClick={() => onNavigate('budget', 'bpplan', r.deptCode)}
        />
      )
    },
    {
      title: '② 项目预算',
      key: 'demand',
      width: 164,
      render: (_, r) => {
        const version = r.demandConfirmedVersion;
        const confirmed = r.demandStatus === '已确认';
        const pending = r.demandStatus === '待评估费用';
        return (
          <PlanCell
            c={c}
            testid={`budget-annual-cell-demand-${r.deptCode}`}
            status={r.demandStatus}
            value={confirmed ? fmtWan(r.demandConfirmedAmount) : pending ? '待核定' : '—'}
            unit={confirmed ? '万元' : undefined}
            muted={!confirmed}
            secondary={r.demandStatus === '未提交' ? null : `${r.demandCount} 条需求`}
            title={
              confirmed
                ? `${version.version} · 确认于 ${(version.confirmedAt || version.submittedAt).slice(0, 10)} · 点击查看整份清单版本记录`
                : pending
                ? `提交于 ${(r.demandLatestVersion.submittedAt || '').slice(0, 10)} · 待 Digital 逐条核定费用 · 点击查看`
                : '尚未提交 · 点击查看'
            }
            onClick={() => onNavigate('budget', 'project', r.deptCode)}
          />
        );
      }
    },
    {
      title: '③ 系统运维预算',
      key: 'ops',
      width: 168,
      render: (_, r) => (
        <PlanCell
          c={c}
          testid={`budget-annual-cell-ops-${r.deptCode}`}
          status={r.opsStatus}
          value={r.opsIssued ? fmtWan(r.opsAmount) : '待出具'}
          unit={r.opsIssued ? '万元' : undefined}
          muted={!r.opsIssued}
          secondary={`${r.opsSystemCount} 个系统`}
          title={
            r.opsIssued
              ? `${r.opsPlan.version} · 出具于 ${r.opsPlan.issueDate}${r.opsPlan.confirmDate ? ` · ${r.opsPlan.confirmDate} 业务确认` : ' · 待业务确认'} · ${r.opsSystemCount} 个系统 · 点击查看`
              : `Digital 尚未出具运维预估${r.opsPlan.version && r.opsPlan.version !== '—' ? `（当前 ${r.opsPlan.version}）` : ''} · 点击查看`
          }
          onClick={() => onNavigate('budget', 'opsplan', r.deptCode)}
        />
      )
    },
    {
      /**
       * 总预算费用（v1.2 新增）= 项目预算 + 系统运维预算。
       * 口径见文件头 v1.2 ③：项目预算取「清单当前版本合计」（与页头「总项目费用」卡同源）、
       * 运维取计费模型年化值（与页头「系统运维预算」卡同源）。
       * 不做下钻（②③ 格已是明细入口）、不挂状态行 —— 它只是两个金额的和，不重复承载状态。
       */
      title: '总预算费用',
      key: 'totalBudget',
      width: 140,
      render: (_, r) => {
        /* v1.6 P0-3：与合计行、与②③ 列**三方同源** ——
           项目侧只计「已确认」（② 列当前渲染的那个数），运维侧只计「已出具」，
           否则本列会比用户把②③ 两列加起来多出一截无解释的钱。 */
        const total = r.projectCountedAmount + r.opsCountedAmount;
        const projPart =
          r.demandConfirmedAmount != null
            ? `项目预算 ${fmtWan(r.projectAmount)}`
            : `项目预算 0（${r.demandStatus === '未提交' ? '未提交' : '待核定'}，清单当前版本 ${fmtWan(r.projectAmount)} 不计入）`;
        const opsPart = r.opsIssued
          ? `系统运维预算 ${fmtWan(r.opsAmount)}`
          : `系统运维预算 0（待出具，模型年化 ${fmtWan(r.opsAmount)} 不计入）`;
        return (
          <div
            data-testid={`budget-annual-cell-total-${r.deptCode}`}
            title={`${projPart} + ${opsPart}（万元）· 本列只计②③ 两列当前可见的金额：项目取已确认清单合计，运维取已出具的计费模型年化值`}
            style={{ marginLeft: -6, padding: '2px 6px' }}
          >
            <Flex align="baseline" gap={4}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: 500,
                  lineHeight: 1.25,
                  color: c.t1,
                  fontVariantNumeric: 'tabular-nums'
                }}
              >
                {fmtWan(total)}
              </Text>
              <Text style={{ fontSize: 12, color: c.t3 }}>万元</Text>
            </Flex>
          </div>
        );
      }
    }
  ];

  return (
    <div>
      {globalFy !== fy && (
        <div style={{ marginBottom: 12 }}>
          <Hint>
            年度预算计划为<strong>次年编制</strong>产物，数据归属 {FY_LABEL[fy]}；当前全局年度为 {FY_LABEL[globalFy]}，
            本视图已自动切换至 {FY_LABEL[fy]} 口径。执行年度的消耗情况请见「预算消耗」。
          </Hint>
        </div>
      )}

      <PageHead
        title="年度预算计划"
        desc="部门年度 Digital 预算的三个编制项：① 年度 BP —— 提交文档或文档链接并填写该版本基本信息即算提交，系统只记录版本号、更新时间与变更说明；② 项目预算 —— 需求清单及逐条项目预算费用，以整份清单为一个版本，业务提交后进入「待评估费用」，Digital 逐条给出费用后确认为新版本；③ 系统运维预算。主表每格以产物数值为主、状态标识为辅，三项均可点击下钻查看明细与版本记录。"
        extra={
          <Flex gap={8} align="center">
            <Button icon={<HistoryOutlined />} onClick={() => setCtx({ stage: 'ACTIVITY', dept: null })}>
              全部操作记录
            </Button>
            <Button
              type="primary"
              icon={<ExportOutlined />}
              onClick={() => msgApi.success(`已导出 ${FY_LABEL[fy]} 年度预算计划（${rows.length} 个 BU，含操作记录）`)}
            >
              导出计划
            </Button>
          </Flex>
        }
      />

      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} lg={6}>
          <Metric label={`${FY_LABEL[fy]} 编制部门数`} value={`${rows.length}`} unit="个" sub={`点击行可查看各 BU 编制明细`} />
        </Col>
        <Col xs={12} lg={6}>
          <Metric label="需求清单条数" value={`${sum.demandCount}`} unit="条" sub={`覆盖 ${rows.filter((r) => r.demandCount).length} 个部门`} />
        </Col>
        <Col xs={12} lg={6}>
          <Metric label="总项目费用（清单当前版本）" value={fmtWan(sum.projectAmount)} tone="warning" sub="Digital 核定费用优先，未核定按业务预估" />
        </Col>
        <Col xs={12} lg={6}>
          {/* v1.6：label 删掉「Digital 出具」—— 该数只统计已出具的行，
              未出具（编制中/未启动）的行显示「待出具」且不计入，
              标成「Digital 出具」是不实描述。sub 显式说明合计口径。 */}
          <Metric
            label="系统运维预算"
            value={fmtWan(sum.opsAmount)}
            tone="success"
            sub={sum.opsPendingAmount > 0
              ? `仅计已出具 · 另有 ${fmtWan(sum.opsPendingAmount)} 万元待出具未计入`
              : '按 12 个月计费模型年化 · 全部已出具'}
          />
        </Col>
      </Row>

      <FilterBar
        fields={fields}
        value={f}
        onChange={setF}
        resultCount={rows.length}
        onReset={() => setF({ dept: 'all', kw: '' })}
        fyLabel={FY_LABEL[fy]}
      />

      <Card data-testid="budget-annual-table" styles={{ body: { padding: 16 } }}>
        <BlockTitle
          extra={<Text style={{ fontSize: 12, color: c.t3 }}>三个编制项均可点击下钻；版本变更与操作记录随每次提交 / 更新实时落库</Text>}
        >
          各 BU 年度预算计划编制情况
        </BlockTitle>
        {rows.length ? (
          <Table
            size="small"
            rowKey="key"
            columns={columns}
            dataSource={rows}
            pagination={false}
            scroll={{ x: 754 }}
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0}>
                  <Text strong>合计</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1}>
                  <SumCell c={c} value={`${sum.bpDoneCount} / ${rows.length}`} secondary="已提交" muted={!sum.bpDoneCount} />
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2}>
                  <SumCell
                    c={c}
                    value={fmtWan(sum.confirmedAmount)}
                    unit="万元"
                    secondary={`${sum.confirmedCount}/${rows.length} 版本已确认`}
                    muted={!sum.confirmedCount}
                  />
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3}>
                  <SumCell c={c} value={fmtWan(sum.opsAmount)} unit="万元" secondary={`${sum.opsSystems} 个系统`} />
                </Table.Summary.Cell>
                <Table.Summary.Cell index={4}>
                  <SumCell
                    c={c}
                    value={fmtWan(sum.totalBudget)}
                    unit="万元"
                    secondary="项目 + 运维"
                  />
                </Table.Summary.Cell>
              </Table.Summary.Row>
            )}
          />
        ) : (
          <Blank text="该条件下暂无数据 · [重置筛选]" compact />
        )}
        <div style={{ marginTop: 8, fontSize: 12, color: c.t3 }}>
          读法：每格<strong>大字为产物数值、小字圆点为状态</strong>；灰色大字表示该编制项尚无产物（— / 待核定 / 待出具）。
          口径：需求清单以<strong>整份清单</strong>为一个版本，不做逐条版本管理；项目预算 = 该版本各条「项目预算费用」之和（由 Digital 逐条给出）。
          合计行的项目预算<strong>只统计已确认版本</strong>，未确认的 BU 在列内为「待核定」、不计入合计；上方「总项目费用（清单当前版本）」则为含业务预估的口径。
          合计行的系统运维预算<strong>只统计已出具的 BU</strong>（D-MKT 编制中、D-HR 未启动在列内为「待出具」、不计入合计）；其模型年化值仍在 ③ 列的悬浮提示里可查。
          「总预算费用」= <strong>② 列当前显示的金额 + ③ 列当前显示的金额</strong>，逐行与合计行都成立（未取数的格按 0 计，悬浮提示里写明被排除的金额与其状态）—— 所以它与上方两张指标卡口径不同：指标卡是「全量申报」视角，本列是「已确认 / 已出具」视角。
          BP 只有「已提交」一种状态，每次提交 / 更新生成一个版本；系统运维预算由 Digital 按系统计费模型出具、业务部门复核确认后生效。
        </div>
      </Card>

      {/* ---------------- 编制项下钻抽屉 ---------------- */}
      <Drawer
        open={!!ctx}
        onClose={() => setCtx(null)}
        width={940}
        title={
          !ctx
            ? ''
            : ctx.stage === 'ACTIVITY'
            ? `操作记录 · ${FY_LABEL[fy]} 年度预算计划`
            : ctx.stage === 'SUMMARY'
            ? `${ctxRow ? ctxRow.deptName : ''} · 年度预算计划（${FY_LABEL[fy]}）`
            : ctx.demandId
            ? `需求详情 · ${ctx.demandId}`
            : `${STAGE_LABEL[ctx.stage]} · ${ctxRow ? ctxRow.deptName : ''}`
        }
      >
        {ctx && ctx.stage === 'ACTIVITY' && (
          <div data-testid="budget-annual-activity-drawer">
            <Hint>
              年度预算计划板块的所有操作留痕：提交、更新、复核确认、退回、催办均逐条记录操作人、角色与时间。
            </Hint>
            <div style={{ marginTop: 16 }}>
              <ActivityTable items={data.planActivities} c={c} />
            </div>
          </div>
        )}

        {ctxRow && ctx.stage === 'SUMMARY' && (
          <SummaryPanel
            row={ctxRow}
            c={c}
            onOpen={(stage) =>
              stage === 'BP'
                ? onNavigate('budget', 'bpplan', ctxRow.deptCode)
                : stage === 'DEMAND'
                ? onNavigate('budget', 'project', ctxRow.deptCode)
                : onNavigate('budget', 'opsplan', ctxRow.deptCode)
            }
          />
        )}

        {ctx && ctx.demandId && (
          <DemandDetailPanel
            demandId={ctx.demandId}
            data={data}
            c={c}
            onNavigate={onNavigate}
          />
        )}
      </Drawer>
    </div>
  );
}

/* ---------------- 抽屉各面板 ---------------- */

/* ================================================================== *
 * 《年度 BP 计划》独立下钻页（#/budget/bpplan/{deptCode}）—— v1.0
 *
 * 用户口径：主表「① 年度 BP」格点击后以**独立页面**拉起本项目《年度 BP 计划》，
 *   不再使用右侧浮层。页面主体 = 该部门 FY2027 全部 BP 版本列表（每行一个版本）；
 *   页面内唯一入口 = 页头「修正年度 BP」→ BpUpdateModal 浮层。
 *
 * 版式契约（设计规范 §3 / §7）：页头 → meta 行 → 列表标题行 → 版本列表（无概览卡）。
 * 硬约束：颜色一律取 useT()、字重仅 400/500、版本内容不可变
 *   （唯一例外：AI 摘要 ai_pending → ai 的一次性后置回填）。
 * ================================================================== */
export function BpPlanPage({ deptCode, onNavigate }) {
  const c = useT();
  const { data, discardBpVersion } = useStore();
  const [msgApi, holder] = message.useMessage();
  const [modalOpen, setModalOpen] = useState(false);

  const dept = data.departments.find((d) => d.code === deptCode) || null;
  const versions = useMemo(
    () => (dept ? bpVersionsOf(data, deptCode, PLAN_FY) : []),
    [data, deptCode, dept]
  );

  const goAnnual = () => onNavigate && onNavigate('budget', 'annual');
  const backButton = (
    <Button type="text" icon={<ArrowLeftOutlined />} data-testid="budget-bp-back" onClick={goAnnual}>
      返回年度预算计划
    </Button>
  );

  /* 兜底：部门代码缺失 / 非法 → 给返回引导，不白屏 */
  if (!dept) {
    return (
      <div data-testid="budget-bp-plan-page">
        {holder}
        <PageHead
          title="年度 BP 计划"
          desc="未指定有效的业务部门，请从《年度预算计划》主表进入。"
          extra={backButton}
        />
        <Card styles={{ body: { padding: 16 } }}>
          <Blank text="未找到该业务部门 · 请返回《年度预算计划》后从「① 年度 BP」格重新进入" />
        </Card>
      </div>
    );
  }

  const latest = versions[0] || null;

  /* 6 列（宽度合计 1088）：前 5 列严格按用户列序，版本作为系统列置尾并 fixed:'right'。
     1088 口径 = 1440 视口下表格真实可用宽 1119 − 预留 31px 余量，确保主流视口
     （1440 扣竖向滚动条后）clientWidth ≥ scrollWidth、**不出现常态化的 3px 无用横滚条**。
     可用宽推导见 docs/v1.0-annual-bp-plan-page-design.md §4.2（显式扣除 Card body padding 32 + 边框 2）。 */
  const columns = [
    {
      title: 'BP名称',
      dataIndex: 'name',
      width: 168,
      ellipsis: true,
      render: (v) => <span style={{ fontSize: 13, color: c.t1 }}>{v || '—'}</span>
    },
    {
      title: '年度业务量化目标',
      dataIndex: 'goals',
      width: 192,
      render: (v) => (
        <Typography.Paragraph
          style={{ fontSize: 13, color: c.t1, marginBottom: 0, whiteSpace: 'pre-line' }}
          ellipsis={{ rows: 2, tooltip: v || undefined }}
        >
          {v || '—'}
        </Typography.Paragraph>
      )
    },
    {
      title: 'BP内容核心摘要',
      key: 'summary',
      width: 300,
      render: (_, v) => {
        const st = bpSummaryStateOf(v);
        const readable = st.source === 'business' || st.source === 'ai';
        return (
          <div>
            {readable ? (
              <Typography.Paragraph
                style={{ fontSize: 13, color: c.t1, marginBottom: 0 }}
                ellipsis={{ rows: 2, tooltip: st.text || undefined }}
              >
                {st.text}
              </Typography.Paragraph>
            ) : (
              // 无障碍：ai_pending / ai_failed 是用户需要读懂的**语义状态**（非纯元信息），
              // 故取 t2（白底 ≈7.0:1，达 AA），不用 t3（≈3.36:1）。纯元信息（版本列次行/统计行/单位）仍保持 t3。
              <span
                style={{
                  fontSize: 12,
                  color: c.t2,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                {st.pending ? <LoadingOutlined /> : null}
                {st.text}
              </span>
            )}
            {st.sourceLabel ? (
              <div
                data-testid={`budget-bp-summary-source-${v.version}`}
                style={{ fontSize: 12, color: c.t2, marginTop: 2 }}
              >
                {`· ${st.sourceLabel}`}
              </div>
            ) : null}
          </div>
        );
      }
    },
    {
      title: 'BP文档链接',
      key: 'docs',
      width: 124,
      render: (_, v) => {
        const docs = bpDocsOf(v);
        if (!docs.length) return <span style={{ fontSize: 13, color: c.t3 }}>未提供文档</span>;
        const [first, ...rest] = docs;
        return (
          <div
            title={docs.map((d) => d.name).join('、')}
            style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            <a
              data-testid={`budget-bp-doc-${v.version}`}
              href={first.url}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 13, color: c.brand }}
            >
              {first.name}
              <ExportOutlined style={{ fontSize: 11, marginInlineStart: 4 }} />
            </a>
            {rest.length ? (
              <span style={{ fontSize: 12, color: c.t3, marginInlineStart: 4 }}>{`+${rest.length}`}</span>
            ) : null}
          </div>
        );
      }
    },
    {
      title: '该版本修订说明',
      dataIndex: 'changeNote',
      width: 172,
      ellipsis: true,
      render: (v) => <span style={{ fontSize: 13, color: c.t2 }}>{v || '—'}</span>
    },
    {
      title: '版本',
      key: 'version',
      width: 132,
      fixed: 'right',
      render: (_, v, index) => {
        const isCurrent = index === 0;
        return (
          <div>
            <div
              style={{
                fontSize: 13,
                fontWeight: isCurrent ? 500 : 400,
                color: isCurrent ? c.brand : c.t3,
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1.4
              }}
            >
              {v.version}
            </div>
            <div
              style={{
                fontSize: 12,
                color: c.t3,
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1.5,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              {`${v.at} · ${v.owner}`}
            </div>
          </div>
        );
      }
    },
    {
      /* v1.6 P0-10：BP 版本废弃 —— 补齐 BP 的纠错通道。
         此前 bpVersions 只追加不删除，且三个下钻页里只有本表没有版本操作列
         （项目预算页有废弃/退回、运维页有退回）⇒ BP 成了唯一无法纠错的编制项：
         文档链接贴错只能再提交一版，错误内容永久留在列表里。
         只给「当前版本」（index 0）提供废弃，历史版本保持不可变以供回溯。 */
      title: '操作',
      key: 'ops',
      width: 76,
      fixed: 'right',
      render: (_, v, idx) =>
        idx === 0 ? (
          <Button
            size="small"
            danger
            data-testid={`budget-bp-discard-${v.version}`}
            onClick={() =>
              Modal.confirm({
                title: `废弃 BP 版本 ${v.version}？`,
                content: `废弃后该版本不再作为当前版本，BP 回退到 ${
                  versions[1] ? versions[1].version : '无（需重新提交首版）'
                }。该操作不可恢复。`,
                okText: '废弃该版本',
                okButtonProps: { danger: true },
                cancelText: '取消',
                onOk: () => {
                  discardBpVersion(deptCode, PLAN_FY, v.id, dept.bpOwner, '业务部门');
                  msgApi.success(`已废弃 BP 版本 ${v.version}`);
                }
              })
            }
          >
            废弃
          </Button>
        ) : (
          <Text style={{ fontSize: 12, color: c.t4 }}>历史</Text>
        )
    }
  ];

  return (
    <div data-testid="budget-bp-plan-page">
      {holder}
      <PageHead
        title={`${dept.name} · 年度 BP 计划`}
        desc="该部门 FY2027 年度 BP 的版本列表：最新版本置顶并即时生效。"
        extra={
          <Flex gap={8} align="center">
            {backButton}
            <Button
              type="primary"
              icon={<FileTextOutlined />}
              data-testid="budget-bp-update"
              onClick={() => setModalOpen(true)}
            >
              修正年度 BP
            </Button>
          </Flex>
        }
      />

      {/* meta 行：责任人（12px t3）—— PageHead 无插槽，按订用兄弟节点渲染 */}
      <div style={{ fontSize: 12, color: c.t3, marginBottom: 12 }}>
        业务责任人 {dept.bpOwner} · Digital 对接人 {dept.digitalOwner}
      </div>

      <Card styles={{ body: { padding: 16 } }}>
        <BlockTitle
          extra={
            latest ? (
              <Text style={{ fontSize: 12, color: c.t3, fontVariantNumeric: 'tabular-nums' }}>
                共 {versions.length} 个版本 · 当前 {latest.version} · 最近更新 {latest.at}
              </Text>
            ) : null
          }
        >
          年度 BP 版本记录
        </BlockTitle>

        {versions.length ? (
          <Table
            data-testid="budget-bp-table"
            size="small"
            rowKey="id"
            pagination={false}
            scroll={{ x: 1164 }}
            dataSource={versions}
            columns={columns}
          />
        ) : (
          <Blank text="该部门 FY2027 年度 BP 尚未提交 · 点击右上角「修正年度 BP」提交首版" />
        )}

        <div style={{ marginTop: 8, fontSize: 12, color: c.t3 }}>
          版本不可变：已提交版本的内容只读，后续更新以<strong>追加新版本</strong>的方式生效；当前版本即列表首行，历史版本仅供回溯
          （AI 摘要为一次性后置回填，不改变该版本的其他内容）。
          <strong>仅当前版本可「废弃」</strong>（用于修正贴错的文档链接或年度目标，废弃后 BP 自动回退到上一版本）；历史版本一律只读、不可变更。
        </div>
      </Card>

      <BpUpdateModal
        open={modalOpen}
        deptCode={deptCode}
        deptName={dept.name}
        owner={dept.bpOwner}
        versions={versions}
        c={c}
        msgApi={msgApi}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}

/* ---------------- 抽屉各面板 ---------------- */

function SummaryPanel({ row, c, onOpen }) {
  const cards = [
    {
      key: 'BP',
      tone: row.bpDone ? c.success : c.warning,
      label: '① 年度 BP 文档',
      main: row.bp ? `已提交 · ${row.bp.version} · ${bpDocFormLabel(row.bp)}` : '未提交',
      sub: `业务责任人 ${row.bpOwner} · ${row.bpVersions.length} 个版本 · ${row.bpLast ? row.bpLast.at.slice(0, 10) : '无记录'}`
    },
    {
      key: 'DEMAND',
      tone: row.demandDone ? c.success : c.warning,
      label: '② 项目预算',
      main:
        row.demandStatus === '未提交'
          ? '尚未提交'
          : `${row.demandVersionLabel || '待得号'} · ${row.demandCount} 条 · ${fmtWan(row.demandAmount)} 万元`,
      sub: `${row.demandStatus} · 预估 ${fmtNum(row.demandMD)} 人天 · ${
        row.demandEvalPending ? `待 Digital 核定 ${row.demandEvalPending} 条` : '费用已全部核定'
      }`
    },
    {
      key: 'OPS',
      tone: row.opsDone ? c.success : c.warning,
      label: '③ 系统运维预估费用',
      main: `${fmtWan(row.opsAmount)} 万元`,
      sub: `${row.opsSystems.length} 个系统 · ${row.opsStatus}`
    }
  ];
  return (
    <div data-testid="budget-annual-summary">
      <Flex gap={12} wrap>
        {cards.map((cd) => (
          <div
            key={cd.key}
            role="button"
            tabIndex={0}
            onClick={() => onOpen(cd.key)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onOpen(cd.key);
            }}
            style={{
              flex: '1 1 240px',
              border: `1px solid ${c.border}`,
              borderLeft: `3px solid ${cd.tone}`,
              borderRadius: c.radius,
              background: c.bg1,
              padding: 14,
              cursor: 'pointer'
            }}
          >
            <Text style={{ fontSize: 12, color: c.t3 }}>{cd.label}</Text>
            <div style={{ marginTop: 6, fontSize: 16, fontWeight: 500, color: c.t1 }}>{cd.main}</div>
            <Text style={{ fontSize: 12, color: c.t3, display: 'block', marginTop: 6 }}>{cd.sub}</Text>
          </div>
        ))}
      </Flex>

      <Flex align="center" gap={12} style={{ marginTop: 16 }}>
        <Text style={{ fontSize: 13, color: c.t2 }}>编制完整度</Text>
        <Progress percent={(row.done / row.total) * 100} size="small" style={{ width: 220, marginBottom: 0 }} />
        <Text style={{ fontSize: 12, color: c.t3 }}>
          {row.done}/3 · 最近更新 {row.lastAt || '—'}
        </Text>
      </Flex>

      <Divider orientation="left">该 BU 全部操作记录</Divider>
      <ActivityTable items={row.activities} c={c} />
    </div>
  );
}

/* v0.8：DemandPanel 已下线（原 budget-annual-demand-drawer / budget-demand-table /
 * budget-demand-versions 三个 testid 一并移除，见 docs/v0.8 §3.6「移除」项）。
 * ② 项目预算的全部查看 / 编辑 / 反馈费用 / 复核确认已收口到独立页 ProjectBudgetPage
 * （draft 状态机 S0–S5）；年度预算计划主表不再承载任何需求清单浮层。
 * 需求详情的深链入口由下方 DemandDetailPanel 承载（#/budget/annual/DM-* 直达）。 */

function DemandDetailPanel({ demandId, data, c, onNavigate }) {
  const demand = data.demands.find((d) => d.id === demandId);
  if (!demand) return <Blank text="未找到该需求" compact />;
  const relatedBrds = data.brds.filter((b) => b.relatedDemandId === demand.id);
  return (
    <div data-testid="budget-demand-drawer">
      <Button
        type="link"
        size="small"
        icon={<ArrowLeftOutlined />}
        onClick={() => onNavigate && onNavigate('budget', 'project', demand.dept)}
        style={{ paddingInline: 0, marginBottom: 8 }}
      >
        前往项目预算计划
      </Button>

      <TraceChain
        nodes={demandChainNodes(data, demand.id)}
        onDrill={(key) => {
          const t = drillTargetOf(key, { demandId: demand.id });
          if (t) onNavigate(t[0], t[1], t[2]);
        }}
      />

      {!demand.needBRD && (
        <Alert
          type="info"
          showIcon
          style={{ marginTop: 12 }}
          message="本需求沿用原编号，无需单独提报 BRD"
          description={<span style={{ fontSize: 12 }}>BRD 提报环节为空态，链路骨架保留以保证完整性。</span>}
        />
      )}

      <Descriptions size="small" bordered column={2} title="基本信息" style={{ marginTop: 16 }}>
        <Descriptions.Item label="需求标题" span={2}>
          {demand.title}
        </Descriptions.Item>
        <Descriptions.Item label="业务部门">
          {data.departments.find((d) => d.code === demand.dept)?.name}
        </Descriptions.Item>
        <Descriptions.Item label="承接系统">{demand.system}</Descriptions.Item>
        <Descriptions.Item label="优先级">{demand.priority}</Descriptions.Item>
        <Descriptions.Item label="实施窗口">{demand.window}</Descriptions.Item>
        <Descriptions.Item label="预估人天">{fmtNum(demand.estMD)}</Descriptions.Item>
        <Descriptions.Item label="预估金额">{fmtWan(demand.estAmount)} 万元</Descriptions.Item>
        <Descriptions.Item label="状态">{demand.status}</Descriptions.Item>
        <Descriptions.Item label="是否需提 BRD">{demand.needBRD ? '需提报' : '沿用原编号'}</Descriptions.Item>
      </Descriptions>

      <Divider orientation="left" style={{ marginTop: 20 }}>
        已派生 BRD（{relatedBrds.length}）
      </Divider>
      {relatedBrds.length ? (
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={relatedBrds}
          columns={[
            { title: 'BRD 编号', dataIndex: 'id', width: 150, render: (v) => <Text style={{ fontSize: 12, color: c.brand }}>{v}</Text> },
            { title: '标题', dataIndex: 'title', ellipsis: true },
            { title: '提报时间', dataIndex: 'submitDate', width: 108 },
            {
              title: '操作',
              key: 'op',
              width: 96,
              render: (_, r) => (
                <Button type="link" size="small" onClick={() => onNavigate('delivery', 'brd', r.id)}>
                  打开 BRD
                </Button>
              )
            }
          ]}
        />
      ) : (
        <Blank text="尚无 BRD 提报到该需求" compact />
      )}
    </div>
  );
}

/* v0.5：ProjectPanel（③ 总项目费用）已下线 ——
 * 「总项目费用」不再是独立编制项，它等于需求清单当前版本的费用合计，
 * v0.8 起相关口径、费用构成与差额提示全部收口到独立页 ProjectBudgetPage 与「预算消耗」视图。
 *
 * v1.1：OpsPanel（③ 系统运维预算右侧浮层）已下线 —— 改走独立《系统运维预算计划》页
 * （OpsBudgetPage，#/budget/opsplan/{deptCode}），主表「③」格与综合视图 ③ 卡直接跳页；
 * 连带移除 openAction / target / PlanActionModal 死代码（v1.2 后已无调用方）。 */

/* ================================================================== *
 * 「修正年度 BP」专用浮层（v1.0）
 *
 * 组件取舍：**新建专用浮层 BpUpdateModal**，不扩展 PlanActionModal
 *   （后者被 DEMAND / OPS 六个动作共用，扩展会让它们被迫接受无关键位与校验）。
 *
 * 结构（规避废弃 API / 避免 form.resetFields()）：
 *   外层 BpUpdateModal —— open=false 时整段不渲染（不依赖已废弃的 destroyOnClose）；
 *   内层 BpUpdateForm  —— 自带 Form.useForm()，以 key={deptCode} 挂载，天然重置。
 * maskClosable=false：无草稿态，误点遮罩 = 内容全丢，必须防误关。
 * ================================================================== */
function BpUpdateModal({ open, deptCode, deptName, owner, versions, c, msgApi, onClose }) {
  if (!open) return null;
  return (
    <BpUpdateForm
      key={deptCode}
      deptCode={deptCode}
      deptName={deptName}
      owner={owner}
      versions={versions}
      c={c}
      msgApi={msgApi}
      onClose={onClose}
    />
  );
}

function BpUpdateForm({ deptCode, deptName, owner, versions, c, msgApi, onClose }) {
  const { planAction } = useStore();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const hasHistory = versions.length > 0;
  // 版本号**只读预告**：由 calc.nextMinorVersion 计算，提交后由 store 再次确定（严禁前端自算）
  const nextVersion = nextMinorVersion(versions);
  const title = hasHistory ? `修正年度 BP（将生成 ${nextVersion}）` : '提交年度 BP（首版 V1.0）';
  const okText = hasHistory ? '提交更新' : '提交 BP';

  const handleFinish = (values) => {
    const docs = (values.docs || [])
      .filter((d) => d && ((d.name || '').trim() || (d.url || '').trim()))
      .map((d) => ({
        name: (d.name || '').trim() || (d.url || '').trim(),
        url: (d.url || '').trim(),
        kind: 'link'
      }));
    setSubmitting(true);
    planAction({
      deptCode,
      fy: PLAN_FY,
      stage: 'BP',
      action: '提交',
      note: values.changeNote,
      payload: {
        name: values.name,
        goals: values.goals,
        summary: values.summary || '',
        docs,
        changeNote: values.changeNote
      },
      actor: owner,
      role: '业务部门'
    });
    msgApi.success(`BP 已更新为 ${nextVersion}`);
    setSubmitting(false);
    onClose();
  };

  return (
    <Modal
      open
      title={title}
      okText={okText}
      cancelText="取消"
      width={640}
      maskClosable={false}
      confirmLoading={submitting}
      onCancel={onClose}
      onOk={() => form.submit()}
    >
      <div data-testid="budget-bp-update-modal">
        <Hint>
          一次性提交并生效、无草稿暂存，请一次填完再提交。执行角色：<strong>业务部门</strong> · 操作人：
          <strong>{owner}</strong>。
          <br />
          版本号由系统生成，提交后确定；本次将生成 <strong>{nextVersion}</strong>。
        </Hint>
        <Form
          form={form}
          layout="vertical"
          style={{ marginTop: 16 }}
          initialValues={{
            docs: [{ name: '', url: '' }],
            changeNote: hasHistory ? '' : '首次提交'
          }}
          onFinish={handleFinish}
        >
          <Form.Item
            name="name"
            label="BP 名称"
            rules={[{ required: true, message: '请填写 BP 名称' }, { max: 60, message: 'BP 名称不超过 60 字' }]}
          >
            <Input data-testid="budget-bp-modal-name" maxLength={60} showCount placeholder="如「FY2027 电商数字化规划」" />
          </Form.Item>

          <Form.Item
            name="goals"
            label="年度业务量化目标"
            extra="每行一条，如「GMV：同比 +18%」"
            rules={[
              { required: true, message: '请填写年度业务量化目标' },
              { max: 500, message: '年度业务量化目标不超过 500 字' }
            ]}
          >
            <Input.TextArea
              data-testid="budget-bp-modal-goals"
              rows={3}
              maxLength={500}
              placeholder={'每行一条，如「GMV：同比 +18%」'}
            />
          </Form.Item>

          <Form.Item
            name="summary"
            label="BP 内容核心摘要"
            extra="留空将由 AI 依据本版本内容自动生成摘要"
            rules={[{ max: 300, message: 'BP 内容核心摘要不超过 300 字' }]}
          >
            <Input.TextArea
              data-testid="budget-bp-modal-summary"
              rows={4}
              maxLength={300}
              placeholder="可留空，提交后由 AI 依据本版本内容自动生成摘要"
            />
          </Form.Item>

          <div style={{ fontSize: 14, color: c.t1, marginBottom: 8 }}>BP 文档链接</div>
          <Form.List name="docs">
            {(fields, { add, remove }) => (
              <div style={{ marginBottom: 16 }}>
                {fields.map((field, index) => (
                  <Flex key={field.key} gap={8} align="flex-start" style={{ marginBottom: 8 }}>
                    <Form.Item
                      name={[field.name, 'name']}
                      rules={[{ required: true, message: '请填写文档名称' }]}
                      style={{ flex: '1 1 auto', marginBottom: 0 }}
                    >
                      <Input data-testid={`budget-bp-modal-doc-${index}-name`} placeholder="文档名称" />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, 'url']}
                      rules={[
                        { required: true, message: '请填写文档链接' },
                        { type: 'url', message: '请输入合法的链接（含 http/https）' }
                      ]}
                      style={{ flex: '1 1 auto', marginBottom: 0 }}
                    >
                      <Input data-testid={`budget-bp-modal-doc-${index}-url`} placeholder="https://" />
                    </Form.Item>
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      aria-label="删除该文档"
                      disabled={fields.length === 1}
                      onClick={() => remove(field.name)}
                    />
                  </Flex>
                ))}
                <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add({ name: '', url: '' })}>
                  添加文档
                </Button>
                <div style={{ fontSize: 12, color: c.t3, marginTop: 6 }}>
                  至少 1 条；原型固定为链接形式（kind = link）。
                </div>
              </div>
            )}
          </Form.List>

          <Form.Item
            name="changeNote"
            label="本次修订说明"
            rules={[{ required: true, message: '请填写本次修订说明' }]}
          >
            <Input.TextArea data-testid="budget-bp-modal-note" rows={3} placeholder="说明本版相对上一版的变更" />
          </Form.Item>
        </Form>
      </div>
    </Modal>
  );
}

/* PlanActionModal 已随 OpsPanel 一并移除（v1.2 后 openAction 无调用方，死代码）。 */

/* ================================================================== *
 * ② 预算消耗（v0.7 重构）
 *
 * 两个楼层，同一套口径：
 *   楼层一《整体预算消耗情况》—— 整体 / 项目 / 运维 三个维度各自的「总包 + 消耗进度」；
 *   楼层二《部门预算消耗情况》—— 每个 BU 同样按三个维度给出「预算及消耗」。
 *
 * 三个维度的拆解一律取自 calc.consumptionBreakdown，本文件不自行累加 ——
 * 否则卡片与表格合计迟早会对不上。恒等式：
 *   整体预算 = 项目预算 + 运维预算；整体消耗 = 项目消耗 + 运维消耗。
 *
 * 行操作（v1.3 起只剩读）：
 *   · 查账 —— 明细交给账单模块（明细的唯一承载方）；本视图不提供任何预算改写入口。
 * ================================================================== */

/**
 * 楼层一 · 单卡（三张卡同构）。
 *
 * 版面自上而下：口径标签 + 档位 → 总包金额 → 消耗进度条 → 消耗数值与率 → 构成明细 → 脚注。
 * 进度条复用 PoolMeter：执行年呈现「已核销 / 已承诺 / 可用」三段；
 * 编制年没有实际核销，唯一可看的进度就是「已规划」的位置，故改为虚线标记。
 */
function OverviewCard({ c, testid, code, title, total, seg, executing, accent, caption, compose, footnote }) {
  const meterPool = {
    billed: seg.billed,
    committed: seg.committed,
    total: seg.budget,
    used: seg.used,
    planned: seg.planned
  };
  return (
    <div
      data-testid={testid}
      style={{
        background: c.bg1,
        border: `1px solid ${c.border}`,
        borderTop: `3px solid ${accent}`,
        borderRadius: c.radius,
        padding: '14px 16px',
        height: '100%'
      }}
    >
      <Flex align="flex-start" justify="space-between" gap={8}>
        <Text style={{ fontSize: 12, color: c.t3 }}>
          {code} {title}
        </Text>
        <PoolLevelTag level={seg.level} rate={seg.rate} />
      </Flex>

      <Flex align="baseline" gap={4} style={{ marginTop: 8 }}>
        <span
          style={{
            fontSize: 24,
            fontWeight: 500,
            color: c.t1,
            lineHeight: 1.2,
            fontVariantNumeric: 'tabular-nums'
          }}
        >
          {fmtWan(total)}
        </span>
        <span style={{ fontSize: 12, color: c.t3 }}>万元</span>
      </Flex>

      <div style={{ marginTop: 10 }}>
        <PoolMeter pool={meterPool} height={10} showLegend={false} showPlanned={!executing} />
      </div>

      <Flex align="baseline" justify="space-between" gap={8} style={{ marginTop: 8 }}>
        <Text style={{ fontSize: 12, color: c.t3 }}>{caption}</Text>
        <Text style={{ fontSize: 13, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
          {fmtWan(seg.used)} 万元 · {fmtPct(seg.rate, 1)}
        </Text>
      </Flex>

      <div style={{ marginTop: 6, fontSize: 12, color: c.t3, fontVariantNumeric: 'tabular-nums' }}>{compose}</div>
      <div style={{ marginTop: 6, fontSize: 12, color: c.t3 }}>{footnote}</div>
    </div>
  );
}

/**
 * 楼层二 · 单列合并格：一列同时承载「总预算金额」与「消耗百分比」。
 *
 * 三次收敛，同一条理由 —— 版面只留读数所必需的东西：
 *   v0.7   预算格 + 消耗格（消耗格里还带一根进度条）
 *   v0.7.1 去掉进度条，健康度改由消耗率数字着色承载
 *   v0.7.2 预算与消耗并成一列 —— 同一维度的两个数本来就要连起来读
 *          （「预算多少、吃掉多少」），中间隔着一列 108px 的空白没有理由
 *
 * 被移出版面的量（消耗金额、已核销 / 已承诺拆分、可用余额、占比）一律进单元格 `title`
 * 原生提示：零版面成本，且避免「精简」退化成「信息丢失」（沿用 v0.5.1 的做法）。
 */
function SegmentCell({ c, testid, seg, executing, title, strong }) {
  const lv = levelColor(c, seg.level);
  const n = strong ? 1 : 0;
  return (
    <Flex vertical gap={2} data-testid={testid} style={{ alignItems: 'flex-end' }} title={title}>
      <Flex align="baseline" gap={3} style={{ justifyContent: 'flex-end' }}>
        <span
          style={{
            fontSize: 14,
            fontWeight: strong ? 600 : 500,
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1.3
          }}
        >
          {fmtWan(seg.budget)}
        </span>
        <Text style={{ fontSize: 11, color: c.t3 }}>万元</Text>
      </Flex>
      <Flex align="baseline" gap={4} style={{ justifyContent: 'flex-end' }}>
        <Text style={{ fontSize: 11, color: c.t3 }}>{executing ? '已消耗' : '已规划'}</Text>
        <span
          data-testid={testid ? `${testid}-rate` : undefined}
          style={{
            fontSize: 13 - n,
            fontWeight: 600,
            lineHeight: 1.2,
            /* v1.6：13px 文字用 `textStrong`（AA 达标色）而非 `color`（实色）。
               实色是给填充用的：绿 #52c41a 仅 2.27:1、橙 #faad14 仅 1.90:1，
               antd 自带的 successText/warningText 也不过 3.46 / 2.87，全不达标。 */
            color: lv.textStrong,
            fontVariantNumeric: 'tabular-nums'
          }}
        >
          {fmtPct(seg.rate, 1)}
        </span>
      </Flex>
    </Flex>
  );
}

/**
 * 单元格原生提示的文案（被 v0.7.2 移出版面的那些量都放这里）。
 * 运维侧没有「承诺」中间态，单独成句，别混进「已核销 + 已承诺」的加法里误导。
 */
function segTip(dim, seg, executing) {
  const head = `预算 ${fmtWan(seg.budget)} 万元 · ${executing ? '已消耗' : '已规划'} ${fmtWan(seg.used)} 万元`;
  if (!executing) return `${head}（需求清单预估口径；运维只出年化预算，不作事前规划）`;
  const detail =
    dim === 'ops'
      ? `已核销 ${fmtWan(seg.billed)}（运维按月计费，无「承诺」中间态）`
      : `已核销 ${fmtWan(seg.billed)} + 已承诺 ${fmtWan(seg.committed)}（BRD 签收锁价、尚未出账）`;
  return `${head} · ${detail} · 可用 ${fmtWan(Math.max(0, seg.budget - seg.used))} 万元`;
}

export function ConsumeView({ fy, onNavigate }) {
  const c = useT();
  const { data } = useStore();
  const [f, setF] = useState({ dept: 'all', level: 'all', kw: '' });
  const through = CURRENT_MONTH;
  const executing = fy === 2026;

  /** 每个 BU 的消耗行 + 三段式拆解（拆解口径统一来自 calc，视图内不累加） */
  const allRows = useMemo(
    () =>
      data.departments.map((d) => {
        const row = consumptionUpTo(data, d.code, fy, through);
        return { ...row, bd: consumptionBreakdown(row, fy) };
      }),
    [data, fy, through]
  );

  /**
   * 楼层一：三个维度的合计。
   * 与楼层二各行同源（都是 allRows 上的求和），因此「卡片上的总包」与「表格合计行」恒等。
   */
  const overview = useMemo(() => {
    const agg = (k) => {
      const sumOf = (field) => allRows.reduce((s, r) => s + r.bd[k][field], 0);
      const budget = sumOf('budget');
      const used = sumOf('used');
      const rate = budget ? used / budget : 0;
      return {
        budget,
        used,
        rate,
        level: poolLevel(rate),
        available: budget - used,
        billed: sumOf('billed'),
        committed: sumOf('committed'),
        planned: sumOf('planned')
      };
    };
    return { overall: agg('overall'), project: agg('project'), ops: agg('ops') };
  }, [allRows]);

  const rows = useMemo(
    () =>
      allRows
        .filter((r) => {
          if (f.dept !== 'all' && r.deptCode !== f.dept) return false;
          if (f.level !== 'all' && r.bd.overall.level !== f.level) return false;
          if (f.kw && !`${r.deptName}${r.deptCode}`.includes(f.kw)) return false;
          return true;
        })
        .slice()
        .sort(
          (a, b) =>
            LEVEL_RANK[a.bd.overall.level] - LEVEL_RANK[b.bd.overall.level] ||
            b.bd.overall.rate - a.bd.overall.rate
        ),
    [allRows, f]
  );

  /**
   * 合计行 / 标题计数 / 告警区**一律基于 `rows`（筛选后）** —— v1.6 P0-4。
   *
   * 原实现三处都直接复用 `overview`（语义是"全量汇总"，算自 `allRows`）。后果：
   * 筛选「部门 = 零售运营」后表格只剩 1 行、FilterBar 显示"共 1 条"，
   * 合计行却仍是全公司 4440.0 万 / 56.6%，标题「透支 1 个 · 预警 0 个」与
   * Hint 告警同样按全量算 —— 两种语义（"全公司概况" vs "当前可见行合计"）混用一处，
   * 是可被直接指认的数据错误。
   *
   * 楼层一三张卡继续用 `overview`（那才是"全公司概况"的正确语义），
   * 两者不再互相顶替。
   */
  const tableSummary = useMemo(() => {
    const agg = (k) => {
      const sumOf = (field) => rows.reduce((s, r) => s + r.bd[k][field], 0);
      const budget = sumOf('budget');
      const used = sumOf('used');
      const rate = budget ? used / budget : 0;
      return {
        budget,
        used,
        rate,
        level: poolLevel(rate),
        available: budget - used,
        billed: sumOf('billed'),
        committed: sumOf('committed'),
        planned: sumOf('planned')
      };
    };
    return { overall: agg('overall'), project: agg('project'), ops: agg('ops') };
  }, [rows]);

  const overDepts = rows.filter((r) => r.bd.overall.level === 'over');
  const warnDepts = rows.filter((r) => r.bd.overall.level === 'warn');

  const shareOf = (v) => fmtPct(overview.overall.budget ? v / overview.overall.budget : 0, 1);

  const cards = [
    {
      key: 'overall',
      testid: 'budget-consume-card-overall',
      code: '①',
      title: '各部门数字化整体预算总包',
      accent: c.brand,
      seg: overview.overall,
      caption: executing ? '截至当月已消耗' : '编制期已规划',
      compose: executing
        ? `已核销 ${fmtWan(overview.overall.billed)} · 已承诺 ${fmtWan(overview.overall.committed)} · 可用 ${fmtWan(
            Math.max(0, overview.overall.available)
          )} 万元`
        : `执行期未开始；需求清单已规划 ${fmtWan(overview.overall.planned)} 万元`,
      footnote: `覆盖 ${allRows.length} 个业务部门 · 整体预算 = 项目预算 + 运维预算`
    },
    {
      key: 'project',
      testid: 'budget-consume-card-project',
      code: '②',
      title: '项目预算总包',
      accent: c.warning,
      seg: overview.project,
      caption: executing ? '截至当月已消耗' : '编制期已规划',
      compose: executing
        ? `已核销 ${fmtWan(overview.project.billed)} · 已承诺 ${fmtWan(overview.project.committed)} · 可用 ${fmtWan(
            Math.max(0, overview.project.budget - overview.project.used)
          )} 万元`
        : `需求清单预估费用口径；已规划 ${fmtWan(overview.project.planned)} 万元`,
      footnote: `占整体总包 ${shareOf(overview.project.budget)} · ${
        executing ? '已承诺 = BRD 签收锁价、尚未出账的交付费用' : '运维侧不做「已规划」影子占用'
      }`
    },
    {
      key: 'ops',
      testid: 'budget-consume-card-ops',
      code: '③',
      title: '运维预算总包',
      accent: c.info,
      seg: overview.ops,
      caption: executing ? '截至当月已消耗' : '编制期已规划',
      compose: executing
        ? `已核销 ${fmtWan(overview.ops.billed)} · 无「承诺」中间态 · 可用 ${fmtWan(
            Math.max(0, overview.ops.budget - overview.ops.used)
          )} 万元`
        : '执行期未开始：运维按月计费，编制期只出年化预算，不作事前规划',
      footnote: `占整体总包 ${shareOf(overview.ops.budget)} · 由计费模型（订单量 / 会员规模 / 固定年费）年化锁定，不可人工调整`
    }
  ];

  const fields = [
    { key: 'dept', label: '部门', type: 'select', options: deptOptions(data) },
    {
      key: 'level',
      label: '消耗档位',
      type: 'select',
      options: [
        { value: 'all', label: '全部档位' },
        { value: 'ok', label: '正常' },
        { value: 'watch', label: '关注' },
        { value: 'warn', label: '预警' },
        { value: 'over', label: '已透支' }
      ]
    },
    { key: 'kw', label: '关键词', type: 'keyword', placeholder: '搜索部门名 / 部门代码' }
  ];

  /**
   * 三个维度各占一列（v0.7.2 起不再拆「预算 / 消耗」两子列），
   * 由同一构造器产出 —— 列宽与版式必然一致。
   */
  const SEGMENT_DIM_TITLE = { overall: '整体预算及消耗', project: '项目预算及消耗', ops: '运维预算及消耗' };
  /* v1.6 P1-12：消耗页三维度列加 sorter —— 默认排序（档位优先 + 消耗率降序）
     写死在 dataSource 上，用户想「按金额排」就只能自己比。sorter 只提供**手动**排序入口，
     不改默认视图顺序。
     比较器注意（v1.4 教训）：`levelRank` 相同的行必须给出**全序**，
     末段用消耗率降序 + 部门代码兜底，避免相等键导致次序不稳定。 */
  const segmentColumn = (dim) => ({
    title: SEGMENT_DIM_TITLE[dim],
    key: `${dim}Seg`,
    width: 132,
    align: 'right',
    sorter: (a, b) => {
      const sa = a.bd[dim];
      const sb = b.bd[dim];
      const rateDiff = (sb.used || 0) / (sb.budget || 1) - (sa.used || 0) / (sa.budget || 1);
      if (Math.abs(rateDiff) > 1e-9) return rateDiff;
      const budgetDiff = (sb.budget || 0) - (sa.budget || 0);
      if (Math.abs(budgetDiff) > 1e-9) return budgetDiff;
      return String(a.deptCode).localeCompare(String(b.deptCode));
    },
    render: (_, r) => (
      <SegmentCell
        c={c}
        testid={`budget-consume-seg-${dim}-${r.deptCode}`}
        seg={r.bd[dim]}
        executing={executing}
        title={segTip(dim, r.bd[dim], executing)}
      />
    )
  });

  const columns = [
    {
      title: '业务部门',
      dataIndex: 'deptName',
      width: 116,
      fixed: 'left',
      sorter: (a, b) => String(a.deptName || '').localeCompare(String(b.deptName || ''), 'zh-Hans-CN'),
      render: (v, r) => (
        <Flex vertical gap={2}>
          <Text style={{ fontSize: 13, fontWeight: 500 }}>{v}</Text>
          <Text style={{ fontSize: 11, color: c.t3 }}>{r.deptCode}</Text>
        </Flex>
      )
    },
    segmentColumn('overall'),
    segmentColumn('project'),
    segmentColumn('ops'),
    {
      title: '操作',
      key: 'op',
      width: 76,
      fixed: 'right',
      render: (_, r) => (
        <Tooltip title={`查看 ${r.deptName} 的全部预算消耗明细（由账单模块承载）`}>
          <Button
            type="link"
            size="small"
            data-testid={`budget-consume-check-${r.deptCode}`}
            /* v1.4.3：查账落到《部门账单详情页》**独立页**（非浮层），
             * 参数是**部门代码** —— 该页展示该部门全部费用（四楼层结构），
             * 不再定位到某一张账单，故无需推算账期。 */
            onClick={() => onNavigate('billing', 'dept', r.deptCode)}
          >
            查账
          </Button>
        </Tooltip>
      )
    }
  ];

  return (
    <div>
      <PageHead
        title="预算消耗"
        desc="按「整体 / 项目 / 运维」三个维度呈现预算总包与消耗进度。口径：整体 = 项目 + 运维；执行年度的消耗 = 已核销 + 已承诺（已承诺全部来自项目侧 BRD 签收锁价），编制年度执行期未开始、改以「已规划」呈现。本视图只读：行内「查账」进入账单模块查看逐笔明细；预算调整在《项目预算计划》页进行。"
        extra={
          <Text style={{ fontSize: 12, color: c.t3 }}>
            截止当月 {through} · {FY_LABEL[fy]}
          </Text>
        }
      />

      {/* ============ 楼层一：整体预算消耗情况 ============ */}
      <div data-testid="budget-consume-overview" style={{ marginBottom: 16 }}>
        <BlockTitle
          extra={
            <Text style={{ fontSize: 12, color: c.t3 }}>
              整体 = 项目 + 运维 · 三个维度共用同一套口径（{FY_LABEL[fy]}）
            </Text>
          }
        >
          整体预算消耗情况
        </BlockTitle>
        <Row gutter={[12, 12]}>
          {cards.map((cd) => (
            <Col key={cd.key} xs={24} lg={8}>
              <OverviewCard
                c={c}
                testid={cd.testid}
                code={cd.code}
                title={cd.title}
                total={cd.seg.budget}
                seg={cd.seg}
                executing={executing}
                accent={cd.accent}
                caption={cd.caption}
                compose={cd.compose}
                footnote={cd.footnote}
              />
            </Col>
          ))}
        </Row>
      </div>

      {overDepts.length > 0 || warnDepts.length > 0 ? (
        <Hint>
          <Flex align="center" gap={8} wrap>
            <span style={{ fontWeight: 500, color: c.t1 }}>需要关注的部门：</span>
            {overDepts.map((d) => (
              <Tag key={d.deptCode} color="error" style={{ marginInlineEnd: 0 }}>
                {d.deptName} 已透支 {fmtWan(d.bd.overall.available < 0 ? -d.bd.overall.available : 0)} 万元（
                {fmtPct(d.bd.overall.rate, 1)}）
              </Tag>
            ))}
            {warnDepts.map((d) => (
              <Tag key={d.deptCode} color="warning" style={{ marginInlineEnd: 0 }}>
                {d.deptName} 消耗 {fmtPct(d.bd.overall.rate, 1)}
              </Tag>
            ))}
            <span style={{ color: c.t3 }}>
              依据当前策略「弹性透支 + 年末调节」，透支不阻断提报，但会在次年预算编制中强制压降。
            </span>
          </Flex>
        </Hint>
      ) : null}

      {/* ============ 楼层二：部门预算消耗情况 ============ */}
      <div data-testid="budget-consume-section-dept" style={{ marginTop: 16 }}>
        <BlockTitle
          extra={
            <Text style={{ fontSize: 12, color: c.t3 }}>
              透支 {overDepts.length} 个 · 预警 {warnDepts.length} 个 · 置顶排序
            </Text>
          }
        >
          部门预算消耗情况
        </BlockTitle>

        <FilterBar
          fields={fields}
          value={f}
          onChange={setF}
          resultCount={rows.length}
          onReset={() => setF({ dept: 'all', level: 'all', kw: '' })}
          fyLabel={FY_LABEL[fy]}
        />

        <Card data-testid="budget-consume-table" styles={{ body: { padding: 16 } }}>
          {rows.length ? (
            <Table
              size="small"
              rowKey="deptCode"
              columns={columns}
              dataSource={rows}
              pagination={false}
              scroll={{ x: 588 }}
              summary={() => (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0}>
                    <Text strong>合计</Text>
                  </Table.Summary.Cell>
                  {['overall', 'project', 'ops'].map((dim, i) => (
                    <Table.Summary.Cell key={dim} index={i + 1} align="right">
                      <SegmentCell
                        c={c}
                        testid={`budget-consume-summary-${dim}`}
                        seg={tableSummary[dim]}
                        executing={executing}
                        title={segTip(dim, tableSummary[dim], executing)}
                        strong
                      />
                    </Table.Summary.Cell>
                  ))}
                  <Table.Summary.Cell index={4} />
                </Table.Summary.Row>
              )}
            />
          ) : (
            <Blank text="该条件下暂无数据 · [重置筛选]" compact />
          )}
          <div data-testid="budget-consume-caption" style={{ marginTop: 8, fontSize: 12, color: c.t3 }}>
            <Text strong style={{ fontSize: 12, color: c.t2 }}>
              合计行为当前筛选结果
              {rows.length === allRows.length ? `（全部 ${allRows.length} 个部门）` : `（${rows.length} / ${allRows.length} 个部门）`}
            </Text>
            {' · '}
            {executing
              ? `消耗口径：截至 ${through}，已核销 = 已确认核销账单（项目 / 运维分列），已承诺 = 已签收未出账（全部计入项目侧）；${POOL_CAPTION}。`
              : '编制年度口径：执行期未开始，两个维度都没有实际消耗 —— 项目侧以「已规划」（需求清单预估）呈现，运维侧只出年化预算、不作事前规划。'}
            {' '}
            三个维度的分母不同（各自的总包），消耗率不可相加；恒等式：整体 = 项目 + 运维。
            每格上行为该维度<strong>总预算金额</strong>，下行为<strong>消耗百分比</strong>（按该维度自身的档位取色：
            绿 正常 · 蓝 关注 · 橙 预警 · 红 已透支）—— 因此「整体正常、某个维度已经被击穿」直接看数字颜色即可，
            不必再单列状态；消耗金额 = 总预算 × 消耗率，不再单独占列，
            <strong>鼠标悬停单元格</strong>可看消耗金额 / 已核销 / 已承诺 / 可用余额的完整拆分。
            点击「查账」进入账单模块查看逐笔消耗明细；本视图为只读，预算调整在《项目预算计划》页进行。
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ================================================================== *
 * 模块壳
 * ================================================================== */
export default function BudgetModule({ view = 'annual', param, tail, sub2, onNavigate }) {
  const { globalFy } = useStore();
  const [msgApi, holder] = message.useMessage();
  const fy = globalFy;
  const go = (v, p) => onNavigate && onNavigate('budget', v, p);

  return (
    <div>
      {holder}
      {view === 'annual' && <AnnualPlanView param={param} msgApi={msgApi} onNavigate={onNavigate} />}
      {view === 'bpplan' && <BpPlanPage deptCode={param} onNavigate={onNavigate} />}
      {/* v0.8.2：第五段 sub2 = 进行中版本内的项目编号（项目编辑独立页） */}
      {view === 'project' && (
        <ProjectBudgetPage deptCode={param} tail={tail} demandId={sub2} onNavigate={onNavigate} />
      )}
      {view === 'opsplan' && <OpsBudgetPage deptCode={param} tail={tail} onNavigate={onNavigate} />}
      {view === 'consume' && <ConsumeView fy={fy} onNavigate={onNavigate} />}
    </div>
  );
}
