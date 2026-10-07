/* ================================================================== *
 * 路由 URL 构造 —— 全站 hash 拼接的**单一出处**
 *
 * 为什么需要这个文件（v1.6）：
 *   《部门账单总览》的 hash 段位契约是「板块 / 视图 / param / tail / sub2」，
 *   而本视图的 `param` 位**空闲**（v1.4.3 起部门筛选已移除，只保留"定位"）。
 *   v1.6 把账期挪到第 4 段 `tail`、定位部门挪到第 5 段 `sub2`，
 *   于是拼 URL 时**必须在第 3 位留一个空段**，否则：
 *     `#/billing/monthly/D-RETAIL`        → param='D-RETAIL'（错位：部门占了 param 位）
 *     `#/billing/monthly/2026-08/D-RETAIL` → param='2026-08', tail='D-RETAIL'
 *   第二种最隐蔽：`tail` 被喂了 'D-RETAIL'，月份下拉里就会**出现一个叫
 *   "D-RETAIL" 的账期**（已实测复现）。三处（切账期 / 清账期 / 详情页返回）
 *   各自手拼斜杠极易少写一个，故收敛到此函数。
 *
 * 段位契约（billing/monthly）：
 *   #/billing/monthly/[param 空]/[账期]/[定位部门]
 *     累计态（无账期）→ #/billing/monthly            （末两段全省）
 *     单月态          → #/billing/monthly//2026-08
 *     累计 + 定位     → #/billing/monthly///D-RETAIL
 *     单月 + 定位     → #/billing/monthly//2026-08/D-RETAIL
 * ================================================================== */

/** 部门账单总览的 hash 前缀（与 BillingModule.pickMonth / DeptBillPage 返回按钮共用） */
export const BILLING_MONTHLY_BASE = '#/billing/monthly';

/**
 * 构造《部门账单总览》URL。
 *
 * @param {object}  [opts]
 * @param {string?} [opts.month] 账期（YYYY-MM）；null/空 = 累计态
 * @param {string?} [opts.dept]  定位部门代码；null/空 = 不定位
 * @returns {string} 可直接赋给 `window.location.hash` 的完整 hash
 */
export function billingMonthlyHash({ month, dept } = {}) {
  const m = month || '';
  const d = dept || '';
  // 有定位部门时必须写满 5 段，第 3 位空段不可省（省掉会把 tail 喂成部门代码）
  if (d) return `${BILLING_MONTHLY_BASE}//${m}/${d}`;
  // 无定位：累计态回落到最短形式，单月态保留一个空 param 段
  return m ? `${BILLING_MONTHLY_BASE}//${m}` : BILLING_MONTHLY_BASE;
}
