/**
 * 编辑器撤销/重做历史栈（纯函数核心，便于单测）。
 * 每一步记录：改了哪一项（label）、涉及哪个字（char）、改前/改后的值（before/after），
 * 以及这一步生效后的整份文档快照（snapshot）。撤销/重做 = 恢复到某一步的快照，
 * 因此可以连续撤回到任意一步，也能逐步重做回去。
 */
import type { Layout, Worksheet } from '../types';
import { GRID_LABELS, TRACE_PRESETS } from './layout';

/** 历史栈容量：满 50 步后丢弃最早的一步 */
export const HISTORY_LIMIT = 50;

/** 参与撤销的文档字段（pages/updatedAt 为派生字段，不入快照） */
export type DocSnapshot = {
  title: string;
  chars: string[];
  layout: Layout;
  pinyinChoice?: Record<string, number>;
  sortByStrokes?: boolean;
};

export type HistoryEntry = {
  id: number;
  /** 改了哪一项，如「格线类型」「标题」「删除字」 */
  label: string;
  /** 涉及的字（替换/删除/拼音），与字无关则为 undefined */
  char?: string;
  /** 改之前的值（展示用） */
  before: string;
  /** 改之后的值（展示用） */
  after: string;
  /** 这一步生效后的整份文档快照 */
  snapshot: DocSnapshot;
  /** 是否允许与上一步合并（连续型控件：标题逐字输入、滑杆拖动） */
  coalesce?: boolean;
  time: number;
};

export type HistoryState = {
  /** 栈底快照：第 0 步之前的状态（栈满丢弃最早一步时，推进为被丢弃那步之后的状态） */
  baseline: DocSnapshot;
  entries: HistoryEntry[];
  /** 当前位置 = 已生效的步数（0 = 栈底，entries.length = 最新） */
  index: number;
  /** 是否发生过容量丢弃（用于提示「更早的已丢弃」） */
  truncated: boolean;
};

/** 一步改动的描述（入栈用） */
export type StepDesc = { label: string; char?: string; before: string; after: string; coalesce?: boolean };

/** 连续型控件：同一项的连续改动合并为一步（拖滑杆、逐字敲标题；中间没有其它操作时） */
const COALESCABLE_LABELS = new Set(['标题', '格宽', '每行格数', '每页行数', '行距', '笔顺分解', '描红格', '临写空格']);
export const isCoalescable = (label: string): boolean => COALESCABLE_LABELS.has(label);

/** 从字帖文档取快照（深拷贝可变子对象，之后原文档的改动不影响快照） */
export function snapshotOf(ws: Worksheet): DocSnapshot {
  return {
    title: ws.title,
    chars: [...ws.chars],
    layout: { ...ws.layout, mix: { ...ws.layout.mix }, show: { ...ws.layout.show } },
    pinyinChoice: ws.pinyinChoice ? { ...ws.pinyinChoice } : undefined,
    sortByStrokes: ws.sortByStrokes,
  };
}

/** 以当前文档为栈底初始化（也用于清空：切字帖 / 重新生成内容 / 导出本机后） */
export function initHistory(ws: Worksheet): HistoryState {
  return { baseline: snapshotOf(ws), entries: [], index: 0, truncated: false };
}

let nextId = 1;

/**
 * 入栈一步。规则：
 * - 若当前处于撤销中段，先丢弃重做分支；
 * - 连续型改动（coalesce）且与栈顶是同一项、同一个字：合并进栈顶那一步（before 保留最初值）；
 * - 栈满 50 步丢弃最早的一步，栈底推进到被丢弃那步之后的状态。
 */
export function pushHistory(h: HistoryState, step: StepDesc, after: DocSnapshot, now = Date.now()): HistoryState {
  const done = h.entries.slice(0, h.index);
  const last = done[done.length - 1];
  if (step.coalesce && last && last.label === step.label && last.char === step.char) {
    const merged: HistoryEntry = { ...last, after: step.after, snapshot: after, time: now, coalesce: true };
    return { ...h, entries: [...done.slice(0, -1), merged], index: done.length };
  }
  const entry: HistoryEntry = { id: nextId++, ...step, snapshot: after, time: now };
  const entries = [...done, entry];
  if (entries.length > HISTORY_LIMIT) {
    const [dropped, ...rest] = entries;
    return { baseline: dropped.snapshot, entries: rest, index: rest.length, truncated: true };
  }
  return { ...h, entries, index: entries.length };
}

/** 目标位置对应的快照：0 → 栈底；i → 第 i 步生效后 */
export function snapshotAt(h: HistoryState, index: number): DocSnapshot {
  const i = Math.max(0, Math.min(index, h.entries.length));
  return i === 0 ? h.baseline : h.entries[i - 1].snapshot;
}

const onOff = (b: boolean): string => (b ? '开' : '关');
const traceLabel = (v: string): string => TRACE_PRESETS.find((t) => t.value === v)?.label ?? v;

export type LayoutChange = { label: string; before: string; after: string };

/** 逐叶子对比两版版式，返回人类可读的改动列表（无改动返回空数组） */
export function diffLayout(prev: Layout, next: Layout): LayoutChange[] {
  const out: LayoutChange[] = [];
  const push = (label: string, before: string, after: string) => {
    if (before !== after) out.push({ label, before, after });
  };
  push('格线类型', GRID_LABELS[prev.grid], GRID_LABELS[next.grid]);
  push('拼音四线格', onOff(Boolean(prev.fourLine)), onOff(Boolean(next.fourLine)));
  push('格宽', `${prev.cellMm}mm`, `${next.cellMm}mm`);
  push('每行格数', String(prev.perLine), String(next.perLine));
  push('每页行数', String(prev.lines), String(next.lines));
  push('行距', `${prev.lineGapMm}mm`, `${next.lineGapMm}mm`);
  push('例字', onOff(prev.mix.model > 0), onOff(next.mix.model > 0));
  push('笔顺分解', `${prev.mix.strokeSteps} 格`, `${next.mix.strokeSteps} 格`);
  push('描红格', `${prev.mix.trace} 格`, `${next.mix.trace} 格`);
  push('临写空格', `${prev.mix.blank} 格`, `${next.mix.blank} 格`);
  push('描红颜色', traceLabel(prev.traceColor), traceLabel(next.traceColor));
  push('显示拼音', onOff(prev.show.pinyin), onOff(next.show.pinyin));
  push('显示部首', onOff(prev.show.radical), onOff(next.show.radical));
  push('显示笔画数', onOff(prev.show.strokeCount), onOff(next.show.strokeCount));
  push('显示结构', onOff(prev.show.structure), onOff(next.show.structure));
  return out;
}

/** 字表对照展示：空格连接，超长截断 */
export function fmtChars(chars: string[], max = 14): string {
  if (chars.length === 0) return '（空）';
  return chars.length > max ? `${chars.slice(0, max).join(' ')} …` : chars.join(' ');
}
