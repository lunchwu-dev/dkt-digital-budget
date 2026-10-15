# 技术架构与实现方案 · DKT Digital Budget

| 项目 | 说明 |
|---|---|
| 文档版本 | v1.7 |
| 编制日期 | 2026-10-15 |
| 对应代码 | `main` / `f9a7b96` |
| 技术栈 | React 18.3 + Ant Design 5.21 + Vite 5 + dayjs，零后端依赖 |
| 关联文档 | [`PRODUCT-SPEC.md`](./PRODUCT-SPEC.md)、根目录 `DESIGN.md` |

---

## 1. 架构总览

### 1.1 分层

```
┌─────────────────────────────────────────────────────────────┐
│  展示层  pages/*  components/*                ~7.9k 行     │
│  预算计划 / 消耗 / 对账 / 详情 / 说明书 / 复用组件            │
├─────────────────────────────────────────────────────────────┤
│  状态层  store.jsx  (React Context + useReducer 语义)        │
│  data（唯一可变状态）· globalFy · auditLog · 32 个动作       │
├─────────────────────────────────────────────────────────────┤
│  领域层  domain/calc.js  domain/routes.js     ~1.7k 行     │
│  ★ 全部口径与计算函数的唯一出处                             │
├─────────────────────────────────────────────────────────────┤
│  配置层  navConfig.js  theme.js  data/mock.js  ~1.6k 行     │
│  导航单一出处 · 语义 token · 确定性 mock 数据集              │
└─────────────────────────────────────────────────────────────┘
                              ↓
                   data/mock.js  INITIAL_DATA（内存态）
```

**依赖方向严格单向向下**：`pages → store → domain`，`domain` 不 import 任何 React 组件。这保证领域函数可被 Node 侧脚本（探针、数据校验）直接复用。

### 1.2 代码规模

| 层 | 文件 | 行数 |
|---|---|---|
| 页面 | `pages/*`（8 个） | 7.9k |
| 领域 | `domain/calc.js` 1615 + `routes.js` 41 | 1.7k |
| 状态 | `store.jsx` | 1.1k |
| 数据 | `data/mock.js` | 1.3k |
| 组件 | `components/*` | 1.8k |
| 配置 | `navConfig.js` + `theme.js` | 0.2k |
| 测试 | `tests/smoke.cjs` 2586 + `smoke-singlefile.cjs` 232 | 2.8k |
| **合计（不含 dist/node_modules）** | | **≈17.1k** |

---

## 2. 六大工程约定（改前必读）

这六条是项目已定决策，修改前需评估影响面。它们不是风格偏好，每条都对应一个已发生过的真实故障。

### 2.1 口径单一出处（`domain/calc.js`）

同一业务事实禁止多条取数路径。合计行与明细列**都从同一函数取数**，视图内不自行累加。

> 反例后果：卡片合计与列内可见值对不上，且往往到重构合计行时才暴露。

### 2.2 路由统一构造（`domain/routes.js`）

所有 hash 跳转走具名函数。部门账单总览的段位契约是 `板块/视图/param/tail/sub2`，其中 `param` 位空闲 —— 手拼斜杠极易少写一个：

```
#/billing/monthly/2026-08/D-RETAIL   → 少写空段
  实际解析：param='2026-08', tail='D-RETAIL'
  后果：月份下拉里出现一个叫「D-RETAIL」的账期（已实测复现）
```

正确形式由 `billingMonthlyHash()` 统一产出，有定位部门时必须写满 5 段。

### 2.3 导航单一出处（`navConfig.js`）

`FLAT_ITEMS` / `BACKLOG_GROUP` / `MANUAL_ITEM` 是侧边栏与定位条的唯一来源。`App.jsx` 内的 `NAV` 仅用于**路由合法性判定**，不驱动渲染 —— 两者职责已分离。

### 2.4 色值禁止字面量

颜色一律经 `useT()` 语义 token 取，组件内禁止写 hex。`theme.js` 中仅有的三个例外均已注释说明出处（`successTextStrong` / `warningTextStrong` / `meterCommitted`）。

### 2.5 金额单位统一为万元（展示层）

存储用元，格式化统一走 `fmtWan / fmtYuan / fmtPct / signedPct`，视图内不手写 `toFixed(1)`。

### 2.6 楼层编号已下线

历史版本曾有楼层编号机制，v1.2 起彻底移除，不再引入。

---

## 3. 领域层设计（`domain/calc.js`）

### 3.1 模块划分

| 区块 | 内容 | 关键导出 |
|---|---|---|
| 格式化 | 万元 / 元 / 数值 / 百分比 | `fmtWan` `fmtYuan` `fmtNum` `fmtPct` `signedPct` |
| 费率 | 按角色取费率、人天金额、合计 | `rateOf` `mdAmount` `mdTotal` |
| BRD 金额 | 评估价 / CR 增量 / 最终价 / 实际价 | `brdEvalAmount` `brdCRDelta` `brdFinalAmount` `brdActualAmount` |
| 运维计量 | 业务量、计费行金额（order/member/fixed 三型） | `opVolume` `opsLineAmount` |
| 账单 | 状态判定、账单构建、月度汇总 | `isConfirmed` `billStateOf` `buildBill` `buildBillsForMonth` `monthDeptTotal` |
| 预算池 | 档位判定、池状态、汇总 | `POOL_LEVEL` `poolLevel` `poolState` `poolSummary` |
| 溯源 | BRD / 需求溯源链 | `traceOfBrd` `traceOfDemand` |
| 年度计划 | 编制行、ROI、跨年影响 | `annualPlanRow` `annualPlanRows` `roiOf` `crossYearImpact` `dashboardKpi` |
| 消耗 | 截至当月累计、四段拆解 | `consumptionUpTo` `consumptionBreakdown` |
| BP 版本 | 版本链、文档、汇总态、次版本号派生 | `bpVersionsOf` `bpDocsOf` `bpSummaryStateOf` `nextMinorVersion` |
| 交付账单行 | 交付 / 运维账单行 | `deliveryBillRows` `opsBillRows` |

### 3.2 确定性伪随机

运维业务量必须「同一月份任意次打开数值一致」，否则评审截图对不上。

```js
export function seeded(seed) { /* LCG: s = s*1664525 + 1013904223 */ }
function fnv1a(str) { /* 字符串哈希 */ }

opVolume(systemId, deptCode, month)
  = base × SEASON[mi] × noise    // noise ∈ [0.96, 1.04]
  并按 50 取整
SEASON = [.86,.82,.95,.98,1.02,1.08,1.04,1.0,1.06,1.1,1.12,1.18]
```

种子 = `fnv1a(\`${systemId}|${deptCode}\`)`，与月份无关 —— 同系统同部门同月恒等。

### 3.3 版本号派生而非自算

`nextMinorVersion(versions)` 是当前版本号的唯一来源。废弃某版本后「当前版本」由剩余历史重算，不在前端自算，避免出现与历史不一致的版本号。

### 3.4 排序比较器必须构成合法全序

```js
// ❌ 非法：相等键返回 -1
(a, b) => (a.k < b.k ? 1 : -1)
// ✅ 正确：显式 tie-breaker
(a, b) => (a.k < b.k ? 1 : a.k > b.k ? -1 : a.id - b.id)
```

排序键精度不足（如时间只到分钟）时，非法比较器会让同值元素次序不稳定，「列表首行 = 最新」这类语义直接失效。

---

## 4. 状态层设计（`store.jsx`）

### 4.1 形态

React Context + `useState`（函数式更新保证函数式不可变），无 Redux。

```jsx
<ConfigProvider>        // 品牌 VI token
  <AntApp>              // antd 静态方法上下文（message/modal）
    <StoreProvider>     // data + globalFy + auditLog + actions
      <App />           // Layout + hash 路由 + 全局能力
```

### 4.2 对外接口

```js
const { data, derived, auditLog, log, globalFy, setGlobalFy, ...actions } = useStore()
const calc = useStore().calc   // 等价于 import * as C from './domain/calc.js'
```

### 4.3 动作清单（32 个）

| 域 | 动作 |
|---|---|
| 预算期 · BP | `updateBpRecord` `discardBpVersion` `planAction(stage:'BP')` |
| 预算期 · 需求 | `startDraft` `saveDraft` `submitDraft` `evaluateDraft` `confirmDraft` `rejectDraft` `discardDraft` `withdrawDraft` `updateDemand`（存量兼容） |
| 预算期 · 运维 | `startOpsDraft` `saveOpsDraft` `submitOpsDraft` `confirmOpsDraft` `rejectOpsDraft` `discardOpsDraft` |
| 交付 | `submitBRD` `startEvaluation` `signOffBRD` `addCR` `deliverBRD` `rejectBRD` |
| 账单 | `confirmMonths` `sendMonths` |
| 通用 | `log` `mkActivity` |

### 4.4 写操作三条铁律

1. **一切写操作落活动记录**：`planActivities` 记编制域，`auditLog` 记全局操作。无遗漏。
2. **正式数据的唯一写回点**：正式 `demands` 只由 `confirmDraft` 写回。`updateDemand` 仅为存量兼容保留，主流程不用。
3. **不可逆动作必须留痕**：`discardBpVersion` / `discardDraft` / `discardOpsDraft` 均同步写 activity。

### 4.5 AI 摘要的异步回填

提交类动作在 `setData` 函数式更新内按 id 收集待回填项，提交后**统一调度一次**（`BP_AI_SUMMARY_DELAY = 1200ms`）。避免在渲染期发定时器导致 StrictMode 下双触发。

---

## 5. 展示层

### 5.1 路由机制

```
#/{module}/{view}/{param}/{tail}/{sub2}
```

- `useHashRoute()` 解析 `?` 之前的部分，query 丢弃。
- `MODULE_VIEWS` 登记表 —— **新视图必须登记**，否则 `noOrInvalidView` 守卫会判定非法视图并 `window.location.replace` 静默重定向回默认页（用户看不到任何报错，深链参数直接丢失）。
- `LEGACY_VIEWS` / `LEGACY_SEGS`：旧 hash 一次性提示后重定向，不静默失败。

> 侧边栏 + 定位条对「未完成」的判断走 `navConfig.js` 的 `isTopLevelView()`，不能用 `isFlatView()` —— 后者会让已交付的「站点说明书」被加上「未完成 ›」前缀，与身份矛盾。

### 5.2 布局响应式（已踩坑记录）

`antd Layout` 的 flex 子项默认 `min-width: auto`，窄视口下整页横向溢出；若外层还有 `Watermark` / `overflow:hidden`，溢出部分会被**直接裁掉且滚不到**，表格 `fixed:'right'` 列随之失效。修法：给内层 `Layout` 与 `Content` 加 `minWidth: 0`，让溢出**降级为表格内部横滚**。

### 5.3 表格可用宽度核算

算列宽必须显式写出每一项（漏算的后果是「在 1440 下也常态差 3px、永远挂一条用不上的横滚条」）：

```
可用宽 = 视口 1440
       − sider 224
       − 页面 padding 48
       − Card body padding 16×2 = 32
       − Card 边框 2
       − 竖向滚动条 15（Chrome Windows）
       = 1119px
```

`Table.Summary.Cell` 在分组表头下的 `index` 按**叶子列数**排（父 5 列 / 叶子 9 列时给 9 格）。

### 5.4 冗余列的删除判据

- 一格里塞「进度条 + 百分比」= 同一标量说两遍 → 改用**数字自身着色**承载档位。
- 「状态」列若与某个数值列的着色/数值同源 → 删。删前确认目标列是**逐维度独立判定**的，否则会丢掉「整体正常但某一维度已击穿」。

---

## 6. 主题与可访问性（`theme.js`）

### 6.1 品牌 VI token

```js
colorPrimary: '#005BAA'   // 迪卡侬品牌蓝
colorInfo:    '#005BAA'   // 覆写，使 watch 档与品牌一致
colorSuccess: '#2E7D32'  colorWarning: '#C77700'  colorError: '#C0392B'
borderRadius: 8   fontSize: 14   siderWidth: 224 / collapsed 64
```

### 6.2 填充色与文字色必须分档

antd 的 `colorXxxText` 名为 Text，实测**只有 danger / info 达 AA**：

| 档位 | `colorXxxText` | 对比度 | `textStrong` | 对比度 |
|---|---|---|---|---|
| success | #389e0d | 3.46:1 ❌ | `#2a770a` | 5.61:1 ✅ |
| warning | #d48806 | 2.87:1 ❌ | `#9f6605` | 4.80:1 ✅ |
| danger | #c0392b | 5.44:1 ✅ | — | — |
| info | #005BAA | 6.83:1 ✅ | — | — |

`levelColor(level)` 返回 `{ color, bg, border, text, textStrong }` 五个键：**`color` 供填充（进度条 / Tag 底 / 图表），`textStrong` 供 ≤13px 正文**。拿 `text` 当小字色会静默不达标。

> 依赖提示：若把 `colorInfo` 改回 antd 默认 `#1677ff`，`infoText` 会退到 4.10:1 并悄悄跌破 AA —— 届时必须给 watch 档补 `infoTextStrong`。

---

## 7. 构建与产物

### 7.1 依赖

| 包 | 版本 | 说明 |
|---|---|---|
| react / react-dom | 18.3.1 | **不用 19**（antd 5 对 19 需额外 patch） |
| antd | 5.21.6 | UI 唯一来源，不手写 CSS 搭 UI |
| @ant-design/icons | 5.5.1 | — |
| dayjs | 1.11.13 | zh-cn locale |
| vite | 5.4.10 | — |
| @vitejs/plugin-react | 4.3.3 | — |
| jsdom | 30.1.1 | 测试用 |

### 7.2 离线可用的构建配置

`dist/index.html` 要能双击打开，需同时满足：

1. `base: './'`（相对路径）
2. 非 module 入口（IIFE 输出）—— 否则 `file://` 下被 CORS 拦
3. 资源内联（图片走 `data:image/*;base64`）

```bash
npm run build   # vite build --emptyOutDir=false
```

> `--emptyOutDir=false` 是为了保留并行的单文件产物 `dist/dkt-digital-budget-v1.0.html`（1.6MB，全内联）。

### 7.3 antd 废弃 API

- `Drawer.destroyOnClose` 自 5.25 起**废弃**（→ `destroyOnHidden`）。表单重置不用它，改为 `{open && <InnerForm key={id}/>}` 条件渲染 + key 重挂载，行为等价且零废弃告警。
- **零 antd 废弃告警是被断言的**（「运行期零 console 错误 / React 警告」），废弃告警会直接判 FAIL。

---

## 8. 测试方案

### 8.1 规模

| 套件 | 断言数 | 手段 |
|---|---|---|
| `tests/smoke.cjs` | 313 | jsdom 加载 `dist` 产物做运行时断言 |
| `tests/smoke-singlefile.cjs` | 32 | 单文件产物结构与内联资源断言 |

### 8.2 覆盖策略

| 类型 | 手法 | 例子 |
|---|---|---|
| **口径恒等式** | 直接断言等式 | `Σ列 = Σ合计`、`整体 = 项目 + 运维` |
| **反向证明** | 断言排除项**不得**出现 | 运维预估不得混入交付计费行 |
| **排序单调性** | 相邻元素关系断言 | 列表首行 = 最新 |
| **可访问性** | 对比度白名单 | 小字色全部 ≥ 4.5:1 |
| **文案指纹** | 正向 + **负向**指纹 | 含「未上线」等词的规划页不得出现在已上线区 |
| **深链健壮性** | 非法段位归一 | `#/manual` → `#/manual/guide`，不 404 |
| **变异测试** | 故意改坏看断言是否 FAIL | 如把内联图片改成外链应 FAIL |

### 8.3 执行纪律

```bash
npm run build && node tests/smoke.cjs && node tests/smoke-singlefile.cjs
```

**每次改动 UI 后必须先 build 再跑测试**，否则测的是旧产物 —— 这是最常见的假绿来源。

### 8.4 几何校验用探针，不靠目测

`overflow:hidden` 的祖先会把越界元素直接裁掉，**页面不报错、断言也不失败**。涉及绝对定位 / 贴纸 / 浮层的改动，必须写 `probe-*.cjs` 把真实数值（各元素 x/y 区间、间隙、是否越界）打出来，据此改 CSS，断言里照同一算式复算。

依赖型常量必须**从源码解析值推导**，绝不手抄：例如 `padding-left ≥ 贴纸宽` 的断言写成 `Number(paddingLeft) > Number(stickerWidth)`，硬编码 132px 会变成过期断言（永远 FAIL 或更危险的永远 PASS）。

---

## 9. 目录结构

```
dkt-digital-budget/
├── DESIGN.md                     方法论与数据模型设计输入（11 章）
├── README.md                     快速开始与工程约定
├── docs/
│   ├── PRODUCT-SPEC.md           ★ 产品方案文档
│   ├── TECH-ARCHITECTURE.md      ★ 技术架构与实现方案（本文件）
│   └── v0.2 ~ v1.6/*.md          逐版本设计 / 需求 / 评审记录
├── src/
│   ├── main.jsx                  入口：ConfigProvider + 品牌 token + StoreProvider
│   ├── App.jsx                   Layout + hash 路由 + 全局能力（Tour / 搜索 / 水印）
│   ├── store.jsx                 状态与动作
│   ├── navConfig.js              导航单一出处
│   ├── theme.js                  语义 token + levelColor
│   ├── domain/
│   │   ├── calc.js               全部口径与计算函数（唯一出处）
│   │   └── routes.js             hash 构造（唯一出处）
│   ├── pages/                    8 个页面组件
│   ├── components/               SiderNav / BillFloors / TraceChain / TrendChart / SettingsDrawer
│   └── data/mock.js              INITIAL_DATA（确定性）
├── tests/
│   ├── smoke.cjs                 313 条运行时断言
│   └── smoke-singlefile.cjs      32 条单文件产物断言
├── scripts/                      构建脚本、数据校验、几何探针
└── dist/                         构建产物（含 1.6MB 全内联单文件版）
```

---

## 10. 生产化演进路线

当前为纯前端 Demo。接后端时按下表改造，**领域层可原样复用**。

| 层 | 当前 | 生产化方案 |
|---|---|---|
| `data/mock.js` | 内存常量 | REST / GraphQL 客户端 + 缓存层，保留 `INITIAL_DATA` 作 fixture |
| `store.jsx` | `useState` + 函数式更新 | 保留 Context，异步动作改为调用 API + 乐观更新；`log` 落服务端审计表 |
| `domain/calc.js` | 纯函数 | **原样复用**；若需服务端重算，同一份代码以 ESM 跑在 Node |
| 鉴权 | 无 | 接入企业 SSO，`useStore().role` 驱动动作可见性（权限矩阵见 `DESIGN.md` §8.1） |
| 路由 | hash | 可保留（hash 对静态托管最友好）；如需 history 模式，`useHashRoute` 是唯一切换点 |
| 部署 | 本地文件 | 静态托管 + CDN；产物已满足离线可用，无需改造 |

### 10.1 接口边界建议

领域函数签名已天然对齐服务化：`buildBill(data, month, deptCode)` → `POST /api/bills/generate`；`poolState(data, deptCode, fy)` → `GET /api/budget-pool/{dept}/{fy}`。前端只需把 `data` 换成请求结果，视图层零改动。

### 10.2 迁移注意事项

1. **金额精度**：后端返回用字符串小数或整数分，前端 `calc.js` 的万元格式化假设输入为元。
2. **时间精度**：版本号 / 排序键若提升到秒，会连带改变全站同类字段显示格式，需评估。
3. **并发写**：`confirmDraft` 一类动作需服务端幂等键，前端 `useState` 无法保证。