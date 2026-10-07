/**
 * 独立复验探针 2（v1.1 质量审查专用）：**真编辑态**四档布局 + 恒等式 + 整表编辑联动
 *
 * 背景：#/budget/opsplan/D-ECOM/new 的草稿状态是「待业务确认」⇒ editing=false（只读列），
 * 不是真编辑态。真编辑态须走 D-MKT（OPS_DRAFTS 里 status='编制中'）。
 * 用法：node scripts/review-cdp-edit.mjs
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

const VIEWPORTS = [{ w: 1440, h: 900 }, { w: 1440, h: 560 }, { w: 1366, h: 900 }, { w: 1280, h: 900 }];
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

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(fs.readFileSync(FILE));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const URL_BASE = `http://127.0.0.1:${server.address().port}/`;

const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9334', '--disable-gpu',
  '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + path.join(ROOT, '.tmp-shots', 'chrome-profile-v11b'), 'about:blank'], { stdio: 'ignore' });

async function fetchJSON(url, tries = 40) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return await r.json(); } catch (_) {}
    await sleep(250); } throw new Error('no CDP');
}

let ws, cdp;
try {
  const list = await fetchJSON('http://127.0.0.1:9334/json/list');
  const page = list.find((t) => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  cdp = new CDP(ws);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Log.enable');

  const errs = [];
  ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data);
    if (m.method === 'Log.entryAdded' && /error|deprecat|废弃/i.test(m.params.entry.text || '')) errs.push(m.params.entry.text);
    if (m.method === 'Runtime.exceptionThrown') errs.push('EXC ' + (m.params.exceptionDetails?.exception?.description || '')); });

  const ev = async (e) => { const r = await cdp.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval err'); return r.result.value; };

  const out = { layouts: [], editProbe: null, cols: null };

  for (const vp of VIEWPORTS) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url: URL_BASE + '#/budget/opsplan/D-MKT/new' });
    await sleep(1500);
    await ev(`window.location.hash = '#/budget/opsplan/D-MKT/new'; true`);
    await sleep(1000);
    const p = await ev(`(() => {
      const norm = (s) => (s || '').replace(/\\s+/g, '');
      const de = document.documentElement;
      const card = document.querySelector('[data-testid="budget-ops-table"]');
      const tc = card ? card.querySelector('.ant-table-content') : null;
      const inner = card ? card.querySelector('table') : null;
      return {
        hash: location.hash,
        pageExists: !!document.querySelector('[data-testid="budget-ops-plan-page"]'),
        statusBarText: norm((document.querySelector('[data-testid="budget-ops-inprogress"]')||{}).textContent).slice(0,120),
        heads: card ? Array.from(card.querySelectorAll('.ant-table-thead th'))
          .filter((e) => !e.classList.contains('ant-table-cell-scrollbar')).map((e) => norm(e.textContent)) : [],
        rows: card ? card.querySelectorAll('.ant-table-tbody tr.ant-table-row').length : 0,
        rateInputs: document.querySelectorAll('[data-testid^="budget-ops-rate-"]').length,
        usageInputs: document.querySelectorAll('[data-testid^="budget-ops-usage-"]').length,
        tc: tc ? { clientWidth: tc.clientWidth, scrollWidth: tc.scrollWidth, overflowX: getComputedStyle(tc).overflowX } : null,
        tableW: inner ? inner.getBoundingClientRect().width : null,
        docOverflowPx: de.scrollWidth - de.clientWidth,
        docScrollW: de.scrollWidth, docClientW: de.clientWidth,
        summary: norm((card ? card.querySelector('.ant-table-summary') : null)?.textContent || ''),
        hasSelect: !!document.querySelector('.ant-select')
      };
    })()`);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, `editstate-DMKT-${vp.w}x${vp.h}.png`), Buffer.from(shot.data, 'base64'));
    out.layouts.push({ vp: `${vp.w}x${vp.h}`, ...p });
  }

  /* ---- 真编辑态联动：改用量 → 改单价 → 观察同行费用 ---- */
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.navigate', { url: URL_BASE + '#/budget/opsplan/D-MKT/new' });
  await sleep(1600);
  await ev(`window.location.hash = '#/budget/opsplan/D-MKT/new'; true`);
  await sleep(1000);

  out.editProbe = await ev(`(async () => {
    const norm = (s) => (s || '').replace(/\\s+/g, '');
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const first = document.querySelector('[data-testid^="budget-ops-usage-"]');
    const sysId = first.getAttribute('data-testid').replace('budget-ops-usage-', '');
    const amtEl = () => document.querySelector('[data-testid="budget-ops-amount-' + sysId + '"]');
    const summary = () => norm((document.querySelector('[data-testid="budget-ops-table"] .ant-table-summary')||{}).textContent || '');
    const inp = document.querySelector('[data-testid="budget-ops-usage-' + sysId + '"]');
    const rateInp = document.querySelector('[data-testid="budget-ops-rate-' + sysId + '"]');
    const setV = (el, v) => {
      const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      d.set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const r = { sysId, amt0: norm(amtEl()?.textContent), inputValue0: inp ? inp.value : null,
                inputTag: inp ? inp.tagName : null, rateTag: rateInp ? rateInp.tagName : null,
                summary0: summary(), steps: [] };
    // 步骤 1：改用量
    setV(inp, '12345'); await sleep(500);
    r.steps.push({ act: 'setUsage=12345', amt: norm(amtEl()?.textContent), inputVal: inp.value, summary: summary() });
    // 步骤 2：改单价
    setV(document.querySelector('[data-testid="budget-ops-rate-' + sysId + '"]'), '99');
    await sleep(500);
    r.steps.push({ act: 'setRate=99', amt: norm(amtEl()?.textContent), inputVal: inp.value, summary: summary() });
    // 步骤 3：非法值（fixed 行用 2 位；order 用 1 位）→ 看 error 态
    const errInputs = Array.from(document.querySelectorAll('.ant-input-number-status-error')).length;
    r.errorStatusCount = errInputs;
    r.invalidHint = norm((document.body.textContent.match(/\\d+ 行未通过校验/) || [''])[0]);
    r.submitDisabled = document.querySelector('[data-testid="budget-ops-submit"]')?.disabled;
    return r;
  })()`);

  const shot2 = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SHOTS, 'editstate-after-input.png'), Buffer.from(shot2.data, 'base64'));

  /* ---- 列宽实测 ---- */
  out.cols = await ev(`(() => {
    const card = document.querySelector('[data-testid="budget-ops-table"]');
    if (!card) return null;
    const ths = Array.from(card.querySelectorAll('.ant-table-thead th'))
      .filter((e) => !e.classList.contains('ant-table-cell-scrollbar'));
    return { widths: ths.map((t) => ({ t: t.textContent.replace(/\\s+/g,''), w: Math.round(t.getBoundingClientRect().width) })),
             sum: ths.reduce((s,t)=>s+Math.round(t.getBoundingClientRect().width),0) };
  })()`);

  /* ---- 概览卡视觉第一层级 ---- */
  out.overview = await ev(`(() => {
    const nrm = (s) => (s || '').replace(/\\s+/g, '');
    const ov = document.querySelector('[data-testid="budget-ops-overview"]');
    if (!ov) return null;
    return Array.from(ov.children).map((col) => nrm(col.textContent).slice(0, 90));
  })()`);

  out.errs = errs;
  console.log(JSON.stringify(out, null, 2));
} finally {
  try { ws && ws.close(); } catch (_) {}
  chrome.kill(); server.close();
}
