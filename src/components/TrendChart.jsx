/**
 * TrendChart —— 月度费用趋势图（v1.4.3 抽为共享模块）
 *
 * **两页共用同一份实现**：《对账单总览》与《部门账单详情页》都渲染它。
 * 此前 Trend 定义在 BillingModule.jsx 内，详情页无法复用（跨文件 import 会形成
 * 循环依赖：BillingModule → DeptBillPage → BillingModule）。抽到独立模块后，
 * 两页的图表**口径与视觉必然一致**，不会出现「总览有趋势线、详情没有」这类漂移。
 *
 * props: {
 *   rows: [{ month, status, delivery, ops, total }],   // 必带 status（圆点用）
 *   active: string|null,   // 选中月份；**空 = 累计态**（一等公民，非未初始化）
 *   onPick: (month|null) => void,
 *   onClear?: () => void,  // 缺省时回退到 onPick(null)
 *   cumulativeHint?: string // 累计态口径说明
 * }
 *
 * 三个关键设计（详见 docs/v1.4-billing-overview-design.md §2.6 / §7.2）：
 *   ① **运维段用 c.meterCommitted 而非 c.info** —— main.jsx 里 colorInfo 与
 *      colorPrimary 同为 #005BAA，用 info 会让「交付/运维」是同一个颜色，
 *      只靠透明度伪装。#7FA8CC 对白底 2.51:1 < 3:1，故**必须有第二重区分通道**
 *      （段序恒定：下=交付 / 上=运维 + 图例文字）。
 *   ② **空态（累计）是一等公民**：全部柱满色、无选中标记；单月态才有柱下选中条。
 *      两态视觉互斥，不会把「累计」误读成「模糊的单月」。
 *   ③ **趋势线 = 月度合计**，与柱共用同一坐标系（折线即柱顶连线），
 *      免除堆叠柱总额需心算相加。pointerEvents:none 让点击穿透到柱。
 */
import React from 'react';
import { Flex, Tooltip, Typography } from 'antd';
import { useT } from '../theme.js';
import { fmtWan } from '../domain/calc.js';

const { Text } = Typography;
const statusText = (s) => (s === 'CONFIRMED' ? '已核销' : s === 'SENT' ? '已发出' : '待出账');

/* ================================================================== *
 * 月度账单趋势图（v1.4 重做交互与视觉）
 *
 * 三个关键改动（详见 docs/v1.4-billing-overview-design.md §2.6）：
 *   ① **运维段改用 `c.meterCommitted`** —— `main.jsx:18-19` 的 `colorInfo` 与
 *      `colorPrimary` 同为 `#005BAA`，原实现里「交付/运维」是同一个颜色，
 *      只靠硬编码的 0.55 / 0.35 双档透明度区分（既存缺陷）。
 *      `meterCommitted`（#7FA8CC）是全站唯一登记的次级实色，与 brand 构成
 *      经生产验证的「主段/次段」配色；对白底 2.51:1 低于 3:1，故**必须有第二重
 *      区分通道** —— 段序恒定（下=交付 / 上=运维）+ 图例文字，此处不可省。
 *   ② **空态（累计）是一等公民**：`active` 为空 = 累计态，全部柱满色、无选中标记；
 *      单月态才有「柱下选中标记条」。两态视觉互斥，不会混淆。
 *   ③ **可发现性**：选中柱高亮 + 底部标记条 + 「再次点击可取消」提示行。
 *
 * 向后兼容：`ReconcileView`（约 L1002）以 `active` 传 `null` 表示无选中，
 * `onPick(month)` 签名不变 —— 新增的 `onClear` / `cumulativeHint` 均为可选。
 * ================================================================== */
export function TrendChart({ rows, active, onPick, onClear, cumulativeHint }) {
  const c = useT();
  const max = Math.max(...rows.map((r) => r.total), 1);
  const isCumulative = !active; // 空态 = 累计态（默认）
  const idle = c.trendIdleOpacity;

  const handleKey = (e, m) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onPick && onPick(m);
    }
  };

  /* 绘图区几何：柱高 120px，折线与柱共用同一坐标系（y = 柱顶），
     故折线必须与柱区**等宽等高、且横向按柱数等分** —— 用 SVG + preserveAspectRatio="none"
     铺满绘图区即可自动对齐，无需手工算每根柱的 x。 */
  const PLOT_H = 120;
  const linePath = rows
    .map((r, i) => {
      const x = ((i + 0.5) / rows.length) * 100; // 落在第 i 根柱的水平中心
      const y = 100 - (r.total / max) * 100; // 0 = 顶部，100 = 底部
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(3)} ${Math.max(0, Math.min(100, y)).toFixed(3)}`;
    })
    .join(' ');

  return (
    <div>
      {/* 绘图区：柱为底、趋势线为上层（pointerEvents:none 让点击穿透到柱） */}
      <div style={{ position: 'relative', padding: '8px 4px 0' }}>
        <svg
          data-testid="billing-trend-line"
          aria-hidden
          style={{
            position: 'absolute',
            left: 4,
            right: 4,
            top: 8,
            height: PLOT_H,
            width: `calc(100% - 8px)`,
            pointerEvents: 'none',
            zIndex: 1,
            overflow: 'visible'
          }}
          preserveAspectRatio="none"
          viewBox="0 0 100 100"
        >
          {/* 趋势线 = 月度合计（穿过柱顶）。堆叠柱的总额需心算相加，
              折线让「总额走势」直接可读；两者是同一数的两个信息面，不是冗余。 */}
          <path d={linePath} fill="none" stroke={c.t1} strokeWidth={1.5} vectorEffect="non-scaling-stroke" opacity={0.55} />
          {/* 折线上的数据点：半径用 vectorEffect 抗横向拉伸 */}
          {rows.map((r, i) => {
            const x = ((i + 0.5) / rows.length) * 100;
            const y = Math.max(0, Math.min(100, 100 - (r.total / max) * 100));
            const isActive = r.month === active;
            return (
              <circle
                key={r.month}
                cx={x}
                cy={y}
                r={isActive ? 2.4 : 1.4}
                fill={isActive ? c.brand : c.bg1}
                stroke={isActive ? c.brand : c.t1}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                style={{ vectorEffect: 'non-scaling-stroke' }}
              />
            );
          })}
        </svg>

        <Flex align="flex-end" gap={6} style={{ position: 'relative', zIndex: 0 }}>
          {rows.map((r) => {
          const isActive = r.month === active;
          const isDraft = r.status === 'DRAFT';
          /* 单月态：非选中柱整体降透明。累计态：满色（不降），避免与「选中」混淆 */
          const dim = !isCumulative && !isActive;
          return (
            <div
              key={r.month}
              role="button"
              tabIndex={0}
              data-testid={`billing-trend-${r.month}`}
              aria-pressed={isActive}
              aria-label={`${r.month} 账单合计 ${fmtWan(r.total)} 万元，其中交付 ${fmtWan(
                r.delivery
              )} 万元、运维 ${fmtWan(r.ops)} 万元，状态 ${statusText(r.status)}${
                isDraft ? '（待出账，不计入累计）' : ''
              }。${isActive ? '已选中，再次点击可返回累计' : '点击筛选该月'}`}
              onClick={() => (isActive && onClear ? onClear() : onPick && onPick(r.month))}
              onKeyDown={(e) => handleKey(e, r.month)}
              style={{
                flex: 1,
                textAlign: 'center',
                cursor: 'pointer',
                minWidth: 0,
                outline: 'none'
              }}
            >
              <Tooltip
                title={
                  <span style={{ fontSize: 12 }}>
                    {r.month}
                    <br />
                    交付 {fmtWan(r.delivery)} 万元 · 运维 {fmtWan(r.ops)} 万元
                    <br />
                    合计 {fmtWan(r.total)} 万元
                    {isDraft ? (
                      <>
                        <br />
                        <span style={{ opacity: 0.75 }}>待出账，不计入累计</span>
                      </>
                    ) : null}
                  </span>
                }
              >
                <div
                  style={{
                    height: PLOT_H,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-end',
                    /* 选中柱用浅底托起，让「选中」不只靠颜色表达（第二重通道） */
                    background: isActive ? c.brandBg : 'transparent',
                    borderRadius: '3px 3px 0 0'
                  }}
                >
                  {/* 段序恒定：下 = 交付计费（brand），上 = 运维计费（meterCommitted） */}
                  <div
                    style={{
                      height: `${(r.delivery / max) * 100}%`,
                      background: c.brand,
                      opacity: dim ? idle : 1
                    }}
                  />
                  <div
                    style={{
                      height: `${(r.ops / max) * 100}%`,
                      background: c.meterCommitted,
                      opacity: dim ? idle : 1
                    }}
                  />
                </div>
              </Tooltip>
              <div
                style={{
                  fontSize: 11,
                  marginTop: 6,
                  color: isActive ? c.brand : dim ? c.t3 : c.t2,
                  fontWeight: isActive ? 500 : 400
                }}
              >
                {r.month.slice(5)}月
              </div>
              {/* 状态点：DRAFT 用空心（不填色），第二重区分手段 —— 不只靠颜色 */}
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  margin: '4px auto 0',
                  background: isDraft ? 'transparent' : r.status === 'CONFIRMED' ? c.success : c.warning,
                  border: isDraft ? `1px solid ${c.t4}` : '1px solid transparent',
                  opacity: dim ? idle : 1
                }}
              />
              {/* 选中标记条：单月态专用；累计态整条留空，两态互斥 */}
              <div
                aria-hidden
                style={{
                  height: 2,
                  borderRadius: 1,
                  margin: '5px auto 0',
                  width: isActive ? 20 : 0,
                  background: c.brand
                }}
              />
            </div>
          );
        })}
        </Flex>
      </div>

      {/* 口径行：累计态明示「累计到哪个月」，单月态明示「再点一次取消」 */}
      <Flex
        justify="space-between"
        wrap
        gap={12}
        style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${c.split}` }}
      >
        {cumulativeHint ? (
          <Text style={{ fontSize: 12, color: c.t3 }}>{cumulativeHint}</Text>
        ) : (
          <Text style={{ fontSize: 12, color: c.t3 }}>点击柱状图筛选该月</Text>
        )}
        <Text style={{ fontSize: 12, color: c.t3 }}>
          圆点 = 账单状态（已核销 / 已发出 / 空心 = 待出账）
        </Text>
      </Flex>
    </div>
  );
}
