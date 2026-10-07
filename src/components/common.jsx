import React, { useState } from 'react';
import { Tag, Tooltip, Typography, Empty, Flex, Input, Select, Button } from 'antd';
import {
  CheckCircleFilled, ClockCircleFilled, ExclamationCircleFilled, MinusCircleFilled
} from '@ant-design/icons';
import { useT, levelColor } from '../theme.js';
import { fmtWan, fmtPct, POOL_LEVEL } from '../domain/calc.js';

const { Text, Title } = Typography;

/* ---------------- 页头 ---------------- */

export function PageHead({ title, desc, extra }) {
  const c = useT();
  return (
    <Flex justify="space-between" align="flex-start" gap={16} style={{ marginBottom: 16 }} wrap>
      <div style={{ minWidth: 260 }}>
        <Title level={4} style={{ margin: 0, fontSize: 18 }}>{title}</Title>
        {desc ? (
          <Text type="secondary" style={{ fontSize: 13, display: 'block', marginTop: 4 }}>
            {desc}
          </Text>
        ) : null}
      </div>
      {extra ? <div>{extra}</div> : null}
    </Flex>
  );
}

/* ---------------- 账单页首条（v1.4.5）---------------- */

/**
 * BillingHeadBar —— 账单类页面的**统一首屏条**。
 *
 * 为什么单独抽：此前《对账单总览》用「PageHead + 独立账期条」两段式，
 * 《部门账单详情页》用「主色横幅」一段式 —— 同一类页面的第一个板块
 * 长得不一样，用户从总览点进详情页会经历一次**视觉降级**（横幅塌成普通页头），
 * 且「账期筛选」在两页的位置/措辞都不同，跨页操作时找不到同一处控件。
 *
 * 统一后的结构（两页完全同构，仅内容不同）：
 *   主色底 + 左侧 4px 色条
 *   ├─ 左：36px 图标块 + 主标题(18px) + 可选副标题(12px) + 可选 Tag
 *   └─ 右：账期标签 + 账期下拉 + 页面级操作按钮组
 *
 * 关键取舍：**不塞 desc 长文**。原总览页 PageHead.desc 有 80+ 字，塞进首屏条会
 * 把右侧控件挤到第二行、并让两页的「标题区」高度不可比。业务解释下沉到各板块的
 * 脚注，首屏条只留「这是哪张账单 + 正在看哪个账期」这两个定位必需信息。
 */
export function BillingHeadBar({
  testId,
  scopeTestId,
  icon,
  title,
  subtitle,
  tag,
  scopeLabel = '账期',
  scopeValue,
  scopeOptions,
  onScopeChange,
  scopeHint,
  actions
}) {
  const c = useT();
  /* 账期下拉的锚点单独传：两页的历史测试都按 `billing-month-filter` /
     `dept-bill-month-filter` 定位它，用 `${testId}-scope` 拼会生成
     `billing-month-scope-scope` 这种读不通的名字并打断既有断言。 */
  const scopeAnchor = scopeTestId || `${testId}-scope`;
  return (
    <div
      data-testid={testId}
      style={{
        background: c.brandBg,
        border: `1px solid ${c.brandBorder}`,
        borderLeft: `4px solid ${c.brand}`,
        borderRadius: c.radius,
        padding: '14px 18px',
        marginBottom: 12
      }}
    >
      <Flex justify="space-between" align="center" gap={16} wrap>
        <Flex align="center" gap={12} style={{ minWidth: 0 }}>
          <span
            aria-hidden
            style={{
              width: 36,
              height: 36,
              borderRadius: c.radiusSm,
              background: c.brand,
              color: c.white,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              flex: '0 0 auto'
            }}
          >
            {icon}
          </span>
          <div style={{ minWidth: 0 }}>
            <Flex align="baseline" gap={8} wrap>
              <Text style={{ fontSize: 18, fontWeight: 500, color: c.t1 }}>{title}</Text>
              {tag || null}
            </Flex>
            {subtitle ? (
              <div style={{ fontSize: 12, color: c.t2, marginTop: 2 }}>{subtitle}</div>
            ) : null}
          </div>
        </Flex>
        <Flex gap={8} align="center" wrap>
          <Text style={{ fontSize: 12, color: c.t2, whiteSpace: 'nowrap' }}>{scopeLabel}</Text>
          <Select
            data-testid={scopeAnchor}
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="全部（累计）"
            value={scopeValue || undefined}
            onChange={(v) => onScopeChange && onScopeChange(v || null)}
            style={{ width: 190 }}
            options={scopeOptions}
          />
          {actions || null}
        </Flex>
      </Flex>
      {scopeHint ? (
        <div style={{ marginTop: 8, fontSize: 12, color: c.t3 }}>{scopeHint}</div>
      ) : null}
    </div>
  );
}

/* ---------------- 指标块 ---------------- */

/**
 * 指标块。
 *
 * v1.4 新增 compact 变体（合并楼层用）：合并楼层里指标卡与趋势图左右并列，
 * 卡片高度必须让位给图 —— 降的是「卡壳」（padding 14→12、间距 6→4），
 * **不是字号**（value 仍 22px/500）。字号一降就破坏「指标带」的视觉契约。
 *
 * v1.4 新增 accentBar：合计卡用「左侧 3px brand 竖条」表达「主」，
 *   不给 22px 金额数字上色（meterCommitted 对白底 2.51:1，不达 WCAG AA
 *   正文级 4.5:1，一个金额数字用这个颜色是不合格的）。
 */
export function Metric({ label, value, unit = '万元', sub, tone = 'default', tip, compact = false, accentBar = false }) {
  const c = useT();
  const toneColor =
    tone === 'danger'
      ? c.danger
      : tone === 'warning'
      ? c.warning
      : tone === 'success'
      ? c.success
      : tone === 'plain'
      ? c.t1 /* 纯信息卡：数值用正文色，不发品牌色/语义色（§11.8 反彩虹 KPI） */
      : c.brand;
  const body = (
    <div
      style={{
        background: c.bg1,
        border: `1px solid ${c.border}`,
        borderRadius: c.radius,
        padding: compact ? '12px 14px' : '14px 16px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        /* accentBar 用 border-left 占位（非叠加），不撑开布局 */
        borderLeft: accentBar ? `3px solid ${c.brand}` : undefined
      }}
    >
      <Text style={{ fontSize: 12, color: c.t3 }}>{label}</Text>
      <div style={{ marginTop: compact ? 4 : 6, display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontSize: 22, fontWeight: 500, color: toneColor, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </span>
        {unit ? <span style={{ fontSize: 12, color: c.t3 }}>{unit}</span> : null}
      </div>
      {sub ? (
        <div style={{ marginTop: compact ? 4 : 6, fontSize: 12, color: c.t3 }}>{sub}</div>
      ) : null}
    </div>
  );
  return tip ? <Tooltip title={tip}>{body}</Tooltip> : body;
}

/* ---------------- 预算池三重口径计 ---------------- */

export function PoolLegendChip({ color, label, value }) {
  const c = useT();
  return (
    <Flex align="center" gap={6} style={{ fontSize: 12, color: c.t2, minWidth: 140 }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: 'inline-block', flex: '0 0 auto' }} />
      <span style={{ whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums', color: c.t1, fontWeight: 500 }}>
        {value}
      </span>
    </Flex>
  );
}

/** 进度条口径说明（常驻常量，供表格类视图在 Table 下方统一渲染一次） */
export const POOL_CAPTION = '可用余额 = 总包 − 已承诺 − 已核销（已规划不计入）';

/**
 * 预算池消耗条：同时呈现「已核销 / 已承诺 / 可用 / 透支」四个区段，
 * 并用虚线标出「已规划」位置 —— 这是平台最核心的一个可视化。
 *
 * v0.2 改进（规范 §3.4）：
 *   I1 已承诺段改实色 meterCommitted（去掉 opacity 叠加）
 *   I2 可用段用浅底 meterTrack（空槽可辨识）
 *   I3 增加 100% 刻度线（borderStrong）
 *   I4 已规划标记升级为「虚线 + 顶部小三角」
 *   I5 容器 role=img + aria-label 摘要
 *   I6 图例数值右对齐 tabular + 口径 caption 常驻
 *   I7 比例基准：normal/watch/warn 档 base=total；over 档 base=used（透支显式溢出）
 */
export function PoolMeter({ pool, height = 12, showPlanned = true, showLegend = true }) {
  const c = useT();
  const segBilled = pool.billed || 0;
  const segCommitted = pool.committed || 0;
  const segUsed = Math.max(0, pool.used || 0);
  const total = Math.max(0, pool.total || 0);
  const segOver = Math.max(0, segUsed - total);
  const segFree = Math.max(0, total - segUsed);
  const hasOver = segOver > 0;

  // I7 比例基准修正：透支档 base = used（把已承诺 + 已核销压进 100%，透支段显式溢出）
  const base = hasOver ? Math.max(segUsed, 1) : Math.max(total, 1);
  const w = (v) => `${(v / base) * 100}%`;

  // 100% 刻度线 = 总包线位置
  const limitLeft = w(total);
  const markerLeft = showPlanned && pool.planned > 0 ? w(pool.planned) : null;

  const aria = `总包 ${fmtWan(total)} 万元，已核销 ${fmtWan(segBilled)} 万元，已承诺 ${fmtWan(
    segCommitted
  )} 万元，可用 ${fmtWan(segFree)} 万元`;

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <div
          role="img"
          aria-label={aria}
          style={{
            position: 'relative',
            height,
            borderRadius: height / 2,
            background: c.meterTrack,
            overflow: 'hidden',
            display: 'flex'
          }}
        >
          {segBilled > 0 && (
            <Tooltip title={`已核销 ${fmtWan(segBilled)} 万元`}>
              <div style={{ width: w(segBilled), background: c.meterBilled }} />
            </Tooltip>
          )}
          {segCommitted > 0 && (
            <Tooltip title={`已承诺（签收锁定，尚未出账） ${fmtWan(segCommitted)} 万元`}>
              <div style={{ width: w(segCommitted), background: c.meterCommitted }} />
            </Tooltip>
          )}
          {/* I2 可用段：浅底而非透明，空槽与「可用为 0」可区分 */}
          {segFree > 0 && <div style={{ width: w(segFree), background: c.meterTrack }} />}

          {/* I3 透支段：总包线右侧以斜纹实色显式溢出 */}
          {hasOver && (
            <div
              style={{
                position: 'absolute',
                left: limitLeft,
                right: 0,
                top: 0,
                bottom: 0,
                backgroundColor: c.meterOver,
                backgroundImage:
                  'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,.35) 4px, rgba(255,255,255,.35) 8px)'
              }}
            />
          )}

          {/* I3 100% 刻度线（总包线） */}
          <div
            style={{
              position: 'absolute',
              left: limitLeft,
              top: 0,
              bottom: 0,
              width: 1,
              background: c.borderStrong
            }}
          />
        </div>

        {/* I4 已规划虚线标记 + 顶部小三角（放在 overflow:hidden 之外，保证三角可见） */}
        {markerLeft && (
          <>
            <div
              style={{
                position: 'absolute',
                left: markerLeft,
                top: 0,
                height,
                borderLeft: `2px dashed ${c.meterPlanned}`,
                opacity: 0.9
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: markerLeft,
                top: -6,
                marginLeft: -3,
                width: 0,
                height: 0,
                borderLeft: '3px solid transparent',
                borderRight: '3px solid transparent',
                borderTop: `6px solid ${c.meterPlanned}`
              }}
            />
          </>
        )}
      </div>

      {/* I6 图例数值右对齐 tabular；caption 仅在图例形态（showLegend=true）随图例常驻；
          表格形态（showLegend=false）改为在 Table 下方统一引用 POOL_CAPTION 渲染一次 */}
      <div style={{ marginTop: showLegend ? 10 : 0 }}>
        {showLegend && (
          <Flex gap={16} wrap>
            <PoolLegendChip color={c.meterBilled} label="已核销" value={fmtWan(segBilled)} />
            <PoolLegendChip color={c.meterCommitted} label="已承诺" value={fmtWan(segCommitted)} />
            <PoolLegendChip
              color={hasOver ? c.meterOver : c.meterTrack}
              label={hasOver ? '透支' : '可用'}
              value={fmtWan(hasOver ? segOver : segFree)}
            />
            {showPlanned && (
              <PoolLegendChip color={c.meterPlanned} label="已规划（需求清单预估）" value={fmtWan(pool.planned)} />
            )}
          </Flex>
        )}
        {showLegend && <div style={{ marginTop: 6, fontSize: 12, color: c.t3 }}>{POOL_CAPTION}</div>}
      </div>
    </div>
  );
}

/* ---------------- 档位标签 ---------------- */

export function PoolLevelTag({ level, rate }) {
  const c = useT();
  const meta = POOL_LEVEL[level] || POOL_LEVEL.ok;
  const lv = levelColor(c, level);
  return (
    <Tag style={{ color: lv.text, background: lv.bg, borderColor: lv.border, marginInlineEnd: 0 }}>
      {meta.text} · {fmtPct(rate, 1)}
    </Tag>
  );
}

/* ---------------- 状态标签 ---------------- */

const BRD_STATUS = {
  DRAFT: { text: '草稿', color: 'default', icon: <MinusCircleFilled /> },
  SUBMITTED: { text: '已提报', color: 'processing', icon: <ClockCircleFilled /> },
  EVALUATING: { text: '评估中', color: 'warning', icon: <ClockCircleFilled /> },
  SIGNED: { text: '已签收', color: 'success', icon: <CheckCircleFilled /> },
  DELIVERED: { text: '已交付上线', color: 'success', icon: <CheckCircleFilled /> },
  REJECTED: { text: '已驳回', color: 'error', icon: <ExclamationCircleFilled /> }
};

export function BrdStatusTag({ status }) {
  const meta = BRD_STATUS[status] || BRD_STATUS.DRAFT;
  return (
    <Tag icon={meta.icon} color={meta.color} style={{ marginInlineEnd: 0 }}>
      {meta.text}
    </Tag>
  );
}

const BILL_STATUS = {
  CONFIRMED: { text: '已确认核销', color: 'success' },
  SENT: { text: '已发出待确认', color: 'warning' },
  DRAFT: { text: '待出账', color: 'default' }
};

export function BillStatusTag({ status }) {
  const meta = BILL_STATUS[status] || BILL_STATUS.DRAFT;
  return (
    <Tag color={meta.color} style={{ marginInlineEnd: 0 }}>
      {meta.text}
    </Tag>
  );
}

export function DemandTypeTag({ type }) {
  return type === 'NEW' ? (
    <Tag color="warning" style={{ marginInlineEnd: 0 }}>年度新增需求</Tag>
  ) : (
    <Tag color="blue" style={{ marginInlineEnd: 0 }}>年初计划内</Tag>
  );
}

export function TextTag({ children, tone = 'default' }) {
  const map = { default: undefined, ok: 'success', warn: 'warning', bad: 'error', info: 'blue' };
  return <Tag color={map[tone]} style={{ marginInlineEnd: 0 }}>{children}</Tag>;
}

/* ---------------- 空态 ---------------- */

export function Blank({ text = '暂无数据', compact = false }) {
  const c = useT();
  return (
    <div style={{ padding: compact ? '12px 0' : '32px 0' }}>
      {/* 无障碍：空态文案往往是空态下**唯一的行动指引（CTA）**，不是纯元信息，须达 WCAG AA 正文级。
          useT().t3 = colorTextTertiary（rgba(0,0,0,.45)）在白底等效 #8C8C8C ≈ 3.36:1（< 4.5:1）；
          故此处显式取 t2（colorTextSecondary，≈ #595959，白底 ≈ 7.0:1）。
          注意：不改 theme.js 的 t3 定义（全站令牌），只在本组件提升这处「必须读得清」的灰字。 */}
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={<span style={{ fontSize: 13, color: c.t2 }}>{text}</span>}
      />
    </div>
  );
}

/* ---------------- 小节标题 ---------------- */

export function BlockTitle({ children, extra }) {
  const c = useT();
  return (
    <Flex justify="space-between" align="center" style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: 14, fontWeight: 500, color: c.t1 }}>{children}</Text>
      {extra}
    </Flex>
  );
}

/**
 * FloorHead —— 楼层 / 板块标题（v1.4.2）
 *
 * 为什么不用 BlockTitle：页面已扩到 5 个板块，**板块必须一眼可辨**。
 * BlockTitle 是 14px 灰黑文字，在连续 Card 之间没有任何分隔信号，用户会把
 * 上一个板块的续表误读成新板块。本组件提供两重视觉分隔：
 *   ① 左侧 3px brand 竖条 + 16px 标题（比 BlockTitle 大 2px）
 *   ② 标题下方一条通栏细线（与卡片自身边框形成双线）
 *
 * v1.4.4 **移除 `楼层 N` 序号胶囊**（用户裁定「太傻了」）：编号只是给作者看的
 * IA 序号，不承载任何用户可操作/可理解的语义，却让读者去数数、并在增删
 * 板块后立刻过期（删一个板块就全体错号）。故 prop 与渲染一并移除，
 * 视觉分隔改由「顶部色条 + 竖条 + 通栏细线」承担 —— 信号不减，噪声归零。
 */
export function FloorHead({ children, extra, note }) {
  const c = useT();
  return (
    <div style={{ marginBottom: 12 }}>
      <Flex justify="space-between" align="center" gap={12} wrap>
        <Flex align="center" gap={8} style={{ minWidth: 0 }}>
          <span aria-hidden style={{ width: 3, height: 16, borderRadius: 2, background: c.brand, flex: '0 0 auto' }} />
          <Text style={{ fontSize: 16, fontWeight: 500, color: c.t1 }}>{children}</Text>
        </Flex>
        {extra}
      </Flex>
      {note ? (
        <div style={{ fontSize: 12, color: c.t3, marginTop: 4, marginLeft: 11 }}>{note}</div>
      ) : null}
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${c.split}` }} />
    </div>
  );
}

export function Hint({ children }) {
  const c = useT();
  return (
    <div
      style={{
        background: c.bg3,
        border: `1px solid ${c.border}`,
        borderRadius: c.radiusSm,
        padding: '10px 14px',
        fontSize: 12,
        color: c.t2,
        lineHeight: 1.7
      }}
    >
      {children}
    </div>
  );
}

/* ================================================================
 * v0.2 新增组件（规范 §3.1 / §3.2 / §3.3）
 * ================================================================ */

/* ---------------- 全局统一筛选栏 ---------------- */

/**
 * FilterBar —— 页面级统一筛选栏（规范 §3.2）。
 * props: {
 *   fields: [{ key, label, type:'select'|'month'|'keyword', options, width, placeholder }],
 *   value, onChange, resultCount, onReset,
 *   defaultValues?: { [key]: 默认值 },   // 用于「单部门深钻」等视图把某个非 all 值视为默认
 *   fyLabel?: string                     // 年度语境文字（年度控件全局唯一，页面只用文字表达）
 * }
 * 控件顺序由调用方传入的 fields 顺序决定，组件不重排（固定为
 * 年度 → 部门 → 状态 → 月份 → 需求来源 → 系统 → 关键词）。
 * 注意：年度输入控件只在 Header 出现一次，页面 FilterBar 不得再渲染年度下拉。
 */
export function FilterBar({ fields = [], value = {}, onChange, resultCount = 0, onReset, defaultValues = {}, fyLabel }) {
  const c = useT();
  const set = (k, v) => onChange && onChange({ ...value, [k]: v });
  const isDefault = (v, key) =>
    v === undefined || v === null || v === '' || v === 'all' || (key !== undefined && v === defaultValues[key]);
  const activeCount = fields.filter((f) => !isDefault(value[f.key], f.key)).length;

  return (
    <Flex
      align="center"
      justify="space-between"
      gap={12}
      wrap
      style={{
        background: c.filterBarBg,
        border: `1px solid ${c.border}`,
        borderRadius: c.radius,
        padding: 12,
        marginBottom: 12
      }}
    >
      <Flex align="center" gap={12} wrap style={{ flex: '1 1 auto', minWidth: 0 }}>
        {fields.map((f) => {
          const v = value[f.key];
          if (f.type === 'keyword') {
            return (
              <Input.Search
                key={f.key}
                allowClear
                placeholder={f.placeholder || '搜索'}
                value={v || ''}
                onChange={(e) => set(f.key, e.target.value)}
                onSearch={(val) => set(f.key, val)}
                style={{ width: f.width || 220 }}
              />
            );
          }
          return (
            <Select
              key={f.key}
              allowClear
              showSearch={f.type !== 'month'}
              optionFilterProp="label"
              placeholder={f.placeholder || f.label}
              value={isDefault(v, f.key) ? undefined : v}
              onChange={(val) => set(f.key, val === undefined ? 'all' : val)}
              style={{ width: f.width || (f.type === 'month' ? 128 : 140) }}
              options={f.options || []}
            />
          );
        })}
      </Flex>

      <Flex align="center" gap={16} style={{ flex: '0 0 auto' }}>
        {activeCount > 0 && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: c.filterChipBg,
              color: c.brand,
              fontSize: 12,
              padding: '2px 10px',
              borderRadius: 999
            }}
          >
            <span
              style={{ width: 6, height: 6, borderRadius: '50%', background: c.filterDot, display: 'inline-block' }}
            />
            已筛选 {activeCount} 项
          </span>
        )}
        {fyLabel ? (
          <Text style={{ fontSize: 12, color: c.t3, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
            {fyLabel}
          </Text>
        ) : null}
        <Text style={{ fontSize: 12, color: c.t2, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          共 {resultCount} 条
        </Text>
        <Button type="link" size="small" disabled={activeCount === 0} onClick={() => onReset && onReset()}>
          重置
        </Button>
      </Flex>
    </Flex>
  );
}

/* ---------------- 溯源链 ---------------- */

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
const CHAIN_STATE_LABEL = { done: '已完成', active: '进行中', pending: '未开始', error: '异常' };

const chainStateStyle = (c, state) => {
  switch (state) {
    case 'done':
      return {
        borderWidth: 1,
        borderColor: c.chainDone,
        background: c.chainDoneBg,
        boxShadow: 'none',
        titleColor: c.t1,
        valueColor: c.t1,
        metaColor: c.t3
      };
    case 'active':
      return {
        borderWidth: 2,
        borderColor: c.chainActive,
        background: c.bg1,
        boxShadow: `0 0 0 3px ${c.chainActive}20`, // 12% 透明外环
        titleColor: c.brand,
        valueColor: c.t1,
        metaColor: c.t3
      };
    case 'error':
      return {
        borderWidth: 1,
        borderColor: c.chainError,
        background: c.dangerBg,
        boxShadow: 'none',
        titleColor: c.dangerText,
        valueColor: c.t1,
        metaColor: c.t3
      };
    default: // pending
      return {
        borderWidth: 1,
        borderColor: c.border,
        background: c.bg3,
        boxShadow: 'none',
        titleColor: c.t3,
        valueColor: c.t3,
        metaColor: c.t3
      };
  }
};

function ChainConnector({ state }) {
  const c = useT();
  const color =
    state === 'done'
      ? c.chainDone
      : state === 'active'
      ? c.chainActive
      : state === 'error'
      ? c.chainError
      : c.chainPending;
  const dashed = state === 'pending' || state === 'active';
  return (
    <div
      aria-hidden="true"
      style={{ width: 24, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', color }}
    >
      <div style={{ flex: '1 1 auto', height: 0, borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${color}` }} />
      <span style={{ fontSize: 12, lineHeight: 1, marginLeft: -1, color }}>→</span>
    </div>
  );
}

/**
 * TraceChain —— 六节点溯源链（平台最具辨识度的组件，规范 §3.3）。
 * props: {
 *   nodes: [{ key, index, label, value, meta, state:'done'|'active'|'pending'|'error', drillable }],
 *   onDrill: (key) => void
 * }
 * 节点状态由调用方（calc.traceOf*）推导传入，组件内不判断业务状态。
 */
export function TraceChain({ nodes = [], onDrill }) {
  const c = useT();
  const [hover, setHover] = useState(null);

  const outerLabel = `溯源链：${nodes
    .map((n) => `${n.label} ${n.value || '未发生'}`)
    .join('；')}`;

  return (
    <div role="img" aria-label={outerLabel} style={{ overflowX: 'auto', paddingBottom: 4 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          minWidth: nodes.length * 128 + Math.max(0, nodes.length - 1) * 24,
          padding: '8px 2px 10px'
        }}
      >
        {nodes.map((node, i) => {
          const st = chainStateStyle(c, node.state);
          const isDrill = node.drillable !== false;
          const isHover = isDrill && hover === node.key;
          const num = CIRCLED[(node.index || i + 1) - 1] || `(${node.index || i + 1})`;
          return (
            <React.Fragment key={node.key}>
              {i > 0 && <ChainConnector state={nodes[i - 1].state} />}
              <div
                role="button"
                tabIndex={isDrill ? 0 : -1}
                aria-label={`${num}${node.label}，${node.value || '未发生'}${
                  node.meta ? '，' + node.meta : ''
                }，状态：${CHAIN_STATE_LABEL[node.state] || '未开始'}`}
                onClick={() => onDrill && onDrill(node.key)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onDrill && onDrill(node.key);
                  }
                }}
                onMouseEnter={() => setHover(node.key)}
                onMouseLeave={() => setHover((h) => (h === node.key ? null : h))}
                style={{
                  width: 128,
                  minHeight: 64,
                  flex: '0 0 auto',
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: 2,
                  padding: 8,
                  borderRadius: c.radiusSm,
                  borderWidth: st.borderWidth,
                  borderStyle: 'solid',
                  borderColor: isHover ? c.borderStrong : st.borderColor,
                  background: st.background,
                  boxShadow: st.boxShadow,
                  cursor: isDrill ? 'pointer' : 'default'
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 500, color: st.titleColor, whiteSpace: 'nowrap' }}>
                  {num} {node.label}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: st.valueColor,
                    fontVariantNumeric: 'tabular-nums',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {node.value || '—'}
                </div>
                <div style={{ fontSize: 11, color: st.metaColor, whiteSpace: 'nowrap' }}>{node.meta || ''}</div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
