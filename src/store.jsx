import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { INITIAL_DATA, TODAY } from './data/mock.js';
import * as C from './domain/calc.js';

const StoreCtx = createContext(null);

/** 「AI 摘要」异步回填延迟（ms）—— 业务留空摘要时，提交立即成功，随后用模板文本回填 */
const BP_AI_SUMMARY_DELAY = 1200;

function clone(o) {
  if (typeof structuredClone === 'function') return structuredClone(o);
  return JSON.parse(JSON.stringify(o));
}

function nextSeq(list, prefix, fy) {
  const nums = list
    .map((x) => x.id || x)
    .filter((id) => typeof id === 'string' && id.startsWith(`${prefix}-${fy}-`))
    .map((id) => Number(id.slice(-4)))
    .filter((n) => !Number.isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `${prefix}-${fy}-${String(max + 1).padStart(4, '0')}`;
}

function nextCRSeq(brds) {
  const all = brds.flatMap((b) => (b.crs || []).map((c) => c.id));
  const nums = all
    .map((id) => Number(String(id).slice(-4)))
    .filter((n) => !Number.isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `CR-${TODAY.slice(0, 4)}-${String(max + 1).padStart(4, '0')}`;
}

/** 当前时刻字符串（与 planAction 同源：TODAY + 时:分） */
function nowStr() {
  return `${TODAY} ${new Date().toTimeString().slice(0, 5)}`;
}

/** 构造一条「年度预算计划」留痕（沿用 PA-{fy}-{4位} 编号规则，最新在前） */
function mkActivity(prev, deptCode, fy, action, actor, role, note, version, stage = 'DEMAND') {
  return {
    id: `PA-${fy}-${String((prev.planActivities || []).length + 1).padStart(4, '0')}`,
    dept: deptCode,
    fy,
    stage,
    action,
    actor,
    role,
    at: nowStr(),
    note: note || '',
    version: version || null
  };
}

/**
 * 需求清单「得号并确认」—— v0.8 §5 的**得号触发点**（唯一来源）。
 *
 * 把该部门该年度最新的「待评估费用 / 待复核确认」版本置为「已确认」，
 * 并以 `nextMinorVersion` 赋予次版本号（V1.0 → V1.1 …）。
 * 抽为独立函数，供 `confirmDraft`（业务复核确认）调用；v0.5 的
 * 「完成评估」分支已不再调用本函数（得号点后移）。
 *
 * @returns {{ versions, version, id }} 新版本列表 / 新版本号 / 被确认版本 id
 */
function awardDemandVersion(prev, deptCode, fy, now, evaluator, total) {
  const mine = (prev.demandVersions || []).filter((v) => v.dept === deptCode && v.fy === fy);
  const pending = mine
    .filter((v) => v.status === '待评估费用' || v.status === '待复核确认')
    .sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1))[0];
  if (!pending) return { versions: prev.demandVersions || [], version: null, id: null };

  const ver = C.nextMinorVersion(mine.filter((v) => v.status === '已确认'));
  const versions = (prev.demandVersions || []).map((v) =>
    v.id === pending.id
      ? {
          ...v,
          status: '已确认',
          version: ver,
          confirmedAt: now,
          evaluator: evaluator || v.evaluator,
          totalAmount: total != null ? total : v.totalAmount
        }
      : v
  );
  return { versions, version: ver, id: pending.id };
}

export function StoreProvider({ children }) {
  const [data, setData] = useState(() => clone(INITIAL_DATA));
  /** 全局年度（Header 唯一入口，页面只读不写） */
  const [globalFy, setGlobalFy] = useState(2026);
  const [auditLog, setAuditLog] = useState(() => [
    { id: 'LOG-001', at: '2026-09-28 17:42', actor: '郑亦凡', action: '确认账单', target: 'BILL-202607-D-FIN' },
    { id: 'LOG-002', at: '2026-09-24 10:15', actor: '周锦程', action: '签收 BRD', target: 'BRD-2026-0129' },
    { id: 'LOG-003', at: '2026-09-22 09:30', actor: '邱晨', action: '签收 BRD', target: 'BRD-2026-0126' },
    { id: 'LOG-004', at: '2026-09-18 16:20', actor: '郑亦凡', action: '确认交付费用评估', target: 'BRD-2026-0122' }
  ]);

  const log = useCallback((actor, action, target) => {
    setAuditLog((prev) => [
      { id: `LOG-${String(prev.length + 1).padStart(3, '0')}`, at: TODAY + ' ' + new Date().toTimeString().slice(0, 5), actor, action, target },
      ...prev
    ]);
  }, []);

  /* ---------------- 预算期 ---------------- */

  const updateBpRecord = useCallback((id, patch) => {
    setData((prev) => ({
      ...prev,
      bpRecords: prev.bpRecords.map((b) => (b.id === id ? { ...b, ...patch } : b))
    }));
  }, []);

  /**
   * 废弃某个 BP 版本 —— v1.6 新增，补齐 BP 的纠错通道。
   *
   * **为什么需要**：BP 提交走 `planAction(stage:'BP')`，而 bpVersions 只追加不删除。
   * 文档链接贴错、年度目标写错、修订说明发错时，唯一出路是再提交一个新版本 ——
   * 错误内容永久留在版本列表里。三个下钻页里只有 BP 列表页没有版本操作列
   * （项目预算页有废弃/退回、运维页有退回），BP 成了唯一无法纠错的编制项。
   *
   * 语义：删除该版本记录；BP「当前版本」由剩余历史按时间重算
   * （版本号由 `calc.nextMinorVersion` 派生，不在前端自算）。
   * 留痕照旧 —— 废弃是不可逆动作，必须在操作记录里可追溯。
   */
  const discardBpVersion = useCallback(
    (deptCode, fy, versionId, actor = '郑亦凡', role = '业务部门') => {
      setData((prev) => {
        const target = (prev.bpVersions || []).find((v) => v.id === versionId);
        if (!target) return prev;
        return {
          ...prev,
          bpVersions: (prev.bpVersions || []).filter((v) => v.id !== versionId),
          planActivities: [
            mkActivity(
              prev,
              deptCode,
              fy,
              '废弃BP版本',
              actor,
              role,
              `废弃 BP 版本 ${target.version}`,
              target.version,
              'BP'
            ),
            ...prev.planActivities
          ]
        };
      });
      log(actor, '废弃年度 BP 版本', 'budget');
    },
    [log]
  );

  /**
   * 逐条改需求（存量兼容）。
   * v0.8 起需求清单主流程改走 `demandDrafts`（草稿 → Digital 反馈费用 → 业务复核确认 → 得号），
   * 正式 `demands` 的唯一写回点是 `confirmDraft`；本函数仅为存量/其它模块调用保留，主流程不再使用。
   */
  const updateDemand = useCallback((id, patch) => {
    setData((prev) => ({
      ...prev,
      demands: prev.demands.map((d) => (d.id === id ? { ...d, ...patch } : d))
    }));
  }, []);

  /**
   * 年度预算计划 · 编制项操作（v0.5 口径，v0.8 收敛）
   *
   * 「所有操作都有记录」：每次提交 / 更新 / 出具 / 复核确认都落一条 planActivity。
   *   ① BP      ：只有「已提交」——每次提交/更新生成一个新版本，同时写 BP_VERSIONS；
   *   ② 需求清单 ：v0.8 起**不再经本函数**——改走《项目预算计划》页的 draft 动作集
   *               （startDraft / saveDraft / submitDraft / evaluateDraft / confirmDraft /
   *                rejectDraft / discardDraft）；正式 demands 的唯一写回点是 confirmDraft。
   *   ③ OPS     ：沿用 Digital 出具 / 业务复核确认 / 退回。
   * 「总项目费用」不再独立成项，随需求清单版本一并生效。
   */
  const planAction = useCallback(
    ({ deptCode, fy, stage, action, note, version, actor = '郑亦凡', role = '业务部门', payload }) => {
      const deptName = (data.departments.find((d) => d.code === deptCode) || {}).name || deptCode;
      /** AI 摘要异步回填任务：在 setData 的函数式更新里按 id 收集，提交后统一调度一次 */
      let aiBackfill = null;
      setData((prev) => {
        const now = `${TODAY} ${new Date().toTimeString().slice(0, 5)}`;
        const activity = {
          id: `PA-${fy}-${String(prev.planActivities.length + 1).padStart(4, '0')}`,
          dept: deptCode,
          fy,
          stage,
          action,
          actor,
          role,
          at: now,
          note: note || '',
          version: version || null
        };
        const next = { ...prev, planActivities: [activity, ...prev.planActivities] };

        /* ---------- ① 年度 BP：只有「已提交」，每次提交/更新产生一个版本 ---------- */
        if (stage === 'BP') {
          const history = (prev.bpVersions || []).filter((v) => v.dept === deptCode && v.fy === fy);
          // 版本号唯一来源：calc.nextMinorVersion（严禁前端自算）。首个版本 V1.0，其后 V1.1 …
          const nextVersion = version || C.nextMinorVersion(history);

          const p = payload || {};
          const summary = (p.summary || '').trim();
          const newVid = `BPV-${deptCode}-${history.length + 1}`;

          // 版本列表（bpVersions）是唯一真相源：只追加一行完整内容快照，不再双写 bpRecords。
          // 双写必然分叉（主表读 bpRecords、页面读 bpVersions），字段扩展后两处会互相矛盾。
          next.bpVersions = [
            {
              id: newVid,
              fy,
              dept: deptCode,
              version: nextVersion,
              name: p.name || '—',
              goals: p.goals || '—',
              summary: summary || null,
              summarySource: summary ? 'business' : 'ai_pending',
              docs: p.docs || [],
              changeNote: p.changeNote || note || '',
              at: now,
              owner: actor
            },
            ...(prev.bpVersions || [])
          ];
          activity.version = nextVersion;

          // 业务未填摘要 → summarySource='ai_pending'，提交立即成功；此处登记异步回填任务
          if (!summary) {
            aiBackfill = {
              id: newVid,
              // 模板文本仅「依据已填字段归纳」，不编造任何具体数字
              text: `${p.name}：围绕「${(p.goals || '').split('\n')[0]}」展开，配套 ${(p.docs || []).length} 份文档；聚焦年度目标落地与 Digital 资源匹配。`
            };
          }
        }

        /* ---------- ② 需求清单及费用预估 ---------- */
        /* v0.8：DEMAND 已**全部改走 draft 动作集**（startDraft / saveDraft / submitDraft /
         * evaluateDraft / confirmDraft / rejectDraft / discardDraft），旧的 `action==='提交'`
         * 分支（会直接改写 data.demands / data.demandVersions、绕过草稿机制）**已连同
         * 「完成评估」一起移除**。正式 demands 的唯一写回点是 confirmDraft。 */

        /* ---------- ③ 系统运维预算：Digital 出具 / 业务复核确认 / 退回 ---------- */
        if (stage === 'OPS') {
          next.opsPlans = prev.opsPlans.map((o) => {
            if (o.dept !== deptCode || o.fy !== fy) return o;
            if (action === '出具') {
              return { ...o, version: o.version === '—' ? 'V0.1' : o.version, status: '待业务确认', issueDate: TODAY };
            }
            if (action === '复核确认') return { ...o, status: '已确认', confirmDate: TODAY };
            if (action === '退回') return { ...o, status: '编制中', issueDate: null };
            return o;
          });
        }

        return next;
      });
      // AI 摘要异步回填：延迟把刚写入的 ai_pending 版本**单向**补成 ai（按 id 定位，仅改这一条，
      // 单向一次、不可逆 —— 这是全表唯一允许的后置写入）。
      if (aiBackfill) {
        const task = aiBackfill;
        setTimeout(() => {
          setData((prev) => ({
            ...prev,
            bpVersions: (prev.bpVersions || []).map((v) =>
              v.id === task.id ? { ...v, summary: task.text, summarySource: 'ai' } : v
            )
          }));
        }, BP_AI_SUMMARY_DELAY);
      }
      log(actor, `${action}${{ BP: '年度 BP', DEMAND: '需求清单', OPS: '系统运维预算' }[stage] || ''}`, `${deptName}（${deptCode}）`);
    },
    [data.departments, log]
  );

  /* ================================================================== *
   * 需求清单「进行中的新版本」动作集（v0.8 §5 新版本状态机）
   *
   * 核心纪律：**除 confirmDraft 外，任何动作都不动 data.demands**。
   *   进行中内容一律存于 data.demandDrafts（每部门至多一条）；
   *   只有「业务复核确认」才把 draft.items 整体写回 demands 并删除该 draft ——
   *   这就是"新版本在最终业务确认前不展示"的底层保证。
   *
   * 状态对应（v0.8 §5.2）：
   *   startDraft     S0/S1 → S2（新建草稿，items = 当前 demands 浅拷贝）
   *   saveDraft      S2 → S2（保存草稿）
   *   submitDraft    S2/S0 → S3（提交更新；前置一条 version=null 版本）
   *   evaluateDraft  S3 → S4（Digital 反馈费用；未填按 estAmount 兜底）
   *   confirmDraft   S4 → S5（业务复核确认 → 得号，写回 demands，删 draft）
   *   rejectDraft    S4 → S3（退回重反馈）
   *   discardDraft   S2/S3/S4 → S1（废弃新版本，删 draft 与未确认版本）
   * ================================================================== */

  /** 留痕 + 审计日志的小工具（部门名回填 target） */
  const logDemand = useCallback(
    (actor, action, deptCode) => {
      const deptName = (data.departments.find((d) => d.code === deptCode) || {}).name || deptCode;
      log(actor, action, `${deptName}（${deptCode}）`);
    },
    [data.departments, log]
  );

  const startDraft = useCallback((deptCode, fy) => {
    setData((prev) => {
      const exists = (prev.demandDrafts || []).some((d) => d.dept === deptCode && d.fy === fy);
      if (exists) return prev;
      const now = nowStr();
      const items = prev.demands.filter((d) => d.dept === deptCode && d.fy === fy).map((d) => ({ ...d }));
      const draft = {
        id: `DR-${deptCode}`,
        dept: deptCode,
        fy,
        status: '草稿',
        items,
        changeNote: '',
        startedAt: now,
        updatedAt: now,
        submittedAt: null,
        evaluatedAt: null,
        evaluator: null
      };
      return { ...prev, demandDrafts: [draft, ...(prev.demandDrafts || [])] };
    });
  }, []);

  const saveDraft = useCallback(
    (deptCode, fy, items, note, actor = '郑亦凡', role = '业务部门') => {
      setData((prev) => {
        const now = nowStr();
        const draft = (prev.demandDrafts || []).find((d) => d.dept === deptCode && d.fy === fy);
        let demandDrafts;
        if (draft) {
          demandDrafts = prev.demandDrafts.map((d) =>
            d.dept === deptCode && d.fy === fy
              ? { ...d, items: items || d.items, changeNote: note != null ? note : d.changeNote, updatedAt: now }
              : d
          );
        } else {
          // 兜底：无草稿时按当前正式清单新建一条 S2 草稿（不应发生，防御性处理）
          const base = prev.demands.filter((d) => d.dept === deptCode && d.fy === fy).map((d) => ({ ...d }));
          demandDrafts = [
            {
              id: `DR-${deptCode}`, dept: deptCode, fy, status: '草稿',
              items: items || base, changeNote: note || '',
              startedAt: now, updatedAt: now, submittedAt: null, evaluatedAt: null, evaluator: null
            },
            ...(prev.demandDrafts || [])
          ];
        }
        return {
          ...prev,
          demandDrafts,
          planActivities: [mkActivity(prev, deptCode, fy, '保存草稿', actor, role, note), ...prev.planActivities]
        };
      });
      logDemand(actor, '保存需求清单草稿', deptCode);
    },
    [logDemand]
  );

  const submitDraft = useCallback(
    (deptCode, fy, note, actor = '郑亦凡', role = '业务部门') => {
      setData((prev) => {
        const now = nowStr();
        const draft = (prev.demandDrafts || []).find((d) => d.dept === deptCode && d.fy === fy);
        const items = draft
          ? draft.items
          : prev.demands.filter((d) => d.dept === deptCode && d.fy === fy).map((d) => ({ ...d }));
        const cnt = (prev.demandVersions || []).filter((v) => v.dept === deptCode && v.fy === fy).length;
        const newVersion = {
          id: `DV-${deptCode}-${cnt + 1}`,
          fy,
          dept: deptCode,
          version: null,
          status: '待评估费用',
          count: items.length,
          totalAmount: null,
          submittedAt: now,
          confirmedAt: null,
          submitter: actor,
          evaluator: null,
          changeNote: note || (draft && draft.changeNote) || '提交完整需求清单'
        };
        const demandDrafts = draft
          ? prev.demandDrafts.map((d) =>
              d.dept === deptCode && d.fy === fy
                ? { ...d, status: '待反馈费用', submittedAt: now, changeNote: note || d.changeNote }
                : d
            )
          : [
              {
                id: `DR-${deptCode}`, dept: deptCode, fy, status: '待反馈费用',
                items, changeNote: note || '',
                startedAt: now, updatedAt: now, submittedAt: now, evaluatedAt: null, evaluator: null
              },
              ...(prev.demandDrafts || [])
            ];
        return {
          ...prev,
          demandDrafts,
          demandVersions: [newVersion, ...(prev.demandVersions || [])],
          planActivities: [mkActivity(prev, deptCode, fy, '提交更新', actor, role, note), ...prev.planActivities]
        };
      });
      logDemand(actor, '提交需求清单更新', deptCode);
    },
    [logDemand]
  );

  const evaluateDraft = useCallback(
    (deptCode, fy, items, actor = '顾晓东', role = 'Digital') => {
      setData((prev) => {
        const now = nowStr();
        const draft = (prev.demandDrafts || []).find((d) => d.dept === deptCode && d.fy === fy);
        if (!draft) return prev;
        // 未手工核定的条目按业务预估兜底，保证版本一定是「完整费用预估」
        const finalItems = (items || draft.items).map((it) => ({
          ...it,
          evalAmount: it.evalAmount != null ? it.evalAmount : it.estAmount,
          status: '待复核确认'
        }));
        const demandDrafts = prev.demandDrafts.map((d) =>
          d.dept === deptCode && d.fy === fy
            ? { ...d, items: finalItems, status: '待复核确认', evaluatedAt: now, evaluator: actor }
            : d
        );
        const mine = (prev.demandVersions || []).filter((v) => v.dept === deptCode && v.fy === fy);
        const pending = mine
          .filter((v) => v.status === '待评估费用')
          .sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1))[0];
        const demandVersions = pending
          ? prev.demandVersions.map((v) => (v.id === pending.id ? { ...v, status: '待复核确认', count: finalItems.length } : v))
          : prev.demandVersions;
        return {
          ...prev,
          demandDrafts,
          demandVersions,
          planActivities: [
            mkActivity(prev, deptCode, fy, 'Digital反馈费用', actor, role, '逐条反馈 Digital 预算费用'),
            ...prev.planActivities
          ]
        };
      });
      logDemand(actor, '反馈项目预算费用', deptCode);
    },
    [logDemand]
  );

  const confirmDraft = useCallback(
    (deptCode, fy, actor = '郑亦凡', role = '业务部门') => {
      setData((prev) => {
        const now = nowStr();
        const draft = (prev.demandDrafts || []).find((d) => d.dept === deptCode && d.fy === fy);
        if (!draft) return prev;
        const items = draft.items.map((it) => ({
          ...it,
          evalAmount: it.evalAmount != null ? it.evalAmount : it.estAmount,
          status: '已确认'
        }));
        const total = items.reduce((s, it) => s + (it.evalAmount != null ? it.evalAmount : it.estAmount), 0);
        // 原地替换该 dept+fy 的全部条目，保持 demands 顺序稳定（不追加到尾部）
        const demands = [];
        let replaced = false;
        prev.demands.forEach((d) => {
          if (d.dept === deptCode && d.fy === fy) {
            if (!replaced) {
              demands.push(...items);
              replaced = true;
            }
          } else {
            demands.push(d);
          }
        });
        if (!replaced) demands.push(...items);
        // 得号（唯一触发点）
        const awarded = awardDemandVersion(prev, deptCode, fy, now, draft.evaluator, total);
        const demandDrafts = (prev.demandDrafts || []).filter((d) => !(d.dept === deptCode && d.fy === fy));
        return {
          ...prev,
          demands,
          demandVersions: awarded.versions,
          demandDrafts,
          planActivities: [
            mkActivity(
              prev,
              deptCode,
              fy,
              '业务复核确认',
              actor,
              role,
              `复核确认通过，清单得号 ${awarded.version || '—'}`,
              awarded.version
            ),
            ...prev.planActivities
          ]
        };
      });
      logDemand(actor, '复核确认需求清单', deptCode);
    },
    [logDemand]
  );

  const rejectDraft = useCallback(
    (deptCode, fy, note, actor = '郑亦凡', role = '业务部门') => {
      setData((prev) => {
        const draft = (prev.demandDrafts || []).find((d) => d.dept === deptCode && d.fy === fy);
        if (!draft) return prev;
        const demandDrafts = prev.demandDrafts.map((d) =>
          d.dept === deptCode && d.fy === fy ? { ...d, status: '待反馈费用' } : d
        );
        const mine = (prev.demandVersions || []).filter((v) => v.dept === deptCode && v.fy === fy);
        const pending = mine
          .filter((v) => v.status === '待复核确认')
          .sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1))[0];
        const demandVersions = pending
          ? prev.demandVersions.map((v) => (v.id === pending.id ? { ...v, status: '待评估费用' } : v))
          : prev.demandVersions;
        return {
          ...prev,
          demandDrafts,
          demandVersions,
          planActivities: [mkActivity(prev, deptCode, fy, '退回', actor, role, note), ...prev.planActivities]
        };
      });
      logDemand(actor, '退回需求清单（重反馈费用）', deptCode);
    },
    [logDemand]
  );

  const discardDraft = useCallback(
    (deptCode, fy, note, actor = '郑亦凡', role = '业务部门') => {
      setData((prev) => {
        const draft = (prev.demandDrafts || []).find((d) => d.dept === deptCode && d.fy === fy);
        if (!draft) return prev;
        // 删除该部门该年度**未确认**（version == null）的版本记录；demands 不变
        const mine = (prev.demandVersions || []).filter((v) => v.dept === deptCode && v.fy === fy);
        const target = mine
          .filter((v) => v.version == null)
          .sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1))[0];
        const demandVersions = target
          ? prev.demandVersions.filter((v) => v.id !== target.id)
          : prev.demandVersions;
        const demandDrafts = (prev.demandDrafts || []).filter((d) => !(d.dept === deptCode && d.fy === fy));
        return {
          ...prev,
          demandVersions,
          demandDrafts,
          planActivities: [mkActivity(prev, deptCode, fy, '废弃新版本', actor, role, note), ...prev.planActivities]
        };
      });
      logDemand(actor, '废弃需求清单新版本', deptCode);
    },
    [logDemand]
  );

  /**
   * 撤回提交（S3「待反馈费用」→ S2「草稿」）—— v1.6 新增。
   *
   * **为什么必须存在**：原状态机只有 S2→S3 单向边，业务提交后清单全部只读，
   * 发现一条写错时唯一出路是 `discardDraft` 废弃整个进行中版本 ——
   * 而该动作会连带删除已提交的 version 记录，等于整份清单重录。
   * 「填错了」是编制场景最高频的正常事件，缺这条边等于逼用户走最重的路。
   *
   * 语义：把该部门**未得号**（version == null）的最新版本记录删掉、
   * 草稿状态退回「草稿」并清空提交/评估痕迹。`demands`（正式清单）不动。
   * 已得号的已确认版本**不可撤回**（那是既成事实，要改走新的变更流程）。
   */
  const withdrawDraft = useCallback(
    (deptCode, fy, note, actor = '郑亦凡', role = '业务部门') => {
      setData((prev) => {
        const draft = (prev.demandDrafts || []).find((d) => d.dept === deptCode && d.fy === fy);
        if (!draft) return prev;
        // 只允许从「待反馈费用」撤回；S4（待复核确认）走 reject，栅栏化避免重复留痕
        if (draft.status !== '待反馈费用') return prev;

        const now = nowStr();
        const mine = (prev.demandVersions || []).filter((v) => v.dept === deptCode && v.fy === fy);
        const pending = mine
          .filter((v) => v.version == null)
          .sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1))[0];
        const demandVersions = pending
          ? prev.demandVersions.filter((v) => v.id !== pending.id)
          : prev.demandVersions;
        const demandDrafts = (prev.demandDrafts || []).map((d) =>
          d.dept === deptCode && d.fy === fy
            ? {
                ...d,
                status: '草稿',
                updatedAt: now,
                submittedAt: null,
                evaluatedAt: null,
                evaluator: null
              }
            : d
        );
        return {
          ...prev,
          demandVersions,
          demandDrafts,
          planActivities: [mkActivity(prev, deptCode, fy, '撤回修改', actor, role, note || '撤回提交，清单回到可编辑状态'), ...prev.planActivities]
        };
      });
      logDemand(actor, '撤回需求清单提交', deptCode);
    },
    [logDemand]
  );

  /* ================================================================== *
   * 系统运维预算「进行中的新版本」动作集（v1.1 §5 新版本状态机）
   *
   * 核心纪律（**逐字复刻 v0.8 需求清单 draft 纪律**）：
   *   **除 confirmOpsDraft 外，任何动作都不动正式数据**（opsPlans[].items / OPS_VERSIONS）。
   *   进行中内容一律存于 data.opsDrafts（每部门至多一条）；
   *   只有「业务复核确认」才把 draft.items 整体写回 opsPlans[].items、
   *   追加一条 opsVersions（**含 items 完整明细快照**）并删除该 draft ——
   *   这就是"新版本在最终业务确认前不展示"的底层保证。
   *
   * 状态对应（v1.1 §5.2，得号后移到业务复核确认，Q4 定稿）：
   *   startOpsDraft    未启动/已确认 → 编制中（新建草稿，items 取已确认明细，无则模型派生字面量）
   *   saveOpsDraft     编制中 → 编制中（只写 opsDrafts，status 不变）
   *   submitOpsDraft   编制中 → 待业务确认（**不写 items / 不写版本 / 不给版本号**；
   *                     R4 裁决：置 issueDate = TODAY，主表格「待业务确认」格即时显示待确认金额）
   *   confirmOpsDraft  待业务确认 → 已确认（**唯一写回点**：写回 items + 追加版本快照 + 得号）
   *   rejectOpsDraft   待业务确认 → 编制中（退回 Digital 重编，业务不改内容；issueDate 清空）
   *   discardOpsDraft  编制中/待业务确认 → 已确认版本 ? 已确认 : 未启动（删草稿）
   *
   * 注：主表「待业务确认」格是否显示金额由 opsPlans[].issueDate 驱动（PlanCell 既有口径）；
   *     submitOpsDraft 置 issueDate = TODAY —— 提交即视为业务侧可复核，主表格按
   *     annualPlanRow 三级回退显示「待业务确认草稿合计」（brief v1.2 §10 断言 10 改写版）。
   * ================================================================== */

  /** OPS 留痕（stage='OPS'，role 区分 Digital / 业务部门） */
  const mkOpsActivity = (prev, deptCode, fy, action, actor, role, note, version) => ({
    id: `PA-${fy}-${String((prev.planActivities || []).length + 1).padStart(4, '0')}`,
    dept: deptCode,
    fy,
    stage: 'OPS',
    action,
    actor,
    role,
    at: nowStr(),
    note: note || '',
    version: version || null
  });

  const startOpsDraft = useCallback((deptCode, fy) => {
    setData((prev) => {
      const exists = (prev.opsDrafts || []).some((d) => d.dept === deptCode && d.fy === fy);
      if (exists) return prev;
      const plan = (prev.opsPlans || []).find((o) => o.dept === deptCode && o.fy === fy);
      const st = plan ? plan.status : '未启动';
      // 未启动 / 已确认（或防御性：编制中但草稿丢失）才允许新建
      if (st !== '未启动' && st !== '已确认' && st !== '编制中') return prev;
      const now = nowStr();
      const items = C.opsFirstDraftItems(prev, deptCode, fy);
      const draft = {
        id: `OD-${deptCode}`,
        dept: deptCode,
        fy,
        status: '编制中',
        items,
        changeNote: '',
        startedAt: now,
        updatedAt: now,
        submittedAt: null,
        actor: plan ? plan.digitalOwner : 'Digital'
      };
      return {
        ...prev,
        opsDrafts: [draft, ...(prev.opsDrafts || [])],
        opsPlans: (prev.opsPlans || []).map((o) =>
          o.dept === deptCode && o.fy === fy ? { ...o, status: '编制中' } : o
        )
      };
    });
  }, []);

  const saveOpsDraft = useCallback(
    (deptCode, fy, { items, note, actor = 'Digital', role = 'Digital' } = {}) => {
      setData((prev) => {
        const now = nowStr();
        let opsDrafts;
        const draft = (prev.opsDrafts || []).find((d) => d.dept === deptCode && d.fy === fy);
        if (draft) {
          opsDrafts = (prev.opsDrafts || []).map((d) =>
            d.dept === deptCode && d.fy === fy
              ? { ...d, items: items || d.items, changeNote: note != null ? note : d.changeNote, updatedAt: now }
              : d
          );
        } else {
          // 兜底：无草稿时按当前正式明细新建一条（防御性，不应发生）
          opsDrafts = [
            {
              id: `OD-${deptCode}`, dept: deptCode, fy, status: '编制中',
              items: items || C.opsFirstDraftItems(prev, deptCode, fy),
              changeNote: note || '', startedAt: now, updatedAt: now, submittedAt: null, actor
            },
            ...(prev.opsDrafts || [])
          ];
        }
        return {
          ...prev,
          opsDrafts,
          planActivities: [mkOpsActivity(prev, deptCode, fy, '保存草稿', actor, role, note), ...prev.planActivities]
        };
      });
      const deptName = (data.departments.find((d) => d.code === deptCode) || {}).name || deptCode;
      log(actor, '保存系统运维预算草稿', `${deptName}（${deptCode}）`);
    },
    [data.departments, log]
  );

  const submitOpsDraft = useCallback(
    (deptCode, fy, { note, actor = 'Digital', role = 'Digital' } = {}) => {
      setData((prev) => {
        const now = nowStr();
        const draft = (prev.opsDrafts || []).find((d) => d.dept === deptCode && d.fy === fy);
        const opsDrafts = draft
          ? (prev.opsDrafts || []).map((d) =>
              d.dept === deptCode && d.fy === fy
                ? { ...d, status: '待业务确认', submittedAt: now, changeNote: note || d.changeNote }
                : d
            )
          : prev.opsDrafts;
        return {
          ...prev,
          opsDrafts,
          // 只推进状态头；**不得写 opsPlans[].items / 不得写 opsVersions / 不得给版本号**；
          // R4 裁决：置 issueDate = TODAY（主表格「待业务确认」格即时显示草稿合计）
          opsPlans: (prev.opsPlans || []).map((o) =>
            o.dept === deptCode && o.fy === fy ? { ...o, status: '待业务确认', issueDate: TODAY } : o
          ),
          planActivities: [
            mkOpsActivity(prev, deptCode, fy, '提交预算', actor, role, note || '提交运维预算，待业务复核确认'),
            ...prev.planActivities
          ]
        };
      });
      const deptName = (data.departments.find((d) => d.code === deptCode) || {}).name || deptCode;
      log(actor, '提交系统运维预算', `${deptName}（${deptCode}）`);
    },
    [data.departments, log]
  );

  const confirmOpsDraft = useCallback(
    (deptCode, fy, { note, actor = '业务', role = '业务部门' } = {}) => {
      setData((prev) => {
        const draft = (prev.opsDrafts || []).find((d) => d.dept === deptCode && d.fy === fy);
        if (!draft) return prev;
        const now = nowStr();
        const items = draft.items.map((it) => ({ ...it }));
        const totalAmount = items.reduce((s, it) => s + it.amount, 0);
        const plan = (prev.opsPlans || []).find((o) => o.dept === deptCode && o.fy === fy);
        // 得号（**唯一触发点**）：版本号只由 calc.nextMinorVersion 生成，严禁前端自算
        const history = (prev.opsVersions || []).filter((v) => v.dept === deptCode && v.fy === fy);
        const version = C.nextMinorVersion(history);
        const newVersion = {
          id: `OPSV-${deptCode}-${history.length + 1}`,
          fy,
          dept: deptCode,
          version,
          status: '已确认',
          items, // 完整明细快照（Q1 单价可编辑后，历史明细是审计核心，必须逐行可回溯）
          itemCount: items.length,
          totalAmount,
          submittedAt: draft.submittedAt,
          confirmedAt: now,
          submitter: draft.actor || (plan ? plan.digitalOwner : 'Digital'),
          confirmer: actor,
          changeNote: note || draft.changeNote || ''
        };
        const opsDrafts = (prev.opsDrafts || []).filter((d) => !(d.dept === deptCode && d.fy === fy));
        return {
          ...prev,
          // **唯一写回点**：draft.items 整体写回正式明细 + 状态头定稿
          opsPlans: (prev.opsPlans || []).map((o) =>
            o.dept === deptCode && o.fy === fy
              ? { ...o, items, status: '已确认', confirmDate: TODAY, version }
              : o
          ),
          opsVersions: [
            // P1-3：版本快照必须是**独立拷贝**——不得与 opsPlans[].items 共享同一数组引用，
            // 否则将来任何对正式明细的原地修改都会污染历史快照，「旧版可追溯」失真
            { ...newVersion, items: items.map((it) => ({ ...it })) },
            ...(prev.opsVersions || [])
          ],
          opsDrafts,
          planActivities: [
            mkOpsActivity(prev, deptCode, fy, '业务复核确认', actor, role, `复核确认通过，运维预算得号 ${version}`, version),
            ...prev.planActivities
          ]
        };
      });
      const deptName = (data.departments.find((d) => d.code === deptCode) || {}).name || deptCode;
      log(actor, '复核确认系统运维预算', `${deptName}（${deptCode}）`);
    },
    [data.departments, log]
  );

  const rejectOpsDraft = useCallback(
    (deptCode, fy, { note, actor = '业务', role = '业务部门' } = {}) => {
      setData((prev) => {
        const draft = (prev.opsDrafts || []).find((d) => d.dept === deptCode && d.fy === fy);
        if (!draft) return prev;
        const opsDrafts = (prev.opsDrafts || []).map((d) =>
          d.dept === deptCode && d.fy === fy ? { ...d, status: '编制中', submittedAt: null } : d
        );
        return {
          ...prev,
          opsDrafts,
          opsPlans: (prev.opsPlans || []).map((o) =>
            o.dept === deptCode && o.fy === fy ? { ...o, status: '编制中', issueDate: null } : o
          ),
          planActivities: [
            mkOpsActivity(prev, deptCode, fy, '退回补充', actor, role, note || '复核不通过，退回 Digital 重新编制'),
            ...prev.planActivities
          ]
        };
      });
      const deptName = (data.departments.find((d) => d.code === deptCode) || {}).name || deptCode;
      log(actor, '退回系统运维预算（重编）', `${deptName}（${deptCode}）`);
    },
    [data.departments, log]
  );

  const discardOpsDraft = useCallback(
    (deptCode, fy, { note, actor = 'Digital', role = 'Digital' } = {}) => {
      setData((prev) => {
        const draft = (prev.opsDrafts || []).find((d) => d.dept === deptCode && d.fy === fy);
        if (!draft) return prev;
        const hasConfirmed = (prev.opsVersions || []).some(
          (v) => v.dept === deptCode && v.fy === fy && v.status === '已确认'
        );
        const opsDrafts = (prev.opsDrafts || []).filter((d) => !(d.dept === deptCode && d.fy === fy));
        return {
          ...prev,
          opsDrafts,
          opsPlans: (prev.opsPlans || []).map((o) =>
            o.dept === deptCode && o.fy === fy
              ? { ...o, status: hasConfirmed ? '已确认' : '未启动' }
              : o
          ),
          planActivities: [
            mkOpsActivity(prev, deptCode, fy, '废弃新版本', actor, role, note || '废弃本次新版本'),
            ...prev.planActivities
          ]
        };
      });
      const deptName = (data.departments.find((d) => d.code === deptCode) || {}).name || deptCode;
      log(actor, '废弃系统运维预算新版本', `${deptName}（${deptCode}）`);
    },
    [data.departments, log]
  );

  /* ---------------- 交付期 ---------------- */

  const submitBRD = useCallback((payload) => {
    let newId = '';
    setData((prev) => {
      const id = nextSeq(prev.brds, 'BRD', payload.fy);
      newId = id;
      const brd = {
        id,
        fy: payload.fy,
        dept: payload.dept,
        reporter: payload.reporter,
        submitDate: TODAY,
        title: payload.title,
        system: payload.system,
        relatedDemandId: payload.relatedDemandId || null,
        relationType: payload.relatedDemandId ? 'PLANNED' : 'NEW',
        newDemandReason: payload.relatedDemandId ? null : payload.newDemandReason || '未说明',
        value: payload.value,
        expectGoLive: payload.expectGoLive,
        status: 'SUBMITTED',
        evalLines: [],
        evalBy: null,
        evalDate: null,
        signedDate: null,
        crs: [],
        delivery: null
      };
      return { ...prev, brds: [brd, ...prev.brds] };
    });
    return newId;
  }, []);

  const startEvaluation = useCallback((brdId) => {
    setData((prev) => ({
      ...prev,
      brds: prev.brds.map((b) => (b.id === brdId ? { ...b, status: 'EVALUATING' } : b))
    }));
  }, []);

  const signOffBRD = useCallback((brdId, lines, by) => {
    setData((prev) => ({
      ...prev,
      brds: prev.brds.map((b) =>
        b.id === brdId
          ? { ...b, status: 'SIGNED', evalLines: lines, evalBy: by, evalDate: TODAY, signedDate: TODAY }
          : b
      )
    }));
  }, []);

  const addCR = useCallback((brdId, payload) => {
    setData((prev) => {
      const id = nextCRSeq(prev.brds);
      return {
        ...prev,
        brds: prev.brds.map((b) =>
          b.id === brdId
            ? {
                ...b,
                crs: [
                  ...(b.crs || []),
                  {
                    id,
                    type: payload.type,
                    desc: payload.desc,
                    delta: payload.delta,
                    status: '已批准',
                    date: TODAY,
                    approvedBy: payload.approvedBy
                  }
                ]
              }
            : b
        )
      };
    });
  }, []);

  const deliverBRD = useCallback((brdId, payload) => {
    setData((prev) => ({
      ...prev,
      brds: prev.brds.map((b) =>
        b.id === brdId
          ? {
              ...b,
              status: 'DELIVERED',
              delivery: {
                goLiveDate: payload.goLiveDate,
                actualLines: payload.actualLines,
                note: payload.note || ''
              }
            }
          : b
      )
    }));
  }, []);

  const rejectBRD = useCallback((brdId) => {
    setData((prev) => ({
      ...prev,
      brds: prev.brds.map((b) => (b.id === brdId ? { ...b, status: 'REJECTED' } : b))
    }));
  }, []);

  /* ---------------- 计费期 ---------------- */

  const confirmMonths = useCallback((months) => {
    setData((prev) => ({
      ...prev,
      confirmedMonths: Array.from(new Set([...prev.confirmedMonths, ...months])).sort(),
      sentMonths: prev.sentMonths.filter((m) => !months.includes(m))
    }));
  }, []);

  const sendMonths = useCallback((months) => {
    setData((prev) => ({
      ...prev,
      sentMonths: Array.from(new Set([...prev.sentMonths, ...months]))
    }));
  }, []);

  /* ---------------- 派生数据 ---------------- */

  const derived = useMemo(() => {
    const pool26 = C.poolSummary(data, 2026);
    const pool27 = C.poolSummary(data, 2027);

    const monthRows = data.months.map((month) => {
      let delivery = 0;
      let ops = 0;
      data.departments.forEach((d) => {
        const bill = C.buildBill(data, month, d.code);
        delivery += bill.deliveryTotal;
        ops += bill.opsTotal;
      });
      return {
        month,
        status: C.billStateOf(data, month),
        delivery,
        ops,
        total: delivery + ops
      };
    });

    return {
      pool26,
      pool27,
      kpi: C.dashboardKpi(data),
      monthRows,
      monthMap: Object.fromEntries(monthRows.map((r) => [r.month, r])),
      crossYear: C.crossYearImpact(data)
    };
  }, [data]);

  const value = useMemo(
    () => ({
      data,
      derived,
      auditLog,
      log,
      globalFy,
      setGlobalFy,
      updateBpRecord,
      discardBpVersion,
      updateDemand,
      planAction,
      startDraft,
      saveDraft,
      submitDraft,
      evaluateDraft,
      confirmDraft,
      rejectDraft,
      discardDraft,
      withdrawDraft,
      startOpsDraft,
      saveOpsDraft,
      submitOpsDraft,
      confirmOpsDraft,
      rejectOpsDraft,
      discardOpsDraft,
      submitBRD,
      startEvaluation,
      signOffBRD,
      addCR,
      deliverBRD,
      rejectBRD,
      confirmMonths,
      sendMonths
    }),
    [data, derived, auditLog, log, globalFy, updateBpRecord, discardBpVersion, updateDemand, planAction,
      startDraft, saveDraft, submitDraft, evaluateDraft, confirmDraft, rejectDraft, discardDraft, withdrawDraft,
      startOpsDraft, saveOpsDraft, submitOpsDraft, confirmOpsDraft, rejectOpsDraft, discardOpsDraft,
      submitBRD, startEvaluation, signOffBRD, addCR, deliverBRD, rejectBRD, confirmMonths, sendMonths]
  );

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useStore 必须在 StoreProvider 内使用');
  return ctx;
}

export { C as calc };
