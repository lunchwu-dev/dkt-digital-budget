/**
 * 独立复验探针 3（v1.1 质量审查专用）：**双真相口径打架**核验
 *
 * 假设：/new 编辑态下，概览卡「年度总费用」= pg.totalAmount（正式明细合计），
 *       而表底 summary「合计」= listTotal（草稿缓冲 items 求和）。
 *       一旦用户编辑，两者立刻分叉且**都未标注口径** ⇒ 同一页出现两个"总费用"。
 * 用法：node scripts/review-dualtruth.mjs
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

const server = http.createServer((q, s) => { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); s.end(fs.readFileSync(FILE)); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const URL_BASE = `http://127.0.0.1:${server.address().port}/`;
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9335', '--disable-gpu', '--no-first-run',
  '--user-data-dir=' + path.join(ROOT, '.tmp-shots', 'chrome-profile-v11c'), 'about:blank'], { stdio: 'ignore' });

async function fetchJSON(url, tries = 40) { for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return await r.json(); } catch (_) {} await sleep(250); } throw new Error('no CDP'); }

let ws, cdp;
try {
  const list = await fetchJSON('http://127.0.0.1:9335/json/list');
  ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  cdp = new CDP(ws);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  const ev = async (e) => { const r = await cdp.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'err'); return r.result.value; };

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.navigate', { url: URL_BASE + '#/budget/opsplan/D-MKT/new' });
  await sleep(1700);
  await ev(`window.location.hash = '#/budget/opsplan/D-MKT/new'; true`);
  await sleep(1000);

  const res = await ev(`(async () => {
    const nrm = (s) => (s || '').replace(/\\s+/g, '');
    const sl = (ms) => new Promise(r => setTimeout(r, ms));
    const cardMetric = () => {
      const ov = document.querySelector('[data-testid="budget-ops-overview"]');
      const cols = ov ? Array.from(ov.children) : [];
      // 第 2 张卡 = 年度总费用
      return cols[1] ? nrm(cols[1].textContent) : null;
    };
    const tableSummary = () => {
      const s = document.querySelector('[data-testid="budget-ops-table"] .ant-table-summary');
      return s ? nrm(s.textContent) : null;
    };
    const r = { steps: [] };
    r.steps.push({ stage: '进入编辑态（未改动）', overviewCard: cardMetric(), tableSummary: tableSummary() });

    const inp = document.querySelector('[data-testid^="budget-ops-usage-"]');
    const sysId = inp.getAttribute('data-testid').replace('budget-ops-usage-', '');
    r.sysId = sysId;
    const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    d.set.call(inp, '1'); inp.dispatchEvent(new Event('input', { bubbles: true }));
    await sl(600);
    r.steps.push({ stage: '把 ' + sysId + ' 用量改为 1', overviewCard: cardMetric(), tableSummary: tableSummary() });

    // 概览卡是否有任何"草稿/编辑中/正式"口径标注？
    const ov = document.querySelector('[data-testid="budget-ops-overview"]');
    r.overviewCardFullText = ov ? nrm(ov.textContent) : null;
    r.overviewHasDraftHint = /草稿|编辑中|待提交|正式/.test(ov ? ov.textContent : '');
    r.tableSummaryFullText = tableSummary();
    r.tableHasDraftHint = /草稿|编辑中|待提交|正式/.test(tableSummary() || '');

    // 只读态对照：D-MKT 基础视图
    window.location.hash = '#/budget/opsplan/D-MKT';
    await sl(1200);
    r.readonly = { overviewCard: cardMetric(), tableSummary: tableSummary() };
    return r;
  })()`);

  console.log(JSON.stringify(res, null, 2));
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SHOTS, 'dualtruth-after-edit.png'), Buffer.from(shot.data, 'base64'));
} finally { try { ws && ws.close(); } catch (_) {} chrome.kill(); server.close(); }
