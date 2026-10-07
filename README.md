# DKT Digital Budget · 迪卡侬中国数字化项目预算管理平台

面向迪卡侬中国数字化团队的**预算计划与消耗核算 Demo**。纯前端单页应用，React 18 + Ant Design 5 + Vite 5，数据为本地 mock（`src/data/mock.js`），无后端依赖，可离线运行。

---

## 快速开始

```bash
npm install
npm run dev        # 开发模式，默认 http://localhost:5173
npm run build      # 构建到 dist/
```

构建产物 `dist/index.html` 可直接双击打开（Vite 已配置为相对路径 + 非 module 入口）。

---

## 三大核心能力

| 板块 | 定位 | 入口路由 |
| --- | --- | --- |
| **年度预算计划** | 需求提出、版本核定、需求池管理；区分项目侧与运维侧 | `#/annual/*` |
| **预算消耗** | 部门维度消耗追踪、超支档位预警、全年累计 | `#/budget/consume` |
| **对账单** | 月度/部门出账、核销确认、待出具口径管理 | `#/billing/*` |

侧边栏底部另有独立页面 **站点说明书**（`#/manual/guide`），作为站点整体的统一说明文档，涵盖能力板块、使用角色与场景、后续规划三部分。

---

## 目录结构

```
src/
  domain/          业务领域层（单一出处）
    calc.js        全部口径与计算函数
    routes.js      hash 路由拼接（禁止手拼字符串）
  pages/           页面组件
    AnnualPlanPage / BudgetModule / BillingModule
    DeptBillPage / ManualPage
  components/      复用组件（SiderNav / BillFloors / …）
  data/mock.js     mock 数据源（INITIAL_DATA）
  theme.js         语义化 token 别名 + 对比度达标色板
  navConfig.js     导航配置单一出处
tests/
  smoke.cjs              313 条运行时冒烟断言（jsdom 读 dist）
  smoke-singlefile.cjs    32 条单文件产物断言
docs/              各版本设计/需求/评审文档（v0.2 → v1.6）
scripts/           构建脚本、数据校验、探针
```

---

## 工程约定

以下约定为项目既定决策，修改前需评估影响面：

1. **口径单一出处**：同一业务事实禁止多条取数路径。金额一律从 `src/domain/calc.js` 的具名函数取，视图内不自行累加。
2. **路由统一构造**：所有 hash 跳转走 `src/domain/routes.js`，手拼字符串会因连续斜杠语义导致段位静默错位。
3. **导航单一出处**：`src/navConfig.js` 为侧边栏与路由映射的唯一来源。
4. **色值禁止字面量**：颜色一律经 `useT()` 语义 token 取，禁止在组件内写 hex。
5. **金额单位统一为万元**。
6. **楼层编号已下线**，不再引入。

---

## 测试

```bash
npm run build
node tests/smoke.cjs
node tests/smoke-singlefile.cjs
```

冒烟测试直接加载 `dist` 产物并做运行时断言，覆盖：口径恒等式（`Σ列 = Σ合计`）、反向证明（排除项不得混入）、排序单调性、WCAG AA 对比度白名单、文案指纹（含负向指纹）。**每次改动 UI 后必须先 `npm run build` 再跑测试**，否则测的是旧产物。

---

## 版本

当前版本 **v0.9**。版本演进与设计决策详见 `docs/` 目录下对应文档。
