import {
  CalendarOutlined, PieChartOutlined, FileTextOutlined, InboxOutlined, ReadOutlined
} from '@ant-design/icons';

/**
 * 侧边栏信息架构（v1.5）—— 数据源单一出处，SiderNav 与 App 定位条共享。
 *
 * v1.4 形态是「3 个一级板块，各自藏二级页」，问题是：已上线的页与规划中的页
 * 在视觉上完全同级，用户点进去才发现是半成品。v1.5 按**交付状态**重排：
 *   · 已完成的一级页 —— 平铺在顶部，直接可点，不套文件夹；
 *   · 未完成的页 —— 全部收进底部唯一的一个「未完成」文件夹，组标题带「规划中」标记。
 *
 * 路由段（module/view）**保持不变**：预算侧仍是 budget/*，账单侧仍是 billing/*，
 * 交付侧仍是 delivery/*。改的只是信息架构的呈现层，深链、书签、全局单号
 * 搜索（DM- / BRD- / CR- / BILL-）全部不受影响。
 */

/** 顶部平铺项：已上线的一级页，与文件层级无关，直接命中路由 */
export const FLAT_ITEMS = [
  { module: 'budget', view: 'annual', label: '年度预算计划', Icon: CalendarOutlined },
  { module: 'budget', view: 'consume', label: '预算消耗', Icon: PieChartOutlined },
  { module: 'billing', view: 'monthly', label: '对账单总览', Icon: FileTextOutlined }
];

/** 唯一的「未完成」文件夹：收纳全部规划中/半成品页面 */
export const BACKLOG_GROUP = {
  key: 'backlog',
  label: '未完成',
  subtitle: '规划中 · 尚未上线',
  Icon: InboxOutlined,
  items: [
    { module: 'billing', view: 'rules', label: '计费规则' },
    { module: 'delivery', view: 'brd', label: '需求受理' },
    { module: 'delivery', view: 'eval', label: '评估与签收' },
    { module: 'delivery', view: 'cr', label: '变更管理' },
    { module: 'delivery', view: 'deliver', label: '交付与偏差' }
  ]
};

/** 定位条用：当前视图是否属于顶部平铺区（决定定位条是否显示「未完成」前缀） */
export function isFlatView(module, view) {
  return FLAT_ITEMS.some((it) => it.module === module && it.view === view);
}

/**
 * 独立工具页：站点说明书（v1.7 新增）。
 *
 * 为什么**不**放进 FLAT_ITEMS、也不放进 BACKLOG_GROUP：
 *   · 它不是一个「业务能力板块」，与三大板块并排会让人误以为它是第四块能力；
 *   · 它已完整交付，放进「未完成」组是错误标签（那组的语义是"规划中"）。
 * 故单列一档，渲染在侧边栏底部，以分隔线与上方两区隔开。
 */
export const MANUAL_ITEM = {
  module: 'manual',
  view: 'guide',
  label: '站点说明书',
  Icon: ReadOutlined
};

/**
 * 定位条用：是否为**顶层页**（平铺业务页 或 独立说明页）。
 *
 * 顶层页的定位条直接从页名起、不加「未完成」前缀 —— 与侧边栏层级保持一致。
 * 这取代了 App.jsx 原先只判 `isFlatView` 的做法（那样说明书会被加上
 * 「未完成 ›」前缀，与它"已交付"的身份矛盾）。
 */
export function isTopLevelView(module, view) {
  return isFlatView(module, view) || (module === MANUAL_ITEM.module && view === MANUAL_ITEM.view);
}

/** 定位条用：取顶部平铺项的文案（未命中返回 null） */
export function flatLabel(module, view) {
  const hit = FLAT_ITEMS.find((it) => it.module === module && it.view === view);
  return hit ? hit.label : null;
}
