/**
 * 《站点说明书》（v1.7）—— 侧边栏独立工具页
 *
 * 路由：#/manual/guide
 *
 * 定位：本平台**唯一的统一说明文档**。三大能力板块的评审结论（docs/v1.6-three-blocks-review.md）
 *      与本页的"后续规划"一章同源 —— 评审报告里未完成的事项，就是这里的待办清单。
 *
 * 三条纪律（与其他页面一致）：
 *   ① 所有颜色走 `useT()`，零 hex 字面量（暗色主题自动跟随）；
 *   ② 本页**不读 store、不依赖任何业务数据** —— 说明书不能因为某条 mock 数据变了就失效；
 *      文中出现的数字（8 个部门 / 9 个账期 / 33 条 BRD）是**结构性常量**，不是运行时取数；
 *   ③ 不用 antd 已废弃属性（`Card.bordered` → `variant`、`bodyStyle` → `styles.body`），
 *      否则会触发 antd 弃用告警，冒烟测试的"运行期零告警"断言会 FAIL。
 *
 * DOM 契约（供 tests/smoke.cjs 断言，避免绑定易变文案）：
 *   manual-page            根容器
 *   manual-toc             目录
 *   manual-sec-blocks      第一章
 *   manual-sec-roles       第二章
 *   manual-sec-roadmap     第三章
 *   manual-block-annual    年度预算计划卡
 *   manual-block-consume   预算消耗卡
 *   manual-block-billing   对账单卡
 *   manual-role-biz        业务部门卡
 *   manual-role-digital    Digital 卡
 *   manual-roadmap-next    待实现能力板块
 */
import React from 'react';
import { Card, Tag, Table, Steps, Typography, Flex, Row, Col, Divider, Alert } from 'antd';
import {
  CalendarOutlined, PieChartOutlined, FileTextOutlined, ReadOutlined,
  TeamOutlined, RocketOutlined, DeploymentUnitOutlined, LinkOutlined
} from '@ant-design/icons';
import { useT } from '../theme.js';
import { PageHead, BlockTitle, Hint, TextTag } from '../components/common.jsx';

const { Text, Paragraph } = Typography;

/* ================================================================== *
 * 局部排版组件（只服务本页，不上提到 common.jsx —— 说明书的排版需求
 * 与业务页不同：它要"能扫读、能跳转"，而不是"能操作"）
 * ================================================================== */

/** 章标题：左侧主色竖条 + 序号 + 标题（与楼层 3px 色条语言一致） */
function ChapterHead({ c, id, no, title, desc }) {
  return (
    <div id={id} style={{ marginBottom: 12, scrollMarginTop: 16 }}>
      <Flex align="center" gap={10}>
        <span aria-hidden style={{ width: 3, height: 20, background: c.brand, borderRadius: 2 }} />
        <Text style={{ fontSize: 17, fontWeight: 600, color: c.t1 }}>
          {no}　{title}
        </Text>
      </Flex>
      {desc ? (
        <div style={{ marginTop: 6, marginLeft: 13, fontSize: 12.5, color: c.t2, lineHeight: 1.75 }}>{desc}</div>
      ) : null}
    </div>
  );
}

/** 小节标题 */
function SubHead({ c, id, title, tag }) {
  return (
    <Flex id={id} align="center" gap={8} style={{ margin: '18px 0 10px', scrollMarginTop: 16 }}>
      <Text style={{ fontSize: 14, fontWeight: 600, color: c.t1 }}>{title}</Text>
      {tag ? <TextTag tone="info">{tag}</TextTag> : null}
    </Flex>
  );
}

/** 定义列表：术语 → 解释（说明书里最常用的排版） */
function DefList({ c, items, cols = 1 }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: cols === 2 ? 'repeat(auto-fit, minmax(300px, 1fr))' : '1fr',
        gap: cols === 2 ? '10px 24px' : 8
      }}
    >
      {items.map(([term, def]) => (
        <div key={term} style={{ fontSize: 12.5, lineHeight: 1.75 }}>
          <Text style={{ color: c.t1, fontWeight: 500 }}>{term}</Text>
          <Text style={{ color: c.t3 }}>　</Text>
          <Rich c={c} color={c.t2}>{def}</Rich>
        </div>
      ))}
    </div>
  );
}

/** 横向链路：方框 → 方框（纯 Flex，不用 SVG，窄屏可换行） */
function Chain({ c, steps, caption }) {
  return (
    <div style={{ margin: '8px 0 4px' }}>
      <Flex align="center" gap={6} wrap="wrap">
        {steps.map((s, i) => (
          <React.Fragment key={s}>
            {i > 0 && <span style={{ color: c.t4, fontSize: 12 }}>→</span>}
            <span
              style={{
                fontSize: 12,
                padding: '3px 10px',
                borderRadius: c.radiusSm,
                background: c.fill,
                border: `1px solid ${c.border}`,
                color: c.t1,
                whiteSpace: 'nowrap'
              }}
            >
              {s}
            </span>
          </React.Fragment>
        ))}
      </Flex>
      {caption ? (
        <div style={{ marginTop: 6, fontSize: 11.5, color: c.t3 }}>{caption}</div>
      ) : null}
    </div>
  );
}

/** 代码/字段名（等宽，用 token 的代码字体） */
function Mono({ c, children }) {
  return (
    <Text
      style={{
        fontFamily: c.fontNum,
        fontSize: 11.5,
        color: c.brand,
        background: c.brandBg,
        padding: '1px 5px',
        borderRadius: 2,
        whiteSpace: 'nowrap'
      }}
    >
      {children}
    </Text>
  );
}

/**
 * 数据串里的 `**强调**` → `<strong>`。
 *
 * 为什么需要：表格与定义列表的数据是**纯字符串**（便于在源码里读写与维护），
 * 但说明书需要加粗关键结论。若直接把 `**` 丢进 JSX 文本，用户会看到字面的星号 ——
 * 这是最容易漏掉的一类"看起来像 markdown、实际渲染成符号"的问题。
 */
function Rich({ c, size = 12, color, weight, children }) {
  const parts = String(children == null ? '' : children).split('**');
  return (
    <Text style={{ fontSize: size, color, fontWeight: weight }}>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <strong key={i} style={{ fontWeight: 600 }}>
            {p}
          </strong>
        ) : (
          p
        )
      )}
    </Text>
  );
}

/* ================================================================== *
 * 页面
 * ================================================================== */
export default function ManualPage({ onNavigate }) {
  const c = useT();

  const jump = (id) => {
    const el = document.getElementById(id);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  /* ---------------- 目录 ---------------- */
  const toc = [
    { id: 'manual-anchor-blocks', no: '一', title: '三大能力板块', subs: ['年度预算计划', '预算消耗', '对账单', '关联与协作'] },
    { id: 'manual-anchor-roles', no: '二', title: '核心使用角色与使用场景', subs: ['业务部门', 'Digital', '协作交接口'] },
    { id: 'manual-anchor-roadmap', no: '三', title: '后续规划', subs: ['演进方向', '待实现板块', '优先级与依赖'] }
  ];

  /* ---------------- 第一章数据：三大板块总览 ---------------- */
  const blocksOverview = [
    {
      key: 'annual',
      name: '年度预算计划',
      route: '#/budget/annual',
      icon: <CalendarOutlined />,
      phase: '编制年（次年）',
      core: '三个编制项的申报与版本管理',
      must: '次年预算必须在执行年开始前锁定，因此独立于执行年度的消耗数据'
    },
    {
      key: 'consume',
      name: '预算消耗',
      route: '#/budget/consume',
      icon: <PieChartOutlined />,
      phase: '执行年 + 编制年（双口径）',
      core: '额度的消耗进度、档位预警、查账入口',
      must: '只读视图 —— 消耗是既有事实，改写预算的入口在下钻页，不在看板'
    },
    {
      key: 'billing',
      name: '对账单',
      route: '#/billing/monthly',
      icon: <FileTextOutlined />,
      phase: '执行年（按月）',
      core: '出账、发出、核销与逐笔明细核对',
      must: '应收口径：出账即视为费用发生，与"预算额度"是两个口径域'
    }
  ];

  const blocksColumns = [
    { title: '能力板块', dataIndex: 'name', width: 150, render: (v, r) => (
      <Flex align="center" gap={6}>
        <span style={{ color: c.brand, fontSize: 14 }}>{r.icon}</span>
        <Text style={{ fontSize: 12.5, fontWeight: 500 }}>{v}</Text>
      </Flex>
    ) },
    { title: '达成的业务目标', dataIndex: 'must', render: (v) => <Rich c={c} size={12} color={c.t2}>{v}</Rich> },
    { title: '适用期别', dataIndex: 'phase', width: 150, render: (v) => <Rich c={c} size={12} color={c.t2}>{v}</Rich> },
    { title: '核心内容', dataIndex: 'core', width: 230, render: (v) => <Rich c={c} size={12} color={c.t2}>{v}</Rich> }
  ];

  /* ---------------- 第一章：需求清单状态机 ---------------- */
  const demandSmColumns = [
    { title: '状态', dataIndex: 's', width: 150, render: (v) => <Text style={{ fontSize: 12, fontWeight: 500 }}>{v}</Text> },
    { title: '可执行动作', dataIndex: 'a', render: (v) => <Rich c={c} size={12} color={c.t2}>{v}</Rich> },
    { title: '迁入状态', dataIndex: 'to', width: 140, render: (v) => <Rich c={c} size={12} color={c.t2}>{v}</Rich> },
    { title: '执行方', dataIndex: 'by', width: 90, render: (v) => <TextTag tone={v === 'Digital' ? 'info' : 'default'}>{v}</TextTag> }
  ];
  const demandSm = [
    { key: '1', s: 'S0/S1 未提交 / 已确认（基线）', a: '新建草稿', to: 'S2 草稿', by: '业务部门' },
    { key: '2', s: 'S2 草稿', a: '保存草稿（原地）', to: 'S2 草稿', by: '业务部门' },
    { key: '3', s: 'S2 草稿', a: '提交更新', to: 'S3 待反馈费用', by: '业务部门' },
    { key: '4', s: 'S3 待反馈费用', a: '撤回提交（v1.6 新增）', to: 'S2 草稿', by: '业务部门' },
    { key: '5', s: 'S3 待反馈费用', a: 'Digital 逐条反馈费用', to: 'S4 待复核确认', by: 'Digital' },
    { key: '6', s: 'S4 待复核确认', a: '退回重反馈', to: 'S3 待反馈费用', by: '业务部门' },
    { key: '7', s: 'S4 待复核确认', a: '业务复核确认 → 得号', to: 'S5 已确认（写回正式清单）', by: '业务部门' },
    { key: '8', s: 'S2 / S3 / S4', a: '废弃新版本（连带删除未确认版本）', to: '退回 S1 基线', by: '业务部门' }
  ];

  /* ---------------- 第一章：运维 / BP 状态机 ---------------- */
  const opsSm = [
    { key: '1', s: '未启动 / 已确认', a: '新建草稿（items 取已确认明细，无则按计费模型派生）', to: '编制中', by: 'Digital' },
    { key: '2', s: '编制中', a: '保存草稿（只写草稿，不写正式数据）', to: '编制中', by: 'Digital' },
    { key: '3', s: '编制中', a: '提交业务确认（置出具日，主表即时显示待确认金额）', to: '待业务确认', by: 'Digital' },
    { key: '4', s: '待业务确认', a: '退回重编（清空出具日）', to: '编制中', by: '业务部门' },
    { key: '5', s: '待业务确认', a: '复核确认 —— 唯一写回点', to: '已确认（写回明细 + 版本快照 + 得号）', by: '业务部门' }
  ];

  /* ---------------- 第一章：三重口径 ---------------- */
  const poolColumns = [
    { title: '口径', dataIndex: 'k', width: 120, render: (v, r) => (
      <Flex align="center" gap={6}>
        <span style={{ width: 8, height: 8, borderRadius: 4, background: r.color, flex: '0 0 auto' }} />
        <Text style={{ fontSize: 12.5, fontWeight: 500 }}>{v}</Text>
      </Flex>
    ) },
    { title: '数据来源', dataIndex: 'src', render: (v) => <Rich c={c} size={12} color={c.t2}>{v}</Rich> },
    { title: '计入可用余额', dataIndex: 'in', width: 110, render: (v) => <TextTag tone={v ? 'warn' : 'ok'}>{v ? '计入' : '不计入'}</TextTag> },
    { title: '语义', dataIndex: 'use', width: 260, render: (v) => <Rich c={c} size={12} color={c.t2}>{v}</Rich> }
  ];
  const poolRows = [
    { key: 'p', k: 'Planned 已规划', color: c.warning, src: '需求清单的业务预估（estAmount）', in: false, use: '影子占用，仅用于"编多了没有"的事前预警，不是已发生的支出' },
    { key: 'c', k: 'Committed 已承诺', color: c.meterCommitted || c.info, src: 'BRD 签收锁定的评估价（尚未出账）', in: true, use: '钱已经谈定、只是还没出账 —— 若不占用额度，会出现"看着还有余额却付不出钱"' },
    { key: 'b', k: 'Billed 已核销', color: c.brand, src: '已确认账期的实际金额（仅 CONFIRMED）', in: true, use: '真正花掉的钱' }
  ];

  /* ---------------- 第一章：档位阈值 ----------------
     注意 TextTag 的 tone 取值是 default|ok|warn|bad|info（不是 antd 的 success/warning/danger）——
     传错不会报错，只会静默退回灰色，等于"有档位色"的意图落空。 */
  const levelRows = [
    { key: '1', k: '正常', range: '消耗率 < 70%', tone: 'ok' },
    { key: '2', k: '关注', range: '70% ≤ 消耗率 < 90%', tone: 'info' },
    { key: '3', k: '预警', range: '90% ≤ 消耗率 < 100%', tone: 'warn' },
    { key: '4', k: '已透支', range: '消耗率 ≥ 100%', tone: 'bad' }
  ];

  /* ---------------- 第一章：账单三态 ---------------- */
  const billStateRows = [
    { key: '1', k: 'DRAFT 待出账', how: '月份不在已发出、也不在已确认集合中', see: '不计入任何"累计应收"；趋势图中展示但合计行不含' },
    { key: '2', k: 'SENT 已发出待确认', how: '月份在 sentMonths 中', see: '计入账单页"累计应收"，**不计入**消耗页"已核销" —— 这条差异是被显式设计出来的' },
    { key: '3', k: 'CONFIRMED 已核销', how: '月份在 confirmedMonths 中', see: '同时计入账单页"累计应收"与消耗页"已核销"，是两条链路的汇合点' }
  ];

  /* ---------------- 第一章：恒等式自检 ---------------- */
  const identityRows = [
    { key: '1', expr: '整体预算 = 项目预算 + 运维预算', where: '预算消耗三个维度 / 年度主表总预算费用列', note: '拆错任一维度，整页的"占比"引用全部失真' },
    { key: '2', expr: '合计行 = Σ 列内可见值', where: '年度主表 / 消耗页表格', note: '列内显示「待出具 / 待核定」时该行计 0，否则用户逐列相加对不上合计' },
    { key: '3', expr: '部门详情页 3 卡 = 交付明细 + 运维明细', where: '《部门账单详情页》', note: '三个数必须同源；曾因 3 卡走全量月份、明细走已出账月份，8/8 部门全部对不上' },
    { key: '4', expr: '消耗页「已核销」= 账单页 CONFIRMED 口径', where: '跨页核对', note: '两个具名口径的分工，见 §1.4' }
  ];

  /* ---------------- 第二章：角色 ---------------- */
  const roleRows = [
    {
      key: 'biz',
      role: '业务部门',
      field: 'bpOwner（如陈昊 / 林薇 / 郑亦凡）',
      stance: '申报方与确认方',
      duty: '提出需求与预估、提交 BP 与清单、复核确认 Digital 反馈的费用与运维预算、确认核销账单',
      pages: '年度预算计划、项目预算计划、系统运维预算计划、对账单总览'
    },
    {
      key: 'digital',
      role: 'Digital',
      field: 'digitalOwner（如顾晓东 / 邱晨）',
      stance: '审核方与出具方',
      duty: '逐条核定需求费用、按计费模型出具运维预算、出账与发出账单、监控跨部门消耗档位',
      pages: '全部（含预算消耗与部门账单详情页）'
    }
  ];
  const roleColumns = [
    { title: '角色', dataIndex: 'role', width: 110, render: (v) => <Text style={{ fontSize: 12.5, fontWeight: 600 }}>{v}</Text> },
    { title: '数据字段', dataIndex: 'field', width: 210, render: (v) => <Text style={{ fontSize: 11.5, color: c.t3 }}>{v}</Text> },
    { title: '立场', dataIndex: 'stance', width: 120, render: (v) => <Rich c={c} size={12} color={c.t2}>{v}</Rich> },
    { title: '职责范围', dataIndex: 'duty', render: (v) => <Rich c={c} size={12} color={c.t2}>{v}</Rich> }
  ];

  /* ---------------- 第二章：交接点 ---------------- */
  const handoffRows = [
    { key: '1', what: '项目需求清单及费用预估', from: '业务部门', to: 'Digital', before: 'S2 草稿', after: 'S3 待反馈费用' },
    { key: '2', what: '逐条核定后的费用', from: 'Digital', to: '业务部门', before: 'S3 待反馈费用', after: 'S4 待复核确认' },
    { key: '3', what: '项目预算正式版本（得号）', from: '业务部门', to: '（归档）', before: 'S4 待复核确认', after: 'S5 已确认' },
    { key: '4', what: '运维预算编制明细', from: 'Digital', to: '业务部门', before: '编制中', after: '待业务确认' },
    { key: '5', what: '运维预算正式版本（得号）', from: '业务部门', to: '（归档）', before: '待业务确认', after: '已确认' },
    { key: '6', what: '月度账单（已发出）', from: 'Digital', to: '业务部门', before: 'DRAFT 待出账', after: 'SENT 已发出待确认' },
    { key: '7', what: '账单核销确认', from: '业务部门', to: '（归档）', before: 'SENT 已发出待确认', after: 'CONFIRMED 已核销' }
  ];
  const handoffColumns = [
    { title: '交接物', dataIndex: 'what', render: (v) => <Text style={{ fontSize: 12 }}>{v}</Text> },
    { title: '发起方', dataIndex: 'from', width: 100, render: (v) => <TextTag tone={v === 'Digital' ? 'info' : 'default'}>{v}</TextTag> },
    { title: '接收方', dataIndex: 'to', width: 100, render: (v) => <Rich c={c} size={12} color={c.t2}>{v}</Rich> },
    { title: '交接前状态', dataIndex: 'before', width: 150, render: (v) => <Rich c={c} size={12} color={c.t2}>{v}</Rich> },
    { title: '交接后状态', dataIndex: 'after', width: 170, render: (v) => <Text style={{ fontSize: 12, color: c.t1, fontWeight: 500 }}>{v}</Text> }
  ];

  /* ---------------- 第三章：待实现板块 ---------------- */
  const nextRows = [
    { key: '1', name: '计费规则', route: '#/billing/rules', why: '账单金额的算法出处。现已有页面骨架，但"账单行强制标注需求类型与变更情况"这条规则尚未在交付明细兑现', dep: '无依赖，可独立启动' },
    { key: '2', name: '需求受理', route: '#/delivery/brd', why: 'BRD 的提交、评估、签收是"已承诺"口径的上游 —— 没有它，签收前的评估过程在系统里不可见', dep: '依赖角色权限（谁评估、谁签收）' },
    { key: '3', name: '评估与签收', route: '#/delivery/eval', why: '锁定评估价，直接决定 Committed 金额', dep: '依赖需求受理' },
    { key: '4', name: '变更管理', route: '#/delivery/cr', why: 'CR 会改变账单金额（已支持负值变更），但变更单本身没有管理界面', dep: '依赖评估与签收' },
    { key: '5', name: '交付与偏差', route: '#/delivery/deliver', why: '预估 vs 实际的偏差归因，是下一年编制质量的核心输入', dep: '依赖变更管理 + 账单数据' }
  ];
  const nextColumns = [
    { title: '能力板块', dataIndex: 'name', width: 130, render: (v, r) => (
      <Flex align="center" gap={6}>
        <Text style={{ fontSize: 12.5, fontWeight: 500 }}>{v}</Text>
        <Text style={{ fontSize: 11, color: c.t3, fontFamily: c.fontNum }}>{r.route}</Text>
      </Flex>
    ) },
    { title: '要解决的问题', dataIndex: 'why', render: (v) => <Rich c={c} size={12} color={c.t2}>{v}</Rich> },
    { title: '依赖关系', dataIndex: 'dep', width: 250, render: (v) => <Rich c={c} size={12} color={c.t2}>{v}</Rich> }
  ];

  /* ---------------- 第三章：批次 ---------------- */
  const phaseRows = [
    {
      key: '1', batch: '第一批 · 口径闭合', status: 'done',
      items: '口径单一出处（calc.js 单点定义）、项目/运维两侧的「列内可见」口径、双具名累计口径、D-CRM 数据补齐',
      out: '10 个 P0 全部关闭；恒等式断言取代硬编码金额断言'
    },
    {
      key: '2', batch: '第二批 · 流程可达性', status: 'done',
      items: '编辑死路（自动建草稿）、需求清单「撤回修改」、BP 版本「废弃」、账期与定位写入 URL、详情页 SENT 可见性与核销入口',
      out: '编制与账单两条流程均可回退、可纠错'
    },
    {
      key: '3', batch: '第三批 · 可读性与无障碍', status: 'partial',
      items: '交付列宽重排 + 费用列固定、档位色对比度达 AA、三块表加排序、导出 CSV、Tooltip 文案订正',
      out: '排序与对比度已完成；**导出 CSV 与部分文案订正未做**'
    },
    {
      key: '4', batch: '第四批 · 交互完整度', status: 'todo',
      items: '角色切换（运行时身份）、批量催办、交付明细补「含变更 ±N 万」列',
      out: '需要决策，非缺陷修复'
    },
    {
      key: '5', batch: '第五批 · 项目管理板块', status: 'todo',
      items: '需求受理 / 评估与签收 / 变更管理 / 交付与偏差四页 + 计费规则定稿',
      out: '侧边栏「未完成」组的全部内容'
    }
  ];
  const phaseColumns = [
    { title: '批次', dataIndex: 'batch', width: 180, render: (v, r) => (
      <Flex align="center" gap={6}>
        <Text style={{ fontSize: 12.5, fontWeight: 500 }}>{v}</Text>
        {r.status === 'done' ? <TextTag tone="ok">已完成</TextTag>
          : r.status === 'partial' ? <TextTag tone="warn">部分完成</TextTag>
          : <TextTag>待启动</TextTag>}
      </Flex>
    ) },
    { title: '内容', dataIndex: 'items', render: (v) => <Rich c={c} size={12} color={c.t2}>{v}</Rich> },
    { title: '产出 / 状态', dataIndex: 'out', width: 260, render: (v) => <Rich c={c} size={12} color={c.t2}>{v}</Rich> }
  ];

  const pendingRows = [
    { key: '1', item: '三块明细表「导出 CSV」', lever: '中', dep: '无 —— 零新数据源，字段已齐备' },
    { key: '2', item: '运维「单价」列对固定年费系统只显示单位（应为金额 + 折合月均）', lever: '中', dep: '无' },
    { key: '3', item: '消耗页横向滚动余量未计滚动条宽度', lever: '低', dep: '无' },
    { key: '4', item: '查账 Tooltip 文案与目标页不符（承诺了页面上不存在的"预算消耗明细"）', lever: '低', dep: '无' },
    { key: '5', item: '顶部全局部门下拉可点击但未生效（死控件）', lever: '中', dep: '需先决策："下传过滤"还是"删除控件"' },
    { key: '6', item: '编制年运维维度整列 0% 标绿「正常」，语义应为「不适用」', lever: '中', dep: '无 —— 1 处渲染分支' },
    { key: '7', item: '项目预算超支在主表零提示（字段已算好未消费）', lever: '高', dep: '无 —— 数据已就绪，仅缺展示' },
    { key: '8', item: '版本排序比较器对相等键返回 -1（非合法全序），同分钟提交时最新版本可能不置顶', lever: '中', dep: '无 —— 可搭任意批次' },
    { key: '9', item: '交付明细缺「含变更 ±N 万」列，与计费规则页声称的规则不符', lever: '中', dep: '依赖计费规则板块定稿' },
    { key: '10', item: '运维表单校验：红框无原因说明 / 可提交 0 元明细 / 添加系统下拉不关闭', lever: '中', dep: '交付研发前必须补' },
    { key: '11', item: '运行时角色切换（业务 / Digital 身份单选，动作按钮按身份过滤）', lever: '高', dep: '**是项目管理板块的前置** —— 没有身份，签收与评估就没有执行主体' },
    { key: '12', item: '批量催办（8 个 BU 的编制场景天然需要批量；当前只有留痕没有入口）', lever: '中', dep: '依赖角色切换' },
    { key: '13', item: '视觉一致性收尾（楼层色条同色、分摊列行高失控、数字列对齐不统一等）', lever: '低', dep: '最后做 —— 口径未闭合时做视觉是本末倒置' }
  ];
  const pendingColumns = [
    { title: '待办事项', dataIndex: 'item', render: (v) => <Text style={{ fontSize: 12 }}>{v}</Text> },
    { title: '收益', dataIndex: 'lever', width: 70, align: 'center', render: (v) => (
      <TextTag tone={v === '高' ? 'ok' : v === '中' ? 'info' : 'default'}>{v}</TextTag>
    ) },
    { title: '依赖 / 前置条件', dataIndex: 'dep', width: 330, render: (v) => <Rich c={c} size={12} color={c.t2}>{v}</Rich> }
  ];

  /* ================================================================== */
  return (
    <div data-testid="manual-page">
      <PageHead
        title="站点说明书"
        desc="本平台的统一说明文档：先讲已交付的三大能力板块各自解决什么问题、按什么规则运转，再讲谁在什么场景下使用它，最后给出后续演进的方向、待实现板块与优先级依赖。文档中的口径与约束均取自实现层（domain 取数函数、状态机、路由契约），不是设想稿。"
        extra={<TextTag tone="info">仅本页为纯文档，不读写业务数据</TextTag>}
      />

      <Hint>
        本页是<strong>演示原型</strong>的说明文档：数据均为脱敏构造，不包含任何真实业务数据。
        文中出现的规模数字（8 个业务部门、9 个账期、33 条 BRD）为演示数据的结构性说明，用于解释口径，不代表真实业务体量。
      </Hint>

      <Row gutter={16} style={{ marginTop: 12 }}>
        {/* ================= 目录（左侧粘性） ================= */}
        <Col xs={24} lg={6}>
          <div style={{ position: 'sticky', top: 16 }}>
            <Card
              data-testid="manual-toc"
              size="small"
              styles={{ body: { padding: 12 } }}
              title={
                <Flex align="center" gap={6}>
                  <ReadOutlined style={{ color: c.brand }} />
                  <Text style={{ fontSize: 13, fontWeight: 600, color: c.t1 }}>目录</Text>
                </Flex>
              }
            >
              {toc.map((ch) => (
                <div key={ch.id} style={{ marginBottom: 10 }}>
                  <button
                    type="button"
                    data-testid={`manual-toc-jump-${ch.no}`}
                    onClick={() => jump(ch.id)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      padding: 0,
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: c.brand
                    }}
                  >
                    {ch.no}、{ch.title}
                  </button>
                  <div style={{ marginTop: 4, paddingLeft: 10 }}>
                    {ch.subs.map((s) => (
                      <div key={s} style={{ fontSize: 11.5, color: c.t3, lineHeight: 1.9 }}>
                        · {s}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <Divider style={{ margin: '10px 0' }} />
              <div style={{ fontSize: 11, color: c.t3, lineHeight: 1.7 }}>
                快捷入口：
                <button
                  type="button"
                  onClick={() => onNavigate && onNavigate('budget', 'annual')}
                  style={{ border: 'none', background: 'transparent', padding: '0 2px', cursor: 'pointer', color: c.brand, fontSize: 11 }}
                >
                  年度预算计划
                </button>
                ·
                <button
                  type="button"
                  onClick={() => onNavigate && onNavigate('billing', 'monthly')}
                  style={{ border: 'none', background: 'transparent', padding: '0 2px', cursor: 'pointer', color: c.brand, fontSize: 11 }}
                >
                  对账单总览
                </button>
              </div>
            </Card>
          </div>
        </Col>

        {/* ================= 正文 ================= */}
        <Col xs={24} lg={18}>

          {/* ============================================================
              第一章 · 三大能力板块
             ============================================================ */}
          <Card data-testid="manual-sec-blocks" styles={{ body: { padding: 16 } }} style={{ borderTop: `3px solid ${c.brand}` }}>
            <ChapterHead
              c={c}
              id="manual-anchor-blocks"
              no="一"
              title="三大能力板块"
              desc="平台按「编制 → 消耗 → 出账」三段组织。三者不是三个独立工具，而是同一条预算生命周期上的三个观测点：编制决定额度，消耗记录额度被占用的过程，账单给出每一笔费用的明细依据。"
            />

            <SubHead c={c} title="1.1　板块总览" />
            <Table
              size="small"
              rowKey="key"
              pagination={false}
              columns={blocksColumns}
              dataSource={blocksOverview}
              data-testid="manual-blocks-table"
            />

            {/* ---------------- 1.2 年度预算计划 ---------------- */}
            <SubHead c={c} title="1.2　年度预算计划" tag="编制年" />
            <Card data-testid="manual-block-annual" size="small" styles={{ body: { padding: 14 } }} style={{ borderLeft: `3px solid ${c.brand}` }}>
              <DefList
                c={c}
                items={[
                  ['业务定位', '执行年开始前，用一年的时间把次年要花什么钱、花多少说清楚。是整套预算体系的输入。'],
                  ['核心命题', '为什么必须独立于执行年数据 —— 次年预算要在执行年开始前锁定，不能等执行年的消耗数据出来再编。']
                ]}
              />

              <div style={{ marginTop: 12 }}>
                <Text style={{ fontSize: 12.5, fontWeight: 600, color: c.t1 }}>三个编制项</Text>
              </div>
              <DefList
                c={c}
                items={[
                  ['① 年度 BP', '业务规划文档。提交文档或文档链接并填写该版本基本信息即算提交；系统只记录版本号、更新时间与变更说明，不参与金额计算。'],
                  ['② 项目预算', '需求清单及逐条项目预算费用。**以整份清单为一个版本**，不做逐条版本管理 —— 因为业务提交的是一份完整方案，而不是若干条互不相干的记录。'],
                  ['③ 系统运维预算', '按系统计费模型（订单量 / 会员规模 / 固定年费）年化得出，由 Digital 出具、业务部门复核确认。']
                ]}
              />

              <div style={{ marginTop: 12 }}>
                <Text style={{ fontSize: 12.5, fontWeight: 600, color: c.t1 }}>关键实现思路</Text>
              </div>
              <DefList
                c={c}
                items={[
                  ['为什么要版本化', '预算是一个反复协商的产物。每次提交产生一个新版本，旧版本留在版本记录里可回溯，但"当前版本"只有一个 —— 这就避免了"表上一个数、页上又一个数"。'],
                  ['得号时机', '版本号（V1.0、V1.1 …）**不在提交时产生，而在业务复核确认时产生**。提交只是递交，得号才代表这份清单成为正式版本。'],
                  ['草稿与正式版严格分离', '正在编辑的内容一律存在独立的草稿区，除"复核确认"这一个动作外，任何操作都不碰正式数据。'],
                  ['列内可见口径', '主表每一格显示什么，合计就只累加什么。未出具的运维显示「待出具」、未确认的项目显示「待核定」，两处都不计入合计 —— 否则用户逐列相加会比合计少一截且无法解释。']
                ]}
              />

              <div style={{ marginTop: 14 }}>
                <Text style={{ fontSize: 12.5, fontWeight: 600, color: c.t1 }}>
                  ② 项目预算：需求清单状态机
                </Text>
              </div>
              <Table
                size="small"
                rowKey="key"
                pagination={false}
                columns={demandSmColumns}
                dataSource={demandSm}
                data-testid="manual-demand-sm"
                style={{ marginTop: 8 }}
              />
              <div style={{ marginTop: 8, fontSize: 11.5, color: c.t3, lineHeight: 1.8 }}>
                关键补充：<strong>S3 → S2 的「撤回提交」是后补的边。</strong>最初状态机只有单向 S2 → S3，
                业务提交后发现清单写错，唯一出路是"废弃新版本"，而该动作会连带删除已提交的版本 —— 等于整份清单重录。
                回退边的存在与否，决定了一条流程是"可纠错"还是"只能重来"。
              </div>

              <div style={{ marginTop: 14 }}>
                <Text style={{ fontSize: 12.5, fontWeight: 600, color: c.t1 }}>
                  ③ 系统运维预算状态机（与上表同构，但编制方是 Digital）
                </Text>
              </div>
              <Table
                size="small"
                rowKey="key"
                pagination={false}
                columns={demandSmColumns}
                dataSource={opsSm}
                data-testid="manual-ops-sm"
                style={{ marginTop: 8 }}
              />
              <div style={{ marginTop: 8, fontSize: 11.5, color: c.t3, lineHeight: 1.8 }}>
                运维与项目的<strong>关键差异</strong>：① 编制方是 Digital 而不是业务（费用由计费模型决定，业务无法自行估算）；
                ② 只有 <Mono c={c}>confirmOpsDraft</Mono> 一个动作写正式数据与版本快照；
                ③ 提交即置出具日，因此主表在"待业务确认"阶段就能显示待确认金额 —— 避免了"主表 0、页面有值"的割裂。
              </div>
            </Card>

            {/* ---------------- 1.3 预算消耗 ---------------- */}
            <SubHead c={c} title="1.3　预算消耗" tag="只读看板" />
            <Card data-testid="manual-block-consume" size="small" styles={{ body: { padding: 14 } }} style={{ borderLeft: `3px solid ${c.warning}` }}>
              <DefList
                c={c}
                items={[
                  ['业务定位', '看"钱花到哪儿了"。执行年度按已承诺 + 已核销看消耗进度；编制年度改以"已规划"（清单预估）呈现，因为此时还没有任何实际支出。'],
                  ['为什么只读', '消耗是既有事实。改写预算属于编制动作，入口在《项目预算计划》页。看板一旦可编辑，"看数"与"改数"混在一屏，用户无法判断眼前是计划还是现实。']
                ]}
              />

              <div style={{ marginTop: 12 }}>
                <Text style={{ fontSize: 12.5, fontWeight: 600, color: c.t1 }}>额度的三重口径</Text>
                <div style={{ marginTop: 6, fontSize: 11.5, color: c.t3 }}>
                  可用余额 = 总包 − 已承诺 − 已核销（已规划不计入）
                </div>
              </div>
              <Table
                size="small"
                rowKey="key"
                pagination={false}
                columns={poolColumns}
                dataSource={poolRows}
                data-testid="manual-pool-table"
                style={{ marginTop: 8 }}
              />

              <div style={{ marginTop: 14 }}>
                <Text style={{ fontSize: 12.5, fontWeight: 600, color: c.t1 }}>档位阈值</Text>
                <div style={{ marginTop: 6, fontSize: 11.5, color: c.t3 }}>
                  阈值按<strong>总包量级</strong>设计，因此只对"总包"这种分母成立。这一条看似琐碎，却是历史上多个极端值的根源（见 §1.4）。
                </div>
              </div>
              <Flex gap={8} wrap="wrap" style={{ marginTop: 8 }}>
                {levelRows.map((l) => (
                  <Flex
                    key={l.key}
                    align="center"
                    gap={6}
                    style={{
                      padding: '5px 10px',
                      borderRadius: c.radiusSm,
                      border: `1px solid ${c.border}`,
                      background: c.bg1
                    }}
                  >
                    <TextTag tone={l.tone}>{l.k}</TextTag>
                    <Text style={{ fontSize: 11.5, color: c.t2 }}>{l.range}</Text>
                  </Flex>
                ))}
              </Flex>

              <div style={{ marginTop: 14 }}>
                <Text style={{ fontSize: 12.5, fontWeight: 600, color: c.t1 }}>关键实现思路</Text>
              </div>
              <DefList
                c={c}
                items={[
                  ['三个维度必须同源', '整体 = 项目 + 运维 这条恒等式必须在三张卡、表格与合计行同时成立。任一维度用了不同口径，整页的"占比"引用全部失真。'],
                  ['合计行跟随筛选', '合计行与三张汇总卡是两种语义：卡片是"全量汇总"，合计行是"当前可见行的合计"。两者必须分开取数，否则筛选后合计纹丝不动，用户会以为筛选失效。'],
                  ['告警对象也用筛选结果', '"透支 N 个 / 预警 M 个"同样基于筛选后的行，否则会出现"筛到 1 个部门却提示 3 个部门透支"。']
                ]}
              />
            </Card>

            {/* ---------------- 1.4 对账单 ---------------- */}
            <SubHead c={c} title="1.4　对账单" tag="执行年 · 按月" />
            <Card data-testid="manual-block-billing" size="small" styles={{ body: { padding: 14 } }} style={{ borderLeft: `3px solid ${c.info}` }}>
              <DefList
                c={c}
                items={[
                  ['业务定位', '回答"这笔钱到底花在哪些项目、哪些系统上"。口径是应收 —— 账单一出，费用即视为发生，不等到付款。'],
                  ['两个层面', '《对账单总览》看全局横向对比（哪个部门这个月花了多少）；《部门账单详情页》看单个部门的纵向明细（费用构成 → 月度趋势 → 交付明细 → 运维明细）。两页共用同一套明细组件，保证口径一致。']
                ]}
              />

              <div style={{ marginTop: 12 }}>
                <Text style={{ fontSize: 12.5, fontWeight: 600, color: c.t1 }}>账单三态</Text>
              </div>
              <Table
                size="small"
                rowKey="key"
                pagination={false}
                columns={[
                  { title: '状态', dataIndex: 'k', width: 170, render: (v) => <Text style={{ fontSize: 12, fontWeight: 500 }}>{v}</Text> },
                  { title: '判定条件', dataIndex: 'how', width: 280, render: (v) => <Rich c={c} size={12} color={c.t2}>{v}</Rich> },
                  { title: '在统计中的位置', dataIndex: 'see', render: (v) => <Rich c={c} size={12} color={c.t2}>{v}</Rich> }
                ]}
                dataSource={billStateRows}
                data-testid="manual-bill-state-table"
                style={{ marginTop: 8 }}
              />

              <div style={{ marginTop: 14 }}>
                <Text style={{ fontSize: 12.5, fontWeight: 600, color: c.t1 }}>金额是怎么算出来的</Text>
              </div>
              <DefList
                c={c}
                items={[
                  ['交付计费', 'BRD 评估价 + 已批准的变更（CR）。变更可以为负 —— 范围缩减会真实地把账单金额降下来，所以金额不能假设为单调递增。'],
                  ['运维计费', '按系统计费模型逐月推算：按订单量、按会员规模、或固定年费。同一系统可能被多个部门共用，因此运维明细要回答"这笔钱摊给了谁"。']
                ]}
              />

              <div style={{ marginTop: 14 }}>
                <Text style={{ fontSize: 12.5, fontWeight: 600, color: c.t1 }}>关键实现思路</Text>
              </div>
              <DefList
                c={c}
                items={[
                  ['累计边界 = 已出账', '「累计」不是"到当前月份"，而是"到最近一个已出账的月份"。待出账月仍在趋势图里展示（它确实在发生），但**不进任何累计合计** —— 否则用户会把还没出账的钱当成已确定的应收。'],
                  ['明细楼层不做累加', '详情页所有金额一律经领域取数函数按部门重算，页面自己不做任何求和。这是"卡片与明细必须同源"的落地方式：不是让两处算得一样，而是让它们根本只有一处算法。'],
                  ['状态在部门视角也要可见', '"已发出待确认"意味着账单已经成立、只等业务确认。这个动作必须在部门页可见并可执行 —— 否则账单闭环的最后一公里断在部门视角。']
                ]}
              />
            </Card>

            {/* ---------------- 1.5 关联与协作 ---------------- */}
            <SubHead c={c} title="1.5　三大板块的关联与整体协作" />

            <div style={{ fontSize: 12.5, color: c.t2, lineHeight: 1.9, marginBottom: 10 }}>
              三个板块由<strong>两条链路</strong>串起来，它们在"已核销"处汇合：
            </div>

            <Card size="small" styles={{ body: { padding: 14 } }} style={{ background: c.bg2 }}>
              <Text style={{ fontSize: 12.5, fontWeight: 600, color: c.t1 }}>链路 A · 编制链路（决定"能花多少"）</Text>
              <Chain
                c={c}
                steps={['需求清单预估', '提交 → Digital 逐条核定', '业务复核确认（得号）', '写入年度预算额度', '进入预算消耗的分母']}
                caption="产出：次年每个 BU 的项目预算额度与运维预算额度。"
              />

              <Divider style={{ margin: '14px 0' }} />

              <Text style={{ fontSize: 12.5, fontWeight: 600, color: c.t1 }}>链路 B · 费用发生链路（记录"实际花了多少"）</Text>
              <Chain
                c={c}
                steps={['需求（DM）', 'BRD 提交与评估', '签收锁定评估价 → 已承诺', '交付上线', '按月出账（BILL）', '发出账单（SENT）', '业务确认核销（CONFIRMED）']}
                caption="产出：逐月、逐部门、逐项目的费用明细。"
              />

              <Divider style={{ margin: '14px 0' }} />

              <Text style={{ fontSize: 12.5, fontWeight: 600, color: c.t1 }}>汇合点</Text>
              <div style={{ marginTop: 6, fontSize: 12, color: c.t2, lineHeight: 1.9 }}>
                「已核销」是两条链路的唯一交点：<strong>链路 B 的产出（核销金额）反过来消耗链路 A 的产出（预算额度）</strong>。
                这也解释了为什么「已承诺」必须占用额度 —— 它是链路 B 中"钱已谈定但还没出账"的中间态，
                若不占用，会出现"看板上还有余额、实际却已经不够付"的错觉。
              </div>
            </Card>

            <div style={{ marginTop: 14 }}>
              <Text style={{ fontSize: 12.5, fontWeight: 600, color: c.t1 }}>
                1.5.1　口径自检：一组恒等式
              </Text>
              <div style={{ marginTop: 6, fontSize: 11.5, color: c.t3, lineHeight: 1.8 }}>
                这些恒等式被写成自动化断言，每改一次取数逻辑就跑一次 —— 比逐个核对数字更早发现口径漂移。
              </div>
            </div>
            <Table
              size="small"
              rowKey="key"
              pagination={false}
              columns={[
                { title: '恒等式', dataIndex: 'expr', width: 280, render: (v) => <Text style={{ fontSize: 12, fontWeight: 500 }}>{v}</Text> },
                { title: '生效位置', dataIndex: 'where', width: 240, render: (v) => <Rich c={c} size={12} color={c.t2}>{v}</Rich> },
                { title: '为什么需要它', dataIndex: 'note', render: (v) => <Rich c={c} size={12} color={c.t2}>{v}</Rich> }
              ]}
              dataSource={identityRows}
              data-testid="manual-identity-table"
              style={{ marginTop: 8 }}
            />

            <div style={{ marginTop: 14 }}>
              <Text style={{ fontSize: 12.5, fontWeight: 600, color: c.t1 }}>
                1.5.2　一个必须解释清楚的差异：为什么两页的"累计"不一样
              </Text>
            </div>
            <Alert
              type="info"
              showIcon
              style={{ marginTop: 8 }}
              message="消耗页的「已核销」与账单页的「累计应收」是两个口径，差额 = 已发出待确认的月份"
              description={
                <div style={{ fontSize: 12, lineHeight: 1.9 }}>
                  这不是 bug，是被显式设计出来的分工：
                  <br />· <strong>消耗页</strong>答的是"预算核销了多少"，所以只认 <Mono c={c}>CONFIRMED</Mono>（业务已确认核销）。
                  <br />· <strong>账单页</strong>答的是"公司应收多少"，所以用 <Mono c={c}>NOT_DRAFT</Mono>（含已发出待确认）。
                  <br />
                  两份名单在领域层是<strong>两个具名函数</strong>（而不是散落各页的过滤条件），
                  名字自带语义，因此不会再出现"某页用了另一个门槛却无人察觉"的情况 ——
                  这正是历史上 369.4 万差额的成因：同一事实存在两条取数路径且都不写名字。
                </div>
              }
            />

            <div style={{ marginTop: 14 }}>
              <Text style={{ fontSize: 12.5, fontWeight: 600, color: c.t1 }}>1.5.3　跨板块跳转</Text>
            </div>
            <DefList
              c={c}
              items={[
                ['查账（消耗 → 账单）', '消耗页每行的「查账」进入该部门的账单详情页。跳转时携带账期与定位部门，返回时原样带回 —— 否则用户每跳一层都要重新选一次账期。'],
                ['全局单号搜索', '顶部搜索框按前缀路由：DM- 进项目预算下钻页、BRD- 进需求受理、CR- 进变更管理、BILL- 进对应部门的账单详情页（并预置账期）。'],
                ['年度切换的影响', '全局年度开关会改变整页口径（执行年 / 编制年），但不改变你在哪个板块。这是刻意设计：切换年度是"换个视角看同一件事"，不是"换一件事"。']
              ]}
            />
          </Card>

          {/* ============================================================
              第二章 · 核心使用角色与使用场景
             ============================================================ */}
          <Card
            data-testid="manual-sec-roles"
            styles={{ body: { padding: 16 } }}
            style={{ marginTop: 16, borderTop: `3px solid ${c.info}` }}
          >
            <ChapterHead
              c={c}
              id="manual-anchor-roles"
              no="二"
              title="核心使用角色与使用场景"
              desc="平台由两个角色共同使用：业务部门申报与确认，Digital 核定与出具。整条预算与账单流程，本质上是这两方之间的一系列交接。"
            />

            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message="当前为演示原型：尚未实现登录与角色鉴权"
              description={
                <div style={{ fontSize: 12, lineHeight: 1.9 }}>
                  本文档中的"角色"描述的是<strong>流程分工</strong>，而不是登录权限。
                  当前版本可由同一个人依次完成两侧动作（操作记录里的执行人会写成该部门对应的业务责任人与 Digital 对接人，
                  看起来像两个人协作）。这属于已知缺口，已在后续规划的<strong>角色切换</strong>一项中列出，
                  并且它是项目管理板块的前置条件 —— 因为"评估""签收"这类动作必须有一个明确的执行主体。
                </div>
              }
            />

            <SubHead c={c} title="2.1　角色总览" />
            <Table
              size="small"
              rowKey="key"
              pagination={false}
              columns={roleColumns}
              dataSource={roleRows}
              data-testid="manual-role-table"
            />
            <div style={{ marginTop: 8, fontSize: 11.5, color: c.t3, lineHeight: 1.8 }}>
              两个角色并非上下级：<strong>业务部门对"要不要花这笔钱"负责，Digital 对"这笔钱值不值、按什么规则算"负责。</strong>
              费用的每一次流转都要求对方确认 —— 这正是复核确认环节存在的意义。
            </div>

            {/* ---------------- 2.2 业务部门 ---------------- */}
            <SubHead c={c} title="2.2　业务部门" tag="申报方 · 确认方" />
            <Card data-testid="manual-role-biz" size="small" styles={{ body: { padding: 14 } }} style={{ borderLeft: `3px solid ${c.brand}` }}>
              <DefList
                c={c}
                items={[
                  ['定位', '预算的申报方与费用的确认方。既提出需求，也为最终确认负责。'],
                  ['职责范围', '提交年度 BP；提交项目需求清单与费用预估；复核确认 Digital 反馈的费用与运维预算；在部门账单详情页确认核销已发出的账单。']
                ]}
              />

              <div style={{ marginTop: 12 }}>
                <Text style={{ fontSize: 12.5, fontWeight: 600, color: c.t1 }}>场景 A · 年度编制（每年一次，工作量最大）</Text>
              </div>
              <Steps
                size="small"
                direction="vertical"
                style={{ marginTop: 8 }}
                items={[
                  { title: '提交年度 BP', description: '在《年度预算计划》点①格进入 BP 页，提交规划文档或链接并填写修订说明。提交即算完成，不参与金额计算。' },
                  { title: '填报项目需求清单', description: '在②格进入项目预算页，新增项目并填写业务价值与预算预估。清单以整体为一个版本提交，提交后进入「待反馈费用」。' },
                  { title: '等待并复核 Digital 反馈', description: 'Digital 逐条核定费用后，清单回到业务侧「待复核确认」。此时可逐条比对"自己的预估"与"核定的费用"，必要时退回重议。' },
                  { title: '确认得号', description: '确认后清单成为正式版本（V1.0），金额进入次年预算额度。' },
                  { title: '复核运维预算', description: '在③格进入运维页，查看 Digital 按计费模型出具的明细，确认或退回。运维不由业务填报，业务只做复核。' }
                ]}
              />

              <div style={{ marginTop: 14 }}>
                <Text style={{ fontSize: 12.5, fontWeight: 600, color: c.t1 }}>场景 B · 月度账单核对（每月一次）</Text>
              </div>
              <Steps
                size="small"
                direction="vertical"
                style={{ marginTop: 8 }}
                items={[
                  { title: '从总览进入', description: '《对账单总览》按账期查看各 BU 的应收金额。点行内「查账」进入本部门详情页。' },
                  { title: '核对费用构成与趋势', description: '先看三张构成卡（交付 / 运维 / 合计），再看月度趋势是否异常，最后逐笔核对两个明细楼层。' },
                  { title: '确认核销或申诉', description: '对已发出待确认的账期执行确认核销；金额有异议则走申诉并填写理由。' }
                ]}
              />

              <div style={{ marginTop: 14 }}>
                <Text style={{ fontSize: 12.5, fontWeight: 600, color: c.t1 }}>场景 C · 预算消耗自查（随时）</Text>
              </div>
              <DefList
                c={c}
                items={[
                  ['怎么用', '在《预算消耗》找到本部门行，看整体 / 项目 / 运维三个维度的消耗率与档位。若某一维度已进入「预警」或「已透支」，点该行「查账」核对明细。'],
                  ['要点', '消耗率是"额度被占用的比例"，不等于"已经付出去的钱"。已承诺（签收锁定但未出账）同样占用额度 —— 这是为什么会看到"还没出账却已经吃掉大半额度"。']
                ]}
              />
            </Card>

            {/* ---------------- 2.3 Digital ---------------- */}
            <SubHead c={c} title="2.3　Digital" tag="核定方 · 出具方" />
            <Card data-testid="manual-role-digital" size="small" styles={{ body: { padding: 14 } }} style={{ borderLeft: `3px solid ${c.info}` }}>
              <DefList
                c={c}
                items={[
                  ['定位', '费用的核定方与规则的执行方。业务说"想做什么"，Digital 说"这要多少钱、按什么规则算"。'],
                  ['职责范围', '逐条核定需求费用；按系统计费模型出具运维预算；按月出账并发出账单；监控跨部门消耗档位并对异常发起催办。']
                ]}
              />

              <div style={{ marginTop: 12 }}>
                <Text style={{ fontSize: 12.5, fontWeight: 600, color: c.t1 }}>场景 A · 核定项目预算（编制期）</Text>
              </div>
              <Steps
                size="small"
                direction="vertical"
                style={{ marginTop: 8 }}
                items={[
                  { title: '查看待评估清单', description: '在《年度预算计划》②格，状态为「待评估费用」的部门即为待办。进入项目预算页查看业务填写的内容。' },
                  { title: '逐条反馈费用', description: '对每一条需求给出核定费用。业务预估仅是参考，不构成约束。' },
                  { title: '等待业务确认', description: '反馈后清单进入「待复核确认」。若业务退回，重新回到反馈环节 —— 这是一个可以反复的协商过程。' }
                ]}
              />

              <div style={{ marginTop: 14 }}>
                <Text style={{ fontSize: 12.5, fontWeight: 600, color: c.t1 }}>场景 B · 出具运维预算（编制期）</Text>
              </div>
              <Steps
                size="small"
                direction="vertical"
                style={{ marginTop: 8 }}
                items={[
                  { title: '新建编制草稿', description: '在《年度预算计划》③格进入运维页。资金系统范围与明细由系统按计费模型派生，作为起点。' },
                  { title: '按系统核定用量与单价', description: '计费分为三类：按订单量、按会员规模、固定年费。编制过程只写草稿，不影响正式数据。' },
                  { title: '提交业务确认', description: '提交后主表立即显示待确认金额（不需要等业务点确认才显示），避免"表上还是 0"的空窗。' }
                ]}
              />

              <div style={{ marginTop: 14 }}>
                <Text style={{ fontSize: 12.5, fontWeight: 600, color: c.t1 }}>场景 C · 出账与核销管理（执行期，按月）</Text>
              </div>
              <Steps
                size="small"
                direction="vertical"
                style={{ marginTop: 8 }}
                items={[
                  { title: '切到目标账期', description: '在对账单总览切换账期。待出账月为草稿态，不计入累计应收。' },
                  { title: '核对明细并发出账单', description: '先看交付明细（评估价 + 已批准变更）与运维明细（按系统计费），确认无误后发出。发出后状态变为「已发出待确认」。' },
                  { title: '等待业务核销', description: '业务确认后转为「已核销」。此时该月金额才计入消耗页的已核销口径。' }
                ]}
              />

              <div style={{ marginTop: 14 }}>
                <Text style={{ fontSize: 12.5, fontWeight: 600, color: c.t1 }}>场景 D · 跨部门消耗监控（随时）</Text>
              </div>
              <DefList
                c={c}
                items={[
                  ['怎么用', '在《预算消耗》按档位筛选出「预警」与「已透支」的部门，逐个点「查账」核对明细。'],
                  ['注意编制年的特殊性', '编制年度还没有实际支出，此时看的是"已规划"（清单预估）对额度的占用。它回答的是"这份清单编多了没有"，而不是"钱花超了没有"。两者语义不同，不应混读。']
                ]}
              />
            </Card>

            {/* ---------------- 2.4 交接点 ---------------- */}
            <SubHead c={c} title="2.4　协作交接口" />
            <div style={{ fontSize: 12.5, color: c.t2, lineHeight: 1.9, marginBottom: 8 }}>
              整条流程由 7 次明确的交接构成。每一次交接都改变状态，且<strong>只有接收方确认后，状态才继续向前</strong>：
            </div>
            <Table
              size="small"
              rowKey="key"
              pagination={false}
              columns={handoffColumns}
              dataSource={handoffRows}
              data-testid="manual-handoff-table"
            />
            <div style={{ marginTop: 8, fontSize: 11.5, color: c.t3, lineHeight: 1.8 }}>
              这张表也是排查问题的入口：<strong>任何一条费用都能定位到"现在卡在谁手上"</strong>。
              如果某笔费用停在「S3 待反馈费用」，责任方是 Digital；停在「S4 待复核确认」或「SENT 已发出待确认」，责任方是业务部门。
            </div>
          </Card>

          {/* ============================================================
              第三章 · 后续规划
             ============================================================ */}
          <Card
            data-testid="manual-sec-roadmap"
            styles={{ body: { padding: 16 } }}
            style={{ marginTop: 16, borderTop: `3px solid ${c.success}` }}
          >
            <ChapterHead
              c={c}
              id="manual-anchor-roadmap"
              no="三"
              title="后续规划"
              desc="本页的规划与《三大能力评审》报告同源：报告里未关闭的事项，就是这里的待办清单。排序原则是「先让数据可信，再让流程可达，最后才是好看」。"
            />

            <SubHead c={c} title="3.1　演进方向（四条主线）" />
            <Row gutter={[12, 12]}>
              {[
                ['数据可信度', '口径必须单一出处。同一业务事实只允许存在一条取数路径 —— 这是所有其他工作的地基。', c.brand, <DeploymentUnitOutlined />],
                ['流程完整度', '每条流程都要能回退、能纠错。没有回退边的流程，一次误操作就意味着重来。', c.info, <LinkOutlined />],
                ['角色与权限', '从"流程分工"变成"身份约束"。这是项目管理板块的前置条件。', c.warning, <TeamOutlined />],
                ['版图扩展', '补齐项目管理板块，让 BRD 从提交到偏差归因的全过程可见。', c.success, <RocketOutlined />]
              ].map(([title, desc, color, icon]) => (
                <Col key={title} xs={24} md={12}>
                  <Card size="small" styles={{ body: { padding: 12 } }} style={{ height: '100%', borderLeft: `3px solid ${color}` }}>
                    <Flex align="center" gap={6}>
                      <span style={{ color, fontSize: 14 }}>{icon}</span>
                      <Text style={{ fontSize: 12.5, fontWeight: 600, color: c.t1 }}>{title}</Text>
                    </Flex>
                    <div style={{ marginTop: 6, fontSize: 11.5, color: c.t2, lineHeight: 1.8 }}>{desc}</div>
                  </Card>
                </Col>
              ))}
            </Row>

            <SubHead c={c} title="3.2　待实现的能力板块" tag="侧边栏「未完成」组" />
            <div style={{ fontSize: 12.5, color: c.t2, lineHeight: 1.9, marginBottom: 8 }}>
              以下五项对应侧边栏底部「未完成（规划中）」组的全部内容。它们的共同前提是<strong>角色权限</strong>：
              在没有身份约束的情况下，评估、签收、审批这些动作没有明确的执行主体，做成页面也无法闭环。
            </div>
            <Table
              size="small"
              rowKey="key"
              pagination={false}
              columns={nextColumns}
              dataSource={nextRows}
              data-testid="manual-roadmap-next"
            />
            <div style={{ marginTop: 10 }}>
              <Text style={{ fontSize: 12.5, fontWeight: 600, color: c.t1 }}>板块之间的依赖链</Text>
              <Chain
                c={c}
                steps={['角色权限', '需求受理', '评估与签收', '变更管理', '交付与偏差']}
                caption="严格串行：后一项的数据来源是前一项的产出。签收金额即「已承诺」，是预算消耗口径的直接输入。"
              />
              <div style={{ marginTop: 8 }}>
                <Text style={{ fontSize: 12.5, fontWeight: 600, color: c.t1 }}>独立可做的一项</Text>
                <Chain
                  c={c}
                  steps={['计费规则定稿']}
                  caption="不依赖角色权限 —— 它只是把既有的计费算法与账单口径写清楚，并兑现「账单行标注变更情况」这条已声称的规则。"
                />
              </div>
            </div>

            <SubHead c={c} title="3.3　阶段性目标" />
            <Table
              size="small"
              rowKey="key"
              pagination={false}
              columns={phaseColumns}
              dataSource={phaseRows}
              data-testid="manual-phase-table"
            />

            <SubHead c={c} title="3.4　待办清单与依赖关系" />
            <div style={{ fontSize: 12.5, color: c.t2, lineHeight: 1.9, marginBottom: 8 }}>
              按「收益 / 依赖」排序。收益列标注的是<strong>修复后能消除多大范围的困扰</strong>，不是实现难度。
              依赖列为空的事项可以随时插入任意批次。
            </div>
            <Table
              size="small"
              rowKey="key"
              pagination={false}
              columns={pendingColumns}
              dataSource={pendingRows}
              data-testid="manual-pending-table"
            />

            <SubHead c={c} title="3.5　优先级结论" />
            <DefList
              c={c}
              items={[
                ['① 先做无依赖的高收益项', '「项目预算超支零提示」与「版本排序比较器」都不依赖任何前置工作，且前者是编制场景最需要的信息（"我超了多少"）。'],
                ['② 再补导出与文案这类低风险项', '导出 CSV、Tooltip 文案订正、编制年 0% 语义 —— 零新数据源，可批量完成。'],
                ['③ 角色切换是分水岭', '它是批量催办与整个项目管理板块的前置。做完它，流程才从"演示"变成"可交接"。'],
                ['④ 项目管理板块按依赖链串行推进', '角色权限 → 需求受理 → 评估与签收 → 变更管理 → 交付与偏差。跳步会导致后一页取不到数。'],
                ['⑤ 视觉一致性放最后', '在口径未闭合时投入视觉打磨是本末倒置 —— 数据不可信时，界面再精致也不解决问题。']
              ]}
            />

            <Alert
              type="success"
              showIcon
              style={{ marginTop: 12 }}
              message="不建议现在做的事"
              description={
                <div style={{ fontSize: 12, lineHeight: 1.9 }}>
                  · <strong>运维表单校验细化</strong>（红框无原因说明、可提交 0 元明细）：演示路径不暴露该问题，但交付研发前必须补齐。
                  <br />· <strong>全站视觉打磨</strong>：应在口径闭合之后。
                </div>
              }
            />
          </Card>

          <div style={{ marginTop: 14, fontSize: 11.5, color: c.t3, lineHeight: 1.8, textAlign: 'center' }}>
            <Text style={{ fontSize: 11.5, color: c.t3 }}>
              本文档随版本迭代更新。当前对应版本：三大能力板块已交付 · 项目管理板块规划中。
            </Text>
          </div>
        </Col>
      </Row>
    </div>
  );
}
