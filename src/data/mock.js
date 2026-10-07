/**
 * 迪卡侬中国 · 数字化项目预算管理平台 — Demo 静态数据与初始数据集
 *
 * 数据设计要点：
 * 1. 全部金额以「元」为单位存储，展示层统一折算为万元；
 * 2. 时间线贴合真实业务：FY2026 正在执行（交付期 + 计费期），FY2027 正在编制（预算期），
 *    两年度并行，用于演示「当年新增需求如何影响次年预算池」；
 * 3. 所有派生金额（评估价、账单金额、预算池余额）一律由 domain/calc.js 计算，不在此硬编码，
 *    避免出现「文档写的数」和「系统算的数」不一致。
 */

/* ------------------------------------------------------------------ *
 * 0. 确定性伪随机 —— 保证每次渲染的运维量数据完全一致
 * ------------------------------------------------------------------ */
export function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ------------------------------------------------------------------ *
 * 1. 年度与月份
 * ------------------------------------------------------------------ */
export const CURRENT_FY = 2026;
export const BUDGET_CYCLE_FY = 2027;
export const FY2026_MONTHS = [
  '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
  '2026-07', '2026-08', '2026-09'
];
export const CONFIRMED_THROUGH = '2026-07';
export const TODAY = '2026-09-30';

/* ------------------------------------------------------------------ *
 * 2. 业务部门 与 年度数字化预算总包
 * ------------------------------------------------------------------ */
/**
 * opsGrowth：编制次年（FY2027）系统运维预估费用时使用的业务量增长系数。
 * 执行年度（FY2026）恒为 1 —— 保证当年账单金额不受影响。
 *
 * === v1.6 消耗档位可演示性（结论：两类年度各有硬约束，调参前先读这段）===
 *
 * ① 运维侧恒为「正常档」，且这是**计量模型的硬约束，不是数据没调好**：
 *    固定年费类 7 个月 ÷ 12 = 58.33%；按量计费类 Σ₁₋₇ ÷ Σ₁₋₁₂ ≈ 60.21%。
 *    两者混合后恒落 55%~58%，永远 < 70% 阈值 ⇒ 运维维度**只有 ok 一档**。
 *    用户已裁定「保持 calc.js 模型不动，运维侧接受单一档位」。
 *
 * ② FY2027（编制年）**整体侧最多到watch**，同样源于口径：
 *    整体率 = 已规划 ÷ 池，而运维预估在编制年**全额计入分母**，
 *    且运维普遍是规划额的 2~10 倍（零售 0.37 / 电商 0.49 / 市场 0.33）。
 *    要让整体落warn（池 ≈ 规划额）就得让池 < 运维额 → 页面显示「透支」，
 *    那是「不够花」而非「花得快」，属另一种语义，不制造。
 *
 * 因此 FY2026 侧做到 ok/watch/warn/over 四档齐全（跨部门分布），
 * FY2027 侧做到 ok/watch 两档 —— 这是口径允许的完整覆盖，不是有意留白。
 */
export const DEPARTMENTS = [
  {
    code: 'D-RETAIL', name: '零售运营', short: '零售', digitalOwner: '顾晓东',
    poolFY26: 12200000, poolFY27: 13000000, fy27Status: '已提交',
    bpOwner: '陈昊', opsGrowth: 1.06
  },
  {
    /* v1.6 试调记录（已回退）：曾把 poolFY27 由1010 万下调至 700 万以图整体进 watch，
       实测整体率仅 46.4%（仍ok），而项目侧因pool − 运维 骤降到 −797%，
       出现**负消耗率** —— 池 < 运维额时项目预算为负，页面渲染出无业务含义的百分比。
       结论：下调 poolFY27 不能提升整体档位，只会破坏项目侧口径。
       保持原值 1010 万（池 > 运维 + 规划，项目侧为正且在正常区间）。 */
    code: 'D-ECOM', name: '电商', short: '电商', digitalOwner: '邱晨',
    poolFY26: 9500000, poolFY27: 10100000, fy27Status: '已提交',
    bpOwner: '林薇', opsGrowth: 1.12
  },
  {
    /* 同上：poolFY27 由 520 万下调至 340 万后，市场侧运维预估 436.5 万已超过池，
       项目预算 = 340 − 436.5 = **−96.5 万**，项目侧消耗率渲染为 −147.6%。
       这是口径破洞不是数据不足，已回退。 */
    code: 'D-MKT', name: '市场营销', short: '市场', digitalOwner: '黄立',
    poolFY26: 4600000, poolFY27: 5200000, fy27Status: '编制中',
    bpOwner: '王梓涵', opsGrowth: 1.05
  },
  {
    code: 'D-CRM', name: '会员与客流', short: '会员', digitalOwner: '邱晨',
    poolFY26: 8100000, poolFY27: 8800000, fy27Status: '已提交',
    bpOwner: '张予桐', opsGrowth: 1.09
  },
  {
    code: 'D-SCM', name: '供应链', short: '供应链', digitalOwner: '刘思远',
    poolFY26: 5900000, poolFY27: 6500000, fy27Status: '已提交',
    bpOwner: '赵启明', opsGrowth: 1.04
  },
  {
    code: 'D-SVC', name: '客户服务', short: '客服', digitalOwner: '周锦程',
    poolFY26: 1400000, poolFY27: 2540000, fy27Status: '已提交',
    bpOwner: '吴茜', opsGrowth: 1.15
  },
  {
    /* v1.6：poolFY26 由 160 万下调至 105 万 —— 使 FY2026 整体消耗率落进 warn 档
       （90%~100%）。原先160 万对应 61.2% ok，导致 FY2026 整体侧缺 warn 档、
       四档着色演示不完整。已用额约 97.9 万，池仍高于已用，不透支。
       动机：财务侧只有数仓共享份额（运维 7.4 万），项目费用是主要消耗来源。 */
    code: 'D-FIN', name: '财务', short: '财务', digitalOwner: '郑亦凡',
    poolFY26: 1050000, poolFY27: 1700000, fy27Status: '编制中',
    bpOwner: '孙澜', opsGrowth: 1.02
  },
  {
    code: 'D-HR', name: '人力资源', short: '人力', digitalOwner: '徐子墨',
    poolFY26: 1100000, poolFY27: 1150000, fy27Status: '未启动',
    bpOwner: '何佳宁', opsGrowth: 1.0
  }
];

/* ------------------------------------------------------------------ *
 * 3. 系统目录 —— 运维计费对象
 *    billing: order  按订单量    member 按会员规模    fixed 固定年费
 * ------------------------------------------------------------------ */
export const SYSTEMS = [
  { id: 'SYS-01', name: '迪卡侬中国官网', line: '电商前台', billing: 'order', rate: 0.62, unit: '元/单', desc: '官网商城前台与下单链路' },
  { id: 'SYS-02', name: '迪卡侬 App', line: '电商前台', billing: 'order', rate: 0.5, unit: '元/单', desc: '移动端 App 与小程序容器' },
  { id: 'SYS-03', name: '会员与 CRM 平台', line: '会员中台', billing: 'member', rate: 42, unit: '元/千人/月', desc: '会员主数据、权益与精准触达' },
  { id: 'SYS-04', name: '门店 POS 与库存', line: '门店数字化', billing: 'order', rate: 0.42, unit: '元/单', desc: '门店收银、库存与调拨' },
  { id: 'SYS-05', name: '供应链协同平台', line: '供应链数字化', billing: 'fixed', rate: 2400000, unit: '元/年', desc: '供应商协同与订单履约跟踪' },
  { id: 'SYS-06', name: '电商中台 OMS', line: '电商前台', billing: 'order', rate: 0.28, unit: '元/单', desc: '全渠道订单管理与拆单' },
  { id: 'SYS-07', name: '数据仓库与 BI', line: '数据与 AI 平台', billing: 'member', rate: 6.5, unit: '元/千人/月', desc: '数仓、指标口径与自助分析' },
  { id: 'SYS-08', name: '客服工单系统', line: '客服与运营工具', billing: 'fixed', rate: 960000, unit: '元/年', desc: '客服工单、知识库与质检' }
];

/** 各系统被哪些部门使用，以及基准月度用量（order: 单/月，member: 千人/月，fixed: 相对权重） */
export const VOLUME_BASE = {
  'SYS-01': { 'D-ECOM': 384000, 'D-MKT': 148000, 'D-RETAIL': 88000 },
  'SYS-02': { 'D-ECOM': 320000, 'D-MKT': 90000 },
  'SYS-03': { 'D-CRM': 8600, 'D-MKT': 4200 },
  'SYS-04': { 'D-RETAIL': 1300000, 'D-SCM': 210000 },
  'SYS-05': { 'D-SCM': 1 },
  'SYS-06': { 'D-ECOM': 180000 },
  'SYS-07': { 'D-ECOM': 6200, 'D-CRM': 8600, 'D-RETAIL': 4500, 'D-MKT': 4200, 'D-SCM': 2100, 'D-SVC': 1600, 'D-FIN': 900, 'D-HR': 700 },
  'SYS-08': { 'D-SVC': 1 }
};

/* ------------------------------------------------------------------ *
 * 4. 费率表（Rate Card）—— 按年度锁定，全年不调价
 * ------------------------------------------------------------------ */
export const ROLES = [
  { code: 'ARCH', name: '解决方案架构师' },
  { code: 'PM', name: '产品经理' },
  { code: 'PMO', name: '项目经理' },
  { code: 'BA', name: '需求分析师' },
  { code: 'UX', name: '交互 / 视觉设计' },
  { code: 'FE', name: '前端工程师' },
  { code: 'BE', name: '后端工程师' },
  { code: 'DE', name: '数据工程师' },
  { code: 'QA', name: '测试工程师' },
  { code: 'OPS', name: '运维工程师' }
];

const RATE_2026_RAW = { ARCH: 4800, PM: 3200, PMO: 2800, BA: 2600, UX: 2600, FE: 2900, BE: 3000, DE: 3300, QA: 2200, OPS: 2400 };

function buildRate(fy, factor) {
  const out = {};
  Object.keys(RATE_2026_RAW).forEach((k) => {
    out[k] = Math.round((RATE_2026_RAW[k] * factor) / 10) * 10;
  });
  out.__fy = fy;
  return out;
}

/** 费率表：FY2026 为现行价，FY2027 在预算期锁定（较 FY2026 上浮 3%） */
export const RATE_CARDS = {
  2026: buildRate(2026, 1),
  2027: buildRate(2027, 1.03)
};

/** 需求清单预估阶段使用的混岗均价系数（估算口径，签收后切换为明细费率） */
export const BLENDED_EST_RATE = 2850;

/* ------------------------------------------------------------------ *
 * 5. 业务规划 BP（FY2027 编制中）
 *
 * 口径（v0.5 修订）：BP **只保留「已提交」一种状态**。
 * 业务部门提交文档或文档链接、并完成该版本的基本信息填写，即算一次「提交 / 更新」；
 * 系统只记录 **版本号 · 更新时间 · 本次变更说明**，不设归档、复核、编制中等其他状态。
 * 未提交的部门不产生任何版本记录（本表因此只有已提交的部门）。
 * ------------------------------------------------------------------ */
/**
 * @deprecated（v1.0）BP 内容字段已整体下移到 `BP_VERSIONS`（唯一真相源）。
 * 本表本轮**不物理删除**，仅为兼容溯源链等旧引用保留的「当前版本派生投影」；
 * 新代码一律通过 `calc.bpVersionsOf(data, dept, fy)[0]` 取当前版本，**禁止再读本表**。
 * 物理删除会连带改动溯源链（calc.js traceOfBrd / traceOfDemand）与多处 mock 引用，改动面过大，另轮处理。
 */
export const BP_RECORDS = [
  { id: 'BP-2027-RETAIL', fy: 2027, dept: 'D-RETAIL', version: 'V2.1', submittedAt: '2026-09-22 10:12', owner: '陈昊', docKind: 'link', docRef: 'docs.decathlon.cn/bp/FY2027-RETAIL', docCount: 0, changeNote: '补充门店数字化三年路线图与选址模型预算影响' },
  { id: 'BP-2027-ECOM', fy: 2027, dept: 'D-ECOM', version: 'V1.1', submittedAt: '2026-09-20 09:30', owner: '林薇', docKind: 'file', docRef: 'FY2027 电商数字化规划.pdf', docCount: 2, changeNote: '双十一大促能力建设前置，补充直播中台需求' },
  { id: 'BP-2027-CRM', fy: 2027, dept: 'D-CRM', version: 'V2.0', submittedAt: '2026-09-18 14:00', owner: '张予桐', docKind: 'file', docRef: 'FY2027 会员体系规划.pptx', docCount: 4, changeNote: '会员等级体系重构方案定稿' },
  { id: 'BP-2027-SCM', fy: 2027, dept: 'D-SCM', version: 'V1.0', submittedAt: '2026-09-19 15:45', owner: '赵启明', docKind: 'link', docRef: 'docs.decathlon.cn/bp/FY2027-SCM', docCount: 0, changeNote: '首次提交，供应商协同提效目标上调' },
  { id: 'BP-2027-SVC', fy: 2027, dept: 'D-SVC', version: 'V1.0', submittedAt: '2026-09-09 16:30', owner: '吴茜', docKind: 'file', docRef: 'FY2027 服务体验数字化规划.docx', docCount: 1, changeNote: '首次提交' }
];

/**
 * BP 版本变更记录（最新在前）—— **唯一真相源**。
 * v1.0 起每条为**完整内容快照**：除版本元数据外，承载 BP 名称 / 量化目标 / 摘要 / 文档。
 *   · name           BP 名称（业务命名，1–60 字）
 *   · goals          年度业务量化目标（**自由文本**，约定每行一条「指标：目标值（口径）」）
 *   · summary        摘要正文（≤300 字；ai_pending / ai_failed 态为 null）
 *   · summarySource  'business' | 'ai' | 'ai_pending' | 'ai_failed'
 *   · docs           [{ name, url, kind:'link'|'file' }]，由 BP_RECORDS 的 docKind/docRef/docCount 迁入
 * 内容字段下移后，`BP_RECORDS` 不再独立保存 version/docRef/changeNote，避免双真相源分叉。
 * 存量数据刻意覆盖摘要 4 态：business（业务填写）/ ai（AI 生成）/ ai_pending（生成中）/ ai_failed（生成失败）。
 */
export const BP_VERSIONS = [
  /* ---- D-RETAIL（V2.1 业务填写 · V2.0 / V1.0 AI 生成）---- */
  {
    id: 'BPV-RETAIL-3', fy: 2027, dept: 'D-RETAIL', version: 'V2.1', at: '2026-09-22 10:12', owner: '陈昊',
    changeNote: '补充门店数字化三年路线图与选址模型预算影响',
    name: 'FY2027 零售数字化规划',
    goals: 'GMV：同比 +18%（含线上渠道）\n会员复购率：提升至 42%\n门店数字化改造：新增覆盖 320 家门店',
    summary: '围绕门店数字化三年路线图，明确 FY2027 三大战役：门店补货建议算法、门店盘点移动化、区域经理经营看板。Digital 资源优先投向门店侧数据打通与算法落地，按季度与需求清单费用预估匹配。',
    summarySource: 'business',
    docs: [{ name: 'FY2027 零售数字化规划', url: 'https://docs.decathlon.cn/bp/FY2027-RETAIL', kind: 'link' }]
  },
  {
    id: 'BPV-RETAIL-2', fy: 2027, dept: 'D-RETAIL', version: 'V2.0', at: '2026-09-15 11:20', owner: '陈昊',
    changeNote: '重构章节结构，明确 FY2027 三大战役与预算量级',
    name: 'FY2027 零售数字化规划',
    goals: 'GMV：同比 +18%（含线上渠道）\n会员复购率：提升至 42%\n门店数字化改造：新增覆盖 320 家门店',
    summary: 'FY2027 零售数字化规划：围绕「GMV：同比 +18%（含线上渠道）」展开，聚焦门店数字化改造与会员复购提升；配套 1 份文档，聚焦年度目标落地与 Digital 资源匹配。',
    summarySource: 'ai',
    docs: [{ name: 'FY2027 零售数字化规划', url: 'https://docs.decathlon.cn/bp/FY2027-RETAIL', kind: 'link' }]
  },
  {
    id: 'BPV-RETAIL-1', fy: 2027, dept: 'D-RETAIL', version: 'V1.0', at: '2026-09-08 09:15', owner: '陈昊',
    changeNote: '首次提交',
    name: 'FY2027 零售数字化规划',
    goals: 'GMV：同比 +18%（含线上渠道）\n会员复购率：提升至 42%\n门店数字化改造：新增覆盖 320 家门店',
    summary: 'FY2027 零售数字化规划：围绕「GMV：同比 +18%（含线上渠道）」展开，聚焦门店数字化改造与会员复购提升；配套 1 份文档，聚焦年度目标落地与 Digital 资源匹配。',
    summarySource: 'ai',
    docs: [{ name: 'FY2027 零售数字化规划', url: 'https://docs.decathlon.cn/bp/FY2027-RETAIL', kind: 'link' }]
  },

  /* ---- D-ECOM（V1.1 / V1.0 均 AI 生成）---- */
  {
    id: 'BPV-ECOM-2', fy: 2027, dept: 'D-ECOM', version: 'V1.1', at: '2026-09-20 09:30', owner: '林薇',
    changeNote: '双十一大促能力建设前置，补充直播中台需求',
    name: 'FY2027 电商数字化规划',
    goals: '线上 GMV：同比 +25%\n大促峰值承载：提升 1.5 倍\n直播中台：Q3 完成一期上线',
    summary: 'FY2027 电商数字化规划：围绕「线上 GMV：同比 +25%」展开，聚焦大促能力建设与直播中台需求；配套 2 份文档，聚焦年度目标落地与 Digital 资源匹配。',
    summarySource: 'ai',
    docs: [
      { name: 'FY2027 电商数字化规划', url: 'https://files.decathlon.cn/bp/FY2027-ECOM-1.pdf', kind: 'file' },
      { name: 'FY2027 电商大促能力建设说明', url: 'https://files.decathlon.cn/bp/FY2027-ECOM-2.pdf', kind: 'file' }
    ]
  },
  {
    id: 'BPV-ECOM-1', fy: 2027, dept: 'D-ECOM', version: 'V1.0', at: '2026-09-05 10:00', owner: '林薇',
    changeNote: '首次提交',
    name: 'FY2027 电商数字化规划',
    goals: '线上 GMV：同比 +25%\n大促峰值承载：提升 1.5 倍\n直播中台：Q3 完成一期上线',
    summary: 'FY2027 电商数字化规划：围绕「线上 GMV：同比 +25%」展开，聚焦大促能力建设与直播中台需求；配套 2 份文档，聚焦年度目标落地与 Digital 资源匹配。',
    summarySource: 'ai',
    docs: [
      { name: 'FY2027 电商数字化规划', url: 'https://files.decathlon.cn/bp/FY2027-ECOM-1.pdf', kind: 'file' },
      { name: 'FY2027 电商大促能力建设说明', url: 'https://files.decathlon.cn/bp/FY2027-ECOM-2.pdf', kind: 'file' }
    ]
  },

  /* ---- D-CRM（V2.0 / V1.0 均业务填写）---- */
  {
    id: 'BPV-CRM-2', fy: 2027, dept: 'D-CRM', version: 'V2.0', at: '2026-09-18 14:00', owner: '张予桐',
    changeNote: '会员等级体系重构方案定稿',
    name: 'FY2027 会员体系数字化规划',
    goals: '会员规模：净增 180 万\n会员活跃率：提升至 55%\n私域触点：企业微信覆盖率 70%',
    summary: 'FY2027 会员体系规划：会员等级体系重构方案定稿后，重点转向活跃度运营与私域触点打通。目标会员净增 180 万、活跃率提升至 55%，项目预算按等级体系重构与流失预警模型分两批投放。',
    summarySource: 'business',
    docs: [
      { name: 'FY2027 会员体系规划', url: 'https://files.decathlon.cn/bp/FY2027-CRM-1.pdf', kind: 'file' },
      { name: '会员等级体系重构方案', url: 'https://files.decathlon.cn/bp/FY2027-CRM-2.pdf', kind: 'file' },
      { name: '会员流失预警模型设计', url: 'https://files.decathlon.cn/bp/FY2027-CRM-3.pdf', kind: 'file' },
      { name: '企业微信私域触点清单', url: 'https://files.decathlon.cn/bp/FY2027-CRM-4.pdf', kind: 'file' }
    ]
  },
  {
    id: 'BPV-CRM-1', fy: 2027, dept: 'D-CRM', version: 'V1.0', at: '2026-09-06 14:30', owner: '张予桐',
    changeNote: '首次提交',
    name: 'FY2027 会员体系数字化规划',
    goals: '会员规模：净增 180 万\n会员活跃率：提升至 55%\n私域触点：企业微信覆盖率 70%',
    summary: 'FY2027 会员体系规划首版：以会员等级体系重构为主线，同步规划流失预警模型与企业微信私域触点打通。会员规模目标净增 180 万，活跃率提升至 55%。',
    summarySource: 'business',
    docs: [
      { name: 'FY2027 会员体系规划', url: 'https://files.decathlon.cn/bp/FY2027-CRM-1.pdf', kind: 'file' },
      { name: '会员等级体系重构方案', url: 'https://files.decathlon.cn/bp/FY2027-CRM-2.pdf', kind: 'file' },
      { name: '会员流失预警模型设计', url: 'https://files.decathlon.cn/bp/FY2027-CRM-3.pdf', kind: 'file' },
      { name: '企业微信私域触点清单', url: 'https://files.decathlon.cn/bp/FY2027-CRM-4.pdf', kind: 'file' }
    ]
  },

  /* ---- D-SCM（V1.0 AI 生成中）---- */
  {
    id: 'BPV-SCM-1', fy: 2027, dept: 'D-SCM', version: 'V1.0', at: '2026-09-19 15:45', owner: '赵启明',
    changeNote: '首次提交，供应商协同提效目标上调',
    name: 'FY2027 供应链协同数字化规划',
    goals: '履约时效：平均缩短 0.8 天\n供应商协同在线率：提升至 90%\n库存周转：加快 12%',
    summary: null,
    summarySource: 'ai_pending',
    docs: [{ name: 'FY2027 供应链协同规划', url: 'https://docs.decathlon.cn/bp/FY2027-SCM', kind: 'link' }]
  },

  /* ---- D-SVC（V1.0 AI 生成失败）---- */
  {
    id: 'BPV-SVC-1', fy: 2027, dept: 'D-SVC', version: 'V1.0', at: '2026-09-09 16:30', owner: '吴茜',
    changeNote: '首次提交',
    name: 'FY2027 服务体验数字化规划',
    goals: '客服响应时长：缩短 30%\n智能工单分流率：达到 65%\n知识库命中率：提升至 80%',
    summary: null,
    summarySource: 'ai_failed',
    docs: [{ name: 'FY2027 服务体验数字化规划', url: 'https://files.decathlon.cn/bp/FY2027-SVC-1.pdf', kind: 'file' }]
  },

  /* ---- D-FIN（V1.0 已提交但未提供文档）----
     演示口径：bpDocFormLabel() 对 docs: [] 返回「未提供文档」。
     原有9 条 BP 版本的docs 全非空（链接 / 附件），该分支不可达 ——
     一个「已提交但没挂文档」的部门在真实编制中很常见（文档在共享盘、尚未上传）。 */
  {
    id: 'BPV-FIN-1', fy: 2027, dept: 'D-FIN', version: 'V1.0', at: '2026-09-26 11:05', owner: '孙澜',
    changeNote: '首次提交，业务量化目标待财务口径复核后补充',
    name: 'FY2027 财务数字化规划',
    goals: '预算占用查询响应：缩短至实时\n报销单据线上率：提升至 98%\n对账差异工单：下降 50%',
    summary: '围绕预算占用实时查询与报销线上化展开，FY2027 以「口径统一、减少人工取数」为主线；正式规划文档待集团财务共享中心对接方案确定后上传。',
    summarySource: 'business',
    docs: []
  }
];

/* ------------------------------------------------------------------ *
 * 6. 年度数字化需求清单
 *    fy=2026 已定稿（BRD 可关联）；fy=2027 编制中。
 *    字段 11 = evalAmount：Digital 逐条核定的「项目预算费用」（元）；null 表示尚未核定。
 *    status 为条目级描述字段（供溯源链展示），**不再承担版本状态职责**——
 *    版本状态由 DEMAND_VERSIONS 在「整份清单」粒度上管理。
 * ------------------------------------------------------------------ */
const rawDemands = [
  ['DM-2026-0003', 2026, 'D-RETAIL', '门店补货建议算法优化', 'SYS-04', 'P0', 320, 'Q1-Q2', '已定稿', true, null],
  ['DM-2026-0007', 2026, 'D-RETAIL', '门店盘点流程移动化', 'SYS-04', 'P1', 210, 'Q1-Q2', '已定稿', true, null],
  ['DM-2026-0011', 2026, 'D-RETAIL', '区域经理经营看板', 'SYS-07', 'P1', 160, 'Q2-Q3', '已定稿', true, null],
  ['DM-2026-0014', 2026, 'D-RETAIL', '门店员工排班工具', 'SYS-04', 'P2', 180, 'Q3-Q4', '已定稿', true, null],
  ['DM-2026-0001', 2026, 'D-ECOM', '官网商详页性能专项', 'SYS-01', 'P0', 140, 'Q1', '已定稿', true, null],
  ['DM-2026-0005', 2026, 'D-ECOM', '全渠道订单拆单规则升级', 'SYS-06', 'P0', 260, 'Q2', '已定稿', true, null],
  ['DM-2026-0009', 2026, 'D-ECOM', '大促压测与容量保障', 'SYS-01', 'P1', 120, 'Q3', '已定稿', true, null],
  ['DM-2026-0016', 2026, 'D-ECOM', 'App 首页个性化推荐', 'SYS-02', 'P1', 220, 'Q3-Q4', '已定稿', true, null],
  ['DM-2026-0002', 2026, 'D-CRM', '会员等级体系重构', 'SYS-03', 'P0', 480, 'Q1-Q3', '已定稿', true, null],
  ['DM-2026-0008', 2026, 'D-CRM', '会员流失预警模型', 'SYS-07', 'P1', 200, 'Q3-Q4', '已定稿', true, null],
  ['DM-2026-0012', 2026, 'D-CRM', '企业微信私域触点打通', 'SYS-03', 'P2', 170, 'Q4', '已定稿', true, null],
  ['DM-2026-0004', 2026, 'D-SCM', '供应商协同门户改版', 'SYS-05', 'P0', 300, 'Q1-Q2', '已定稿', true, null],
  ['DM-2026-0010', 2026, 'D-SCM', '履约时效预测模型', 'SYS-07', 'P1', 240, 'Q3-Q4', '已定稿', true, null],
  ['DM-2026-0006', 2026, 'D-SVC', '客服工单智能分类', 'SYS-08', 'P0', 280, 'Q2', '已定稿', true, null],
  ['DM-2026-0013', 2026, 'D-SVC', '知识库检索增强', 'SYS-08', 'P1', 190, 'Q3-Q4', '已定稿', false, null],
  ['DM-2026-0015', 2026, 'D-FIN', '费用报销流程线上化', 'SYS-07', 'P1', 210, 'Q3-Q4', '已定稿', true, null],
  ['DM-2026-0017', 2026, 'D-MKT', '营销活动归因看板', 'SYS-07', 'P1', 150, 'Q2-Q3', '已定稿', true, null],
  ['DM-2026-0018', 2026, 'D-MKT', '会员营销触达自动化', 'SYS-03', 'P0', 260, 'Q3-Q4', '已定稿', true, null],
  ['DM-2026-0019', 2026, 'D-HR', '招聘流程数字化', 'SYS-07', 'P2', 120, 'Q4', '已定稿', false, null],

  /* v1.6 扩充：为交付楼层补齐 01/02/03/05 月的交付计费而新增的年度计划内需求。
     原清单 19 条只对应 04/06/07/08 四个上线月 —— 交付计费账单总览的
     「交付上线时间」列在这几个账期恒为空态，楼层看不出「本月有交付上线」的常态。
     新增 10 条覆盖 01/02/03/05 月，代价是账单金额整体上移（后续同步 pool）。 */
  ['DM-2026-0020', 2026, 'D-RETAIL', '门店库存共享看板', 'SYS-04', 'P1', 175, 'Q1', '已定稿', true, null],
  ['DM-2026-0021', 2026, 'D-ECOM', '官网站点搜索重构', 'SYS-01', 'P0', 195, 'Q1', '已定稿', true, null],
  ['DM-2026-0022', 2026, 'D-CRM', '会员标签体系重建', 'SYS-03', 'P1', 185, 'Q1-Q2', '已定稿', true, null],
  ['DM-2026-0023', 2026, 'D-SCM', '供应商资质审核线上化', 'SYS-05', 'P2', 145, 'Q2', '已定稿', true, null],
  ['DM-2026-0024', 2026, 'D-SVC', '客服排班优化', 'SYS-08', 'P2', 135, 'Q2', '已定稿', true, null],
  ['DM-2026-0025', 2026, 'D-MKT', '内容投放频次控制', 'SYS-07', 'P2', 125, 'Q2', '已定稿', true, null],
  ['DM-2026-0026', 2026, 'D-RETAIL', '门店安全巡检数字化', 'SYS-07', 'P2', 155, 'Q2-Q3', '已定稿', true, null],
  ['DM-2026-0027', 2026, 'D-ECOM', '购物车合并结算', 'SYS-01', 'P1', 165, 'Q2-Q3', '已定稿', true, null],
  ['DM-2026-0028', 2026, 'D-CRM', '会员生日关怀触达', 'SYS-03', 'P2', 130, 'Q3', '已定稿', true, null],
  ['DM-2026-0029', 2026, 'D-FIN', '预算占用实时查询', 'SYS-07', 'P1', 145, 'Q3', '已定稿', true, null],

  ['DM-2027-0001', 2027, 'D-RETAIL', '门店智能陈列识别', 'SYS-04', 'P0', 380, 'Q1-Q2', '已确认', true, 1065000],
  ['DM-2027-0002', 2027, 'D-RETAIL', '店长移动经营助手', 'SYS-04', 'P1', 260, 'Q2-Q3', '已确认', true, 756000],
  ['DM-2027-0003', 2027, 'D-RETAIL', '门店能耗管理接入', 'SYS-07', 'P2', 140, 'Q3-Q4', '已确认', true, 372000],
  ['DM-2027-0004', 2027, 'D-RETAIL', '自助收银二期', 'SYS-04', 'P1', 300, 'Q1-Q3', '已确认', true, 855000],
  ['DM-2027-0005', 2027, 'D-ECOM', '官网全站改版', 'SYS-01', 'P0', 620, 'Q1-Q3', '待评估', true, null],
  ['DM-2027-0006', 2027, 'D-ECOM', 'App 性能与框架升级', 'SYS-02', 'P0', 340, 'Q1-Q2', '待评估', true, null],
  ['DM-2027-0007', 2027, 'D-ECOM', '跨境电商能力预研', 'SYS-06', 'P2', 180, 'Q4', '待评估', true, null],
  /* D-CRM：V1.0 已确认（DV-CRM-1，totalAmount 2,679,000）。
     v1.6 修复：此前这三条 evalAmount 全为 null，而版本记录却是「已确认」——
     于是 demandAmount 回退 estAmount（2,793,000），下钻页出现
     「当前版本 V1.0 / 已核定 0 条 / 总额 279.3 万」的自相矛盾，
     且 ROI 因分母全 null 而 3 条全显示「—」。
     现按各条业务预估占比分配核定额，Σ 严格 = 2,679,000 = DV-CRM-1.totalAmount。
     比例参照 D-RETAIL / D-SVC 的核定/预估比（约 96%）。 */
  ['DM-2027-0008', 2027, 'D-CRM', '会员权益商城', 'SYS-03', 'P0', 420, 'Q1-Q3', '待评估', true, 1148000],
  ['DM-2027-0009', 2027, 'D-CRM', '全域 CDP 数据打通', 'SYS-07', 'P0', 360, 'Q2-Q4', '待评估', true, 984000],
  ['DM-2027-0010', 2027, 'D-CRM', '门店客流分析深化', 'SYS-07', 'P1', 200, 'Q3-Q4', '待评估', true, 547000],
  ['DM-2027-0011', 2027, 'D-SCM', '供应商履约评分体系', 'SYS-05', 'P0', 280, 'Q1-Q2', '待评估', true, null],
  ['DM-2027-0012', 2027, 'D-SCM', '库存健康度智能诊断', 'SYS-07', 'P1', 240, 'Q2-Q4', '待评估', true, null],
  ['DM-2027-0013', 2027, 'D-SCM', '物流轨迹可视化解构', 'SYS-05', 'P2', 160, 'Q3-Q4', '待评估', true, null],
  ['DM-2027-0014', 2027, 'D-SVC', '智能客服机器人升级', 'SYS-08', 'P0', 320, 'Q1-Q2', '已确认', true, 890000],
  ['DM-2027-0015', 2027, 'D-SVC', '服务质量监控平台', 'SYS-08', 'P1', 180, 'Q2-Q3', '已确认', true, 513000],
  ['DM-2027-0016', 2027, 'D-MKT', '营销费用 ROI 分析平台', 'SYS-07', 'P0', 300, 'Q1-Q3', '待评估', true, null],
  ['DM-2027-0017', 2027, 'D-MKT', '内容素材中台', 'SYS-07', 'P1', 200, 'Q3-Q4', '待评估', true, null],
  ['DM-2027-0018', 2027, 'D-FIN', '财务共享中心对接', 'SYS-07', 'P0', 260, 'Q2-Q4', '待评估', true, null],
  /* v1.6：新增人力部门 FY2027 需求 —— 原清单 18 条无人力条目，导致
     人力部门在《项目预算计划》页整行空态（条数 0 / 无草稿），
     「草稿进行中」的两态演示也缺一个非零样例。 */
  ['DM-2027-0019', 2027, 'D-HR', '员工敬业度调研数字化', 'SYS-07', 'P2', 90, 'Q2-Q3', '已确认', true, 266000],
  ['DM-2027-0020', 2027, 'D-HR', '培训课程平台搭建', 'SYS-07', 'P2', 115, 'Q3-Q4', '已确认', true, 340000]
];

/**
 * 需求条目补充字段（v0.8 §4.1 / §4.4，**v0.8.2 修订**）—— 用按 id 映射的补充表承载，
 * 避免为 37 行 rawDemands 增加列宽、降低改动面。未列出的条目两字段取空。
 *
 *   · desc            项目描述 —— 长文本、可空。v0.8.2 起**占列表一列**（ellipsis 截断 + 原生 title）。
 *   · bizValueAmount  预估业务价值 ——「生意增量贡献」**金额，单位：元**。
 *                      v0.8.2 起替代 v0.8 的自由文本 bizValue（已移除该字段）：
 *                      列表按万元展示（fmtWan），并作为 ROI 的分子。
 *
 * ROI 口径（v0.8.2）：ROI = bizValueAmount ÷ evalAmount。
 *   只有 evalAmount 已核定的条目才有 ROI；未核定（null）一律显示「—」。
 *   因此取值分布按「门店类高、平台/探索类低」构造，落在 1.5× ~ 8× 区间且不做整齐取值。
 * FY2026 不参与本表（该页只看编制年 2027），取空即可。
 *
 * 注意：system / estMD 保留（跨模块仍在用，删除见 v0.8 §8.1）。
 */
const DEMAND_EXT = {
  /* ---- FY2027（编制年，本页数据源；18 条全部给出可读内容与金额口径）---- */
  'DM-2027-0001': {
    desc: '基于门店巡店拍照与货架图像识别，自动判定陈列合规性，替代人工抽查并输出逐店整改建议。',
    bizValueAmount: 7318500
  },
  'DM-2027-0002': {
    desc: '面向店长的移动端经营视图，聚合销售、库存、排班与任务待办，支持按日 / 周查看经营简报。',
    bizValueAmount: 3924000
  },
  'DM-2027-0003': {
    desc: '接入门店照明、空调与冷链能耗数据，按门店与时段输出能耗看板与异常告警。',
    bizValueAmount: 1215000
  },
  'DM-2027-0004': {
    desc: '在一期基础上扩展自助收银品类与支付方式，支持会员价、优惠券与称重商品结算。',
    bizValueAmount: 6408000
  },
  'DM-2027-0005': {
    desc: '对官网商城进行信息架构与视觉整体改版，统一商品、内容与会员入口，优化移动端浏览与下单链路。',
    bizValueAmount: 5940000
  },
  'DM-2027-0006': {
    desc: '升级 App 基础框架与渲染性能，缩短启动时间与页面加载耗时，统一多端组件规范。',
    bizValueAmount: 1180000
  },
  'DM-2027-0007': {
    desc: '预研跨境多币种、多语言与关务对接方案，形成可行性评估与落地路线，暂不进入正式实施。',
    bizValueAmount: 620000
  },
  'DM-2027-0008': {
    desc: '搭建会员权益兑换与积分商城，支持权益上架、库存与核销管理，打通线下门店与线上兑换。',
    bizValueAmount: 4275000
  },
  'DM-2027-0009': {
    desc: '统一线上、门店与私域会员身份与行为数据，构建可复用的客户数据平台与分群能力。',
    bizValueAmount: 5640000
  },
  'DM-2027-0010': {
    desc: '深化门店客流识别与动线分析，输出进店转化、停留与关联购买等指标，支撑门店运营优化。',
    bizValueAmount: 3510000
  },
  'DM-2027-0011': {
    desc: '建立供应商交付准时率、质量与协同响应的评分模型，输出评分看板并联动采购决策。',
    bizValueAmount: 2880000
  },
  'DM-2027-0012': {
    desc: '基于销售、库存与在途数据诊断库存结构，识别滞销与缺货风险并给出补货建议。',
    bizValueAmount: 3960000
  },
  'DM-2027-0013': {
    desc: '整合承运商物流轨迹数据，统一展示在途状态与异常节点，支持按订单查询与预警。',
    bizValueAmount: 1740000
  },
  'DM-2027-0014': {
    desc: '升级智能客服机器人语义理解与多轮对话能力，扩展自助办理场景并提升首解率。',
    bizValueAmount: 1485000
  },
  'DM-2027-0015': {
    desc: '汇聚客服会话与工单数据，构建服务质量监控与质检看板，支持问题归因与改进跟踪。',
    bizValueAmount: 962000
  },
  'DM-2027-0016': {
    desc: '打通投放费用与成交数据，按渠道与活动核算 ROI，支撑预算再分配与投放优化。',
    bizValueAmount: 2340000
  },
  'DM-2027-0017': {
    desc: '集中管理营销素材与内容资产，支持标签检索、版本与权限管理，提升素材复用率。',
    bizValueAmount: 1320000
  },
  'DM-2027-0018': {
    desc: '对接集团财务共享中心，打通费用单据与凭证流转，减少人工录入与对账环节。',
    bizValueAmount: 1050000
  }
};

export const DEMANDS = rawDemands.map((d) => ({
  id: d[0], fy: d[1], dept: d[2], title: d[3], system: d[4], priority: d[5],
  estMD: d[6], window: d[7], status: d[8], needBRD: d[9],
  estAmount: Math.round((d[6] * BLENDED_EST_RATE) / 1000) * 1000,
  evalAmount: d[10],
  desc: (DEMAND_EXT[d[0]] || {}).desc || '',
  // v0.8.2：单位「元」；FY2026 未给出该字段 → null（ROI 与页面均按「—」处理）
  bizValueAmount: (DEMAND_EXT[d[0]] || {}).bizValueAmount ?? null
}));

/* ------------------------------------------------------------------ *
 * 6.5 需求清单及费用预估 · 版本记录（FY2027）
 *
 * 口径（v0.5 修订）：版本管理针对**整份清单**，不做逐条需求的版本管理。
 *   ① 业务部门一次性录完整份清单并提交 → 该版本进入「待评估费用」；
 *   ② Digital 逐条给出项目预算费用 → 该版本转为「已确认」并获得版本号（首个版本 V1.0）；
 *   ③ 后续任何变更都以「完整清单 + 完整费用预估」整体作为新版本（V1.1、V1.2 …）。
 * 「待评估费用」的版本尚未取得版本号（version = null）；
 * totalAmount 为该版本确认时的费用合计快照，便于新版本提交后回溯上一版口径。
 * ------------------------------------------------------------------ */
export const DEMAND_VERSIONS = [
  { id: 'DV-RETAIL-2', fy: 2027, dept: 'D-RETAIL', version: 'V1.1', status: '已确认', count: 4, totalAmount: 3048000, submittedAt: '2026-09-29 10:20', confirmedAt: '2026-09-30 09:45', submitter: '陈昊', evaluator: '顾晓东', changeNote: '整体更新：新增「门店能耗管理接入」，并重估陈列识别工作量' },
  { id: 'DV-RETAIL-1', fy: 2027, dept: 'D-RETAIL', version: 'V1.0', status: '已确认', count: 4, totalAmount: 2964000, submittedAt: '2026-09-25 09:40', confirmedAt: '2026-09-26 15:20', submitter: '陈昊', evaluator: '顾晓东', changeNote: '首次提交完整需求清单' },

  { id: 'DV-ECOM-1', fy: 2027, dept: 'D-ECOM', version: null, status: '待评估费用', count: 3, totalAmount: null, submittedAt: '2026-09-27 16:40', confirmedAt: null, submitter: '林薇', evaluator: null, changeNote: '首次提交完整需求清单，待 Digital 逐条评估费用' },

  { id: 'DV-CRM-2', fy: 2027, dept: 'D-CRM', version: null, status: '待评估费用', count: 3, totalAmount: null, submittedAt: '2026-09-29 14:10', confirmedAt: null, submitter: '张予桐', evaluator: null, changeNote: '整体更新清单：调整客流分析深化范围，费用待重新核定' },
  { id: 'DV-CRM-1', fy: 2027, dept: 'D-CRM', version: 'V1.0', status: '已确认', count: 3, totalAmount: 2679000, submittedAt: '2026-09-21 10:05', confirmedAt: '2026-09-22 11:30', submitter: '张予桐', evaluator: '邱晨', changeNote: '首次提交完整需求清单' },

  { id: 'DV-SCM-1', fy: 2027, dept: 'D-SCM', version: null, status: '待评估费用', count: 3, totalAmount: null, submittedAt: '2026-09-24 09:50', confirmedAt: null, submitter: '赵启明', evaluator: null, changeNote: '首次提交完整需求清单，待 Digital 逐条评估费用' },

  { id: 'DV-SVC-1', fy: 2027, dept: 'D-SVC', version: 'V1.0', status: '已确认', count: 2, totalAmount: 1403000, submittedAt: '2026-09-17 10:40', confirmedAt: '2026-09-18 09:20', submitter: '吴茜', evaluator: '周锦程', changeNote: '首次提交完整需求清单' },

  { id: 'DV-MKT-1', fy: 2027, dept: 'D-MKT', version: null, status: '待评估费用', count: 2, totalAmount: null, submittedAt: '2026-09-28 15:10', confirmedAt: null, submitter: '王梓涵', evaluator: null, changeNote: '首次提交完整需求清单，待 Digital 逐条评估费用' },

  { id: 'DV-FIN-1', fy: 2027, dept: 'D-FIN', version: null, status: '待评估费用', count: 1, totalAmount: null, submittedAt: '2026-09-29 11:20', confirmedAt: null, submitter: '孙澜', evaluator: null, changeNote: '首次提交完整需求清单，待 Digital 逐条评估费用' },

  /* D-HR：进行中版本**已取得正式版本号 V1.0**（Digital 已核定费用），
     与其草稿 status='待复核确认' 语义对齐 —— 这是三态草稿里唯一非「待评估费用」
     的一档。totalAmount 为 Digital 核定的 2 条合计：26.6 万 + 34.0 万。 */
{ id: 'DV-HR-1', fy: 2027, dept: 'D-HR', version: 'V1.0', status: '待评估费用', count: 2, totalAmount: 606000, submittedAt: '2026-09-28 10:30', confirmedAt: null, submitter: '何佳宁', evaluator: '徐子墨', changeNote: '首次提交完整需求清单 2 条，Digital 已逐条核定费用，待业务复核确认写回' }
];

/* ------------------------------------------------------------------ *
 * 6.6 进行中的新版本草稿（v0.8 §5 / §6）
 *
 * 关键口径（v0.8 §6.1 / §6.5）：**进行中内容不进 `demands`**。
 *   · `demands` = 当前生效（正式版本）的清单，语义不变；
 *   · 进行中内容单独由本表承载，**每个部门至多一条**（键 = dept + fy）；
 *   · 只有「业务复核确认」（store.confirmDraft）才把 draft.items 整体写回 `demands`，
 *     随后删除本表该条 —— 这是"新版本在最终业务确认前不展示"的底层保证。
 *
 * 字段：
 *   id / dept / fy       标识（id 形如 DR-{dept}）
 *   status               进行中版本状态：'草稿' | '待反馈费用' | '待复核确认'
 *   items                清单条目，结构与 `demands` 相同
 *   changeNote           本次变更说明
 *   startedAt            草稿创建时间
 *   updatedAt            最近一次保存时间
 *   submittedAt          提交更新时间（进入 S3 后非空）
 *   evaluatedAt          Digital 反馈费用时间（进入 S4 后非空）
 *   evaluator            Digital 反馈人
 *
 * 预置样例：凡 `DEMAND_VERSIONS` 中已有「待评估费用」版本（无版本号）的部门，
 * 均预置一条同构草稿，保证 draft 与 demandVersions 的进行中版本**一一对应**
 * （D-CRM 的 V1.0 已确认 + DV-CRM-2 进行中，语义天然自洽）。
 * 未提交过清单、或已全部确认的部门（D-RETAIL / D-HR / D-SVC）**不预置**。
 * ------------------------------------------------------------------ */
/** 某部门 FY2027 的清单条目（浅拷贝；进行中版本尚未核定费用 → evalAmount 归 null） */
const draftItemsOf = (dept) =>
  DEMANDS
    .filter((d) => d.dept === dept && d.fy === 2027)
    .map((d) => ({ ...d, evalAmount: null, status: '待评估' }));

/** 草稿创建时间 = 提交时间前 1 天的 09:00 */
function prevDayAt9(ts) {
  const d = new Date(`${ts.replace(' ', 'T')}:00`);
  d.setDate(d.getDate() - 1);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} 09:00`;
}

/**
 * 预置草稿种子。
 *
 * `status` / `evaluatedAt` / `evaluator` 决定 ProjectBudgetPage 渲染哪一条分支：
 *   · 「待反馈费用」  → 已提交、Digital 未反馈（S3）
 *   · 「待复核确认」  → Digital 已反馈费用，等业务复核（S4）——**只读**
 *   · 「草稿」        → 仍在编辑，可增删条目（S1/S2）
 *
 * v1.6 之前5 个草稿**全是「待反馈费用」**，「待复核确认」分支（只读态 +
 * 「确认写回」入口）不可达。这里给 D-HR 放一条「待复核确认」：
 * 该部门原无草稿，且此时其进行中版本已在 demandVersions 中取得**正式版本号**
 * （V1.0 已确认），语义上正好对应「Digital 已核定、业务待复核写回」。
 *
 * 字段口径（不可省）：
 *   evaluatedAt / evaluator 必须非空 —— 页面据此显示「Digital 已反馈」与反馈人。
 */
const DRAFT_SEEDS = [
  { dept: 'D-CRM', submittedAt: '2026-09-29 14:10', changeNote: '整体更新清单：调整客流分析深化范围，费用待重新核定' },
  { dept: 'D-ECOM', submittedAt: '2026-09-27 16:40', changeNote: '首次提交完整需求清单，待 Digital 逐条评估费用' },
  { dept: 'D-SCM', submittedAt: '2026-09-24 09:50', changeNote: '首次提交完整需求清单，待 Digital 逐条评估费用' },
  { dept: 'D-MKT', submittedAt: '2026-09-28 15:10', changeNote: '首次提交完整需求清单，待 Digital 逐条评估费用' },
  { dept: 'D-FIN', submittedAt: '2026-09-29 11:20', changeNote: '首次提交完整需求清单，待 Digital 逐条评估费用' },
  {
    dept: 'D-HR',
    status: '待复核确认',
    submittedAt: '2026-09-28 10:30',
    evaluatedAt: '2026-09-29 15:40',
    evaluator: '徐子墨',
    changeNote: '首次提交完整需求清单 2 条，Digital 已逐条核定费用，待业务复核确认写回'
  }
];

export const DEMAND_DRAFTS = DRAFT_SEEDS.map((s) => ({
  id: `DR-${s.dept}`,
  dept: s.dept,
  fy: 2027,
  status: s.status || '待反馈费用',
  items: draftItemsOf(s.dept),
  changeNote: s.changeNote,
  startedAt: prevDayAt9(s.submittedAt),
  updatedAt: s.submittedAt,
  submittedAt: s.submittedAt,
  evaluatedAt: s.evaluatedAt || null,
  evaluator: s.evaluator || null
}));

/* ------------------------------------------------------------------ *
 * 7. 系统运维预算计划（FY2027）
 *    v0.3 新增：业务部门年度 Digital 预算的第 ③ 部分 ——
 *    由 Digital 部门依据系统计费模型出具，业务部门复核确认并提交。
 *    v1.1 修订：增 `items`（已确认版本的系统级明细快照，唯一落库点）——
 *    未落 items 的部门其明细仍由 calc.opsPlanBySystem() 按计费模型实时派生。
 *    items 字段：{ sysId, name, billing, rate, usage, amount }，
 *    其中 usage 为**有效用量（已含业务量增长系数）**、amount = round(rate × usage)。
 * ------------------------------------------------------------------ */
/** D-RETAIL / D-CRM / D-SVC / D-FIN 的已确认明细（字面量已与 opsPlanBySystem 逐行对齐验证 20/20） */
const OPS_ITEMS = {
  'D-RETAIL': [
    { sysId: 'SYS-04', name: '门店 POS 与库存', billing: 'order', rate: 0.42, usage: 17200567, amount: 7224238 },
    { sysId: 'SYS-01', name: '迪卡侬中国官网', billing: 'order', rate: 0.62, usage: 1116074, amount: 691966 },
    { sysId: 'SYS-07', name: '数据仓库与 BI', billing: 'member', rate: 6.5, usage: 60208, amount: 391352 }
  ],
  'D-CRM': [
    { sysId: 'SYS-03', name: '会员与 CRM 平台', billing: 'member', rate: 42, usage: 112760.5, amount: 4735941 },
    { sysId: 'SYS-07', name: '数据仓库与 BI', billing: 'member', rate: 6.5, usage: 116139.5, amount: 754907 }
  ],
  'D-SVC': [
    { sysId: 'SYS-08', name: '客服工单系统', billing: 'fixed', rate: 960000, usage: 1.15, amount: 1104000 },
    { sysId: 'SYS-07', name: '数据仓库与 BI', billing: 'member', rate: 6.5, usage: 23115, amount: 150248 }
  ],
  'D-FIN': [
    { sysId: 'SYS-07', name: '数据仓库与 BI', billing: 'member', rate: 6.5, usage: 11424, amount: 74256 }
  ]
};

export const OPS_PLANS = [
  { id: 'OPS-2027-RETAIL', fy: 2027, dept: 'D-RETAIL', version: 'V1.0', status: '已确认', digitalOwner: '顾晓东', bizOwner: '陈昊', issueDate: '2026-09-10', confirmDate: '2026-09-16', files: 1, note: '门店 POS 与库存 + 数仓份额，按 FY2027 门店单量增长 6% 预估', items: OPS_ITEMS['D-RETAIL'] },
  { id: 'OPS-2027-ECOM', fy: 2027, dept: 'D-ECOM', version: 'V1.1', status: '待业务确认', digitalOwner: '邱晨', bizOwner: '林薇', issueDate: '2026-09-12', confirmDate: null, files: 1, note: '官网 / App / OMS 三系统按单量计费，待电商确认大促峰值口径', items: null },
  { id: 'OPS-2027-MKT', fy: 2027, dept: 'D-MKT', version: 'V0.6', status: '编制中', digitalOwner: '黄立', bizOwner: '王梓涵', issueDate: null, confirmDate: null, files: 0, note: '等待品牌年度主题定稿后确认投放系统清单', items: null },
  { id: 'OPS-2027-CRM', fy: 2027, dept: 'D-CRM', version: 'V1.0', status: '已确认', digitalOwner: '邱晨', bizOwner: '张予桐', issueDate: '2026-09-11', confirmDate: '2026-09-18', files: 1, note: '会员规模按 FY2027 增长 9% 预估，含 CDP 数据份额', items: OPS_ITEMS['D-CRM'] },
  { id: 'OPS-2027-SCM', fy: 2027, dept: 'D-SCM', version: 'V1.0', status: '待业务确认', digitalOwner: '刘思远', bizOwner: '赵启明', issueDate: '2026-09-15', confirmDate: null, files: 1, note: '供应链协同平台固定年费 + 数仓份额，待确认是否含物流轨迹新系统', items: null },
  { id: 'OPS-2027-SVC', fy: 2027, dept: 'D-SVC', version: 'V1.2', status: '已确认', digitalOwner: '周锦程', bizOwner: '吴茜', issueDate: '2026-09-09', confirmDate: '2026-09-14', files: 2, note: '工单系统固定年费 + 数仓份额；服务体验为集团战略级议题，FY2027 已上调', items: OPS_ITEMS['D-SVC'] },
  { id: 'OPS-2027-FIN', fy: 2027, dept: 'D-FIN', version: 'V1.0', status: '已确认', digitalOwner: '郑亦凡', bizOwner: '孙澜', issueDate: '2026-09-14', confirmDate: '2026-09-20', files: 1, note: '仅数仓与 BI 共享份额，口径简单', items: OPS_ITEMS['D-FIN'] },
  { id: 'OPS-2027-HR', fy: 2027, dept: 'D-HR', version: '—', status: '未启动', digitalOwner: '徐子墨', bizOwner: '何佳宁', issueDate: null, confirmDate: null, files: 0, note: '待 Digital 上门对齐后出具运维预估', items: null }
];

/* ------------------------------------------------------------------ *
 * 7.1 系统运维预算 · 版本记录（v1.1 新增，唯一真相源）
 *     结构：{ id, dept, fy, version, status:'已确认', items(完整明细快照),
 *            itemCount, totalAmount, submittedAt, confirmedAt, submitter, confirmer, changeNote }
 *     version / submittedAt / confirmedAt / submitter / confirmer / changeNote
 *     与 OPS_PLANS 的 version / issueDate / confirmDate / digitalOwner / bizOwner / note
 *     严格对齐（不另造时间）；时间戳取自 planActivities 既有 OPS 留痕。
 *     P1-3（别名断开）：快照行**逐条浅拷贝** OPS_ITEMS —— 版本快照与正式明细
 *     不得共享同一数组/对象引用，否则将来任何原地修改都会污染历史快照。
 * ------------------------------------------------------------------ */
const snapItems = (dept) => OPS_ITEMS[dept].map((it) => ({ ...it }));
const OPS_VERSION_ITEMS = {
  'D-RETAIL': snapItems('D-RETAIL'),
  'D-CRM': snapItems('D-CRM'),
  'D-SVC': snapItems('D-SVC'),
  'D-FIN': snapItems('D-FIN')
};
const sumItems = (items) => items.reduce((s, it) => s + it.amount, 0);

export const OPS_VERSIONS = [
  {
    id: 'OPSV-RETAIL-1', fy: 2027, dept: 'D-RETAIL', version: 'V1.0', status: '已确认',
    items: OPS_VERSION_ITEMS['D-RETAIL'], itemCount: OPS_VERSION_ITEMS['D-RETAIL'].length,
    totalAmount: sumItems(OPS_VERSION_ITEMS['D-RETAIL']),
    submittedAt: '2026-09-10 11:00', confirmedAt: '2026-09-16 14:30',
    submitter: '顾晓东', confirmer: '陈昊',
    changeNote: '门店 POS 与库存 + 数仓份额，按 FY2027 门店单量增长 6% 预估'
  },
  {
    id: 'OPSV-CRM-1', fy: 2027, dept: 'D-CRM', version: 'V1.0', status: '已确认',
    items: OPS_VERSION_ITEMS['D-CRM'], itemCount: OPS_VERSION_ITEMS['D-CRM'].length,
    totalAmount: sumItems(OPS_VERSION_ITEMS['D-CRM']),
    submittedAt: '2026-09-11', confirmedAt: '2026-09-18 17:20',
    submitter: '邱晨', confirmer: '张予桐',
    changeNote: '会员规模按 FY2027 增长 9% 预估，含 CDP 数据份额'
  },
  {
    id: 'OPSV-SVC-1', fy: 2027, dept: 'D-SVC', version: 'V1.2', status: '已确认',
    items: OPS_VERSION_ITEMS['D-SVC'], itemCount: OPS_VERSION_ITEMS['D-SVC'].length,
    totalAmount: sumItems(OPS_VERSION_ITEMS['D-SVC']),
    submittedAt: '2026-09-09', confirmedAt: '2026-09-14 11:25',
    submitter: '周锦程', confirmer: '吴茜',
    changeNote: '工单系统固定年费 + 数仓份额；服务体验为集团战略级议题，FY2027 已上调'
  },
  {
    id: 'OPSV-FIN-1', fy: 2027, dept: 'D-FIN', version: 'V1.0', status: '已确认',
    items: OPS_VERSION_ITEMS['D-FIN'], itemCount: OPS_VERSION_ITEMS['D-FIN'].length,
    totalAmount: sumItems(OPS_VERSION_ITEMS['D-FIN']),
    submittedAt: '2026-09-14', confirmedAt: '2026-09-20 10:15',
    submitter: '郑亦凡', confirmer: '孙澜',
    changeNote: '仅数仓与 BI 共享份额，口径简单'
  }
];

/* ------------------------------------------------------------------ *
 * 7.2 系统运维预算 · 进行中的新版本草稿（v1.1 新增）
 *     口径（复刻 v0.8 demandDrafts 纪律）：**除「业务复核确认」外任何动作都不动正式数据**；
 *     每部门至多一条；items 为草稿明细（可编辑），提交后转「待业务确认」。
 *     预置样例与 OPS_PLANS 进行中状态一一对应：D-ECOM / D-SCM（待业务确认）、
 *     D-MKT（编制中）；D-HR 无草稿（未启动）。
 *     items 字面量与 opsPlanBySystem 派生值逐行相等（验证 20/20）。
 * ------------------------------------------------------------------ */
export const OPS_DRAFTS = [
  {
    id: 'OD-D-ECOM', fy: 2027, dept: 'D-ECOM', status: '待业务确认',
    items: [
      { sysId: 'SYS-01', name: '迪卡侬中国官网', billing: 'order', rate: 0.62, usage: 5208000, amount: 3228960 },
      { sysId: 'SYS-02', name: '迪卡侬 App', billing: 'order', rate: 0.5, usage: 4231024, amount: 2115512 },
      { sysId: 'SYS-06', name: '电商中台 OMS', billing: 'order', rate: 0.28, usage: 2415896, amount: 676451 },
      { sysId: 'SYS-07', name: '数据仓库与 BI', billing: 'member', rate: 6.5, usage: 87920, amount: 571480 }
    ],
    changeNote: '出具运维预估 V1.1，待业务确认',
    startedAt: '2026-09-12 09:00', updatedAt: '2026-09-12 10:20', submittedAt: '2026-09-12 10:20', actor: '邱晨'
  },
  {
    id: 'OD-D-SCM', fy: 2027, dept: 'D-SCM', status: '待业务确认',
    items: [
      { sysId: 'SYS-05', name: '供应链协同平台', billing: 'fixed', rate: 2400000, usage: 1.04, amount: 2496000 },
      { sysId: 'SYS-04', name: '门店 POS 与库存', billing: 'order', rate: 0.42, usage: 2581644, amount: 1084290 },
      { sysId: 'SYS-07', name: '数据仓库与 BI', billing: 'member', rate: 6.5, usage: 26780, amount: 174070 }
    ],
    changeNote: '出具运维预估 V1.0，待业务确认',
    startedAt: '2026-09-15 11:00', updatedAt: '2026-09-15 13:10', submittedAt: '2026-09-15 13:10', actor: '刘思远'
  },
  {
    id: 'OD-D-MKT', fy: 2027, dept: 'D-MKT', status: '编制中',
    items: [
      { sysId: 'SYS-03', name: '会员与 CRM 平台', billing: 'member', rate: 42, usage: 53392.5, amount: 2242485 },
      { sysId: 'SYS-01', name: '迪卡侬中国官网', billing: 'order', rate: 0.62, usage: 1903650, amount: 1180263 },
      { sysId: 'SYS-02', name: '迪卡侬 App', billing: 'order', rate: 0.5, usage: 1192327.5, amount: 596164 },
      { sysId: 'SYS-07', name: '数据仓库与 BI', billing: 'member', rate: 6.5, usage: 53287.5, amount: 346369 }
    ],
    changeNote: '投放系统清单未定，退回后重编中',
    startedAt: '2026-09-29 10:00', updatedAt: '2026-09-29 10:00', submittedAt: null, actor: '黄立'
  }
];

/* ------------------------------------------------------------------ *
 * 7.5 年度预算计划操作记录（FY2027 编制期）
 *     v0.5 修订：编制项由 4 项收敛为 3 项（BP / 需求清单及费用 / 系统运维预算）——
 *     「总项目费用」不再独立成项，它是需求清单版本的组成部分。
 *     BP 动作只有「提交 / 更新 / 催办」；需求清单动作为「提交」（业务）/「完成评估」（Digital）。
 *     运行期由 store.planAction() 追加，本表为编制期历史。
 *     字段：[部门, 编制项, 动作, 操作人, 角色, 时间, 说明, 版本号]
 * ------------------------------------------------------------------ */
const rawPlanActivities = [
  ['D-RETAIL', 'BP', '更新', '陈昊', '业务部门', '2026-09-22 10:12', '提交 BP V2.1（文档链接），补充选址模型预算影响', 'V2.1'],
  ['D-RETAIL', 'DEMAND', '提交', '陈昊', '业务部门', '2026-09-25 09:40', '提交 FY2027 完整需求清单 4 条', null],
  ['D-RETAIL', 'DEMAND', '完成评估', '顾晓东', 'Digital', '2026-09-26 15:20', '逐条核定项目预算费用，版本确认为 V1.0', 'V1.0'],
  ['D-RETAIL', 'DEMAND', '提交', '陈昊', '业务部门', '2026-09-29 10:20', '整体更新清单：新增「门店能耗管理接入」', null],
  ['D-RETAIL', 'DEMAND', '完成评估', '顾晓东', 'Digital', '2026-09-30 09:45', '重新核定 4 条费用，版本确认为 V1.1', 'V1.1'],
  ['D-RETAIL', 'OPS', '出具', '顾晓东', 'Digital', '2026-09-10 11:00', '出具运维预估 V1.0', 'V1.0'],
  ['D-RETAIL', 'OPS', '复核确认', '陈昊', '业务部门', '2026-09-16 14:30', '确认运维预估口径，含门店单量增长 6%', 'V1.0'],

  ['D-ECOM', 'BP', '更新', '林薇', '业务部门', '2026-09-20 09:30', '提交 BP V1.1（2 份附件），补充直播中台需求', 'V1.1'],
  ['D-ECOM', 'DEMAND', '提交', '林薇', '业务部门', '2026-09-27 16:40', '提交 FY2027 完整需求清单 3 条，待 Digital 评估费用', null],
  ['D-ECOM', 'OPS', '出具', '邱晨', 'Digital', '2026-09-12 10:20', '出具运维预估 V1.1，待业务确认', 'V1.1'],

  ['D-CRM', 'BP', '更新', '张予桐', '业务部门', '2026-09-18 14:00', '提交 BP V2.0（4 份附件），会员体系方案定稿', 'V2.0'],
  ['D-CRM', 'DEMAND', '提交', '张予桐', '业务部门', '2026-09-21 10:05', '提交 FY2027 完整需求清单 3 条', null],
  ['D-CRM', 'DEMAND', '完成评估', '邱晨', 'Digital', '2026-09-22 11:30', '逐条核定项目预算费用，版本确认为 V1.0', 'V1.0'],
  ['D-CRM', 'DEMAND', '提交', '张予桐', '业务部门', '2026-09-29 14:10', '整体更新清单：调整客流分析深化范围，费用待重新核定', null],
  ['D-CRM', 'OPS', '复核确认', '张予桐', '业务部门', '2026-09-18 17:20', '确认运维预估，含 CDP 数据份额', 'V1.0'],

  ['D-SCM', 'BP', '提交', '赵启明', '业务部门', '2026-09-19 15:45', '提交 BP V1.0（文档链接）', 'V1.0'],
  ['D-SCM', 'DEMAND', '提交', '赵启明', '业务部门', '2026-09-24 09:50', '提交 FY2027 完整需求清单 3 条，待 Digital 评估费用', null],
  ['D-SCM', 'OPS', '出具', '刘思远', 'Digital', '2026-09-15 13:10', '出具运维预估 V1.0，待业务确认', 'V1.0'],

  ['D-SVC', 'BP', '提交', '吴茜', '业务部门', '2026-09-09 16:30', '提交 BP V1.0（1 份附件）', 'V1.0'],
  ['D-SVC', 'DEMAND', '提交', '吴茜', '业务部门', '2026-09-17 10:40', '提交 FY2027 完整需求清单 2 条', null],
  ['D-SVC', 'DEMAND', '完成评估', '周锦程', 'Digital', '2026-09-18 09:20', '逐条核定项目预算费用，版本确认为 V1.0', 'V1.0'],
  ['D-SVC', 'OPS', '复核确认', '吴茜', '业务部门', '2026-09-14 11:25', '确认上调后的运维预估', 'V1.2'],

  ['D-MKT', 'BP', '催办', '徐子墨', 'Digital', '2026-09-08 09:20', 'Digital 发起编制对齐，BP 尚未提交', null],
  ['D-MKT', 'DEMAND', '提交', '王梓涵', '业务部门', '2026-09-28 15:10', '提交 FY2027 完整需求清单 2 条，待 Digital 评估费用', null],
  ['D-MKT', 'OPS', '退回', '黄立', 'Digital', '2026-09-29 09:35', '投放系统清单未定，运维预估退回补充', null],

  ['D-FIN', 'BP', '提交', '孙澜', '业务部门', '2026-09-26 11:05', '提交 BP V1.0，文档尚未上传，待共享盘文档就绪后补挂', 'V1.0'],
  ['D-FIN', 'DEMAND', '提交', '孙澜', '业务部门', '2026-09-29 11:20', '提交 FY2027 完整需求清单 1 条，待 Digital 评估费用', null],
  ['D-FIN', 'OPS', '复核确认', '孙澜', '业务部门', '2026-09-20 10:15', '确认数仓共享份额口径', 'V1.0'],

  ['D-HR', 'BP', '催办', '徐子墨', 'Digital', '2026-09-29 16:00', 'Digital 发起编制对齐，BP 尚未提交', null],
  ['D-HR', 'DEMAND', '提交', '何佳宁', '业务部门', '2026-09-28 10:30', '提交 FY2027 完整需求清单 2 条', null],
  ['D-HR', 'DEMAND', '完成评估', '徐子墨', 'Digital', '2026-09-29 15:40', '逐条核定2 条费用，待业务复核确认写回', 'V1.0']
];

export const PLAN_ACTIVITIES = rawPlanActivities.map((a, i) => ({
  id: `PA-2027-${String(i + 1).padStart(4, '0')}`,
  dept: a[0], stage: a[1], action: a[2], actor: a[3], role: a[4], at: a[5], note: a[6], version: a[7], fy: 2027
}));

/* ------------------------------------------------------------------ *
 * 8. BRD 需求提报单（FY2026 执行期 + FY2027 已提前提报）
 *    evalLines 用 [角色, 人天] 描述，金额由 calc.js 按当年费率表计算
 * ------------------------------------------------------------------ */
const rawBRDs = [
  /* ---- v1.6 新增：补齐 01/02/03/05 四个上线月 ----
     原21 条 BRD 的实际上线月只落在 04/06/07/08/09，导致交付计费账单总览
     在 01/02/03/05 四个账期**恒无交付行**（只剩运维行）。下述 10 条按月补齐，
     使「当月有项目交付上线」成为常态；编号沿用0108 起顺延，插在各部门分块内。 */
  {
    id: 'BRD-2026-0108', fy: 2026, dept: 'D-RETAIL', reporter: '陈昊', submitDate: '2025-12-18',
    title: '门店库存共享看板', system: 'SYS-04', relatedDemandId: 'DM-2026-0020',
    value: '打通门店间库存实时共享，减少调货电话与人工确认环节。',
    expectGoLive: '2026-02-27', status: 'DELIVERED',
    evalLines: [['BA', 22], ['PM', 26], ['FE', 40], ['BE', 34], ['QA', 18]],
    evalBy: '顾晓东', evalDate: '2026-01-08', signedDate: '2026-01-12',
    crs: [{ id: 'CR-2026-0021', type: '范围变更', desc: '增加调货建议优先级排序', delta: [['BE', 14], ['FE', 8]], status: '已批准', date: '2026-02-05', approvedBy: '顾晓东' }],
    delivery: { goLiveDate: '2026-02-25', actualLines: [['BA', 23], ['PM', 27], ['FE', 42], ['BE', 36], ['QA', 18]], note: '' }
  },
  {
    id: 'BRD-2026-0109', fy: 2026, dept: 'D-RETAIL', reporter: '高维', submitDate: '2025-12-26',
    title: '门店安全巡检数字化', system: 'SYS-07', relatedDemandId: 'DM-2026-0026',
    value: '巡检记录线上留存与异常自动上报，替代纸质表单。',
    expectGoLive: '2026-05-29', status: 'DELIVERED',
    evalLines: [['BA', 18], ['PM', 22], ['DE', 30], ['FE', 28], ['QA', 14]],
    evalBy: '顾晓东', evalDate: '2026-01-20', signedDate: '2026-01-23',
    crs: [],
    delivery: { goLiveDate: '2026-05-28', actualLines: [['BA', 18], ['PM', 24], ['DE', 31], ['FE', 27], ['QA', 14]], note: '' }
  },
  {
    id: 'BRD-2026-0141', fy: 2026, dept: 'D-RETAIL', reporter: '陈昊', submitDate: '2026-04-02',
    title: '门店排班与考勤联动', system: 'SYS-04', relatedDemandId: null,
    value: '排班结果自动同步考勤系统，减少店长手工核对。属年度新增需求。',
    expectGoLive: '2026-07-24', status: 'SIGNED',
    evalLines: [['BA', 20], ['PM', 24], ['FE', 34], ['BE', 30], ['QA', 16]],
    evalBy: '顾晓东', evalDate: '2026-05-06', signedDate: '2026-05-08',
    crs: [], delivery: null,
    newDemandReason: '门店侧在 3 月提出，原 FY2026 清单的排班工具仅覆盖建议生成，未含考勤联动。'
  },
  {
    id: 'BRD-2026-0142', fy: 2026, dept: 'D-RETAIL', reporter: '顾晓东', submitDate: '2026-06-11',
    title: '门店陈列稽核申诉流程', system: 'SYS-04', relatedDemandId: null,
    value: '为门店提供陈列稽核结果申诉与复核入口。属年度新增需求。',
    expectGoLive: '2026-10-30', status: 'EVALUATING',
    evalLines: [], evalBy: null, evalDate: null, signedDate: null, crs: [], delivery: null,
    newDemandReason: '陈列稽核上线后门店对判定结果有争议，需要配套申诉闭环。'
  },
  {
    id: 'BRD-2026-0101', fy: 2026, dept: 'D-RETAIL', reporter: '陈昊', submitDate: '2026-01-09',
    title: '门店补货建议算法优化', system: 'SYS-04', relatedDemandId: 'DM-2026-0003',
    value: '将补货建议从人工经验切换为算法驱动，目标降低断货率 3pct、减少滞销库存 8%。',
    expectGoLive: '2026-04-30', status: 'DELIVERED',
    evalLines: [['BA', 30], ['PM', 40], ['DE', 55], ['BE', 70], ['FE', 35], ['QA', 30]],
    evalBy: '顾晓东', evalDate: '2026-02-03', signedDate: '2026-02-06',
    crs: [{ id: 'CR-2026-0031', type: '范围变更', desc: '新增区域差异化补货参数配置', delta: [['FE', 12], ['BE', 10]], status: '已批准', date: '2026-04-02', approvedBy: '顾晓东' }],
    delivery: { goLiveDate: '2026-04-24', actualLines: [['BA', 32], ['PM', 42], ['DE', 58], ['BE', 78], ['FE', 40], ['QA', 33]], note: '上线后完成 2 周灰度观察' }
  },
  {
    id: 'BRD-2026-0104', fy: 2026, dept: 'D-RETAIL', reporter: '陈昊', submitDate: '2026-02-11',
    title: '门店盘点流程移动化', system: 'SYS-04', relatedDemandId: 'DM-2026-0007',
    value: '盘点作业由纸质表单迁移至移动端，单店盘点工时预计下降 35%。',
    expectGoLive: '2026-06-30', status: 'DELIVERED',
    evalLines: [['BA', 25], ['PM', 30], ['FE', 55], ['BE', 50], ['QA', 25]],
    evalBy: '顾晓东', evalDate: '2026-03-04', signedDate: '2026-03-06',
    crs: [], delivery: { goLiveDate: '2026-06-18', actualLines: [['BA', 26], ['PM', 32], ['FE', 58], ['BE', 52], ['QA', 24]], note: '' }
  },
  {
    id: 'BRD-2026-0112', fy: 2026, dept: 'D-RETAIL', reporter: '刘思远', submitDate: '2026-05-14',
    title: '区域经理经营看板', system: 'SYS-07', relatedDemandId: 'DM-2026-0011',
    value: '为大区经理提供统一经营指标视图，替代现有 6 张独立 Excel 周报。',
    expectGoLive: '2026-09-30', status: 'DELIVERED',
    evalLines: [['BA', 20], ['PM', 25], ['DE', 45], ['FE', 40], ['QA', 20]],
    evalBy: '郑亦凡', evalDate: '2026-06-02', signedDate: '2026-06-05',
    crs: [{ id: 'CR-2026-0058', type: '新增范围', desc: '追加竞品价格监控视图', delta: [['DE', 15], ['FE', 8]], status: '已批准', date: '2026-08-11', approvedBy: '郑亦凡' }],
    delivery: { goLiveDate: '2026-09-22', actualLines: [['BA', 22], ['PM', 26], ['DE', 48], ['FE', 42], ['QA', 21]], note: '' }
  },
  {
    id: 'BRD-2026-0119', fy: 2026, dept: 'D-RETAIL', reporter: '陈昊', submitDate: '2026-08-20',
    title: '门店员工排班工具', system: 'SYS-04', relatedDemandId: 'DM-2026-0014',
    value: '按客流预测自动生成排班建议，控制人力成本占销售比。',
    expectGoLive: '2026-12-15', status: 'SIGNED',
    evalLines: [['BA', 22], ['PM', 28], ['FE', 45], ['BE', 48], ['QA', 22]],
    evalBy: '顾晓东', evalDate: '2026-09-08', signedDate: '2026-09-11',
    crs: [], delivery: null
  },
  {
    id: 'BRD-2026-0131', fy: 2026, dept: 'D-RETAIL', reporter: '高维', submitDate: '2026-09-15',
    title: '门店陈列拍照稽核', system: 'SYS-04', relatedDemandId: null,
    value: '巡店照片自动识别陈列合规性，替代人工抽查。属年度新增需求。',
    expectGoLive: '2027-01-31', status: 'EVALUATING',
    evalLines: [], evalBy: null, evalDate: null, signedDate: null, crs: [], delivery: null,
    newDemandReason: '由区域运营团队在外巡店过程中提出的新场景，未纳入 FY2026 需求清单。'
  },

  {
    id: 'BRD-2026-0143', fy: 2026, dept: 'D-ECOM', reporter: '林薇', submitDate: '2025-12-22',
    title: '官网站点搜索重构', system: 'SYS-01', relatedDemandId: 'DM-2026-0021',
    value: '替换自研搜索为统一检索服务，站内搜索转化率目标 +0.8pct。',
    expectGoLive: '2026-03-20', status: 'DELIVERED',
    evalLines: [['ARCH', 14], ['PM', 24], ['BE', 58], ['FE', 32], ['QA', 24]],
    evalBy: '邱晨', evalDate: '2026-01-13', signedDate: '2026-01-16',
    crs: [
      { id: 'CR-2026-0018', type: '范围变更', desc: '搜索联想支持拼音与品牌别名', delta: [['BE', 16], ['FE', 10]], status: '已批准', date: '2026-02-20', approvedBy: '邱晨' },
      /* 待审批：账期已出但变更仍在流程内 —— 不计入账单金额，仅在溯源可见 */
      { id: 'CR-2026-0069', type: '新增范围', desc: '搜索结果支持按门店库存可买过滤', delta: [['BE', 26], ['DE', 12]], status: '待审批', date: '2026-09-18', approvedBy: null }
    ],
    delivery: { goLiveDate: '2026-03-18', actualLines: [['ARCH', 15], ['PM', 26], ['BE', 62], ['FE', 34], ['QA', 25]], note: '' }
  },
  {
    id: 'BRD-2026-0144', fy: 2026, dept: 'D-ECOM', reporter: '唐乐仪', submitDate: '2026-02-09',
    title: '购物车合并结算', system: 'SYS-01', relatedDemandId: 'DM-2026-0027',
    value: '多店铺购物车一次结算，减少分单导致的弃单。',
    expectGoLive: '2026-05-22', status: 'DELIVERED',
    evalLines: [['ARCH', 12], ['BA', 24], ['PM', 30], ['FE', 48], ['BE', 42], ['QA', 22]],
    evalBy: '邱晨', evalDate: '2026-03-10', signedDate: '2026-03-13',
    crs: [
      { id: 'CR-2026-0033', type: '新增范围', desc: '合并结算支持优惠券跨店抵扣', delta: [['BE', 22], ['FE', 12]], status: '已批准', date: '2026-04-15', approvedBy: '邱晨' },
      /* 已驳回：范围过大被退回 —— 该变更**不进入账单金额**，验证「驳回后金额不变」 */
      { id: 'CR-2026-0045', type: '范围变更', desc: '要求同时改造供应链拆单接口', delta: [['BE', 60], ['BA', 30]], status: '已驳回', date: '2026-04-28', approvedBy: null }
    ],
    delivery: { goLiveDate: '2026-05-20', actualLines: [['ARCH', 12], ['BA', 25], ['PM', 32], ['FE', 50], ['BE', 45], ['QA', 23]], note: '' }
  },
  {
    id: 'BRD-2026-0102', fy: 2026, dept: 'D-ECOM', reporter: '林薇', submitDate: '2026-01-13',
    title: '官网商详页性能专项', system: 'SYS-01', relatedDemandId: 'DM-2026-0001',
    value: '商详页 LCP 从 3.4s 优化至 1.8s 以内，预计提升转化率 1.2pct。',
    expectGoLive: '2026-04-15', status: 'DELIVERED',
    evalLines: [['ARCH', 12], ['PM', 15], ['FE', 60], ['BE', 40], ['QA', 25]],
    evalBy: '邱晨', evalDate: '2026-02-05', signedDate: '2026-02-09',
    crs: [], delivery: { goLiveDate: '2026-04-10', actualLines: [['ARCH', 12], ['PM', 15], ['FE', 62], ['BE', 42], ['QA', 26]], note: '' }
  },
  {
    id: 'BRD-2026-0107', fy: 2026, dept: 'D-ECOM', reporter: '林薇', submitDate: '2026-03-05',
    title: '全渠道订单拆单规则升级', system: 'SYS-06', relatedDemandId: 'DM-2026-0005',
    value: '支持按库存分布、时效承诺与成本最优三种策略拆单，降低履约成本。',
    expectGoLive: '2026-07-31', status: 'DELIVERED',
    evalLines: [['ARCH', 20], ['BA', 35], ['PM', 45], ['BE', 90], ['FE', 40], ['QA', 45]],
    evalBy: '邱晨', evalDate: '2026-04-01', signedDate: '2026-04-03',
    crs: [{ id: 'CR-2026-0044', type: '范围变更', desc: '拆单策略增加「碳排放最优」权重', delta: [['BE', 22], ['DE', 12]], status: '已批准', date: '2026-06-18', approvedBy: '邱晨' }],
    delivery: { goLiveDate: '2026-07-28', actualLines: [['ARCH', 20], ['BA', 36], ['PM', 48], ['BE', 96], ['FE', 42], ['QA', 48]], note: '' }
  },
  {
    id: 'BRD-2026-0115', fy: 2026, dept: 'D-ECOM', reporter: '唐乐仪', submitDate: '2026-06-23',
    title: '大促压测与容量保障', system: 'SYS-01', relatedDemandId: 'DM-2026-0009',
    value: '双十一前完成全链路压测与容量弹性方案，目标支撑峰值 4 倍日常流量。',
    expectGoLive: '2026-10-20', status: 'SIGNED',
    evalLines: [['ARCH', 15], ['PMO', 20], ['BE', 35], ['QA', 30]],
    evalBy: '邱晨', evalDate: '2026-07-15', signedDate: '2026-07-17',
    crs: [], delivery: null
  },
  {
    id: 'BRD-2026-0126', fy: 2026, dept: 'D-ECOM', reporter: '林薇', submitDate: '2026-09-02',
    title: 'App 首页个性化推荐', system: 'SYS-02', relatedDemandId: 'DM-2026-0016',
    value: '首页推荐从统一定位切换为千人千面，目标 GMV 贡献提升 6%。',
    expectGoLive: '2027-01-15', status: 'SIGNED',
    evalLines: [['PM', 35], ['DE', 40], ['BE', 45], ['FE', 40], ['QA', 30]],
    evalBy: '邱晨', evalDate: '2026-09-18', signedDate: '2026-09-22',
    crs: [], delivery: null
  },

  {
    id: 'BRD-2026-0145', fy: 2026, dept: 'D-CRM', reporter: '张予桐', submitDate: '2025-12-20',
    title: '会员标签体系重建', system: 'SYS-03', relatedDemandId: 'DM-2026-0022',
    value: '重建标签体系与人群圈选能力，支撑精准营销落地。',
    expectGoLive: '2026-02-26', status: 'DELIVERED',
    evalLines: [['ARCH', 16], ['BA', 34], ['PM', 40], ['DE', 56], ['BE', 46], ['QA', 26]],
    evalBy: '邱晨', evalDate: '2026-01-15', signedDate: '2026-01-19',
    /* 减免费用变更：delta 人天为负 → crTotal 为负值，验证账单「负变更」渲染分支 */
    crs: [
      { id: 'CR-2026-0024', type: '范围变更', desc: '标签计算增加实时特征接入', delta: [['DE', 24], ['BE', 18]], status: '已批准', date: '2026-02-02', approvedBy: '邱晨' },
      { id: 'CR-2026-0027', type: '范围减免费用', desc: '复用现有营销中台人群引擎，取消重复开发', delta: [['DE', -20], ['BE', -14]], status: '已批准', date: '2026-02-16', approvedBy: '邱晨' }
    ],
    delivery: { goLiveDate: '2026-02-24', actualLines: [['ARCH', 16], ['BA', 35], ['PM', 42], ['DE', 56], ['BE', 47], ['QA', 27]], note: '' }
  },
  {
    id: 'BRD-2026-0146', fy: 2026, dept: 'D-CRM', reporter: '谢雨桐', submitDate: '2026-02-24',
    title: '会员生日关怀触达', system: 'SYS-03', relatedDemandId: 'DM-2026-0028',
    value: '会员生日与关键纪念日自动触达，提升复购。',
    expectGoLive: '2026-05-21', status: 'DELIVERED',
    evalLines: [['PM', 22], ['DE', 32], ['FE', 34], ['BE', 28], ['QA', 16]],
    evalBy: '邱晨', evalDate: '2026-03-24', signedDate: '2026-03-27',
    crs: [{ id: 'CR-2026-0036', type: '新增范围', desc: '触达渠道扩展到企微服务通知', delta: [['FE', 12], ['BE', 10]], status: '已批准', date: '2026-04-21', approvedBy: '邱晨' }],
    delivery: { goLiveDate: '2026-05-19', actualLines: [['PM', 23], ['DE', 33], ['FE', 35], ['BE', 29], ['QA', 16]], note: '' }
  },
  {
    id: 'BRD-2026-0103', fy: 2026, dept: 'D-CRM', reporter: '张予桐', submitDate: '2026-01-16',
    title: '会员等级体系重构', system: 'SYS-03', relatedDemandId: 'DM-2026-0002',
    value: '重构五级会员体系与权益发放引擎，提升高价值会员复购频次。',
    expectGoLive: '2026-08-31', status: 'DELIVERED',
    evalLines: [['ARCH', 25], ['BA', 50], ['PM', 60], ['BE', 120], ['FE', 70], ['DE', 40], ['QA', 60]],
    evalBy: '邱晨', evalDate: '2026-02-10', signedDate: '2026-02-13',
    crs: [
      { id: 'CR-2026-0039', type: '范围变更', desc: '增加等级降级保护期配置', delta: [['BE', 18], ['PM', 8]], status: '已批准', date: '2026-05-20', approvedBy: '邱晨' },
      { id: 'CR-2026-0051', type: '新增范围', desc: '权益商城入口前置到会员中心首页', delta: [['FE', 15], ['UX', 10]], status: '已批准', date: '2026-07-08', approvedBy: '邱晨' }
    ],
    delivery: { goLiveDate: '2026-08-27', actualLines: [['ARCH', 26], ['BA', 52], ['PM', 64], ['BE', 128], ['FE', 74], ['DE', 42], ['QA', 62]], note: '' }
  },
  {
    id: 'BRD-2026-0121', fy: 2026, dept: 'D-CRM', reporter: '张予桐', submitDate: '2026-08-27',
    title: '会员流失预警模型', system: 'SYS-07', relatedDemandId: 'DM-2026-0008',
    value: '识别 90 天流失概率 Top 用户，驱动精准挽留动作。',
    expectGoLive: '2026-12-31', status: 'SIGNED',
    evalLines: [['PM', 30], ['DE', 55], ['BE', 30], ['QA', 20]],
    evalBy: '郑亦凡', evalDate: '2026-09-14', signedDate: '2026-09-16',
    crs: [], delivery: null
  },
  {
    id: 'BRD-2026-0133', fy: 2026, dept: 'D-CRM', reporter: '谢雨桐', submitDate: '2026-09-24',
    title: '门店扫码入会链路优化', system: 'SYS-03', relatedDemandId: null,
    value: '简化门店导购扫码入会步骤，缩短转化链路。属年度新增需求。',
    expectGoLive: '2026-12-20', status: 'SIGNED',
    evalLines: [['UX', 12], ['BA', 20], ['PM', 25], ['FE', 40], ['BE', 38], ['QA', 18]],
    evalBy: '邱晨', evalDate: '2026-09-25', signedDate: '2026-09-28',
    crs: [], delivery: null,
    newDemandReason: 'FY2026 需求清单评审时未预见，源于 9 月门店试点反馈。'
  },

  {
    id: 'BRD-2026-0147', fy: 2026, dept: 'D-SCM', reporter: '赵启明', submitDate: '2025-12-24',
    title: '供应商资质审核线上化', system: 'SYS-05', relatedDemandId: 'DM-2026-0023',
    value: '供应商资质在线提交与审核留痕，缩短准入周期。',
    expectGoLive: '2026-03-19', status: 'DELIVERED',
    evalLines: [['BA', 26], ['PM', 30], ['FE', 42], ['BE', 38], ['QA', 20]],
    evalBy: '刘思远', evalDate: '2026-01-15', signedDate: '2026-01-19',
    crs: [{ id: 'CR-2026-0029', type: '范围变更', desc: '增加资质到期自动预警', delta: [['BE', 14], ['FE', 8]], status: '已批准', date: '2026-02-25', approvedBy: '刘思远' }],
    delivery: { goLiveDate: '2026-03-17', actualLines: [['BA', 27], ['PM', 31], ['FE', 44], ['BE', 40], ['QA', 20]], note: '' }
  },
  {
    id: 'BRD-2026-0105', fy: 2026, dept: 'D-SCM', reporter: '赵启明', submitDate: '2026-02-06',
    title: '供应商协同门户改版', system: 'SYS-05', relatedDemandId: 'DM-2026-0004',
    value: '统一供应商入驻、对账与交期确认入口，减少线下邮件往返。',
    expectGoLive: '2026-06-30', status: 'DELIVERED',
    evalLines: [['BA', 40], ['PM', 45], ['FE', 80], ['BE', 85], ['QA', 45]],
    evalBy: '刘思远', evalDate: '2026-03-02', signedDate: '2026-03-05',
    crs: [{ id: 'CR-2026-0047', type: '范围变更', desc: '对账单支持多币种展示', delta: [['BE', 25], ['FE', 10]], status: '已批准', date: '2026-05-28', approvedBy: '刘思远' }],
    delivery: { goLiveDate: '2026-06-26', actualLines: [['BA', 42], ['PM', 48], ['FE', 84], ['BE', 90], ['QA', 46]], note: '' }
  },
  {
    id: 'BRD-2026-0124', fy: 2026, dept: 'D-SCM', reporter: '罗毅', submitDate: '2026-08-30',
    title: '履约时效预测模型', system: 'SYS-07', relatedDemandId: 'DM-2026-0010',
    value: '对在途订单给出到达时效预测区间，降低客诉与催单量。',
    expectGoLive: '2027-01-31', status: 'EVALUATING',
    evalLines: [], evalBy: null, evalDate: null, signedDate: null, crs: [], delivery: null
  },

  {
    id: 'BRD-2026-0148', fy: 2026, dept: 'D-SVC', reporter: '吴茜', submitDate: '2025-12-19',
    title: '客服排班优化', system: 'SYS-08', relatedDemandId: 'DM-2026-0024',
    value: '按话务波峰自动生成客服排班建议，降低人力冗余。',
    expectGoLive: '2026-01-29', status: 'DELIVERED',
    evalLines: [['PM', 24], ['DE', 34], ['BE', 30], ['FE', 18], ['QA', 16]],
    evalBy: '周锦程', evalDate: '2026-01-09', signedDate: '2026-01-13',
    crs: [{ id: 'CR-2026-0016', type: '新增范围', desc: '排班建议接入考勤系统联动', delta: [['BE', 16], ['DE', 8]], status: '已批准', date: '2026-01-22', approvedBy: '周锦程' }],
    delivery: { goLiveDate: '2026-01-27', actualLines: [['PM', 25], ['DE', 35], ['BE', 31], ['FE', 19], ['QA', 16]], note: '' }
  },
  {
    id: 'BRD-2026-0106', fy: 2026, dept: 'D-SVC', reporter: '吴茜', submitDate: '2026-02-20',
    title: '客服工单智能分类', system: 'SYS-08', relatedDemandId: 'DM-2026-0006',
    value: '工单自动分类准确率目标 92%，减少人工分派环节。',
    expectGoLive: '2026-07-15', status: 'DELIVERED',
    evalLines: [['PM', 30], ['DE', 50], ['BE', 45], ['FE', 25], ['QA', 30]],
    evalBy: '周锦程', evalDate: '2026-03-18', signedDate: '2026-03-20',
    crs: [], delivery: { goLiveDate: '2026-07-10', actualLines: [['PM', 32], ['DE', 52], ['BE', 48], ['FE', 26], ['QA', 31]], note: '' }
  },
  {
    id: 'BRD-2026-0129', fy: 2026, dept: 'D-SVC', reporter: '吴茜', submitDate: '2026-09-08',
    title: '知识库检索增强', system: 'SYS-08', relatedDemandId: 'DM-2026-0013',
    value: '引入语义检索，提升客服一次解决率。',
    expectGoLive: '2026-12-31', status: 'SIGNED',
    evalLines: [['PM', 25], ['DE', 45], ['BE', 35], ['QA', 20]],
    evalBy: '周锦程', evalDate: '2026-09-24', signedDate: '2026-09-26',
    crs: [], delivery: null
  },
  {
    id: 'BRD-2026-0134', fy: 2026, dept: 'D-SVC', reporter: '吴茜', submitDate: '2026-09-26',
    title: '客服排班与话务预测', system: 'SYS-08', relatedDemandId: null,
    value: '按话务量预测生成排班建议。属年度新增需求。',
    expectGoLive: '2027-02-28', status: 'SUBMITTED',
    evalLines: [], evalBy: null, evalDate: null, signedDate: null, crs: [], delivery: null,
    newDemandReason: '客服中心 9 月组织调整后新增的管理诉求。'
  },

  {
    id: 'BRD-2026-0122', fy: 2026, dept: 'D-FIN', reporter: '孙澜', submitDate: '2026-08-28',
    title: '费用报销流程线上化', system: 'SYS-07', relatedDemandId: 'DM-2026-0015',
    value: '报销单据线上流转并对接集团财务系统，缩短报销周期。',
    expectGoLive: '2027-01-31', status: 'SIGNED',
    evalLines: [['BA', 30], ['PM', 25], ['FE', 45], ['BE', 55], ['QA', 25]],
    evalBy: '郑亦凡', evalDate: '2026-09-15', signedDate: '2026-09-18',
    crs: [], delivery: null
  },
  {
    id: 'BRD-2026-0149', fy: 2026, dept: 'D-MKT', reporter: '王梓涵', submitDate: '2025-12-23',
    title: '内容投放频次控制', system: 'SYS-07', relatedDemandId: 'DM-2026-0025',
    value: '按人群自动控制曝光频次，降低打扰与流失。',
    expectGoLive: '2026-03-12', status: 'DELIVERED',
    evalLines: [['PM', 20], ['DE', 28], ['FE', 22], ['QA', 12]],
    evalBy: '郑亦凡', evalDate: '2026-01-14', signedDate: '2026-01-20',
    crs: [],
    delivery: { goLiveDate: '2026-03-10', actualLines: [['PM', 21], ['DE', 29], ['FE', 23], ['QA', 12]], note: '' }
  },
  {
    id: 'BRD-2026-0150', fy: 2026, dept: 'D-FIN', reporter: '孙澜', submitDate: '2026-02-17',
    title: '预算占用实时查询', system: 'SYS-07', relatedDemandId: 'DM-2026-0029',
    value: '提供部门预算占用与可用余额的实时查询口径，减少临时取数。',
    expectGoLive: '2026-05-26', status: 'DELIVERED',
    evalLines: [['BA', 24], ['PM', 22], ['DE', 34], ['FE', 30], ['QA', 16]],
    evalBy: '郑亦凡', evalDate: '2026-03-18', signedDate: '2026-03-24',
    crs: [{ id: 'CR-2026-0038', type: '范围变更', desc: '增加按成本中心维度拆分', delta: [['DE', 12], ['FE', 8]], status: '已批准', date: '2026-04-20', approvedBy: '郑亦凡' }],
    delivery: { goLiveDate: '2026-05-24', actualLines: [['BA', 25], ['PM', 23], ['DE', 35], ['FE', 31], ['QA', 16]], note: '' }
  },
  {
    id: 'BRD-2026-0118', fy: 2026, dept: 'D-MKT', reporter: '王梓涵', submitDate: '2026-08-14',
    title: '营销活动归因看板', system: 'SYS-07', relatedDemandId: 'DM-2026-0017',
    value: '打通投放到成交的归因链路，支撑预算再分配决策。',
    expectGoLive: '2026-12-15', status: 'DELIVERED',
    evalLines: [['BA', 25], ['PM', 30], ['DE', 50], ['FE', 35], ['QA', 20]],
    evalBy: '郑亦凡', evalDate: '2026-08-30', signedDate: '2026-09-01',
    crs: [], delivery: { goLiveDate: '2026-09-28', actualLines: [['BA', 26], ['PM', 31], ['DE', 52], ['FE', 36], ['QA', 20]], note: '提前交付' }
  },
  {
    id: 'BRD-2026-0130', fy: 2026, dept: 'D-MKT', reporter: '王梓涵', submitDate: '2026-09-12',
    title: '会员营销触达自动化', system: 'SYS-03', relatedDemandId: 'DM-2026-0018',
    value: '按生命周期节点自动触发营销动作，替代人工圈选。',
    expectGoLive: '2027-01-31', status: 'EVALUATING',
    evalLines: [], evalBy: null, evalDate: null, signedDate: null, crs: [], delivery: null
  },
  {
    id: 'BRD-2026-0135', fy: 2026, dept: 'D-HR', reporter: '何佳宁', submitDate: '2026-09-28',
    title: '招聘流程数字化', system: 'SYS-07', relatedDemandId: 'DM-2026-0019',
    value: '简历筛选与面试安排线上化，缩短招聘周期。',
    expectGoLive: '2027-02-28', status: 'SUBMITTED',
    evalLines: [], evalBy: null, evalDate: null, signedDate: null, crs: [], delivery: null
  }
];

/* ------------------------------------------------------------------ *
 * 8.1 业务复盘（v1.4.2 新增）
 *
 * 口径澄清（用户 2026-10-03 明确，**勿回退**）：
 *   账单是**已上线项目的收费**，所以「业务量化价值」不能取 BRD 里的预估 `value` ——
 *   那是上线「前」的预期。真实增量价值只能来自**上线后完成的复盘**：
 *   业务团队在复盘文档中写入 / 从文档中抽取的实际业务增量价值。
 *
 * 因此本表按 BRD 维度给三��字段：
 *   retroDoc  — 复盘文档链接（未复盘则为 null，页面显示「—」并计入「待复盘」）
 *   realizedValue — 复盘认定的**实际**业务增量价值（元）；未复盘为 null
 *   retrofitDone  — 是否已完成复盘（用于「待复盘」计数，不做金额假设）
 *
 * `bizValueAmount`（BRD 预估口径，仅 FY2027 有）与本表的 `realizedValue` 是
 * **两个不同事实源**，不可互相替代：前者用于《项目预算计划》的预估 ROI，
 * 后者用于账单的复盘 ROI。页面上二者不得混用同一个字段。
 * ------------------------------------------------------------------ */
const RETRO_RECORDS = {
  /* 已上线项目 = 会计入交付计费账单的全集。上线越早，复盘越可能完成。
     v1.6 扩充后共 19 条 DELIVERED，其中 2 条未复盘（BRD-2026-0112 落待出账月、
     BRD-2026-0109 落已出账月）—— 后者是让「待复盘」渲染分支真正可见的那一条。 */
  'BRD-2026-0108': {
    retrofitDone: true,
    retroDoc: 'https://wiki.dkt.cn/retro/BRD-2026-0108',
    realizedValue: 1620000,
    retroSummary: '门店间调货电话量日均下降 34%，共享库存命中率由 61% 提升至 78%。'
  },
  'BRD-2026-0143': {
    retrofitDone: true,
    retroDoc: 'https://wiki.dkt.cn/retro/BRD-2026-0143',
    realizedValue: 3150000,
    retroSummary: '站内搜索无结果率由 14% 降至 5.2%，搜索下单转化 +0.9pct（立项预期 +0.8pct）。'
  },
  'BRD-2026-0144': {
    retrofitDone: true,
    retroDoc: 'https://wiki.dkt.cn/retro/BRD-2026-0144',
    realizedValue: 2480000,
    retroSummary: '合并结算订单占比达到 27%，分单弃单率环比下降 11%。'
  },
  'BRD-2026-0145': {
    retrofitDone: true,
    retroDoc: 'https://wiki.dkt.cn/retro/BRD-2026-0145',
    realizedValue: 3760000,
    retroSummary: '标签覆盖率由 43% 提升至 82%，人群圈选耗时由小时级降至分钟级。'
  },
  'BRD-2026-0146': {
    retrofitDone: true,
    retroDoc: 'https://wiki.dkt.cn/retro/BRD-2026-0146',
    realizedValue: 1980000,
    retroSummary: '生日关怀触达打开率 23.6%，触达会员 30 日复购 +4.1pct。'
  },
  'BRD-2026-0147': {
    retrofitDone: true,
    retroDoc: 'https://wiki.dkt.cn/retro/BRD-2026-0147',
    realizedValue: 1160000,
    retroSummary: '供应商准入平均周期由 12 个工作日缩短至 4 天，资质留痕完整率 100%。'
  },
  'BRD-2026-0148': {
    retrofitDone: true,
    retroDoc: 'https://wiki.dkt.cn/retro/BRD-2026-0148',
    realizedValue: 1540000,
    retroSummary: '排班人力冗余成本下降 9%，夜班覆盖达标率提升至 94%。'
  },
  'BRD-2026-0149': {
    retrofitDone: true,
    retroDoc: 'https://wiki.dkt.cn/retro/BRD-2026-0149',
    realizedValue: 890000,
    retroSummary: '同人群 7 日曝光次数由 6.4 次降至 3.1 次，投放退订率下降 2.3pct。'
  },
  'BRD-2026-0150': {
    retrofitDone: true,
    retroDoc: 'https://wiki.dkt.cn/retro/BRD-2026-0150',
    realizedValue: 720000,
    retroSummary: '部门预算取数请求由每周 23 次降至 2 次，口径争议工单归零。'
  },
  'BRD-2026-0101': {
    retrofitDone: true,
    retroDoc: 'https://wiki.dkt.cn/retro/BRD-2026-0101',
    realizedValue: 2860000,
    retroSummary: '断货率由 6.8% 降至 4.1%（−2.7pct），滞销库存占比由 9.4% 降至 6.9%，超出立项预期。'
  },
  'BRD-2026-0104': {
    retrofitDone: true,
    retroDoc: 'https://wiki.dkt.cn/retro/BRD-2026-0104',
    realizedValue: 1740000,
    retroSummary: '单店盘点工时由 3.2h 降至 1.9h（−40.6%），优于立项预期的 35%。'
  },
  'BRD-2026-0112': {
    retrofitDone: false,
    retroDoc: null,
    realizedValue: null,
    retroSummary: '上线满 1 个月，业务指标观察期未结束，复盘待排期。'
  },
  /* 演示口径：待复盘项目落在**已出账月**（2026-05）而非待出账月。
     累计态的交付楼层取数边界是 billStateOf !== 'DRAFT'，若未复盘项目全落在
     2026-09（待出账），retroPending 恒为 0 ——「待复盘」文案、复盘文档列的
     「待复盘」字样、ROI 列的「—」三态就都成了不可达分支。这里保留一条在
     累计区间内的未复盘项目，使这三处渲染在演示中真的能看到。 */
  'BRD-2026-0109': {
    retrofitDone: false,
    retroDoc: null,
    realizedValue: null,
    retroSummary: '业务价值由总部与区域联合口径核算，跨年度对齐中，复盘待出具。'
  },
  'BRD-2026-0102': {
    retrofitDone: true,
    retroDoc: 'https://wiki.dkt.cn/retro/BRD-2026-0102',
    realizedValue: 4230000,
    retroSummary: '商详页 LCP 由 3.4s 降至 1.6s，转化率 +1.5pct（立项预期 +1.2pct）。'
  },
  'BRD-2026-0107': {
    retrofitDone: true,
    retroDoc: 'https://wiki.dkt.cn/retro/BRD-2026-0107',
    realizedValue: 1980000,
    retroSummary: '拆单错误率由 1.9% 降至 0.7%，履约异常单量同比下降 34%。'
  },
  'BRD-2026-0103': {
    retrofitDone: true,
    retroDoc: 'https://wiki.dkt.cn/retro/BRD-2026-0103',
    realizedValue: 5620000,
    retroSummary: '会员等级迁移成功率 99.6%，等级复购率 +6.2pct，会员营收贡献同比 +8.1%。'
  },
  'BRD-2026-0105': {
    retrofitDone: true,
    retroDoc: 'https://wiki.dkt.cn/retro/BRD-2026-0105',
    realizedValue: 1350000,
    retroSummary: '供应商协同准时率由 88% 提升至 96.4%，对账人工工时下降 26%。'
  },
  'BRD-2026-0106': {
    retrofitDone: true,
    retroDoc: 'https://wiki.dkt.cn/retro/BRD-2026-0106',
    realizedValue: 2470000,
    retroSummary: '客服工单一次解决率由 61% 提升至 74%，人工客服工时下降 31%。'
  },
  'BRD-2026-0118': {
    retrofitDone: false,
    retroDoc: null,
    realizedValue: null,
    retroSummary: '上线满 1 个月，渠道归因口径仍在与财务对账，复盘待出具。'
  }
};

/** 复盘字段挂到 BRD 上（未登记复盘的 BRD 一律 null，不做金额假设） */
export const BRDS = rawBRDs.map((b) => {
  const retro = RETRO_RECORDS[b.id] || null;
  return {
    ...b,
    relationType: b.relatedDemandId ? 'PLANNED' : 'NEW',
    newDemandReason: b.newDemandReason || null,
    /* v1.4.2：复盘三字段。`realizedValue` 是**实际增量价值**，
       与 `DEMANDS[].bizValueAmount`（BRD 预估）语义不同、不可互换。 */
    retrofitDone: !!(retro && retro.retrofitDone),
    retroDoc: (retro && retro.retroDoc) || null,
    realizedValue: retro && retro.retrofitDone ? retro.realizedValue : null,
    retroSummary: (retro && retro.retroSummary) || null
  };
});

/* ------------------------------------------------------------------ *
 * 9. 账单状态（FY2026 已结账至 2026-07）
 *    已结账月份存于 data.confirmedMonths，由「确认账单」动作变更
 * ------------------------------------------------------------------ */
export const CONFIRMED_MONTHS_INIT = [
  '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07'
];
export const SENT_MONTHS_INIT = ['2026-08'];

export function billStatusOf(month, confirmedMonths, sentMonths) {
  if ((confirmedMonths || []).includes(month)) return 'CONFIRMED';
  if ((sentMonths || []).includes(month)) return 'SENT';
  return 'DRAFT';
}

/* ------------------------------------------------------------------ *
 * 10. 初值
 * ------------------------------------------------------------------ */
export const INITIAL_DATA = {
  departments: DEPARTMENTS,
  systems: SYSTEMS,
  rateCards: RATE_CARDS,
  bpRecords: BP_RECORDS,
  bpVersions: BP_VERSIONS,
  demands: DEMANDS,
  demandVersions: DEMAND_VERSIONS,
  demandDrafts: DEMAND_DRAFTS,
  opsPlans: OPS_PLANS,
  opsVersions: OPS_VERSIONS,
  opsDrafts: OPS_DRAFTS,
  planActivities: PLAN_ACTIVITIES,
  brds: BRDS,
  months: FY2026_MONTHS,
  confirmedMonths: CONFIRMED_MONTHS_INIT,
  sentMonths: SENT_MONTHS_INIT
};
