/**
 * 视觉复核探针（v1.4.4）：三项减法改动的真实浏览器复验
 *
 * 覆盖：
 *   ① 账期筛选已移至页首（DOM 顺序 + 截图）
 *   ② 全站无「楼层 N」序号胶囊
 *   ③ 部门账单详情页无预算池板块
 *
 * 用法：node scripts/review-v144.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'dist', 'dkt-digital-budget-v1.0.html');
const SHOTS = path.join(ROOT, '.tmp-shots', 'v144-review');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
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
    const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('timeout ' + method)); } }, 30000);
    });
  }
}

function probe() {
  const t = document.body.innerText;
  const scope = document.querySelector('[data-testid="billing-month-scope"]');
  const first = document.querySelector('[data-testid="billing-overview-floor1"]');
  const tbl = document.querySelector('[data-testid="billing-monthly-table"]');
  return {
    hasFloorLabel: /楼层[一二三四五六七八九十]/.test(t.replace(/\s+/g, '')),
    scopeExists: !!scope,
    scopeBeforeFirst: !!(scope && first && (scope.compareDocumentPosition(first) & 4)),
    scopeText: scope ? scope.innerText.replace(/\s+/g, ' ').trim() : null,
    scopeSelects: scope ? scope.querySelectorAll('.ant-select').length : -1,
    tableSelects: tbl ? tbl.querySelectorAll('.ant-select').length : -1,
    hasPool: t.includes('预算池状态'),
    poolNode: !!document.querySelector('[data-testid="dept-bill-pool"]'),
    /* 板块标题字号抽样：确认 16px 标题仍在（移除胶囊后分隔信号未丢） */
    titleSize: (() => {
      const el = document.querySelector('[data-testid="billing-delivery-floor"]');
      const s = el && Array.from(el.querySelectorAll('span')).find((x) => x.textContent === '交付项目计费账单总览');
      return s ? s.style.fontSize : null;
    })(),
    docScrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth
  };
}

fs.mkdirSync(SHOTS, { recursive: true });
const server = http.createServer((q, s) => { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); s.end(fs.readFileSync(FILE)); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const URL_BASE = `http://127.0.0.1:${server.address().port}/`;
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9341', '--disable-gpu', '--no-first-run',
  '--user-data-dir=' + path.join(ROOT, '.tmp-shots', 'chrome-profile-v144'), 'about:blank'], { stdio: 'ignore' });

async function fetchJSON(url, tries = 40) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return await r.json(); } catch (_) {} await sleep(250); }
  throw new Error('no CDP');
}

let ws, cdp;
const out = {};
try {
  const list = await fetchJSON('http://127.0.0.1:9341/json/list');
  ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  cdp = new CDP(ws);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  const ev = async (fn) => {
    const r = await cdp.send('Runtime.evaluate', { expression: '(' + fn.toString() + ')()', returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'err');
    return r.result.value;
  };

  for (const [key, hash] of Object.entries({ overview: '#/billing/monthly', dept: '#/billing/dept/D-RETAIL' })) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url: URL_BASE + hash });
    /* 轮询等待目标板块出现，而不是死等固定毫秒 —— 首屏有 hash 归一 + 重定向副作用，
       固定 sleep 在慢机器上会读到「还没渲染完」的中间态并抛 null 错。 */
    const anchor = key === 'overview' ? 'billing-month-scope' : 'dept-bill-page';
    let ready = false;
    for (let i = 0; i < 40; i++) {
      await sleep(250);
      const hit = await cdp.send('Runtime.evaluate', {
        expression: `!!document.querySelector('[data-testid="${anchor}"]')`, returnByValue: true
      });
      if (hit.result.value) { ready = true; break; }
    }
    if (!ready) throw new Error('等待 ' + anchor + ' 超时');
    await sleep(600);
    out[key] = await ev(probe);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync(path.join(SHOTS, `v144-${key}.png`), Buffer.from(shot.data, 'base64'));
  }

  /* 交互复验：先切回总览页（上一轮循环停在 dept 页），再点趋势柱 2026-08，
     页首账期下拉应同步显示该月 —— 这是「筛选对整页生效 + 与柱状图联动」的直接证据。 */
  await cdp.send('Runtime.evaluate', { expression: `window.location.hash = '#/billing/monthly'`, returnByValue: true });
  await sleep(1400);
  await cdp.send('Runtime.evaluate', { expression: `document.querySelector('[data-testid="billing-trend-2026-08"]').click()`, returnByValue: true });
  await sleep(900);
  out.afterPick = await ev(() => {
    const sel = document.querySelector('[data-testid="billing-month-filter"] .ant-select-selection-item');
    return {
      filterValue: sel ? sel.textContent : null,
      scopeText: document.querySelector('[data-testid="billing-month-scope"]').innerText.replace(/\s+/g, ' ').trim(),
      tableNote: document.querySelector('[data-testid="billing-monthly-table"]').innerText.slice(0, 60)
    };
  });
  const shot2 = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.writeFileSync(path.join(SHOTS, 'v144-overview-picked.png'), Buffer.from(shot2.data, 'base64'));

  console.log(JSON.stringify(out, null, 2));
} finally { try { ws && ws.close(); } catch (_) {} chrome.kill(); server.close(); }
