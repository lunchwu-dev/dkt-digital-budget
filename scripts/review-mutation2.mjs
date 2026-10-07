/**
 * 复验探针 5（v1.1 质量审查专用）：对**新增的 3 条守护断言**做变异证伪
 *
 * 背景：施工方按我的 P0-1 / P1-1 / P1-3 意见新增了守护断言，但「新增了断言」不等于
 * 「断言有效」。这里逐条把它们要守护的行为改坏，看对应断言是否真的变红。
 * 用法：node scripts/review-mutation2.mjs
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';

const p = 'dist/assets/app.js';
const orig = fs.readFileSync(p, 'utf8');
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

const MUT = [
  {
    id: 'G1 · 破坏 P0-1：编辑态概览卡回退取正式版 pg.totalAmount',
    from: 'label:P?"年度总费用（草稿）":"年度总费用",value:hd(v?me:h.totalAmount)',
    to: 'label:P?"年度总费用（草稿）":"年度总费用",value:hd(h.totalAmount)',
    expect: /P0-1/
  },
  {
    id: 'G1b · 破坏 P0-1：去掉「（草稿）」口径标注',
    from: 'label:P?"年度总费用（草稿）":"年度总费用"',
    to: 'label:"年度总费用"',
    expect: /P0-1/
  },
  {
    id: 'G3 · 破坏 #18 守护：confirmOpsDraft 不写回 opsPlans[].items',
    from: 'opsPlans:(W.opsPlans||[]).map(K=>K.dept===k&&K.fy===B?{...K,items:X,status:"已确认",confirmDate:po,version:oe}:K)',
    to: 'opsPlans:(W.opsPlans||[]).map(K=>K.dept===k&&K.fy===B?{...K,items:K.items,status:"已确认",confirmDate:po,version:oe}:K)',
    expect: /#18 写回守护/
  }
];

const out = [];
for (const m of MUT) {
  const n = orig.split(m.from).length - 1;
  if (n !== 1) { out.push({ id: m.id, hits: n, verdict: '锚点非唯一/未命中，跳过' }); continue; }
  fs.writeFileSync(p, orig.replace(m.from, m.to), 'utf8');
  let o = '';
  try { o = execFileSync(process.execPath, ['tests/smoke.cjs'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 240000 }); }
  catch (e) { o = (e.stdout || '') + (e.stderr || ''); }
  const lines = o.split(/\r?\n/);
  const fails = lines.filter((l) => /^FAIL/.test(l)).map((l) => l.replace(/^FAIL\s+/, '').trim());
  const total = (o.match(/(\d+)\/(\d+) 通过/) || [])[0] || 'n/a';
  out.push({
    id: m.id, total, failCount: fails.length,
    killed: fails.some((f) => m.expect.test(f)),
    relevantFail: fails.filter((f) => m.expect.test(f)).map((f) => f.slice(0, 90)),
    allFails: fails.slice(0, 3).map((f) => f.slice(0, 80))
  });
  fs.writeFileSync(p, orig, 'utf8');
}
console.log('[还原校验]', md5(fs.readFileSync(p, 'utf8')) === md5(orig) ? 'YES ✅' : 'NO ❌');
console.log(JSON.stringify(out, null, 2));
