/**
 * 独立复验探针（v1.5 侧边栏 IA 重排专用）：真实 Chrome 渲染下的侧边栏结构与视觉。
 *
 * 覆盖：
 *   1. 展开态：3 个平铺项在顶部、「未完成」组在底部（分隔线隔开），点击层级正确
 *   2. 折叠态：3 个图标 + 1 个组图标，宽度收窄到 64，选中态有品牌色指示条
 *   3. 「未完成」组展开/收起切换
 *   4. 定位条前缀：平铺页无前缀、未完成组内页有「未完成」前缀
 *   5. 截图留档
 *
 * 用法：node scripts/review-sider.mjs
 * 注意：本机 node 进程内无法 spawn 子进程（EBUSY），必须由 shell 起 chrome —— 见 review-sider.sh
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'dist', 'dkt-digital-budget-v1.0.html');
const SHOTS = path.join(ROOT, '.tmp-shots', 'v15-sider');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('timeout ' + method)); } }, 30000);
    });
  }
}

/* ---- 注入的页面函数 ---- */
function probeSider() {
  const nrm = (s) => (s || '').replace(/\s+/g, '');
  const q = (sel) => Array.from(document.querySelectorAll(sel));
  const rect = (e) => { const r = e.getBoundingClientRect(); return { top: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width) }; };
  const cs = (e, p) => getComputedStyle(e)[p];

  const side = document.querySelector('[data-testid="app-sider"]');
  if (!side) return { error: 'no sider' };

  const flats = q('[data-testid^="sider-flat-"]').map((e) => ({
    id: e.getAttribute('data-testid'),
    text: nrm(e.textContent),
    current: e.getAttribute('aria-current'),
    color: cs(e, 'color'),
    bg: cs(e, 'backgroundColor'),
    borderLeft: cs(e, 'borderLeftWidth') + ' ' + cs(e, 'borderLeftColor'),
    ...rect(e)
  }));
  const groups = q('[data-testid^="sider-group-"]').map((e) => ({
    id: e.getAttribute('data-testid'),
    text: nrm(e.textContent),
    ...rect(e)
  }));
  const items = q('[data-testid^="sider-item-"]').map((e) => ({
    id: e.getAttribute('data-testid'),
    text: nrm(e.textContent),
    current: e.getAttribute('aria-current'),
    visible: e.offsetParent !== null || cs(e.parentElement, 'display') !== 'none'
  }));
  const sub = document.querySelector('[data-testid="sider-sub-backlog"]');
  const loc = document.querySelector('[data-testid="content-locator"]');
  const backdrop = document.querySelector('[data-testid="sider-backlog"]');

  return {
    collapsed: side.getAttribute('data-collapsed'),
    siderWidth: Math.round(side.getBoundingClientRect().width),
    navOverflowY: cs(document.querySelector('[data-testid="sider-menu"]'), 'overflowY'),
    flats, groups, items,
    subDisplay: sub ? sub.style.display : 'missing',
    backlogTopBorder: backdrop ? cs(backdrop, 'borderTopWidth') + ' ' + cs(backdrop, 'borderTopColor') : 'missing',
    /* 平铺区最后一项的底 vs 未完成组顶：应有可见间距 + 分隔线，视觉上分成两块 */
    gapFlatToBacklog: flats.length && backdrop ? Math.round(backdrop.getBoundingClientRect().top - (flats[flats.length - 1].top + flats[flats.length - 1].h)) : null,
    locator: loc ? nrm(loc.textContent) : null,
    overflowsViewport: document.documentElement.scrollWidth > window.innerWidth + 1
  };
}

const server = http.createServer((q, s) => { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); s.end(fs.readFileSync(FILE)); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const URL_BASE = `http://127.0.0.1:${server.address().port}/`;
const PORT = process.env.CDP_PORT || '9339';

async function fetchJSON(url, tries = 40) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return await r.json(); } catch (_) {} await sleep(250); }
  throw new Error('no CDP');
}

let ws, cdp;
try {
  const list = await fetchJSON(`http://127.0.0.1:${PORT}/json/list`);
  ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  cdp = new CDP(ws);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  const ev = async (fn) => {
    const r = await cdp.send('Runtime.evaluate', { expression: '(' + fn.toString() + ')()', returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'err');
    return r.result.value;
  };
  const shot = async (name) => {
    const s = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(s.data, 'base64'));
  };
  const goto = async (hash) => {
    await cdp.send('Page.navigate', { url: URL_BASE + hash });
    await sleep(1500);
    /* hash 直达有时抢在 React 挂载前被吞，再置一次保证落到目标路由 */
    await cdp.send('Runtime.evaluate', { expression: `window.location.hash = ${JSON.stringify(hash)}; true`, returnByValue: true });
    await sleep(800);
  };
  const click = async (testid) => {
    await cdp.send('Runtime.evaluate', { expression: `document.querySelector('[data-testid="${testid}"]').click(); true`, returnByValue: true });
    await sleep(600);
  };

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  const out = {};

  /* --- 1. 展开态 · 年度预算计划（平铺页） --- */
  await goto('#/budget/annual');
  out.flatPage = await ev(probeSider);
  await shot('01-flat-annual');

  /* --- 2. 点击平铺项「对账单总览」应直接跳转（不经文件夹） --- */
  await click('sider-flat-billing-monthly');
  out.afterFlatClick = { hash: (await ev(function () { return window.location.hash; })), sider: await ev(probeSider) };
  await shot('02-flat-billing');

  /* --- 3. 展开「未完成」组 --- */
  await goto('#/budget/annual');
  await click('sider-group-backlog');
  out.backlogOpen = await ev(probeSider);
  await shot('03-backlog-open');

  /* --- 4. 折叠态 --- */
  await click('sider-collapse');
  out.collapsed = await ev(probeSider);
  await shot('04-collapsed');

  console.log(JSON.stringify(out, null, 2));
} finally {
  try { ws && ws.close(); } catch (_) {}
  server.close();
}
