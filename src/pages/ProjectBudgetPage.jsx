/**
 * 《项目预算计划》下钻页（v0.8，**v0.8.2 列结构重构**）
 *
 * 页面作用域 = 一个业务部门 × 一个编制年（PLAN_FY = 2027，与《年度预算计划》同源）。
 * 三个路由共用本组件：
 *   · `#/budget/project/{deptCode}`                 → 基础（正式版本只读）视图
 *   · `#/budget/project/{deptCode}/new`（tail）      → 进行中版本视图（只读清单 + 状态流转）
 *   · `#/budget/project/{deptCode}/new/{demandId}`   → **项目编辑独立页**（sub2 = demandId）
 *
 * v0.8.2 变更（详见 docs/v0.8.2-project-page-columns-revision.md）：
 *   ① 列表 7 列 → **9 列**：新增「项目描述」「ROI」「交付时间」；
 *      「业务价值预估」+「业务预估」合并为金额列「预估业务价值」（v0.8.2 撤回 v0.8 §4.5 方案 B）。
 *   ② **行内编辑全部移除** —— 列表一律只读，编辑走「点行 → 详情浮层 → 编辑 → 独立编辑页」。
 *   ③ 详情浮层**删除顶部溯源链**（TraceChain），只保留「基本信息 + BRD 列表」并加编辑入口。
 *
 * 版式契约（设计规范 §7 下钻页壳）：页头 → 概览 2 卡 → 进行中入口/状态条 → 项目列表 → 统一流水。
 * 硬约束：① 颜色一律取 `useT()`，零硬编码色值；② 字重仅 400 / 500；
 *         ③ 取数一律经 `calc.demandProjectPage`，页面内不重复累加（合计与列同源）；
 *         ④ 列宽与 `scroll.x` **由同一处常量派生**（v0.8 漏算 Card padding 与竖向滚动条的教训）。
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Card, Table, Tag, Flex, Typography, Button, Modal, Input, InputNumber, Select, Tooltip,
  Row, Col, Drawer, Descriptions, Divider, Alert, Badge, message
} from 'antd';
import { ArrowLeftOutlined, FileTextOutlined, PlusOutlined } from '@ant-design/icons';
import { useT } from '../theme.js';
import { useStore, calc } from '../store.jsx';
import { PageHead, Metric, BlockTitle, Blank } from '../components/common.jsx';

const { Text } = Typography;
const { fmtWan, demandProjectPage, roiOf } = calc;

/** 编制年：与 BudgetModule.PLAN_FY 同值 */
const PLAN_FY = 2027;

const PRIORITY_TONE = { P0: 'error', P1: 'warning', P2: 'default', P3: 'default' };

/** 状态 → antd Tag 语义色（与主表 STATUS_TONE 口径一致：已确认 success，进行中类 warning） */
const PROJECT_STATUS_TONE = {
  未提交: 'default',
  草稿: 'warning',
  编辑中: 'warning',
  待评估费用: 'warning',
  待反馈费用: 'warning',
  待复核确认: 'warning',
  已确认: 'success',
  已废弃: 'default'
};

/** 进行中版本状态 → 展示文案（与 v0.8 §6.2 的徽标文案同构） */
const INPROGRESS_LABEL = {
  草稿: '编辑中（草稿）',
  待反馈费用: '待 Digital 反馈费用',
  待复核确认: '待业务复核确认'
};

function StatusTag({ value }) {
  return (
    <Tag color={PROJECT_STATUS_TONE[value]} style={{ marginInlineEnd: 0 }}>
      {value}
    </Tag>
  );
}

/* ================================================================== *
 * 列宽表 —— **列宽与 scroll.x 的唯一来源**（v0.8.2 修正）
 *
 * v0.8 的教训：列宽之和（1000）与 scroll.x 各写一处，且核算时**漏算了 Card body
 * padding 与竖向滚动条**，导致 1366 屏实际可用宽比假设少 47px 而横滚。
 *
 * v0.8.2 核算口径（与 docs/v0.8.2 §3 一致）：
 *   有效可用宽 = 视口 − Sider(展开 224 / 折叠 64) − Content 左右 padding(48)
 *             − Card body padding(32) − 竖向滚动条(15)
 *   ⇒ 1366 屏 ≈ 1047px ／ 1280 屏 ≈ 961px ／ 1440 屏 ≈ 1121px（Sider 折叠三者 +160）
 *
 * 目标：**1366 屏不横滚** ⇒ LIST_SCROLL_X ≤ 1047；1280 屏允许轻微横滚；
 *       Sider 折叠后 1280（961+160=1121）也不滚。
 * 下列 9 列宽度之和 = 1040 ≤ 1047 ✅，且 scroll.x 直接由 COL_WIDTHS 求和派生，
 * 不存在「两处漂移」。
 * ================================================================== */
const COL_WIDTHS = {
  id: 124,        // 项目编号   DM-2027-0001（13 字符 @12px）
  title: 190,     // 项目名称   ellipsis
  desc: 190,      // 项目描述   ellipsis + 原生 title
  priority: 64,   // 优先级     Tag
  value: 112,     // 预估业务价值（万元）右对齐
  fee: 122,       // Digital预算费用（万元）右对齐
  roi: 76,        // ROI        百分比右对齐
  window: 88,     // 交付时间   实施窗口（按季度）
  op: 74          // 操作       固定右侧
};
/** 9 列宽度之和 —— 同时用作 `scroll.x`，与 COL_WIDTHS 同源 */
const LIST_SCROLL_X = Object.values(COL_WIDTHS).reduce((s, w) => s + w, 0); // = 1040

/** ROI 展示：唯一口径来自 calc.roiOf；不可计算一律「—」（不显示 0、不显示 ∞） */
const fmtRoi = (d) => {
  const r = roiOf(d);
  return r == null ? '—' : `${(r * 100).toFixed(1)}%`;
};

/** v0.8.3：第 5 段的「新建条目」占位键（下划线开头，真实需求编号均为 `DM-` 前缀，永不冲突） */
const NEW_ITEM_KEY = '_new';

export default function ProjectBudgetPage({ deptCode, tail, demandId, onNavigate }) {
  const c = useT();
  const {
    data, startDraft, saveDraft, submitDraft, evaluateDraft, confirmDraft, rejectDraft, discardDraft, withdrawDraft
  } = useStore();
  const [msgApi, holder] = message.useMessage();
  const isNew = tail === 'new';
  const dept = data.departments.find((d) => d.code === deptCode) || null;

  const pg = useMemo(
    () => (dept ? demandProjectPage(data, deptCode, PLAN_FY) : null),
    [data, deptCode, dept]
  );
  const draft = pg ? pg.draft : null;

  /** /new 的编辑缓冲：不在 onChange 里直接写 store，避免每次击键都留痕 */
  const [items, setItems] = useState([]);
  const [detail, setDetail] = useState(null);
  const [noteModal, setNoteModal] = useState(null); // 'save' | 'submit' | null
  const [noteText, setNoteText] = useState('');
  const redirectedRef = useRef(false);

  useEffect(() => {
    setItems(draft ? draft.items.map((it) => ({ ...it })) : []);
  }, [draft]);

  /* v0.8 §6.4：/new 被打开但不存在进行中版本 → 立即 replace 回基础路由（不白屏）。
   * 用 setTimeout(0) 让「进入编辑」的 startDraft 先落库，避免同帧竞态被误判为空态。
   *
   * v1.6（P0-8）：先尝试**自动建草稿**再建草稿失败才兜底弹回。
   * 原实现把「是否有进行中版本」的责任全推给调用方，而调用方有两条
   * （enterEdit 有 startDraft、详情浮层 onEdit 没有）⇒ 无草稿部门点编辑必被弹回。
   * 改成在**路由层**兜住之后，任何入口（含直接改 hash / 书签 / 外部深链）
   * 都能进入编辑，不再依赖每个调用方记得调 startDraft。 */
  useEffect(() => {
    if (!isNew) {
      redirectedRef.current = false;
      return undefined;
    }
    if (!pg || pg.hasInProgress || redirectedRef.current) return undefined;
    const t = setTimeout(() => {
      if (redirectedRef.current) return;
      // 该部门尚无进行中版本：直接建 S2 草稿，让编辑页成为合法落点
      startDraft(deptCode, PLAN_FY);
      // 建草稿后 store 会驱动 pg.hasInProgress 变 true；若下一帧仍未变
      // （极端异常），再兜底弹回基础路由，绝不白屏。
      setTimeout(() => {
        if (redirectedRef.current) return;
        redirectedRef.current = true;
        msgApi.info('无法为该部门创建进行中版本，已返回正式版本视图');
        window.location.replace(`#/budget/project/${deptCode}`);
      }, 0);
    }, 0);
    return () => clearTimeout(t);
  }, [isNew, pg, deptCode, msgApi]);

  /* 非法 / 缺失部门代码兜底：不白屏，给返回引导 */
  if (!dept) {
    return (
      <div data-testid="budget-project-page">
        {holder}
        <PageHead
          title="项目预算计划"
          desc="未指定有效的业务部门，请从《年度预算计划》主表进入。"
          extra={
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              data-testid="budget-project-back"
              onClick={() => onNavigate && onNavigate('budget', 'annual')}
            >
              返回年度预算计划
            </Button>
          }
        />
        <Card styles={{ body: { padding: 16 } }}>
          <Blank text="未找到该业务部门 · 请返回《年度预算计划》后从「② 项目预算」格重新进入" />
        </Card>
      </div>
    );
  }

  const s = pg.inProgressStatus; // /new 状态：草稿 | 待反馈费用 | 待复核确认
  const rows = isNew ? items : pg.demands;
  /** v0.8.3：仅 S2 草稿态可新增条目（S3 已提交、S4 只读） */
  const canAddItem = isNew && s === '草稿';

  const goBack = () => onNavigate && onNavigate('budget', 'annual');
  const goNew = () => onNavigate && onNavigate('budget', 'project', deptCode, 'new');
  /** 打开某条项目的编辑独立页（v0.8.2 第 5 段路由） */
  const goEditDemand = (id) => onNavigate && onNavigate('budget', 'project', deptCode, 'new', id);
  /** v0.8.3：进入「新建条目」模式（第五段用 `_new` 占位，避免与真实 DM- 编号冲突） */
  const goAddItem = () => onNavigate && onNavigate('budget', 'project', deptCode, 'new', NEW_ITEM_KEY);

  /** 基础视图「编辑」：无进行中版本时先建 S2 草稿，再进入 /new */
  const enterEdit = () => {
    if (!pg.hasInProgress) startDraft(deptCode, PLAN_FY);
    goNew();
  };
  const editLabel = !pg.hasInProgress ? '编辑' : s === '草稿' ? '继续编辑' : '查看进行中版本';

  const bpActor = pg.bpOwner || '郑亦凡';
  const dgActor = pg.digitalOwner || '顾晓东';

  /* ---- v0.8.2：项目编辑独立页（`/new/{demandId}`）提前返回 ----
   * 无进行中版本时，上面的空态 effect 已 replace 回基础路由，因此这里 draft 必为真；
   * 仍保留一次防御性判空，避免任何时序下白屏。 */
  if (demandId) {
    return (
      <DemandEditPage
        dept={dept}
        deptCode={deptCode}
        demandId={demandId}
        draft={draft}
        status={s}
        owner={bpActor}
        holder={holder}
        msgApi={msgApi}
        onSave={saveDraft}
        onBack={goNew}
      />
    );
  }

  const doSave = (note) => {
    saveDraft(deptCode, PLAN_FY, items, note, bpActor, '业务部门');
    msgApi.success('草稿已保存');
  };
  const doSubmit = (note) => {
    submitDraft(deptCode, PLAN_FY, note || '提交更新清单', bpActor, '业务部门');
    msgApi.success('已提交更新，等待 Digital 反馈费用');
  };
  const doEvaluate = () =>
    Modal.confirm({
      title: '确认反馈费用？',
      content: 'Digital 逐条反馈项目预算费用后转由业务部门复核确认；未填写的条目按业务预估（万元）计入。',
      okText: '反馈费用',
      cancelText: '取消',
      onOk: () => {
        evaluateDraft(deptCode, PLAN_FY, items, dgActor, 'Digital');
        msgApi.success('已反馈费用，等待业务复核确认');
      }
    });
  const doConfirm = () =>
    Modal.confirm({
      title: '复核确认并定稿？',
      content: '确认后清单得号成为正式版本，进行中版本不再保留，页面回到正式版本视图。',
      okText: '复核确认',
      cancelText: '取消',
      onOk: () => {
        confirmDraft(deptCode, PLAN_FY, bpActor, '业务部门');
        msgApi.success('复核确认通过，清单已得号');
      }
    });
  const doReject = () =>
    Modal.confirm({
      title: '退回 Digital 重新反馈费用？',
      content: '业务不可修改已提交的清单内容，仅退回 Digital 重新反馈费用。',
      okText: '退回',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        rejectDraft(deptCode, PLAN_FY, '复核不通过，退回 Digital 重新反馈费用', bpActor, '业务部门');
        msgApi.success('已退回 Digital 重新反馈费用');
      }
    });
  /** v1.6 新增：撤回提交（S3 → S2），把清单打回可编辑状态 */
  const doWithdraw = () =>
    Modal.confirm({
      title: '撤回本次提交？',
      content:
        '撤回后清单回到可编辑状态，Digital 尚未开始反馈费用。若 Digital 已反馈费用，请改用「退回 Digital」。',
      okText: '撤回修改',
      cancelText: '取消',
      onOk: () => {
        withdrawDraft(deptCode, PLAN_FY, '业务撤回提交，清单回到可编辑状态', bpActor, '业务部门');
        msgApi.success('已撤回提交，清单回到可编辑状态');
      }
    });
  const doDiscard = () =>
    Modal.confirm({
      title: '废弃本次新版本？',
      content: s === '待复核确认'
        ? '该版本**已提交待确认**，废弃后已提交的全部内容将不可恢复、需整份重录。如只是清单有误，请改用「退回 Digital」。'
        : '草稿与进行中版本将一并作废，页面回到正式版本视图；如需重报可重新点「编辑」。',
      okText: '废弃',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        discardDraft(deptCode, PLAN_FY, '废弃本次新版本', bpActor, '业务部门');
        msgApi.success('新版本已废弃');
      }
    });

  const openNote = (kind) => {
    setNoteText('');
    setNoteModal(kind);
  };
  const submitNote = () => {
    if (noteModal === 'save') doSave(noteText);
    else if (noteModal === 'submit') doSubmit(noteText);
    setNoteModal(null);
  };

  /* ---- 列表列定义（v0.8.2：9 列 · 全只读 · 宽度取 COL_WIDTHS，与 scroll.x 同源） ----
   * v0.8.2 移除全部行内编辑：单元格内不再出现 Input / InputNumber / Select。
   * 唯一的编辑入口是「点行 → 详情浮层 → 编辑 → 独立编辑页」。 */
  const columns = [
    {
      title: '项目编号',
      dataIndex: 'id',
      width: COL_WIDTHS.id,
      render: (v) => (
        <Text style={{ fontSize: 12, color: c.brand }}>
          {String(v).startsWith('TMP-') ? '待分配' : v}
        </Text>
      )
    },
    {
      title: '项目名称',
      dataIndex: 'title',
      width: COL_WIDTHS.title,
      ellipsis: true,
      render: (v) => (
        <span style={{ fontSize: 13, color: c.t1 }} title={v || ''}>
          {v || '—'}
        </span>
      )
    },
    {
      /* ① 项目描述：占列展示，ellipsis 截断 + 原生 title 承载全文（不完整展示） */
      title: '项目描述',
      dataIndex: 'desc',
      width: COL_WIDTHS.desc,
      ellipsis: true,
      render: (v) => (
        <span style={{ fontSize: 13, color: c.t2 }} title={v || ''}>
          {v || '—'}
        </span>
      )
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      width: COL_WIDTHS.priority,
      align: 'center',
      render: (v) => (
        <Tag color={PRIORITY_TONE[v]} style={{ marginInlineEnd: 0 }}>
          {v || '—'}
        </Tag>
      )
    },
    {
      /* ② 预估业务价值：v0.8.2 起为**金额**（元），列表按万元展示；表头 Tooltip 说明口径 */
      title: (
        <Tooltip title="预估业务价值（万元）：业务侧预估的项目收益金额，口径为「生意增量贡献」。亦为 ROI 的分子。">
          <span>预估业务价值</span>
        </Tooltip>
      ),
      dataIndex: 'bizValueAmount',
      width: COL_WIDTHS.value,
      align: 'right',
      render: (v) => (
        <span style={{ fontVariantNumeric: 'tabular-nums', color: c.t2 }}>
          {v != null ? fmtWan(v) : '—'}
        </span>
      )
    },
    {
      title: 'Digital预算费用',
      dataIndex: 'evalAmount',
      width: COL_WIDTHS.fee,
      align: 'right',
      render: (v) => (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v != null ? fmtWan(v) : '—'}</span>
      )
    },
    {
      /* ② ROI：预估业务价值 ÷ Digital预算费用，百分比 1 位小数；不可计算显示「—」 */
      title: (
        <Tooltip title="ROI = 预估业务价值 ÷ Digital预算费用。Digital 预算费用尚未核定（或为 0）时显示「—」。">
          <span>ROI</span>
        </Tooltip>
      ),
      key: 'roi',
      width: COL_WIDTHS.roi,
      align: 'right',
      render: (_, r) => (
        <span
          data-testid={`project-roi-${r.id}`}
          style={{ fontVariantNumeric: 'tabular-nums', color: roiOf(r) == null ? c.t3 : c.t1 }}
        >
          {fmtRoi(r)}
        </span>
      )
    },
    {
      /* ③ 交付时间：数据源为既有 demands.window（实施窗口，按季度），不新增字段 */
      title: (
        <Tooltip title="交付时间：口径为实施窗口（按季度），如 Q1-Q2、Q3-Q4。">
          <span>交付时间</span>
        </Tooltip>
      ),
      dataIndex: 'window',
      width: COL_WIDTHS.window,
      render: (v) => <span style={{ fontSize: 13, color: c.t2 }}>{v || '—'}</span>
    },
    {
      title: '操作',
      key: 'op',
      width: COL_WIDTHS.op,
      align: 'right',
      fixed: 'right',
      render: (_, r) => (
        <Button type="link" size="small" onClick={() => setDetail(r)}>
          详情
        </Button>
      )
    }
  ];

  /* 合计口径：基础视图取 calc 的 demandAmount（不页面累加）；/new 取本地编辑行之和（与列同源） */
  const listTotal = isNew
    ? rows.reduce((acc, r) => acc + (r.evalAmount != null ? r.evalAmount : r.estAmount), 0)
    : pg.demandAmount;

  /* 合计口径（v0.8.1 评审 P1-2 去重）：
   *   · 基础视图 —— 合计只在概览「项目总费用」卡出现一次，列表 footer 不再重复合计；
   *   · /new 视图 —— 概览卡取「正式版本」口径（不含本次编辑），footer 才补一行
   *     「本次编辑暂计」，其 X 与列表列内同源（本地编辑行之和）。 */
  const summary = () => (
    <Table.Summary.Row>
      <Table.Summary.Cell index={0} colSpan={isNew ? 5 : 7}>
        <Text style={{ fontWeight: 500 }}>{`共 ${rows.length} 条项目`}</Text>
      </Table.Summary.Cell>
      {isNew ? (
        <Table.Summary.Cell index={5} colSpan={2} align="right">
          <Text style={{ fontWeight: 500 }}>{`本次编辑暂计 ${fmtWan(listTotal)} 万元`}</Text>
        </Table.Summary.Cell>
      ) : null}
    </Table.Summary.Row>
  );

  /* ---- 统一流水列（6 列） ---- */
  const timelineCols = [
    {
      title: '时间',
      dataIndex: 'at',
      width: 140,
      render: (v) => (
        <span style={{ fontSize: 12, color: c.t2, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
      )
    },
    {
      title: '版本号',
      dataIndex: 'version',
      width: 88,
      render: (v) => <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{v || '—'}</span>
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (v) => (v ? <StatusTag value={v} /> : '—')
    },
    {
      title: '动作',
      dataIndex: 'action',
      width: 130,
      render: (v) => <span style={{ fontSize: 13 }}>{v || '—'}</span>
    },
    {
      title: '操作人（角色）',
      key: 'actor',
      width: 150,
      render: (_, r) => <span style={{ fontSize: 13 }}>{`${r.actor}（${r.role}）`}</span>
    },
    {
      title: '变更说明',
      dataIndex: 'note',
      ellipsis: true,
      render: (v) => <span style={{ fontSize: 13, color: c.t2 }}>{v || '—'}</span>
    }
  ];

  const actionButtons = [];
  if (s === '草稿') {
    actionButtons.push(
      <Button key="save" data-testid="budget-project-save" onClick={() => openNote('save')}>
        保存草稿
      </Button>
    );
    actionButtons.push(
      <Button key="submit" type="primary" data-testid="budget-project-submit" onClick={() => openNote('submit')}>
        提交更新
      </Button>
    );
  }
  if (s === '待反馈费用') {
    actionButtons.push(
      <Button key="eval" type="primary" data-testid="budget-project-evaluate" onClick={doEvaluate}>
        Digital 反馈费用
      </Button>
    );
    /* v1.6 P0-7：补 S3→S2 回退边。
       原状态机只有 S2→S3 单向，提交后清单全部只读，发现写错只能「废弃新版本」——
       而该动作会连带删掉已提交的 version 记录，等于整份清单重录。
       「填错了」是编制场景最高频的正常事件，必须给轻量出口。 */
    actionButtons.push(
      <Button key="withdraw" data-testid="budget-project-withdraw" onClick={doWithdraw}>
        撤回修改
      </Button>
    );
  }
  if (s === '待复核确认') {
    actionButtons.push(
      <Button key="confirm" type="primary" data-testid="budget-project-confirm" onClick={doConfirm}>
        业务复核确认
      </Button>
    );
    actionButtons.push(
      <Button key="reject" danger data-testid="budget-project-reject" onClick={doReject}>
        退回 Digital
      </Button>
    );
  }
  actionButtons.push(
    <Button key="discard" danger data-testid="budget-project-discard" onClick={doDiscard}>
      废弃新版本
    </Button>
  );

  return (
    <div data-testid="budget-project-page">
      {holder}

      {/* ============ 楼层 0 · 页头 ============ */}
      <PageHead
        title={`${pg.deptName} · 项目预算计划`}
        desc="项目清单以整份为一个版本：业务编辑 → Digital 反馈费用 → 业务复核确认后得号。进行中的新版本不并入下方列表。"
        extra={
          <Flex gap={8} align="center">
            <Button type="text" icon={<ArrowLeftOutlined />} data-testid="budget-project-back" onClick={goBack}>
              返回年度预算计划
            </Button>
            {!isNew ? (
              <Button type="primary" icon={<FileTextOutlined />} data-testid="budget-project-edit" onClick={enterEdit}>
                {editLabel}
              </Button>
            ) : null}
          </Flex>
        }
      />

      {/* ============ 楼层 1 · 概览（2 卡） ============ */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }} data-testid="budget-project-overview">
        <Col xs={24} md={12}>
          <Metric
            label="当前版本"
            value={pg.confirmedVersionLabel || '未提交'}
            unit=""
            tone={pg.status === '已确认' ? 'success' : 'warning'}
            sub={
              pg.confirmedVersion
                ? `${pg.status} · 确认于 ${(pg.confirmedVersion.confirmedAt || pg.confirmedVersion.submittedAt).slice(0, 10)}`
                : pg.versions[0]
                ? `${pg.status} · 提交于 ${pg.versions[0].submittedAt.slice(0, 10)}`
                : '暂无版本'
            }
          />
        </Col>
        <Col xs={24} md={12}>
          <Metric
            label="项目总费用"
            value={fmtWan(pg.demandAmount)}
            tone="warning"
            sub={`${pg.demandCount} 条 · 已核定 ${pg.demandCount - pg.demandEvalPending} 条${
              isNew ? '（正式版本，不含本次编辑）' : ''
            }`}
          />
        </Col>
      </Row>

      {/* ============ 楼层 2 · 进行中入口 / 状态条 ============ */}
      {!isNew && pg.hasInProgress ? (
        <div data-testid="budget-project-inprogress" style={{ marginBottom: 12 }}>
          <Button onClick={goNew} style={{ paddingInline: 12, height: 'auto' }}>
            <Badge
              status="warning"
              text={
                <span style={{ fontSize: 13 }}>
                  {`有进行中的新版本 · ${INPROGRESS_LABEL[pg.inProgressStatus] || pg.inProgressStatus}`}
                </span>
              }
            />
          </Button>
        </div>
      ) : null}

      {isNew ? (
        <div data-testid="budget-project-inprogress" style={{ marginBottom: 12 }}>
          <Alert
            type="warning"
            showIcon
            message={
              <Flex align="center" gap={8} wrap>
                <span style={{ fontSize: 13 }}>{`进行中的新版本 · ${INPROGRESS_LABEL[s] || s}`}</span>
                {draft && draft.submittedAt ? (
                  <span style={{ fontSize: 12, color: c.t2 }}>{`提交于 ${draft.submittedAt}`}</span>
                ) : null}
              </Flex>
            }
            action={<Flex gap={8} wrap>{actionButtons}</Flex>}
          />
        </div>
      ) : null}

      {/* ============ 楼层 3 · 项目列表 ============ */}
      <Card data-testid="budget-project-table" styles={{ body: { padding: 16 } }} style={{ marginBottom: 16 }}>
        {/* v0.8.3：「新增项目」入口恢复，但**仅在 S2 草稿态渲染** ——
         *  S3 已提交（清单不可再改，否则提交后的版本会被追改）、S4 只读。
         * 这是 v0.8 状态机 S0 → S2 的唯一入口：FY2027 尚无项目的部门（如 D-HR）
         * 草稿 items 为空，若无此入口则「点编辑后无事可做」，永远走不到 S2。 */}
        <BlockTitle
          extra={
            canAddItem ? (
              <Button size="small" icon={<PlusOutlined />} data-testid="budget-project-add" onClick={goAddItem}>
                新增项目
              </Button>
            ) : null
          }
        >
          项目列表
        </BlockTitle>
        {!isNew && pg.hasInProgress ? (
          <div style={{ marginBottom: 8, fontSize: 12, color: c.t3 }}>
            下方为当前生效清单；进行中的新版本内容请在入口内查看。点击任意一行可查看项目详情。
          </div>
        ) : null}
        {rows.length ? (
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            scroll={{ x: LIST_SCROLL_X }}
            dataSource={rows}
            columns={columns}
            summary={summary}
            /* ① 点任意一行 → 打开该条项目的详情浮层（整行可点） */
            onRow={(r) => ({
              onClick: () => setDetail(r),
              style: { cursor: 'pointer' }
            })}
            rowClassName={(r) => (detail && detail.id === r.id ? 'ant-table-row-selected' : '')}
          />
        ) : (
          <Blank text="该部门本年度暂无项目，点击右上角「编辑」新增" />
        )}
      </Card>

      {/* ============ 楼层 4 · 统一流水 ============ */}
      <Card styles={{ body: { padding: 16 } }}>
        <BlockTitle
          extra={
            pg.versions.length ? (
              <span style={{ fontSize: 12, color: c.t3, fontVariantNumeric: 'tabular-nums' }}>
                {`共 ${pg.versions.length} 个版本`}
              </span>
            ) : null
          }
        >
          版本与操作流水
        </BlockTitle>
        {pg.timeline.length ? (
          <Table
            data-testid="budget-project-timeline"
            size="small"
            rowKey={(r) => r._k}
            pagination={false}
            dataSource={pg.timeline.map((e, i) => ({ ...e, _k: `${e.at}|${e.action}|${i}` }))}
            columns={timelineCols}
          />
        ) : (
          <div data-testid="budget-project-timeline">
            <Blank text="暂无版本与操作记录" />
          </div>
        )}
      </Card>

      {/* ============ 项目详情浮层 ============ */}
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        width={720}
        title={detail ? `项目详情 · ${detail.id}` : ''}
      >
        {detail ? (
          <ProjectDetailDrawer
            demand={detail}
            data={data}
            c={c}
          onEdit={(id) => {
            setDetail(null);
            /* v1.6 修复（P0-8，流程死路）：详情浮层的「编辑」此前直接改 hash，
               缺 `startDraft` 前置 —— 而 `enterEdit`(:187) 与本页基础视图的「编辑」都有。
               两条进入 `/new` 的路径前置条件不一致，导致无进行中版本的部门
               （D-RETAIL / D-SVC 等，mock 的 DRAFT_SEEDS 未覆盖）点「编辑」后
               地址栏变 `.../new/DM-…` 又被 :133 的 effect 立即 replace 回基础路由，
               全程只闪一句「当前无进行中版本」—— **用户的编辑意图被静默丢弃**，
               且界面无任何"要先点右上角编辑"的提示。
               现在与 enterEdit 同构：先确保草稿存在，再进编辑页。 */
            if (!pg.hasInProgress) startDraft(deptCode, PLAN_FY);
            goEditDemand(id);
          }}
            onNavigate={onNavigate}
          />
        ) : null}
      </Drawer>

      {/* ============ 保存草稿 / 提交更新 的变更说明浮层 ============ */}
      <Modal
        open={!!noteModal}
        title={noteModal === 'submit' ? '提交更新' : '保存草稿'}
        onCancel={() => setNoteModal(null)}
        onOk={submitNote}
        okText={noteModal === 'submit' ? '提交更新' : '保存草稿'}
        cancelText="取消"
        maskClosable={false}
        width={480}
      >
        <div style={{ marginBottom: 8, fontSize: 12, color: c.t2 }}>
          {noteModal === 'submit'
            ? '提交后进入「待 Digital 反馈费用」，本条说明将记入版本流水。'
            : '仅保存当前编辑内容，不影响正式版本；本条说明将记入操作流水。'}
        </div>
        <Input.TextArea
          rows={3}
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="本次变更说明（可空）"
        />
      </Modal>
    </div>
  );
}

/* ================================================================== *
 * 项目详情浮层内容（v0.8.2）
 *
 * 增删项（相对 v0.8）：
 *   · **删除** 顶部 TraceChain 六节点溯源链（用户修正⑤）——该链条表达的是
 *     「需求 → BRD → 交付 → 账单」全生命周期，与"项目预算条目"这一编制口径
 *     不同层；放在此处会让人误以为点开预算条目就能跳到交付与账单。
 *   · **新增** 右上角「编辑」按钮 → 项目编辑独立页（`/new/{demandId}`）。
 *   · **新增/改名** 基本信息字段：项目描述、预估业务价值（金额）、ROI、交付时间。
 * 其余（基本信息 Descriptions + 已派生 BRD 列表）保留。
 * ================================================================== */
function ProjectDetailDrawer({ demand, data, c, onEdit, onNavigate }) {
  const relatedBrds = data.brds.filter((b) => b.relatedDemandId === demand.id);

  return (
    <div data-testid="budget-project-detail-drawer">
      <Flex justify="flex-end" style={{ marginBottom: 12 }}>
        <Button
          type="primary"
          size="small"
          data-testid="budget-project-detail-edit"
          onClick={() => onEdit(demand.id)}
        >
          编辑
        </Button>
      </Flex>

      <Descriptions size="small" bordered column={2} title="基本信息">
        <Descriptions.Item label="项目编号">{demand.id}</Descriptions.Item>
        <Descriptions.Item label="优先级">{demand.priority || '—'}</Descriptions.Item>
        <Descriptions.Item label="项目名称" span={2}>
          {demand.title || '—'}
        </Descriptions.Item>
        <Descriptions.Item label="项目描述" span={2}>
          {demand.desc || '—'}
        </Descriptions.Item>
        <Descriptions.Item label="交付时间">{demand.window || '—'}</Descriptions.Item>
        <Descriptions.Item label="承接系统">{demand.system || '—'}</Descriptions.Item>
        <Descriptions.Item label="预估业务价值">
          {demand.bizValueAmount != null ? `${fmtWan(demand.bizValueAmount)} 万元` : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Digital预算费用">
          {demand.evalAmount != null ? `${fmtWan(demand.evalAmount)} 万元` : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="ROI" span={2}>
          {fmtRoi(demand)}
        </Descriptions.Item>
        <Descriptions.Item label="业务预估" span={2}>
          {fmtWan(demand.estAmount)} 万元
        </Descriptions.Item>
      </Descriptions>

      <Divider orientation="left" style={{ marginTop: 20 }}>
        {`已派生 BRD（${relatedBrds.length}）`}
      </Divider>
      {relatedBrds.length ? (
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={relatedBrds}
          columns={[
            {
              title: 'BRD 编号',
              dataIndex: 'id',
              width: 150,
              render: (v) => <Text style={{ fontSize: 12, color: c.brand }}>{v}</Text>
            },
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
        <Blank text="尚无 BRD 提报到该项目" compact />
      )}
    </div>
  );
}

/* ================================================================== *
 * 项目编辑独立页（v0.8.2）—— `#/budget/project/{deptCode}/new/{demandId}`
 *
 * 形态：**独立页面**（不是浮层、不是行内编辑）。由详情浮层的「编辑」按钮进入，
 * 自带返回按钮回 `#/budget/project/{deptCode}/new`。
 *
 * 4 个字段：项目名称 / 项目描述 / 预估业务价值 / Digital预算费用。
 * 金额字段以**万元**录入（与列表展示同量纲，避免让用户数 7 位数），落库 ×10000 换算为「元」。
 *
 * 可编辑性随**进行中版本状态**变化（状态一律取自 calc.demandProjectPage 的
 * `inProgressStatus`，本页**不自行判断**）：
 *
 *   | 进行中版本状态   | 项目名称 | 项目描述 | 预估业务价值 | Digital预算费用 |
 *   |------------------|----------|----------|--------------|-----------------|
 *   | S2 草稿          | 可填     | 可填     | 可填         | 可填            |
 *   | S3 待反馈费用    | 只读     | 只读     | 只读         | 可填            |
 *   | S4 待复核确认    | 只读     | 只读     | 只读         | 只读（仅查看）  |
 *
 * 「保存」只调用 `saveDraft` 把改动写回该部门草稿的对应条目，**不改变版本状态**
 * （状态流转仍由 `/new` 页状态条上的动作按钮驱动）。
 * 只读字段在保存时**不写入**，保证 S3/S4 下不可能通过本页改动业务侧字段。
 * ================================================================== */
const EDIT_PERMISSION = {
  草稿: {
    name: true, desc: true, value: true, fee: true, priority: true, window: true,
    hint: 'S2 草稿 · 业务侧可填写全部 6 项'
  },
  待反馈费用: {
    name: false, desc: false, value: false, fee: true, priority: false, window: false,
    hint: 'S3 待 Digital 反馈费用 · 清单内容已提交，仅「Digital预算费用」可填，其余 5 项只读'
  },
  待复核确认: {
    name: false, desc: false, value: false, fee: false, priority: false, window: false,
    hint: 'S4 待业务复核确认 · 全部只读，本页仅供查看'
  }
};

function DemandEditPage({ dept, deptCode, demandId, draft, status, owner, holder, msgApi, onSave, onBack }) {
  const c = useT();
  const items = (draft && draft.items) || [];
  /* v0.8.3：`/new/_new` = 新建条目模式（不是既有条目） */
  const isNewItem = demandId === NEW_ITEM_KEY;
  const item = isNewItem ? null : items.find((it) => it.id === demandId) || null;
  const perm = EDIT_PERMISSION[status] || EDIT_PERMISSION['待复核确认'];
  /* 新建条目只在 S2 可用：S3 已提交、S4 只读，入口按钮本就不渲染；
   * 手输 URL 时也不得白屏（下方单独给只读兜底页）。 */
  const canCreate = isNewItem && status === '草稿';

  /* 金额以万元为录入单位（与列表同量纲），null 表示未填 */
  const toWan = (yuan) => (yuan == null ? null : yuan / 10000);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [value, setValue] = useState(null);
  const [fee, setFee] = useState(null);
  const [priority, setPriority] = useState('P2');
  const [window_, setWindow] = useState('');

  /* 进入页面 / 草稿刷新时按草稿条目重置表单（不把用户未保存的输入写进草稿）。
   * 新建模式：项目名称 / 描述 / 金额 / 交付时间 均留空，优先级默认 P2。 */
  useEffect(() => {
    setName(item ? item.title || '' : '');
    setDesc(item ? item.desc || '' : '');
    setValue(item ? toWan(item.bizValueAmount) : null);
    setFee(item ? toWan(item.evalAmount) : null);
    setPriority(item && item.priority ? item.priority : 'P2');
    setWindow(item ? item.window || '' : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demandId, draft]);

  const backButton = (
    <Button type="text" icon={<ArrowLeftOutlined />} data-testid="budget-project-edit-back" onClick={onBack}>
      返回进行中版本
    </Button>
  );

  const doSaveEdit = () => {
    if (isNewItem) {
      /* 新建条目：追加到草稿 items 末尾。id 用 TMP-{fy}-{序号}，
       * 与列表「startsWith('TMP-') ? '待分配'」的渲染逻辑对齐（正式编号由得号时分配）。 */
      const seq = items.filter((it) => String(it.id).startsWith('TMP-')).length + 1;
      const newId = `TMP-${PLAN_FY}-${String(seq).padStart(4, '0')}`;
      const newItem = {
        id: newId,
        fy: PLAN_FY,
        dept: deptCode,
        title: name,
        system: '',
        priority,
        estMD: 0,
        window: window_,
        status: '待评估',
        needBRD: true,
        estAmount: 0,
        evalAmount: fee == null ? null : Math.round(fee * 10000),
        desc,
        bizValueAmount: value == null ? null : Math.round(value * 10000)
      };
      onSave(deptCode, PLAN_FY, [...items, newItem], `新增项目 ${newId}`, owner, '业务部门');
      msgApi.success(`已新增项目 ${newId}，保存后请提交更新`);
      onBack();
      return;
    }
    const nextItems = items.map((it) => {
      if (it.id !== demandId) return it;
      /* 只读字段不参与写回 —— S3/S4 下无法经本页改动业务侧字段 */
      const patch = {};
      if (perm.name) patch.title = name;
      if (perm.desc) patch.desc = desc;
      if (perm.value) patch.bizValueAmount = value == null ? null : Math.round(value * 10000);
      if (perm.fee) patch.evalAmount = fee == null ? null : Math.round(fee * 10000);
      if (perm.priority) patch.priority = priority;
      if (perm.window) patch.window = window_;
      return { ...it, ...patch };
    });
    onSave(deptCode, PLAN_FY, nextItems, `编辑项目 ${demandId}`, owner, '业务部门');
    msgApi.success('已保存到进行中版本，状态未变更');
    onBack();
  };

  /* v0.8.3：手输 `/new/_new` 但当前不是 S2 草稿态 → 不白屏，明确说明为何不能新增 */
  if (isNewItem && !canCreate) {
    return (
      <div data-testid="budget-project-edit-page">
        {holder}
        <PageHead
          title="新增项目"
          desc={`${dept ? dept.name : deptCode} · 进行中版本（${status || '—'}）`}
          extra={backButton}
        />
        <Card styles={{ body: { padding: 16 } }}>
          <Blank text={`当前进行中版本为「${status || '—'}」，仅「草稿」状态可新增项目条目 · 请返回列表后提交或废弃该版本`} />
        </Card>
      </div>
    );
  }

  /* 防御性兜底：条目不在草稿中（理论上已被上游空态 effect 拦下）——不白屏，给返回引导。
   * 注意 `&& !isNewItem`：新建模式下 item 本就为 null（尚无条目），不能落到这里。 */
  if (!item && !isNewItem) {
    return (
      <div data-testid="budget-project-edit-page">
        {holder}
        <PageHead
          title="编辑项目"
          desc="未在当前部门的进行中版本中找到该项目。"
          extra={backButton}
        />
        <Card styles={{ body: { padding: 16 } }}>
          <Blank text={`未找到项目 ${demandId} · 请返回进行中版本列表后重新选择`} />
        </Card>
      </div>
    );
  }

  const fieldLabel = (t, editable) => (
    <Flex align="center" gap={6} style={{ marginBottom: 4 }}>
      <Text style={{ fontSize: 12, color: c.t3 }}>{t}</Text>
      {!editable ? <Text style={{ fontSize: 12, color: c.t4 }}>只读</Text> : null}
    </Flex>
  );

  return (
    <div data-testid="budget-project-edit-page">
      {holder}
      <PageHead
        title={isNewItem ? '新增项目' : `编辑项目 · ${demandId}`}
        desc={`${dept ? dept.name : deptCode} · 进行中版本（${status || '—'}）。${
          isNewItem
            ? '保存后条目追加到草稿清单末尾，编号暂为「待分配」，提交更新并得号时分配正式编号。'
            : '保存只写回草稿条目，不改变版本状态。'
        }`}
        extra={backButton}
      />

      <Alert
        type={perm.fee || perm.name ? 'info' : 'warning'}
        showIcon
        style={{ marginBottom: 16 }}
        message={perm.hint}
      />

      <Card styles={{ body: { padding: 16 } }} style={{ marginBottom: 16 }}>
        <Flex vertical gap={14}>
          <div>
            {fieldLabel('项目名称', perm.name)}
            <Input
              data-testid="budget-project-edit-name"
              size="small"
              value={name}
              disabled={!perm.name}
              placeholder={perm.name ? '请输入项目名称' : '当前状态下不可修改'}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            {fieldLabel('项目描述', perm.desc)}
            <Input.TextArea
              data-testid="budget-project-edit-desc"
              size="small"
              rows={3}
              value={desc}
              disabled={!perm.desc}
              placeholder={perm.desc ? '简要说明项目要解决的问题与范围' : '当前状态下不可修改'}
              onChange={(e) => setDesc(e.target.value)}
            />
          </div>

          {/* v0.8.3 新增：优先级 —— 列表有此列，新建/编辑时必须能填，否则新条目该列永久空白 */}
          <div>
            {fieldLabel('优先级', perm.priority)}
            <Select
              data-testid="budget-project-edit-priority"
              size="small"
              style={{ width: 160 }}
              value={priority}
              disabled={!perm.priority}
              placeholder={perm.priority ? '请选择优先级' : '当前状态下不可修改'}
              options={['P0', 'P1', 'P2'].map((x) => ({ value: x, label: x }))}
              onChange={(nv) => setPriority(nv)}
            />
          </div>

          {/* v0.8.3 新增：交付时间（实施窗口，按季度）—— 同上 */}
          <div>
            {fieldLabel('交付时间', perm.window)}
            <Input
              data-testid="budget-project-edit-window"
              size="small"
              style={{ width: 200 }}
              value={window_}
              disabled={!perm.window}
              placeholder={perm.window ? '如 Q1-Q2 / Q3-Q4' : '当前状态下不可修改'}
              onChange={(e) => setWindow(e.target.value)}
            />
          </div>

          <div>
            {fieldLabel('预估业务价值（万元）', perm.value)}
            <InputNumber
              data-testid="budget-project-edit-value"
              size="small"
              min={0}
              step={10}
              precision={1}
              style={{ width: 200 }}
              value={value}
              disabled={!perm.value}
              placeholder={perm.value ? '业务预估的项目收益金额' : '当前状态下不可修改'}
              onChange={(n) => setValue(n == null ? null : n)}
            />
          </div>

          <div>
            {fieldLabel('Digital预算费用（万元）', perm.fee)}
            <InputNumber
              data-testid="budget-project-edit-fee"
              size="small"
              min={0}
              step={0.5}
              precision={1}
              style={{ width: 200 }}
              value={fee}
              disabled={!perm.fee}
              placeholder={perm.fee ? 'Digital 逐条核定金额' : '当前状态下不可修改'}
              onChange={(n) => setFee(n == null ? null : n)}
            />
          </div>

          <Text style={{ fontSize: 12, color: c.t3 }}>
            {`当前录入口径下的 ROI：${
              fmtRoi({
                bizValueAmount: value == null ? null : Math.round(value * 10000),
                evalAmount: fee == null ? null : Math.round(fee * 10000)
              })
            }`}
          </Text>

          <Flex gap={8}>
            <Button
              type="primary"
              data-testid="budget-project-edit-save"
              disabled={!perm.name && !perm.fee}
              onClick={doSaveEdit}
            >
              保存
            </Button>
            <Button onClick={onBack}>取消</Button>
          </Flex>
        </Flex>
      </Card>
    </div>
  );
}
