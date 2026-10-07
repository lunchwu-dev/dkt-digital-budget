/**
 * 账单明细板块（v1.4.2 新增）——《对账单总览》交付计费 / 系统运维计费两块
 *
 * 两块都**随月份选择器联动**（month = null 表示累计态），与趋势图、
 * 部门账单同源同区间：用户在任何板块看到的都是「同一个账期口径」。
 *
 * v1.4.4：移除 `floorNo`（楼层序号胶囊）—— 编号对读者无意义，详见 common.jsx FloorHead。
 *
 * 取数纪律：金额、ROI、用量、分摊清单**一律经 calc.js**（deliveryBillRows /
 * opsBillRows），本文件只负责排版与列定义，不做任何累加 —— 否则本板块合计
 * 会与部门账单的合计对不上。
 */
import React, { useMemo } from 'react';
import { Card, Table, Flex, Typography, Tag, Tooltip } from 'antd';
import { FileTextOutlined, LinkOutlined } from '@ant-design/icons';
import { useT } from '../theme.js';
import { useStore, calc } from '../store.jsx';
import { FloorHead, Blank, TextTag } from '../components/common.jsx';

const { Text } = Typography;
const { fmtWan, fmtYuan, fmtNum, fmtPct, deliveryBillRows, opsBillRows } = calc;

const BILLING_MODE_LABEL = { order: '按订单量', member: '按会员规模', fixed: '固定年费' };

/* ================================================================== *
 * 列宽表 —— **列宽与 scroll.x 的唯一来源**
 *
 * 核算式（有效可用宽 = 视口 − Sider 224 − Content padding 48
 *                    − Card body padding 32 − 竖向滚动条 15）：
 *   1366 屏 ≈ 1047px ／ 1280 屏 ≈ 961px
 * 交付板块 9 列 = 1500、运维板块 6 列 = 860
 *   → 交付板块**允许**横滚（9 列信息量已超单屏，硬压宽度会把「项目描述」
 *     和「业务复盘文档」压成不可读）；运维板块 860 ≤ 961，1280 屏也不滚。
 * 交付层级的横滚是**显式取舍**，不是列宽核算失误。
 * ================================================================== */
const COL_DELIVERY = {
  brdId: 132, // 项目编号 BRD-2026-0101
  title: 190, // 项目名称
  desc: 180, // 项目描述（v1.6 P1-11：260 → 180）
  dept: 110, // 发起项目的BU
  goLive: 110, // 交付上线时间
  retro: 150, // 业务复盘文档
  value: 130, // 业务量化价值
  fee: 140, // digital费用（fixed:'right'，常驻可见）
  roi: 90 // ROI
};
/* v1.6 P1-11：合计 1312 → 1232。
   原先 `desc` 占 260px 却只显示 2 行（maxHeight:40 截断，余下靠 Tooltip 悬浮），
   而「业务量化价值 / digital 费用 / ROI」这三个数字列被整体挤出 1366 屏首屏
   （可用宽 ≈ 1047px：1366 − sider 224 − 页面 padding 48 − Card body padding 32
   − 边框 2 − 竖向滚动条 15 = 1047）。
   省下的 80px 正好把 `value` 推进首屏；`fee` 再加 fixed:'right' 常驻，
   保证「这张账单花了多少」在任何滚动位置都不用横拖才看得到。 */
const DELIVERY_SCROLL_X = Object.values(COL_DELIVERY).reduce((a, b) => a + b, 0); // 1232

const COL_OPS = {
  name: 220, // 系统名称
  mode: 130, // 计费方式
  rate: 150, // 单价
  volume: 150, // 用量（按选定时间段）
  amount: 160, // 总费用
  shares: 320 // 分摊费用的BU清单
};
const OPS_SCROLL_X = Object.values(COL_OPS).reduce((a, b) => a + b, 0); // 1130

/* ------------------------------------------------------------------ *
 * 交付项目计费账单总览（总览页与部门详情页共用）
 * ------------------------------------------------------------------ */
export function DeliveryBillFloor({ month, isCumulative, lastBilledMonth, floorTitle = "交付项目计费账单总览", deptCode = null }) {
  const c = useT();
  const { data } = useStore();

  const { rows, totalAmount, retroPending } = useMemo(() => deliveryBillRows(data, month, deptCode), [data, month, deptCode]);

  const columns = [
    {
      title: '项目编号',
      dataIndex: 'brdId',
      width: COL_DELIVERY.brdId,
      render: (v) => <Text style={{ fontSize: 12, color: c.brand }}>{v}</Text>
    },
    {
      title: '项目名称',
      dataIndex: 'title',
      width: COL_DELIVERY.title,
      sorter: (a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'zh-Hans-CN'),
      render: (v) => (
        <Text style={{ fontSize: 12 }} ellipsis={{ tooltip: v }}>
          {v}
        </Text>
      )
    },
    {
      title: '项目描述',
      dataIndex: 'desc',
      width: COL_DELIVERY.desc,
      render: (v) => (
        /* v1.6 P1-11：宽度 260→180 后仍用两行截断（maxHeight:40），
           只是截断得更早；Tooltip 悬浮看全的行为不变。
           不用 antd 的 `ellipsis={{tooltip}}` —— 那会变成**单行 + 省略号**，
           与"两行正文"的既有观感不一致。 */
        <Tooltip title={v} placement="topLeft">
          <div style={{ fontSize: 11, color: c.t2, lineHeight: 1.5, maxHeight: 40, overflow: 'hidden' }}>{v}</div>
        </Tooltip>
      )
    },
    {
      title: '发起项目的BU',
      dataIndex: 'deptName',
      width: COL_DELIVERY.dept,
      render: (v) => <Text style={{ fontSize: 12 }}>{v}</Text>
    },
    {
      title: '交付上线时间',
      dataIndex: 'goLiveDate',
      width: COL_DELIVERY.goLive,
      align: 'right',
      sorter: (a, b) => String(a.goLiveDate || '').localeCompare(String(b.goLiveDate || '')),
      render: (v) => <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{v || '—'}</span>
    },
    {
      title: '业务复盘文档',
      dataIndex: 'retroDoc',
      width: COL_DELIVERY.retro,
      render: (v, r) =>
        v ? (
          <a
            href={v}
            target="_blank"
            rel="noreferrer"
            data-testid={`billing-retro-link-${r.brdId}`}
            style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <LinkOutlined style={{ fontSize: 11 }} />
            查看复盘
          </a>
        ) : (
          <Tooltip title="项目已上线但业务复盘尚未完成，故暂无量化增量价值">
            <Text style={{ fontSize: 12, color: c.t3 }}>待复盘</Text>
          </Tooltip>
        )
    },
    {
      /* 业务量化价值 = **上线后复盘认定的实际增量价值**（brd.realizedValue），
         不是 BRD 立项时的预估 value，也不是 DM 清单的 bizValueAmount ——
         那是上线「前」的预期，混用会让 ROI 变成自证。 */
      title: '业务量化价值',
      dataIndex: 'realizedValue',
      width: COL_DELIVERY.value,
      align: 'right',
      render: (v) =>
        v == null ? (
          <Text style={{ fontSize: 12, color: c.t3 }}>—</Text>
        ) : (
          <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{fmtWan(v)}</span>
        )
    },
    {
      /* digital 费用 = 账单行金额（评估价 + 已批准变更），与账单同源。
         v1.6 P1-11：`fixed:'right'` —— 1366 屏下表格必横滚，而"这张账单花了多少"
         是唯一必须**在任何滚动位置都看得到**的列，固定在右侧不随横拖移出视野。
         v1.6 P1-12：加 sorter（金额降序默认视图未改，仅提供手动排序入口）。 */
      title: 'digital费用（万元）',
      dataIndex: 'amount',
      width: COL_DELIVERY.fee,
      align: 'right',
      fixed: 'right',
      sorter: (a, b) => a.amount - b.amount,
      render: (v) => <strong style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{fmtWan(v)}</strong>
    },
    {
      title: 'ROI',
      dataIndex: 'roi',
      width: COL_DELIVERY.roi,
      align: 'right',
      sorter: (a, b) => (a.roi ?? -1) - (b.roi ?? -1),
      render: (v) =>
        v == null ? (
          <Text style={{ fontSize: 12, color: c.t3 }}>—</Text>
        ) : (
          <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12, fontWeight: 500 }}>{v.toFixed(2)}</span>
        )
    }
  ];

  return (
    <Card
      data-testid="billing-delivery-floor"
      styles={{ body: { padding: 16 } }}
      style={{ marginBottom: 12, borderTop: `3px solid ${c.brand}` }}
    >
      <FloorHead
        note={
          isCumulative
            ? `累计至最近已出账月 ${lastBilledMonth || '—'}，共 ${rows.length} 个交付计费项目，其中 ${retroPending} 个待业务复盘`
            : `${month} 交付计费项目，共 ${rows.length} 个`
        }
        extra={
          <Flex align="center" gap={14} style={{ fontSize: 12, color: c.t3, fontWeight: 400 }}>
            <Text style={{ fontSize: 12, color: c.t2 }}>
              digital 费用合计{' '}
              <strong style={{ color: c.t1, fontVariantNumeric: 'tabular-nums' }}>{fmtWan(totalAmount)}</strong> 万元
            </Text>
            {retroPending > 0 ? <TextTag tone="warn">{retroPending} 个待复盘</TextTag> : <TextTag tone="ok">全部已复盘</TextTag>}
          </Flex>
        }
      >
        {floorTitle}
      </FloorHead>

      {rows.length ? (
        <Table
          size="small"
          rowKey="key"
          columns={columns}
          dataSource={rows}
          pagination={false}
          scroll={{ x: DELIVERY_SCROLL_X }}
        />
      ) : (
        <Blank text={isCumulative ? '累计区间内暂无交付计费项目' : `${month} 无交付计费项目`} compact />
      )}

      <div style={{ marginTop: 10, fontSize: 12, color: c.t3, lineHeight: 1.7 }}>
        口径：每行 = 一条交付计费行（同项目仅在交付上线月出账一次，累计态下不重复计数）。
        <strong> digital 费用</strong> = 账单行金额（评估价 + 已批准变更），与部门账单同源。
        <strong> 业务量化价值 / ROI</strong> 取自
        <strong>上线后业务复盘</strong>认定的实际增量价值 —— 不是立项预估，故未完成复盘时显「待复盘 / —」，
        不做金额假设。
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * 系统运维计费账单总览（总览页与部门详情页共用）
 * ------------------------------------------------------------------ */
export function OpsBillFloor({ month, isCumulative, lastBilledMonth, billedMonthCount, floorTitle = "系统运维计费账单总览", deptCode = null }) {
  const c = useT();
  const { data } = useStore();

  const { rows, totalAmount } = useMemo(() => opsBillRows(data, month, deptCode), [data, month, deptCode]);

  const columns = [
    {
      title: '系统名称',
      dataIndex: 'systemName',
      width: COL_OPS.name,
      render: (v, r) => (
        <Flex vertical gap={2}>
          <Text style={{ fontSize: 13, fontWeight: 500 }}>{v}</Text>
          <Text style={{ fontSize: 11, color: c.t3 }}>{r.systemId} · {r.line}</Text>
        </Flex>
      )
    },
    {
      title: '计费方式',
      dataIndex: 'billingMode',
      width: COL_OPS.mode,
      render: (v) => <Tag style={{ marginInlineEnd: 0 }}>{BILLING_MODE_LABEL[v]}</Tag>
    },
    {
      title: '单价',
      dataIndex: 'rate',
      width: COL_OPS.rate,
      align: 'right',
      render: (v, r) => (
        <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
          {r.billingMode === 'fixed' ? r.unit : `¥${v} ${r.unit}`}
        </span>
      )
    },
    {
      /* 用量 = 区间内各月计量值之和。固定年费类无计量值（buildBill 里 volume=null），
         必须显「固定年费 / 月」而非 0 —— 0 会被读成「没用量」。 */
      title: '用量（按选定时间段）',
      dataIndex: 'volume',
      width: COL_OPS.volume,
      align: 'right',
      render: (v, r) =>
        v == null ? (
          <Text style={{ fontSize: 12, color: c.t3 }}>固定年费 / 月</Text>
        ) : (
          <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
            {fmtNum(v)} {r.billingMode === 'order' ? '单' : '千人'}
            {isCumulative && billedMonthCount > 1 ? (
              <Text style={{ fontSize: 11, color: c.t3 }}>（{billedMonthCount} 个月累计）</Text>
            ) : null}
          </span>
        )
    },
    {
      title: '总费用（万元）',
      dataIndex: 'amount',
      width: COL_OPS.amount,
      align: 'right',
      render: (v) => <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtWan(v)}</strong>
    },
    /* v1.4.3：分摊 BU 清单**仅在总览页需要** ——
       部门详情页已锁定单一部门，「摊给了谁」是既定事实，再列一列属同源重复。
       故详情页（deptCode 有值）整列去掉，scroll.x 同步收窄。 */
    ...(deptCode
      ? []
      : [
          {
            title: '分摊费用的BU清单',
            dataIndex: 'shares',
            width: COL_OPS.shares,
            render: (v) => (
              <Flex vertical gap={2}>
                {v.map((s) => (
                  <Flex key={s.deptCode} justify="space-between" align="center" gap={8}>
                    <Text style={{ fontSize: 11, color: c.t2, whiteSpace: 'nowrap' }}>{s.deptName}</Text>
                    <Text style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', color: c.t2 }}>{fmtWan(s.amount)}</Text>
                  </Flex>
                ))}
              </Flex>
            )
          }
        ])
  ];

  return (
    <Card
      data-testid="billing-ops-floor"
      styles={{ body: { padding: 16 } }}
      style={{ marginBottom: 12, borderTop: `3px solid ${c.meterCommitted}` }}
    >
      <FloorHead
        note={
          isCumulative
            ? `累计至最近已出账月 ${lastBilledMonth || '—'}（${billedMonthCount} 个月），共 ${rows.length} 个计费系统`
            : `${month} 计费系统，共 ${rows.length} 个`
        }
        extra={
          <Text style={{ fontSize: 12, color: c.t2 }}>
            总费用合计{' '}
            <strong style={{ color: c.t1, fontVariantNumeric: 'tabular-nums' }}>{fmtWan(totalAmount)}</strong> 万元
          </Text>
        }
      >
        {floorTitle}
      </FloorHead>

      {rows.length ? (
        <Table
          size="small"
          rowKey="key"
          columns={columns}
          dataSource={rows}
          pagination={false}
          scroll={{ x: deptCode ? OPS_SCROLL_X - COL_OPS.shares : OPS_SCROLL_X }}
        />
      ) : (
        <Blank text={isCumulative ? '累计区间内暂无运维计费' : `${month} 无运维计费`} compact />
      )}

      <div style={{ marginTop: 10, fontSize: 12, color: c.t3, lineHeight: 1.7 }}>
        口径：每行 = 一个系统（不按「系统 × 部门」展开）。
        <strong>用量与总费用均为选定区间内各月之和</strong>
        ；固定年费类系统无计量值，用量显「固定年费 / 月」而非 0。
        费率预算期锁定、全年不调价。
      </div>
    </Card>
  );
}
