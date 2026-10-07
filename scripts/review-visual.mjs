/**
 * 独立复验探针 4（v1.1 质量审查专用）：概览 3 卡**实测着色** + 视觉第一层级 + Anti-Slop §11 全页扫描
 *
 * 手法：把真函数用 Function.prototype.toString() 注入页面，避开模板字面量转义地狱。
 * 用法：node scripts/review-visual.mjs
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map();
    ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) { const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); } }); }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject });
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('timeout ' + method)); } }, 30000); }); }
}

/* ---- 注入的页面函数 ---- */
function probeCards() {
  const nrm = (s) => (s || '').replace(/\s+/g, '');
  const ov = document.querySelector('[data-testid="budget-ops-overview"]');
  if (!ov) return null;
  return Array.from(ov.children).map((col) => {
    const spans = col.querySelectorAll('span');
    const label = spans[0], val = spans[1];
    const d = col.querySelector('div');
    const cs = val ? getComputedStyle(val) : null;
    const ds = d ? getComputedStyle(d) : null;
    return {
      label: label ? nrm(label.textContent) : null,
      value: val ? nrm(val.textContent) : null,
      color: cs ? cs.color : null,
      fontSize: cs ? cs.fontSize : null,
      fontWeight: cs ? cs.fontWeight : null,
      bg: ds ? ds.backgroundColor : null,
      bgImage: ds && ds.backgroundImage !== 'none' ? ds.backgroundImage : null,
      border: ds ? ds.borderTopWidth + ' ' + ds.borderTopColor + ' r=' + ds.borderRadius : null,
      boxShadow: ds ? ds.boxShadow : null
    };
  });
}
function probeDecor() {
  const all = Array.from(document.querySelectorAll('*'));
  const gradients = all.filter((e) => { const bi = getComputedStyle(e).backgroundImage;
    return bi && bi !== 'none' && bi.indexOf('gradient') >= 0; })
    .map((e) => e.tagName + '.' + String(e.className).slice(0, 40));
  const shadows = all.filter((e) => { const s = getComputedStyle(e).boxShadow; return s && s !== 'none'; })
    .map((e) => e.tagName + ' :: ' + getComputedStyle(e).boxShadow.slice(0, 70));
  const bars = all.filter((e) => { const s = getComputedStyle(e);
    return parseFloat(s.borderLeftWidth) >= 3 && e.offsetHeight > 8; })
    .map((e) => e.tagName + ' bl=' + getComputedStyle(e).borderLeftWidth + ' ' + getComputedStyle(e).borderLeftColor);
  const txt = document.body.textContent || '';
  const emoji = [];
  for (const ch of txt) { const c = ch.codePointAt(0);
    if ((c >= 0x1F300 && c <= 0x1FAFF) || (c >= 0x2600 && c <= 0x27BF)) emoji.push(ch); }
  const radii = Array.from(new Set(all.map((e) => getComputedStyle(e).borderRadius)
    .filter((r) => r && r !== '0px')));
  return {
    gradients, shadows, bars,
    emoji: Array.from(new Set(emoji)),
    progress: document.querySelectorAll('.ant-progress, .ant-progress-circle, [role="progressbar"]').length,
    radii
  };
}
function probeIcons() {
  const unlabeled = Array.from(document.querySelectorAll('.anticon')).filter((e) => {
    const lbl = e.getAttribute('aria-label');
    const parentBtn = e.closest('button');
    return !lbl && !e.querySelector('title') && !(parentBtn && parentBtn.textContent.trim());
  }).length;
  return { svgTotal: document.querySelectorAll('svg').length,
           anticonTotal: document.querySelectorAll('.anticon').length,
           unlabeledIconInBareButton: unlabeled };
}

const server = http.createServer((q, s) => { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); s.end(fs.readFileSync(FILE)); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const URL_BASE = `http://127.0.0.1:${server.address().port}/`;
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9337', '--disable-gpu', '--no-first-run',
  '--user-data-dir=' + path.join(ROOT, '.tmp-shots', 'chrome-profile-v11e'), 'about:blank'], { stdio: 'ignore' });

async function fetchJSON(url, tries = 40) { for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return await r.json(); } catch (_) {} await sleep(250); } throw new Error('no CDP'); }

let ws, cdp;
try {
  const list = await fetchJSON('http://127.0.0.1:9337/json/list');
  ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  cdp = new CDP(ws);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  const ev = async (fn) => {
    const r = await cdp.send('Runtime.evaluate', { expression: '(' + fn.toString() + ')()', returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'err');
    return r.result.value;
  };

  const out = {};
  for (const [key, hash] of Object.entries({
    retail: '#/budget/opsplan/D-RETAIL',
    mktEdit: '#/budget/opsplan/D-MKT/new',
    ecomPending: '#/budget/opsplan/D-ECOM/new'
  })) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url: URL_BASE + hash });
    await sleep(1600);
    const setter = new Function('h', 'window.location.hash = h; return true;');
    await cdp.send('Runtime.evaluate', { expression: '(' + setter.toString() + ')(' + JSON.stringify(hash) + ')', returnByValue: true });
    await sleep(900);
    out[key] = { cards: await ev(probeCards), decor: await ev(probeDecor), icons: await ev(probeIcons) };
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync(path.join(SHOTS, `visual-${key}.png`), Buffer.from(shot.data, 'base64'));
  }
  console.log(JSON.stringify(out, null, 2));
} finally { try { ws && ws.close(); } catch (_) {} chrome.kill(); server.close(); }
