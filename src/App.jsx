import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Layout, Typography, Button, Result, Watermark, Tour, Flex,
  Segmented, Select, Input, Tooltip, App as AntApp
} from 'antd';
import { QuestionCircleOutlined, SettingOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import { useT } from './theme.js';
import { useStore } from './store.jsx';
import SiderNav from './components/SiderNav.jsx';
import BudgetModule from './pages/BudgetModule.jsx';
import DeliveryModule from './pages/DeliveryModule.jsx';
import BillingModule from './pages/BillingModule.jsx';
import DeptBillPage from './pages/DeptBillPage.jsx';
import ManualPage from './pages/ManualPage.jsx';
import SettingsDrawer from './components/SettingsDrawer.jsx';
import { isTopLevelView, BACKLOG_GROUP } from './navConfig.js';

const { Header, Content, Footer } = Layout;
const { Text } = Typography;

/* ------------------------------------------------------------------ *
 * v1.5 IA：路由段沿用 v0.3 的 budget / billing / delivery 三段（深链、
 * 书签、全局单号搜索都依赖它，**不改**）；侧边栏呈现改为「3 个已上线
 * 页平铺 + 1 个『未完成』文件夹」，见 src/navConfig.js。
 * 下方 NAV 仅用于路由合法性与定位条兜底，不再驱动侧边栏。
 * ------------------------------------------------------------------ */
const NAV = [
  { key: 'budget', label: '预算管理', subtitle: '编制与消耗' },
  { key: 'billing', label: '计费账单', subtitle: '账单与结算' },
  { key: 'delivery', label: '项目管理', subtitle: '需求受理与交付跟踪' },
  /* v1.7：站点说明书 —— 独立工具页，不属于任何业务板块。
     登记在此只为让「路由合法性判定」与 `activeKey` 解析认得它（见下方 URL 归一 effect）。
     它不出现在 NAV 驱动的任何列表里（侧边栏由 navConfig.js 独立驱动）。 */
  { key: 'manual', label: '站点说明书', subtitle: '使用说明' }
];

/** 编制年（次年编制）：与 BudgetModule.PLAN_FY / ProjectBudgetPage.PLAN_FY 同值。
 *  仅用于 DM- 全局搜索判断「该需求是否属于当年编制页」。 */
const PLAN_FY = 2027;

/**
 * 各板块的二级视图清单（v0.3 修订）
 * 预算管理：「业务规划BP」+「年度需求清单」融合为《年度预算计划》；
 *          「预算池总览」更名为《预算消耗》；移除「Digital整合规划」「部门预算池」。
 */
const MODULE_VIEWS = {
  budget: [
    { key: 'annual', label: '年度预算计划' },
    { key: 'bpplan', label: '年度 BP 计划' },
    { key: 'project', label: '项目预算计划' },
    { key: 'opsplan', label: '系统运维预算计划' },
    { key: 'consume', label: '预算消耗' }
  ],
  billing: [
    { key: 'monthly', label: '对账单总览' },
    { key: 'rules', label: '计费规则' },
    /* v1.4.3《部门账单详情页》独立页：非浮层，路由 `#/billing/dept/{deptCode}`。
     * **必须登记在此** —— 否则下面 URL 归一逻辑的 `noOrInvalidView` 守卫会认为
     * `dept` 是非法视图，把深链 `window.location.replace` **静默重定向**回
     * `#/billing/monthly` 并丢弃 param，用户看到总览页且**没有任何报错**。
     * 登记进 MODULE_VIEWS 与「不进侧边栏」不冲突：侧边栏由 SiderNav.GROUPS 独立驱动。 */
    { key: 'dept', label: '部门账单详情' }
  ],
  delivery: [
    { key: 'brd', label: '需求受理' },
    { key: 'eval', label: '评估与签收' },
    { key: 'cr', label: '变更管理' },
    { key: 'deliver', label: '交付与偏差' }
  ],
  /* v1.7：站点说明书（单视图）。必须登记 —— 否则下方 URL 归一 effect 的
     `noOrInvalidView` 守卫会把 `#/manual/guide` 判成非法视图并静默 replace 回默认页。 */
  manual: [{ key: 'guide', label: '站点说明书' }]
};

const MODULE_DEFAULT_VIEW = { budget: 'annual', billing: 'monthly', delivery: 'brd', manual: 'guide' };
const DEFAULT_VIEW = 'annual';
const DEFAULT_PATH = 'budget/annual';

/**
 * 已下线的二级视图（v0.3）→ 新视图映射。
 * 旧 hash 不静默失败：一次性提示后重定向到承接职责的新视图。
 */
const LEGACY_VIEWS = {
  budget: {
    pool: { to: 'consume', note: '「预算池总览」已更名为「预算消耗」' },
    bp: { to: 'annual', note: '「业务规划BP」已并入「年度预算计划」' },
    demand: { to: 'annual', note: '「年度需求清单」已并入「年度预算计划」' },
    plan: { to: 'annual', note: '「Digital整合规划」已下线，整合口径并入「年度预算计划」' },
    deptpool: { to: 'consume', note: '「部门预算池」已下线，额度调节与消耗明细见「预算消耗」' }
  },
  /* v1.4.3：两个已下线的账单视图 —— 不静默失败，一次性提示后重定向到承接方。 */
  billing: {
    reconcile: { to: 'monthly', note: '「消耗与对账」已下线，逐月核对职责并入《对账单总览》的交付 / 运维明细楼层' },
    bill: { to: 'dept', note: '「业务部门账单详情」已并入《部门账单详情页》' }
  }
};

/** 已被移除的一级入口（旧 hash），重定向到默认落点并提示，不静默失败 */
const LEGACY_SEGS = { settings: '基础数据' };

/* ------------------------------------------------------------------ *
 * hash 路由：#/{module}/{view}/{param}/{tail}/{sub2}
 *   · 前三段为既有「板块 / 二级视图 / 参数」；
 *   · 第四段 `tail` 供下钻页的次级视图使用（如《项目预算计划》的 `/new`）
 *     进行中版本视图；
 *   · 第五段 `sub2` 供次级视图再下钻一层（v0.8.2：如 `/new/{demandId}`
 *     的项目编辑独立页）。解析 `?` 之前的内容，query 仍被丢弃。
 *   · 第 4/5 段对其它板块无意义，缺省即 null，不影响既有路由。
 * ------------------------------------------------------------------ */
function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash || `#/${DEFAULT_PATH}`);
  useEffect(() => {
    const on = () => setHash(window.location.hash || `#/${DEFAULT_PATH}`);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const clean = hash.replace(/^#\/?/, '');
  const parts = clean.split('?')[0].split('/');
  const [seg, sub, param, tail, sub2] = parts;
  return {
    hash,
    seg: seg || 'budget',
    sub: sub ? decodeURIComponent(sub) : null,
    param: param ? decodeURIComponent(param) : null,
    tail: tail ? decodeURIComponent(tail) : null,
    sub2: sub2 ? decodeURIComponent(sub2) : null
  };
}

export default function App() {
  const c = useT();
  const { data, globalFy, setGlobalFy } = useStore();
  const { message } = AntApp.useApp();
  const { seg, sub, param, tail, sub2 } = useHashRoute();

  const [tourOpen, setTourOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dept, setDept] = useState('all'); // 默认「全部部门」；仅作数据过滤，不承担鉴权（Demo 单角色）
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem('dkt.sider.collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const legacyOnceRef = useRef(false);
  const homeOnceRef = useRef(false);

  /* ---------- Sider 折叠态持久化 ---------- */
  useEffect(() => {
    try {
      window.localStorage.setItem('dkt.sider.collapsed', String(collapsed));
    } catch {
      /* 忽略隐私模式下的写入异常 */
    }
  }, [collapsed]);

  /* ---------- 默认落点重定向：无 hash / #/ / #/home ---------- */
  useEffect(() => {
    const h = window.location.hash;
    if (!h || h === '#/' || h === '#/') {
      window.location.hash = `#/${DEFAULT_PATH}`;
      return;
    }
    if (seg === 'home') {
      if (!homeOnceRef.current) {
        homeOnceRef.current = true;
        message.info('总览页已下线，所有能力已收口到左侧导航');
      }
      window.location.hash = `#/${DEFAULT_PATH}`;
    }
  }, [seg, message]);

  /* ---------- 旧一级入口重定向（一次性提示） ---------- */
  useEffect(() => {
    if (LEGACY_SEGS[seg]) {
      if (!legacyOnceRef.current) {
        legacyOnceRef.current = true;
        message.info(`「${LEGACY_SEGS[seg]}」已并入新导航，请从左侧目录进入`);
      }
      window.location.hash = `#/${DEFAULT_PATH}`;
    } else {
      legacyOnceRef.current = false;
    }
  }, [seg, message]);

  /* ---------- 旧二级视图重定向（一次性提示，不静默失败） ---------- */
  const legacyViewOnceRef = useRef(null);
  useEffect(() => {
    const map = LEGACY_VIEWS[seg];
    const hit = map && sub ? map[sub] : null;
    if (!hit) return;
    const key = `${seg}/${sub}`;
    if (legacyViewOnceRef.current === key) return;
    legacyViewOnceRef.current = key;
    message.info(`${hit.note}，正在跳转`);
    window.location.hash = `#/${seg}/${hit.to}`;
  }, [seg, sub, message]);

  /* ---------- 合法板块下的 URL 归一（无视图 / 非法视图 → 板块默认视图） ----------
   * 必须排在 LEGACY_VIEWS 重定向之后：守卫条件排除旧视图，
   * 否则会把 #/budget/deptpool 抢成 annual，改坏 v0.3 旧视图重定向能力。
   * 用 replace，不污染历史栈。
   */
  useEffect(() => {
    const isValidModule = NAV.some((n) => n.key === seg);
    const isLegacyView = !!(LEGACY_VIEWS[seg] && sub && LEGACY_VIEWS[seg][sub]);
    const noOrInvalidView = !sub || !MODULE_VIEWS[seg].some((v) => v.key === sub);
    if (isValidModule && !isLegacyView && noOrInvalidView) {
      window.location.replace(`#/${seg}/${MODULE_DEFAULT_VIEW[seg]}`);
    }
  }, [seg, sub]);

  /* ---------- 路由解析 ---------- */
  /* v1.7：改用 NAV 判定「已知板块」—— 与上方 URL 归一 effect 的 isValidModule 同源，
     避免两处各写一份板块白名单（新增板块时漏改一处就会 404）。 */
  const known = NAV.some((n) => n.key === seg) || !!LEGACY_SEGS[seg];
  const activeKey = NAV.some((n) => n.key === seg) ? seg : 'budget';

  const views = MODULE_VIEWS[activeKey] || [];
  const activeView = useMemo(() => {
    if (!views.length) return null;
    return views.find((v) => v.key === sub) || views.find((v) => v.key === MODULE_DEFAULT_VIEW[activeKey]) || views[0];
  }, [views, sub, activeKey]);

  const go = (module, view, param, tail, sub2) => {
    let path = module;
    if (view) path += `/${view}`;
    if (param) path += `/${encodeURIComponent(param)}`;
    if (tail) path += `/${encodeURIComponent(tail)}`;
    // v0.8.2：第 5 段（项目编辑独立页的 demandId）。缺省不拼，保持既有 4 段 URL 逐字不变。
    if (sub2) path += `/${encodeURIComponent(sub2)}`;
    window.location.hash = `#/${path}`;
  };

  /* ---------- 全局单号搜索：按前缀路由 ---------- */
  const onGlobalSearch = (raw) => {
    const code = (raw || '').trim().toUpperCase();
    if (!code) return;
    if (code.startsWith('DM-')) {
      // DM- → 《项目预算计划》下钻页，**仅当该需求属编制年（PLAN_FY = FY2027）**。
      // FY2026 的需求不属于 2027 编制页（年份错配），或取不到部门时，回退原行为
      // —— go('budget','annual', code) 由年度预算计划深链打开该需求详情。
      const dm = data.demands.find((d) => d.id === code);
      if (dm && dm.fy === PLAN_FY && dm.dept) go('budget', 'project', dm.dept);
      else go('budget', 'annual', code);
    } else if (code.startsWith('BRD-')) {
      // BRD- → 项目管理>需求受理，并自动打开详情抽屉（抽屉联动第二轮实现）
      go('delivery', 'brd', code);
    } else if (code.startsWith('CR-')) {
      // CR- → 项目管理>变更管理，并筛选出该 CR（筛选联动第二轮实现）
      go('delivery', 'cr', code);
    } else if (code.startsWith('BILL-')) {
      /* v1.4.3：BILL- 单号 → 《部门账单详情页》。
       * 单号形如 `BILL-202608-RETAIL`，后缀即部门代码（与 calc.billIdOf 同构），
       * 故直接从单号取部门跳详情页；单号里的账期作为该页的初始月份下拉值。 */
      const m = /^BILL-(\d{4})(\d{2})-(.+)$/.exec(code);
      if (m) {
        window.location.hash = `#/billing/dept/D-${m[3]}/${m[1]}-${m[2]}`;
        return;
      }
      message.warning('账单编号格式有误，应为 BILL-YYYYMM-部门代码');
    } else {
      // inline 提示，不弹 Modal
      message.warning('无法识别的单号，请输入 DM- / BRD- / CR- / BILL- 开头的单号');
    }
  };

  const deptOptions = useMemo(
    () => [
      { value: 'all', label: '全部部门' },
      ...data.departments.map((d) => ({ value: d.code, label: d.name }))
    ],
    [data.departments]
  );

  return (
    <Watermark content="迪卡侬中国 · 内部系统 · 演示数据" font={{ fontSize: 13 }} gap={[160, 160]} style={{ minHeight: '100vh' }}>
      {/* ============ 外壳：左侧两级目录树 + 右侧 Header/Content/Footer ============ */}
      <Layout style={{ minHeight: '100vh', background: c.bg2, flexDirection: 'row' }}>
        <SiderNav
          active={{ module: activeKey, view: activeView ? activeView.key : null }}
          onNavigate={go}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((v) => !v)}
        />

        {/* 内层 Layout 作为 row 布局的 flex 子项，默认 min-width:auto 会阻止其收缩到内容宽以下；
            显式 minWidth:0 让「视口溢出」下移为**表格内部横向滚动**，
            从而 .ant-table-content 的 clientWidth < scrollWidth、fixed:'right' 版本列常驻可见。
            （外层 Watermark 容器自带 overflow:hidden，若不收敛收缩链，溢出部分会被直接裁掉且不可达。） */}
        <Layout style={{ minWidth: 0 }}>
          {/* ============ Header（高 64，全局控件区，顺序固定） ============ */}
          <Header
            style={{
              height: 64,
              background: c.bg1,
              borderBottom: `1px solid ${c.split}`,
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              paddingInline: 24
            }}
          >
            <Button
              type="text"
              data-testid="sider-collapse"
              aria-label={collapsed ? '展开导航' : '收起导航'}
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed((v) => !v)}
            />

            {/* 全局控件区 flex:1，右对齐（顺序固定：年度 → 部门 → 搜索 → 设置） */}
            <Flex align="center" gap={12} style={{ flex: '1 1 auto', justifyContent: 'flex-end' }}>
              <Segmented
                value={globalFy}
                onChange={setGlobalFy}
                options={[
                  { label: 'FY2026 执行中', value: 2026 },
                  { label: 'FY2027 编制中', value: 2027 }
                ]}
              />
              <Select
                showSearch
                value={dept}
                onChange={setDept}
                optionFilterProp="label"
                style={{ width: 140 }}
                options={deptOptions}
              />
              <Input.Search
                allowClear
                placeholder="输入 DM- / BRD- / CR- / BILL- 单号"
                style={{ width: 220 }}
                onSearch={onGlobalSearch}
              />
              <Tooltip title="平台设置">
                <Button type="text" icon={<SettingOutlined />} onClick={() => setSettingsOpen(true)} />
              </Tooltip>
            </Flex>
          </Header>

          <Content style={{ padding: '16px 24px 32px', minWidth: 0 }}>
            {/* 内容区定位条（替代全量面包屑） */}
            <div
              data-testid="content-locator"
              style={{
                height: 32,
                marginBottom: 12,
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              {/* v1.5：平铺页无上级板块，定位条直接从页名起；
                  「未完成」组的页面才带「未完成」前缀，与侧边栏层级一致。
                  v1.7：「顶层页」判定扩展为 isTopLevelView —— 站点说明书也是顶层页
                  （已交付、不属规划中），否则会被误加「未完成 ›」前缀。 */}
              {!isTopLevelView(activeKey, activeView ? activeView.key : null) && (
                <>
                  <span style={{ color: c.t2 }}>{BACKLOG_GROUP.label}</span>
                  <span style={{ color: c.t4 }}>›</span>
                </>
              )}
              <span style={{ color: c.t1, fontWeight: 500 }}>{activeView ? activeView.label : ''}</span>
              {param ? (
                <>
                  <span style={{ color: c.t4 }}>›</span>
                  <span style={{ color: c.brand }}>{param}</span>
                </>
              ) : null}
              {tail ? (
                <>
                  <span style={{ color: c.t4 }}>›</span>
                  <span style={{ color: c.brand }}>新版本</span>
                </>
              ) : null}
              {/* v0.8.2：第五段（项目编辑独立页的 demandId），如 … › D-RETAIL › 新版本 › DM-2027-0001 */}
              {sub2 ? (
                <>
                  <span style={{ color: c.t4 }}>›</span>
                  <span style={{ color: c.brand }}>{sub2}</span>
                </>
              ) : null}
            </div>

            {!known ? (
              <Result
                status="404"
                title={<span style={{ fontSize: 18 }}>页面不存在</span>}
                subTitle={<span style={{ fontSize: 13 }}>请通过左侧导航进入对应模块。</span>}
                extra={
                  <Button type="primary" onClick={() => go('budget', DEFAULT_VIEW)}>
                    返回预算管理
                  </Button>
                }
              />
            ) : (
              <>
                {activeKey === 'budget' && <BudgetModule view={activeView ? activeView.key : 'annual'} param={param} tail={tail} sub2={sub2} onNavigate={go} />}
                {activeKey === 'billing' && activeView && activeView.key === 'dept' && (
                  /* 《部门账单详情页》独立页 —— 非浮层，param = deptCode */
                  /* v1.6：`tail`（第 4 段）承载账期，如 `#/billing/dept/D-RETAIL/2026-08`。
                     此前账期只存在于组件 useState，跨页必丢 —— 总览选 8 月 → 查账进详情页
                     显示累计 8 个月 → 点「返回」回总览也回累计态，用户建立的心智模型跨一次页就断。
                     基础设施（useHashRoute 已解析 tail、go() 已透传、:249 全局单号跳转
                     早已在用这个格式）本就存在，只是两页都没读它。 */
                  <DeptBillPage param={param} tail={tail} onNavigate={go} />
                )}
                {activeKey === 'billing' && (!activeView || activeView.key !== 'dept') && (
                  <BillingModule view={activeView ? activeView.key : 'monthly'} param={param} tail={tail} sub2={sub2} msgApi={message} onNavigate={go} />
                )}
                {activeKey === 'delivery' && <DeliveryModule view={activeView ? activeView.key : 'brd'} param={param} onNavigate={go} />}
                {/* v1.7：站点说明书 —— 独立工具页，不读 store、不依赖任何业务数据 */}
                {activeKey === 'manual' && <ManualPage onNavigate={go} />}
              </>
            )}
          </Content>

          <Footer style={{ textAlign: 'center', background: 'transparent', padding: '8px 24px 24px' }}>
            <Text style={{ fontSize: 12, color: c.t3 }}>
              演示原型 · 数据均为脱敏构造，不包含任何真实业务数据
            </Text>
          </Footer>
        </Layout>
      </Layout>

      {/* 平台设置抽屉：关闭不改变路由 */}
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <Tour
        open={tourOpen}
        onClose={() => setTourOpen(false)}
        steps={[
          {
            title: '年度预算计划',
            description: '已上线。三个编制项主表：年度 BP 计划 / 项目预算计划 / 系统运维预算计划，支持提交与更新。',
            target: () => document.querySelector('[data-testid="sider-flat-budget-annual"]') || document.body
          },
          {
            title: '预算消耗',
            description: '已上线。总包与消耗进度，按部门 / 成本类型查看，点「查账」直达该部门账单详情页。',
            target: () => document.querySelector('[data-testid="sider-flat-budget-consume"]') || document.body
          },
          {
            title: '对账单总览',
            description: '已上线。全局观察交付与运维两类费用发生，点列表行进入《部门账单详情》独立页。',
            target: () => document.querySelector('[data-testid="sider-flat-billing-monthly"]') || document.body
          },
          {
            title: '未完成',
            description: `规划中，尚未上线：${BACKLOG_GROUP.items.map((i) => i.label).join(' / ')}。这些页面可访问但功能未定稿。`,
            target: () => document.querySelector('[data-testid="sider-group-backlog"]') || document.body
          },
          /* v1.7：站点说明书（独立工具页）—— 放在最后，因为它是"读文档"而不是"用功能" */
          {
            title: '站点说明书',
            description: '平台统一说明文档：三大能力板块各自的设计与关键逻辑、两个使用角色的场景与交接、以及后续规划与优先级依赖。',
            target: () => document.querySelector('[data-testid="sider-manual"]') || document.body
          }
        ]}
      />

      {/* 使用引导入口保留为右下角悬浮按钮（Tour 由该按钮触发） */}
      <Button
        type="text"
        size="small"
        icon={<QuestionCircleOutlined />}
        onClick={() => setTourOpen(true)}
        style={{ position: 'fixed', right: 16, bottom: 16, background: c.bg1, border: `1px solid ${c.border}` }}
      >
        使用引导
      </Button>
    </Watermark>
  );
}
