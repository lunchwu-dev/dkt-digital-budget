import React, { useEffect, useState } from 'react';
import { Drawer, Tabs, Table, Flex, Typography } from 'antd';
import { useT } from '../theme.js';
import { useStore } from '../store.jsx';
import { PoolMeter, Hint } from './common.jsx';

const { Text } = Typography;

/* ------------------------------------------------------------------ *
 * 骨架数据（Demo 占位，第二轮补齐为完整只读矩阵）
 * ------------------------------------------------------------------ */

const PERM_DOMAINS = ['预算管理', '计费账单', '项目管理', '平台设置', '主数据'];
const PERM_ROLES = [
  { role: '超级管理员', grant: 'all' },
  { role: 'Digital 负责人', grant: ['预算管理', '计费账单', '项目管理', '主数据'] },
  { role: 'Digital 交付经理', grant: ['预算管理', '计费账单', '项目管理'] },
  { role: '业务部门负责人', grant: ['预算管理', '计费账单', '项目管理'] },
  { role: '业务提报人', grant: ['预算管理', '项目管理'] },
  { role: '财务', grant: ['计费账单', '主数据'] }
];

const APPROVAL_TIERS = [
  { tier: '≤ 5 万', items: 'CR 变更 · 范围调整', approver: 'Digital 交付经理' },
  { tier: '5 – 20 万', items: 'CR 变更 · 需求新增', approver: 'Digital 负责人' },
  { tier: '20 – 50 万', items: 'CR 变更 · 年度新增需求', approver: 'Digital 负责人 + 财务' },
  { tier: '> 50 万', items: '预算池额度调节', approver: 'Digital 负责人 + 财务 + 部门负责人' }
];

/* ------------------------------------------------------------------ *
 * 四个页签
 * ------------------------------------------------------------------ */

function PermissionMatrix() {
  const c = useT();
  const columns = [
    { title: '角色', dataIndex: 'role', width: 168, fixed: 'left' },
    ...PERM_DOMAINS.map((d) => ({
      title: d,
      dataIndex: d,
      width: 96,
      align: 'center',
      render: (v) =>
        v ? (
          <span style={{ color: c.success }}>✓</span>
        ) : (
          <span style={{ color: c.t4 }}>—</span>
        )
    }))
  ];
  const rows = PERM_ROLES.map((r) => {
    const o = { key: r.role, role: r.role };
    PERM_DOMAINS.forEach((d) => {
      o[d] = r.grant === 'all' || (Array.isArray(r.grant) && r.grant.includes(d));
    });
    return o;
  });
  return (
    <>
      <Hint>只读骨架：数值与角色定义以《设计系统 / DESIGN.md》角色矩阵为准，第二轮补齐完整字段。</Hint>
      <Table
        size="small"
        style={{ marginTop: 12 }}
        rowKey="role"
        columns={columns}
        dataSource={rows}
        pagination={false}
        scroll={{ x: 760 }}
      />
    </>
  );
}

function ApprovalMatrix() {
  return (
    <>
      <Hint>只读骨架：审批分级用于 CR 与额度调节的审批链提示，第二轮补齐完整分级。</Hint>
      <Table
        size="small"
        style={{ marginTop: 12 }}
        rowKey="tier"
        pagination={false}
        columns={[
          { title: '金额分级', dataIndex: 'tier', width: 140 },
          { title: '适用事项', dataIndex: 'items' },
          { title: '审批人', dataIndex: 'approver', width: 260 }
        ]}
        dataSource={APPROVAL_TIERS.map((t) => ({ key: t.tier, ...t }))}
      />
    </>
  );
}

function AuditLogTable() {
  const c = useT();
  const { auditLog } = useStore();
  return (
    <Table
      size="small"
      rowKey="id"
      pagination={{ pageSize: 8, showSizeChanger: false, showTotal: (t) => `共 ${t} 条` }}
      columns={[
        { title: '时间', dataIndex: 'at', width: 150, render: (v) => <span style={{ color: c.t2 }}>{v}</span> },
        { title: '操作人', dataIndex: 'actor', width: 100 },
        { title: '动作', dataIndex: 'action', width: 140 },
        {
          title: '对象',
          dataIndex: 'target',
          render: (v) => <span style={{ color: c.brand, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
        }
      ]}
      dataSource={auditLog}
    />
  );
}

function MasterDataOverview() {
  const c = useT();
  const { data, derived } = useStore();
  const rateRow = data.rateCards[2026] || {};
  const roleCount = Object.keys(rateRow).filter((k) => k !== '__fy').length;
  const cards = [
    { title: '费率表', value: `${roleCount} 类角色`, to: '计费账单 · 计费规则' },
    { title: '系统目录', value: `${data.systems.length} 个系统`, to: '计费账单 · 计费规则' },
    { title: '部门年度预算', value: `${data.departments.length} 个部门`, to: '预算管理 · 年度预算计划' }
  ];
  return (
    <>
      <Hint>聚合页（补偿主数据入口分散）：此处只做导航聚合 + 只读预览，不承担编辑。</Hint>
      <Flex gap={12} style={{ marginTop: 12 }} wrap>
        {cards.map((x) => (
          <div
            key={x.title}
            style={{
              flex: '1 1 200px',
              border: `1px solid ${c.border}`,
              borderRadius: c.radius,
              background: c.bg1,
              padding: 14
            }}
          >
            <Text style={{ fontSize: 12, color: c.t3 }}>{x.title}</Text>
            <div style={{ fontSize: 16, fontWeight: 500, color: c.t1, marginTop: 6 }}>{x.value}</div>
            <Text style={{ fontSize: 12, color: c.brand, display: 'block', marginTop: 8 }}>{x.to}</Text>
          </div>
        ))}
      </Flex>

      <div style={{ marginTop: 20 }}>
        <Text style={{ fontSize: 14, fontWeight: 500, color: c.t1 }}>FY2026 三口径快照</Text>
        <Table
          size="small"
          style={{ marginTop: 12 }}
          rowKey="deptCode"
          pagination={false}
          dataSource={derived.pool26.rows}
          columns={[
            { title: '部门', dataIndex: 'deptName', width: 120 },
            {
              title: '消耗进度（已核销 / 已承诺 / 可用）',
              dataIndex: 'usageRate',
              render: (v, r) => (
                <div style={{ minWidth: 240 }}>
                  <PoolMeter pool={r} height={10} showLegend={false} showPlanned={false} />
                </div>
              )
            }
          ]}
        />
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * 抽屉
 * ------------------------------------------------------------------ */

export default function SettingsDrawer({ open, onClose }) {
  const c = useT();
  const [tab, setTab] = useState('perm');

  // 页签状态不持久化：每次打开回到第 1 页签
  useEffect(() => {
    if (open) setTab('perm');
  }, [open]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="min(960px, 92vw)"
      title={
        <div>
          <div style={{ fontSize: 16, fontWeight: 500, color: c.t1 }}>平台设置</div>
          <div style={{ fontSize: 12, color: c.t3, marginTop: 2 }}>仅超级管理员可见 · 变更写入审计日志</div>
        </div>
      }
      footer={
        <Text style={{ fontSize: 12, color: c.t3 }}>Demo 仅演示超级管理员单一角色，无角色切换</Text>
      }
    >
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: 'perm', label: '权限矩阵', children: <PermissionMatrix /> },
          { key: 'approve', label: '审批矩阵', children: <ApprovalMatrix /> },
          { key: 'audit', label: '审计日志', children: <AuditLogTable /> },
          { key: 'master', label: '主数据总览', children: <MasterDataOverview /> }
        ]}
      />
    </Drawer>
  );
}
