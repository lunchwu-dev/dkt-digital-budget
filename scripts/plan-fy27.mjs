/**
 * FY2027 预算池反解台（一次性测算，不进产物）
 *
 * 目标：让《预算消耗》FY2027 视图的**整体侧**也出现多档。
 * 当前 poolFY27 是「原值不动」，8 个部门整体率恒落ok 档（0%~56%），
 * 四档着色在编制年完全无法演示。
 *
 * 口径（与 calc.js 一致，不另立）：
 *   整体已用  = 已规划(planned)
 *   整体预算  = poolFY27
 *   整体消耗率 = planned / poolFY27
 *   项目已用  = 已确认的evalAmount 合计（committed 口径在 FY2027 不计）
 *   项目预算  = poolFY27 − 运维预估（opsAnnualEstimate 派生，不可调）
 *
 * 关键约束：poolFY27 必须 ≥ 运维预估 + 项目规划额，否则「可用余额」为负、
 * 页面出现「透支」预警 —— 那是另一个语义（编制年不该透支）。
 * 故 poolFY27 下限 = 运维 + 规划 × 1.02（留 2% 缓冲）。
 */
import { INITIAL_DATA, DEPARTMENTS } from '../src/data/mock.js';
import {
  opsAnnualEstimate, poolState, fmtWan
} from '../src/domain/calc.js';

const data = INITIAL_DATA;

/** 各部门 FY2027 的规划额（已确认 evalAmount 合计 + 待评估 estAmount 之和，视页面口径） */
const plannedOf = (code) => {
  const st = poolState(data, code, 2027);
  return st.used;
};

console.log('部门\t运维预估(万)\t已规划(万)\t现poolFY27(万)\t现整体率\t建议poolFY27(万)\t建议整体率\t档');
console.log('-'.repeat(110));

const suggest = {};
DEPARTMENTS.forEach((d) => {
  const ops = opsAnnualEstimate(data, d.code, 2027);
  const planned = plannedOf(d.code);
  const cur = d.poolFY27;
  const curRate = planned / cur;

  /* 目标档位分配：让 8 个部门覆盖 ok / watch / warn 三档（over 不合理——
     编制年把池压到低于规划额 = 超编，属另一个语义）。 */
  const target = {
    'D-RETAIL': 0.58,   // ok（池远大于规划，体现「编制有余量」）
    'D-ECOM': 0.74,     // watch
    'D-MKT': 0.95,      // warn
    'D-CRM': 0.78,      // watch
    'D-SCM': 0.62,      // ok
    'D-SVC': 0.97,      // warn
    'D-FIN': 0.55,      // ok
    'D-HR': 0.0// 无人力规划，整体 0%
  }[d.code];

  let pool = cur;
  if (target > 0) {
    const byRate = Math.round(planned / target);
    /* 下限保护：不得低于运维 + 规划×1.02，否则可用余额为负（透支预警） */
    const floor = Math.ceil((ops + planned * 1.02) / 10000) * 10000;
    pool = Math.max(byRate, floor);
  }
  /* **负预算防护**：项目预算 = pool − 运维预估，若为负，页面会渲染出负消耗率
     （实测：市场侧池 340 万 < 运维 436.5 万 → 项目侧 −147.6%）。
     这是口径破洞、不是数据不足，必须抬回地板值而非照算。 */
  if (pool - ops < 0) {
    console.log(`  ⚠ ${d.code}: 池 ${(pool / 1e4).toFixed(1)} 万 < 运维 ${(ops / 1e4).toFixed(1)} 万 → 负预算，已抬回地板值`);
    pool = Math.ceil((ops + planned * 1.02) / 10000) * 10000;
  }
  suggest[d.code] = pool;

  const rate = target > 0 ? planned / pool : 0;
  const level = target === 0 ? 'ok' : rate < 0.7 ? 'ok' : rate < 0.9 ? 'watch' : rate < 1 ? 'warn' : 'over';
  console.log(
    [
      d.code.padEnd(9),
      fmtWan(ops).padStart(11),
      fmtWan(planned).padStart(11),
      fmtWan(cur).padStart(13),
      `${(curRate * 100).toFixed(1)}%`.padStart(9),
      fmtWan(pool).padStart(15),
      `${(rate * 100).toFixed(1)}%`.padStart(10),
      level
    ].join('\t')
  );
});

console.log('\n建议值（元）：');
Object.entries(suggest).forEach(([k, v]) => console.log(`  '${k}': poolFY27: ${v},`));