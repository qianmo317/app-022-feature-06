import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type StrokeEntry = { strokes: string[]; medians: number[][][] };
type StrokeData = { format: string; count: number; chars: Record<string, StrokeEntry> };

const raw = readFileSync(new URL('../../public/data/strokes.json', import.meta.url), 'utf8');
const data = JSON.parse(raw) as StrokeData;

describe('离线笔顺数据完整性', () => {
  it('格式与数量一致', () => {
    expect(data.format).toBe('hanzi-writer-v1');
    expect(Object.keys(data.chars).length).toBe(data.count);
    expect(data.count).toBeGreaterThan(1000);
  });

  it('每个字的 strokes 为非空数组且路径以 M 开头', () => {
    for (const [ch, entry] of Object.entries(data.chars)) {
      expect(Array.isArray(entry.strokes), `字 ${ch} strokes 非数组`).toBe(true);
      expect(entry.strokes.length, `字 ${ch} 笔画数为 0`).toBeGreaterThan(0);
      for (const p of entry.strokes) {
        expect(typeof p).toBe('string');
        expect(p.startsWith('M'), `字 ${ch} 路径未以 M 开头`).toBe(true);
      }
      expect(Array.isArray(entry.medians), `字 ${ch} medians 非数组`).toBe(true);
      expect(entry.medians.length).toBe(entry.strokes.length);
    }
  });

  it('抽查笔画数：火4 必5 方4 里7 女3 绿11 门3 飞3 马3 鸟5', () => {
    const expectCount: Record<string, number> = {
      火: 4,
      必: 5,
      方: 4,
      里: 7,
      女: 3,
      绿: 11,
      门: 3,
      飞: 3,
      马: 3,
      鸟: 5,
    };
    for (const [ch, n] of Object.entries(expectCount)) {
      expect(data.chars[ch], `缺字 ${ch}`).toBeTruthy();
      expect(data.chars[ch].strokes.length, `字 ${ch} 笔画数`).toBe(n);
    }
  });

  it('medians 每笔至少一个中间点（用于描边动画）', () => {
    for (const entry of Object.values(data.chars)) {
      for (const m of entry.medians) {
        expect(Array.isArray(m) && m.length > 0).toBe(true);
      }
    }
  });
});

describe('字信息字典 charinfo.ts', () => {
  it('格式为 字 -> [部首, 结构]，结构取值合法', () => {
    // 通过 vite 的 JSON/TS 加载不便（.ts），此处直接读源码正则抽查
    const src = readFileSync(new URL('../../src/lib/charinfo.ts', import.meta.url), 'utf8');
    expect(src).toContain('export const CHAR_META');
    // 抽查几个常见字（源码使用单引号数组）
    expect(src).toMatch(/火:\s*\[\s*'[^']+',\s*'(left_right|top_bottom|single|enclosure)'\s*\]/);
    expect(src).toMatch(/春:\s*\[\s*'[^']+',\s*'(left_right|top_bottom|single|enclosure)'\s*\]/);
  });
});
