/**
 * 一次性探针：dump 年度预算计划表合计行的真实渲染文本。
 * 用途：断言里写死金额前，先看页面真正渲染了什么 —— 别靠 calc 反推。
 * 用法：node scripts/probe-summary.cjs
 */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'dist', 'assets', 'app.js');

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/#/budget/annual', pretendToBeVisual: true, runScripts: 'outside-only'
});
const { window } = dom;
const errs = [];
window.console = { log() {}, error: (...a) => errs.push(a.join(' ')), warn() {} };
window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {} }));
window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
window.cancelAnimationFrame = (id) => clearTimeout(id);

try {
  window.eval(fs.readFileSync(FILE, 'utf8'));
} catch (e) {
  console.log('加载失败:', e.message.slice(0, 300));
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1200);
const doc = window.document;
const byId = (id) => doc.querySelector(`[data-testid="${id}"]`);

['2027', '2026'].forEach((fy) => {
  window.location.hash = '#/budget/annual';
});
await sleep(600);

const dump = (label, id) => {
  const t = byId(id);
  if (!t) return console.log(`[${label}] 找不到 ${id}`);
  const sum = t.querySelector('.ant-table-summary');
  console.log(`[${label}] 合计行文本 = ${(sum ? sum.textContent : '(无 summary)').replace(/\s+/g, ' ').trim()}`);
  const heads = Array.from(t.querySelectorAll('.ant-table-thead th')).map((h) => h.textContent.replace(/\s+/g, '').trim());
  console.log(`         表头 = ${heads.join(' | ')}`);
};

dump('年度预算计划', 'budget-annual-table');

/* 切到预算消耗视图 */
window.location.hash = '#/budget/consume';
await sleep(900);
dump('预算消耗', 'budget-consume-table');

const sec = byId('budget-consume-section-dept');
if (sec) console.log('楼层二标题 =', sec.textContent.replace(/\s+/g, ' ').trim().slice(0, 120));

const seg = byId('budget-consume-seg-overall-D-RETAIL');
if (seg) console.log('D-RETAIL 整体格 title =', seg.getAttribute('title'));

if (errs.length) console.log('\n控制台错误:', errs.slice(0, 3));