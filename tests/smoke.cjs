/**
 * 冒烟测试（v0.7.2）：在 jsdom 中加载 dist 构建产物，逐视图断言渲染结果与关键业务规则。
 *
 * 为什么必须做：Vite build 不会捕获组件里未导入的标识符（例如用了 <Tag> 却没 import），
 * 那属于运行时 ReferenceError，构建照样成功，页面却会白屏。
 *
 * 断言策略（v0.2.1 修订）：**区块断言一律绑定 DOM 结构锚点 `data-testid`**，
 * 而不是「某段中文是否在页面上出现过」—— 后者会被 PageHead.desc / Hint / Alert 里的
 * 同名字样「撞文案」而空转。
 *
 * 覆盖：
 *   1. 外壳：左侧栏 3 个一级板块 + 9 个二级视图入口 + Header 全局控件
 *   2. 外壳与默认落点：无 hash → #/budget/annual；总览页已下线；定位条替代面包屑
 *   3. 9 个二级视图全部可达（区块锚点）+ v0.3 IA 变更定向断言
 *   3.0-v0.5 年度预算计划口径：BP 只有已提交/未提交（版本变更记录）；需求清单以「整份清单」为
 *            版本单位（待评估费用 → 已确认 V1.0/V1.1），无逐条版本管理与逐条状态列
 *   3.0-v0.5.1 主表单元格精简：① BP = 状态 + 版本号；② 需求清单 = 状态 + 总费用 + 条数；
 *            ③ 运维 = 状态 + 总费用 + 系统数量。旁注（时间戳 / 文档形式 / 变更说明）退到 title 与抽屉
 *   3.0-v0.6 术语统一 + 单元格信息层级重构：列名去掉「提交及更新」后缀（① 年度 BP / ② 项目预算 /
 *            ③ 系统运维预算）；单元格改为「产物数值 16px 主信息 + 状态圆点 12px 辅助行」两级，
 *            状态由 Tag 降级为 Badge 圆点，无产物时主数值降为淡色；合计行与列内同源同构
 *   3.0-v0.6.1 列宽重排与屏效：六列宽度按内容实测收紧（170/112/164/168/128/116，合计 858，
 *            原 965）；表格密度 middle→small、单元格内边距 4→2、行间距 4→2（行高 ~74→~60px）；
 *            编制完整度进度条改吃弹性宽度，列被撑开时拉长进度条而非留白
 *   3.0-v0.7 预算消耗两楼层重构：楼层一由「四个并列指标卡」改为《整体预算消耗情况》三张卡
 *            （整体 / 项目 / 运维预算总包，各自带消耗进度与档位）；楼层二定名《部门预算消耗情况》，
 *            表格改为三组「预算及消耗」列（整体 / 项目 / 运维）
 *            —— 其中行内「调整预算计划」入口已于 v1.3 下线，见下方 v1.3 条目
 *   3.0-v0.7.1 部门预算消耗表去噪：消耗格去掉进度条、健康度改由消耗率数字着色承载；
 *            移除「状态」列（与整体消耗率颜色同源重复），计数迁至楼层二标题行
 *   3.0-v0.7.2 部门预算消耗表两列并一列：三个维度各占一列（上行总预算金额 + 万元，
 *            下行已消耗百分比着档位色），分组表头取消、表头回到单行 5 格；
 *            消耗金额等量进单元格 title；列宽 958 → 670
 *   3.0-v1.3 预算消耗视图行操作只留读：移除行内「调整预算计划」按钮（预算调整权收归
 *            《项目预算计划》页），整条「调整项目预算」业务分支（AdjustPlanForm / 抽屉 /
 *            store.adjustProjectBudget / poolAdjustments 流水）一并下线，无死代码；
 *            操作列宽 158 → 76、表格总宽 670 → 588；
 *            断言由「分支可用」翻转为「分支确已消失」（行内每行恰好 1 个按钮 + 无 plan-* 锚点）
 *   3.0-v1.2 年度预算计划主表两列减法 + 一列加法：移除「编制完整度」「操作」两列
 *            （完整度是 ①②③ 状态的派生量；操作入口已被格内下钻全覆盖）与对应筛选器；
 *            新增「总预算费用」列 = 清单当前版本费用合计 + 系统运维预算（含业务预估口径），
 *            列宽 858 → 754（170/112/164/168/140），合计行新增 Σ总 = Σ项目 + Σ运维
 *   3.0-v1.1 ③ 系统运维预算改走独立《系统运维预算计划》页：主表「③」格 / 综合视图 ③ 卡直接
 *            跳页（#/budget/opsplan/{deptCode}），右侧浮层 OpsPanel 与 PlanActionModal 死代码移除；
 *            只读明细恰 5 列 / 恒等式同屏 / 整表编辑（单价·用量可改、费用恒推导）/ 六动作草稿
 *            状态机（start→save/submit→confirm/reject/discard）/ 统一流水 + 版本明细浮层 /
 *            R4 三级回退（已确认明细 → 待业务确认草稿合计 → 模型派生，提交即生效主表格）/
 *            全流程零 antd 废弃告警
 *   3.0-v1.1r REVISE 修复：编辑态概览卡随草稿缓冲并标注「（草稿）」口径（P0-1）；流水去重改按
 *            事件身份（同分钟「保存+提交」+2 不吞行，P0-2）；版本快照深拷贝断开别名（P1-3）；
 *            3 条无效断言改写（Drawer 容器缺席 / 确认写回明细端到端 / 零废弃告警加 src 静态扫描）
 *   4. TraceChain 三处内嵌（BRD 详情 / 需求详情 / 账单交付行）+ 逐节点 state
 *   5. 全局单号搜索 4 个前缀（DM- / BRD- / CR- / BILL-）+「查账」跳转账单模块
 *      —— DM- 按年份区分：FY2027 → 项目预算计划下钻页；FY2026 → 回退年度预算计划深链需求详情
 *   5.0-v0.8 ② 项目预算改走独立《项目预算计划》页：7 列（列序/列宽严格锁定）/
 *            进行中内容不入基础列表 / 统一流水去重 / `/new` 空态兜底；主表旧 DEMAND 浮层已下线
 *   6. ⚙ 平台设置抽屉 4 个页签
 *   7. 旧 hash：/#/trace → 404，/#/settings 与 /#/home → 重定向默认落点；已下线二级视图 → 重定向承接视图
 *   7.2 侧边栏交互：折叠持久化 / 二级项可导航 / #/home 重定向 / 404 返回按钮
 *   7.3 合法板块 URL 归一：无 view / 非法 view → 板块默认视图（不污染历史栈）
 *   8. 运行期零 console 错误 / React 警告
 *
 * 用法：node tests/smoke.cjs
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const errors = [];
const results = [];

function norm(s) {
  return (s || '').replace(/\s+/g, '');
}

function setValue(win, el, value) {
  const proto =
    el.tagName === 'TEXTAREA' ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new win.Event('input', { bubbles: true }));
}

const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  const bundle = fs.readFileSync(path.join(DIST, 'assets', 'app.js'), 'utf8');

  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => {
    if (/Not implemented|Could not parse CSS/i.test(e.message)) return;
    errors.push('[jsdomError] ' + e.message);
  });
  vc.on('error', (...a) => errors.push('[error] ' + a.join(' ')));
  vc.on('warn', (...a) => {
    const s = a.join(' ');
    if (/Warning: |antd:/.test(s)) errors.push('[warn] ' + s);
  });

  const dom = new JSDOM(html.replace(/<script[^>]*><\/script>/g, ''), {
    url: 'file:///' + path.join(DIST, 'index.html').replace(/\\/g, '/'),
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(win) {
      win.matchMedia = (q) => ({
        matches: /min-width:\s*(768|992|1200|1600)px/.test(q),
        media: q,
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent: () => false
      });
      win.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
      win.scrollTo = () => {};
      win.HTMLElement.prototype.scrollIntoView = () => {};
      try {
        const store = {};
        Object.defineProperty(win, 'localStorage', {
          configurable: true,
          value: {
            getItem: (k) => (k in store ? store[k] : null),
            setItem: (k, v) => {
              store[k] = String(v);
            },
            removeItem: (k) => {
              delete store[k];
            },
            clear: () => Object.keys(store).forEach((k) => delete store[k])
          }
        });
      } catch (_) {
        /* 忽略 */
      }
    }
  });

  const win = dom.window;
  win.console.error = (...a) => errors.push('[console.error] ' + a.map(String).join(' '));
  win.console.warn = (...a) => {
    const s = a.map(String).join(' ');
    if (/Warning: |antd:/.test(s)) errors.push('[console.warn] ' + s);
  };

  // 执行构建产物
  win.eval(bundle);
  await tick(400);

  const doc = win.document;
  const text = () => norm(doc.body.textContent);
  const has = (s) => text().includes(norm(s));

  function check(name, cond, detail) {
    results.push({ name, ok: !!cond, detail: detail || '' });
  }

  /* ---------- 结构断言辅助（绑定 data-testid，不受文案改动影响） ---------- */
  const byTestId = (id) => doc.querySelector(`[data-testid="${id}"]`);
  const exists = (id) => !!byTestId(id);
  const blockHas = (id, s) => {
    const el = byTestId(id);
    return !!el && norm(el.textContent).includes(norm(s));
  };
  /** TraceChain 节点的 aria-label（按节点前缀，如 '⑤交付上线'） */
  const nodeAria = (prefix) =>
    Array.from(doc.querySelectorAll('[role="button"][aria-label*="状态："]'))
      .map((e) => e.getAttribute('aria-label') || '')
      .find((a) => a.startsWith(prefix)) || '';

  function findByText(selector, target) {
    return Array.from(doc.querySelectorAll(selector)).find((e) => norm(e.textContent) === norm(target));
  }

  const click = (el) => el && el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

  async function goView(pathStr) {
    win.location.hash = '#/' + pathStr;
    win.dispatchEvent(new win.HashChangeEvent('hashchange'));
    await tick(220);
  }

  // 全局单号搜索：在顶部搜索框输入 + 点击搜索按钮（与真实交互一致）
  async function globalSearch(code) {
    const input = doc.querySelector('input[placeholder^="输入 DM-"]');
    if (!input) {
      check('全局搜索框存在', false, '未找到顶部单号搜索框');
      return;
    }
    setValue(win, input, code);
    input.dispatchEvent(new win.Event('change', { bubbles: true }));
    await tick(60);
    const btn = doc.querySelector('.ant-input-search-button');
    if (!btn) {
      check('全局搜索按钮存在', false, '未找到搜索按钮');
      return;
    }
    click(btn);
    await tick(260);
  }

  /* ============ 1. 挂载 + 外壳 ============ */
  /* v0.4 起总览页为纯分流首页（无数据明细），阈值由 500 校准为 200 */
  const rootChars = doc.getElementById('root').textContent.length;
  check('React 挂载成功且非空', rootChars > 200, `root 文本长度 ${rootChars}`);
  check('页头显示平台名称', has('数字化项目预算管理平台'));
  /* v1.5 IA：3 个已上线一级页平铺（无文件夹），其余全部收进唯一「未完成」组。 */
  const flatLabels = Array.from(doc.querySelectorAll('[data-testid^="sider-flat-"]')).map((e) => e.textContent.trim());
  check('侧边栏：3 个已上线页平铺在顶部（无文件夹包裹）', (() => {
    const groups = Array.from(doc.querySelectorAll('[data-testid^="sider-group-"]'));
    return flatLabels.length === 3 &&
      ['年度预算计划', '预算消耗', '对账单总览'].every((x) => flatLabels.includes(x)) &&
      /* 平铺区不得再挂一级文件夹：整个侧边栏只允许「未完成」一个组 */
      groups.length === 1 && groups[0].getAttribute('data-testid') === 'sider-group-backlog';
  })());
  check('侧边栏：「未完成」组收纳 5 项（计费规则 + 项目管理四项）', (() => {
    const items = Array.from(doc.querySelectorAll('[data-testid^="sider-item-"]')).map((e) => e.textContent.trim());
    return items.length === 5 &&
      ['计费规则', '需求受理', '评估与签收', '变更管理', '交付与偏差'].every((x) => items.includes(x));
  })());
  check('侧边栏：「未完成」组带「规划中」状态标记', (() => {
    const g = byTestId('sider-group-backlog');
    return !!g && norm(g.textContent).includes('规划中') && norm(g.textContent).includes('未完成');
  })());
  /* 反向证明：已下线的视图不可达（防回归复活）；已上线的三页不得被误塞进「未完成」 */
  check('侧边栏：已下线视图不可达，且已上线三页不在「未完成」组内', (() => {
    const items = Array.from(doc.querySelectorAll('[data-testid^="sider-item-"]')).map((e) => e.textContent.trim());
    return !items.some((t) => t.includes('消耗与对账')) &&
      !items.some((t) => ['年度预算计划', '预算消耗', '对账单总览'].includes(t));
  })());
  check('旧横向导航已移除', doc.querySelectorAll('.ant-menu-horizontal .ant-menu-item').length === 0);
  check('顶部全局控件：单号搜索框存在', !!doc.querySelector('input[placeholder^="输入 DM-"]'));
  check('顶部全局控件：设置入口存在', !!doc.querySelector('.anticon-setting'));

  /* ============ 2. 外壳与默认落点 ============ */
  await tick(220); // 首屏无 hash 需等待挂载副作用重定向
  check('默认落点：无 hash 时重定向到 #/budget/annual', win.location.hash === '#/budget/annual');
  check('总览页已下线（home-cycle 锚点不存在）', !exists('home-cycle'));
  check('默认渲染年度预算计划主表', exists('budget-annual-table'));
  check('定位条存在且不含「总览」', exists('content-locator') && !norm(byTestId('content-locator').textContent).includes('总览'));
  /* v1.5：平铺页的定位条从页名起，无「未完成」前缀 */
  check('定位条：平铺页不带上级前缀（年度预算计划直接起）', (() => {
    const t = norm(byTestId('content-locator').textContent);
    return t.startsWith('年度预算计划') && !t.includes('未完成') && !t.includes('预算管理');
  })());
  check('年度控件全局唯一 —— 全页仅 Header 1 个 Segmented', doc.querySelectorAll('.ant-segmented').length === 1);

  /* ============ 3. 9 个二级视图（区块锚点断言） ============ */
  const VIEWS = [
    [
      'budget/annual',
      '视图 budget/annual：年度预算计划（三个编制项主表）',
      () =>
        blockHas('budget-annual-table', '各 BU 年度预算计划编制情况') &&
        ['① 年度 BP', '② 项目预算', '③ 系统运维预算'].every((x) => blockHas('budget-annual-table', x)) &&
        !blockHas('budget-annual-table', '提交及更新') &&
        exists('budget-annual-cell-bp-D-RETAIL') &&
        exists('budget-annual-cell-demand-D-RETAIL') &&
        exists('budget-annual-cell-ops-D-RETAIL') &&
        !exists('budget-annual-cell-project-D-RETAIL') &&
        blockHas('budget-annual-table', '总预算费用') &&
        !blockHas('budget-annual-table', '编制完整度') &&
        !blockHas('budget-annual-table', '已齐备')
    ],
    [
      'budget/consume',
      '视图 budget/consume：整体预算消耗情况（三张卡）+ 部门预算消耗情况（三组预算及消耗）',
      () =>
        blockHas('budget-consume-overview', '整体预算消耗情况') &&
        ['overall', 'project', 'ops'].every((k) => exists(`budget-consume-card-${k}`)) &&
        blockHas('budget-consume-card-overall', '各部门数字化整体预算总包') &&
        blockHas('budget-consume-card-project', '项目预算总包') &&
        blockHas('budget-consume-card-ops', '运维预算总包') &&
        blockHas('budget-consume-section-dept', '部门预算消耗情况') &&
        blockHas('budget-consume-table', '整体预算及消耗') &&
        blockHas('budget-consume-table', '项目预算及消耗') &&
        blockHas('budget-consume-table', '运维预算及消耗') &&
        blockHas('budget-consume-caption', '可用余额 = 总包 − 已承诺 − 已核销')
    ],
    /* v1.4.1：《月度账单》重定义为《对账单总览》——
       楼层一 = 3 张指标卡（交付/运维/合计，**删掉「新增/变更」卡**）；
       楼层二 = 趋势图（**独立楼层，已从指标楼层移出**，属列表板块）；
       楼层三 = 列表，**不含任何「新增/变更」列**（总览页只客观呈现费用发生）。 */
    ['billing/monthly', '视图 billing/monthly：对账单总览（3 卡 + 趋势独立楼层 + 无新增/变更列）', () =>
      blockHas('billing-overview-floor1', '费用构成') &&
      blockHas('billing-overview-floor1', '交付计费') &&
      blockHas('billing-overview-floor1', '运维计费') &&
      exists('billing-overview-trend') &&
      blockHas('billing-overview-trend', '月度费用趋势') &&
      /* 趋势图已不在指标楼层内 —— 锁死「不并列」这个决策 */
      !blockHas('billing-overview-floor1', '月度费用趋势') &&
      blockHas('billing-monthly-table', '部门计费账单总览') &&
      !blockHas('billing-overview-floor1', '年度新增') &&
      !blockHas('billing-monthly-table', '其中：新增需求') &&
      !blockHas('billing-monthly-table', '其中：变更增减')],
    /* v1.4.3：「消耗与对账」已**彻底下线** —— 断言方向由「视图可达」翻转为
       「视图确已消失」+「旧 hash 走重定向不静默失败」（见下方 v1.4.3 段）。 */
    ['billing/rules', '视图 billing/rules：计费规则', () => blockHas('billing-rules-rate', '角色人天费率') && blockHas('billing-rules-systems', '系统目录与运维计费')],
    ['delivery/brd', '视图 delivery/brd：需求受理', () => blockHas('view-delivery-brd', '需求受理（BRD）') && blockHas('view-delivery-brd', 'BRD-2026-0101')],
    ['delivery/eval', '视图 delivery/eval：评估与签收', () => blockHas('view-delivery-eval', '待签收（队列）')],
    ['delivery/cr', '视图 delivery/cr：变更管理', () => blockHas('view-delivery-cr', 'CR-2026-0031') && blockHas('view-delivery-cr', '增减金额（万元）')],
    ['delivery/deliver', '视图 delivery/deliver：交付与偏差', () => blockHas('delivery-deliver-table', '人天偏差率')]
  ];
  for (const [p, name, fn] of VIEWS) {
    await goView(p);
    check(name, fn());
  }

  /* ============ 3.0 v0.3 IA 变更的定向断言 ============ */
  await goView('budget/annual');
  check('预算管理二级导航：仅「年度预算计划 / 预算消耗」两项（侧边栏）', (() => {
    const t = norm(byTestId('sider-menu').textContent);
    return t.includes('年度预算计划') && t.includes('预算消耗') && !t.includes('业务规划BP') && !t.includes('Digital整合规划') && !t.includes('部门预算池');
  })());
  check('年度预算计划：三类编制项均可点击下钻（结构锚点）', (() => {
    const cards = byTestId('budget-annual-table');
    if (!cards) return false;
    return Array.from(cards.querySelectorAll('[data-testid^="budget-annual-cell-"]')).length >= 24;
  })());
  check('年度预算计划：操作记录入口存在', has('全部操作记录'));
  check('年度预算计划：系统运维预算金额由计费模型推导（非空值）', blockHas('budget-annual-cell-ops-D-SVC', '万元'));

  await goView('budget/consume');
  check('预算消耗：行操作由「深钻」改为「查账」（且全站已无「深钻」）', (() => {
    const t = norm(doc.body.textContent);
    return !!doc.querySelector('[data-testid="budget-consume-check-D-SVC"]') && t.includes('查账') && !t.includes('深钻');
  })());
  check('预算消耗：已移除「Digital 整合规划 / 部门预算池」文案', (() => {
    const t = norm(doc.body.textContent);
    return !t.includes('Digital 整合规划') && !t.includes('部门预算池');
  })());

  await goView('budget/annual/D-RETAIL');
  await tick(400); // 跨视图切换后抽屉动画需额外一帧
  check('年度预算计划：部门行点击 → BU 综合视图抽屉（三部分预算构成 + 操作记录）', (() => {
    const el = byTestId('budget-annual-summary');
    if (!el) return false;
    const t = norm(el.textContent);
    return ['该 BU 全部操作记录', '① 年度 BP 文档', '② 项目预算', '③ 系统运维预估费用'].every((x) =>
      t.includes(norm(x))
    );
  })());

  /* ============ 3.0-v0.5 年度预算计划口径（BP 版本 / 需求清单整体版本） ============ */
  await goView('budget/annual');
  await tick(260);

  check('v0.5-①：BP 只有「已提交 / 未提交」两态 —— 全站不再出现「已归档」', !norm(doc.body.textContent).includes('已归档'));
  check('v0.6：编制项术语统一为「① 年度 BP / ② 项目预算 / ③ 系统运维预算」，标题不再带「提交及更新」', (() => {
    const t = norm(byTestId('budget-annual-table').textContent);
    return (
      t.includes('①年度BP') &&
      t.includes('②项目预算') &&
      t.includes('③系统运维预算') &&
      !t.includes('提交及更新') &&
      !t.includes('需求清单及费用预估提交及更新') &&
      !t.includes('总项目费用提交及更新')
    );
  })());

  /* ---- v0.5.1 主表单元格精简：每格只留「状态 + 指定数值」 ---- */
  check('v0.5.1-①：BP 单元格只显示「状态 + 版本号」，文档形式已移出', (() => {
    const el = byTestId('budget-annual-cell-bp-D-RETAIL');
    if (!el) return false;
    const t = norm(el.textContent);
    return t.includes('已提交') && t.includes('V2.1') && !t.includes('文档链接') && !t.includes('最近更新');
  })());
  check('v0.5.1-②：需求清单单元格只显示「状态 + 总费用 + 条数」，版本号已移出', (() => {
    const el = byTestId('budget-annual-cell-demand-D-RETAIL');
    if (!el) return false;
    const t = norm(el.textContent);
    return t.includes('已确认') && t.includes('304.8万元') && t.includes('4条') && !t.includes('V1.1');
  })());
  check('v0.5.1-②：待评估费用的部门不给未核定金额，只显示「待核定 + 条数」', (() => {
    const el = byTestId('budget-annual-cell-demand-D-ECOM');
    if (!el) return false;
    const t = norm(el.textContent);
    return t.includes('待评估费用') && t.includes('待核定') && t.includes('3条') && !t.includes('万元');
  })());
  check('v0.5.1-③：运维单元格显示「状态 + 总费用 + 系统数量」', (() => {
    const el = byTestId('budget-annual-cell-ops-D-RETAIL');
    if (!el) return false;
    const t = norm(el.textContent);
    return t.includes('已确认') && t.includes('万元') && /\d+个系统/.test(t);
  })());
  check('v0.5.1-③：Digital 未出具的部门只显示「待出具 + 系统数量」', (() => {
    const el = byTestId('budget-annual-cell-ops-D-HR');
    if (!el) return false;
    const t = norm(el.textContent);
    return t.includes('未启动') && t.includes('待出具') && /\d+个系统/.test(t) && !t.includes('万元');
  })());
  check('v0.5.1：被移出的旁注仍可从 title 提示读到（BP 保留更新时间与文档形式）', (() => {
    const el = byTestId('budget-annual-cell-bp-D-RETAIL');
    return !!el && /最近更新/.test(el.getAttribute('title') || '');
  })());
  check('v0.5.1：三个编制项单元格均不再渲染第二行时间戳旁注', (() => {
    const cells = Array.from(byTestId('budget-annual-table').querySelectorAll('[data-testid^="budget-annual-cell-"]'));
    return cells.length >= 24 && cells.every((el) => !/最近更新|点击查看/.test(el.textContent));
  })());
  check('v0.5.1：未评估部门显示「待评估费用」而非逐条状态（D-ECOM）', blockHas('budget-annual-cell-demand-D-ECOM', '待评估费用'));

  /* ---- v0.6 单元格信息层级：产物为主、状态为辅 ---- */
  check('v0.6：状态标识由 Tag 降级为 Badge 圆点（三列均无 ant-tag、均有 ant-badge）', (() => {
    const cells = ['bp', 'demand', 'ops'].map((k) => byTestId(`budget-annual-cell-${k}-D-RETAIL`));
    if (cells.some((el) => !el)) return false;
    return cells.every((el) => !el.querySelector('.ant-tag') && !!el.querySelector('.ant-badge'));
  })());
  check('v0.6：状态圆点带语义色（D-RETAIL 项目预算 = success 系）', (() => {
    const el = byTestId('budget-annual-cell-demand-D-RETAIL');
    return !!el && !!el.querySelector('.ant-badge-status-success');
  })());
  check('v0.6：主数值排在状态之前，单元格为「主数值行 + 状态行」两级', (() => {
    const el = byTestId('budget-annual-cell-demand-D-RETAIL');
    if (!el) return false;
    const t = norm(el.textContent);
    return t.indexOf('304.8') === 0 && t.indexOf('已确认') > t.indexOf('304.8') && el.querySelectorAll('.ant-flex').length >= 2;
  })());
  check('v0.6：主数值 16px / 500 为第一视觉层级，单位「万元」以小字后缀', (() => {
    const el = byTestId('budget-annual-cell-demand-D-RETAIL');
    if (!el) return false;
    const spans = Array.from(el.querySelectorAll('.ant-typography'));
    const num = spans.find((s) => s.textContent.trim() === '304.8');
    const unit = spans.find((s) => s.textContent.trim() === '万元');
    return (
      !!num &&
      !!unit &&
      num.style.fontSize === '16px' &&
      num.style.fontWeight === '500' &&
      parseFloat(unit.style.fontSize) < 16
    );
  })());
  check('v0.6：无产物时主数值降为淡色（运维列有值 / 待出具 两行颜色不同）', (() => {
    const color = (id) => {
      const el = byTestId(id);
      if (!el) return null;
      const span = el.querySelector('.ant-typography');
      return span ? span.style.color : null;
    };
    const a = color('budget-annual-cell-ops-D-RETAIL');
    const b = color('budget-annual-cell-ops-D-HR');
    return !!a && !!b && a !== b;
  })());
  check('v0.6：合计行与列内同构；项目预算合计只统计「已确认版本」', (() => {
    const sumEl = byTestId('budget-annual-table').querySelector('.ant-table-summary');
    if (!sumEl) return false;
    const t = norm(sumEl.textContent);
    return t.includes('445.1万元') && t.includes('2/8版本已确认') && t.includes('8个系统');
  })());

  /* ---- v1.2 两列减法 + 总预算费用列 ---- */
  check('v1.2：「编制完整度」列已移除（主表无进度条、无该字样、合计行无 n/8 项）', (() => {
    const el = byTestId('budget-annual-table');
    if (!el) return false;
    return (
      !el.querySelector('.ant-progress') &&
      !norm(el.textContent).includes('编制完整度') &&
      !/\/8项/.test(norm(el.textContent))
    );
  })());
  check('v1.2：「操作」列已移除（表头无「操作」格、行内无「已齐备」、无固定右列）', (() => {
    const el = byTestId('budget-annual-table');
    if (!el) return false;
    const heads = Array.from(el.querySelectorAll('thead th')).map((th) => norm(th.textContent));
    return !heads.includes('操作') && !norm(el.textContent).includes('已齐备') && !el.querySelector('.ant-table-cell-fix-right');
  })());
  check('v1.2：总预算费用列 = ②+③（D-RETAIL：304.8 + 830.8 = 1,135.6）', (() => {
    const num = (id) => {
      const el = byTestId(id);
      if (!el) return null;
      const m = norm(el.textContent).match(/([\d,]+\.\d)万元/);
      return m ? Number(m[1].replace(/,/g, '')) : null;
    };
    const a = num('budget-annual-cell-demand-D-RETAIL');
    const b = num('budget-annual-cell-ops-D-RETAIL');
    const t = num('budget-annual-cell-total-D-RETAIL');
    return a !== null && b !== null && t !== null && Math.abs(a + b - t) < 0.05;
  })());
  check('v1.2：总预算费用列 8 行全有数（未确认 BU 同样计入口径，如 D-ECOM 984.1）', (() => {
    const cells = Array.from(
      byTestId('budget-annual-table').querySelectorAll('[data-testid^="budget-annual-cell-total-"]')
    );
    return cells.length === 8 && cells.every((el) => /万元/.test(norm(el.textContent)));
  })());
  /* v1.6：把这条断言从「硬编码金额」改为「同源恒等式」。
     旧写法断言合计渲染为 4,509.9 万元 —— 该值由 v1.6 口径修复前的
     「运维无条件累加」算出，而修复后未出具（编制中/未启动）的行不计入，
     合计必然变化 ⇒ 旧断言锁的是**本轮刚修掉的缺陷**。

     教训（本轮再次踩中）：**金额断言不应硬编码**。同一文件 :493 的注释已写过
     「金额断言的值必须来自渲染 dump，用模型反算写断言会恒假」，但反过来
     「拿渲染 dump 的值去锁死断言」同样会随口径修复而假绿。
     正确做法是断言**关系**：合计行 = Σ(列内可见的项目金额 + 列内可见的运维金额)。
     这条恒等式在口径怎么变的情况下都应成立，且真出 bug 时才 FAIL。 */
  check('v1.6：合计行「总预算费用」≡ Σ(列内可见项目 + 列内可见运维)（不硬编码金额）', (() => {
    const table = byTestId('budget-annual-table');
    const sumEl = table.querySelector('.ant-table-summary');
    if (!sumEl) return false;
    const num = (s) => {
      // 金额文本带千分位逗号，必须用能吃掉逗号的正则（/([\d.]+)/ 只会匹配到 ",5" → 5）
      const m = /([\d,]+(?:\.\d+)?)\s*万元/.exec(s);
      return m ? Number(m[1].replace(/,/g, '')) : null;
    };
    /* 合计行有 4 个金额格（BP 计数无「万元」→ 实际 3 个：项目 / 运维 / 总预算）。
       对整行 textContent 直接跑正则会取到**第一个**「万元」= 项目列，
       把它当总预算列比 ⇒ 恒不相等。必须先定位到最后一格（总预算费用列，index=4）。 */
    const sumCells = Array.from(sumEl.querySelectorAll('td'));
    if (sumCells.length !== 5) return false;
    const sumTotal = num(sumCells[4].textContent);
    if (sumTotal == null || sumTotal <= 0) return false;

    // 逐行按「列内是否可见」重算：待出具 / 待核定的行计 0
    const rowsEls = Array.from(table.querySelectorAll('tr.ant-table-row'));
    if (rowsEls.length !== 8) return false;
    let acc = 0;
    for (const r of rowsEls) {
      const tCell = r.querySelector('[data-testid^="budget-annual-cell-total-"]');
      if (!tCell) return false;
      // 该行运维是否已出具（未出具合计不计）
      const opsCell = r.querySelector('[data-testid^="budget-annual-cell-ops-"]');
      const opsIssued = !!opsCell && !/待出具/.test(norm(opsCell.textContent));
      const opsVal = opsIssued ? num(opsCell.textContent) : 0;
      // 项目：待核定 / — 不计入；否则取②列可见金额
      const dCell = r.querySelector('[data-testid^="budget-annual-cell-demand-"]');
      const dIssued = !!dCell && !/待核定|—/.test(norm(dCell.textContent));
      const dVal = dIssued ? num(dCell.textContent) : 0;
      if (opsVal == null || dVal == null) return false;
      // 逐行「总预算费用」应 = 项目 + 运维（同一行的两个可见值）
      const rowTotal = num(tCell.textContent);
      if (rowTotal == null) return false;
      if (Math.abs(rowTotal - (dVal + opsVal)) > 0.15) return false;
      acc += rowTotal;
    }
    // 合计行 ≡ Σ各行（容差 0.5：多层舍入有 0.1 级误差，≤0.2 会在浮点边界假失败）
    return Math.abs(sumTotal - acc) < 0.5;
  })());
  check('v1.2：合计行「总预算费用」含「项目+运维」口径标签', (() => {
    const sumEl = byTestId('budget-annual-table').querySelector('.ant-table-summary');
    if (!sumEl) return false;
    return norm(sumEl.textContent).includes('项目+运维');
  })());
  check('v1.6：未出具运维的 BU 合计不计其金额（列内可见口径）', (() => {
    const table = byTestId('budget-annual-table');
    const sumEl = table.querySelector('.ant-table-summary');
    if (!sumEl) return false;
    const num = (s) => {
      const m = /([\d,]+(?:\.\d+)?)\s*万元/.exec(s);
      return m ? Number(m[1].replace(/,/g, '')) : null;
    };
    // 合计行第 5 格才是「总预算费用」列（0=标签 1=BP 2=项目 3=运维 4=总预算）。
    // 对整行 textContent 跑正则会取到**第一个**「万元」= 项目列 —— 那条旧断言
    // 写的是 `sumTotal !== sumTotal + 442.2`，恒真 ⇒ 一直没真正验证任何东西。
    const sumCells = Array.from(sumEl.querySelectorAll('td'));
    if (sumCells.length !== 5) return false;
    const sumOps = num(sumCells[3].textContent);
    const sumTotal = num(sumCells[4].textContent);
    if (sumOps == null || sumTotal == null) return false;
    // D-MKT（编制中）+ D-HR（未启动）的运维列显示「待出具」，
    // 其模型年化值（436.5 + 5.7 = 442.2 万）**不得**计入合计。
    // 正向证明：运维列必须恰好等于 8 行中 opsIssued 为真的那些之和。
    // 反向证明：**被排除的金额必须仍然可查** —— 未出具行的「总预算费用」悬浮提示
    //   要写明"待出具、模型年化 X 万元不计入"。若只把数字默默抹掉，
    //   用户看到 ③ 列有值（③ 单元格自己的 tooltip 里有模型年化）而合计里没有，
    //   就成了无法解释的差额 —— 这正是本轮修掉的缺陷的另一半。
    const issuedRows = Array.from(table.querySelectorAll('tr.ant-table-row')).filter((r) => {
      const c = r.querySelector('[data-testid^="budget-annual-cell-ops-"]');
      return c && !/待出具/.test(norm(c.textContent));
    });
    const opsExpected = issuedRows.reduce((s, r) => {
      const c = r.querySelector('[data-testid^="budget-annual-cell-ops-"]');
      return s + num(c.textContent);
    }, 0);
    // 若 8 行全部已出具，本用例失去意义（恒真）⇒ 直接判 FAIL，提示该换断言
    if (issuedRows.length === 8) return false;
    const forward = Math.abs(sumOps - opsExpected) < 0.5;
    const pendingRows = Array.from(table.querySelectorAll('tr.ant-table-row')).filter((r) => {
      const c = r.querySelector('[data-testid^="budget-annual-cell-ops-"]');
      return c && /待出具/.test(norm(c.textContent));
    });
    const disclosed = pendingRows.every((r) => {
      const t = r.querySelector('[data-testid^="budget-annual-cell-total-"]');
      return t && /待出具/.test(t.getAttribute('title') || '') && /不计入/.test(t.getAttribute('title') || '');
    });
    return forward && disclosed;
  })());

  /* v1.6 P0-3 补齐：项目侧与运维侧同一条规则（列内可见才计入）。
     这条与上一条对称 —— 上一条只锁了运维侧，若项目侧再漏一次就无人看守。
     断言「合计项目列 ≡ Σ(②列已确认的金额)」，其中「待核定 / —」的行必须计 0。 */
  check('v1.6：未确认项目的 BU 合计不计其金额（与运维侧同规则）', (() => {
    const table = byTestId('budget-annual-table');
    const sumEl = table.querySelector('.ant-table-summary');
    if (!sumEl) return false;
    const num = (s) => {
      const m = /([\d,]+(?:\.\d+)?)\s*万元/.exec(s);
      return m ? Number(m[1].replace(/,/g, '')) : null;
    };
    const sumCells = Array.from(sumEl.querySelectorAll('td'));
    if (sumCells.length !== 5) return false;
    const sumProject = num(sumCells[2].textContent);
    if (sumProject == null) return false;
    const rowsEls = Array.from(table.querySelectorAll('tr.ant-table-row'));
    if (rowsEls.length !== 8) return false;
    let expected = 0;
    let unconfirmed = 0;
    for (const r of rowsEls) {
      const c = r.querySelector('[data-testid^="budget-annual-cell-demand-"]');
      if (!c) return false;
      const txt = norm(c.textContent);
      const counted = !/待核定|—/.test(txt);
      if (counted) {
        const v = num(c.textContent);
        if (v == null) return false;
        expected += v;
      } else {
        unconfirmed += 1;
      }
    }
    // 必须真有「未确认」的行，否则本用例无意义（恒真）
    if (unconfirmed === 0) return false;
    return Math.abs(sumProject - expected) < 0.5;
  })());
  /* v1.6 P0-3 补齐的**直接后果**：项目侧改口径后合计必然变化，这里锁住「新旧不同」，
     防止有人把 projectCountedAmount 又改回 projectAmount（那会把 1,063.9 万差额放回去）。
     写法：正向取到合计行总预算格，反向确认它与**逐行之和**一致（合计行若偷偷
     换回另一口径，这个恒等式立刻不成立）。 */
  check('v1.6：总预算费用合计 = 逐行「总预算费用」之和（防口径回退）', (() => {
    const table = byTestId('budget-annual-table');
    const sumEl = table.querySelector('.ant-table-summary');
    if (!sumEl) return false;
    const num = (s) => {
      const m = /([\d,]+(?:\.\d+)?)\s*万元/.exec(s);
      return m ? Number(m[1].replace(/,/g, '')) : null;
    };
    const sumTotal = num(sumEl.querySelectorAll('td')[4].textContent);
    if (sumTotal == null) return false;
    let acc = 0;
    for (const r of table.querySelectorAll('tr.ant-table-row')) {
      const t = r.querySelector('[data-testid^="budget-annual-cell-total-"]');
      if (!t) return false;
      acc += num(t.textContent);
    }
    return Math.abs(sumTotal - acc) < 0.5;
  })());

  check('v1.2：主表列宽 170/112/164/168/140（合计 754）', (() => {
    const cols = Array.from(byTestId('budget-annual-table').querySelectorAll('colgroup col'));
    const want = ['170px', '112px', '164px', '168px', '140px'];
    if (cols.length !== want.length) return false;
    return cols.every((el, i) => (el.style.width || '') === want[i]);
  })());
  check('v1.2：主表 table 宽度 754px（v0.6.1 的 858px 再收 104px）', (() => {
    const t = byTestId('budget-annual-table').querySelector('table');
    return !!t && /width:\s*754px/.test(t.getAttribute('style') || '');
  })());
  check('v0.6.1：主表密度提升为紧凑尺寸（ant-table-small）', !!byTestId('budget-annual-table').querySelector('.ant-table-small'));
  check('v0.6.1：单元格内边距 2px 6px、行间距 2px（行高由 ~74px 降到 ~60px）', (() => {
    const el = byTestId('budget-annual-cell-demand-D-RETAIL');
    if (!el) return false;
    const st = el.getAttribute('style') || '';
    const flex = el.querySelector('.ant-flex');
    return /padding:\s*2px 6px/.test(st) && !!flex && /gap:\s*2px/.test(flex.getAttribute('style') || '');
  })());

  /* ---- v0.7 预算消耗：楼层一 3 张卡 / 楼层二 3 组列 / 调整项目预算分支 ---- */
  await goView('budget/consume');
  await tick(260);

  /** 卡片上的「预算总包」金额（万元）—— 取格内第一个 `N,NNN.N万元`，即总包数值 */
  const cardTotal = (k) => {
    const el = byTestId(`budget-consume-card-${k}`);
    if (!el) return null;
    const m = norm(el.textContent).match(/([\d,]+\.\d)万元/);
    return m ? Number(m[1].replace(/,/g, '')) : null;
  };

  check('v0.7：楼层一《整体预算消耗情况》恰为 3 张卡，且不再有「截至当月消耗进度」独立卡', (() => {
    const el = byTestId('budget-consume-overview');
    if (!el) return false;
    const cards = Array.from(el.querySelectorAll('[data-testid^="budget-consume-card-"]'));
    const t = norm(el.textContent);
    return (
      cards.length === 3 &&
      t.includes('整体预算消耗情况') &&
      t.includes('①各部门数字化整体预算总包') &&
      t.includes('②项目预算总包') &&
      t.includes('③运维预算总包') &&
      !t.includes('截至当月消耗进度')
    );
  })());
  check('v0.7：三张卡各自带消耗进度条（结构断言，不是文案）', (() => {
    return ['overall', 'project', 'ops'].every((k) => {
      const el = byTestId(`budget-consume-card-${k}`);
      return !!el && !!el.querySelector('[role="img"][aria-label*="总包"]');
    });
  })());
  check('v0.7：每张卡同时给出「总包金额」与「消耗金额 · 消耗率」两级数值', (() => {
    return ['overall', 'project', 'ops'].every((k) => {
      const el = byTestId(`budget-consume-card-${k}`);
      if (!el) return false;
      const t = norm(el.textContent);
      return /已消耗/.test(t) && /\d+\.\d%/.test(t);
    });
  })());
  check('v0.7：三张卡满足恒等式「整体预算 = 项目预算 + 运维预算」', (() => {
    const o = cardTotal('overall');
    const p = cardTotal('project');
    const q = cardTotal('ops');
    return o != null && p != null && q != null && Math.abs(o - p - q) < 0.05;
  })());
  check('v0.7：楼层二定名为《部门预算消耗情况》', blockHas('budget-consume-section-dept', '部门预算消耗情况'));
  check('v0.7.2：三个维度各为**单列**（表头回到单行 5 格，不再有「预算 / 消耗」两子列）', (() => {
    const tb = byTestId('budget-consume-table');
    if (!tb) return false;
    const rows = tb.querySelectorAll('.ant-table-thead tr');
    const heads = Array.from(tb.querySelectorAll('.ant-table-thead th')).map((e) => norm(e.textContent));
    return (
      rows.length === 1 &&
      heads.length === 5 &&
      heads.join('|') === '业务部门|整体预算及消耗|项目预算及消耗|运维预算及消耗|操作'
    );
  })());
  check('v0.7.2：每个 BU 行按三个维度各出**一个**合并格（预算 + 消耗同格，不再成对出现）', (() => {
    const tr = Array.from(byTestId('budget-consume-table').querySelectorAll('.ant-table-tbody tr.ant-table-row')).find(
      (x) => norm(x.textContent).startsWith('零售运营')
    );
    if (!tr) return false;
    return (
      ['overall', 'project', 'ops'].every((d) => !!tr.querySelector(`[data-testid="budget-consume-seg-${d}-D-RETAIL"]`)) &&
      tr.querySelectorAll('[data-testid^="budget-consume-budget-"]').length === 0
    );
  })());
  /* v1.6：零售整体已消耗由 667.1 → 781.5 万元、消耗率 54.7% → 64.1%
     （BRD 21→33 扩充使账单金额上升，非渲染回归）。
     金额取自 scripts/probe-summary.mjs 的 title 实读值，非模型反算。 */
  check('v0.7.2：合并格上行 = 总预算金额（带万元），下行 = 已消耗百分比（两行都读得到）', (() => {
    const el = byTestId('budget-consume-seg-overall-D-RETAIL');
    if (!el) return false;
    const t = norm(el.textContent);
    // 零售运营：整体总预算 1,220.0 万元 / 已消耗 781.5 万元 → 64.1%（实读值）
    return t.includes('1,220.0万元') && t.includes('已消耗') && t.includes('64.1%') && !t.includes('781.5');
  })());
  check('v0.7.2：移出版面的量进单元格 title 提示（消耗金额 / 已核销 / 已承诺 / 可用余额）', (() => {
    const el = byTestId('budget-consume-seg-overall-D-RETAIL');
    const tip = el ? el.getAttribute('title') || '' : '';
    return (
      tip.includes('预算 1,220.0 万元') &&
      tip.includes('已消耗 781.5 万元') &&
      tip.includes('已核销') &&
      tip.includes('已承诺') &&
      tip.includes('可用')
    );
  })());
  check('v0.7.2：运维格不写「已承诺」（运维按月计费无承诺中间态）', (() => {
    const el = byTestId('budget-consume-seg-ops-D-RETAIL');
    const tip = el ? el.getAttribute('title') || '' : '';
    return tip.includes('无「承诺」中间态') && !tip.includes('已承诺');
  })());
  /* v1.6 数据重构后金额变更（FY2026 执行年）：D-FIN poolFY26 由 160 万下调至105 万
     （使其整体消耗率落进 warn 档），Σ整体 4,440.0 → 4,385.0。
     Σ运维 2,774.8 未变（VOLUME_BASE 未动）；Σ项目 = 总包 − 运维 = 1,610.2。 */
  check('v0.7：合计行与三组列同源（整体 4,385.0 = 项目 1,610.2 + 运维 2,774.8）', (() => {
    const el = byTestId('budget-consume-table').querySelector('.ant-table-summary');
    if (!el) return false;
    const t = norm(el.textContent);
    return t.includes('4,385.0') && t.includes('1,610.2') && t.includes('2,774.8');
  })());

  /* ---- v0.7.1 部门预算消耗表：去进度条 + 去状态列 ---- */
  check('v0.7.1：消耗格不再有进度条（整表 .ant-progress 计数为 0）', (() => {
    const tb = byTestId('budget-consume-table');
    return !!tb && tb.querySelectorAll('.ant-progress').length === 0;
  })());
  /** 取某维度 / 某部门消耗率节点的着色（无则该格视为失效） */
  const rateColor = (dim, dept) => {
    const el = byTestId(`budget-consume-seg-${dim}-${dept}-rate`);
    return el ? (el.getAttribute('style') || '').match(/color:\s*([^;]+)/)?.[1]?.trim() || null : null;
  };
  check('v0.7.1：每个消耗率数字都带颜色（全表无未着色的消耗率，即健康度不靠进度条也读得出来）', (() => {
    const tb = byTestId('budget-consume-table');
    if (!tb) return false;
    const rates = Array.from(
      tb.querySelectorAll('.ant-table-tbody tr.ant-table-row [data-testid$="-rate"]')
    );
    return (
      rates.length === 24 && // 8 个 BU × 3 个维度（每行必须有且只有 3 个消耗率）
      rates.every((el) => /\d+\.\d%/.test(norm(el.textContent)) && /color:/.test(el.getAttribute('style') || ''))
    );
  })());
  check('v0.7.1：着色由档位驱动而非固定色 —— 全表多色，且存在「同一行内不同维度不同色」的行', (() => {
    const tb = byTestId('budget-consume-table');
    if (!tb) return false;
    const rows = Array.from(tb.querySelectorAll('.ant-table-tbody tr.ant-table-row'));
    const all = new Set();
    let mixed = false;
    rows.forEach((tr) => {
      const three = ['overall', 'project', 'ops']
        .map((d) => tr.querySelector(`[data-testid^="budget-consume-seg-${d}-"][data-testid$="-rate"]`))
        .map((el) => (el ? (el.getAttribute('style') || '').match(/color:\s*([^;]+)/)?.[1]?.trim() : null))
        .filter(Boolean);
      three.forEach((x) => all.add(x));
      if (three.length === 3 && new Set(three).size > 1) mixed = true;
    });
    return all.size >= 2 && mixed;
  })());
  check(
    'v0.7.1：着色确实由档位驱动 —— 已透支的客户服务（整体 110.3%）为红，正常的 D-RETAIL（54.7%）为绿',
    (() => {
      const svc = rateColor('overall', 'D-SVC');
      const retail = rateColor('overall', 'D-RETAIL');
      return !!svc && !!retail && svc !== retail;
    })(),
    `D-SVC=${rateColor('overall', 'D-SVC')} D-RETAIL=${rateColor('overall', 'D-RETAIL')}`
  );
  /* v1.6 P1-13：13px 档位色文字必须用**AA 达标**深色，不能用 antd 实色。
     修前实测白底对比度（实色）：#52c41a 2.27:1 / #faad14 1.90:1 / #ff4d4f 3.27:1
     / #1677ff 4.10:1 —— **四档全挂** 4.5:1 门槛。
     antd 自带 colorXxxText 也不能直接用：successText 3.46 / warningText 2.87 仍挂
     ⇒ theme.js 另立 textStrong 一档（同色相压暗，色相不变）。
     修后四档实测（探针 dump + WCAG 复算，`rgb()` 为浏览器归一后的形式）：
       正常 ok    rgb(42,119,10)  #2a770a → 5.61:1  ← theme.successTextStrong
       关注 watch rgb(0,91,170)   #005BAA → 6.83:1  ← antd colorInfo 被本项目覆写为品牌 VI 色
       预警 warn  rgb(159,102,5)  #9f6605 → 4.80:1  ← theme.warningTextStrong
       透支 over  rgb(192,57,43)  #c0392b → 5.44:1  ← 本项目 antd 主题的 colorErrorText
     断言两层：① 四档全在达标白名单内（挡住"换回实色"）；
              ② 至少出现 3 色（挡住"全表一个色"这种假修复）。
     比对前统一剥空格 —— 浏览器可能输出 `rgb(42, 119, 10)` 或 `rgb(42,119,10)`。 */
  check('v1.6 P1-13：消耗率文字四档全部 AA 达标（5.61 / 6.83 / 4.80 / 5.44 : 1）', (() => {
    const tb = byTestId('budget-consume-table');
    if (!tb) return false;
    const rates = Array.from(
      tb.querySelectorAll('.ant-table-tbody tr.ant-table-row [data-testid$="-rate"]')
    );
    if (rates.length !== 24) return false;
    const squash = (s) => (s || '').replace(/\s+/g, '').toLowerCase();
    const allowed = new Set(['rgb(42,119,10)', 'rgb(0,91,170)', 'rgb(159,102,5)', 'rgb(192,57,43)']);
    const seen = new Set();
    for (const el of rates) {
      const c = squash((el.getAttribute('style') || '').match(/color:\s*([^;]+)/)?.[1]);
      if (!c || !allowed.has(c)) return false;
      seen.add(c);
    }
    return seen.size >= 3;
  })());
  /* 反向证明：断言的"达标色"集合里**不含任何 antd 实色** ——
     若有人把 textStrong 改回 color，allowed 会命中不了（上一条已覆盖），
     这里再锁一层"实色仍在色板里供填充用"，两者同时成立才算修对了。 */
  check('v1.6 P1-13：档位实色仍保留给填充场景（Tag 底 / 图表），未把整个色板改深', (() => {
    /* 不能只断言"实色没被删"（恒真）。改为：实色**确实还有页面级消费者**。
       消耗页自身不画进度条（v1.5 已删），实色消费者在预算池看板 / Tag 上，
       所以这条要在跨页面语境下验证 —— 这里只断言"达标色 ≠ 实色"这条不变式成立：
       即 levelColor 返回的 color 与 textStrong 是**两套不同的值**。 */
    const tb = byTestId('budget-consume-table');
    if (!tb) return false;
    const squash = (s) => (s || '').replace(/\s+/g, '').toLowerCase();
    const rates = Array.from(tb.querySelectorAll('[data-testid$="-rate"]'));
    const colors = new Set(
      rates.map((el) => squash((el.getAttribute('style') || '').match(/color:\s*([^;]+)/)?.[1]))
    );
    colors.delete('');
    colors.delete(undefined);
    // 透支档的实色是 #ff4d4f = rgb(255,77,79)（3.27:1，不达标）；
    // 若 color 与 textStrong 混用，这里就会出现它 —— 出现即 FAIL
    return !colors.has('rgb(255,77,79)') && !colors.has('#ff4d4f');
  })());
  /* v1.6 P1-12：消耗页部门列 + 三维度列均可排序。
     断言"可排序列数 = 4"：3 个维度列（segmentColumn）+ 1 个部门列。
     用精确值而非 >=，防止只加了一列也宣称完成。 */
  check('v1.6 P1-12：消耗页 4 列可排序（部门 + 整体/项目/运维三维度）', (() => {
    const tb = byTestId('budget-consume-table');
    if (!tb) return false;
    const sortable = Array.from(tb.querySelectorAll('thead th')).filter((th) =>
      th.querySelector('.ant-table-column-sorter')
    );
    return sortable.length === 4;
  })());
  /* 排序比较器必须构成**合法全序**（相等键返回 0），否则同值行次序不稳定。
     真正验证「点一下确实排了序」：点降序 → 断言整体消耗率非增；再点 → 断言非减。
     教训：初版断言写了「降序结果必须与默认序不同」—— 实测默认序**本身就是**
     消耗率降序（141.8 / 93.2 / … / 2.8），那条子句恒假。
     **默认排序恰好等于某一排序方向时，不能用"结果不同"当判据**，改用单调性。 */
  await (async () => {
    const tb = byTestId('budget-consume-table');
    if (!tb) return check('v1.6 P1-12：维度列 sorter 构成全序（降序/升序均正确且可切换）', false, '未找到消耗表');
    const th = Array.from(tb.querySelectorAll('thead th')).find((x) => norm(x.textContent).includes('整体'));
    const sorter = th && th.querySelector('.ant-table-column-sorter');
    if (!sorter) return check('v1.6 P1-12：维度列 sorter 构成全序（降序/升序均正确且可切换）', false, '整体列无 sorter');
    const readRates = () =>
      Array.from(tb.querySelectorAll('tbody tr.ant-table-row')).map((tr) => {
        const el = tr.querySelector('[data-testid^="budget-consume-seg-overall-"][data-testid$="-rate"]');
        const m = /([\d.]+)%/.exec(norm(el ? el.textContent : ''));
        return m ? Number(m[1]) : null;
      });
    const nonDecreasing = (a) => a.every((v, i) => i === 0 || a[i - 1] <= v);
    const nonIncreasing = (a) => a.every((v, i) => i === 0 || a[i - 1] >= v);
    sorter.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await tick(150);
    const order1 = readRates();
    sorter.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await tick(150);
    const order2 = readRates();
    const ok =
      order1.length === 8 && order2.length === 8 &&
      order1.every((v) => v != null) && order2.every((v) => v != null) &&
      nonIncreasing(order1) && nonDecreasing(order2) &&
      // 两向必须真的不同（否则比较器是恒等，"可排序"是假的）
      order1.join(',') !== order2.join(',');
    check('v1.6 P1-12：维度列 sorter 构成全序（降序非增 / 升序非减，可来回切换）', ok,
      `第1次=${order1.join(',')} 第2次=${order2.join(',')}`);
    // 复位到默认视图（三击回到无排序），避免影响后续用例
    sorter.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await tick(150);
  })();
  check('v0.7.1：已移除「状态」列（表头无「状态」，且表体不再有整行档位 Tag）', (() => {
    const tb = byTestId('budget-consume-table');
    if (!tb) return false;
    const heads = Array.from(tb.querySelectorAll('.ant-table-thead th')).map((e) => norm(e.textContent));
    return !heads.includes('状态') && tb.querySelectorAll('.ant-table-tbody .ant-tag').length === 0;
  })());
  check('v0.7.2：列宽收敛为 116/132×3/76（合计 588；操作列 v1.3 起只留「查账」一个按钮）', (() => {
    const tb = byTestId('budget-consume-table');
    const cols = Array.from(tb.querySelectorAll('colgroup col')).map((c) => c.style.width);
    const want = ['116px', '132px', '132px', '132px', '76px'];
    const table = tb.querySelector('table');
    return (
      cols.length === want.length &&
      cols.every((w, i) => w === want[i]) &&
      /width:\s*588px/.test(table.getAttribute('style') || '')
    );
  })());
  /* v1.6：FY2026 已消耗 3,021.0 / 池 4,385.0 = 68.9%（原 56.6%）。
     上升来自 BRD 21→33 扩充带来的账单金额增长，非代码回归。 */
  check('v0.7.1：合计行仍与列内同源（4,385.0 = 1,610.2 + 2,774.8），且消耗率同样着色', (() => {
    const el = byTestId('budget-consume-table').querySelector('.ant-table-summary');
    if (!el) return false;
    const t = norm(el.textContent);
    const colored = Array.from(el.querySelectorAll('span')).filter((s) =>
      /color:/.test(s.getAttribute('style') || '')
    );
    return t.includes('4,385.0万元') && t.includes('68.9%') && colored.length >= 3;
  })());
  check('v0.7.1：透支 / 预警计数迁移到楼层二标题行（不再占据状态列）', (() => {
    const el = byTestId('budget-consume-section-dept');
    return !!el && /透支\d+个·预警\d+个/.test(norm(el.textContent));
  })());

  /* ---- v1.3：移除行内「调整预算计划」入口，整条调整分支下线 ---- */
  check('v1.3：操作列每行恰好 1 个按钮（「查账」），不再有第二个调整入口', (() => {
    const tb = byTestId('budget-consume-table');
    if (!tb) return false;
    const rows = Array.from(tb.querySelectorAll('.ant-table-tbody tr.ant-table-row'));
    if (rows.length === 0) return false;
    return rows.every((tr) => tr.querySelectorAll('.ant-btn').length === 1);
  })());
  check('v1.3：全站不再出现「调整预算计划」按钮与「调节额度」旧名', (() => {
    const t = norm(doc.body.textContent);
    return !t.includes('调整预算计划') && !t.includes('调节额度');
  })());
  check('v1.3：整条「调整项目预算」分支已下线（无入口按钮 / 无抽屉锚点）', (() => {
    const tb = byTestId('budget-consume-table');
    return (
      tb &&
      tb.querySelectorAll('[data-testid^="budget-consume-plan-"]').length === 0 &&
      !byTestId('budget-consume-plan-drawer')
    );
  })());
  check('v1.3：消耗视图整体只读 —— 页面明示预算调整在《项目预算计划》页进行', (() => {
    const el = byTestId('budget-consume-caption');
    return !!el && norm(el.textContent).includes('本视图为只读');
  })());
  check('v1.3：只读不等于无操作 —— 「查账」仍可点并跳转账单模块', (() => {
    const btn = byTestId('budget-consume-check-D-RETAIL');
    return !!btn && norm(btn.textContent) === '查账';
  })());

  await goView('budget/annual');
  await tick(200);

  // —— v1.0：点击主表「① 年度 BP」→ 独立《年度 BP 计划》页面（取代右侧浮层）——
  click(byTestId('budget-annual-cell-bp-D-RETAIL'));
  await tick(340);
  check('v1.0：点击 BP 入口 → 拉起独立页面（非浮层）', exists('budget-bp-plan-page') && exists('budget-bp-table') && win.location.hash === '#/budget/bpplan/D-RETAIL');
  check('v1.0：浮层确被移除 —— 全站不再出现 budget-annual-bp-drawer', !exists('budget-annual-bp-drawer'));
  check('v1.0：旧版本表已废弃 —— 全站不再出现 budget-bp-versions', !exists('budget-bp-versions'));

  /* ---- v1.0 版本列表：6 列表头 / 每行一版本 / 三版本号齐备 ---- */
  check('v1.0：版本列表 6 列表头齐备', (() => {
    const el = byTestId('budget-bp-table');
    if (!el) return false;
    const heads = Array.from(el.querySelectorAll('.ant-table-thead th')).map((e) => norm(e.textContent));
    return ['BP名称', '年度业务量化目标', 'BP内容核心摘要', 'BP文档链接', '该版本修订说明', '版本'].every((x) =>
      heads.includes(norm(x))
    );
  })());
  check('v1.0：版本列含 V2.1 / V2.0 / V1.0（每行代表一个版本）', (() => {
    const el = byTestId('budget-bp-table');
    if (!el) return false;
    const t = norm(el.textContent);
    return ['V2.1', 'V2.0', 'V1.0'].every((x) => t.includes(x));
  })());
  check('v1.0：D-RETAIL 摘要含「业务填写」（V2.1）与「AI 生成」（V2.0）两态来源标记', (() => {
    const el = byTestId('budget-bp-table');
    if (!el) return false;
    const t = norm(el.textContent);
    return t.includes('业务填写') && t.includes('AI生成');
  })());
  check('v1.0：文档链接列渲染可点外链（budget-bp-doc-V2.1）', (() => {
    const a = byTestId('budget-bp-doc-V2.1');
    return !!a && a.tagName === 'A' && a.getAttribute('target') === '_blank';
  })());

  /* ---- v1.0 AI 摘要「生成中 / 生成失败」两态（跨部门样例，覆盖全部 4 态）---- */
  await goView('budget/bpplan/D-SCM');
  await tick(240);
  check('v1.0：D-SCM 摘要显示「AI 生成中…」（ai_pending 态）', blockHas('budget-bp-table', 'AI 生成中'));
  await goView('budget/bpplan/D-SVC');
  await tick(240);
  check('v1.0：D-SVC 摘要显示「AI 生成失败」（ai_failed 态）', blockHas('budget-bp-table', 'AI 生成失败'));

  /* ---- v1.0 非法 / 缺失部门代码兜底（不白屏）---- */
  await goView('budget/bpplan/NOPE');
  await tick(240);
  check('v1.0：非法部门代码兜底 —— 不白屏、给返回引导', exists('budget-bp-plan-page') && exists('budget-bp-back') && !exists('budget-bp-table'));

  /* ---- v1.0「修正年度 BP」浮层 + 提交追加版本 ---- */
  await goView('budget/bpplan/D-RETAIL');
  await tick(240);
  check('v1.0：页头「修正年度 BP」入口存在', exists('budget-bp-update'));
  click(byTestId('budget-bp-update'));
  await tick(320);
  check('v1.0：浮层出现（budget-bp-update-modal）', exists('budget-bp-update-modal'));
  check('v1.0：浮层 5 个字段 testid 齐备（名称/目标/摘要/文档/修订说明）', (() =>
    ['budget-bp-modal-name', 'budget-bp-modal-goals', 'budget-bp-modal-summary', 'budget-bp-modal-doc-0-name', 'budget-bp-modal-doc-0-url', 'budget-bp-modal-note'].every((id) =>
      exists(id)
    ))());

  const bpRowsBefore = byTestId('budget-bp-table').querySelectorAll('.ant-table-tbody tr.ant-table-row').length;
  setValue(win, byTestId('budget-bp-modal-name'), 'FY2027 零售数字化规划（补充版）');
  setValue(win, byTestId('budget-bp-modal-goals'), 'GMV：同比 +20%\n会员复购率：提升至 44%');
  // 摘要刻意留空 → summarySource 初始应为 ai_pending，随后异步回填为 ai
  setValue(win, byTestId('budget-bp-modal-doc-0-name'), 'FY2027 零售数字化规划（补充版）');
  setValue(win, byTestId('budget-bp-modal-doc-0-url'), 'https://files.decathlon.cn/bp/FY2027-RETAIL-4.pdf');
  setValue(win, byTestId('budget-bp-modal-note'), '补充门店能耗管理接入，重估选址模型影响');
  await tick(120);
  click(doc.querySelector('.ant-modal-footer .ant-btn-primary'));
  await tick(220);
  check('v1.0：提交后浮层关闭', !exists('budget-bp-update-modal'));
  check('v1.0：提交后版本列表精确多出一行（3 → 4）', (() => {
    const el = byTestId('budget-bp-table');
    return !!el && el.querySelectorAll('.ant-table-tbody tr.ant-table-row').length === bpRowsBefore + 1;
  })());
  check('v1.0：新版本名称出现在列表中', blockHas('budget-bp-table', 'FY2027 零售数字化规划（补充版）'));
  check('v1.0：业务留空摘要 → 新版本初始为「AI 生成中…」（ai_pending）', blockHas('budget-bp-table', 'AI 生成中'));

  await tick(1500); // > 1200ms：等待 AI 摘要异步回填
  check('v1.0：AI 摘要异步回填（ai_pending → ai），新版本行出现归纳式摘要且不再显示「生成中」', (() => {
    const el = byTestId('budget-bp-table');
    if (!el) return false;
    const newRow = Array.from(el.querySelectorAll('.ant-table-tbody tr.ant-table-row')).find((tr) =>
      norm(tr.textContent).includes(norm('FY2027 零售数字化规划（补充版）'))
    );
    if (!newRow) return false;
    const t = norm(newRow.textContent);
    return t.includes('聚焦年度目标落地与Digital资源匹配') && !t.includes('AI生成中');
  })());

  /* ---- v1.0 P1：同分钟两连提 → 新版本必须置顶（合法全序 + 版本序号 tie-breaker）---- */
  click(byTestId('budget-bp-update'));
  await tick(320);
  setValue(win, byTestId('budget-bp-modal-name'), 'FY2027 零售数字化规划（二次修订）');
  setValue(win, byTestId('budget-bp-modal-goals'), 'GMV：同比 +22%');
  setValue(win, byTestId('budget-bp-modal-summary'), '第二次修订：将 GMV 目标上调至 +22%，并纳入门店能耗管理。');
  setValue(win, byTestId('budget-bp-modal-doc-0-name'), 'FY2027 零售数字化规划（二次修订）');
  setValue(win, byTestId('budget-bp-modal-doc-0-url'), 'https://files.decathlon.cn/bp/FY2027-RETAIL-5.pdf');
  setValue(win, byTestId('budget-bp-modal-note'), '上调 GMV 目标并纳入能耗管理');
  await tick(120);
  click(doc.querySelector('.ant-modal-footer .ant-btn-primary'));
  await tick(240);
  check('v1.0：同分钟两连提后，列表首行 = 最新版本（V2.3）且为新版本名称', (() => {
    const el = byTestId('budget-bp-table');
    if (!el) return false;
    const first = el.querySelectorAll('.ant-table-tbody tr.ant-table-row')[0];
    if (!first) return false;
    const t = norm(first.textContent);
    return t.includes('V2.3') && t.includes(norm('FY2027 零售数字化规划（二次修订）'));
  })());
  check('v1.0：同分钟两连提后版本总行数 = 5（3 存量 + 2 新增）', (() => {
    const el = byTestId('budget-bp-table');
    return !!el && el.querySelectorAll('.ant-table-tbody tr.ant-table-row').length === 5;
  })());

  await goView('budget/annual');
  await tick(200);
  check('v1.0：主表「① 年度 BP」格取到最新版本号 V2.3（当前版本 = 列表首行）', blockHas('budget-annual-cell-bp-D-RETAIL', 'V2.3'));

  // —— v0.8②：点击主表「② 项目预算」→ 独立《项目预算计划》页面（取代右侧浮层）——
  click(byTestId('budget-annual-cell-demand-D-RETAIL'));
  await tick(340);
  check(
    'v0.8②：点击 ② 入口 → 独立页面（非浮层），URL 落在 #/budget/project/D-RETAIL',
    exists('budget-project-page') &&
      exists('budget-project-table') &&
      exists('budget-project-overview') &&
      exists('budget-project-timeline') &&
      win.location.hash === '#/budget/project/D-RETAIL'
  );
  check('v0.8②：旧需求清单抽屉不再被 ② 格拉起', !exists('budget-annual-demand-drawer'));
  check('v0.8.2：项目列表 9 列 · 列序与列宽（合计 1040 = scroll.x）严格锁定', (() => {
    const el = byTestId('budget-project-table');
    if (!el) return false;
    const heads = Array.from(el.querySelectorAll('.ant-table-thead th'))
      .filter((e) => !e.classList.contains('ant-table-cell-scrollbar'))
      .map((e) => norm(e.textContent));
    const want = [
      '项目编号', '项目名称', '项目描述', '优先级', '预估业务价值',
      'Digital预算费用', 'ROI', '交付时间', '操作'
    ];
    if (heads.length !== want.length || heads.join('|') !== want.join('|')) return false;
    const cols = Array.from(el.querySelectorAll('colgroup col'));
    const sum = cols.reduce((s, col) => s + (parseFloat(col.style.width) || 0), 0);
    // 9 列宽度之和必须等于 scroll.x（1040），且 ≤ 1366 屏有效可用宽 1047 ⇒ 不横滚
    return cols.length === 9 && sum === 1040;
  })());
  check('v0.8.2：表宽锁定 1040px（= 列宽和 = scroll.x，1366 屏不横滚）', (() => {
    const t = byTestId('budget-project-table').querySelector('table');
    return !!t && /width:\s*1040px/.test(t.getAttribute('style') || '');
  })());
  check('v0.8.2：ROI 精确值（D-RETAIL 4 条已核定；未核定条目显示「—」）', (() => {
    // ROI = 预估业务价值 ÷ Digital预算费用，百分比 1 位小数
    const want = {
      'DM-2027-0001': '687.2%', // 7,318,500 / 1,065,000 = 6.8718
      'DM-2027-0002': '519.0%', // 3,924,000 / 756,000  = 5.1905
      'DM-2027-0003': '326.6%', // 1,215,000 / 372,000  = 3.2661
      'DM-2027-0004': '749.5%'  // 6,408,000 / 855,000  = 7.4947
    };
    for (const [id, roi] of Object.entries(want)) {
      const el = byTestId(`project-roi-${id}`);
      if (!el || norm(el.textContent) !== norm(roi)) return false;
    }
    return true;
  })());
  check('v0.8.2：项目描述占列且承载全文（ellipsis + 原生 title）', (() => {
    const el = byTestId('budget-project-table');
    if (!el) return false;
    const cell = el.querySelector('.ant-table-tbody tr.ant-table-row .ant-table-cell:nth-child(3) span');
    if (!cell) return false;
    const t = cell.getAttribute('title') || '';
    const txt = norm(cell.textContent);
    // 标题与正文一致（长文本被截断显示，但 title 给出全文），且不为空
    return t.length > 20 && norm(t) === txt;
  })());
  check('v0.8.2：交付时间列取实施窗口（Q1-Q2 / Q3-Q4）', (() => {
    const el = byTestId('budget-project-table');
    if (!el) return false;
    const cells = Array.from(el.querySelectorAll('.ant-table-tbody tr.ant-table-row .ant-table-cell:nth-child(8)'))
      .map((e) => norm(e.textContent));
    return cells.length === 4 && cells.every((c) => /^Q[1-4]-Q[1-4]$/.test(c));
  })());
  check('v0.8②：基础视图恒为正式版本 —— D-RETAIL 列表 4 条、概览含 V1.1', (() => {
    const el = byTestId('budget-project-table');
    if (!el) return false;
    const rows = el.querySelectorAll('.ant-table-tbody tr.ant-table-row').length;
    return rows === 4 && blockHas('budget-project-overview', 'V1.1');
  })());
  check('v0.8②：统一流水已去重 —— D-RETAIL 4 行且含历史版本 V1.0 / V1.1', (() => {
    const el = byTestId('budget-project-timeline');
    if (!el) return false;
    const rows = el.querySelectorAll('.ant-table-tbody tr.ant-table-row').length;
    const t = norm(el.textContent);
    return rows === 4 && t.includes('V1.0') && t.includes('V1.1');
  })());
  check('v0.8②：D-RETAIL 无进行中版本 → 不渲染进行中入口', !exists('budget-project-inprogress'));
  check('v0.8.2：基础视图 footer 只说「共 N 条项目」，不重复合计（金额已在概览卡）', (() => {
    const el = byTestId('budget-project-table').querySelector('.ant-table-summary');
    if (!el) return false;
    const t = norm(el.textContent);
    return t === norm('共 4 条项目');
  })());

  /* ---- v0.8.2 ① 点行 → 详情浮层（无溯源链）→ ⑤ 基本信息补 4 项 ---- */
  click(byTestId('budget-project-table').querySelector('.ant-table-tbody tr.ant-table-row'));
  await tick(360);
  check('v0.8.2①：点击任意行 → 打开项目详情浮层', exists('budget-project-detail-drawer'));
  check('v0.8.2⑤：详情浮层**不含**溯源链（TraceChain 已移除）', !doc.querySelector('[data-testid="budget-project-detail-drawer"] [role="img"][aria-label*="溯源链"]'));
  check('v0.8.2⑤：详情浮层基本信息含「项目描述 / 预估业务价值 / ROI / 交付时间」四项', (() => {
    const el = byTestId('budget-project-detail-drawer');
    if (!el) return false;
    const t = norm(el.textContent);
    return ['项目描述', '预估业务价值', 'ROI', '交付时间'].every((x) => t.includes(norm(x)));
  })());
  check('v0.8.2⑤：详情浮层保留 BRD 区块且不再出现 v0.8 自由文本「业务价值预估」', (() => {
    const el = byTestId('budget-project-detail-drawer');
    if (!el) return false;
    const t = norm(el.textContent);
    return t.includes('已派生BRD') && !t.includes('业务价值预估');
  })());
  check('v0.8.2⑤：详情浮层内 ROI 与列表同源（DM-2027-0001 = 687.2%）', (() => {
    const el = byTestId('budget-project-detail-drawer');
    return !!el && norm(el.textContent).includes('687.2%');
  })());

  /* ---- v1.6 P0-8：这三条断言的**方向已翻转**。
     原断言锁的是「无草稿部门进 /new 必被弹回基础路由」—— 那正是本轮修掉的流程死路
     （D-RETAIL / D-SVC 的「编辑」按钮 100% 失败，且界面无任何提示）。
     现行实现改为：进入 /new 时**自动建 S2 草稿**，编辑页成为合法落点。
     「不白屏」这一原始诉求仍由 v1.6 末的新增异常兜底用例覆盖。 */
  click(byTestId('budget-project-detail-edit'));
  await tick(460);
  check(
    'v1.6 P0-8：D-RETAIL 无进行中版本 → 点「编辑」自动建草稿并进入 /new/{id}（不再被弹回）',
    win.location.hash === '#/budget/project/D-RETAIL/new/DM-2027-0001' &&
      exists('budget-project-edit-page') &&
      !exists('budget-project-page')
  );

  /* 深链直入（书签 / 外部链接）同样应自动建草稿，而不是把用户踢回列表 */
  await goView('budget/project/D-RETAIL/new/DM-2027-0001');
  await tick(460);
  check(
    'v1.6 P0-8：深链 #/budget/project/D-RETAIL/new/DM-2027-0001 自动建草稿后停留在编辑页',
    win.location.hash === '#/budget/project/D-RETAIL/new/DM-2027-0001' &&
      exists('budget-project-edit-page')
  );

  /* /new（新增条目模式）同样走自动建草稿 */
  await goView('budget/project/D-RETAIL/new/_new');
  await tick(460);
  check(
    'v1.6 P0-8：#/budget/project/D-RETAIL/new/_new 自动建草稿后停留在编辑页',
    win.location.hash === '#/budget/project/D-RETAIL/new/_new' &&
      exists('budget-project-edit-page') &&
      !exists('budget-project-page')
  );

  /* 非法部门代码仍须兜底不白屏（v1.6 保留的异常路径） */
  await goView('budget/project/D-NOPE/new/_new');
  await tick(460);
  check(
    'v1.6：非法部门代码进 /new → 兜底给出返回引导而非白屏',
    exists('budget-project-page') || exists('budget-project-edit-page')
  );

  // —— 进行中的新版本：D-ECOM（A2 已预置草稿）入口可见，且内容不并入基础列表 ——
  await goView('budget/annual');
  await tick(200);
  click(byTestId('budget-annual-cell-demand-D-ECOM'));
  await tick(340);
  check(
    'v0.8②：D-ECOM 存在进行中版本 → 基础视图渲染进行中入口徽标（待 Digital 反馈费用）',
    exists('budget-project-inprogress') && blockHas('budget-project-inprogress', '待 Digital 反馈费用')
  );
  check('v0.8②：进行中内容不并入基础列表 —— D-ECOM 列表仍为正式版本 3 条', (() => {
    const el = byTestId('budget-project-table');
    return !!el && el.querySelectorAll('.ant-table-tbody tr.ant-table-row').length === 3;
  })());

  // —— /new 进行中版本视图（D-CRM 已预置草稿）——
  await goView('budget/project/D-CRM/new');
  await tick(280);
  check(
    'v0.8②：/new 常驻状态条（D-CRM · 待 Digital 反馈费用）',
    exists('budget-project-inprogress') && blockHas('budget-project-inprogress', '待 Digital 反馈费用')
  );
  check('v0.8②：/new 提供 Digital 反馈费用入口', exists('budget-project-evaluate'));

  /* —— /new 空态边界：该年无任何版本 → replace 回基础路由 ——
   * v1.6 起改用 D-HR / D-RETAIL 对照验证 /new 的两态。
   * 原因：原用的 D-HR 已被补 DV-HR-1（待复核确认草稿），「该年无任何版本」的前提
   * 不再成立；而数据扩充后 8 个 BU 全有版本行，「完全无版本」的 BU 已不存在，
   * 原断言的前提**不可满足**。改为锁定仍然可达的两态边界（不削弱覆盖）：
   *   · D-HR有进行中版本 → /new 正常进入
   *   · D-RETAIL 清单已全部确认、无草稿 → /new replace 回基础路由
   * （注：旧版 D-FIN 亦不适用——它已有 DV-FIN-1 待评估费用版本行。）
  await goView('budget/project/D-HR/new');
  await tick(420);
  check(
    'v0.8②：/new 有进行中版本（D-HR · 待复核确认）→ 正常进入 /new 视图',
    win.location.hash === '#/budget/project/D-HR/new' && exists('budget-project-page')
  );

  await goView('budget/project/D-RETAIL/new');
  await tick(420);
  check(
    'v0.8②：/new 无进行中版本（D-RETAIL 清单已全部确认）→ replace 回基础路由',
    win.location.hash === '#/budget/project/D-RETAIL' && exists('budget-project-page')
  );

  /* ---- v0.8.2 ④ 权限矩阵：D-ECOM 有草稿（S3 待反馈费用）→ 仅费用可填、其余只读 ----
   * 只读判定要兼容两类控件：Input/TextArea/InputNumber 用 `disabled` 属性；
   * antd Select 的 disabled 落在 wrapper 的 `.ant-select-disabled` 类上（内部 input 也 disabled）。
   * 因此统一用 isFieldReadonly / isFieldEditable 判定，避免对 Select 误判。 */
  const isFieldReadonly = (id) => {
    const el = byTestId(id);
    if (!el) return false;
    if (el.disabled) return true;
    if (el.classList && el.classList.contains('ant-select-disabled')) return true;
    const inner = el.querySelector && el.querySelector('input, textarea');
    return !!(inner && inner.disabled);
  };
  const isFieldEditable = (id) => !!byTestId(id) && !isFieldReadonly(id);
  /** 6 个编辑页字段（S2 全可填 / S3 仅费用可填的矩阵断言共用同一清单） */
  const EDIT_FIELDS = [
    'budget-project-edit-name', 'budget-project-edit-desc', 'budget-project-edit-priority',
    'budget-project-edit-window', 'budget-project-edit-value', 'budget-project-edit-fee'
  ];

  await goView('budget/project/D-ECOM/new/DM-2027-0005');
  await tick(360);
  check(
    'v0.8.2④：有草稿部门进编辑页（D-ECOM · S3 待反馈费用）',
    exists('budget-project-edit-page') && win.location.hash === '#/budget/project/D-ECOM/new/DM-2027-0005'
  );
  check('v0.8.2④：S3 下「Digital预算费用」可填', isFieldEditable('budget-project-edit-fee'));
  check('v0.8.3：S3 态**不存在**「新增项目」入口（清单已提交，不可再追改）', !exists('budget-project-add'));
  check('v0.8.2④ / v0.8.3：S3 下 6 字段中**恰好 1 个**可填（费用），其余 5 项只读', (() => {
    const editable = EDIT_FIELDS.filter((id) => isFieldEditable(id));
    return (
      editable.length === 1 &&
      editable[0] === 'budget-project-edit-fee' &&
      ['budget-project-edit-name', 'budget-project-edit-desc', 'budget-project-edit-value', 'budget-project-edit-priority', 'budget-project-edit-window'].every(isFieldReadonly)
    );
  })());
  check('v0.8.2④ / v0.8.3：S3 状态条明示权限（仅「Digital预算费用」可填，其余 5 项只读）', blockHas('budget-project-edit-page', '仅「Digital预算费用」可填，其余 5 项只读'));
  check('v0.8.2④：S3 下保存可用且不改变版本状态', (() => {
    const el = byTestId('budget-project-edit-save');
    return !!el && !el.disabled;
  })());

  /* ---- v0.8.2 ④ 有草稿部门：/new 点行 → 详情浮层 → 「编辑」→ 编辑独立页 ---- */
  // 等待放宽到 600ms：抽屉开合 + 路由跳转叠加 antd 动画，340/380 在慢机器上会偶发不够
  // （v1.3 删掉消耗页那段自带等待后暴露出来，此处把脆弱点自身修好，而非靠远处补等待）。
  await goView('budget/project/D-ECOM/new');
  await tick(600);
  click(byTestId('budget-project-table').querySelector('.ant-table-tbody tr.ant-table-row'));
  await tick(600);
  check('v0.8.2④：D-ECOM /new 点行 → 详情浮层打开', exists('budget-project-detail-drawer'));
  click(byTestId('budget-project-detail-edit'));
  await tick(600);
  check(
    'v0.8.2④：详情浮层点「编辑」→ 项目编辑独立页，URL 落在 #/budget/project/D-ECOM/new/{id}',
    exists('budget-project-edit-page') &&
      win.location.hash.startsWith('#/budget/project/D-ECOM/new/DM-2027-') &&
      /* 5 段路由：'#' + budget/project/D-ECOM/new/DM-xxxx-0005 → 6 段 */
      win.location.hash.split('/').length === 6
  );
  check('v0.8.2④：编辑页 4 个字段 testid 齐备（名称/描述/预估业务价值/Digital预算费用）', (() =>
    ['budget-project-edit-name', 'budget-project-edit-desc', 'budget-project-edit-value', 'budget-project-edit-fee'].every((id) =>
      exists(id)
    ))());
  check('v0.8.2④：编辑页自带返回按钮 + 保存按钮', exists('budget-project-edit-back') && exists('budget-project-edit-save'));

  /* ---- v0.8.2 ② 行内编辑已全部移除：回到 /new 列表核对单元格内无任何表单控件 ---- */
  await goView('budget/project/D-ECOM/new');
  await tick(340);
  check('v0.8.2②：列表内不再有行内编辑器（Input / TextArea / Select 均不嵌在单元格里）', (() => {
    const el = byTestId('budget-project-table');
    if (!el) return false;
    const cells = el.querySelectorAll('.ant-table-tbody .ant-table-cell');
    return cells.length > 0 && el.querySelectorAll('.ant-table-tbody input, .ant-table-tbody textarea, .ant-table-tbody .ant-select').length === 0;
  })());
  check('v0.8.2②：旧行内评估输入框 testid（project-eval-*）全站消失', doc.querySelector('[data-testid^="project-eval-"]') === null);
  check('v0.8.2：/new footer =「共 N 条项目」+「本次编辑暂计 X 万元」（与列同源）', (() => {
    const el = byTestId('budget-project-table').querySelector('.ant-table-summary');
    if (!el) return false;
    const t = norm(el.textContent);
    return t.startsWith(norm('共 3 条项目')) && t.includes(norm('本次编辑暂计')) && t.includes('万元');
  })());

  /* ---- v0.8.2 ④ 权限矩阵另一侧：S2 草稿 → 4 项全可填 ----
   * D-SVC 有 FY2027 需求但**无预置草稿**：先走「编辑」按钮触发 startDraft（S0→S2），
   * 再进 /new/{id} 验证 S2 分支。本块放在 v0.8 断言末尾，其状态变更不影响前面的断言。 */
  await goView('budget/project/D-SVC');
  await tick(320);
  click(byTestId('budget-project-edit'));
  await tick(400);
  check(
    'v0.8.2④：S0 点「编辑」→ 新建 S2 草稿并进入 /new',
    exists('budget-project-inprogress') && win.location.hash === '#/budget/project/D-SVC/new'
  );
  await goView('budget/project/D-SVC/new/DM-2027-0014');
  await tick(380);
  check(
    'v0.8.2④：S2 草稿态进编辑页（DM-2027-0014）',
    exists('budget-project-edit-page') && win.location.hash === '#/budget/project/D-SVC/new/DM-2027-0014'
  );
  check('v0.8.2④ / v0.8.3：S2 下 6 个字段**全部可填**（无一 readonly）', EDIT_FIELDS.every(isFieldEditable));
  check('v0.8.2④：S2 状态条明示权限（业务侧可填写全部 6 项）', blockHas('budget-project-edit-page', '业务侧可填写全部 6 项'));
  check('v0.8.2④：编辑页按草稿预填「预估业务价值」（148.5 万元）', (() => {
    const el = byTestId('budget-project-edit-value');
    return !!el && norm(el.value) === norm('148.5');
  })());
  check('v0.8.2④：编辑页「保存」后回到 /new 列表且不改变版本状态（仍为草稿）', (() => {
    click(byTestId('budget-project-edit-save'));
    return true;
  })());
  await tick(420);
  check(
    'v0.8.2④：保存后回列表，进行中状态仍为「编辑中（草稿）」而非已提交',
    win.location.hash === '#/budget/project/D-SVC/new' && blockHas('budget-project-inprogress', '编辑中（草稿）')
  );

  /* ---- v0.8.3：S2 草稿态「新增项目」→ /new/_new 新建模式（D-SVC 草稿恒 2 条） ---- */
  check('v0.8.3：S2 草稿态 /new 列表存在「新增项目」入口', exists('budget-project-add'));
  check('v0.8.3：S2 草稿态 /new 列表恒为 2 条（D-SVC 的 DM-2027-0014 / 0015）', (() => {
    const el = byTestId('budget-project-table');
    return !!el && el.querySelectorAll('.ant-table-tbody tr.ant-table-row').length === 2;
  })());
  click(byTestId('budget-project-add'));
  await tick(400);
  check(
    'v0.8.3：点「新增项目」→ hash 精确等于 #/budget/project/D-SVC/new/_new',
    exists('budget-project-edit-page') && win.location.hash === '#/budget/project/D-SVC/new/_new'
  );
  check('v0.8.3：新建页 6 个字段 testid 齐备（名称/描述/优先级/交付时间/预估业务价值/Digital预算费用）', (() =>
    ['budget-project-edit-name', 'budget-project-edit-desc', 'budget-project-edit-priority', 'budget-project-edit-window', 'budget-project-edit-value', 'budget-project-edit-fee'].every((id) =>
      exists(id)
    ))());
  check('v0.8.3：S2 新建页 6 个字段全部可填（无一 readonly）', EDIT_FIELDS.every(isFieldEditable));
  check('v0.8.3：新建页优先级默认 P2', (() => {
    const el = byTestId('budget-project-edit-priority');
    return !!el && /P2/.test(el.textContent || '');
  })());
  setValue(win, byTestId('budget-project-edit-name'), '门店智能巡检机器人');
  setValue(win, byTestId('budget-project-edit-desc'), '按巡检计划自动拍照取证，输出陈列与安全异常整改单。');
  setValue(win, byTestId('budget-project-edit-window'), 'Q3-Q4');
  await tick(140);
  click(byTestId('budget-project-edit-save'));
  await tick(460);
  check(
    'v0.8.3：新建保存后回 /new 列表，行数 2 → 3（精确 +1）',
    win.location.hash === '#/budget/project/D-SVC/new' &&
      (() => {
        const el = byTestId('budget-project-table');
        return !!el && el.querySelectorAll('.ant-table-tbody tr.ant-table-row').length === 3;
      })()
  );
  check('v0.8.3：新行「项目编号」单元格渲染「待分配」（TMP- 前缀不外露）', (() => {
    const el = byTestId('budget-project-table');
    if (!el) return false;
    const rows = el.querySelectorAll('.ant-table-tbody tr.ant-table-row');
    const last = rows[rows.length - 1];
    if (!last) return false;
    const firstCell = last.querySelector('.ant-table-cell');
    return !!firstCell && norm(firstCell.textContent) === norm('待分配');
  })());
  check('v0.8.3：新建后新增行内容正确（名称/交付时间 落库生效）', (() => {
    const el = byTestId('budget-project-table');
    if (!el) return false;
    const rows = el.querySelectorAll('.ant-table-tbody tr.ant-table-row');
    const last = rows[rows.length - 1];
    if (!last) return false;
    const t = norm(last.textContent);
    return t.includes(norm('门店智能巡检机器人')) && t.includes(norm('Q3-Q4'));
  })());
  check('v0.8.3：新增后进行中状态仍为「编辑中（草稿）」（新增不改变版本状态）', blockHas('budget-project-inprogress', '编辑中（草稿）'));

  await goView('budget/annual');
  await tick(200);

  /* ============ 3.1 v1.4《对账单总览》：空态=累计 + 趋势联动 + 行点击 ============ */
  await goView('billing/monthly');

  /* —— 默认态：空月份 = 累计到最近已出账月（不是 2026-08 单月！这是语义变更） —— */
  check('v1.4：默认态为「累计」而非单月（标题含截至 2026-08）', blockHas('billing-monthly-table', '累计至最近已出账月 2026-08'));
  check('v1.4：累计口径明示不含待出账月', has('不含待出账月') && blockHas('billing-monthly-table', '累计至最近已出账月 2026-08'));
  check('v1.4：月份下拉为空（placeholder 可见，非单月锁定）', has('全部（累计）'));
  check('v1.4：累计态无「发出账单 / 确认核销」动作（避免一次性批量核销 8 个月）',
    !has('确认核销') && !has('发出账单'));

  /* —— 累计态部门列不得显示单个 BILL 单号（8 张账单 = 8 个单号） —— */
  check('v1.4：累计态部门列报「N 张账单 · 区间」而非单一单号',
    has('8 张账单 · 01-08') && !has('BILL-202608-RETAIL ·'));

  /* —— 筛选控件只剩 1 个（账期），且**位于页面开头**（v1.4.4）——
     账期驱动的是整页口径（指标卡 / 趋势图 / 交付明细 / 运维明细 / 部门账单），
     控件却曾挂在页面最末端的部门账单标题行里 —— 位置与作用范围错配。
     现在提到页首 `billing-month-scope`，并明示「对全页生效」。
     作用域必须限定在**部门账单板块内**：Header 还有一个全局部门 Select。 */
  check('v1.4.4：账期筛选已移至页首并明示对全页生效', (() => {
    const el = byTestId('billing-month-scope');
    if (!el) return false;
    return (
      el.querySelectorAll('.ant-select').length === 1 &&
      !!el.querySelector('[data-testid="billing-month-filter"]') &&
      norm(el.textContent).includes('对本页全部指标、趋势图与明细同时生效')
    );
  })());
  check('v1.4.4：账期筛选在页首（DOM 顺序早于所有内容板块）', (() => {
    const scope = byTestId('billing-month-scope');
    const first = byTestId('billing-overview-floor1');
    if (!scope || !first) return false;
    /* compareDocumentPosition：2 = FOLLOWING，即 scope 位于 floor1 之前 */
    return !!(scope.compareDocumentPosition(first) & 4);
  })());
  check('v1.4.4：部门账单板块内已无筛选控件（下拉不再埋在页面末尾）', (() => {
    const t = byTestId('billing-monthly-table');
    return !!t && t.querySelectorAll('.ant-select').length === 0;
  })());
  check('v1.4：列表楼层内无关键词搜索框（FilterBar 确已移除）',
    byTestId('billing-monthly-table').querySelectorAll('.ant-input-search').length === 0);
  check('v1.4：原 FilterBar 筛选项文案已从列表楼层消失（反向断言）', (() => {
    const t = norm(byTestId('billing-monthly-table').textContent);
    return !t.includes('账单状态') && !t.includes('需求来源') && !t.includes('计费类型');
  })());
  /* 选择器必须排除趋势线本身：v1.4.1 新增了 data-testid="billing-trend-line"，
     `[data-testid^="billing-trend-"]` 前缀匹配会把它一起算进来（9 柱 + 1 线 = 10）。
     用 `billing-trend-\d` 精确匹配「月份-数字」形式的柱。 */
  const TREND_BAR = '[data-testid^="billing-trend-2"]';
  check('v1.4：月份 chip 控件已移除（不再有可点月份小块）',
    doc.querySelectorAll(TREND_BAR).length === 9 &&
    !doc.querySelector('[role="button"][aria-label="2026-09 待出账"]'));

  /* —— 趋势图 ↔ 月份下拉 双向联动 —— */
  check('v1.4：趋势图 9 根柱全部渲染且带 testid（趋势线本身不计入柱数）',
    doc.querySelectorAll(TREND_BAR).length === 9);
  check('v1.4.1：柱状图上叠加了月度合计趋势线（SVG polyline 独立锚点）', (() => {
    const line = byTestId('billing-trend-line');
    return !!line && !!line.querySelector('path[d]') && line.querySelectorAll('circle').length === 9;
  })());
  check('v1.4.1：趋势线覆盖全部 9 个月（M 起点 + 8 个 L 折点，柱顶不漏月）', (() => {
    const d = byTestId('billing-trend-line').querySelector('path[d]').getAttribute('d');
    return (d.match(/M/g) || []).length === 1 && (d.match(/L/g) || []).length === 8;
  })());
  check('v1.4：趋势图柱含交付/运维两段且颜色不同（第二重通道：段序固定 + 图例）',
    doc.querySelectorAll('[data-testid="billing-trend-2026-08"] > div').length > 0);
  click(byTestId('billing-trend-2026-08'));
  await tick(260);
  check('v1.4：点柱 → 列表切到该单月（标题含 2026-08 各部门应收账单）', has('2026-08 各部门应收账单'));
  check('v1.4：单月态出现「发出账单 / 确认核销」动作', has('确认核销'));
  check('v1.4：单月态部门列显示真实 BILL 单号', has('BILL-202608-RETAIL'));

  /* —— 再点同一柱 → 回累计态（"取消"的语义） —— */
  click(byTestId('billing-trend-2026-08'));
  await tick(260);
  check('v1.4：再点同一柱 → 回到累计态（可发现性闭环）', blockHas('billing-monthly-table', '累计至最近已出账月 2026-08'));
  /* ============ v1.4.2 账单明细两块（结构 + 口径断言） ============ */
  await goView('billing/monthly');
  await tick(400);

  /* —— 板块分隔视觉：v1.4.4 起**不再有「楼层 N」序号胶囊**，只保留顶部色条 ——
     编号只是作者视角的 IA 序号，对读者无语义，且增删板块后必然全体错号。 */
  check('v1.4.4：全页不再出现任何「楼层 N」序号胶囊', (() => {
    const t = norm(doc.body.textContent);
    return !/楼层[一二三四五六七八九十]/.test(t);
  })());
  check('v1.4.2：板块标题已放大到 16px（BlockTitle 为 14px，可辨为独立板块）', (() => {
    const el = doc.querySelector('[data-testid="billing-delivery-floor"]');
    const t = el && Array.from(el.querySelectorAll('span')).find((s) => s.textContent === '交付项目计费账单总览');
    return !!t && parseInt(t.style.fontSize, 10) >= 16;
  })());
  check('v1.4.2：楼层卡片带顶部色条（视觉分隔）', ['billing-overview-floor1', 'billing-overview-trend', 'billing-monthly-table', 'billing-delivery-floor', 'billing-ops-floor'].every((f) => {
    const el = byTestId(f);
    return !!el && /border-top/.test(el.getAttribute('style') || '');
  }) === true);

  /* —— 交付项目计费账单总览 —— */
  check('v1.4.2：交付计费账单总览存在且列结构完全符合 9 列规格', (() => {
    const el = byTestId('billing-delivery-floor');
    if (!el) return false;
    const cols = Array.from(el.querySelectorAll('thead th')).map((t) => t.textContent.trim());
    return (
      cols.length === 9 &&
      cols[0] === '项目编号' &&
      cols[1] === '项目名称' &&
      cols[2] === '项目描述' &&
      cols[3] === '发起项目的BU' &&
      cols[4] === '交付上线时间' &&
      cols[5] === '业务复盘文档' &&
      cols[6] === '业务量化价值' &&
      cols[7].startsWith('digital费用') &&
      cols[8] === 'ROI'
    );
  })());
  check('v1.4.2：交付明细每行 = 一个计费项目（有编号且编号唯一）', (() => {
    const el = byTestId('billing-delivery-floor');
    const ids = Array.from(el.querySelectorAll('tbody tr.ant-table-row td:first-child')).map((t) => t.textContent.trim()).filter(Boolean);
    return ids.length > 0 && new Set(ids).size === ids.length && ids.every((v) => /^BRD-\d{4}-\d{4}$/.test(v));
  })());
  /* ---- v1.6 P1-11 交付明细列宽重排（desc 260→180，总宽 1312→1232）----
     起因：1366 屏可用宽 ≈ 1047px（1366 − sider 224 − 页面 padding 48
     − Card body padding 32 − 边框 2 − 竖向滚动条 15），而原总宽 1312，
     首屏恰在「业务复盘文档」列结束 —— 最该被看到的三个数字列全在折叠区右侧。
     断言两层：① desc 确实是 180 且列宽和 = 1232（scroll.x 与列宽同源，
     不多不少）；② 三个数字列的**累计右边界**落在 1047 内（即真的进了首屏）。 */
  check('v1.6 P1-11：交付明细 desc 260→180，总宽 1232（scroll.x 与列宽同源）', (() => {
    const el = byTestId('billing-delivery-floor');
    if (!el) return false;
    const cols = Array.from(el.querySelectorAll('colgroup col')).map((c) => c.style.width || '');
    if (cols.length !== 9) return false;
    if (cols[2] !== '180px') return false;
    const sum = cols.reduce((a, w) => a + parseInt(w, 10), 0);
    return sum === 1232;
  })());
  check('v1.6 P1-11：业务量化价值列进入 1366 首屏（右边界 ≤ 1047px）', (() => {
    const el = byTestId('billing-delivery-floor');
    if (!el) return false;
    const cols = Array.from(el.querySelectorAll('colgroup col')).map((c) => parseInt(c.style.width || '0', 10));
    if (cols.length !== 9 || cols.some((w) => !w)) return false;
    // 「业务量化价值」= 下标 6；其右边界 = 前 7 列之和
    const rightEdge = cols.slice(0, 7).reduce((a, b) => a + b, 0);
    return rightEdge > 0 && rightEdge <= 1047;
  })());
  check('v1.6 P1-11：digital费用列 fixed:right（横滚时常驻可见）', (() => {
    const el = byTestId('billing-delivery-floor');
    if (!el) return false;
    const feeTh = Array.from(el.querySelectorAll('thead th')).find((th) =>
      norm(th.textContent).includes('digital费用')
    );
    return !!feeTh && feeTh.className.includes('ant-table-cell-fix-right');
  })());
  check('v1.6 P1-12：交付明细 4 个可排序列（项目名/上线时间/费用/ROI）', (() => {
    const el = byTestId('billing-delivery-floor');
    if (!el) return false;
    const sortable = Array.from(el.querySelectorAll('thead th')).filter((th) =>
      th.querySelector('.ant-table-column-sorter')
    );
    return sortable.length === 4;
  })());
  check('v1.4.2：交付明细 digital 费用列有值且与板块合计同源（Σ行内 = 头部合计）', (() => {
    const el = byTestId('billing-delivery-floor');
    const num = (s) => Number(String(s).replace(/,/g, '').replace(/[^\d.]/g, '')) || 0;
    const cells = Array.from(el.querySelectorAll('tbody tr.ant-table-row')).map((r) => num(r.querySelectorAll('td')[7].textContent));
    const sum = cells.reduce((a, b) => a + b, 0);
    /* 头部合计 562.2 万元；行内各值已四舍五入到 0.1，7 行累积误差可达 ±0.35。
       容差取 0.5 —— 足以容纳累积舍入，又能抓住真实的口径错位（差值会是几百级）。 */
    const head = num(el.textContent.match(/digital 费用合计\s*([\d,]+(?:\.\d+)?)/)[1]);
    return cells.length > 0 && Math.abs(sum - head) <= 0.5;
  })());
  check('v1.4.2：业务复盘文档列渲染为链接（已复盘）或「待复盘」（未复盘），二者必居其一', (() => {
    const el = byTestId('billing-delivery-floor');
    const cells = Array.from(el.querySelectorAll('tbody tr.ant-table-row')).map((r) => r.querySelectorAll('td')[5].textContent.trim());
    return cells.length > 0 && cells.every((v) => v === '查看复盘' || v === '待复盘');
  })());
  check('v1.4.2：ROI 与业务量化价值**同源**（无价值必无 ROI，不出现 0.00）', (() => {
    const el = byTestId('billing-delivery-floor');
    const rows = Array.from(el.querySelectorAll('tbody tr.ant-table-row'));
    return rows.every((r) => {
      const t = r.querySelectorAll('td');
      const v = t[6].textContent.trim();
      const roi = t[8].textContent.trim();
      if (v === '—') return roi === '—';
      return roi !== '—' && Number(roi) > 0;
    });
  })());

  /* —— 系统运维计费账单总览 —— */
  check('v1.4.2：运维计费账单总览存在且列结构完全符合 6 列规格', (() => {
    const el = byTestId('billing-ops-floor');
    if (!el) return false;
    const cols = Array.from(el.querySelectorAll('thead th')).map((t) => t.textContent.trim());
    return (
      cols.length === 6 &&
      cols[0] === '系统名称' &&
      cols[1] === '计费方式' &&
      cols[2] === '单价' &&
      cols[3].startsWith('用量') &&
      cols[4].startsWith('总费用') &&
      cols[5] === '分摊费用的BU清单'
    );
  })());
  check('v1.4.2：运维明细每行 = 一个计费系统（系统编号唯一，且无 0 费用行）', (() => {
    const el = byTestId('billing-ops-floor');
    const rows = Array.from(el.querySelectorAll('tbody tr.ant-table-row'));
    const ids = rows.map((r) => (r.textContent.match(/SYS-\d{2}/) || [])[0]);
    return rows.length > 0 && new Set(ids).size === rows.length && ids.every(Boolean);
  })());
  check('v1.4.2：固定年费类系统的用量显「固定年费 / 月」而非 0（0 会被读成没用量）', (() => {
    const el = byTestId('billing-ops-floor');
    const rows = Array.from(el.querySelectorAll('tbody tr.ant-table-row'));
    /* 至少存在一行「固定年费 / 月」，且这些行的用量格不得是纯数字 */
    const fixed = rows.filter((r) => r.querySelectorAll('td')[1].textContent.includes('固定年费'));
    return fixed.length > 0 && fixed.every((r) => r.querySelectorAll('td')[3].textContent.includes('固定年费 / 月'));
  })());
  check('v1.4.2：分摊 BU 清单非空且按金额降序（次序稳定）', (() => {
    const el = byTestId('billing-ops-floor');
    const rows = Array.from(el.querySelectorAll('tbody tr.ant-table-row'));
    return rows.every((r) => {
      const txt = r.querySelectorAll('td')[5].textContent.replace(/\s+/g, '');
      /* 每行至少 1 个 BU 名称 */
      return /[\u4e00-\u9fa5]{2,}/.test(txt);
    });
  })());
  check('v1.4.2：运维总费用合计 = 各系统行内之和（与列同源）', (() => {
    const el = byTestId('billing-ops-floor');
    const num = (s) => Number(String(s).replace(/[^\d.]/g, '')) || 0;
    const cells = Array.from(el.querySelectorAll('tbody tr.ant-table-row')).map((r) => num(r.querySelectorAll('td')[4].textContent));
    const head = num(el.textContent.match(/总费用合计\s*([\d,]+(?:\.\d+)?)/)[1]);
    return cells.length > 0 && Math.abs(cells.reduce((a, b) => a + b, 0) - head) <= 0.3;
  })());

  /* —— 跨楼层一致性：明细合计 = 部门账单合计（口径必须闭合） ——
     注意：金额有**千分位逗号**（如 1,772.1），正则必须允许逗号，
     否则只会匹配到「,1」这段（实测运维合计 1,772.1 被读成 1）。 */
  check('v1.4.2：交付合计 + 运维合计 = 部门账单合计（三处口径闭合）', (() => {
    const grab = (el, re) => {
      const m = el.textContent.match(re);
      return m ? Number(String(m[1]).replace(/,/g, '')) : NaN;
    };
    const dv = grab(byTestId('billing-delivery-floor'), /digital 费用合计\s*([\d,]+(?:\.\d+)?)/);
    const op = grab(byTestId('billing-ops-floor'), /总费用合计\s*([\d,]+(?:\.\d+)?)/);
    /* 部门楼层 footer 的「合计应收」格（第 4 格） */
    const foot = byTestId('billing-monthly-table').querySelector('tfoot tr');
    const deptTotal = foot
      ? Number(String(foot.querySelectorAll('td')[3].textContent || '').replace(/,/g, '').replace(/[^\d.]/g, ''))
      : NaN;
    if ([dv, op, deptTotal].some((v) => Number.isNaN(v))) return false;
    /* 三层各自四舍五入到 0.1，累积误差容差 0.5 */
    return Math.abs(dv + op - deptTotal) <= 0.5;
  })());

  /* —— 楼层随月份联动：切到 2026-09 应出现 2 个「待复盘」项目 ——
     antd Select 在 jsdom 下需 **mousedown** 才展开下拉（click 不触发），
     故这里不用 click()，直接派发 mousedown。 */
  const sel09 = doc.querySelector('[data-testid="billing-month-filter"] .ant-select-selector');
  sel09.dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true }));
  await tick(420);
  const opt09 = Array.from(doc.querySelectorAll('.ant-select-item-option')).find((o) => o.textContent.includes('2026-09'));
  click(opt09);
  await tick(700);
  check('v1.4.2：切到 2026-09 → 交付明细收窄为该月项目（区间联动生效）', (() => {
    const rows = Array.from(byTestId('billing-delivery-floor').querySelectorAll('tbody tr.ant-table-row'));
    return rows.length > 0 && rows.length < 7;
  })());
  check('v1.4.2：未复盘项目显「待复盘 / —」，ROI 不造数', (() => {
    const el = byTestId('billing-delivery-floor');
    const pend = Array.from(el.querySelectorAll('tbody tr.ant-table-row')).filter((r) => r.querySelectorAll('td')[5].textContent.trim() === '待复盘');
    return pend.length > 0 && pend.every((r) => r.querySelectorAll('td')[6].textContent.trim() === '—' && r.querySelectorAll('td')[8].textContent.trim() === '—');
  })());
  check('v1.4.2：交付明细脚注说明价值取自「上线后复盘」（口径纪律常驻）',
    blockHas('billing-delivery-floor', '上线后业务复盘') && blockHas('billing-delivery-floor', '不是立项预估'));

  /* 复位回累计态：下面「点行」断言依赖累计口径（进 2026-08 账单）。
     goView 只改 hash、不重置组件 state，故必须显式清空月份下拉。
     清空 = 点 Select 的 allowClear 清除图标（`.ant-select-clear`），
     不用「选中态为 false 的选项」—— 那依赖 antd 内部 aria，版本升级易失效。 */
  const clearIcon = doc.querySelector('[data-testid="billing-month-filter"] .ant-select-clear');
  /* antd 的 allowClear 清除图标监听 **mousedown**（同 Select 展开），
     用 click() 不会触发 —— 实测图标存在但点击后值不变。 */
  clearIcon.dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true }));
  await tick(600);
  check('v1.4.2：可清空月份回到累计态（空态是合法默认态，非未初始化）',
    blockHas('billing-delivery-floor', '累计至最近已出账月'));

  /* —— 行点击 → 独立详情页（非浮层） —— */
  await goView('billing/monthly');
  click(byTestId('billing-row-D-RETAIL'));
  await tick(300);
  check('v1.4.3：点行 → 跳《部门账单详情页》独立路由（非浮层）',
    win.location.hash === '#/billing/dept/D-RETAIL' && exists('dept-bill-page'));
  check('v1.4：详情页不是浮层 —— 页面内无 .ant-drawer',
    doc.querySelectorAll('.ant-drawer').length === 0);


  /* ============ 4. TraceChain 三处内嵌 ============ */
  /* 4.1 BRD 详情抽屉（delivery/brd 深链自动打开） */
  await goView('delivery/brd/BRD-2026-0101');
  check('TraceChain①BRD 详情：抽屉打开（结构锚点）', exists('delivery-brd-drawer'));
  check('TraceChain①BRD 详情：六节点标签齐全', (() => {
    const el = byTestId('delivery-brd-drawer');
    if (!el) return false;
    const t = norm(el.textContent);
    return ['BP提交', '年度需求', 'BRD提报', '评估签收', '交付上线', '月度账单'].every((x) => t.includes(x));
  })());
  check('TraceChain①BRD 详情：外层 role=img + aria-label（属性断言）', !!doc.querySelector('[data-testid="delivery-brd-drawer"] [role="img"][aria-label*="溯源链"]'));
  check('TraceChain①BRD 详情：⑤交付上线节点 state=已完成（逐节点 aria）', nodeAria('⑤交付上线').includes('状态：已完成'));
  check('TraceChain①BRD 详情：⑥月度账单节点 state=已完成（逐节点 aria）', nodeAria('⑥月度账单').includes('状态：已完成'));

  /* 4.2 需求详情（年度预算计划 → DM- 深链直接打开需求详情，内嵌溯源链） */
  await goView('budget/annual/DM-2026-0003');
  check('TraceChain②需求详情：抽屉打开（结构锚点）', exists('budget-demand-drawer'));
  check('TraceChain②需求详情：抽屉内溯源链渲染', !!doc.querySelector('[data-testid="budget-demand-drawer"] [role="img"][aria-label*="溯源链"]'));
  check('TraceChain②需求详情：抽屉标题', has('需求详情 · DM-2026-0003'));

  /* 4.3 《部门账单详情页》独立页（v1.4.3：BILL- 深链 → 部门视角四板块） */
  await goView('billing/dept/D-RETAIL');
  await tick(500);
  check('v1.4.3：BILL- 深链可进入《部门账单详情页》独立路由', exists('dept-bill-page'));
  check('v1.4.3：详情页不是浮层 —— 页面内无 .ant-drawer', doc.querySelectorAll('.ant-drawer').length === 0);

  /* —— 页面顶部必须一眼看出「这是谁的账单」 —— */
  check('v1.4.3：详情页顶部有部门标识横幅（含部门名与代码）', (() => {
    const el = byTestId('dept-bill-banner');
    if (!el) return false;
    const t = norm(el.textContent);
    return t.includes('部门账单详情') && t.includes('D-RETAIL') && t.includes('本页仅呈现');
  })());
  /* React 把 `borderLeft: '4px solid X'` 规范化为**单条** `border-width: 1px 1px 1px 4px`
     + border-color + border-style（不是拆成四个长写属性；jsdom getComputedStyle 也不解析
     shorthand）⇒ 直接读 border-width 的第 4 段。实测左边 4px、其余 1px = 左侧色条。 */
  check('v1.4.3：横幅用主色底 + 左侧 4px 色条（视觉上与普通页面可区分）', (() => {
    const el = byTestId('dept-bill-banner');
    if (!el) return false;
    const st = el.getAttribute('style') || '';
    const bw = (st.match(/border-width:\s*([^;]+)/) || [])[1] || '';
    const parts = bw.trim().split(/\s+/);
    return /background(?:-color)?:\s*(?!none|transparent)/.test(st) &&
      parts.length === 4 && parts[3] === '4px' && parts[0] === '1px';
  })());

  /* —— 板块结构：费用构成 / 趋势 / 交付 / 运维，且无「楼层 N」编号（v1.4.4） —— */
  check('v1.4.3：详情页四个板块齐备（费用构成 / 趋势 / 交付 / 运维）',
    ['dept-bill-floor1', 'dept-bill-trend', 'billing-delivery-floor', 'billing-ops-floor'].every((f) => exists(f)));
  check('v1.4.3：详情页**不含**部门计费账单总览板块（已锁定单一部门，汇总同源重复）',
    !exists('billing-monthly-table') && !has('部门计费账单总览'));
  check('v1.4.4：详情页同样无「楼层 N」序号胶囊', (() => {
    const root = byTestId('dept-bill-page');
    return !!root && !/楼层[一二三四五六七八九十]/.test(norm(root.textContent));
  }));
  /* v1.4.4：预算池板块已从本页移除 —— 账单页只讲「已出账应收」，
     预算池是 FY 口径、含未出账的已承诺额度，混排会把「可用余额」误读成「账单还欠多少」。
     断言方向为「确已消失」+ 该部门页不再出现预算池文案。 */
  check('v1.4.4：详情页**不含**预算池状态板块（账单页不混排预算口径）',
    !exists('dept-bill-pool') && !has('预算池状态'));

  /* ============ v1.4.5：两页首屏条同构（结构对比，不是各看各的） ============
     核心断言是**对比**：把两页首屏条的「视觉签名 + 控件骨架」逐项比齐，
     而不是各自断言「存在一个横幅」。后者无法发现「总览页改回灰底两段式」这种漂移。
     取法：从 style 字符串抽出主色底 / 左 4px 色条 / 36px 图标块 / 标题字号，
     两页必须**完全相同**；再各自验「账期标签 + 1 个下拉 + 1 个操作按钮」。 */
  /* 找标题 span 必须**排除 aria-hidden 的图标块** —— 图标块也带 font-size:18px，
     且 DOM 上在标题之前；不排除会取到空文本的图标而非真标题。 */
  const titleSpanOf = (el) =>
    Array.from(el.querySelectorAll('span')).find(
      (s) => /font-size:\s*18px/.test(s.getAttribute('style') || '') && s.getAttribute('aria-hidden') !== 'true'
    );
  const headSignature = (el) => {
    if (!el) return null;
    const st = el.getAttribute('style') || '';
    const bw = (st.trim().match(/border-width:\s*([^;]+)/) || [])[1] || '';
    const parts = bw.trim().split(/\s+/);
    const bg = (st.match(/background(?:-color)?:\s*([^;]+)/) || [])[1] || '';
    const icon = el.querySelector('span[aria-hidden="true"]');
    const ist = icon ? icon.getAttribute('style') || '' : '';
    const iw = (ist.match(/width:\s*([^;]+)/) || [])[1] || '';
    const title = titleSpanOf(el);
    return [
      bg.trim(),
      parts.join(' '),
      iw.trim(),
      title ? title.textContent.trim() : null
    ].join('|');
  };
  const headSkeleton = (el) => {
    if (!el) return null;
    const sel = el.querySelector('.ant-select');
    const label = Array.from(el.querySelectorAll('span')).some((s) => s.textContent.trim() === '账期');
    return {
      hasSelect: !!sel,
      selectPlaceholder: sel ? norm(sel.textContent).indexOf('全部（累计）') >= 0 : false,
      hasScopeLabel: label,
      /* 账期下拉在标题右侧：DOM 顺序上，Select 出现在标题 span 之后 */
      selectAfterTitle: (() => {
        if (!sel) return false;
        const t = titleSpanOf(el);
        return !!(t && (t.compareDocumentPosition(sel) & 4));
      })(),
      buttonCount: el.querySelectorAll('button').length,
      buttons: Array.from(el.querySelectorAll('button')).map((b) => b.textContent.trim()),
      iconSize: el.querySelector('span[aria-hidden="true"]') ? true : false
    };
  };

  const sigDept = headSignature(byTestId('dept-bill-banner'));
  /* 详情页的骨架与文案必须**在切页前**取快照：goView 只改 hash，两页 DOM 不会共存，
     切过去之后再查 `dept-bill-banner` 只会拿到 null。 */
  const skelDept = headSkeleton(byTestId('dept-bill-banner'));
  const deptBarText = norm(byTestId('dept-bill-banner').textContent);
  await goView('billing/monthly');
  await tick(400);
  const sigOver = headSignature(byTestId('billing-month-scope'));
  check('v1.4.5：两页首屏条视觉签名完全一致（同底色 / 同左 4px 色条 / 同 36px 图标块 / 同 18px 标题）',
    !!sigDept && !!sigOver && sigDept.replace(/\|[^|]*$/, '') === sigOver.replace(/\|[^|]*$/, ''),
    `dept=${sigDept} / over=${sigOver}`);
  check('v1.4.5：两页首屏条控件骨架同构（账期标签 + 恰好 1 个下拉 + 下拉在标题右侧 + 36px 图标块）', (() => {
    const b = headSkeleton(byTestId('billing-month-scope'));
    const ok = (x) => x && x.hasSelect && x.selectPlaceholder && x.hasScopeLabel && x.selectAfterTitle && x.iconSize;
    return ok(skelDept) && ok(b);
  })());
  /* 按钮数**不要求两页相同** —— 累计态的总览页刻意不给「发出/核销」动作
     （否则会一次性批量核销 8 个月且不可逆），详情页则固定有「返回总览」。
     这里只锁「按页面角色该有的按钮在位」，不是锁数量相等。 */
  check('v1.4.5：操作按钮按页面角色在位（详情页恒有「返回总览」；总览页累计态刻意无核销动作）', (() => {
    const b = headSkeleton(byTestId('billing-month-scope'));
    return !!skelDept && !!b &&
      skelDept.buttonCount === 1 && skelDept.buttons.join() === '返回总览' &&
      b.buttonCount === 0;
  })());
  check('v1.4.5：总览页首屏条已是一段式（账期口径并入副标题，不再另起一条）', (() => {
    const el = byTestId('billing-month-scope');
    if (!el) return false;
    const t = norm(el.textContent);
    /* 口径句原先在独立灰底条里；并入副标题后必然出现在首屏条内。
       反向判据**不能**用「body 里该句只出现 N 次」—— 趋势图的 cumulativeHint
       用的是同一句文案，天然多一次（实测 2 次），计数必然对不上。
       改判「首屏条之外不存在第二个口径条容器」：段数不增。 */
    const inBar = t.includes('当前为累计口径') || t.includes('当前为单月口径');
    const extraBars = Array.from(doc.querySelectorAll('div')).filter((d) => {
      if (d === el || el.contains(d) || d.contains(el)) return false;
      const st = d.getAttribute('style') || '';
      return /border-left:\s*3px solid/.test(st) &&
        norm(d.textContent).includes('账期') &&
        !!d.querySelector('.ant-select');
    });
    return inBar && extraBars.length === 0;
  })());
  /* 反向证明：两页的副标题措辞不同（「本页仅呈现 X」vs 全局口径），
     说明是同一个组件按页填充内容，而不是把一页硬编码成另一页。
     详情页文案取自切页前的快照（此时 DOM 已切走，不能现查）。 */
  check('v1.4.5：副标题按页填充而非硬编码同一句（两页文案不同）', (() => {
    const b = norm(byTestId('billing-month-scope').textContent);
    return deptBarText.includes('本页仅呈现') && !b.includes('本页仅呈现');
  })());
  await goView('billing/dept/D-RETAIL');
  await tick(400);

  /* —— 运维费用**没有**分摊 BU 列 —— */
  check('v1.4.3：详情页运维表**无**「分摊费用的BU清单」列（单部门下是同源重复）', (() => {
    const el = byTestId('billing-ops-floor');
    if (!el) return false;
    const cols = Array.from(el.querySelectorAll('thead th')).map((t) => t.textContent.trim());
    return cols.length === 5 && !cols.includes('分摊费用的BU清单');
  })());
  /* 反向证明条件化生效：先切回**总览页**，同一组件下分摊列应重新出现。
     不切页直接断言会因上下文仍是详情页而恒假 —— 这类「同组件不同参数」的
     断言必须显式切换上下文，否则测的其实不是想测的东西。 */
  await goView('billing/monthly');
  await tick(400);
  check('v1.4.3：总览页运维表**仍有**分摊 BU 列（两页口径有别，反向证明条件化生效）', (() => {
    const el = byTestId('billing-ops-floor');
    if (!el) return false;
    return Array.from(el.querySelectorAll('thead th')).map((t) => t.textContent.trim()).includes('分摊费用的BU清单');
  })());
  /* 切回详情页，供后续 4.4 段断言使用 */
  await goView('billing/dept/D-RETAIL');
  await tick(400);

  /* —— 部门维度：数据只含本部门 —— */
  check('v1.4.3：交付楼层只含本部门项目（BU 列全为零售/门店等该部门名称）', (() => {
    const el = byTestId('billing-delivery-floor');
    if (!el) return false;
    const cells = Array.from(el.querySelectorAll('tbody tr.ant-table-row')).map((r) => r.querySelectorAll('td')[3].textContent.trim());
    return cells.length > 0 && cells.every((v) => v && v.length <= 6);
  })());
  check('v1.4.3：详情页趋势图为部门口径（总额远小于全公司口径）', (() => {
    const el = byTestId('dept-bill-trend');
    if (!el) return false;
    const bars = Array.from(el.querySelectorAll('[data-testid^="billing-trend-2"]'));
    return bars.length > 0 && el.textContent.includes('月度费用趋势');
  })());

  /* ============ 5. 全局单号搜索 4 个前缀 ============ */
  await goView('budget/annual');
  // FY2027 的 DM → 《项目预算计划》下钻页（按部门定位）
  await globalSearch('DM-2027-0001');
  check(
    '搜索 DM-（FY2027）：跳转《项目预算计划》下钻页（按该 DM 所属部门 D-RETAIL 定位）',
    win.location.hash === '#/budget/project/D-RETAIL' && exists('budget-project-page')
  );
  // FY2026 的 DM 不属 2027 编制页（年份错配）→ 回退年度预算计划深链需求详情
  await globalSearch('DM-2026-0003');
  check(
    '搜索 DM-（FY2026）：年份错配 → 回退年度预算计划并深链需求详情',
    win.location.hash === '#/budget/annual/DM-2026-0003' && exists('budget-demand-drawer')
  );

  await globalSearch('BRD-2026-0101');
  check('搜索 BRD-：跳转需求受理并打开详情（含溯源链）', has('BRD 详情 · BRD-2026-0101') && exists('delivery-brd-drawer'));

  await globalSearch('CR-2026-0031');
  check('搜索 CR-：跳转变更管理并定位该单', blockHas('view-delivery-cr', '变更管理（CR）') && blockHas('view-delivery-cr', 'CR-2026-0031'));

  await globalSearch('BILL-202608-CRM');
  /* BILL-202608-CRM → 解析出部门 D-CRM 跳《部门账单详情页》，第 4 段带原账期 */
  check('搜索 BILL-：直达《部门账单详情页》（v1.4.3，从单号解析部门）',
    win.location.hash.startsWith('#/billing/dept/D-CRM') && exists('dept-bill-page'));
  /* ============ 5.1 预算消耗「查账」→《部门账单详情页》（v1.4.3） ============
     查账落点为**部门视角四板块**独立页（不再定位到单张账单），不自动开任何浮层。 */
  await goView('budget/consume');
  click(byTestId('budget-consume-check-D-RETAIL'));
  await tick(500);
  check('查账：直达《部门账单详情页》独立路由（参数为部门代码）',
    win.location.hash === '#/billing/dept/D-RETAIL' && exists('dept-bill-page'));
  check('查账：不自动打开任何浮层', doc.querySelectorAll('.ant-drawer').length === 0);
  check('查账：详情页四板块齐备（查账能力未丢失）',
    ['dept-bill-floor1', 'dept-bill-trend', 'billing-delivery-floor', 'billing-ops-floor'].every((f) => exists(f)));

  /* 详情页「返回总览」—— 部门筛选已移除，返回必须能找回本行（定位 ≠ 筛选）
     v1.6 P1-3：账期改由 URL 第 4 段（tail）承载后，定位部门挪到第 5 段（sub2），
       第 3 段（param）在本视图空闲，必须**留空**。累计态无账期段 ⇒ 第 4 段也空，
       故 URL 是**三个**斜杠：`#/billing/monthly///D-RETAIL`
       （解析结果 parts = [billing, monthly, '', '', 'D-RETAIL']）。
     教训：本条断言的注释原先把期望 URL 写成 `#/billing/monthly//D-RETAIL`
       （**两个**斜杠）—— 那是错的，实测解析为 param='' / tail='D-RETAIL'，
       定位部门会落进 tail（=账期位），月份下拉里出现一个叫 "D-RETAIL" 的账期。
       **少写一个斜杠不会报错，只会静默错位**，所以 URL 断言必须锁完整串。 */
  await goView('billing/dept/D-RETAIL');
  await tick(400);
  const backBtn = Array.from(doc.querySelectorAll('button')).find((b) => norm(b.textContent).includes('返回总览'));
  click(backBtn);
  await tick(500);
  check('v1.6 P1-3：详情页返回总览并定位本部门行（账期空 + 第 5 段定位）',
    win.location.hash === '#/billing/monthly///D-RETAIL' && !!doc.querySelector('[data-focus-row="true"]'));
  /* 反向证明：定位确实落在第 5 段（sub2），账期位（tail）保持为空 = 累计态。
     若错位到 tail，月份下拉会显示 'D-RETAIL' 这个不存在的账期。 */
  check('v1.6 P1-3：定位未污染账期位（累计态月份显示为「累计」而非部门代码）',
    !norm(byTestId('billing-monthly-table').textContent).includes('D-RETAIL待出账账期D-RETAIL'));
  check('v1.4.3：定位 ≠ 筛选 —— 仍显示全部 8 个部门（行数与合计不变）',
    doc.querySelectorAll('[data-testid^="billing-row-"]').length === 8);

  /* v1.6：单月态下返回须**带回该账期**（否则用户在总览建立的心智模型跨一次页就断） */
  await goView('billing/dept/D-RETAIL/2026-08');
  await tick(400);
  check('v1.6 P1-2：详情页从 URL 第 4 段读取账期（#.../D-RETAIL/2026-08）',
    exists('dept-bill-page') &&
      !!byTestId('dept-bill-month-filter') &&
      norm(byTestId('dept-bill-banner').textContent).includes('2026-08'));
  const backBtn2 = Array.from(doc.querySelectorAll('button')).find((b) => norm(b.textContent).includes('返回总览'));
  click(backBtn2);
  await tick(500);
  /* v1.6：单月态下返回须**带回该账期**（否则用户在总览建立的心智模型跨一次页就断）。
     段位 = [板块, 视图, param(空), 账期, 定位部门] ⇒ 两个斜杠。
     断言原先写 `#/billing/monthly/2026-08/D-RETAIL`（一个斜杠），
     那会把账期写进 param 位、定位部门写进 tail 位 ⇒ 月份下拉出现 "D-RETAIL"。 */
  check('v1.6 P1-2：单月态返回总览时账期仍为 2026-08（不回落累计态）',
    win.location.hash === '#/billing/monthly//2026-08/D-RETAIL' &&
      !!doc.querySelector('[data-focus-row="true"]'));
  /* 账期位（tail）确实是 2026-08、而非被定位部门顶掉 —— 反向证明段位没错位。
     账期文案在**页头首屏条**（BillingHeadBar）里，不在表格 DOM 内：
     早先误查 billing-monthly-table 的 textContent，恒 false。 */
  check('v1.6 P1-2：单月态返回后账期选择器显示 2026-08（定位部门未顶掉账期位）',
    norm(doc.body.textContent).includes('当前为单月口径：2026-08'));

  /* ============ 5.2 部门账单总览行内「查账」按钮（v1.4.3 新增） ============ */
  await goView('billing/monthly');
  await tick(400);
  check('v1.4.3：部门账单每行末尾有「查账」按钮（精确 8 个，非 0 非无穷）',
    doc.querySelectorAll('[data-testid^="billing-check-"]').length === 8);
  check('v1.4.3：部门账单表新增「操作」列（5 列）', (() => {
    const el = byTestId('billing-monthly-table');
    return el.querySelectorAll('thead th').length === 5;
  })());
  click(byTestId('billing-check-D-RETAIL'));
  await tick(500);
  check('v1.4.3：点行内「查账」→ 进《部门账单详情页》（非浮层）',
    win.location.hash === '#/billing/dept/D-RETAIL' && exists('dept-bill-page'));

  /* ============ 5.3 「消耗与对账」确已下线（v1.4.3 反向断言） ============ */
  check('v1.4.3：侧边栏已无「消耗与对账」入口', !norm(byTestId('sider-menu').textContent).includes('消耗与对账'));
  await goView('billing/reconcile');
  await tick(420);
  check('v1.4.3：旧 hash #/billing/reconcile → 重定向到对账单总览（不静默失败）',
    win.location.hash === '#/billing/monthly' && exists('billing-overview-floor1'));
  check('v1.4.3：已下线的对账校验区块确已消失（断言方向翻转：可达 → 消失）',
    !exists('billing-reconcile-checks'));
  await goView('billing/bill/BILL-202608-RETAIL');
  await tick(420);
  /* 旧 hash 走 LEGACY_VIEWS 转到 dept 视图；因 param 是 billId 而非 deptCode，
     详情页识别不到部门 → 渲染「未找到部门」兜底并提供返回按钮（**不静默失败**）。 */
  check('v1.4.3：旧 hash #/billing/bill/{billId} 不静默失败（重定向 + 可见兜底）',
    win.location.hash.startsWith('#/billing/dept') && has('未找到部门'));


  /* ============ 6. ⚙ 平台设置抽屉 4 页签 ============ */
  await goView('budget/annual');
  const settingsBtn = doc.querySelector('.anticon-setting').closest('button');
  click(settingsBtn);
  await tick(300);
  check('设置抽屉：标题「平台设置」', has('平台设置'));
  check('设置抽屉：4 个页签齐备（Tab 结构断言）', (() => {
    const tabs = Array.from(doc.querySelectorAll('.ant-drawer .ant-tabs-tab .ant-tabs-tab-btn')).map((e) => norm(e.textContent));
    return tabs.length === 4 && ['权限矩阵', '审批矩阵', '审计日志', '主数据总览'].every((x) => tabs.includes(x));
  })());
  const closeBtn = doc.querySelector('.ant-drawer-close');
  click(closeBtn);
  await tick(220);

  /* ============ 7. 旧 hash 行为 ============ */
  await goView('trace');
  check('旧 hash #/trace：进入 404（不静默失败）', has('页面不存在'));
  await goView('settings');
  win.dispatchEvent(new win.HashChangeEvent('hashchange'));
  await tick(260);
  check('旧 hash #/settings：重定向到默认落点（结构锚点 + hash）', exists('app-sider') && win.location.hash === '#/budget/annual');
  check('旧 hash #/settings：不再渲染旧「基础数据」页', !has('基础数据与计费规则') && !has('费率表（Rate Card）'));

  /* ============ 7.1 v0.3 已下线二级视图的重定向 ============ */
  await goView('budget/deptpool');
  await tick(300);
  check('旧 hash #/budget/deptpool：重定向到「预算消耗」', exists('budget-consume-table') && win.location.hash === '#/budget/consume');
  await goView('budget/bp');
  await tick(300);
  check('旧 hash #/budget/bp：重定向到「年度预算计划」', exists('budget-annual-table') && win.location.hash === '#/budget/annual');
  await goView('budget/plan');
  await tick(300);
  check('旧 hash #/budget/plan（Digital 整合规划）：重定向到「年度预算计划」', exists('budget-annual-table') && win.location.hash === '#/budget/annual');

  /* ============ 7.2 侧边栏交互 ============ */
  await goView('budget/annual');
  click(byTestId('sider-collapse'));
  await tick(200);
  check('侧边栏折叠：data-collapsed=true 且写入 localStorage', byTestId('app-sider').getAttribute('data-collapsed') === 'true' && win.localStorage.getItem('dkt.sider.collapsed') === 'true');
  click(byTestId('sider-collapse'));
  await tick(200);
  check('侧边栏展开：data-collapsed=false', byTestId('app-sider').getAttribute('data-collapsed') === 'false');
  /* v1.5：「未完成」组默认收起（不抢主流程注意力）。
     注意：组的展开态是 SiderNav 内部 state，前序用例若进过组内页面会把它置为展开，
     故这里先归零到收起态再断言「点标题可展开」—— 断言的是**可切换**，
     而非某一绝对状态，否则会被执行顺序污染。 */
  click(byTestId('sider-group-backlog'));
  await tick(200);
  const subAfterToggle = byTestId('sider-sub-backlog');
  const toggledTo = subAfterToggle ? subAfterToggle.style.display : 'missing';
  check('「未完成」组：组标题可切换展开/收起（二级项随之显隐）', (() => {
    if (!subAfterToggle) return false;
    /* 无论切到展开还是收起，DOM 里都应恰有 5 个二级入口 —— 收起用 display:none 隐藏而非卸载，
       这样点击/断言不依赖时序；同时验证 display 确实在两个值之间切换。 */
    return ['block', 'none'].includes(subAfterToggle.style.display) &&
      subAfterToggle.querySelectorAll('[data-testid^="sider-item-"]').length === 5;
  })(), `切换后 display=${toggledTo}`);
  /* 归零到展开态，供后续「点击二级项导航」用例使用 */
  if (toggledTo !== 'block') {
    click(byTestId('sider-group-backlog'));
    await tick(200);
  }
  check('「未完成」组展开后：组内恰 5 个二级入口', (() => {
    const sub = byTestId('sider-sub-backlog');
    return !!sub && sub.style.display === 'block' &&
      Array.from(sub.querySelectorAll('[data-testid^="sider-item-"]')).length === 5;
  })());
  click(byTestId('sider-item-billing-rules'));
  await tick(260);
  check('侧边栏二级项可导航', win.location.hash === '#/billing/rules' && exists('billing-rules-rate'));
  check('定位条：「未完成」组内页面带「未完成」前缀', (() => {
    const t = norm(byTestId('content-locator').textContent);
    return t.startsWith('未完成') && t.includes('计费规则');
  })());
  /* 进入组内页面后组必须仍处展开态（否则用户点完就"丢失"了当前位置） */
  check('「未完成」组内页：组保持展开以指示当前位置', byTestId('sider-sub-backlog').style.display === 'block');
  await goView('home');
  await tick(300);
  check('#/home 重定向到默认落点', win.location.hash === '#/budget/annual');
  await goView('trace');
  click(doc.querySelector('.ant-result-extra .ant-btn-primary'));
  await tick(260);
  check('404 返回按钮回到默认落点', win.location.hash === '#/budget/annual' && exists('budget-annual-table'));

  /* ============ 7.3 合法板块下的 URL 归一 ============ */
  await goView('budget');
  await tick(260);
  check('#/budget（无 view）→ 归一为 #/budget/annual', win.location.hash === '#/budget/annual' && exists('budget-annual-table'));
  await goView('billing');
  await tick(260);
  check('#/billing（无 view）→ 归一为 #/billing/monthly', win.location.hash === '#/billing/monthly');
  await goView('budget/zzz');
  await tick(260);
  check('#/budget/zzz（非法视图）→ 归一为 #/budget/annual 且不白屏', win.location.hash === '#/budget/annual' && exists('budget-annual-table') && doc.getElementById('root').textContent.length > 200);

  /* ============ 7.4 v1.1 ③ 系统运维预算独立页 ============ */
  await goView('budget/annual');
  await tick(200);

  // —— R4 改写后的断言 10 前置：D-HR 初始「未启动」→ 主表格「待出具」且无万元 ——
  const hrCellText = () => {
    const el = byTestId('budget-annual-cell-ops-D-HR');
    return el ? norm(el.textContent) : '';
  };
  const hrCellBefore = hrCellText();
  check(
    'v1.1③：初始 D-HR 未启动 —— 主表格「③」格为「待出具」且不含万元',
    hrCellBefore.includes('待出具') && !hrCellBefore.includes('万元'),
    hrCellBefore
  );

  // —— 断言 1：主表「③」格点击 → 独立页面（非浮层）——
  click(byTestId('budget-annual-cell-ops-D-RETAIL'));
  await tick(340);
  check(
    'v1.1③：点击 ③ 入口 → 独立页面（非浮层），URL 落在 #/budget/opsplan/D-RETAIL',
    exists('budget-ops-plan-page') && exists('budget-ops-table') && win.location.hash === '#/budget/opsplan/D-RETAIL'
  );
  // （P1-3 #3 改写）旧断言 `!exists('budget-annual-ops-drawer')` 恒真（testid 全站零命中）。
  // 有区分度的形态：点击 ③ 格这个**动作之后**，断言不存在**开启中**的 Drawer ——
  // 用 .ant-drawer-open（开启态类名）而非「.ant-drawer 不存在」：长流程中先前区块的
  // 已关闭 Drawer 在 jsdom 下可能滞留 DOM，按「存在与否」判会误报。
  check(
    'v1.1③：旧 OPS 浮层已移除 —— 点击 ③ 格后不存在开启中的 Drawer（.ant-drawer-open 为 null）',
    !doc.querySelector('.ant-drawer-open')
  );

  // —— 断言 3：只读明细表恰 5 列，列序锁定 ——
  check('v1.1③：明细表恰 5 列且列序锁定（系统名称|计费方式|单价|年度BU用量|年度总费用（万元））', (() => {
    const el = byTestId('budget-ops-table');
    if (!el) return false;
    const heads = Array.from(el.querySelectorAll('.ant-table-thead th'))
      .filter((e) => !e.classList.contains('ant-table-cell-scrollbar'))
      .map((e) => norm(e.textContent));
    return (
      heads.length === 5 &&
      heads.join('|') === ['系统名称', '计费方式', '单价', '年度BU用量', '年度总费用（万元）'].join('|')
    );
  })());

  // —— 断言 4：D-RETAIL 恒 3 行、金额倒序、首行门店 POS ——
  const opsRowsOf = () => byTestId('budget-ops-table').querySelectorAll('.ant-table-tbody tr.ant-table-row');
  check('v1.1③：D-RETAIL 明细恒 3 行，首行「门店 POS 与库存」（金额倒序）', (() => {
    if (!byTestId('budget-ops-table')) return false;
    const rows = opsRowsOf();
    return rows.length === 3 && norm(rows[0].textContent).includes('门店POS与库存');
  })());

  // —— 断言 6：恒等式同屏（单价 × 用量 = 费用，SYS-04 行）——
  check('v1.1③：D-RETAIL SYS-04 行恒等式同屏（0.42 元/单 × 17,200,567 单 = 722.4 万元）', (() => {
    const el = byTestId('budget-ops-table');
    if (!el) return false;
    const row = Array.from(el.querySelectorAll('.ant-table-tbody tr')).find((tr) =>
      norm(tr.textContent).includes('SYS-04')
    );
    if (!row) return false;
    const t = norm(row.textContent);
    const amt = byTestId('budget-ops-amount-SYS-04');
    return t.includes('0.42') && t.includes('17,200,567') && !!amt && norm(amt.textContent) === '722.4';
  })());

  // —— 断言 5：D-SVC 恒 2 行；固定年费行用量单位「份」、无百分比 ——
  await goView('budget/opsplan/D-SVC');
  await tick(280);
  check('v1.1③：D-SVC 明细恒 2 行且含「客服工单系统」；固定年费行用量单位为「份」、不出现 %', (() => {
    if (!byTestId('budget-ops-table')) return false;
    const rows = Array.from(opsRowsOf());
    if (rows.length !== 2) return false;
    const fixedRow = rows.find((tr) => norm(tr.textContent).includes('固定年费'));
    if (!fixedRow) return false;
    const t = norm(fixedRow.textContent);
    return t.includes('客服工单系统') && t.includes('份') && !t.includes('%');
  })());

  // —— 断言 7：D-HR 未启动 →「编制预估」→ /new 编辑视图 ——
  await goView('budget/opsplan/D-HR');
  await tick(280);
  check('v1.1③：D-HR 未启动 → 页头主按钮为「编制预估」（budget-ops-start）', exists('budget-ops-start'));
  click(byTestId('budget-ops-start'));
  await tick(340);
  check(
    'v1.1③：点击「编制预估」→ 进入 /new 编辑视图，草稿动作齐备（保存/提交）',
    win.location.hash === '#/budget/opsplan/D-HR/new' && exists('budget-ops-submit') && exists('budget-ops-save')
  );

  // —— 断言 8：改「年度 BU 用量」→ 同行「年度总费用」即时联动（行内缓冲，不落库）——
  const usageWrap = doc.querySelector('[data-testid^="budget-ops-usage-"]');
  const hrSysId = usageWrap ? usageWrap.getAttribute('data-testid').replace('budget-ops-usage-', '') : '';
  const hrAmountText = () => {
    const el = byTestId(`budget-ops-amount-${hrSysId}`);
    return el ? norm(el.textContent) : '';
  };
  const amt0 = hrAmountText();
  // antd InputNumber 会把 data-* 透传到内层 <input>：testid 命中的可能就是 input 本身
  const inputOf = (id) => {
    const el = byTestId(id);
    return el && el.tagName === 'INPUT' ? el : el && el.querySelector('input');
  };
  setValue(win, inputOf(`budget-ops-usage-${hrSysId}`), '999');
  await tick(180);
  const amt1 = hrAmountText();
  check(
    'v1.1③：编辑态改「年度 BU 用量」→ 同行「年度总费用」即时联动（费用恒 = 单价 × 用量，不可编辑）',
    !!amt0 && !!amt1 && amt1 !== amt0,
    `before=${amt0} after=${amt1}`
  );

  // —— 断言 9：改「单价」→ 费用再次联动 ——
  setValue(win, inputOf(`budget-ops-rate-${hrSysId}`), '1');
  await tick(180);
  const amt2 = hrAmountText();
  check(
    'v1.1③：编辑态改「单价」→ 同行「年度总费用」再次联动',
    !!amt1 && !!amt2 && amt2 !== amt1 && amt2 !== amt0,
    `after=${amt2}`
  );

  // —— 断言 10（R4 改写）：提交 → 主表格由「待出具+无万元」变为「含万元+待业务确认」——
  click(byTestId('budget-ops-submit'));
  await tick(320);
  const noteTitle = doc.querySelector('.ant-modal .ant-modal-title');
  check('v1.1③：提交预算弹出变更说明浮层（标题「提交预算」）', !!noteTitle && norm(noteTitle.textContent) === '提交预算');
  click(doc.querySelector('.ant-modal-footer .ant-btn-primary'));
  await tick(340);
  await goView('budget/annual');
  await tick(260);
  const hrCellAfter = hrCellText();
  check(
    'v1.1③（R4 改写）：D-HR 提交后主表格由「待出具+无万元」变为「含万元+待业务确认」（万元=草稿合计 5.7）',
    hrCellBefore.includes('待出具') &&
      hrCellAfter.includes('待业务确认') &&
      hrCellAfter.includes('5.7万元') &&
      !hrCellAfter.includes('待出具'),
    `before=${hrCellBefore} after=${hrCellAfter}`
  );

  // —— 断言 11 前置：D-ECOM 进行中版本（待业务复核确认态）——
  await goView('budget/opsplan/D-ECOM/new');
  await tick(300);
  check(
    'v1.1③：D-ECOM 进行中版本为「待业务复核确认」态，提供「业务复核确认」入口',
    exists('budget-ops-confirm') && blockHas('budget-ops-inprogress', '待业务复核确认')
  );
  click(byTestId('budget-ops-confirm'));
  await tick(320);
  check('v1.1③：确认前弹出复核确认对话框', !!doc.querySelector('.ant-modal-confirm'));
  click(doc.querySelector('.ant-modal-confirm .ant-btn-primary'));
  await tick(420);
  check(
    'v1.1③：确认后回到正式版本视图（草稿写回、编辑动作不再出现）',
    win.location.hash === '#/budget/opsplan/D-ECOM' && exists('budget-ops-plan-page') && !exists('budget-ops-save')
  );

  // —— 断言 12：流水含确认后新版本号（V1.0）与「业务复核确认」动作 ——
  check(
    'v1.1③：D-ECOM 统一流水含确认后新版本号（V1.0）与「业务复核确认」动作文案',
    blockHas('budget-ops-timeline', 'V1.0') && blockHas('budget-ops-timeline', '业务复核确认')
  );

  // —— 断言 13：版本行「查看明细」→ 版本明细浮层 ——
  const detailBtn = Array.from(byTestId('budget-ops-timeline').querySelectorAll('button')).find((b) =>
    norm(b.textContent).includes('查看明细')
  );
  click(detailBtn);
  await tick(320);
  check(
    'v1.1③：点击「查看明细」→ 版本明细浮层（含本版合计）',
    exists('budget-ops-version-drawer') && blockHas('budget-ops-version-drawer', '本版合计')
  );

  // —— 断言 11：主表格 D-ECOM 由「待业务确认」变「已确认」——
  await goView('budget/annual');
  await tick(260);
  const ecomCell = byTestId('budget-annual-cell-ops-D-ECOM');
  const ecomText = ecomCell ? norm(ecomCell.textContent) : '';
  check(
    'v1.1③：D-ECOM 复核确认后主表格由「待业务确认」变为「已确认」',
    ecomText.includes('已确认') && !ecomText.includes('待业务确认'),
    ecomText
  );

  // —— P0-1 / P0-2 / P1-3#18 写回守护：D-MKT（预置编制中草稿）真编辑态全流程 ——
  //   编辑（改用量 8888）→ 保存草稿 → 提交预算（同分钟）→ 业务复核确认 → 只读页写回校验
  await goView('budget/opsplan/D-MKT/new');
  await tick(300);
  check(
    'v1.1③：D-MKT 预置「编制中」草稿 → /new 真编辑态（保存/提交动作齐备）',
    win.location.hash === '#/budget/opsplan/D-MKT/new' && exists('budget-ops-save') && exists('budget-ops-submit')
  );
  const mktUsageWrap = doc.querySelector('[data-testid^="budget-ops-usage-"]');
  const mktSysId = mktUsageWrap ? mktUsageWrap.getAttribute('data-testid').replace('budget-ops-usage-', '') : '';
  const mktAmountText = () => {
    const el = byTestId(`budget-ops-amount-${mktSysId}`);
    return el ? norm(el.textContent) : '';
  };
  const mktAmtBefore = mktAmountText();
  const mktTlRowsBefore = byTestId('budget-ops-timeline').querySelectorAll('.ant-table-tbody tr.ant-table-row').length;
  setValue(win, inputOf(`budget-ops-usage-${mktSysId}`), '8888');
  await tick(180);
  // P0-1：编辑态概览卡随草稿缓冲联动且标注「草稿」口径 —— 卡片金额 = 表底合计（一个真相源）
  check(
    'v1.1③（P0-1）：编辑态概览卡标注「年度总费用（草稿）」且与表底合计同源联动',
    (() => {
      const ov = byTestId('budget-ops-overview');
      const tbl = byTestId('budget-ops-table');
      if (!ov || !tbl) return false;
      // 结构守护：概览区恰 2 张 md-12 卡（「计费口径」卡已并入脚注，不允回潮成 3 卡）
      if (ov.querySelectorAll('.ant-col-md-12').length !== 2) return false;
      if (!norm(ov.textContent).includes('年度总费用（草稿）')) return false;
      const m = norm(tbl.textContent).match(/合计([\d,.]+)万元/);
      return !!m && norm(ov.textContent).includes(m[1]);
    })()
  );
  // 保存草稿（缓冲落 store）→ 提交预算：两动作同一分钟（nowStr 只到分钟），流水必须 +2 不吞行。
  // 注意：长流程中先前浮层在 jsdom 下可能未卸载，querySelector 会命中陈旧容器 ——
  // 一律取**最后一个**匹配（最新挂载的浮层），必要时校验标题。
  const lastModalOk = (titleText) => {
    const modals = Array.from(doc.querySelectorAll('.ant-modal'));
    const pool = titleText
      ? modals.filter((m) => norm((m.querySelector('.ant-modal-title') || {}).textContent || '') === titleText)
      : modals;
    const target = pool[pool.length - 1];
    click(target && target.querySelector('.ant-modal-footer .ant-btn-primary'));
  };
  const lastConfirmOk = () => {
    const confirms = doc.querySelectorAll('.ant-modal-confirm');
    const target = confirms[confirms.length - 1];
    click(target && target.querySelector('.ant-btn-primary'));
  };
  click(byTestId('budget-ops-save'));
  await tick(320);
  lastModalOk('保存草稿');
  await tick(340);
  click(byTestId('budget-ops-submit'));
  await tick(320);
  lastModalOk('提交预算');
  await tick(360);
  const mktTlRowsAfter = byTestId('budget-ops-timeline').querySelectorAll('.ant-table-tbody tr.ant-table-row').length;
  check(
    'v1.1③（P0-2）：同分钟「保存草稿」+「提交预算」→ 流水 +2（按事件身份去重，不再按时间戳静默吞行）',
    mktTlRowsAfter === mktTlRowsBefore + 2,
    `before=${mktTlRowsBefore} after=${mktTlRowsAfter}`
  );
  // #18 写回守护：确认后只读页必须显示编辑后的新值（杀「得号但不落明细」变异）
  click(byTestId('budget-ops-confirm'));
  await tick(320);
  check('v1.1③：D-MKT 确认前弹出复核确认对话框', !!doc.querySelector('.ant-modal-confirm'));
  lastConfirmOk();
  await tick(460);
  await goView('budget/opsplan/D-MKT');
  await tick(300);
  const mktRow = byTestId('budget-ops-table')
    ? Array.from(byTestId('budget-ops-table').querySelectorAll('.ant-table-tbody tr')).find((tr) =>
        norm(tr.textContent).includes(mktSysId)
      )
    : null;
  const mktAmtAfter = mktAmountText();
  check(
    'v1.1③（#18 写回守护）：确认后只读页该系统行显示编辑后的新值（用量 8,888 · 金额 = 草稿写回）',
    !!mktRow && norm(mktRow.textContent).includes('8,888') && !!mktAmtAfter && mktAmtAfter !== mktAmtBefore,
    `sysId=${mktSysId} before=${mktAmtBefore} after=${mktAmtAfter}`
  );

  // —— 断言 14（P1-3 #21 改写）：零 antd 废弃告警 ——
  //   运行期：版本明细浮层（断言 13 已打开）与 /new 编辑态（D-HR / D-MKT 均已进入）都已走过，
  //   errors 收集按 v1.0 既有机制（console.warn / console.error / jsdomError）。
  //   静态扫描：prod 构建会剥离 antd 运行期告警，运行期收集对「往源码注入 destroyOnClose」
  //   的变异天然不敏感（变异实测仍 PASS）—— 故补 src/**/*.jsx? 的静态扫描（跳过注释行）。
  const deprecation = errors.filter((s) => /deprecated|废弃|Warning: |antd:/i.test(s));
  const walkFiles = (dir) =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .flatMap((e) => {
        const p = path.join(dir, e.name);
        return e.isDirectory() ? walkFiles(p) : /\.jsx?$/.test(e.name) ? [p] : [];
      });
  const scanDeprecation = () =>
    walkFiles(path.join(ROOT, 'src'))
      .map((p) => {
        // 剥离块注释（含 JSX 行内 {/* ... */}）与行注释 —— 注释里的「禁用 destroyOnClose」不算用例
        const code = fs
          .readFileSync(p, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .split('\n')
          .filter((l) => !/^\s*\/\//.test(l))
          .join('\n');
        return { p, bad: /destroyOnClose|destroyHidden|visible=\{/.test(code) };
      })
      .filter(({ bad }) => bad);
  const deprecationStatic = scanDeprecation();
  check(
    'v1.1③：零 antd 废弃告警 —— 运行期零捕获 + src 源码静态扫描零 destroyOnClose/destroyHidden/visible',
    deprecation.length === 0 && deprecationStatic.length === 0,
    [...deprecation.slice(0, 2), ...deprecationStatic.slice(0, 2).map(({ p }) => p)].join(' | ')
  );

  /* ============ 7.4 站点说明书（v1.7 新增，侧边栏独立页） ============ */
  await goView('manual/guide');
  await tick(420);

  check('v1.7：路由 #/manual/guide 渲染《站点说明书》',
    win.location.hash === '#/manual/guide' && exists('manual-page'));

  /* 定位条：说明书是**顶层页**（已交付），不得被加上「未完成」前缀。
     这条锁的是 isTopLevelView —— 若有人改回只判 isFlatView，说明书会被误标成规划中。 */
  check('v1.7：定位条为「站点说明书」且不带「未完成」前缀', (() => {
    const t = norm(byTestId('content-locator').textContent);
    return t.includes('站点说明书') && !t.includes('未完成');
  })());

  /* 三章齐备 —— 对应需求里的三部分内容 */
  check('v1.7：三章齐备（三大能力板块 / 角色与场景 / 后续规划）',
    ['manual-sec-blocks', 'manual-sec-roles', 'manual-sec-roadmap'].every((id) => exists(id)));

  /* 第一章：三大板块各有专卡，且含状态机 / 口径 / 恒等式表 */
  check('v1.7 第一章：三大能力板块各有专卡（年度预算计划 / 预算消耗 / 对账单）',
    ['manual-block-annual', 'manual-block-consume', 'manual-block-billing'].every((id) => exists(id)));
  check('v1.7 第一章：含需求清单与运维两套状态机 + 三重口径表 + 恒等式自检表', (() => {
    const need = ['manual-demand-sm', 'manual-ops-sm', 'manual-pool-table', 'manual-identity-table', 'manual-bill-state-table'];
    if (!need.every((id) => exists(id))) return false;
    // 状态机表必须有实际行数（防止渲染成空表也算通过）
    const rows = (id) => byTestId(id).querySelectorAll('tbody tr.ant-table-row').length;
    return rows('manual-demand-sm') >= 8 && rows('manual-ops-sm') >= 5 && rows('manual-identity-table') >= 4;
  })());

  /* 第二章：角色表 + 交接表；两个角色各有专卡 */
  check('v1.7 第二章：两个角色各有专卡（业务部门 / Digital）',
    ['manual-role-biz', 'manual-role-digital'].every((id) => exists(id)));
  check('v1.7 第二章：含角色总览表与协作交接表（交接表 ≥7 次交接）', (() => {
    if (!exists('manual-role-table') || !exists('manual-handoff-table')) return false;
    const roleRows = byTestId('manual-role-table').querySelectorAll('tbody tr.ant-table-row').length;
    const handoffRows = byTestId('manual-handoff-table').querySelectorAll('tbody tr.ant-table-row').length;
    return roleRows === 2 && handoffRows >= 7;
  })());
  /* 诚实性：必须显式说明"当前无角色鉴权"，否则文档会让人误以为权限已实现 */
  check('v1.7 第二章：显式声明「尚未实现登录与角色鉴权」', (() => {
    const t = norm(byTestId('manual-sec-roles').textContent);
    return t.includes('尚未实现登录与角色鉴权') || t.includes('尚未实现登录与角色鉴权');
  })());

  /* 第三章：待实现板块 / 阶段目标 / 待办清单 */
  check('v1.7 第三章：含待实现板块表、阶段目标表、待办与依赖表', (() => {
    const need = ['manual-roadmap-next', 'manual-phase-table', 'manual-pending-table'];
    if (!need.every((id) => exists(id))) return false;
    const rows = (id) => byTestId(id).querySelectorAll('tbody tr.ant-table-row').length;
    return rows('manual-roadmap-next') === 5 && rows('manual-phase-table') === 5 && rows('manual-pending-table') >= 10;
  })());
  /* 优先级/依赖关系是需求明确要求的内容 —— 断言正文里真的出现了依赖描述 */
  check('v1.7 第三章：明确给出优先级与依赖关系（含「前置」表述）', (() => {
    const t = norm(byTestId('manual-sec-roadmap').textContent);
    return t.includes('依赖') && (t.includes('前置') || t.includes('串行'));
  })());

  /* 关键回归：章节跳转按钮**不得改变 hash** ——
     说明书用的是 scrollIntoView，一旦有人改成 <a href="#id">，
     hash 路由会被锚点劫持（点目录即离开当前页）。
     注意只取 manual-toc-jump-* —— 目录卡里还有「快捷入口」按钮，
     那两个**本来就该**导航（跳到业务页），把它们算进来会误判。 */
  check('v1.7：目录章节跳转不改变 hash（未劫持 hash 路由）', (() => {
    const before = win.location.hash;
    const btns = ['一', '二', '三'].map((n) => byTestId(`manual-toc-jump-${n}`));
    if (btns.some((b) => !b)) return false;
    btns.forEach((b) => b.dispatchEvent(new win.MouseEvent('click', { bubbles: true })));
    return win.location.hash === before && exists('manual-page');
  })());

  /* 渲染质量：数据串里的 `**强调**` 必须被渲染成 <strong>，不能留字面星号 */
  check('v1.7：正文零字面 markdown 残留（无 ** 与 ##）', (() => {
    const t = norm(byTestId('manual-page').textContent);
    return !t.includes('**') && !t.includes('##');
  })());
  check('v1.7：数据串中的强调已渲染为 <strong> 元素', (() => {
    const sec = byTestId('manual-sec-roadmap');
    return !!sec && sec.querySelectorAll('strong').length > 0;
  })());

  /* 侧边栏入口：独立档，不计入「3 平铺」、也不属于「未完成」组 */
  check('v1.7：侧边栏有「站点说明书」独立入口（不与三平铺混算、不在「未完成」组内）', (() => {
    const m = byTestId('sider-manual');
    if (!m || !norm(m.textContent).includes('站点说明书')) return false;
    const flats = doc.querySelectorAll('[data-testid^="sider-flat-"]').length;
    const items = Array.from(doc.querySelectorAll('[data-testid^="sider-item-"]'));
    return flats === 3 && items.length === 5 && !items.some((e) => norm(e.textContent).includes('站点说明书'));
  })());

  /* 深链归一：缺视图段 / 非法视图都要落到 guide，且不静默 404 */
  for (const bad of ['manual', 'manual/nope']) {
    await goView(bad);
    await tick(360);
    check(`v1.7：深链 #/${bad} 归一到 #/manual/guide（不 404）`,
      win.location.hash === '#/manual/guide' && exists('manual-page'));
  }


  /* ============ 8. 零错误 ============ */
  check('运行期无 console 错误 / React 警告', errors.length === 0, errors.slice(0, 5).join(' | '));

  /* ---------- 输出 ---------- */
  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok);
  console.log('');
  results.forEach((r) => {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : '  << ' + r.detail}`);
  });
  console.log(`\n${pass}/${results.length} 通过`);
  if (errors.length) {
    console.log('\n--- 捕获到的错误 ---');
    errors.slice(0, 10).forEach((e) => console.log(e));
  }
  dom.window.close();
  process.exit(fail.length ? 1 : 0);
}

main().catch((e) => {
  console.error('测试脚本异常：', e);
  process.exit(1);
});
