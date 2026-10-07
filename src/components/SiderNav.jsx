import React, { useEffect, useState } from 'react';
import { ApartmentOutlined, DownOutlined } from '@ant-design/icons';
import { useT } from '../theme.js';
import { FLAT_ITEMS, BACKLOG_GROUP, MANUAL_ITEM } from '../navConfig.js';

/**
 * SiderNav —— 左侧导航（v1.5 信息架构：平铺区 + 单一「未完成」组）。
 * 手写实现（不用 antd Menu），以便精确控制 DOM 结构与 data-testid 契约。
 * props: { active: {module, view}, onNavigate(module, view, param), collapsed, onToggleCollapse }
 * 所有颜色一律走 useT()，零 hex 字面量（暗色主题自动跟随）。
 *
 * DOM 契约：
 *   平铺项  data-testid="sider-flat-{module}-{view}"
 *   组标题  data-testid="sider-group-backlog"
 *   二级项  data-testid="sider-item-{module}-{view}"   ← 沿用 v0.4 命名
 * 折叠态与展开态共用同一套 testid，测试无需分支。
 */

export default function SiderNav({ active = {}, onNavigate, collapsed = false, onToggleCollapse }) {
  const c = useT();
  const activeModule = active.module || null;
  const activeView = active.view || null;

  const isActive = (module, view) => activeModule === module && activeView === view;

  /* 「未完成」组展开态：默认收起；进入组内任一视图时自动展开。
     用「组内是否含当前视图」判定，而不是拿 module 名比字符串 —— 交付侧的
     brd/eval/cr/deliver 四个视图同属 delivery，用 module 判定会误判成
     「组已展开」在 budget 页也成立。 */
  const backlogActive = BACKLOG_GROUP.items.some((it) => isActive(it.module, it.view));
  const [open, setOpen] = useState(backlogActive);
  const [hoverKey, setHoverKey] = useState(null);

  useEffect(() => {
    if (backlogActive) setOpen(true);
  }, [backlogActive]);

  const width = collapsed ? c.siderCollapsedWidth : c.siderWidth;
  const G = BACKLOG_GROUP;

  /** 展开态的二级链接（平铺区不使用，二级只在「未完成」组内出现） */
  const renderItem = (it) => {
    const selected = isActive(it.module, it.view);
    const itemHover = hoverKey === `i:${it.module}:${it.view}`;
    return (
      <a
        key={`${it.module}-${it.view}`}
        data-testid={`sider-item-${it.module}-${it.view}`}
        aria-current={selected ? 'page' : undefined}
        href={`#/${it.module}/${it.view}`}
        onClick={(e) => {
          e.preventDefault();
          if (onNavigate) onNavigate(it.module, it.view);
        }}
        onMouseEnter={() => setHoverKey(`i:${it.module}:${it.view}`)}
        onMouseLeave={() => setHoverKey((h) => (h === `i:${it.module}:${it.view}` ? null : h))}
        style={{
          height: 36,
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 33,
          paddingRight: 12,
          borderLeft: selected ? c.navActiveBar : '3px solid transparent',
          borderRadius: c.radius,
          textDecoration: 'none',
          fontSize: 13,
          fontWeight: selected ? 500 : 400,
          color: selected ? c.brand : c.t2,
          background: selected ? c.brandBg : itemHover ? c.navHoverBg : 'transparent',
          cursor: 'pointer',
          whiteSpace: 'nowrap'
        }}
      >
        {it.label}
      </a>
    );
  };

  return (
    <aside
      data-testid="app-sider"
      data-collapsed={collapsed ? 'true' : 'false'}
      style={{
        width,
        minWidth: width,
        flex: '0 0 auto',
        height: '100vh',
        background: c.bg1,
        borderRight: `1px solid ${c.split}`,
        boxShadow: 'none',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'width .18s ease'
      }}
    >
      {/* ============ 品牌区（高 64，底边 1px split） ============ */}
      <div
        data-testid="sider-brand"
        style={{
          height: 64,
          flex: '0 0 64px',
          borderBottom: `1px solid ${c.split}`,
          paddingInline: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          gap: 10,
          overflow: 'hidden'
        }}
      >
        <ApartmentOutlined style={{ fontSize: 20, color: c.brand, flex: '0 0 auto' }} />
        {!collapsed && (
          <div style={{ lineHeight: 1.2, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: c.t1, whiteSpace: 'nowrap' }}>
              数字化项目预算管理平台
            </div>
            <div style={{ fontSize: 11, color: c.t3, whiteSpace: 'nowrap' }}>Decathlon China · Digital</div>
          </div>
        )}
      </div>

      {/* ============ 导航区：平铺区 + 「未完成」组 ============ */}
      <nav
        data-testid="sider-menu"
        aria-label="主导航"
        style={{ flex: '1 1 auto', overflowY: 'auto', padding: 8 }}
      >
        {FLAT_ITEMS.map((it) => {
          const Icon = it.Icon;
          const selected = isActive(it.module, it.view);
          const flatHover = hoverKey === `f:${it.module}:${it.view}`;

          /* ---- 折叠态：仅图标（居中）；点击 = 展开侧边栏并直达该页 ---- */
          if (collapsed) {
            return (
              <button
                key={`flat-${it.module}-${it.view}`}
                type="button"
                data-testid={`sider-flat-${it.module}-${it.view}`}
                aria-current={selected ? 'page' : undefined}
                aria-label={it.label}
                title={it.label}
                onClick={() => {
                  if (onToggleCollapse) onToggleCollapse();
                  if (onNavigate) onNavigate(it.module, it.view);
                }}
                onMouseEnter={() => setHoverKey(`f:${it.module}:${it.view}`)}
                onMouseLeave={() => setHoverKey((h) => (h === `f:${it.module}:${it.view}` ? null : h))}
                style={{
                  height: 44,
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: c.radius,
                  background: selected ? c.brandBg : flatHover ? c.navHoverBg : 'transparent',
                  color: selected ? c.brand : c.t2,
                  position: 'relative',
                  marginBottom: 2
                }}
              >
                {selected && (
                  <span
                    aria-hidden
                    style={{
                      position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
                      background: c.brand, borderRadius: '0 2px 2px 0'
                    }}
                  />
                )}
                <Icon style={{ fontSize: 18 }} />
              </button>
            );
          }

          /* ---- 展开态：平铺行（与组标题同高 40，视觉上对齐） ---- */
          return (
            <a
              key={`flat-${it.module}-${it.view}`}
              data-testid={`sider-flat-${it.module}-${it.view}`}
              aria-current={selected ? 'page' : undefined}
              href={`#/${it.module}/${it.view}`}
              onClick={(e) => {
                e.preventDefault();
                if (onNavigate) onNavigate(it.module, it.view);
              }}
              onMouseEnter={() => setHoverKey(`f:${it.module}:${it.view}`)}
              onMouseLeave={() => setHoverKey((h) => (h === `f:${it.module}:${it.view}` ? null : h))}
              style={{
                height: 40,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                paddingLeft: 12,
                paddingRight: 12,
                borderLeft: selected ? c.navActiveBar : '3px solid transparent',
                borderRadius: c.radius,
                textDecoration: 'none',
                fontSize: 13,
                fontWeight: selected ? 500 : 400,
                color: selected ? c.brand : c.t1,
                background: selected ? c.brandBg : flatHover ? c.navHoverBg : 'transparent',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              <Icon style={{ fontSize: 16, color: selected ? c.brand : c.t2, flex: '0 0 auto' }} />
              <span style={{ whiteSpace: 'nowrap' }}>{it.label}</span>
            </a>
          );
        })}

        {/* ---------- 「未完成」组：分隔线 + 可折叠标题 ---------- */}
        {(() => {
          const Icon = G.Icon;
          const groupHover = hoverKey === `g:${G.key}`;

          if (collapsed) {
            return (
              <button
                key={G.key}
                type="button"
                data-testid={`sider-group-${G.key}`}
                aria-expanded={open}
                aria-label={`${G.label} · ${G.subtitle}`}
                title={`${G.label} · ${G.subtitle}`}
                onClick={() => {
                  if (onToggleCollapse) onToggleCollapse();
                  setOpen((o) => !o);
                }}
                onMouseEnter={() => setHoverKey(`g:${G.key}`)}
                onMouseLeave={() => setHoverKey((h) => (h === `g:${G.key}` ? null : h))}
                style={{
                  height: 44,
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: c.radius,
                  background: backlogActive ? c.brandBg : groupHover ? c.navHoverBg : 'transparent',
                  color: backlogActive ? c.brand : c.t2,
                  position: 'relative',
                  marginTop: 8,
                  paddingTop: 8
                }}
              >
                {backlogActive && (
                  <span
                    aria-hidden
                    style={{
                      position: 'absolute', left: 0, top: 8, bottom: 0, width: 3,
                      background: c.brand, borderRadius: '0 2px 2px 0'
                    }}
                  />
                )}
                <Icon style={{ fontSize: 18 }} />
              </button>
            );
          }

          return (
            <div key={G.key} data-testid="sider-backlog" style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${c.split}` }}>
              <button
                type="button"
                data-testid={`sider-group-${G.key}`}
                aria-expanded={open}
                aria-controls={`sider-sub-${G.key}`}
                onClick={() => setOpen((o) => !o)}
                onMouseEnter={() => setHoverKey(`g:${G.key}`)}
                onMouseLeave={() => setHoverKey((h) => (h === `g:${G.key}` ? null : h))}
                style={{
                  height: 40,
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  paddingInline: 12,
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  borderRadius: c.radius,
                  fontSize: 13,
                  fontWeight: 500,
                  color: c.t1,
                  background: groupHover ? c.navHoverBg : 'transparent'
                }}
              >
                <Icon style={{ fontSize: 16, color: c.t3, flex: '0 0 auto' }} />
                <span style={{ whiteSpace: 'nowrap' }}>{G.label}</span>
                {/* 「规划中」状态标记：组内页尚未上线，避免被误认为已交付能力 */}
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 10,
                    lineHeight: '16px',
                    padding: '0 5px',
                    borderRadius: 2,
                    color: c.t3,
                    background: c.fill,
                    border: `1px solid ${c.split}`,
                    whiteSpace: 'nowrap'
                  }}
                >
                  规划中
                </span>
                <span
                  style={{
                    marginLeft: 'auto',
                    fontSize: 10,
                    color: c.t3,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2
                  }}
                >
                  {G.items.length}
                  <DownOutlined
                    style={{
                      fontSize: 10,
                      transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
                      transition: 'transform .18s ease'
                    }}
                  />
                </span>
              </button>

              <div
                id={`sider-sub-${G.key}`}
                data-testid={`sider-sub-${G.key}`}
                style={{ display: open ? 'block' : 'none' }}
              >
                {G.items.map(renderItem)}
              </div>
            </div>
          );
        })()}

        {/* ---------- 独立工具页：站点说明书 ----------
            与业务平铺区、「未完成」组都不同档：它既不是业务能力，也不在规划中。
            用分隔线单独隔开，位置固定在导航底部（常见「帮助/说明」位）。 */}
        {(() => {
          const M = MANUAL_ITEM;
          const Icon = M.Icon;
          const selected = isActive(M.module, M.view);
          const manualHover = hoverKey === 'm:manual';

          if (collapsed) {
            return (
              <button
                key="manual"
                type="button"
                data-testid="sider-manual"
                aria-current={selected ? 'page' : undefined}
                aria-label={M.label}
                title={M.label}
                onClick={() => {
                  if (onToggleCollapse) onToggleCollapse();
                  if (onNavigate) onNavigate(M.module, M.view);
                }}
                onMouseEnter={() => setHoverKey('m:manual')}
                onMouseLeave={() => setHoverKey((h) => (h === 'm:manual' ? null : h))}
                style={{
                  height: 44,
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: c.radius,
                  background: selected ? c.brandBg : manualHover ? c.navHoverBg : 'transparent',
                  color: selected ? c.brand : c.t2,
                  position: 'relative',
                  marginTop: 8,
                  paddingTop: 8
                }}
              >
                {selected && (
                  <span
                    aria-hidden
                    style={{
                      position: 'absolute', left: 0, top: 8, bottom: 0, width: 3,
                      background: c.brand, borderRadius: '0 2px 2px 0'
                    }}
                  />
                )}
                <Icon style={{ fontSize: 18 }} />
              </button>
            );
          }

          return (
            <div
              key="manual"
              data-testid="sider-manual-wrap"
              style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${c.split}` }}
            >
              <a
                data-testid="sider-manual"
                aria-current={selected ? 'page' : undefined}
                href={`#/${M.module}/${M.view}`}
                onClick={(e) => {
                  e.preventDefault();
                  if (onNavigate) onNavigate(M.module, M.view);
                }}
                onMouseEnter={() => setHoverKey('m:manual')}
                onMouseLeave={() => setHoverKey((h) => (h === 'm:manual' ? null : h))}
                style={{
                  height: 40,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  paddingLeft: 12,
                  paddingRight: 12,
                  borderLeft: selected ? c.navActiveBar : '3px solid transparent',
                  borderRadius: c.radius,
                  textDecoration: 'none',
                  fontSize: 13,
                  fontWeight: selected ? 500 : 400,
                  color: selected ? c.brand : c.t1,
                  background: selected ? c.brandBg : manualHover ? c.navHoverBg : 'transparent',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                <Icon style={{ fontSize: 16, color: selected ? c.brand : c.t2, flex: '0 0 auto' }} />
                <span style={{ whiteSpace: 'nowrap' }}>{M.label}</span>
              </a>
            </div>
          );
        })()}
      </nav>
    </aside>
  );
}
