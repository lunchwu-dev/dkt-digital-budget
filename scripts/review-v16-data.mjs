/**
 * v1.6 mock 数据重构 · 真实浏览器复验探针
 *
 * 为什么必须有这个：jsdom 冒烟全绿 ≠ 新数据真的渲染出来了。
 * 工作区已踩过两次坑——① 漏 import 时 Vite build 仍成功、页面白屏；
 * ② 数据层改了但页面分支没走到，测试照样全绿。
 * 本探针在真实 Chrome 里核对**渲染结果**，而不是核对 calc 返回值。
 *
 * 覆盖 4 项本轮重构目标：
 *   A. 白屏检查（body 有内容、根节点挂载）
 *   B. 交付楼层行数 17 / 「待复盘」态可见 / ROI 列出现「—」
 *   C. 预算消耗 FY2026 四档着色真实落到DOM 颜色上（含同一行内异色行）
 *   D. 年度预算计划：「未提供文档」+「待复核确认」两种新态真的渲染出来
 *
 * 用法：CDP_PORT=9341 node scripts/review-v16-data.mjs
 * 注意：本机 node 进程内无法 spawn 子进程（EBUSY），必须由 shell 起 chrome —— 见 review-v16-data.sh
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'dist', 'dkt-digital-budget-v1.0.html');
const SHOTS = path.join(ROOT, '.tmp-shots', 'v16-data');
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

/* ---- A. 白屏 + 通用探针 ---- */
function probeBoot() {
  const root = document.getElementById('root');
  const body = document.body;
  return {
    rootChildren: root ? root.children.length : -1,
    bodyTextLen: (body.innerText || body.textContent || '').trim().length,
    tables: document.querySelectorAll('.ant-table').length,
    rows: document.querySelectorAll('.ant-table-tbody tr.ant-table-row').length,
    /* 白屏时这两者会是 0 */
    notBlank: !!root && root.children.length > 0 && (body.innerText || body.textContent || '').trim().length > 40
  };
}

/* ---- B. 交付计费楼层：行数 + 待复盘 + ROI「—」 ---- */
function probeDeliveryFloor() {
  const nrm = (s) => (s || '').replace(/\s+/g, '');
  const card = document.querySelector('[data-testid="billing-delivery-floor"]');
  if (!card) return { error: 'floor missing' };
  const rows = Array.from(card.querySelectorAll('.ant-table-tbody tr.ant-table-row'));
  const texts = rows.map((r) => nrm(r.textContent));
  /* 「待复盘」= 复盘文档列的占位文案 */
  const pendingRows = texts.filter((t) => t.includes('待复盘'));
  /* ROI 列的「—」：定位含 ROI 表头的列索引 */
  const heads = Array.from(card.querySelectorAll('.ant-table-thead th')).map((h) => nrm(h.textContent));
  const roiIdx = heads.findIndex((h) => h.includes('ROI'));
  let roiDashes = 0;
  if (roiIdx >= 0) {
    rows.forEach((r) => {
      const cells = r.querySelectorAll('td');
      if (cells[roiIdx] && nrm(cells[roiIdx].textContent) === '—') roiDashes++;
    });
  }
  return {
    rowCount: rows.length,
    headCount: heads.length,
    pendingRowCount: pendingRows.length,
    pendingRowIds: pendingRows.map((t) => (t.match(/BRD-2026-\d+/) || ['—'])[0]),
    roiColIdx: roiIdx,
    roiDashCount: roiDashes,
    /* 楼层头部 note：含「共 N 个交付计费项目」 */
    noteHasCount: /共\d+个交付计费项目/.test(nrm(card.textContent)),
    /* 头部右侧Tag：待复盘 warn / 全部已复盘 ok */
    hasPendingTag: /待复盘/.test(nrm(card.textContent)),
    hasAllDoneTag: /全部已复盘/.test(nrm(card.textContent))
  };
}

/* ---- C. 预算消耗：三维度着色（同一行内异色） ----
 * 用页面自带的精确 testid（budget-consume-seg-{dim}-{deptCode}-rate）读取着色，
 * 不用 computedStyle 猜 —— 数字着色直接落在该 span 的 style.color 上。
 * 教训：本探针初版用 `consume-floor` 这个不存在的 testid + 正则兜底，
 * 结果探针自己报「floor missing」，看起来像页面没数据，实为选择器写错。
 * 「探针失败」与「页面缺分支」必须分开判定，否则会误改数据。 */
function probeConsumeTiers() {
  const table = document.querySelector('[data-testid="budget-consume-table"]');
  if (!table) return { error: 'budget-consume-table missing' };
  const rows = Array.from(table.querySelectorAll('.ant-table-tbody tr.ant-table-row'));
  const DIMS = ['overall', 'project', 'ops'];
  const out = [];
  rows.forEach((r) => {
    const deptCell = r.querySelector('td');
    const dept = deptCell ? (deptCell.textContent || '').replace(/\s+/g, ' ').trim() : '?';
    const dims = {};
    DIMS.forEach((dim) => {
      /* testid 形如 budget-consume-seg-overall-D-RETAIL-rate，
         用属性包含匹配即可，不必知道部门编号 */
      const el = r.querySelector(`[data-testid*="budget-consume-seg-${dim}-"][data-testid$="-rate"]`);
      dims[dim] = el ? getComputedStyle(el).color : null;
    });
    const uniq = Array.from(new Set(DIMS.map((d) => dims[d]).filter(Boolean)));
    out.push({ dept, dims, uniqColors: uniq, multiColor: uniq.length >= 2 });
  });
  const all = Array.from(new Set(out.flatMap((r) => r.uniqColors)));
  return {
    rowCount: rows.length,
    multiColorRows: out.filter((r) => r.multiColor).map((r) => r.dept),
    distinctColors: all,
    distinctColorCount: all.length,
    perRow: out
  };
}

/* ---- D. 年度计划：未提供文档 / 待复核确认 ---- */
function probePlanStates() {
  const body = (document.body.textContent || '').replace(/\s+/g, '');
  return {
    noDoc: body.includes('未提供文档'),
    pendingReview: body.includes('待复核确认'),
    bpSubmitted: body.includes('已提交')
  };
}

const server = http.createServer((q, s) => {
  s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  s.end(fs.readFileSync(FILE));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const URL_BASE = `http://127.0.0.1:${server.address().port}/`;
const PORT = process.env.CDP_PORT || '9341';

async function fetchJSON(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return await r.json(); } catch (_) {}
    await sleep(250);
  }
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
    const r = await cdp.send('Runtime.evaluate', {
      expression: '(' + fn.toString() + ')(window.__V16_ARG__)', returnByValue: true, awaitPromise: true
    });
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
    await cdp.send('Runtime.evaluate', {
      expression: `window.location.hash = ${JSON.stringify(hash)}; true`, returnByValue: true
    });
    await sleep(1000);
  };

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

  const out = {};
  let pass = 0; let fail = 0;
  const check = (name, ok, detail) => {
    (ok ? pass++ : fail++);
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —— ' + detail : ''}`);
  };

  /* --- 1. 对账单总览（累计态）：白屏 + 交付楼层 --- */
  await goto('#/billing');
  out.boot = await ev(probeBoot);
  out.delivery = await ev(probeDeliveryFloor);
  await shot('01-billing-cumulative');

  check('A 对账单页非白屏', out.boot.notBlank, `root子节点=${out.boot.rootChildren} 文本长=${out.boot.bodyTextLen}`);
  check('B 交付楼层行数 = 17（本轮由 7 扩到 17）', out.delivery.rowCount === 17, `实际 ${out.delivery.rowCount}`);
  check('B 出现「待复盘」态（retroPending > 0）', out.delivery.pendingRowCount > 0, `${out.delivery.pendingRowCount} 行：${(out.delivery.pendingRowIds || []).join(',')}`);
  check('B 头部「N 个待业务复盘」note 生效', out.delivery.noteHasCount, '');
  check('B ROI 列出现「—」三态', out.delivery.roiDashCount > 0, `ROI 列=${out.delivery.roiColIdx} 破折号行数=${out.delivery.roiDashCount}`);

  /* --- 2. 预算消耗FY2026：四档着色 --- */
  await goto('#/budget/consume');
  out.bootConsume = await ev(probeBoot);
  out.tiers = await ev(probeConsumeTiers);
  await shot('02-consume-fy2026');

  check('A 预算消耗页非白屏', out.bootConsume.notBlank, `行数=${out.bootConsume.rows}`);
  check('C 出现同一行内多色部门（着色演示）', (out.tiers.multiColorRows || []).length > 0, `${(out.tiers.multiColorRows || []).join(',')}`);
  check('C 页面出现 ≥3 种档位色（四档覆盖）', out.tiers.distinctColorCount >= 3, `实际 ${out.tiers.distinctColorCount} 种`);

  /* --- 3. 年度预算计划：未提供文档 / 待复核确认 --- */
  await goto('#/budget/annual');
  out.bootPlan = await ev(probeBoot);
  out.plan = await ev(probePlanStates);
  await shot('03-annual-plan');

  check('A 年度计划页非白屏', out.bootPlan.notBlank, `行数=${out.bootPlan.rows}`);
  check('D 出现「未提供文档」态', out.plan.noDoc, '');
  check('D 出现「待复核确认」草稿态', out.plan.pendingReview, '');

  console.log('\n' + '='.repeat(70));
  console.log(`结果：${pass} 通过 / ${fail} 失败`);
  console.log('='.repeat(70));
  console.log('\n明细：');
  console.log(JSON.stringify(out, null, 2));
  process.exit(fail > 0 ? 1 : 0);
} finally {
  try { ws && ws.close(); } catch (_) {}
  server.close();
}