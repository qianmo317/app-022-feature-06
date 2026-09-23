/**
 * 离线笔顺数据。全部本地资源（public/data/），不请求外部接口。
 * 格式：hanzi-writer v1 —— { strokes: string[], medians: number[][][] }
 * 部首/结构来自精选字典（charinfo.ts），未收录不展示。
 */
import { CHAR_META } from './charinfo';

export type StrokeEntry = { strokes: string[]; medians: number[][][] };
export type StrokeData = { format: string; count: number; chars: Record<string, StrokeEntry> };
export type CharMeta = { radical?: string; structure?: string };

let strokeData: StrokeData | null = null;
/** 用户导入的补充笔顺数据（含 localStorage 持久化） */
let customStrokes: Record<string, StrokeEntry> = {};

const LS_CUSTOM = 'app022:customStrokes';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`加载 ${url} 失败: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function initData(): Promise<void> {
  if (strokeData) return;
  strokeData = await fetchJson<StrokeData>('/data/strokes.json');
  try {
    customStrokes = JSON.parse(localStorage.getItem(LS_CUSTOM) || '{}');
  } catch {
    customStrokes = {};
  }
}

export function hasStrokes(ch: string): boolean {
  return Boolean(strokeData?.chars[ch] || customStrokes[ch]);
}

/** 笔顺路径（按 order 排序）；无数据返回 undefined —— 调用方必须显式提示「无笔顺数据」 */
export function getStrokes(ch: string): { path: string; order: number }[] | undefined {
  const e = strokeData?.chars[ch] ?? customStrokes[ch];
  if (!e || !Array.isArray(e.strokes) || e.strokes.length === 0) return undefined;
  return e.strokes.map((path, i) => ({ path, order: i + 1 }));
}

export function strokeCountOf(ch: string): number | undefined {
  const s = getStrokes(ch);
  return s ? s.length : undefined;
}

export function charMetaOf(ch: string): CharMeta | undefined {
  const m = CHAR_META[ch];
  return m ? { radical: m[0], structure: m[1] } : undefined;
}

/** 导入常见笔顺数据格式：{chars:{...}} 全量包 / {字:{strokes,...}} 单字映射 / {strokes}(应用到当前字) */
export function importStrokes(json: unknown, applyTo?: string): number {
  const obj = json as Record<string, unknown>;
  let merged: Record<string, StrokeEntry> = {};
  if (obj && typeof obj === 'object') {
    if (obj.chars && typeof obj.chars === 'object') merged = obj.chars as Record<string, StrokeEntry>;
    else if (obj.strokes && Array.isArray(obj.strokes) && applyTo) merged = { [applyTo]: obj as StrokeEntry };
    else merged = obj as Record<string, StrokeEntry>;
  }
  let n = 0;
  for (const [ch, entry] of Object.entries(merged)) {
    if (entry && Array.isArray((entry as StrokeEntry).strokes) && (entry as StrokeEntry).strokes.length > 0) {
      customStrokes[ch] = entry as StrokeEntry;
      n++;
    }
  }
  localStorage.setItem(LS_CUSTOM, JSON.stringify(customStrokes));
  return n;
}

export function dataStats(): { bundled: number; custom: number } {
  return {
    bundled: strokeData ? Object.keys(strokeData.chars).length : 0,
    custom: Object.keys(customStrokes).length,
  };
}
