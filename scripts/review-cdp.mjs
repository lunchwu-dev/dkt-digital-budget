/**
 * 独立复验探针（v1.1 质量审查专用，只读不改 src/tests）
 *
 * 目的：真实 Chromium + CDP 复验四档视口下
 *   #/budget/opsplan/D-RETAIL（只读）与 #/budget/opsplan/D-ECOM/new（编辑）
 * 的 `.ant-table-content` clientWidth vs scrollWidth，判断是否出现
 * **页面级横向溢出被裁**（clientWidth === scrollWidth 但内容溢出 ⇒ 已裁不可达）。
 *
 * 用法：node scripts/review-cdp.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'dist', 'dkt-digital-budget-v1.0.html');
const SHOTS = path.join(ROOT, '.tmp-shots', 'v11-review');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

fs.mkdirSync(SHOTS, { recursive: true });

const VIEWPORTS = [
  { w: 1440, h: 900 },
  { w: 1440, h: 560 },
  { w: 1366, h: 900 },
  { w: 1280, h: 900 }
];
const ROUTES = [
  { name: 'readonly', hash: '#/budget/opsplan/D-RETAIL' },
  { name: 'edit', hash: '#/budget/opsplan/D-ECOM/new' }
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- 极简 CDP 客户端（无第三方依赖） ---------- */
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.sessionId = null;
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      }
    });
  }
  send(method, params = {}, sessionId = this.sessionId) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('CDP timeout: ' + method));
        }
      }, 30000);
    });
  }
}

/* ---------- 启动 Chrome + 静态服务 ---------- */
const server = http.createServer((req, res) => {
  const body = fs.readFileSync(FILE);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(body);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
const URL_BASE = `http://127.0.0.1:${PORT}/`;

const chrome = spawn(CHROME, [
  '--headless=new',
  '--remote-debugging-port=9333',
  '--disable-gpu',
  '--hide-scrollbars=false',
  '--no-first-run',
  '--no-default-browser-check',
  '--user-data-dir=' + path.join(ROOT, '.tmp-shots', 'chrome-profile-v11'),
  'about:blank'
], { stdio: 'ignore' });

async function fetchJSON(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
    } catch (_) { /* retry */ }
    await sleep(250);
  }
  throw new Error('无法连接 CDP: ' + url);
}

let ws, cdp;
try {
  const list = await fetchJSON('http://127.0.0.1:9333/json/list');
  const page = list.find((t) => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  cdp = new CDP(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Network.enable');

  const consoleErrors = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Log.entryAdded' && /error|deprecat|废弃/i.test(m.params.entry.text || '')) {
      consoleErrors.push(m.params.entry.text);
    }
    if (m.method === 'Runtime.exceptionThrown') {
      consoleErrors.push('EXC ' + (m.params.exceptionDetails?.exception?.description || ''));
    }
  });

  const evaluate = async (expr) => {
    const r = await cdp.send('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise: true
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval error');
    return r.result.value;
  };

  const report = [];

  for (const vp of VIEWPORTS) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: false
    });
    for (const rt of ROUTES) {
      await cdp.send('Page.navigate', { url: URL_BASE + rt.hash });
      await sleep(1500);
      // 确保 hash 生效（首次 navigate 可能带上旧 hash）
      await evaluate(`window.location.hash = ${JSON.stringify(rt.hash)}; true`);
      await sleep(900);

      const probe = await evaluate(`(() => {
        const norm = (s) => (s || '').replace(/\\s+/g, '');
        const page = document.querySelector('[data-testid="budget-ops-plan-page"]');
        const card = document.querySelector('[data-testid="budget-ops-table"]');
        const contents = Array.from(document.querySelectorAll('.ant-table-content'));
        const target = card ? card.querySelector('.ant-table-content') : null;
        const de = document.documentElement;
        const res = {
          hash: location.hash,
          pageExists: !!page,
          cardExists: !!card,
          docScrollW: de.scrollWidth,
          docClientW: de.clientWidth,
          bodyScrollW: document.body.scrollWidth,
          tableCount: contents.length,
          target: target ? { clientWidth: target.clientWidth, scrollWidth: target.scrollWidth } : null,
          // 页面级溢出被裁判据：文档 scrollWidth 不得超过 clientWidth（否则内容被裁且滚不到）
          docOverflowPx: de.scrollWidth - de.clientWidth,
          rows: card ? card.querySelectorAll('.ant-table-tbody tr.ant-table-row').length : 0,
          heads: card
            ? Array.from(card.querySelectorAll('.ant-table-thead th'))
                .filter((e) => !e.classList.contains('ant-table-cell-scrollbar'))
                .map((e) => norm(e.textContent))
            : [],
          sys04: (() => {
            if (!card) return null;
            const tr = Array.from(card.querySelectorAll('.ant-table-tbody tr')).find((r) => norm(r.textContent).includes('SYS-04'));
            const amt = document.querySelector('[data-testid="budget-ops-amount-SYS-04"]');
            return tr ? { rowText: norm(tr.textContent), amount: amt ? norm(amt.textContent) : null } : null;
          })(),
          inputs: document.querySelectorAll('[data-testid^="budget-ops-rate-"]').length,
          hasPercentInTable: card ? /%/.test(card.textContent) : null,
          testids: Array.from(document.querySelectorAll('[data-testid^="budget-ops-"]')).map((e) => e.getAttribute('data-testid')).slice(0, 40)
        };
        return res;
      })()`);

      const shotName = `${rt.name}-${vp.w}x${vp.h}.png`;
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(SHOTS, shotName), Buffer.from(shot.data, 'base64'));

      report.push({ vp: `${vp.w}x${vp.h}`, route: rt.name, shotName, ...probe });
    }
  }

  /* ---- D-SVC 「份」单位核验 ---- */
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.navigate', { url: URL_BASE + '#/budget/opsplan/D-SVC' });
  await sleep(1500);
  await evaluate(`window.location.hash = '#/budget/opsplan/D-SVC'; true`);
  await sleep(800);
  const svc = await evaluate(`(() => {
    const norm = (s) => (s || '').replace(/\\s+/g, '');
    const card = document.querySelector('[data-testid="budget-ops-table"]');
    const rows = card ? Array.from(card.querySelectorAll('.ant-table-tbody tr.ant-table-row')) : [];
    return {
      rowCount: rows.length,
      rows: rows.map((tr) => norm(tr.textContent)),
      hasPercent: card ? /%/.test(card.textContent) : null,
      titles: rows.map((tr) => { const s = tr.querySelector('[title]'); return s ? s.getAttribute('title') : null; })
    };
  })()`);

  /* ---- 主表 ③ 格点击 → 真跳页并渲染 ---- */
  await cdp.send('Page.navigate', { url: URL_BASE + '#/budget/annual' });
  await sleep(1600);
  const navProbe = await evaluate(`(() => {
    const norm = (s) => (s || '').replace(/\\s+/g, '');
    const cell = document.querySelector('[data-testid="budget-annual-cell-ops-D-RETAIL"]');
    if (!cell) return { found: false };
    const before = location.hash;
    // 真实点击：派发完整指针事件序列
    const opts = { bubbles: true, cancelable: true, view: window };
    cell.dispatchEvent(new PointerEvent('pointerdown', opts));
    cell.dispatchEvent(new MouseEvent('mousedown', opts));
    cell.dispatchEvent(new MouseEvent('mouseup', opts));
    cell.dispatchEvent(new PointerEvent('pointerup', opts));
    cell.click();
    return { found: true, before, cellText: norm(cell.textContent).slice(0, 80) };
  })()`);
  await sleep(1200);
  const navAfter = await evaluate(`(() => ({
    hash: location.hash,
    pageExists: !!document.querySelector('[data-testid="budget-ops-plan-page"]'),
    tableExists: !!document.querySelector('[data-testid="budget-ops-table"]'),
    headText: (document.querySelector('[data-testid="budget-ops-plan-page"]')||{}).textContent
      ? document.querySelector('[data-testid="budget-ops-plan-page"]').textContent.replace(/\\s+/g,' ').slice(0,160) : null,
    rowCount: document.querySelectorAll('[data-testid="budget-ops-table"] .ant-table-tbody tr.ant-table-row').length
  }))()`);
  const navShot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SHOTS, 'nav-from-annual-cell.png'), Buffer.from(navShot.data, 'base64'));

  console.log(JSON.stringify({ report, svc, navProbe, navAfter, consoleErrors }, null, 2));
} finally {
  try { ws && ws.close(); } catch (_) {}
  chrome.kill();
  server.close();
}
