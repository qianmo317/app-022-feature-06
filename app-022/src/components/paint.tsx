/**
 * 核心渲染原语：预览、打印、导出共用同一套绘制函数（所见即所得）。
 * 坐标体系：1 unit = cellMm/100 mm；每行 = 信息带(20) + 格(100) = 120 units。
 */
import type { JSX } from 'react';
import type { Cell, Layout, Row } from '../types';
import { getStrokes, charMetaOf } from '../lib/data';
import { isCjk } from '../lib/input';

export const INFO_H = 20;
export const ROW_H = 100 + INFO_H; // 120
export const ROW_FACTOR = ROW_H / 100; // 行高（含信息带）= cellMm × 1.2

export const FONT_FAMILY = "'Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif";
const STROKE_W = 58; // 笔画宽（1024 em box 单位）
const TRACE_W = 62;
const STEP_DONE_COLOR = '#bfbfbf';
const STEP_CURRENT_COLOR = '#222222';
const MODEL_COLOR = '#222222';
const GUIDE_COLOR = '#e8a3a3';
const BORDER_COLOR = '#9aa0a6';
const PINYIN_COLOR = '#c0563c';
const META_COLOR = '#666666';
const SELECT_COLOR = '#4a90d9';

const GLYPH_K = 0.092;

/** 数据坐标（y 向上，1024 em box）→ 以 (cx,cy) 为中心、unit 制（格=100）的变换。播放器/导出也复用。 */
export function glyphTransform(cx: number, cy: number): string {
  // 数据坐标（y 向上，1024 em box，字形主体 0..900）→ 单元格中心
  return `translate(${cx} ${cy}) scale(${GLYPH_K}) translate(-512 -450) scale(1 -1) translate(0 -900)`;
}

/** 网格底（田/米/回宫/方/横线/四线格） */
export function GridLines({ x0, layout, y0 = INFO_H }: { x0: number; layout: Layout; y0?: number }): JSX.Element {
  const y = y0;
  const base = x0;
  const border = { stroke: BORDER_COLOR, strokeWidth: 2, fill: 'none' } as const;
  const guide = { stroke: GUIDE_COLOR, strokeWidth: 1.6, strokeDasharray: '5 4', fill: 'none' } as const;

  if (layout.grid === 'line') {
    if (layout.fourLine) {
      // 拼音四线格：四条横线，间距略不均（上格小，适合字母主体）
      const ys = [y + 12, y + 40, y + 68, y + 96];
      return (
        <g data-grid="line4">
          {ys.map((ly, i) => (
            <line key={i} x1={base} y1={ly} x2={base + 100} y2={ly} stroke={BORDER_COLOR} strokeWidth={i === 0 ? 1 : 2} />
          ))}
        </g>
      );
    }
    // 横线格：底线 + 浅虚线中线
    return (
      <g data-grid="line">
        <line x1={base} y1={y + 100} x2={base + 100} y2={y + 100} stroke={BORDER_COLOR} strokeWidth={2} />
        <line x1={base} y1={y + 50} x2={base + 100} y2={y + 50} stroke={GUIDE_COLOR} strokeWidth={1.4} strokeDasharray="5 4" />
      </g>
    );
  }

  const midX = base + 50;
  const midY = y + 50;
  return (
    <g data-grid={layout.grid}>
      <rect x={base} y={y} width={100} height={100} {...border} />
      {layout.grid === 'tian' && (
        <g {...guide}>
          <line x1={midX} y1={y} x2={midX} y2={y + 100} />
          <line x1={base} y1={midY} x2={base + 100} y2={midY} />
        </g>
      )}
      {layout.grid === 'mi' && (
        <g {...guide}>
          <line x1={midX} y1={y} x2={midX} y2={y + 100} />
          <line x1={base} y1={midY} x2={base + 100} y2={midY} />
          <line x1={base} y1={y} x2={base + 100} y2={y + 100} />
          <line x1={base} y1={y + 100} x2={base + 100} y2={y} />
        </g>
      )}
      {layout.grid === 'huigong' && (
        <g>
          <g {...guide}>
            <line x1={midX} y1={y} x2={midX} y2={y + 100} />
            <line x1={base} y1={midY} x2={base + 100} y2={midY} />
          </g>
          <rect x={base + 16} y={y + 16} width={68} height={68} {...guide} />
        </g>
      )}
    </g>
  );
}

/** 字形：有笔顺数据用 SVG 路径；无数据的汉字/字母用字体回退（不伪造笔画） */
export function GlyphAt({
  ch,
  cx,
  cy,
  color = MODEL_COLOR,
  strokeWidth = STROKE_W,
  upto,
  animateRef,
}: {
  ch: string;
  cx: number;
  cy: number;
  color?: string;
  strokeWidth?: number;
  upto?: number;
  animateRef?: (el: SVGPathElement | null) => void;
}): JSX.Element {
  const strokes = getStrokes(ch);
  if (strokes) {
    const shown = upto != null ? strokes.slice(0, upto) : strokes;
    return (
      <g transform={glyphTransform(cx, cy)}>
        {shown.map((s, i) => {
          const isCurrent = upto != null && i === upto - 1;
          return (
            <path
              key={s.order}
              d={s.path}
              fill="none"
              stroke={upto != null ? (isCurrent ? STEP_CURRENT_COLOR : STEP_DONE_COLOR) : color}
              strokeWidth={upto != null ? (isCurrent ? strokeWidth * 1.15 : strokeWidth * 0.9) : strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              ref={animateRef && isCurrent ? animateRef : undefined}
            />
          );
        })}
      </g>
    );
  }
  const fontSize = isCjk(ch) ? 82 : 64;
  return (
    <text
      x={cx}
      y={cy}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={fontSize}
      fontFamily={FONT_FAMILY}
      fill={color}
      data-fallback="font"
    >
      {ch}
    </text>
  );
}

/** 单元格上方的信息带：拼音 + 部首·笔画·结构 */
export function CellInfo({
  x0,
  pinyin,
  meta,
}: {
  x0: number;
  pinyin?: string;
  meta?: string;
}): JSX.Element {
  return (
    <g>
      {pinyin && (
        <text x={x0 + 50} y={12} textAnchor="middle" fontSize={15} fontFamily={FONT_FAMILY} fill={PINYIN_COLOR} data-pinyin>
          {pinyin}
        </text>
      )}
      {meta && (
        <text x={x0 + 50} y={19.5} textAnchor="middle" fontSize={10} fontFamily={FONT_FAMILY} fill={META_COLOR}>
          {meta}
        </text>
      )}
    </g>
  );
}

export type RowPaintOptions = {
  row: Row;
  layout: Layout;
  selectedChar?: string;
  pinyinFor?: (ch: string) => string | undefined;
};

/** 一行内容：网格 + 例字/笔顺分解/描红/空格 + 信息带 + 选中高亮 */
export function RowContent({ row, layout, selectedChar, pinyinFor }: RowPaintOptions): JSX.Element {
  const els: JSX.Element[] = [];
  let x = 0;
  row.forEach((block) => {
    const blockStart = x;
    const blockEls: JSX.Element[] = [];
    const strokes = getStrokes(block.char);
    const showInfo = layout.show;
    block.cells.forEach((cell: Cell) => {
      const cx0 = x;
      const cx = x + 50;
      const cy = INFO_H + 50;
      blockEls.push(<GridLines key={`grid-${cx0}`} x0={cx0} layout={layout} />);
      switch (cell.kind) {
        case 'model': {
          blockEls.push(<GlyphAt key={`m-${cx0}`} ch={block.char} cx={cx} cy={cy} color={MODEL_COLOR} />);
          let pinyin: string | undefined;
          let meta: string | undefined;
          if (strokes || !isCjk(block.char)) {
            if (showInfo.pinyin && pinyinFor) pinyin = pinyinFor(block.char);
            if (showInfo.radical || showInfo.strokeCount || showInfo.structure) {
              const meta0 = charMetaOf(block.char);
              const parts: string[] = [];
              if (showInfo.radical && meta0?.radical) parts.push(`部首 ${meta0.radical}`);
              if (showInfo.strokeCount && strokes) parts.push(`${strokes.length}画`);
              if (showInfo.structure && meta0?.structure) parts.push(STRUCT_LABEL[meta0.structure] ?? '');
              meta = parts.filter(Boolean).join(' · ') || undefined;
            }
          }
          blockEls.push(<CellInfo key={`info-${cx0}`} x0={cx0} pinyin={pinyin} meta={meta} />);
          // 无笔顺数据的汉字：明确标注
          if (!strokes && isCjk(block.char)) {
            blockEls.push(
              <text key={`ns-${cx0}`} x={cx} y={INFO_H + 96} textAnchor="middle" fontSize={9} fontFamily={FONT_FAMILY} fill="#c0392b" data-no-stroke="1">
                无笔顺数据
              </text>,
            );
          }
          break;
        }
        case 'step': {
          const k = cell.stepK ?? 1;
          blockEls.push(<GlyphAt key={`s-${cx0}`} ch={block.char} cx={cx} cy={cy} upto={k} strokeWidth={STROKE_W} />);
          blockEls.push(
            <text key={`sn-${cx0}`} x={cx0 + 88} y={INFO_H + 16} textAnchor="middle" fontSize={13} fontFamily={FONT_FAMILY} fill="#888" data-step-num={k}>
              {k}
            </text>,
          );
          break;
        }
        case 'trace':
          blockEls.push(<GlyphAt key={`t-${cx0}`} ch={block.char} cx={cx} cy={cy} color={layout.traceColor} strokeWidth={TRACE_W} />);
          break;
        case 'blank':
          break;
      }
      x += 100;
    });
    const isSelected = selectedChar === block.char;
    els.push(
      <g key={`blk-${blockStart}`} data-block={block.char} data-selected={isSelected || undefined}>
        {isSelected && (
          <rect
            x={blockStart - 1}
            y={INFO_H - 1}
            width={x - blockStart + 2}
            height={102}
            fill="none"
            stroke={SELECT_COLOR}
            strokeWidth={3}
            rx={3}
          />
        )}
        {blockEls}
      </g>,
    );
  });
  return <g data-row-content>{els}</g>;
}

const STRUCT_LABEL: Record<string, string> = {
  left_right: '左右',
  top_bottom: '上下',
  single: '独体',
  enclosure: '包围',
};
