/**
 * 单页导出：SVG（矢量）与 PNG（4x 位图）。
 * 与预览/打印共用 RowContent 渲染，所见即所得。
 */
import { renderToStaticMarkup } from 'react-dom/server';
import type { Worksheet } from '../types';
import { PAGE, clampLayout, paginate } from './layout';
import { RowContent, ROW_FACTOR } from '../components/paint';
import { pinyinResolver } from '../components/PageView';
import { strokeCountOf } from './data';

const PX_MM = 96 / 25.4; // 1mm = 3.7795px（CSS 参考）
/** 手工拼 SVG 属性用的字体串（不能带引号，否则破坏 XML 属性） */
const FONT_ATTR = 'Noto Sans SC,PingFang SC,Microsoft YaHei,sans-serif';

function mm(v: number): number {
  return Math.round(v * PX_MM * 1000) / 1000;
}

/** 组合单页 SVG 标记（width/height 用 mm，viewBox 用 px） */
export function pageSvgMarkup(worksheet: Worksheet, pageIndex: number): string {
  const layout = clampLayout(worksheet.layout);
  const pages = paginate(worksheet.chars, layout, strokeCountOf);
  const pi = Math.max(0, Math.min(pageIndex, pages.length - 1));
  const rows = pages[pi];
  const pinyinFor = pinyinResolver(worksheet);

  const mL = mm(PAGE.marginLMm);
  const headerTop = mm(PAGE.marginTMm);
  const rowsTop = mm(PAGE.marginTMm + PAGE.headerMm);
  const rowHeight = mm(layout.cellMm * ROW_FACTOR);
  const gap = mm(layout.lineGapMm);
  const scale = layout.cellMm * PX_MM / 100;

  const parts: string[] = [];
  // 页眉：标题 + 页码
  parts.push(
    `<text x="${mL}" y="${headerTop + 24}" font-family="${FONT_ATTR}" font-size="20" font-weight="700" fill="#222">${
      escapeXml(worksheet.title)
    }</text>`,
  );
  parts.push(
    `<text x="${mm(PAGE.wMm - PAGE.marginRMm)}" y="${headerTop + 24}" text-anchor="end" font-family="${FONT_ATTR}" font-size="12" fill="#666">第 ${pi + 1} 页 / 共 ${pages.length} 页</text>`,
  );
  // 行内容
  let y = rowsTop;
  for (const row of rows) {
    const inner = renderToStaticMarkup(
      <RowContent row={row} layout={layout} pinyinFor={pinyinFor} />,
    );
    parts.push(`<g transform="translate(${mL} ${y}) scale(${scale})">${inner}</g>`);
    y += rowHeight + gap;
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE.wMm}mm" height="${PAGE.hMm}mm" ` +
    `viewBox="0 0 ${mm(PAGE.wMm)} ${mm(PAGE.hMm)}">` +
    `<rect x="0" y="0" width="${mm(PAGE.wMm)}" height="${mm(PAGE.hMm)}" fill="#ffffff"/>` +
    parts.join('') +
    `</svg>`
  );
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c] as string,
  );
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

function baseName(worksheet: Worksheet): string {
  return (worksheet.title || '字帖').replace(/[\\/:*?"<>|]/g, '_');
}

/** 导出单页 SVG */
export function exportSvg(worksheet: Worksheet, pageIndex: number): void {
  const markup = pageSvgMarkup(worksheet, pageIndex);
  download(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }), `${baseName(worksheet)}-第${pageIndex + 1}页.svg`);
}

/** 导出单页 PNG（scale 倍率，默认 4） */
export function exportPng(worksheet: Worksheet, pageIndex: number, scale = 4): Promise<void> {
  return new Promise((resolve, reject) => {
    const markup = pageSvgMarkup(worksheet, pageIndex);
    const svgUrl = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      reject(new Error('PNG 导出失败：SVG 渲染错误'));
    };
    img.onload = () => {
      const w = Math.round(mm(PAGE.wMm) * scale);
      const h = Math.round(mm(PAGE.hMm) * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(svgUrl);
        reject(new Error('无法创建画布'));
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(svgUrl);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('PNG 编码失败'));
          return;
        }
        download(blob, `${baseName(worksheet)}-第${pageIndex + 1}页.png`);
        resolve();
      }, 'image/png');
    };
    img.src = svgUrl;
  });
}
