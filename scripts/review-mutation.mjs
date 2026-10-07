/**
 * 断言有效性证伪探针（v1.1 质量审查专用）— 变异测试版
 *
 * 方法：对 **压缩后的 dist 产物** 做定向单点替换（不改 src、不改 tests），
 * 把被测行为改坏，再跑 tests/smoke.cjs，看对应断言是否变红。
 *   变红 ⇒ 断言有区分度（有效）；仍 179/179 ⇒ 该断言恒真（无效）。
 *   恒假（必挂）⇒ 无效且误报。
 *
 * 锚点全部取自压缩产物的**唯一命中**字面量。
 * 用法：node scripts/review-mutation.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const appJsPath = path.join(DIST, 'assets', 'app.js');

const pristine = fs.readFileSync(appJsPath, 'utf8');
const pristineMd5 = (await import('node:crypto'))
  .createHash('md5').update(pristine).digest('hex');

const MUTANTS = [
  {
    id: 'M2 · 破坏：固定年费用量单位「份」→「%」',
    from: 'Tx={order:"单/年",member:"千人·月/年",fixed:"份"}',
    to: 'Tx={order:"单/年",member:"千人·月/年",fixed:"%"}',
    expect: /「份」|不出现 %/,
    why: '验证 D-SVC 断言是否真在查单位与 %'
  },
  {
    id: 'M3 · 破坏：submitOpsDraft 不再置 issueDate（主表第 2 档回退失效）',
    from: 'psDrafts:J,opsPlans:(G.opsPlans||[]).map(ae=>ae.dept===B&&ae.fy===_?{...ae,status:"待业务确认",issueDate:oo}',
    to: 'psDrafts:J,opsPlans:(G.opsPlans||[]).map(ae=>ae.dept===B&&ae.fy===_?{...ae,status:"待业务确认",issueDate:ae.issueDate}',
    expect: /D-HR 提交后主表格/,
    why: '验证断言 10 是否真依赖三级回退第 2 档（而非恒真）'
  },
  {
    id: 'M4 · 破坏：confirmOpsDraft 不写回 items（得号但不落明细）',
    from: 'opsPlans:(G.opsPlans||[]).map(fe=>fe.dept===B&&fe.fy===_?{...fe,items:J,status:"已确认",confirmDate:oo,version:X}:fe)',
    to: 'opsPlans:(G.opsPlans||[]).map(fe=>fe.dept===B&&fe.fy===_?{...fe,items:fe.items,status:"已确认",confirmDate:oo,version:X}:fe)',
    expect: /确认后回到正式版本视图|复核确认后主表格|含确认后新版本号|本版合计/,
    why: '验证「确认」链路是否真穿过 confirmOpsDraft 并落明细'
  },
  {
    id: 'M5 · 破坏：submitOpsDraft 不推进 status（状态机不推）',
    from: 'psDrafts:J,opsPlans:(G.opsPlans||[]).map(ae=>ae.dept===B&&ae.fy===_?{...ae,status:"待业务确认",issueDate:oo}',
    to: 'psDrafts:J,opsPlans:(G.opsPlans||[]).map(ae=>ae.dept===B&&ae.fy===_?{...ae,status:ae.status,issueDate:oo}',
    expect: /D-HR 提交后主表格|变更说明/,
    why: '验证状态机断言有效性'
  }
];

function runSmoke() {
  try {
    const out = execFileSync(process.execPath, [path.join(ROOT, 'tests', 'smoke.cjs')], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 240000
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? -1, out: (e.stdout || '') + (e.stderr || '') };
  }
}

const results = [];
const restore = () => fs.writeFileSync(appJsPath, pristine, 'utf8');

try {
  const base = runSmoke();
  const baseTotal = (base.out.match(/(\d+)\/(\d+) 通过/) || [])[0] || 'n/a';
  const baseFail = (base.out.match(/^FAIL\s+(.*)$/gm) || []).length;
  results.push({ id: 'BASELINE（未变异）', verdict: baseTotal, failCount: baseFail });

  for (const m of MUTANTS) {
    const cands = m.alt ? [m.from, ...m.alt] : [m.from];
    let hit = null;
    for (const c of cands) {
      const n = pristine.split(c).length - 1;
      if (n === 1) { hit = c; break; }
      if (n > 1) { hit = c; break; }
    }
    if (!hit) { results.push({ id: m.id, verdict: '锚点未命中（跳过）', hits: 0 }); continue; }
    const n = pristine.split(hit).length - 1;
    if (n !== 1) {
      results.push({ id: m.id, verdict: `锚点命中 ${n} 次，需恰好 1 次（跳过）`, hits: n });
      continue;
    }
    fs.writeFileSync(appJsPath, pristine.replace(hit, m.to), 'utf8');
    const r = runSmoke();
    const failed = (r.out.match(/^FAIL\s+(.*)$/gm) || []).map((s) => s.replace(/^FAIL\s+/, '').trim());
    const total = (r.out.match(/(\d+)\/(\d+) 通过/) || [])[0] || 'n/a';
    results.push({
      id: m.id,
      total,
      failCount: failed.length,
      relevantFail: failed.filter((f) => m.expect.test(f)),
      killed: failed.some((f) => m.expect.test(f)),
      why: m.why
    });
    restore();
  }
} finally {
  restore();
  const now = fs.readFileSync(appJsPath, 'utf8');
  const nowMd5 = (await import('node:crypto')).createHash('md5').update(now).digest('hex');
  console.log(`[还原校验] md5 ${nowMd5} === ${pristineMd5} ? ${nowMd5 === pristineMd5 ? 'YES ✅' : 'NO ❌'}`);
}

console.log(JSON.stringify(results, null, 2));
