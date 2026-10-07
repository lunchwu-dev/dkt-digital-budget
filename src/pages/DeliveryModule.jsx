import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Card, Table, Button, Tag, Flex, Typography, Space, Drawer, Modal, Form, Input, Select,
  DatePicker, InputNumber, Descriptions, Divider, Alert, message, Row, Col, Statistic
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, CheckOutlined, RocketOutlined, EyeOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useT } from '../theme.js';
import { useStore, calc } from '../store.jsx';
import {
  PageHead, Metric, BrdStatusTag, DemandTypeTag, Hint, BlockTitle, Blank, FilterBar, TraceChain
} from '../components/common.jsx';
import { brdChainNodes, drillTargetOf } from '../components/traceNodes.js';

const { Text, Paragraph } = Typography;
const {
  fmtWan, fmtYuan, fmtNum, fmtPct, rateOf, mdAmount, brdEvalAmount, brdCRDelta, brdFinalAmount,
  mdTotal, traceOfBrd
} = calc;

const VIEWS = [
  { key: 'brd', label: '需求受理' },
  { key: 'eval', label: '评估与签收' },
  { key: 'cr', label: '变更管理' },
  { key: 'deliver', label: '交付与偏差' }
];

const ROLES = [
  { code: 'ARCH', name: '解决方案架构师' }, { code: 'PM', name: '产品经理' },
  { code: 'PMO', name: '项目经理' }, { code: 'BA', name: '需求分析师' },
  { code: 'UX', name: '交互 / 视觉设计' }, { code: 'FE', name: '前端工程师' },
  { code: 'BE', name: '后端工程师' }, { code: 'DE', name: '数据工程师' },
  { code: 'QA', name: '测试工程师' }, { code: 'OPS', name: '运维工程师' }
];

const CR_TYPES = ['范围变更', '新增范围', '需求调整', '工期顺延'];
const FY_LABEL = { 2026: 'FY2026', 2027: 'FY2027' };

function deptOptions(data) {
  return [{ value: 'all', label: '全部部门' }, ...data.departments.map((d) => ({ value: d.code, label: d.name }))];
}
function systemOptions(data) {
  return [{ value: 'all', label: '全部系统' }, ...data.systems.map((s) => ({ value: s.id, label: `${s.id} ${s.name}` }))];
}

/** 人天明细编辑器 —— 评估签收 / 变更 / 实际投入三处复用 */
function MdEditor({ lines, onChange, fy, rateCards }) {
  const c = useT();
  const total = mdAmount(rateCards, fy, lines.map((l) => [l.role, l.md]));
  const update = (idx, patch) => onChange(lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  return (
    <div>
      <Flex vertical gap={8}>
        {lines.map((l, i) => (
          <Flex key={i} gap={8} align="center">
            <Select
              style={{ width: 170 }}
              value={l.role}
              onChange={(v) => update(i, { role: v })}
              options={ROLES.map((r) => ({ value: r.code, label: `${r.name}（${r.code}）` }))}
            />
            <InputNumber
              style={{ width: 110 }}
              min={0}
              step={1}
              value={l.md}
              onChange={(v) => update(i, { md: v || 0 })}
              addonAfter="人天"
            />
            <Text style={{ fontSize: 12, color: c.t3, width: 108 }}>× ¥{rateOf(rateCards, fy, l.role).toLocaleString('zh-CN')}</Text>
            <Text style={{ fontSize: 13, minWidth: 110, fontVariantNumeric: 'tabular-nums' }}>
              {fmtYuan((l.md || 0) * rateOf(rateCards, fy, l.role))}
            </Text>
            <Button
              type="text"
              danger
              size="small"
              icon={<DeleteOutlined />}
              disabled={lines.length <= 1}
              onClick={() => onChange(lines.filter((_, j) => j !== i))}
            />
          </Flex>
        ))}
      </Flex>
      <Flex justify="space-between" align="center" style={{ marginTop: 12 }}>
        <Button size="small" icon={<PlusOutlined />} onClick={() => onChange([...lines, { role: 'BE', md: 10 }])}>
          增加角色行
        </Button>
        <Flex gap={20}>
          <Text style={{ fontSize: 13, color: c.t2 }}>
            合计人天 <strong style={{ color: c.t1 }}>{fmtNum(mdTotal(lines.map((l) => [l.role, l.md])))}</strong>
          </Text>
          <Text style={{ fontSize: 13, color: c.t2 }}>
            费用合计 <strong style={{ color: c.brand, fontSize: 15 }}>{fmtYuan(total)}</strong>
            <span style={{ color: c.t3 }}>（{fmtWan(total)} 万元）</span>
          </Text>
        </Flex>
      </Flex>
    </div>
  );
}

export default function DeliveryModule({ view = 'brd', param, onNavigate }) {
  const c = useT();
  const { data, submitBRD, signOffBRD, startEvaluation, addCR, deliverBRD, log, globalFy } = useStore();
  const [msgApi, holder] = message.useMessage();
  const fy = globalFy;

  /* ---------------- 逐视图筛选态 ---------------- */
  const [fBrd, setFBrd] = useState({ dept: 'all', status: 'all', type: 'all', system: 'all', kw: '' });
  const [fEval, setFEval] = useState({ dept: 'all', status: 'PENDING', system: 'all', kw: '' });
  const [fCr, setFCr] = useState({ dept: 'all', type: 'all', status: 'all', kw: '' });
  const [fDeliver, setFDeliver] = useState({ dept: 'all', status: 'all', system: 'all', dev: 'all', kw: '' });

  /* ---------------- 模态 / 抽屉状态 ---------------- */
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [evalTarget, setEvalTarget] = useState(null);
  const [crOpen, setCrOpen] = useState(false);
  const [crTarget, setCrTarget] = useState(null); // 指定 BRD 时锁定；null 表示由表单选择
  const [deliverTarget, setDeliverTarget] = useState(null);

  const [createForm] = Form.useForm();
  const [crForm] = Form.useForm();
  const [deliverForm] = Form.useForm();

  const [evalLines, setEvalLines] = useState([{ role: 'BA', md: 20 }, { role: 'BE', md: 40 }]);
  const [crLines, setCrLines] = useState([{ role: 'BE', md: 10 }]);
  const [deliverLines, setDeliverLines] = useState([{ role: 'BE', md: 40 }]);

  const linkedDemandId = Form.useWatch('relatedDemandId', createForm);

  /* ---------------- 全局单号搜索联动 ---------------- */
  const prevParamRef = useRef(null);
  useEffect(() => {
    const prev = prevParamRef.current;
    prevParamRef.current = param;
    if (!param) {
      // 从「带单号的深链」退回列表：关闭抽屉并清掉由搜索带出的关键词
      if (prev) {
        setDetailId(null);
        setFCr((p) => ({ ...p, kw: '' }));
        setFEval((p) => ({ ...p, kw: '' }));
        setFDeliver((p) => ({ ...p, kw: '' }));
      }
      return;
    }
    if (view === 'brd') setDetailId(param); // BRD- 命中 → 自动打开详情抽屉
    if (view === 'cr') setFCr((p) => ({ ...p, kw: param })); // CR- 命中 → 筛选出该 CR
    if (view === 'eval') setFEval((p) => ({ ...p, status: 'all', kw: param }));
    if (view === 'deliver') setFDeliver((p) => ({ ...p, status: 'all', kw: param }));
  }, [view, param]);

  /* ---------------- 打开动作 ---------------- */
  const openEval = (id) => {
    const b = data.brds.find((x) => x.id === id);
    if (b && b.status === 'SUBMITTED') startEvaluation(id);
    setEvalLines([{ role: 'BA', md: 20 }, { role: 'BE', md: 40 }]);
    setEvalTarget(id);
  };
  const openCR = (brdId) => {
    setCrTarget(brdId || null);
    crForm.resetFields();
    crForm.setFieldsValue(brdId ? { brdId } : {});
    setCrLines([{ role: 'BE', md: 10 }]);
    setCrOpen(true);
  };
  const openDeliver = (id) => {
    const b = data.brds.find((x) => x.id === id);
    setDeliverLines(b && b.evalLines.length ? b.evalLines.map(([role, md]) => ({ role, md })) : [{ role: 'BE', md: 40 }]);
    deliverForm.resetFields();
    deliverForm.setFieldsValue({ goLiveDate: dayjs('2026-12-15') });
    setDeliverTarget(id);
  };

  /* ---------------- 数据 ---------------- */
  const brdRows = useMemo(
    () =>
      data.brds.filter((b) => {
        if (fBrd.dept !== 'all' && b.dept !== fBrd.dept) return false;
        if (fBrd.status !== 'all' && b.status !== fBrd.status) return false;
        if (fBrd.type !== 'all' && b.relationType !== fBrd.type) return false;
        if (fBrd.system !== 'all' && b.system !== fBrd.system) return false;
        if (fBrd.kw && !`${b.id}${b.title}${b.reporter}`.includes(fBrd.kw)) return false;
        return true;
      }),
    [data.brds, fBrd]
  );

  const evalRows = useMemo(
    () =>
      data.brds.filter((b) => {
        if (fEval.dept !== 'all' && b.dept !== fEval.dept) return false;
        if (fEval.status === 'PENDING' && !(b.status === 'SUBMITTED' || b.status === 'EVALUATING')) return false;
        if (fEval.status === 'SIGNED' && b.status !== 'SIGNED') return false;
        if (fEval.status === 'DELIVERED' && b.status !== 'DELIVERED') return false;
        if (fEval.system !== 'all' && b.system !== fEval.system) return false;
        if (fEval.kw && !`${b.id}${b.title}${b.reporter}`.includes(fEval.kw)) return false;
        return true;
      }),
    [data.brds, fEval]
  );

  const crRows = useMemo(() => {
    const out = [];
    data.brds.forEach((b) => {
      (b.crs || []).forEach((cr) => {
        out.push({
          key: cr.id,
          id: cr.id,
          brdId: b.id,
          brdTitle: b.title,
          dept: b.dept,
          fy: b.fy,
          type: cr.type,
          desc: cr.desc,
          deltaMD: mdTotal(cr.delta),
          deltaAmount: mdAmount(data.rateCards, b.fy, cr.delta),
          status: cr.status,
          approvedBy: cr.approvedBy,
          date: cr.date
        });
      });
    });
    return out
      .filter((r) => {
        if (fCr.dept !== 'all' && r.dept !== fCr.dept) return false;
        if (fCr.type !== 'all' && r.type !== fCr.type) return false;
        if (fCr.status !== 'all' && r.status !== fCr.status) return false;
        if (fCr.kw && !`${r.id}${r.brdId}${r.brdTitle}${r.desc}`.includes(fCr.kw)) return false;
        return true;
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [data, fCr]);

  const deliverRows = useMemo(
    () =>
      data.brds
        .filter((b) => b.status === 'SIGNED' || b.status === 'DELIVERED')
        .filter((b) => {
          if (fDeliver.dept !== 'all' && b.dept !== fDeliver.dept) return false;
          if (fDeliver.status !== 'all' && b.status !== fDeliver.status) return false;
          if (fDeliver.system !== 'all' && b.system !== fDeliver.system) return false;
          if (fDeliver.kw && !`${b.id}${b.title}${b.reporter}`.includes(fDeliver.kw)) return false;
          const over = b.delivery ? mdTotal(b.delivery.actualLines) > mdTotal(b.evalLines) : false;
          if (fDeliver.dev === 'over' && !over) return false;
          if (fDeliver.dev === 'normal' && over) return false;
          return true;
        })
        .map((b) => {
          const evalMD = mdTotal(b.evalLines);
          const actualMD = b.delivery ? mdTotal(b.delivery.actualLines) : null;
          return {
            key: b.id,
            ...b,
            evalMD,
            actualMD,
            devRate: actualMD !== null && evalMD ? actualMD / evalMD - 1 : null,
            finalAmount: brdFinalAmount(data, b)
          };
        }),
    [data, fDeliver]
  );

  const fyBrd = useMemo(() => data.brds.filter((b) => b.fy === fy), [data.brds, fy]);
  const stats = useMemo(
    () => ({
      total: fyBrd.length,
      newCount: fyBrd.filter((b) => b.relationType === 'NEW').length,
      signed: fyBrd.filter((b) => b.status === 'SIGNED' || b.status === 'DELIVERED').length,
      pending: fyBrd.filter((b) => b.status === 'SUBMITTED' || b.status === 'EVALUATING').length,
      signedAmount: fyBrd.filter((b) => b.status === 'SIGNED' || b.status === 'DELIVERED').reduce((s, b) => s + brdFinalAmount(data, b), 0),
      crAmount: fyBrd.reduce((s, b) => s + brdCRDelta(data, b), 0)
    }),
    [data, fyBrd]
  );

  /* ---------------- 详情 ---------------- */
  const detailBrd = detailId ? data.brds.find((b) => b.id === detailId) : null;
  const detailTrace = detailBrd ? traceOfBrd(data, detailBrd) : null;
  const evalBrd = evalTarget ? data.brds.find((b) => b.id === evalTarget) : null;
  const deliverBrd = deliverTarget ? data.brds.find((b) => b.id === deliverTarget) : null;

  const cy = (r) => r.status === 'SIGNED' || r.status === 'DELIVERED';

  /* ============================ 视图：需求受理 ============================ */
  const brdColumns = [
    {
      title: 'BRD 编号 / 提报时间',
      dataIndex: 'id',
      width: 150,
      render: (v, r) => {
        const hit = param && v === param;
        return (
          <Flex vertical gap={2} style={hit ? { background: c.filterChipBg, paddingLeft: 6, marginLeft: -8 } : undefined}>
            <Text style={{ fontSize: 12, fontWeight: 500, color: c.brand }}>{v}</Text>
            <Text style={{ fontSize: 11, color: c.t3 }}>{r.submitDate}</Text>
          </Flex>
        );
      }
    },
    {
      title: '需求标题 / 承接系统',
      dataIndex: 'title',
      render: (v, r) => (
        <Flex vertical gap={4}>
          <Text style={{ fontSize: 13 }}>{v}</Text>
          <Text style={{ fontSize: 11, color: c.t3 }}>{r.system} · {data.systems.find((s) => s.id === r.system)?.name}</Text>
        </Flex>
      )
    },
    { title: '提报部门', dataIndex: 'dept', width: 96, render: (v) => data.departments.find((d) => d.code === v)?.name || v },
    { title: '提报人', dataIndex: 'reporter', width: 84 },
    {
      title: '需求来源',
      dataIndex: 'relationType',
      width: 168,
      render: (v, r) => (
        <Flex vertical gap={4}>
          <DemandTypeTag type={v} />
          <Text style={{ fontSize: 11, color: c.t3 }}>{r.relatedDemandId ? `关联 ${r.relatedDemandId}` : '无关联年初需求'}</Text>
        </Flex>
      )
    },
    {
      title: '评估价 / 最终价（万元）',
      key: 'amount',
      width: 160,
      align: 'right',
      render: (_, r) => {
        const ev = brdEvalAmount(data, r);
        const fin = brdFinalAmount(data, r);
        if (!ev) return <Text style={{ fontSize: 12, color: c.t3 }}>待评估</Text>;
        return (
          <Flex vertical gap={2} style={{ alignItems: 'flex-end' }}>
            <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13, fontWeight: 500 }}>{fmtWan(fin, 2)}</span>
            {fin !== ev && <Text style={{ fontSize: 11, color: c.warning }}>评估 {fmtWan(ev, 2)} + 变更 {fmtWan(fin - ev, 2)}</Text>}
          </Flex>
        );
      }
    },
    { title: '状态', dataIndex: 'status', width: 116, render: (v) => <BrdStatusTag status={v} /> },
    {
      title: '操作',
      key: 'op',
      width: 96,
      fixed: 'right',
      render: (_, r) => (
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setDetailId(r.id)}>
          详情
        </Button>
      )
    }
  ];

  const renderBrd = () => (
    <div data-testid="view-delivery-brd">
      <PageHead
        title="需求受理（BRD）"
        desc="业务部门提报完整 BRD，并声明该需求关联哪些年初需求；若无关联则明确标记为年度新增需求 —— 该标记会一路带到月度账单。"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              createForm.resetFields();
              createForm.setFieldsValue({ fy, dept: 'D-RETAIL', reporter: '陈昊' });
              setCreateOpen(true);
            }}
          >
            提报 BRD
          </Button>
        }
      />
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} lg={6}><Metric label={`FY${fy} BRD 总数`} value={String(stats.total)} unit="条" sub="含草稿与已驳回" /></Col>
        <Col xs={12} lg={6}><Metric label="年度新增需求" value={String(stats.newCount)} unit="条" tone="warning" sub="无关联年初需求清单" /></Col>
        <Col xs={12} lg={6}><Metric label="已签收 / 已交付" value={String(stats.signed)} unit="条" tone="success" sub={`涉及金额 ${fmtWan(stats.signedAmount)} 万元`} /></Col>
        <Col xs={12} lg={6}><Metric label="待评估" value={String(stats.pending)} unit="条" tone="warning" sub="等待 Digital 出具评估" /></Col>
      </Row>
      <FilterBar
        fields={[
          { key: 'dept', label: '部门', type: 'select', options: deptOptions(data) },
          {
            key: 'status',
            label: '状态',
            type: 'select',
            options: [
              { value: 'all', label: '全部状态' },
              { value: 'SUBMITTED', label: '已提报' },
              { value: 'EVALUATING', label: '评估中' },
              { value: 'SIGNED', label: '已签收' },
              { value: 'DELIVERED', label: '已交付上线' },
              { value: 'REJECTED', label: '已驳回' }
            ]
          },
          {
            key: 'type',
            label: '需求来源',
            type: 'select',
            options: [
              { value: 'all', label: '全部来源' },
              { value: 'PLANNED', label: '年初计划内' },
              { value: 'NEW', label: '年度新增需求' }
            ]
          },
          { key: 'system', label: '承接系统', type: 'select', options: systemOptions(data), width: 180 },
          { key: 'kw', label: '关键词', type: 'keyword', placeholder: '搜索编号 / 标题 / 提报人' }
        ]}
        value={fBrd}
        onChange={setFBrd}
        resultCount={brdRows.length}
        onReset={() => setFBrd({ dept: 'all', status: 'all', type: 'all', system: 'all', kw: '' })}
        fyLabel={FY_LABEL[fy]}
      />
      <Card styles={{ body: { padding: 16 } }}>
        {brdRows.length ? (
          <Table
            size="small"
            rowKey="id"
            columns={brdColumns}
            dataSource={brdRows}
            pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (t) => `共 ${t} 条` }}
            scroll={{ x: 1300 }}
          />
        ) : (
          <Blank text="该条件下暂无数据 · [重置筛选]" compact />
        )}
      </Card>
    </div>
  );

  /* ============================ 视图：评估与签收 ============================ */
  const renderEval = () => (
    <div data-testid="view-delivery-eval">
      <PageHead
        title="评估与签收"
        desc="按角色 × 人天评估交付费用并签收锁定。签收即锁价：池子由「已规划」转入「已承诺」，在上线月份的账单中核销。"
      />
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} lg={8}><Metric label="待签收（队列）" value={String(stats.pending)} unit="条" tone="warning" sub="已提报 / 评估中，等待出具评估并签收" /></Col>
        <Col xs={12} lg={8}><Metric label="已签收锁定金额" value={fmtWan(stats.signedAmount)} tone="success" sub="评估价 + 已批准变更" /></Col>
        <Col xs={12} lg={8}><Metric label="本年度工时费率口径" value="预算期锁定" unit="" sub="费率表全年不调价，年末统一调节" /></Col>
      </Row>
      <FilterBar
        fields={[
          { key: 'dept', label: '部门', type: 'select', options: deptOptions(data) },
          {
            key: 'status',
            label: '状态',
            type: 'select',
            options: [
              { value: 'PENDING', label: '待签收' },
              { value: 'SIGNED', label: '已签收（待交付）' },
              { value: 'DELIVERED', label: '已交付上线' },
              { value: 'all', label: '全部状态' }
            ]
          },
          { key: 'system', label: '承接系统', type: 'select', options: systemOptions(data), width: 180 },
          { key: 'kw', label: '关键词', type: 'keyword', placeholder: '搜索编号 / 标题 / 提报人' }
        ]}
        value={fEval}
        onChange={setFEval}
        resultCount={evalRows.length}
        onReset={() => setFEval({ dept: 'all', status: 'PENDING', system: 'all', kw: '' })}
        fyLabel={FY_LABEL[fy]}
      />
      <Card styles={{ body: { padding: 16 } }}>
        {evalRows.length ? (
          <Table
            size="small"
            rowKey="id"
            dataSource={evalRows}
            pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (t) => `共 ${t} 条` }}
            scroll={{ x: 1200 }}
            columns={[
              { title: 'BRD 编号 / 提报时间', dataIndex: 'id', width: 150, render: (v, r) => (
                <Flex vertical gap={2}>
                  <Text style={{ fontSize: 12, fontWeight: 500, color: c.brand }}>{v}</Text>
                  <Text style={{ fontSize: 11, color: c.t3 }}>{r.submitDate}</Text>
                </Flex>
              ) },
              { title: '需求标题', dataIndex: 'title', ellipsis: true },
              { title: '提报部门', dataIndex: 'dept', width: 96, render: (v) => data.departments.find((d) => d.code === v)?.name || v },
              { title: '承接系统', dataIndex: 'system', width: 92 },
              { title: '需求来源', dataIndex: 'relationType', width: 120, render: (v) => <DemandTypeTag type={v} /> },
              {
                title: '当前评估价（万元）',
                key: 'ev',
                width: 150,
                align: 'right',
                render: (_, r) => {
                  const ev = brdEvalAmount(data, r);
                  return ev ? <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtWan(ev, 2)}</span> : <Text style={{ fontSize: 12, color: c.t3 }}>—</Text>;
                }
              },
              { title: '状态', dataIndex: 'status', width: 116, render: (v) => <BrdStatusTag status={v} /> },
              {
                title: '操作',
                key: 'op',
                width: 200,
                fixed: 'right',
                render: (_, r) => (
                  <Space size={2} wrap>
                    <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setDetailId(r.id)}>详情</Button>
                    {r.status === 'SUBMITTED' && (
                      <Button type="link" size="small" onClick={() => openEval(r.id)}>评估签收</Button>
                    )}
                    {r.status === 'EVALUATING' && (
                      <Button type="link" size="small" onClick={() => openEval(r.id)}>出具评估</Button>
                    )}
                    {cy(r) && <Text style={{ fontSize: 12, color: c.t3 }}>已锁定</Text>}
                  </Space>
                )
              }
            ]}
          />
        ) : (
          <Blank text="该条件下暂无数据 · [重置筛选]" compact />
        )}
      </Card>
    </div>
  );

  /* ============================ 视图：变更管理 ============================ */
  const renderCr = () => (
    <div data-testid="view-delivery-cr">
      <PageHead
        title="变更管理（CR）"
        desc="范围 / 需求变更的独立登记与分级审批。变更独立计价，不计入原评估价，在账单中单独标注计价依据。"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => openCR(null)}>新增变更</Button>}
      />
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} lg={6}><Metric label="CR 总数" value={String(crRows.length)} unit="单" sub="跨 BRD 汇总" /></Col>
        <Col xs={12} lg={6}><Metric label="变更累计增减" value={fmtWan(crRows.reduce((s, r) => s + r.deltaAmount, 0))} tone="danger" sub="已批准变更导致的费用增减" /></Col>
        <Col xs={12} lg={6}><Metric label="已批准" value={String(crRows.filter((r) => r.status === '已批准').length)} unit="单" tone="success" sub="随账单单独标注" /></Col>
        <Col xs={12} lg={6}><Metric label="累计增减人天" value={fmtNum(crRows.reduce((s, r) => s + r.deltaMD, 0))} unit="人天" sub="变更工作量合计" /></Col>
      </Row>
      <FilterBar
        fields={[
          { key: 'dept', label: '部门', type: 'select', options: deptOptions(data) },
          { key: 'type', label: 'CR类型', type: 'select', options: [{ value: 'all', label: '全部类型' }, ...CR_TYPES.map((t) => ({ value: t, label: t }))], width: 150 },
          {
            key: 'status',
            label: '审批状态',
            type: 'select',
            options: [
              { value: 'all', label: '全部状态' },
              { value: '已批准', label: '已批准' },
              { value: '待审批', label: '待审批' },
              { value: '已驳回', label: '已驳回' }
            ]
          },
          { key: 'kw', label: '关键词', type: 'keyword', placeholder: '搜索 CR / BRD 编号或说明' }
        ]}
        value={fCr}
        onChange={setFCr}
        resultCount={crRows.length}
        onReset={() => setFCr({ dept: 'all', type: 'all', status: 'all', kw: '' })}
        fyLabel={FY_LABEL[fy]}
      />
      <Card styles={{ body: { padding: 16 } }}>
        {crRows.length ? (
          <Table
            size="small"
            rowKey="id"
            dataSource={crRows}
            pagination={{ pageSize: 12, showSizeChanger: false, showTotal: (t) => `共 ${t} 条` }}
            scroll={{ x: 1300 }}
            columns={[
              {
                title: 'CR 编号',
                dataIndex: 'id',
                width: 140,
                render: (v, r) => {
                  const hit = param && v === param;
                  return (
                    <Flex vertical gap={2} style={hit ? { background: c.filterChipBg, paddingLeft: 6, marginLeft: -8 } : undefined}>
                      <Text style={{ fontSize: 12, color: c.brand, fontWeight: hit ? 500 : 400 }}>{v}</Text>
                      <Text style={{ fontSize: 11, color: c.t3 }}>{r.date}</Text>
                    </Flex>
                  );
                }
              },
              {
                title: '所属 BRD',
                dataIndex: 'brdId',
                width: 220,
                render: (v, r) => (
                  <Flex vertical gap={2}>
                    <Text style={{ fontSize: 12, color: c.brand }}>{v}</Text>
                    <Text style={{ fontSize: 11, color: c.t3 }} ellipsis>{r.brdTitle}</Text>
                  </Flex>
                )
              },
              { title: '部门', dataIndex: 'dept', width: 92, render: (v) => data.departments.find((d) => d.code === v)?.name || v },
              { title: 'CR 类型', dataIndex: 'type', width: 100, render: (v) => <Tag color="warning" style={{ marginInlineEnd: 0 }}>{v}</Tag> },
              { title: '变更说明', dataIndex: 'desc', ellipsis: true },
              { title: '增减人天', dataIndex: 'deltaMD', width: 96, align: 'right', render: (v) => <span style={{ fontVariantNumeric: 'tabular-nums', color: v >= 0 ? c.warning : c.success }}>{v >= 0 ? '+' : ''}{fmtNum(v)}</span> },
              { title: '增减金额（万元）', dataIndex: 'deltaAmount', width: 140, align: 'right', render: (v) => <span style={{ fontVariantNumeric: 'tabular-nums', color: v >= 0 ? c.danger : c.success }}>{v >= 0 ? '+' : ''}{fmtWan(v, 2)}</span> },
              { title: '审批状态', dataIndex: 'status', width: 96, render: (v) => <Tag color={v === '已批准' ? 'success' : v === '已驳回' ? 'error' : 'default'} style={{ marginInlineEnd: 0 }}>{v}</Tag> },
              { title: '审批人', dataIndex: 'approvedBy', width: 84 },
              {
                title: '操作',
                key: 'op',
                width: 108,
                fixed: 'right',
                render: (_, r) => (
                  <Button type="link" size="small" onClick={() => openCR(r.brdId)}>
                    新增变更
                  </Button>
                )
              }
            ]}
          />
        ) : (
          <Blank text="该条件下暂无数据 · [重置筛选]" compact />
        )}
      </Card>
    </div>
  );

  /* ============================ 视图：交付与偏差 ============================ */
  const renderDeliver = () => {
    const delivered = deliverRows.filter((r) => r.status === 'DELIVERED');
    const pending = deliverRows.filter((r) => r.status === 'SIGNED');
    return (
      <div data-testid="view-delivery-deliver">
        <PageHead
          title="交付与偏差"
          desc="已签收未交付 / 已交付清单 + 实际上线日期 + 实际投入人天 vs 评估人天偏差率，反哺次年估算精度。"
        />
        <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
          <Col xs={12} lg={8}><Metric label="已签收未交付" value={String(pending.length)} unit="条" tone="warning" sub="等待登记交付上线" /></Col>
          <Col xs={12} lg={8}><Metric label="已交付上线" value={String(delivered.length)} unit="条" tone="success" sub="按实际上线月份出账" /></Col>
          <Col xs={12} lg={8}>
            <Metric
              label="交付超支（实际 > 评估人天）"
              value={String(delivered.filter((r) => r.devRate !== null && r.devRate > 0).length)}
              unit="条"
              tone="danger"
              sub="超支项将反哺次年估算精度"
            />
          </Col>
        </Row>
        <FilterBar
          fields={[
            { key: 'dept', label: '部门', type: 'select', options: deptOptions(data) },
            {
              key: 'status',
              label: '交付状态',
              type: 'select',
              options: [
                { value: 'all', label: '全部' },
                { value: 'SIGNED', label: '已签收未交付' },
                { value: 'DELIVERED', label: '已交付' }
              ]
            },
            { key: 'system', label: '承接系统', type: 'select', options: systemOptions(data), width: 180 },
            {
              key: 'dev',
              label: '偏差档',
              type: 'select',
              options: [
                { value: 'all', label: '全部' },
                { value: 'normal', label: '正常（不超评估）' },
                { value: 'over', label: '超支（超出评估人天）' }
              ]
            },
            { key: 'kw', label: '关键词', type: 'keyword', placeholder: '搜索编号 / 标题 / 提报人' }
          ]}
          value={fDeliver}
          onChange={setFDeliver}
          resultCount={deliverRows.length}
          onReset={() => setFDeliver({ dept: 'all', status: 'all', system: 'all', dev: 'all', kw: '' })}
          fyLabel={FY_LABEL[fy]}
        />
        <Card data-testid="delivery-deliver-table" styles={{ body: { padding: 16 } }}>
          <BlockTitle extra={<Text style={{ fontSize: 12, color: c.t3 }}>结算基准 = 评估价 + 已批准变更</Text>}>
            交付清单（已签收未交付 / 已交付）
          </BlockTitle>
          {deliverRows.length ? (
            <Table
              size="small"
              rowKey="id"
              dataSource={deliverRows}
              pagination={{ pageSize: 12, showSizeChanger: false, showTotal: (t) => `共 ${t} 条` }}
              scroll={{ x: 1350 }}
              columns={[
                {
                  title: 'BRD 编号',
                  dataIndex: 'id',
                  width: 140,
                  render: (v) => <Text style={{ fontSize: 12, color: c.brand }}>{v}</Text>
                },
                { title: '需求标题', dataIndex: 'title', ellipsis: true },
                { title: '部门', dataIndex: 'dept', width: 92, render: (v) => data.departments.find((d) => d.code === v)?.name || v },
                { title: '承接系统', dataIndex: 'system', width: 92 },
                {
                  title: '交付状态',
                  dataIndex: 'status',
                  width: 130,
                  render: (v) => <BrdStatusTag status={v} />
                },
                { title: '实际上线日', dataIndex: ['delivery', 'goLiveDate'], width: 118, render: (v) => v || <Text style={{ fontSize: 12, color: c.t3 }}>未上线</Text> },
                { title: '评估人天', dataIndex: 'evalMD', width: 96, align: 'right', render: (v) => fmtNum(v) },
                { title: '实际人天', dataIndex: 'actualMD', width: 96, align: 'right', render: (v) => (v === null ? <Text style={{ fontSize: 12, color: c.t3 }}>—</Text> : fmtNum(v)) },
                {
                  title: '人天偏差率',
                  dataIndex: 'devRate',
                  width: 120,
                  align: 'right',
                  render: (v) =>
                    v === null ? (
                      <Text style={{ fontSize: 12, color: c.t3 }}>—</Text>
                    ) : (
                      <span style={{ fontVariantNumeric: 'tabular-nums', color: v > 0 ? c.danger : c.success }}>{fmtPct(v, 1)}</span>
                    )
                },
                { title: '结算基准（万元）', dataIndex: 'finalAmount', width: 150, align: 'right', render: (v) => <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{fmtWan(v, 2)}</span> },
                {
                  title: '操作',
                  key: 'op',
                  width: 108,
                  fixed: 'right',
                  render: (_, r) =>
                    r.status === 'SIGNED' ? (
                      <Button type="link" size="small" onClick={() => openDeliver(r.id)}>登记上线</Button>
                    ) : (
                      <Text style={{ fontSize: 12, color: c.success }}>已上线</Text>
                    )
                }
              ]}
            />
          ) : (
            <Blank text="该条件下暂无数据 · [重置筛选]" compact />
          )}
        </Card>
      </div>
    );
  };

  return (
    <div>
      {holder}
      {view === 'brd' && renderBrd()}
      {view === 'eval' && renderEval()}
      {view === 'cr' && renderCr()}
      {view === 'deliver' && renderDeliver()}

      {/* ---------------- 提报 BRD ---------------- */}
      <Modal
        open={createOpen}
        title="提报业务需求（BRD）"
        width={760}
        okText="提交 BRD"
        cancelText="取消"
        onCancel={() => setCreateOpen(false)}
        onOk={async () => {
          try {
            const v = await createForm.validateFields();
            const id = submitBRD({
              fy: v.fy,
              dept: v.dept,
              reporter: v.reporter,
              title: v.title,
              system: v.system,
              relatedDemandId: v.relatedDemandId || null,
              newDemandReason: v.newDemandReason,
              value: v.value,
              expectGoLive: v.expectGoLive ? v.expectGoLive.format('YYYY-MM-DD') : ''
            });
            log(v.reporter, '提报 BRD', id);
            setCreateOpen(false);
            msgApi.success(`BRD 已提交，编号 ${id}`);
          } catch {
            /* 校验失败由表单提示 */
          }
        }}
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="需求溯源是必填项"
          description={
            <span style={{ fontSize: 12 }}>
              请声明本需求关联的年初项目或需求清单编号。若确无关联，系统将自动标记为
              <strong> 年度新增需求 </strong>，并需要填写新增原因 —— 该标记会一路带到月度账单，作为次年预算压降的依据。
            </span>
          }
        />
        <Form form={createForm} layout="vertical" initialValues={{ fy: 2026, dept: 'D-RETAIL', reporter: '陈昊' }}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="title" label="需求标题" rules={[{ required: true, message: '请输入需求标题' }]}>
                <Input placeholder="例如：门店补货建议算法优化" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="fy" label="归属年度" rules={[{ required: true }]}>
                <Select options={[{ value: 2026, label: 'FY2026（执行中）' }, { value: 2027, label: 'FY2027（已规划）' }]} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="dept" label="提报部门" rules={[{ required: true }]}>
                <Select options={data.departments.map((d) => ({ value: d.code, label: d.name }))} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="reporter" label="提报人" rules={[{ required: true, message: '请输入提报人' }]}>
                <Input placeholder="姓名" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="system" label="承接系统" rules={[{ required: true, message: '请选择承接系统' }]}>
                <Select options={data.systems.map((s) => ({ value: s.id, label: `${s.id} ${s.name}` }))} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="expectGoLive" label="期望上线时间" rules={[{ required: true, message: '请选择期望上线时间' }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="relatedDemandId" label="关联年初需求 / 项目">
                <Select
                  allowClear
                  placeholder="可留空（即年度新增需求）"
                  options={data.demands.filter((d) => d.fy === 2026).map((d) => ({ value: d.id, label: `${d.id} ${d.title}` }))}
                />
              </Form.Item>
            </Col>
          </Row>

          {!linkedDemandId && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message="未关联年初需求 —— 本单将被标记为「年度新增需求」"
              description={
                <Form.Item
                  name="newDemandReason"
                  label="新增原因说明"
                  rules={[{ required: true, message: '年度新增需求必须说明原因' }]}
                  style={{ marginBottom: 0, marginTop: 8 }}
                >
                  <Input.TextArea rows={2} placeholder="例如：FY2026 需求清单评审时未预见 / 业务组织调整后新增诉求" />
                </Form.Item>
              }
            />
          )}

          <Form.Item name="value" label="业务价值说明" rules={[{ required: true, message: '请说明业务价值' }]}>
            <Input.TextArea rows={3} placeholder="量化说明预期收益，例如：降低断货率 3pct、提升转化率 1.2pct" />
          </Form.Item>

          <Form.Item label="BRD 附件">
            <Input placeholder="BRD 文档链接（示意）" addonBefore="链接" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ---------------- 评估签收 ---------------- */}
      <Modal
        open={!!evalTarget}
        title={`交付费用评估与签收 · ${evalTarget || ''}`}
        width={780}
        okText="确认签收并锁定评估价"
        cancelText="取消"
        okButtonProps={{ icon: <CheckOutlined /> }}
        onCancel={() => setEvalTarget(null)}
        onOk={() => {
          signOffBRD(evalTarget, evalLines.map((l) => [l.role, l.md]), '郑亦凡');
          log('郑亦凡', '签收 BRD 并锁定评估价', evalTarget);
          setEvalTarget(null);
          msgApi.success('已签收，评估价已锁定，进入预算池「已承诺」口径');
        }}
      >
        {evalBrd && (
          <>
            <Descriptions size="small" column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="需求标题">{evalBrd.title}</Descriptions.Item>
              <Descriptions.Item label="提报部门">{data.departments.find((d) => d.code === evalBrd.dept)?.name}</Descriptions.Item>
              <Descriptions.Item label="需求来源"><DemandTypeTag type={evalBrd.relationType} /></Descriptions.Item>
              <Descriptions.Item label="关联年初需求">{evalBrd.relatedDemandId || <Text type="secondary">无（年度新增）</Text>}</Descriptions.Item>
              <Descriptions.Item label="业务价值" span={2}>
                <Paragraph style={{ marginBottom: 0, fontSize: 12 }}>{evalBrd.value}</Paragraph>
              </Descriptions.Item>
            </Descriptions>
            <Hint>
              以 <strong>人天 × 费率表（Rate Card）</strong> 计价。费率在预算期锁定、全年不调价。本次使用 <strong>FY{evalBrd.fy}</strong> 费率表。
            </Hint>
            <div style={{ marginTop: 16 }}>
              <BlockTitle>工作量明细</BlockTitle>
              <MdEditor lines={evalLines} onChange={setEvalLines} fy={evalBrd.fy} rateCards={data.rateCards} />
            </div>
            <Divider style={{ margin: '12px 0' }} />
            <Flex justify="space-between">
              <Text style={{ fontSize: 12, color: c.t3 }}>签收后该金额计入部门预算池「已承诺」，在上线月份的账单中核销。</Text>
              <Text strong style={{ fontSize: 14 }}>
                评估价 <Text style={{ color: c.brand, fontSize: 16 }}>{fmtYuan(mdAmount(data.rateCards, evalBrd.fy, evalLines.map((l) => [l.role, l.md])))}</Text>
              </Text>
            </Flex>
          </>
        )}
      </Modal>

      {/* ---------------- 新增变更 ---------------- */}
      <Modal
        open={crOpen}
        title={`新增变更单（CR）${crTarget ? ' · ' + crTarget : ''}`}
        width={720}
        okText="提交变更"
        cancelText="取消"
        onCancel={() => setCrOpen(false)}
        onOk={async () => {
          try {
            const v = await crForm.validateFields();
            const brdId = crTarget || v.brdId;
            addCR(brdId, { type: v.type, desc: v.desc, delta: crLines.map((l) => [l.role, l.md]), approvedBy: '郑亦凡' });
            log('郑亦凡', `批准变更（${v.type}）`, brdId);
            setCrOpen(false);
            msgApi.success('变更已批准，将随账单单独标注计价依据');
          } catch {
            /* 校验失败 */
          }
        }}
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="变更独立计价，不计入原评估价"
          description={
            <span style={{ fontSize: 12 }}>
              变更金额与原评估价分开记录，账单中会标注「是否存在项目范围或需求变更」及计价依据，确保业务部门能看清每一笔追加的来源与审批人。
            </span>
          }
        />
        <Form form={crForm} layout="vertical" initialValues={{ type: '范围变更' }}>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="brdId" label="所属 BRD" rules={crTarget ? [] : [{ required: true, message: '请选择所属 BRD' }]}>
                <Select
                  disabled={!!crTarget}
                  placeholder="选择所属 BRD"
                  options={data.brds.map((b) => ({ value: b.id, label: `${b.id} ${b.title}` }))}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="type" label="变更类型" rules={[{ required: true }]}>
                <Select options={CR_TYPES.map((t) => ({ value: t, label: t }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="desc" label="变更说明" rules={[{ required: true, message: '请填写变更说明' }]}>
                <Input placeholder="例如：新增区域差异化补货参数配置" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
        <BlockTitle>增减工作量</BlockTitle>
        <MdEditor lines={crLines} onChange={setCrLines} fy={crTarget ? data.brds.find((b) => b.id === crTarget)?.fy || 2026 : 2026} rateCards={data.rateCards} />
      </Modal>

      {/* ---------------- 登记上线 ---------------- */}
      <Modal
        open={!!deliverTarget}
        title={`登记交付上线 · ${deliverTarget || ''}`}
        width={780}
        okText="确认上线"
        cancelText="取消"
        okButtonProps={{ icon: <RocketOutlined /> }}
        onCancel={() => setDeliverTarget(null)}
        onOk={async () => {
          try {
            const v = await deliverForm.validateFields();
            deliverBRD(deliverTarget, {
              goLiveDate: v.goLiveDate.format('YYYY-MM-DD'),
              actualLines: deliverLines.map((l) => [l.role, l.md]),
              note: v.note
            });
            log('顾晓东', '登记交付上线', deliverTarget);
            setDeliverTarget(null);
            msgApi.success('已登记上线，将于上线月份自动生成交付计费账单行');
          } catch {
            /* 校验失败 */
          }
        }}
      >
        {deliverBrd && (
          <>
            <Descriptions size="small" column={3} style={{ marginBottom: 12 }}>
              <Descriptions.Item label="评估人天">{fmtNum(mdTotal(deliverBrd.evalLines))}</Descriptions.Item>
              <Descriptions.Item label="评估价">{fmtYuan(brdFinalAmount(data, deliverBrd))}</Descriptions.Item>
              <Descriptions.Item label="上线月份">
                <Text>{deliverForm.getFieldValue('goLiveDate') ? deliverForm.getFieldValue('goLiveDate').format('YYYY-MM') : '—'}</Text>
              </Descriptions.Item>
            </Descriptions>
            <Form form={deliverForm} layout="vertical" initialValues={{ goLiveDate: dayjs('2026-12-15') }}>
              <Row gutter={12}>
                <Col span={8}>
                  <Form.Item name="goLiveDate" label="实际上线日期" rules={[{ required: true, message: '请选择上线日期' }]}>
                    <DatePicker style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={16}>
                  <Form.Item name="note" label="交付说明">
                    <Input placeholder="选填" />
                  </Form.Item>
                </Col>
              </Row>
            </Form>
            <BlockTitle>实际投入人天</BlockTitle>
            <MdEditor lines={deliverLines} onChange={setDeliverLines} fy={deliverBrd.fy} rateCards={data.rateCards} />
            <Hint>
              结算基准为 <strong>实际投入人天 × 费率表</strong>，与评估价的差异会自动生成偏差分析，用于反哺次年需求清单的估算精度。
            </Hint>
          </>
        )}
      </Modal>

      {/* ---------------- BRD 详情抽屉（内嵌 TraceChain） ---------------- */}
      <Drawer
        open={!!detailBrd}
        onClose={() => setDetailId(null)}
        width={860}
        title={detailBrd ? `BRD 详情 · ${detailBrd.id}` : ''}
      >
        {detailBrd && detailTrace && (
          <div data-testid="delivery-brd-drawer">
            <TraceChain
              nodes={brdChainNodes(data, detailBrd)}
              onDrill={(key) => {
                const t = drillTargetOf(key, {
                  brdId: detailBrd.id,
                  demandId: detailBrd.relatedDemandId,
                  billId: detailTrace.billId
                });
                if (t) onNavigate(t[0], t[1], t[2]);
              }}
            />

            {!detailTrace.demand && (
              <div style={{ fontSize: 12, color: c.warning, margin: '4px 0 12px' }}>
                本需求为年度新增需求，无年初需求清单可溯源：{detailBrd.newDemandReason || '未说明原因'}
              </div>
            )}

            <Descriptions size="small" bordered column={2} title="基本信息" style={{ marginTop: 16 }}>
              <Descriptions.Item label="需求标题" span={2}>{detailBrd.title}</Descriptions.Item>
              <Descriptions.Item label="提报部门">{data.departments.find((d) => d.code === detailBrd.dept)?.name}</Descriptions.Item>
              <Descriptions.Item label="提报人">{detailBrd.reporter}</Descriptions.Item>
              <Descriptions.Item label="承接系统">{detailBrd.system}</Descriptions.Item>
              <Descriptions.Item label="期望上线">{detailBrd.expectGoLive}</Descriptions.Item>
              <Descriptions.Item label="需求来源"><DemandTypeTag type={detailBrd.relationType} /></Descriptions.Item>
              <Descriptions.Item label="状态"><BrdStatusTag status={detailBrd.status} /></Descriptions.Item>
              <Descriptions.Item label="业务价值" span={2}>
                <Paragraph style={{ marginBottom: 0, fontSize: 12 }}>{detailBrd.value}</Paragraph>
              </Descriptions.Item>
            </Descriptions>

            <Divider orientation="left" style={{ marginTop: 20 }}>对年初需求的溯源</Divider>
            {detailTrace.demand ? (
              <Flex vertical gap={8}>
                <Flex justify="space-between">
                  <Text style={{ fontSize: 13 }}>{detailTrace.demand.title}</Text>
                  <Text style={{ fontSize: 12, color: c.t3 }}>{detailTrace.demand.id}</Text>
                </Flex>
                <Flex gap={24} wrap>
                  <Statistic title="清单预估人天" value={detailTrace.demand.estMD} suffix="人天" valueStyle={{ fontSize: 14 }} />
                  <Statistic title="清单预估金额" value={fmtWan(detailTrace.demand.estAmount)} suffix="万元" valueStyle={{ fontSize: 14 }} />
                  <Statistic title="实际评估人天" value={fmtNum(detailTrace.evalMD)} suffix="人天" valueStyle={{ fontSize: 14 }} />
                  <Statistic title="最终结算价" value={fmtWan(detailTrace.finalAmount)} suffix="万元" valueStyle={{ fontSize: 14 }} />
                </Flex>
                <Hint>
                  <span>
                    估算偏差：
                    <strong style={{ color: detailTrace.finalAmount > detailTrace.demand.estAmount ? c.danger : c.success }}>
                      {' '}{fmtPct(detailTrace.finalAmount / detailTrace.demand.estAmount - 1, 1)}
                    </strong>
                    。估算阶段使用混岗均价 ¥2,850/人天，签收后切换为明细费率，因此小额偏差属正常范围。
                  </span>
                </Hint>
              </Flex>
            ) : (
              <Alert
                type="warning"
                showIcon
                message="本需求为年度新增需求，无年初需求清单可溯源"
                description={<span style={{ fontSize: 12 }}>{detailBrd.newDemandReason}</span>}
              />
            )}

            <Divider orientation="left">交付费用评估</Divider>
            {detailBrd.evalLines.length ? (
              <Table
                size="small"
                pagination={false}
                rowKey={(r) => r[0]}
                dataSource={detailBrd.evalLines}
                columns={[
                  { title: '角色', dataIndex: 0, render: (v) => `${ROLES.find((r) => r.code === v)?.name || v}（${v}）` },
                  { title: '人天', dataIndex: 1, width: 90, align: 'right', render: (v) => fmtNum(v) },
                  { title: '费率', width: 110, align: 'right', render: (_, r) => fmtYuan(rateOf(data.rateCards, detailBrd.fy, r[0])) },
                  { title: '金额', width: 130, align: 'right', render: (_, r) => fmtYuan(r[1] * rateOf(data.rateCards, detailBrd.fy, r[0])) }
                ]}
                footer={() => (
                  <Flex justify="space-between">
                    <Text>{`评估人：${detailBrd.evalBy || '—'} · ${detailBrd.evalDate || ''}`}</Text>
                    <Text strong>评估价 {fmtYuan(brdEvalAmount(data, detailBrd))}</Text>
                  </Flex>
                )}
              />
            ) : (
              <Blank text="尚未出具交付费用评估" compact />
            )}

            <Divider orientation="left">变更记录（CR）</Divider>
            {detailBrd.crs && detailBrd.crs.length ? (
              <Table
                size="small"
                pagination={false}
                rowKey="id"
                dataSource={detailBrd.crs}
                columns={[
                  { title: '编号', dataIndex: 'id', width: 130, render: (v) => <Text style={{ fontSize: 12, color: c.brand }}>{v}</Text> },
                  { title: '类型', dataIndex: 'type', width: 96, render: (v) => <Tag color="warning" style={{ marginInlineEnd: 0 }}>{v}</Tag> },
                  { title: '说明', dataIndex: 'desc' },
                  { title: '增减金额', align: 'right', width: 120, render: (_, r) => fmtYuan(mdAmount(data.rateCards, detailBrd.fy, r.delta)) },
                  { title: '审批', dataIndex: 'approvedBy', width: 80 }
                ]}
                footer={() => (
                  <Flex justify="flex-end">
                    <Text strong>变更合计 {fmtYuan(brdCRDelta(data, detailBrd))}</Text>
                  </Flex>
                )}
              />
            ) : (
              <Blank text="无范围或需求变更" compact />
            )}

            {detailBrd.delivery && (
              <>
                <Divider orientation="left">交付与结算</Divider>
                <Descriptions size="small" bordered column={2}>
                  <Descriptions.Item label="实际上线日期">{detailBrd.delivery.goLiveDate}</Descriptions.Item>
                  <Descriptions.Item label="实际投入人天">{fmtNum(mdTotal(detailBrd.delivery.actualLines))}</Descriptions.Item>
                  <Descriptions.Item label="评估人天">{fmtNum(detailTrace.evalMD)}</Descriptions.Item>
                  <Descriptions.Item label="人天偏差">
                    <Text style={{ color: mdTotal(detailBrd.delivery.actualLines) > detailTrace.evalMD ? c.danger : c.success }}>
                      {fmtPct(mdTotal(detailBrd.delivery.actualLines) / detailTrace.evalMD - 1, 1)}
                    </Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="合同结算基准（评估价 + CR）">{fmtYuan(detailTrace.finalAmount)}</Descriptions.Item>
                  <Descriptions.Item label="按实际人天核算">{detailTrace.actualAmount ? fmtYuan(detailTrace.actualAmount) : '—'}</Descriptions.Item>
                  <Descriptions.Item label="出账账单" span={2}>
                    {detailTrace.billId} · {detailTrace.billStatus === 'CONFIRMED' ? '已确认核销' : detailTrace.billStatus === 'SENT' ? '已发出待确认' : '待出账'}
                  </Descriptions.Item>
                </Descriptions>
              </>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
