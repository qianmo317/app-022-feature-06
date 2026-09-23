import type { Block, Layout, Page, Row } from '../types';
import { isCjk } from './input';
import { ROW_FACTOR } from '../components/paint';

/** A4 页面几何（mm）。左右留 5mm 装订边距，保证 10×20mm 默认每行格数正好放下。 */
export const PAGE = {
  wMm: 210,
  hMm: 297,
  marginLMm: 5,
  marginRMm: 5,
  marginTMm: 8,
  marginBMm: 8,
  headerMm: 12,
} as const;

export const usableWMm = PAGE.wMm - PAGE.marginLMm - PAGE.marginRMm; // 200
export const rowsAreaHMm = PAGE.hMm - PAGE.marginTMm - PAGE.marginBMm - PAGE.headerMm; // 269

export const TRACE_PRESETS = [
  { label: '浅', value: '#d9d9d9' },
  { label: '中', value: '#cccccc' },
  { label: '深', value: '#b3b3b3' },
] as const;

export const GRID_LABELS: Record<Layout['grid'], string> = {
  tian: '田字格',
  mi: '米字格',
  huigong: '回宫格',
  square: '方格',
  line: '横线',
};

export const STRUCTURE_LABELS: Record<string, string> = {
  left_right: '左右结构',
  top_bottom: '上下结构',
  single: '独体字',
  enclosure: '包围结构',
};

export function maxPerLine(cellMm: number): number {
  return Math.max(1, Math.floor(usableWMm / cellMm));
}

export function maxLines(cellMm: number, lineGapMm: number): number {
  const pitch = cellMm * ROW_FACTOR + lineGapMm;
  return Math.max(1, Math.floor(rowsAreaHMm / pitch));
}

/** 约束并修正非法/超界的版式配置 */
export function clampLayout(layout: Layout): Layout {
  const cellMm = Math.min(35, Math.max(12, Math.round(layout.cellMm)));
  const gap = Math.min(12, Math.max(0, Math.round(layout.lineGapMm)));
  const perLine = Math.min(maxPerLine(cellMm), Math.max(1, Math.round(layout.perLine)));
  const lines = Math.min(maxLines(cellMm, gap), Math.max(1, Math.round(layout.lines)));
  const mix = {
    model: Math.min(1, Math.max(0, Math.round(layout.mix.model))),
    strokeSteps: Math.min(8, Math.max(0, Math.round(layout.mix.strokeSteps))),
    trace: Math.min(8, Math.max(0, Math.round(layout.mix.trace))),
    blank: Math.min(8, Math.max(0, Math.round(layout.mix.blank))),
  };
  return { ...layout, cellMm, lineGapMm: gap, perLine, lines, mix };
}

/**
 * 一个字的组合小格。笔顺分解格数自适应笔画数（min(配置, 笔画数)）。
 * 无笔顺数据的汉字只保留例字与临写空格（不提供描红，避免误教）。
 */
export function buildBlock(char: string, layout: Layout, strokeCount: number | undefined): Block {
  const { mix } = layout;
  const cells: Block['cells'] = [];
  const noStrokeHanzi = strokeCount == null && isCjk(char);
  if (mix.model > 0) cells.push({ kind: 'model' });
  if (mix.strokeSteps > 0 && strokeCount != null) {
    const n = Math.min(mix.strokeSteps, strokeCount);
    for (let k = 1; k <= n; k++) cells.push({ kind: 'step', stepK: k });
  }
  if (!noStrokeHanzi) {
    for (let i = 0; i < mix.trace; i++) cells.push({ kind: 'trace' });
  }
  for (let i = 0; i < mix.blank; i++) cells.push({ kind: 'blank' });
  // 极端配置兜底：一个字的组合不允许超过一行格数
  return { char, cells: cells.slice(0, Math.max(1, layout.perLine)) };
}

/**
 * 分页排版：贪心按行填充。
 * 约束：一个字的所有小格必须在同一行、同一页（不拆字）；一行不跨页。
 */
export function paginate(
  chars: string[],
  layout: Layout,
  strokeCountOf: (ch: string) => number | undefined,
): Page[] {
  const clamped = clampLayout(layout);
  const rows: Row[] = [];
  let current: Row = [];
  let used = 0;
  for (const ch of chars) {
    const block = buildBlock(ch, clamped, strokeCountOf(ch));
    if (used > 0 && used + block.cells.length > clamped.perLine) {
      rows.push(current);
      current = [block];
      used = block.cells.length;
    } else {
      current.push(block);
      used += block.cells.length;
    }
  }
  if (current.length > 0) rows.push(current);

  const pages: Page[] = [];
  for (let i = 0; i < rows.length; i += clamped.lines) {
    pages.push(rows.slice(i, i + clamped.lines));
  }
  // 空内容也渲染一页（空白字帖可直接打印画格子）
  if (pages.length === 0) pages.push([]);
  return pages;
}

export const defaultLayout: Layout = {
  grid: 'tian',
  perLine: 10,
  lines: 10,
  cellMm: 20,
  lineGapMm: 2,
  mix: { model: 1, strokeSteps: 3, trace: 2, blank: 4 },
  show: { pinyin: true, radical: true, strokeCount: true, structure: true },
  traceColor: '#cccccc',
};
