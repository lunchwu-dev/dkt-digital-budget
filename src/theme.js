import { theme } from 'antd';

/**
 * 语义化 token 别名。
 * 组件内一律使用 useT() 取色，禁止硬编码十六进制颜色，
 * 这样换主题（含暗色）时无需改动任何业务组件。
 */
export function useT() {
  const { token } = theme.useToken();
  return {
    brand: token.colorPrimary,
    brandHover: token.colorPrimaryHover,
    brandText: token.colorPrimaryActive,
    brandBg: token.colorPrimaryBg,
    brandBorder: token.colorPrimaryBorder,

    white: token.colorWhite,
    bg1: token.colorBgContainer,
    bg2: token.colorBgLayout,
    bg3: token.colorFillQuaternary,
    bgElevated: token.colorBgElevated,
    fill: token.colorFillTertiary,

    t1: token.colorText,
    t2: token.colorTextSecondary,
    t3: token.colorTextTertiary,
    t4: token.colorTextQuaternary,

    split: token.colorSplit,
    border: token.colorBorderSecondary,
    borderStrong: token.colorBorder,

    success: token.colorSuccess,
    successText: token.colorSuccessText,
    successBg: token.colorSuccessBg,
    successBorder: token.colorSuccessBorder,

    warning: token.colorWarning,
    warningText: token.colorWarningText,
    warningBg: token.colorWarningBg,
    warningBorder: token.colorWarningBorder,

    danger: token.colorError,
    dangerText: token.colorErrorText,
    dangerBg: token.colorErrorBg,
    dangerBorder: token.colorErrorBorder,

    info: token.colorInfo,
    infoText: token.colorInfoText,
    infoBg: token.colorInfoBg,
    infoBorder: token.colorInfoBorder,

    /* ---- v1.6 新增：**可作正文的小字色**（13px 及以下）----
     *
     * 为什么要另立一档：antd 的 `colorXxx`（实色）是给**填充**用的（进度条、Tag 底），
     * `colorXxxText` 虽名为 Text，但实测**只有 danger / info 达 AA**，绿与橙都不达标：
     *   successText #389e0d → 3.46:1   warningText #d48806 → 2.87:1
     *   dangerText  #cf1322 → 5.57:1   infoText    #0958d9 → 6.16:1
     * 13px 正常文本需 ≥ 4.5:1（WCAG AA）。所以「档位色改成文字」这件事，
     * 不能简单地把 `color` 换成 `text` —— 那样绿/橙两档会静默不达标。
     *
     * 下面两色是**沿用 antd 同色相、按比例压暗**得到的（不引入新色相，色相不变），
     * 取"刚好达标"的最小压暗幅度，避免整行发黑：
     *   successTextStrong #2a770a → 5.61:1   warningTextStrong #9f6605 → 4.80:1
     * 灰底（#f5f5f5 页面底）下同样达标，已复核。
     *
     * 另两档无需新增 token，实测已达标：
     *   over  → `dangerText`（本项目 antd 主题的 colorErrorText #c0392b）  5.44:1
     *   watch → `infoText`（本项目 main.jsx 把 colorInfo 覆写为品牌 VI #005BAA）6.83:1
     * 注意：若哪天把 `colorInfo` 改回 antd 默认 #1677ff，`infoText` 会退到
     * 4.10:1 并**悄悄跌破 AA** —— 届时必须给 watch 档补一个 infoTextStrong。 */
    successTextStrong: '#2a770a',
    warningTextStrong: '#9f6605',

    radius: token.borderRadiusLG,
    radiusSm: token.borderRadius,
    fontNum: token.fontFamilyCode,

    // —— 可点击卡片（规范 §2.4）——
    shadow: token.boxShadowTertiary, // 静息态浅阴影
    shadowHover: token.boxShadowSecondary, // 悬停态浮起阴影

    /* ============ v0.2 扩展令牌（追加，不改既有键） ============ */

    // —— 导航（规范 §2.1.4 / §3.1）——
    navActiveIndicator: `2px solid ${token.colorPrimary}`, // 一/二级导航当前项下划线
    navHoverBg: token.colorFillQuaternary, // 导航项悬停底
    moduleBarBg: token.colorBgContainer, // 板块二级导航条底色

    // —— 筛选栏（规范 §3.2）——
    filterBarBg: token.colorBgLayout, // 页面级筛选栏底色
    filterChipBg: token.colorPrimaryBg, // "已筛选 N 项"胶囊底
    filterDot: token.colorPrimary, // 已筛选态指示点

    // —— 三重口径进度条（规范 §3.4）——
    meterBilled: token.colorPrimary, // 已核销段（= brand）
    // 已承诺段改为实色 #7FA8CC：
    // v0.1 用 info + opacity 0.55 透明叠加，在不同底色（白卡片 / 灰页面）上观感不一致，
    // 会被误判为渲染 bug，故改为实色（本项目唯一登记的非品牌/非状态色值）。
    meterCommitted: '#7FA8CC',
    meterPlanned: token.colorWarning, // 已规划虚线标记（= warning）
    meterOver: token.colorError, // 透支段（= danger）
    meterTrack: token.colorFillQuaternary, // 进度条轨道 / 可用段（= bg3）

    // —— 溯源链（规范 §3.3）——
    chainDone: token.colorPrimary, // 已完成节点
    chainActive: token.colorPrimary, // 进行中节点（+ 外环）
    chainPending: token.colorTextQuaternary, // 未开始节点
    chainError: token.colorError, // 异常节点（驳回）
    chainDoneBg: token.colorPrimaryBg, // 已完成节点底

    // —— 趋势图（v1.4 新增，恰好 1 条）——
    // 非当前柱的降透明度。**必须是单值**：柱段 / 月份标签 / 状态点三者同值，
    // 否则三者各自漂移；现状 Trend 组件内硬编码的 0.55 / 0.35 双档既无出处，
    // 且两档之间的差值关系不可追溯（视觉上像两种深浅的品牌色）。
    trendIdleOpacity: 0.42,

    // —— 密度（规范 §2.4.3）——
    tableRowCompact: 36, // 紧凑表格行高（默认）
    tableRowDefault: 44, // 标准表格行高（双行字段用）

    /* ============ v0.3 扩展令牌（追加，不改既有键） ============ */
    navActiveBar: `3px solid ${token.colorPrimary}`, // 垂直菜单选中项左侧指示条（替代横导航下划线）
    siderWidth: 224, // Sider 展开宽
    siderCollapsedWidth: 64 // Sider 折叠宽（= Header 高）
  };
}

/**
 * 预算池档位 → 语义色（不引入新色值，全部取自 token）
 *
 * v1.6：新增 `textStrong` —— **给 13px 及以下正文用的达标色**。
 * `text` 是 antd 的 `colorXxxText`，绿/橙两档实测不达 AA（3.46 / 2.87），
 * 拿它当小字色会静默不达标；`textStrong` 是同色相压暗后的达标色（5.61 / 4.80）。
 * `color` 仍保持实色，供进度条 / Tag 底 / 图表等**填充**场景使用。
 */
export function levelColor(c, level) {
  switch (level) {
    case 'over':
      return { color: c.danger, bg: c.dangerBg, border: c.dangerBorder, text: c.dangerText, textStrong: c.dangerText };
    case 'warn':
      return { color: c.warning, bg: c.warningBg, border: c.warningBorder, text: c.warningText, textStrong: c.warningTextStrong };
    case 'watch':
      return { color: c.info, bg: c.infoBg, border: c.infoBorder, text: c.infoText, textStrong: c.infoText };
    default:
      return { color: c.success, bg: c.successBg, border: c.successBorder, text: c.successText, textStrong: c.successTextStrong };
  }
}
