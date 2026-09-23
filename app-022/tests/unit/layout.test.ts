import { describe, expect, it } from 'vitest';
import { buildBlock, clampLayout, defaultLayout, maxLines, maxPerLine, paginate } from '../../src/lib/layout';
import { isCjk, parseInput } from '../../src/lib/input';

describe('parseInput 去重与过滤', () => {
  it('去除重复字并保留首次出现顺序', () => {
    expect(parseInput('春天花 会花春')).toEqual(['春', '天', '花', '会']);
  });

  it('过滤标点、空白与非法字符', () => {
    expect(parseInput('a，b。c！3 4\t\n好！')).toEqual(['a', 'b', 'c', '3', '4', '好']);
  });

  it('按笔画数排序（无数据的字排最后，稳定）', () => {
    const counts: Record<string, number | undefined> = { 中: 4, 国: 8, 人: 2, 㐀: undefined };
    const out = parseInput('中国人㐀', {
      sortByStrokes: true,
      strokeCountOf: (ch) => counts[ch],
    });
    expect(out).toEqual(['人', '中', '国', '㐀']);
  });

  it('isCjk 判断', () => {
    expect(isCjk('春')).toBe(true);
    expect(isCjk('㐀')).toBe(true);
    expect(isCjk('a')).toBe(false);
    expect(isCjk('，')).toBe(false);
  });
});

describe('版式约束 clampLayout', () => {
  it('20mm 格宽每行最多 10 格', () => {
    expect(maxPerLine(20)).toBe(10);
  });

  it('默认版式行数 = floor(269 / (20*1.2+2)) = 10', () => {
    expect(maxLines(20, 2)).toBe(10);
  });

  it('clampLayout 约束各字段范围', () => {
    const c = clampLayout({
      ...defaultLayout,
      cellMm: 99,
      lineGapMm: -5,
      perLine: 999,
      lines: 0,
      mix: { model: 5, strokeSteps: 99, trace: -1, blank: 3 },
    });
    expect(c.cellMm).toBe(35);
    expect(c.lineGapMm).toBe(0);
    expect(c.perLine).toBe(maxPerLine(35));
    expect(maxLines(35, 0)).toBe(6); // 35mm 格 + 0 间距最多 6 行
    expect(c.lines).toBe(1); // 输入 0 → 至少 1 行
    expect(c.mix.model).toBe(1);
    expect(c.mix.strokeSteps).toBe(8);
    expect(c.mix.trace).toBe(0);
    expect(c.mix.blank).toBe(3);
  });
});

describe('buildBlock 组合规则', () => {
  it('例字1 + 笔顺分解min(3,笔画数) + 描红2 + 空格4', () => {
    const block = buildBlock('永', defaultLayout, 5);
    expect(block.cells.map((c) => c.kind)).toEqual([
      'model',
      'step',
      'step',
      'step',
      'trace',
      'trace',
      'blank',
      'blank',
      'blank',
      'blank',
    ]);
    expect(block.cells[1].stepK).toBe(1);
    expect(block.cells[3].stepK).toBe(3);
  });

  it('笔顺分解格数不超过笔画数（1 画的字只有第 1 笔）', () => {
    const block = buildBlock('一', defaultLayout, 1);
    const steps = block.cells.filter((c) => c.kind === 'step');
    expect(steps.length).toBe(1);
    expect(steps[0].stepK).toBe(1);
  });

  it('无笔顺数据的汉字：不生成分解格与描红格，仅例字+空格', () => {
    const block = buildBlock('㐀', defaultLayout, undefined);
    expect(block.cells.map((c) => c.kind)).toEqual(['model', 'blank', 'blank', 'blank', 'blank']);
  });

  it('组合不允许超过一行格数', () => {
    const layout = { ...defaultLayout, perLine: 5, mix: { model: 1, strokeSteps: 8, trace: 8, blank: 8 } };
    const block = buildBlock('永', layout, 5);
    expect(block.cells.length).toBe(5);
  });
});

describe('paginate 分页：不拆字、不拆行', () => {
  // 恰好 100 个互不相同的汉字
  const hundred = [
    ...new Set(
      [
        ..."一二三四五六七八九十人口手足耳目日月水火山石田土禾木马虫鱼肉鸟竹米谷风云电天上下大小多少长短高矮进出开关来去坐立走飞东西南北前中外交里半分变成白黑红黄蓝绿紫灰粉金银行学习工作休息游玩吃喝看听读写说球场",
      ],
    ),
  ].slice(0, 100);

  it('100 字 × 每字 10 格 × 每行 10 格 × 每页 10 行 = 恰好 10 页', () => {
    expect(hundred.length).toBe(100);
    const pages = paginate(hundred, defaultLayout, () => 5);
    expect(pages.length).toBe(10);
    // 总字数守恒且顺序不变
    const flat = pages.flat().map((row) => row.map((b) => b.char));
    expect(flat.flat()).toEqual(hundred);
  });

  it('每个字的所有小格在同一行（行内格数不超 perLine，且块完整）', () => {
    const pages = paginate(hundred, defaultLayout, () => 5);
    for (const page of pages) {
      for (const row of page) {
        const used = row.reduce((n, b) => n + b.cells.length, 0);
        expect(used).toBeLessThanOrEqual(10);
        for (const b of row) expect(b.cells.length).toBe(10); // 有数据字每块 10 格
      }
    }
  });

  it('同一个字不会出现在两个块里（不拆字）', () => {
    const pages = paginate(hundred, defaultLayout, () => 5);
    const seen = new Set<string>();
    for (const row of pages.flat()) {
      for (const b of row) {
        expect(seen.has(b.char)).toBe(false);
        seen.add(b.char);
      }
    }
    expect(seen.size).toBe(100);
  });

  it('混合笔画数：每行按实际块宽贪心填充', () => {
    // 一 1画 → 1+1+2+4 = 8 格；人/八 2画 → 10 格放不下一行 → 各占一行，仍在同一页
    const pages = paginate(['一', '人', '八'], defaultLayout, (ch) => (ch === '一' ? 1 : 2));
    expect(pages.length).toBe(1);
    expect(pages[0].map((row) => row.map((b) => b.char))).toEqual([['一'], ['人'], ['八']]);
  });

  it('空内容也渲染一页空白字帖', () => {
    const pages = paginate([], defaultLayout, () => undefined);
    expect(pages).toEqual([[]]);
  });
});
