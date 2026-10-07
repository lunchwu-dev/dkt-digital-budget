/**
 * 《系统运维预算计划》下钻页（v1.1）——《项目预算计划》（v0.8）的兄弟页，形态对齐。
 *
 * 页面作用域 = 一个业务部门 × 一个编制年（PLAN_FY = 2027，与 BudgetModule 同源）。
 * 两个路由共用本组件：
 *   · `#/budget/opsplan/{deptCode}`            → 基础（正式版本只读）视图
 *   · `#/budget/opsplan/{deptCode}/new`（tail='new'）→ 进行中版本视图（编辑 / 查看）
 *
 * 版式契约（设计规范 §3 / §7 / §8）：页头 → 概览 3 卡 → 进行中入口/状态条 → 系统明细 → 统一流水 + 版本明细浮层。
 * 业务口径（brief §5）：Digital 编制提交 → 业务复核确认后生效；整表为一个版本；
 * 得号在「业务复核确认」时发生（Q4），唯一写回点 = confirmOpsDraft。
 *
 * 硬约束：① 颜色一律取 `useT()`，零硬编码色值；② 字重仅 400 / 500；
 *         ③ 取数一律经 `calc.opsPlanPage`（items=只读页用 / draftItems=仅 /new 用），
 *            合计由同一批 items 原始数值求和后再格式化，页面内不重复累加；
 *         ④ antd 5.29：Drawer 禁用 destroyOnClose（已废弃），浮层不写销毁属性。
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Card, Table, Tag, Flex, Typography, Button, Modal, Input, InputNumber, Select,
  Row, Col, Drawer, Descriptions, Alert, Badge, message
} from 'antd';
import { ArrowLeftOutlined, PlusOutlined, DeleteOutlined, FileTextOutlined } from '@ant-design/icons';
import { useT } from '../theme.js';
import { useStore, calc } from '../store.jsx';
import { PageHead, Metric, BlockTitle, Blank } from '../components/common.jsx';

const { Text } = Typography;
const { fmtWan, fmtYuan, opsPlanPage } = calc;

/** 编制年：与 BudgetModule.PLAN_FY 同值 */
const PLAN_FY = 2027;

const BILLING_MODE_LABEL = { order: '按订单量', member: '按会员规模', fixed: '固定年费' };
/** 单位随值：单价 / 用量的单位逐行随计费方式变化，无法进表头（设计规范 §4.4 / C1 裁决） */
const BILLING_UNIT = { order: '元/单', member: '元/千人/月', fixed: '元/年' };
const USAGE_UNIT = { order: '单/年', member: '千人·月/年', fixed: '份' };
/** 校验位数上限（brief §4.5 / 设计规范 §8.3）：单价 order 2 / member 1 / fixed 0；用量 order·member 1 / fixed 2 */
const RATE_DIGITS = { order: 2, member: 1, fixed: 0 };
const USAGE_DIGITS = { order: 1, member: 1, fixed: 2 };

/** OPS 状态 → antd Tag 语义色（与主表 STATUS_TONE 口径一致） */
const OPS_STATUS_TONE = {
  未启动: 'default',
  编制中: 'warning',
  待业务确认: 'warning',
  已确认: 'success',
  已废弃: 'default'
};

/** 进行中版本状态 → 展示文案 */
const INPROGRESS_LABEL = {
  编制中: '编辑中（草稿）',
  待业务确认: '待业务复核确认'
};

function StatusTag({ value }) {
  return (
    <Tag color={OPS_STATUS_TONE[value] || 'default'} style={{ marginInlineEnd: 0 }}>
      {value}
    </Tag>
  );
}

const roundTo = (v, digits) => {
  const f = Math.pow(10, digits);
  return Math.round(Number(v) * f) / f;
};
const decCount = (v) => {
  const s = String(v == null ? '' : v);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
};

/** 行内即时校验（brief §4.5）：单价 >0 且位数合规；用量 order/member ≥0 至多 1 位、fixed >0 至多 2 位 */
function validateItem(it) {
  const rate = Number(it.rate);
  const usage = Number(it.usage);
  if (!Number.isFinite(rate) || rate <= 0) return false;
  if (decCount(rate) > (RATE_DIGITS[it.billing] != null ? RATE_DIGITS[it.billing] : 2)) return false;
  if (!Number.isFinite(usage)) return false;
  if (it.billing === 'fixed') {
    if (usage <= 0) return false;
    if (decCount(usage) > 2) return false;
  } else {
    if (usage < 0) return false;
    if (decCount(usage) > 1) return false;
  }
  return true;
}

export default function OpsBudgetPage({ deptCode, tail, onNavigate }) {
  const c = useT();
  const {
    data, startOpsDraft, saveOpsDraft, submitOpsDraft, confirmOpsDraft, rejectOpsDraft, discardOpsDraft
  } = useStore();
  const [msgApi, holder] = message.useMessage();
  const isNew = tail === 'new';
  const dept = data.departments.find((d) => d.code === deptCode) || null;

  const pg = useMemo(
    () => (dept ? opsPlanPage(data, deptCode, PLAN_FY) : null),
    [data, deptCode, dept]
  );
  const draft = pg ? pg.draft : null;

  /** /new 的编辑缓冲：不在 onChange 里直接写 store，避免每次击键都留痕（照抄 v0.8 纪律） */
  const [items, setItems] = useState([]);
  const [detail, setDetail] = useState(null); // 版本明细浮层：opsTimeline 事件上的 _snapshot
  const [noteModal, setNoteModal] = useState(null); // 'save' | 'submit' | null
  const [noteText, setNoteText] = useState('');
  const redirectedRef = useRef(false);

  useEffect(() => {
    setItems(draft ? draft.items.map((it) => ({ ...it })) : []);
  }, [draft]);

  /* v0.8 §6.4 同款兜底：/new 被打开但不存在进行中版本 → 立即 replace 回基础路由（不白屏）。
   * 用 setTimeout(0) 让「编制预估 / 修订」的 startOpsDraft 先落库，避免同帧竞态被误判为空态。 */
  useEffect(() => {
    if (!isNew) {
      redirectedRef.current = false;
      return undefined;
    }
    if (!pg || pg.hasInProgress || redirectedRef.current) return undefined;
    const t = setTimeout(() => {
      if (redirectedRef.current) return;
      redirectedRef.current = true;
      msgApi.info('当前无进行中版本，已返回正式版本视图');
      window.location.replace(`#/budget/opsplan/${deptCode}`);
    }, 0);
    return () => clearTimeout(t);
  }, [isNew, pg, deptCode, msgApi]);

  /* 非法 / 缺失部门代码兜底：不白屏，给返回引导 */
  if (!dept) {
    return (
      <div data-testid="budget-ops-plan-page">
        {holder}
        <PageHead
          title="系统运维预算计划"
          desc="未指定有效的业务部门，请从《年度预算计划》主表进入。"
          extra={
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              data-testid="budget-ops-back"
              onClick={() => onNavigate && onNavigate('budget', 'annual')}
            >
              返回年度预算计划
            </Button>
          }
        />
        <Card styles={{ body: { padding: 16 } }}>
          <Blank text="未找到该业务部门 · 请返回《年度预算计划》后从「③ 系统运维预算」格重新进入" />
        </Card>
      </div>
    );
  }

  const goBack = () => onNavigate && onNavigate('budget', 'annual');
  const goNew = () => onNavigate && onNavigate('budget', 'opsplan', deptCode, 'new');
  /** 基础视图「编制预估 / 修订」：无进行中版本时先建草稿（首版字面量固化），再进入 /new */
  const enterEdit = () => {
    if (!pg.hasInProgress) startOpsDraft(deptCode, PLAN_FY);
    goNew();
  };

  const s = pg.inProgressStatus; // /new 状态：编制中 | 待业务确认
  const editing = isNew && s === '编制中';
  const dgActor = pg.digitalOwner || '顾晓东';
  const bizActor = pg.bizOwner || '业务负责人';

  /* ---- 编辑缓冲操作（仅 S1 编制中 · Digital 可增删改） ---- */
  const patchItem = (sysId, patch) =>
    setItems((prev) =>
      prev.map((it) => {
        if (it.sysId !== sysId) return it;
        const next = { ...it, ...patch };
        // 年度总费用恒由 rate × usage 推导，不可编辑（brief §4.5）
        next.amount = Math.round(Number(next.rate || 0) * Number(next.usage || 0));
        return next;
      })
    );
  const addRow = (sys) =>
    setItems((prev) => [
      ...prev,
      { sysId: sys.id, name: sys.name, line: sys.line || '', billing: sys.billing, rate: sys.rate, usage: 1, amount: Math.round(sys.rate * 1) }
    ]);
  const removeRow = (sysId) => setItems((prev) => prev.filter((it) => it.sysId !== sysId));

  const invalidCount = editing ? items.filter((it) => !validateItem(it)).length : 0;

  const doSave = (note) => {
    saveOpsDraft(deptCode, PLAN_FY, { items, note, actor: dgActor, role: 'Digital' });
    msgApi.success('草稿已保存');
  };
  const doSubmit = (note) => {
    submitOpsDraft(deptCode, PLAN_FY, { note: note || '提交运维预算，待业务复核确认', actor: dgActor, role: 'Digital' });
    msgApi.success('已提交预算，等待业务复核确认');
  };
  const doConfirm = () =>
    Modal.confirm({
      title: '复核确认并定稿？',
      content: '确认后本版清单整体写回成为正式版本并得号，进行中的新版本不再保留，页面回到正式版本视图。',
      okText: '复核确认',
      cancelText: '取消',
      onOk: () => {
        confirmOpsDraft(deptCode, PLAN_FY, { note: '复核确认通过', actor: bizActor, role: '业务部门' });
        msgApi.success('复核确认通过，运维预算已得号');
      }
    });
  const doReject = () =>
    Modal.confirm({
      title: '退回 Digital 重新编制？',
      content: '业务不修改已提交的清单内容，仅退回 Digital 重新编制后再提交。',
      okText: '退回补充',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        rejectOpsDraft(deptCode, PLAN_FY, { note: '复核不通过，退回 Digital 重新编制', actor: bizActor, role: '业务部门' });
        msgApi.success('已退回 Digital 重新编制');
      }
    });
  const doDiscard = () =>
    Modal.confirm({
      title: '废弃本次新版本？',
      content: '草稿与进行中版本将一并作废，页面回到正式版本视图；如需重报可重新点「编制预估 / 修订」。',
      okText: '废弃',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        const actor = s === '待业务确认' ? bizActor : dgActor;
        const role = s === '待业务确认' ? '业务部门' : 'Digital';
        discardOpsDraft(deptCode, PLAN_FY, { note: '废弃本次新版本', actor, role });
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

  /* ---- 展示格式化（数值列全部 tabular-nums） ---- */
  const fmtUsage = (v) => Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 1 });
  const fmtFixedUsage = (v) => Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
  const rateTextOf = (r) => (r.billing === 'fixed' ? `${fmtYuan(r.rate)} / 年` : `¥${r.rate} ${BILLING_UNIT[r.billing]}`);
  const usageTitleOf = (r) =>
    r.billing === 'fixed'
      ? `BU 份额 ${Math.round((Number(r.usage) / (pg.opsGrowth || 1)) * 100)}% × 业务量增长系数 ${pg.opsGrowth} = ${r.usage} 份`
      : undefined;

  const nameCell = (r) => (
    <Flex vertical gap={2}>
      <span style={{ fontSize: 13, color: c.t1 }} title={r.name}>
        {r.name}
      </span>
      <span style={{ fontSize: 11, color: c.t3 }}>
        {r.sysId} · {r.line || '—'}
      </span>
    </Flex>
  );
  const amountCell = (r) => (
    <span
      data-testid={`budget-ops-amount-${r.sysId}`}
      style={{ fontWeight: 500, color: c.t1, fontVariantNumeric: 'tabular-nums' }}
    >
      {fmtWan(r.amount)}
    </span>
  );

  /* ---- 列定义（只读 5 列 · scroll.x=920；编辑 6 列 · scroll.x=1008） ---- */
  const roColumns = [
    {
      title: '系统名称',
      dataIndex: 'name',
      ellipsis: true,
      render: (_, r) => nameCell(r)
    },
    {
      title: '计费方式',
      dataIndex: 'billing',
      width: 120,
      render: (v) => <Tag style={{ marginInlineEnd: 0 }}>{BILLING_MODE_LABEL[v]}</Tag>
    },
    {
      title: '单价',
      key: 'rate',
      width: 170,
      align: 'right',
      render: (_, r) => (
        <span style={{ fontVariantNumeric: 'tabular-nums', color: c.t1 }} title={`${r.name} · ${BILLING_MODE_LABEL[r.billing]} · ${rateTextOf(r)}`}>
          {rateTextOf(r)}
        </span>
      )
    },
    {
      title: '年度 BU 用量',
      key: 'usage',
      width: 210,
      align: 'right',
      render: (_, r) => (
        <span
          style={{ fontVariantNumeric: 'tabular-nums', color: c.t1, whiteSpace: 'nowrap' }}
          title={usageTitleOf(r)}
        >
          {r.billing === 'fixed' ? `${fmtFixedUsage(r.usage)} ${USAGE_UNIT.fixed}` : `${fmtUsage(r.usage)} ${USAGE_UNIT[r.billing]}`}
        </span>
      )
    },
    {
      title: '年度总费用（万元）',
      key: 'amount',
      width: 160,
      align: 'right',
      render: (_, r) => amountCell(r)
    }
  ];

  /** 单位以 12px 小字跟在同一 Flex 内（该列三行单位各不相同，不能上提进列头） */
  const thousands = (v) => (v == null || v === '' ? '' : String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ','));
  const parseNum = (v) => String(v).replace(/,/g, '');

  const editColumns = [
    roColumns[0],
    { ...roColumns[1], width: 110 },
    {
      title: '单价',
      key: 'rate',
      width: 190,
      align: 'right',
      render: (_, r) => (
        <Flex align="center" justify="flex-end" gap={4}>
          <InputNumber
            data-testid={`budget-ops-rate-${r.sysId}`}
            size="small"
            style={{ width: 96, textAlign: 'right' }}
            value={r.rate}
            formatter={thousands}
            parser={parseNum}
            status={validateItem(r) ? undefined : 'error'}
            title="编制口径计划价，不写入计费规则主数据"
            onChange={(v) => patchItem(r.sysId, { rate: v == null ? null : roundTo(v, RATE_DIGITS[r.billing]) })}
          />
          <span style={{ fontSize: 12, color: c.t3, whiteSpace: 'nowrap' }}>{BILLING_UNIT[r.billing]}</span>
        </Flex>
      )
    },
    {
      title: '年度 BU 用量',
      key: 'usage',
      width: 220,
      align: 'right',
      render: (_, r) => (
        <Flex align="center" justify="flex-end" gap={4}>
          <InputNumber
            data-testid={`budget-ops-usage-${r.sysId}`}
            size="small"
            style={{ width: 120, textAlign: 'right' }}
            value={r.usage}
            formatter={thousands}
            parser={parseNum}
            status={validateItem(r) ? undefined : 'error'}
            title={`有效用量，已含业务量增长系数 ${pg.opsGrowth}`}
            onChange={(v) => patchItem(r.sysId, { usage: v == null ? null : roundTo(v, USAGE_DIGITS[r.billing]) })}
          />
          <span style={{ fontSize: 12, color: c.t3, whiteSpace: 'nowrap' }}>{USAGE_UNIT[r.billing]}</span>
        </Flex>
      )
    },
    { title: '年度总费用（万元）', key: 'amount', width: 150, align: 'right', render: (_, r) => amountCell(r) },
    {
      title: '操作',
      key: 'op',
      width: 88,
      align: 'right',
      render: (_, r) => (
        <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => removeRow(r.sysId)}>
          删除
        </Button>
      )
    }
  ];

  const rows = isNew ? items : pg.items;
  const canEditRows = editing;

  /* 合计口径：由同一批 items 的**原始数值**求和后再格式化（严禁把已格式化的万元字符串再累加） */
  const listTotal = rows.reduce((acc, r) => acc + Number(r.amount || 0), 0);
  /** 概览卡口径随缓冲（P0-1 修复）：编辑态展示草稿行的计费方式种类，避免与表底不同源 */
  const rowKindCount = new Set(rows.map((r) => r.billing)).size;

  const summary = () => (
    <Table.Summary.Row>
      <Table.Summary.Cell index={0} colSpan={editing ? 4 : 3}>
        <Text style={{ fontWeight: 500 }}>{`${rows.length} 个系统 · 覆盖该部门全部运维支出`}</Text>
      </Table.Summary.Cell>
      <Table.Summary.Cell index={editing ? 4 : 3} colSpan={2} align="right">
        <Text style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{`合计 ${fmtWan(listTotal)} 万元`}</Text>
      </Table.Summary.Cell>
    </Table.Summary.Row>
  );

  const addOptions = data.systems
    .filter((sys) => !items.some((it) => it.sysId === sys.id))
    .map((sys) => ({ value: sys.id, label: `${sys.name}（${sys.id}）` }));

  /* ---- 动作按钮组（随状态，置于 /new 状态条 Alert 的 action 内） ---- */
  const actionButtons = [];
  if (s === '编制中') {
    actionButtons.push(
      <Button key="save" data-testid="budget-ops-save" onClick={() => openNote('save')}>
        保存草稿
      </Button>
    );
    actionButtons.push(
      <Button
        key="submit"
        type="primary"
        data-testid="budget-ops-submit"
        disabled={invalidCount > 0 || rows.length === 0}
        onClick={() => openNote('submit')}
      >
        提交预算
      </Button>
    );
  }
  if (s === '待业务确认') {
    actionButtons.push(
      <Button key="confirm" type="primary" data-testid="budget-ops-confirm" onClick={doConfirm}>
        业务复核确认
      </Button>
    );
    actionButtons.push(
      <Button key="reject" danger data-testid="budget-ops-reject" onClick={doReject}>
        退回补充
      </Button>
    );
  }
  actionButtons.push(
    <Button key="discard" danger data-testid="budget-ops-discard" onClick={doDiscard}>
      废弃新版本
    </Button>
  );

  /* ---- 统一流水列（6 列；版本行末列带「查看明细」） ---- */
  const timelineCols = [
    {
      title: '时间',
      dataIndex: 'at',
      width: 140,
      render: (v) => <span style={{ fontSize: 12, color: c.t2, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
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
      render: (v, r) => (
        <Flex align="center" gap={8}>
          <span style={{ fontSize: 13, color: c.t2 }}>{v || '—'}</span>
          {r._snapshot ? (
            <Button type="link" size="small" style={{ flex: '0 0 auto' }} onClick={() => setDetail(r._snapshot)}>
              查看明细
            </Button>
          ) : null}
        </Flex>
      )
    }
  ];

  const dateText = pg.plan
    ? pg.plan.confirmDate
      ? `确认于 ${pg.plan.confirmDate}`
      : pg.plan.issueDate
      ? `出具于 ${pg.plan.issueDate}`
      : '暂无版本'
    : '暂无版本';

  /* 只读页头主按钮（随状态）；/new 态页头不放主按钮（动作在状态条里） */
  const primaryButton = !isNew ? (
    pg.status === '未启动' ? (
      <Button type="primary" icon={<FileTextOutlined />} data-testid="budget-ops-start" onClick={enterEdit}>
        编制预估
      </Button>
    ) : pg.hasInProgress ? (
      <Button type="primary" icon={<FileTextOutlined />} data-testid="budget-ops-goto-new" onClick={goNew}>
        查看进行中版本
      </Button>
    ) : pg.status === '已确认' ? (
      <Button type="primary" icon={<FileTextOutlined />} data-testid="budget-ops-edit" onClick={enterEdit}>
        修订
      </Button>
    ) : null
  ) : null;

  const detailItems = detail
    ? detail.items.map((it) => ({ ...it, line: (data.systems.find((x) => x.id === it.sysId) || {}).line || '' }))
    : [];
  const detailTotal = detailItems.reduce((acc, it) => acc + Number(it.amount || 0), 0);

  return (
    <div data-testid="budget-ops-plan-page">
      {holder}

      {/* ============ 楼层 0 · 页头 ============ */}
      <PageHead
        title={`${pg.deptName} · 系统运维预算计划`}
        desc="按系统计费模型（订单量 / 会员规模 / 固定年费）年化出具；整表为一个版本，Digital 提交 → 业务复核确认后生效。"
        extra={
          <Flex gap={8} align="center">
            <Button type="text" icon={<ArrowLeftOutlined />} data-testid="budget-ops-back" onClick={goBack}>
              返回年度预算计划
            </Button>
            {primaryButton}
          </Flex>
        }
      />

      {/* ============ 楼层 1 · 概览（2 卡；P1-4：统一 plain 中性态，状态语义交给状态条） ============ */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }} data-testid="budget-ops-overview">
        <Col xs={24} md={12}>
          <Metric
            label="当前版本"
            value={pg.plan && pg.plan.version && pg.plan.version !== '—' ? pg.plan.version : '未提交'}
            unit=""
            tone="plain"
            sub={
              <>
                <div>{`${pg.status} · ${dateText}`}</div>
                <div>{`Digital ${pg.digitalOwner} · 业务 ${pg.bizOwner}`}</div>
              </>
            }
          />
        </Col>
        <Col xs={24} md={12}>
          {/* P0-1：编辑态取草稿缓冲合计并标注口径，让「草稿数 ≠ 正式版数」在页面上自解释 */}
          <Metric
            label={editing ? '年度总费用（草稿）' : '年度总费用'}
            value={fmtWan(isNew ? listTotal : pg.totalAmount)}
            tone="plain"
            sub={
              editing
                ? `${rows.length} 个系统 · 草稿合计，正式版 ${fmtWan(pg.totalAmount)} 万元`
                : `${pg.itemCount} 个系统`
            }
          />
        </Col>
      </Row>

      {/* ============ 楼层 2 · 进行中入口 / 状态条 ============ */}
      {!isNew && pg.hasInProgress ? (
        <div data-testid="budget-ops-inprogress" style={{ marginBottom: 12 }}>
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
        <div data-testid="budget-ops-inprogress" style={{ marginBottom: 12 }}>
          <Alert
            type="warning"
            showIcon
            message={
              <Flex align="center" gap={8} wrap>
                <span style={{ fontSize: 13 }}>{`进行中的新版本 · ${INPROGRESS_LABEL[s] || s || '—'}`}</span>
                {draft && draft.submittedAt ? (
                  <span style={{ fontSize: 12, color: c.t2 }}>{`提交于 ${draft.submittedAt}`}</span>
                ) : null}
              </Flex>
            }
            action={<Flex gap={8} wrap>{actionButtons}</Flex>}
          />
        </div>
      ) : null}

      {/* ============ 楼层 2 · 主体：系统明细 ============ */}
      <Card data-testid="budget-ops-table" styles={{ body: { padding: 16 } }} style={{ marginBottom: 16 }}>
        <BlockTitle
          extra={
            editing ? (
              <Select
                size="small"
                style={{ width: 190 }}
                value={null}
                placeholder={
                  <span>
                    <PlusOutlined /> 添加系统
                  </span>
                }
                options={addOptions}
                optionFilterProp="label"
                onSelect={(sysId) => {
                  const sys = data.systems.find((x) => x.id === sysId);
                  if (sys) addRow(sys);
                }}
              />
            ) : null
          }
        >
          系统明细（按系统计费）
        </BlockTitle>

        {!isNew && pg.usingDerived ? (
          <div style={{ marginBottom: 8, fontSize: 12, color: c.t2 }}>
            以下为按计费模型推导的首版预估，点击「编制预估」将其固化为可编辑清单。
          </div>
        ) : null}

        {invalidCount > 0 ? (
          <div style={{ marginBottom: 8, fontSize: 12, color: c.dangerText }}>{`${invalidCount} 行未通过校验`}</div>
        ) : null}

        {rows.length ? (
          <Table
            size="small"
            rowKey="sysId"
            pagination={false}
            scroll={{ x: editing ? 1008 : 920 }}
            dataSource={rows}
            columns={editing ? editColumns : roColumns}
            summary={summary}
          />
        ) : (
          <Blank text="该部门本年度无运维计费系统 · 点击「编制预估」开始" />
        )}

        <div style={{ marginTop: 8, fontSize: 12, color: c.t2 }}>
          {`编制口径：系统年化预估，已含业务量增长系数；执行年度实际消耗见账单模块，两者口径不同、不要求逐位相等。 · 计费方式 ${
            isNew ? rowKindCount : pg.billingKindCount
          } 种 · 业务量增长系数 ${pg.opsGrowth}`}
        </div>
      </Card>

      {/* ============ 楼层 3 · 版本与操作流水 ============ */}
      <Card data-testid="budget-ops-timeline" styles={{ body: { padding: 16 } }}>
        <BlockTitle
          extra={
            pg.versions.length ? (
              <span style={{ fontSize: 12, color: c.t3, fontVariantNumeric: 'tabular-nums' }}>
                {`${pg.versions.length} 个版本`}
              </span>
            ) : null
          }
        >
          版本与操作流水
        </BlockTitle>
        {pg.timeline.length ? (
          <Table
            size="small"
            rowKey="_k"
            pagination={false}
            dataSource={pg.timeline.map((e, i) => ({ ...e, _k: `${e.at}|${e.action}|${i}` }))}
            columns={timelineCols}
          />
        ) : (
          <Blank text="暂无版本与操作记录" compact />
        )}
      </Card>

      {/* ============ 版本明细浮层（Drawer；禁用 destroyOnClose —— antd 5.25+ 已废弃） ============ */}
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        width={720}
        title={detail ? `版本明细 · ${detail.version}` : ''}
      >
        {detail ? (
          <div data-testid="budget-ops-version-drawer">
            <Descriptions size="small" bordered column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="版本号">{detail.version}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <StatusTag value={detail.status} />
              </Descriptions.Item>
              <Descriptions.Item label="确认时间">{detail.confirmedAt || '—'}</Descriptions.Item>
              <Descriptions.Item label="提交人 / 确认人">
                {`${detail.submitter || '—'} / ${detail.confirmer || '—'}`}
              </Descriptions.Item>
            </Descriptions>
            <Table
              size="small"
              rowKey="sysId"
              pagination={false}
              scroll={{ x: 920 }}
              dataSource={detailItems}
              columns={roColumns}
              summary={() => (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={3}>
                    <Text style={{ fontWeight: 500 }}>{`${detailItems.length} 个系统`}</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={3} colSpan={2} align="right">
                    <Text style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                      {`本版合计 ${fmtWan(detailTotal)} 万元`}
                    </Text>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              )}
            />
          </div>
        ) : null}
      </Drawer>

      {/* ============ 保存草稿 / 提交预算 的变更说明浮层（照抄 v0.8） ============ */}
      <Modal
        open={!!noteModal}
        title={noteModal === 'submit' ? '提交预算' : '保存草稿'}
        onCancel={() => setNoteModal(null)}
        onOk={submitNote}
        okText={noteModal === 'submit' ? '提交预算' : '保存草稿'}
        cancelText="取消"
        maskClosable={false}
        width={480}
      >
        <div style={{ marginBottom: 8, fontSize: 12, color: c.t2 }}>
          {noteModal === 'submit'
            ? '提交后进入「待业务复核确认」，本条说明将记入版本流水。'
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
