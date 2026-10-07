/**
 * 探针：两页首屏条骨架逐项 dump（v1.4.5 断言调试用）
 * 用法：node scripts/probe-headbar.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'dist', 'dkt-digital-budget-v1.0.html');
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

const server = http.createServer((q, s) => { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); s.end(fs.readFileSync(FILE)); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const URL_BASE = `http://127.0.0.1:${server.address().port}/`;
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9343', '--disable-gpu', '--no-first-run',
  '--user-data-dir=' + path.join(ROOT, '.tmp-shots', 'chrome-profile-probe-hb'), 'about:blank'], { stdio: 'ignore' });

async function fetchJSON(url, tries = 40) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return await r.json(); } catch (_) {} await sleep(250); }
  throw new Error('no CDP');
}

let ws, cdp;
try {
  const list = await fetchJSON('http://127.0.0.1:9343/json/list');
  ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  cdp = new CDP(ws);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  /* ev(fn, ...args)：把额外参数序列化成实参传入页面函数。
     少这一步会让页面函数里的形参为 undefined，报错伪装成「元素为 null」。 */
  const ev = async (fn, ...args) => {
    const expr = '(' + fn.toString() + ')(' + args.map((a) => JSON.stringify(a)).join(',') + ')';
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'err');
    return r.result.value;
  };

  for (const [key, hash, anchor] of [
    ['dept', '#/billing/dept/D-RETAIL', 'dept-bill-banner'],
    ['overview', '#/billing/monthly', 'billing-month-scope']
  ]) {
    await cdp.send('Page.navigate', { url: URL_BASE + hash });
    let ok = false;
    for (let i = 0; i < 40; i++) {
      await sleep(250);
      const hit = await cdp.send('Runtime.evaluate', { expression: `!!document.querySelector('[data-testid="${anchor}"]')`, returnByValue: true });
      if (hit.result.value) { ok = true; break; }
    }
    if (!ok) throw new Error('timeout ' + anchor);
    await sleep(500);
    const dump = await ev((a) => {
      const el = document.querySelector('[data-testid="' + a + '"]');
      const sel = el.querySelector('.ant-select');
      const titleSpan = Array.from(el.querySelectorAll('span')).find((s) => /font-size:\s*18px/.test(s.getAttribute('style') || ''));
      return {
        text: el.innerText.replace(/\s+/g, ' ').trim().slice(0, 200),
        hasSelect: !!sel,
        selText: sel ? sel.textContent.trim() : null,
        hasScopeLabel: Array.from(el.querySelectorAll('span')).some((s) => s.textContent.trim() === '账期'),
        titleFound: !!titleSpan,
        titleText: titleSpan ? titleSpan.textContent.trim() : null,
        selectAfterTitle: !!(titleSpan && sel && (titleSpan.compareDocumentPosition(sel) & 4)),
        buttons: Array.from(el.querySelectorAll('button')).map((b) => b.textContent.trim()),
        iconAria: !!el.querySelector('span[aria-hidden="true"]'),
        iconStyle: el.querySelector('span[aria-hidden="true"]') ? el.querySelector('span[aria-hidden="true"]').getAttribute('style') : null,
        barStyle: el.getAttribute('style')
      };
    }, anchor);
    console.log(key, JSON.stringify(dump, null, 2));
  }
} finally { try { ws && ws.close(); } catch (_) {} chrome.kill(); server.close(); }
