/**
 * 单文件冒烟测试
 *
 * 目的：证明 dist/dkt-digital-budget-v1.0.html 这一个**自包含 HTML** 真的能跑
 *      —— 不是「文件存在就算成功」，而是让 jsdom 以 file:// 载入、真正执行内联脚本、
 *      断言 React 挂载 + 导航外壳结构 + 默认落点 + 零运行期错误。
 *
 * v1.2 修正：加载目标由硬编码的旧产物名 v0.7.2.html 改为**与 scripts/build-singlefile.cjs
 * 的输出名（v1.0.html）保持一致** —— 此前 dist 里同时残留新旧两份单文件，本脚本一直
 * 在对旧文件跑「假绿」（构建更新了 v1.0，测试仍测 v0.7.2），现锁定唯一产物名并对不上即 FAIL。
 *
 * 与 tests/smoke.cjs 的差异：
 *   - smoke.cjs 载入的是「去脚本的 index.html」再手动 win.eval(bundle)；
 *   - 本脚本载入的是「含内联 <script> 的单文件」，靠 runScripts:'dangerously'
 *     让内联脚本在解析期自行执行 —— 这才是对「双击打开」最接近的等价验证。
 *
 * 用法：node tests/smoke-singlefile.cjs
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
/** 与 scripts/build-singlefile.cjs 的 OUT 同名 —— 两处必须同步改，否则测的是旧产物（假绿） */
const SINGLEFILE_NAME = 'dkt-digital-budget-v1.0.html';
const FILE = path.join(ROOT, 'dist', SINGLEFILE_NAME);

const errors = [];
const results = [];

const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));

function norm(s) {
  return (s || '').replace(/\s+/g, '');
}

async function main() {
  if (!fs.existsSync(FILE)) {
    console.error('找不到单文件产物：' + FILE);
    process.exit(1);
  }
  const html = fs.readFileSync(FILE, 'utf8');

  // 前置自检：单文件必须无外链、无 type=module、无 crossorigin
  results.push({ name: '单文件：不含任何 <script src=…> 外链', ok: !/<script[^>]*\bsrc=/i.test(html) });
  results.push({ name: '单文件：不含 <link rel="stylesheet"> 外链', ok: !/<link[^>]*rel=["']?stylesheet/i.test(html) });
  results.push({ name: '单文件：内联 <script> 无 type="module"', ok: !/<script[^>]*type=["']?module/i.test(html) });
  results.push({ name: '单文件：内联 <script> 无 crossorigin', ok: !/<script[^>]*crossorigin/i.test(html) });
  results.push({ name: '单文件：含内联 <style>', ok: /<style>[\s\S]*<\/style>/i.test(html) });
  results.push({ name: '单文件：内联 <script> 位于 </body> 之前', ok: /<script>[\s\S]*<\/script>\s*<\/body>/i.test(html) });
  // v1.2 防假绿：证明加载的是本轮产物 —— 含新增「总预算费用」列、不含已删操作列的「下一步：」提示
  results.push({ name: '单文件：产物为 v1.2 新版（含「总预算费用」列文案）', ok: html.includes('总预算费用') });
  results.push({ name: '单文件：产物为 v1.2 新版（不含已删操作列的「下一步：」提示）', ok: !html.includes('下一步：') });
  // v1.3 防假绿：消耗页已无「调整预算计划」入口 —— 源码删了但产物没重建时，这两条会 FAIL
  results.push({ name: '单文件：产物为 v1.3 新版（不含已下线的「调整预算计划」）', ok: !html.includes('调整预算计划') });
  results.push({ name: '单文件：产物为 v1.3 新版（含新增的只读声明文案）', ok: html.includes('本视图为只读') });
  // v1.1③ 防假绿：系统运维预算计划是本轮从「右侧浮层」改为「独立页面」的核心交付。
  // 源码改了但产物没重建时，下面这几条会 FAIL —— 否则 smoke.cjs 全绿而双击打开的产物仍是旧浮层版。
  // 双向锚点：含新增页面/脚注文案，且不含已被本轮删除的旧浮层入口。
  results.push({ name: '单文件：产物含 v1.1③ 独立页面标题「系统运维预算计划」', ok: html.includes('系统运维预算计划') });
  results.push({ name: '单文件：产物含 v1.1③ 列头「年度BU用量」', ok: norm(html).includes('年度BU用量') });
  results.push({ name: '单文件：产物含 v1.1③ 脚注口径「业务量增长系数」', ok: html.includes('业务量增长系数') });
  results.push({ name: '单文件：产物含 v1.1③ 维护流程动作「业务复核确认」', ok: html.includes('业务复核确认') });
  // 减卡后概览为 2 张 md-12 卡。
  // 锚点教训（连踩两次）：不能用「计费口径」这四个字做锚点 ——
  //   1) BillingModule.jsx:867-868 本就有「交付计费口径」「运维计费口径」两张同名口径表，与本轮概览无关；
  //   2) 产物是压缩 JS，「计费口径」后面紧跟的恰好是 name:"…计费口径" 的收尾引号，
  //      于是 `includes('计费口径"')` 也会命中账单模块 —— 同名词跨页复用 + 压缩产物引号相邻，两个坑叠加。
  // 正确锚点：被删那张卡的**副文案**「种计费方式」。该文案全站仅此一处（已 grep 确认 src 无残留），
  // 且不进账单模块，与跨页同名词无关。
  //
  // v1.7 补充（这类"负向指纹"断言的固有脆弱性）：新增《站点说明书》时，正文写了
  // 「三种计费方式」，**恰好命中这条负向锚点**，于是单文件测试报 FAIL —— 但产物其实是对的。
  // 教训：负向断言（"产物不含 X"）里的 X 必须是**只可能出现在被删代码里**的串；
  //   一旦有正常内容复用同一词汇，断言就从"防回归"退化成"禁止别人说这个词"。
  // 这里选了侵入性最小的修法：把说明书措辞改为「计费分为三类」，保住这条已被
  //   反复打磨过的锚点（它的上一位候选「计费口径」因跨页同名而废弃，见上方注释）。
  results.push({ name: '单文件：产物为减卡后新版（概览不再有「N 种计费方式」枚举卡）', ok: !norm(html).includes('种计费方式') });
  results.push({ name: '单文件：产物含 v1.1③ 编辑态草稿口径「年度总费用（草稿）」', ok: html.includes('年度总费用（草稿）') });
  // v1.4.4 防假绿：三项改动都是「减法」，产物没重建时源码已改而双击打开的仍是旧版。
  // 锚点用「新增文案」+「已删文案」双向夹逼，避免只测单向而漏掉「删了没生效」。
  //   ① 楼层序号胶囊全站移除 → 产物不含「楼层一…五」任一
  results.push({ name: '单文件：产物为 v1.4.4 新版（已移除全部「楼层 N」序号胶囊）',
    ok: !/楼层[一二三四五六七八九十]/.test(norm(html)) });
  //   ② 账期筛选移到页首并明示全页生效 → 含新文案
  results.push({ name: '单文件：产物含 v1.4.4 新文案「对本页全部指标、趋势图与明细同时生效」',
    ok: norm(html).includes('对本页全部指标、趋势图与明细同时生效') });
  //   ③ 部门详情页移除预算池板块 → 产物不含「预算池状态」
  results.push({ name: '单文件：产物为 v1.4.4 新版（部门详情页已无「预算池状态」板块）',
    ok: !html.includes('预算池状态') });
  // v1.4.5 防假绿：两页首屏条统一走 BillingHeadBar。
  // 锚点选择踩了两次坑，逐条记下：
  //   ① 不能用组件名 —— 生产产物经 esbuild 压缩，函数名不保留（实测 grep 不到）；
  //   ② 不能用「全部（累计）」「当前为累计口径」—— 这两句改动前就存在
  //      （分别是旧 Select 的 placeholder 与趋势图 cumulativeHint），属恒真的弱锚点。
  // 正确锚点：v1.4.5 才写入的副标题片段。
  results.push({ name: '单文件：产物含 v1.4.5 统一首屏条（副标题「全局 Digital 费用发生情况」）',
    ok: norm(html).includes('全局Digital费用发生情况') });
  // 旧实现的总览页副标题是「全局观察 Digital 费用发生情况」，已随 PageHead.desc 下线
  // —— 用它做「已删」锚点最稳（详情页仍保留「本页仅呈现」，不冲突）。
  results.push({ name: '单文件：产物为 v1.4.5 新版（总览页已无旧 PageHead 长描述）',
    ok: !html.includes('全局观察 Digital 费用发生情况') });

  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => {
    if (/Not implemented|Could not parse CSS/i.test(e.message)) return;
    errors.push('[jsdomError] ' + e.message);
  });
  vc.on('error', (...a) => errors.push('[error] ' + a.join(' ')));
  vc.on('warn', (...a) => {
    const s = a.join(' ');
    if (/Warning: |antd:/.test(s)) errors.push('[warn] ' + s);
  });

  const dom = new JSDOM(html, {
    url: 'file:///' + FILE.replace(/\\/g, '/'),
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(win) {
      win.matchMedia = (q) => ({
        matches: /min-width:\s*(768|992|1200|1600)px/.test(q),
        media: q,
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent: () => false
      });
      win.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
      win.scrollTo = () => {};
      win.HTMLElement.prototype.scrollIntoView = () => {};
      try {
        const store = {};
        Object.defineProperty(win, 'localStorage', {
          configurable: true,
          value: {
            getItem: (k) => (k in store ? store[k] : null),
            setItem: (k, v) => {
              store[k] = String(v);
            },
            removeItem: (k) => {
              delete store[k];
            },
            clear: () => Object.keys(store).forEach((k) => delete store[k])
          }
        });
      } catch (_) {
        /* 忽略 */
      }
    }
  });

  const win = dom.window;
  // 内联脚本已在解析期执行完毕；此处再挂一次钩子，覆盖后续异步错误
  win.console.error = (...a) => errors.push('[console.error] ' + a.map(String).join(' '));
  win.console.warn = (...a) => {
    const s = a.map(String).join(' ');
    if (/Warning: |antd:/.test(s)) errors.push('[console.warn] ' + s);
  };

  // 等待 React 18 挂载 + 首屏默认落点重定向副作用完成
  await tick(600);

  const doc = win.document;
  const byTestId = (id) => doc.querySelector(`[data-testid="${id}"]`);
  const exists = (id) => !!byTestId(id);

  function check(name, cond, detail) {
    results.push({ name, ok: !!cond, detail: detail || '' });
  }

  /* ---------- 核心断言 ---------- */
  const rootChars = doc.getElementById('root').textContent.length;
  check('React 挂载成功（#root 文本长度 > 200）', rootChars > 200, `root 文本长度 ${rootChars}`);
  check('侧边栏外壳存在 [data-testid="app-sider"]', exists('app-sider'));
  /* v1.5 IA：3 个已上线页平铺 + 唯一「未完成」组收纳其余 5 页 */
  const flats = Array.from(doc.querySelectorAll('[data-testid^="sider-flat-"]')).map((e) => e.textContent.trim());
  check('侧边栏 3 个已上线页平铺', flats.length === 3 && ['年度预算计划', '预算消耗', '对账单总览'].every((x) => flats.includes(x)), `实际 ${flats.join('/') || '无'}`);
  const groups = doc.querySelectorAll('[data-testid^="sider-group-"]');
  check('侧边栏仅「未完成」一个文件夹', groups.length === 1 && groups[0].getAttribute('data-testid') === 'sider-group-backlog', `实际 ${groups.length}`);
  const items = doc.querySelectorAll('[data-testid^="sider-item-"]').length;
  check('「未完成」组内 5 个二级入口（计费规则 + 项目管理四项）', items === 5, `实际 ${items}`);
  check('首屏默认落点 #/budget/annual', win.location.hash === '#/budget/annual', `实际 ${win.location.hash}`);
  check('默认渲染年度预算计划主表', exists('budget-annual-table'));

  /* v1.7：站点说明书 —— 单文件产物里也必须可用（它不依赖任何运行时数据，
     所以"双击打开也能读到说明书"是这条要证明的事） */
  const manual = doc.querySelector('[data-testid="sider-manual"]');
  check('侧边栏有「站点说明书」独立入口', !!manual && manual.textContent.trim().includes('站点说明书'));
  win.location.hash = '#/manual/guide';
  win.dispatchEvent(new win.HashChangeEvent('hashchange'));
  await tick(420);
  check('单文件：#/manual/guide 渲染《站点说明书》三章齐备', (() => {
    const need = ['manual-page', 'manual-sec-blocks', 'manual-sec-roles', 'manual-sec-roadmap',
                  'manual-roadmap-next', 'manual-role-table', 'manual-identity-table'];
    return need.every((id) => exists(id));
  })());
  check('单文件：说明书正文无字面 markdown 残留', (() => {
    const el = doc.querySelector('[data-testid="manual-page"]');
    const t = (el ? el.textContent : '').replace(/\s+/g, '');
    return t.length > 1000 && !t.includes('**') && !t.includes('##');
  })());

  /* ---------- 运行期零错误 ---------- */
  check('运行期零 console 错误 / React 警告', errors.length === 0, errors.slice(0, 5).join(' | '));

  /* ---------- 输出 ---------- */
  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok);
  console.log('');
  results.forEach((r) => {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : '  << ' + r.detail}`);
  });
  console.log(`\n${pass}/${results.length} 通过`);
  if (errors.length) {
    console.log('\n--- 捕获到的错误 ---');
    errors.slice(0, 10).forEach((e) => console.log(e));
  }
  dom.window.close();
  process.exit(fail.length ? 1 : 0);
}

main().catch((e) => {
  console.error('测试脚本异常：', e);
  process.exit(1);
});
