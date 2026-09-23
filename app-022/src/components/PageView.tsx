import { memo } from 'react';
import type { JSX, MouseEvent } from 'react';
import type { Row, Worksheet } from '../types';
import { PAGE, clampLayout, paginate } from '../lib/layout';
import { RowContent, ROW_FACTOR } from './paint';
import { getStrokes } from '../lib/data';
import { readingsOf } from '../lib/pinyin';

/** 100mm 校验尺（1:1 打印校验） */
export function Ruler(): JSX.Element {
  return (
    <svg
      data-testid="ruler"
      width="100mm"
      height="7mm"
      viewBox="0 0 100 7"
      style={{ display: 'block' }}
      aria-label="100mm 校验尺"
    >
      <rect x={0} y={0} width={100} height={7} fill="none" stroke="#999" strokeWidth={0.3} />
      <line x1={0.5} y1={6} x2={99.5} y2={6} stroke="#333" strokeWidth={0.4} />
      {Array.from({ length: 11 }, (_, i) => {
        const x = i * 10;
        const long = i % 5 === 0;
        return (
          <g key={i}>
            <line x1={x} y1={6} x2={x} y2={long ? 1.5 : 3.5} stroke="#333" strokeWidth={0.4} />
            {long && i > 0 && (
              <text x={x} y={4.8} textAnchor="middle" fontSize={3.4} fontFamily="'Noto Sans SC','PingFang SC',sans-serif" fill="#333">
                {i * 10}
              </text>
            )}
          </g>
        );
      })}
      <text x={0} y={4.8} fontSize={3.4} fontFamily="'Noto Sans SC','PingFang SC',sans-serif" fill="#333">
        0
      </text>
      <text x={0} y={0.9} fontSize={3} fontFamily="'Noto Sans SC','PingFang SC',sans-serif" fill="#c0392b">
        校验尺：打印后应为 100mm，请关闭「缩放/适应页面」
      </text>
    </svg>
  );
}

export function pinyinResolver(worksheet: Worksheet): (ch: string) => string | undefined {
  return (ch: string) => {
    const readings = readingsOf(ch);
    if (readings.length === 0) return undefined;
    const idx = worksheet.pinyinChoice?.[ch] ?? 0;
    return readings[Math.min(idx, readings.length - 1)];
  };
}

function strokeCountOf(ch: string): number | undefined {
  const s = getStrokes(ch);
  return s ? s.length : undefined;
}

/** 计算行内各字块的 unit 区间，用于点击命中 */
function blockRanges(row: Row): { char: string; start: number; end: number }[] {
  let x = 0;
  return row.map((b) => {
    const r = { char: b.char, start: x, end: x + b.cells.length * 100 };
    x = r.end;
    return r;
  });
}

type PageViewProps = {
  worksheet: Worksheet;
  selectedChar?: string;
  onSelectChar?: (ch: string) => void;
  /** 打印/导出模式下不显示选中态与点击行为 */
  plain?: boolean;
  className?: string;
};

/** 全部页面（预览与打印共用同一渲染，所见即打印所得） */
export const PageView = memo(function PageView({
  worksheet,
  selectedChar,
  onSelectChar,
  plain,
  className,
}: PageViewProps) {
  const layout = clampLayout(worksheet.layout);
  const pages = paginate(worksheet.chars, layout, strokeCountOf);
  const pinyinFor = pinyinResolver(worksheet);
  const rowWidthMm = layout.perLine * layout.cellMm;
  const rowHeightMm = layout.cellMm * ROW_FACTOR;

  function handleRowClick(row: Row, e: MouseEvent<SVGSVGElement>) {
    if (plain || !onSelectChar) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const unit = ((e.clientX - rect.left) / rect.width) * layout.perLine * 100;
    const hit = blockRanges(row).find((r) => unit >= r.start && unit < r.end);
    if (hit) onSelectChar(hit.char);
  }

  return (
    <div className={className} data-pages data-page-count={pages.length}>
      {pages.map((rows, pi) => (
        <div
          key={pi}
          className="sheet"
          data-page={pi}
          style={{
            width: `${PAGE.wMm}mm`,
            height: `${PAGE.hMm}mm`,
            paddingTop: `${PAGE.marginTMm}mm`,
            paddingRight: `${PAGE.marginRMm}mm`,
            paddingBottom: `${PAGE.marginBMm}mm`,
            paddingLeft: `${PAGE.marginLMm}mm`,
          }}
        >
          <div className="sheet-header" style={{ height: `${PAGE.headerMm}mm` }}>
            <div className="sheet-title" data-testid="sheet-title">
              {worksheet.title}
            </div>
            {pi === 0 && <Ruler />}
          </div>
          <div
            className="sheet-rows"
            style={{ display: 'flex', flexDirection: 'column', gap: `${layout.lineGapMm}mm` }}
          >
            {rows.map((row, ri) => (
              <svg
                key={ri}
                className="row-svg"
                data-row={ri}
                width={`${rowWidthMm}mm`}
                height={`${rowHeightMm}mm`}
                viewBox={`0 0 ${layout.perLine * 100} 120`}
                onClick={(e) => handleRowClick(row, e)}
              >
                <RowContent row={row} layout={layout} selectedChar={plain ? undefined : selectedChar} pinyinFor={pinyinFor} />
              </svg>
            ))}
          </div>
          <div className="sheet-footer" data-page-num={pi + 1}>
            第 {pi + 1} 页 / 共 {pages.length} 页
          </div>
        </div>
      ))}
    </div>
  );
});
