/**
 * 单文件内联打包（v1.0）
 *
 * 目标：把 dist 的多文件产物（index.html + assets/app.js + assets/style.css）
 * 合并为一个**完全自包含**的 HTML，复制到任何地方双击即可打开，无需服务器、无需依赖。
 *
 * 关键处理：
 *   1. style.css → <style> 内联到 <head>（替换原 <link>）
 *   2. app.js    → <script> 内联到 </body> 之前（替换原 <script defer src>）
 *      · 内联脚本的 defer 无意义（defer 仅对外部脚本生效），故直接放到 body 末尾，
 *        与「DOM 解析完再执行」的语义等价。
 *   3. app.js 内若出现 `</script` 字面量，必须转义为 `<\/script`，
 *      否则会提前闭合 <script> 标签 → 页面白屏。此处做防御式替换（幂等，天然安全：
 *      JS 字符串里 `"<\/script>"` 等价于 `"</script>"`）。
 *      —— 本构建实测出现次数为 0，替换为 no-op，但逻辑保留以防未来产物回归。
 *   4. 不引入任何外部 URL（字体走系统字体栈）。
 *
 * 用法：node scripts/build-singlefile.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(DIST, 'dkt-digital-budget-v1.0.html');

function fail(msg) {
  console.error('[build-singlefile] 失败：' + msg);
  process.exit(1);
}

const htmlPath = path.join(DIST, 'index.html');
const jsPath = path.join(DIST, 'assets', 'app.js');
const cssPath = path.join(DIST, 'assets', 'style.css');

for (const p of [htmlPath, jsPath, cssPath]) {
  if (!fs.existsSync(p)) fail('缺少构建产物：' + p);
}

const html = fs.readFileSync(htmlPath, 'utf8');
const jsRaw = fs.readFileSync(jsPath, 'utf8');
const cssRaw = fs.readFileSync(cssPath, 'utf8');

/* ---------- 1. 转义 JS 中的 </script 字面量 ---------- */
const scriptHits = (jsRaw.match(/<\/script/gi) || []).length;
const js = jsRaw.replace(/<\/script/gi, '<\\/script');

/* ---------- 2. 校验 CSS 中不含会提前闭合 <style> 的序列 ---------- */
const styleHits = (cssRaw.match(/<\/style/gi) || []).length;
if (styleHits > 0) {
  fail(`style.css 中出现 ${styleHits} 处 </style，会提前闭合 <style> 标签，需人工处理`);
}

/* ---------- 3. 组装单文件 HTML ---------- */
if (!/<link[^>]*rel=["']?stylesheet/i.test(html)) fail('index.html 中未找到 <link rel="stylesheet">');
if (!/<script[^>]*src=["'][^"']*app\.js["']/i.test(html)) fail('index.html 中未找到 app.js 的 <script src>');
if (!/<\/body>/i.test(html)) fail('index.html 中未找到 </body>');

let out = html;
// 注意：一律使用「函数替换」而非字符串替换 —— 注入内容里若含 $& / $' / $\` 等序列，
// 字符串替换会被 String.replace 当作特殊占位符解释，导致产物被污染（实测 app.js 含 `$&`）。
// 3.1 先摘掉 <head> 里原有的外部 <script src>（它的 defer 移到 body 末尾）
out = out.replace(/[ \t]*<script[^>]*src=["'][^"']*app\.js["'][^>]*>\s*<\/script>\s*/i, '');
// 3.2 把 <link rel="stylesheet"> 就地换成内联 <style>（仍在 <head> 内）
out = out.replace(
  /[ \t]*<link[^>]*rel=["']?stylesheet["']?[^>]*>\s*/i,
  () => `    <style>${cssRaw}</style>\n`
);
// 3.3 把 <script> 内联到 </body> 之前（等价于原 defer 的「DOM 就绪后执行」语义）
out = out.replace(/<\/body>/i, () => `    <script>${js}</script>\n  </body>`);

/* ---------- 4. 兜底断言：产物必须是单文件、无外链、结构正确 ---------- */
if (/<link[^>]*rel=["']?stylesheet/i.test(out)) fail('内联后有残留 <link rel="stylesheet">');
if (/<script[^>]*\bsrc=/i.test(out)) fail('内联后有残留 <script src>');
if (/https?:\/\/[^\s"']+\.(js|css|woff2?|png|jpg|jpeg|gif|svg)/i.test(out)) fail('单文件中检出外部资源 URL');
if (/<script[^>]*type=["']?module/i.test(out)) fail('内联 <script> 不得带 type="module"');
if (/<script[^>]*crossorigin/i.test(out)) fail('内联 <script> 不得带 crossorigin');
if (!/<style>[\s\S]*<\/style>[\s\S]*<\/head>/i.test(out)) fail('内联 <style> 未落在 </head> 之前');
if (!/<script>[\s\S]*<\/script>\s*<\/body>\s*<\/html>/i.test(out)) fail('内联 <script> 未落在 </body> 之前');

fs.writeFileSync(OUT, out, 'utf8');

console.log('[build-singlefile] 完成');
console.log('  源 index.html : ' + fs.statSync(htmlPath).size + ' bytes');
console.log('  源 app.js     : ' + fs.statSync(jsPath).size + ' bytes');
console.log('  源 style.css  : ' + fs.statSync(cssPath).size + ' bytes');
console.log('  内联 </script 转义命中次数 : ' + scriptHits + (scriptHits === 0 ? '（no-op，逻辑保留）' : ''));
console.log('  输出          : ' + OUT);
console.log('  输出大小      : ' + fs.statSync(OUT).size + ' bytes');
