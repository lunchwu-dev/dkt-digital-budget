/**
 * 终审探针（v1.1 减卡后）：四档真实浏览器布局实测 1440 / 1366 / 1280 / 1024
 *
 * 核查项（team-lead 指定）：
 *   1. docOverflowPx = documentElement.scrollWidth - clientWidth（必须 0）
 *   2. .ant-card 是否被 overflow:hidden 裁切
 *   3. 减卡后 2 张 md-12 卡：1440/1366 并排各占半行；1280/1024 是否正确折行堆叠
 *   4. 只读态表格 1440/1366 无横向滚动；1280 下 920 列宽仍不滚
 *
 * 手法：真函数 Function.prototype.toString() 注入，避开模板字面量转义。
 * 用法：node scripts/review-layout-final.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'dist', 'dkt-digital-budget-v1.0.html');
const SHOTS = path.join(ROOT, '.tmp-shots', 'v11-final');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map();
    ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) { const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); } }); }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject });
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('timeout ' + method)); } }, 40000); }); }
}

/* ---------- 注入的页面函数 ---------- */
function probeAll() {
  const nrm = (s) => (s || '').replace(/\s+/g, '');
  const de = document.documentElement;
  const page = document.querySelector('[data-testid="budget-ops-plan-page"]');
  const ov = document.querySelector('[data-testid="budget-ops-overview"]');
  const card = document.querySelector('[data-testid="budget-ops-table"]');
  const tc = card ? card.querySelector('.ant-table-content') : null;

  /* 1. 概览卡：数量 / 栅格类 / 实际像素宽 / 垂直位置（判断并排 or 堆叠） */
  let cards = [];
  if (ov) {
    const cols = Array.from(ov.children);
    cards = cols.map((c) => {
      const r = c.getBoundingClientRect();
      const spans = c.querySelectorAll('span');
      const lab = spans[0], val = spans[1];
      const cs = val ? getComputedStyle(val) : null;
      return {
        label: lab ? nrm(lab.textContent) : null,
        value: val ? nrm(val.textContent) : null,
        color: cs ? cs.color : null,
        fontSize: cs ? cs.fontSize : null,
        cls: String(c.className).replace(/ant-col/g, 'C'),
        w: Math.round(r.width),
        h: Math.round(r.height),
        top: Math.round(r.top),
        left: Math.round(r.left)
      };
    });
  }
  const sameRow = cards.length === 2 ? Math.abs(cards[0].top - cards[1].top) <= 2 : null;
  const halfWidth = cards.length === 2 ? Math.abs(cards[0].w - cards[1].w) <= 2 : null;

  /* 2. .ant-card 裁切检查：scrollWidth vs clientWidth + overflow 计算值 */
  const cards2 = Array.from(document.querySelectorAll('.ant-card')).map((e) => {
    const s = getComputedStyle(e);
    return {
      testid: e.getAttribute('data-testid') || '',
      overflow: s.overflow,
      overflowX: s.overflowX,
      clientW: e.clientWidth,
      scrollW: e.scrollWidth,
      clipped: e.scrollWidth > e.clientWidth + 1 && s.overflowX !== 'visible' && s.overflowX !== 'scroll' && s.overflowX !== 'auto'
    };
  });

  /* 3. 表格横向滚动 */
  const table = tc ? {
    clientWidth: tc.clientWidth,
    scrollWidth: tc.scrollWidth,
    overflowX: getComputedStyle(tc).overflowX,
    hasHScroll: tc.scrollWidth > tc.clientWidth + 1
  } : null;

  return {
    hash: location.hash,
    pageExists: !!page,
    docOverflowPx: de.scrollWidth - de.clientWidth,
    docClientW: de.clientWidth,
    cardCount: cards.length,
    cards,
    sameRow,
    halfWidth,
    antCards: cards2,
    table,
    rows: card ? card.querySelectorAll('.ant-table-tbody tr.ant-table-row').length : 0,
    summary: nrm((card ? card.querySelector('.ant-table-summary') : null) ? card.querySelector('.ant-table-summary').textContent : ''),
    footnote: nrm((() => {
      const d = Array.from(card ? card.querySelectorAll('div') : []);
      const t = d.map((x) => nrm(x.textContent)).filter((s) => s.indexOf('编制口径') === 0);
      return t.length ? t[t.length - 1] : '';
    })())
  };
}

const server = http.createServer((q, s) => { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); s.end(fs.readFileSync(FILE)); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const URL_BASE = `http://127.0.0.1:${server.address().port}/`;
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9461', '--disable-gpu', '--no-first-run',
  '--no-default-browser-check',
  '--user-data-dir=' + path.join(ROOT, '.tmp-shots', 'prof-final-' + Date.now()), 'about:blank'], { stdio: 'ignore' });

async function fetchJSON(url, tries = 40) { for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return await r.json(); } catch (_) {} await sleep(250); } throw new Error('no CDP'); }

let ws, cdp;
try {
  const list = await fetchJSON('http://127.0.0.1:9461/json/list');
  ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  cdp = new CDP(ws);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Log.enable');
  const errs = [];
  ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data);
    if (m.method === 'Log.entryAdded' && /error|deprecat/i.test(m.params.entry.text || '')) errs.push(m.params.entry.text);
    if (m.method === 'Runtime.exceptionThrown') errs.push('EXC ' + (m.params.exceptionDetails?.exception?.description || '')); });
  const ev = async (fn) => {
    const r = await cdp.send('Runtime.evaluate', { expression: '(' + fn.toString() + ')()', returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'err');
    return r.result.value;
  };
  const setHash = async (h) => {
    const fn = new Function('h', 'window.location.hash = h; return true;');
    await cdp.send('Runtime.evaluate', { expression: '(' + fn.toString() + ')(' + JSON.stringify(h) + ')', returnByValue: true });
  };

  const VPS = [1440, 1366, 1280, 1024];
  const ROUTES = [
    { name: 'readonly', hash: '#/budget/opsplan/D-RETAIL' },
    { name: 'edit', hash: '#/budget/opsplan/D-MKT/new' }
  ];
  const out = [];
  for (const w of VPS) {
    for (const rt of ROUTES) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false });
      await cdp.send('Page.navigate', { url: URL_BASE + rt.hash });
      await sleep(1500);
      await setHash(rt.hash);
      await sleep(1000);
      const p = await ev(probeAll);
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(SHOTS, `${rt.name}-${w}x900.png`), Buffer.from(shot.data, 'base64'));
      out.push({ vp: `${w}x900`, route: rt.name, ...p });
    }
  }
  console.log(JSON.stringify({ out, errs }, null, 2));
} finally { try { ws && ws.close(); } catch (_) {} chrome.kill(); server.close(); }
