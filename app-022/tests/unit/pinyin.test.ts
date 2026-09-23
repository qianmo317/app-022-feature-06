import { describe, expect, it } from 'vitest';
import { defaultReading, readingsOf } from '../../src/lib/pinyin';

describe('拼音 readingsOf', () => {
  it('多音字 行 → xíng / háng 全部读音', () => {
    const rs = readingsOf('行');
    expect(rs).toContain('xíng');
    expect(rs).toContain('háng');
    expect(rs.length).toBeGreaterThanOrEqual(2);
    expect(defaultReading('行')).toBe(rs[0]);
  });

  it('绿 → lǜ（ü 声调符号）', () => {
    expect(readingsOf('绿')).toContain('lǜ');
  });

  it('带 ǖǘǚǜ 的读音保持扩展拉丁字符', () => {
    const all = ['绿', '女', '旅', '律'].flatMap((c) => readingsOf(c));
    expect(all.some((r) => /[ǖǘǚǜ]/.test(r) || /ü/.test(r))).toBe(true);
  });

  it('单音字 春', () => {
    expect(readingsOf('春')).toEqual(['chūn']);
  });

  it('非汉字返回空数组', () => {
    expect(readingsOf('a')).toEqual([]);
    expect(readingsOf('8')).toEqual([]);
    expect(readingsOf('，')).toEqual([]);
  });
});
