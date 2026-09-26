import type { Worksheet } from '../types';

/** 历史栈上限：满 50 步后丢弃最早的一步 */
export const HISTORY_LIMIT = 50;
/** 相同 mergeKey 的连续编辑在该时间窗内合并为一步（连续打字、拖动滑块） */
export const MERGE_WINDOW_MS = 1000;

export type HistoryEntry = {
  id: number;
  /** 改的是哪一项，如「标题」「版式 · 格线类型」「内容文字」 */
  label: string;
  /** 动的是哪个字（替换 / 删除 / 选读音时记录） */
  target?: string;
  /** 改之前的展示文本（悬停前后对照用） */
  beforeText: string;
  /** 改之后的展示文本 */
  afterText: string;
  /** 修改前的整份快照（撤销时恢复） */
  before: Worksheet;
  /** 修改后的整份快照（重做时恢复） */
  after: Worksheet;
  time: number;
  /** 相同 mergeKey 且间隔很短的连续编辑合并为一步 */
  mergeKey?: string;
};

export type HistoryState = {
  entries: HistoryEntry[];
  /** 当前已生效的最后一步下标；-1 表示全部已撤销（处于初始状态） */
  cursor: number;
};

export const emptyHistory = (): HistoryState => ({ entries: [], cursor: -1 });

/**
 * 推入一步编辑：
 * - 若之前有已撤销的步骤，先丢弃这条重做分支；
 * - 与栈顶 mergeKey 相同且在时间窗内 → 合并为一步（保留最早的 before，更新 after）；
 * - 栈满 HISTORY_LIMIT 步时丢弃最早的一步。
 */
export function pushHistory(s: HistoryState, e: HistoryEntry): HistoryState {
  let entries = s.entries.slice(0, s.cursor + 1);
  const top = entries[entries.length - 1];
  if (top && e.mergeKey && top.mergeKey === e.mergeKey && e.time - top.time <= MERGE_WINDOW_MS) {
    entries = [...entries.slice(0, -1), { ...top, after: e.after, afterText: e.afterText, time: e.time }];
  } else {
    entries = [...entries, e];
  }
  if (entries.length > HISTORY_LIMIT) entries = entries.slice(entries.length - HISTORY_LIMIT);
  return { entries, cursor: entries.length - 1 };
}

export const canUndo = (s: HistoryState): boolean => s.cursor >= 0;
export const canRedo = (s: HistoryState): boolean => s.cursor < s.entries.length - 1;

/** 撤销一步：返回应恢复到的快照（该步的 before） */
export function undoHistory(s: HistoryState): { state: HistoryState; snapshot: Worksheet; entry: HistoryEntry } | undefined {
  if (!canUndo(s)) return undefined;
  const entry = s.entries[s.cursor];
  return { state: { ...s, cursor: s.cursor - 1 }, snapshot: entry.before, entry };
}

/** 重做一步：返回应恢复到的快照（该步的 after） */
export function redoHistory(s: HistoryState): { state: HistoryState; snapshot: Worksheet; entry: HistoryEntry } | undefined {
  if (!canRedo(s)) return undefined;
  const entry = s.entries[s.cursor + 1];
  return { state: { ...s, cursor: s.cursor + 1 }, snapshot: entry.after, entry };
}

/** 跳到任意一步：index 为目标步下标，-1 表示回到所有修改之前 */
export function jumpHistory(s: HistoryState, index: number): { state: HistoryState; snapshot: Worksheet } | undefined {
  if (s.entries.length === 0 || index < -1 || index > s.entries.length - 1) return undefined;
  const snapshot = index === -1 ? s.entries[0].before : s.entries[index].after;
  return { state: { ...s, cursor: index }, snapshot };
}
