import { pinyin } from 'pinyin-pro';
import { isCjk } from './input';

const cache = new Map<string, string[]>();

/**
 * 单字全部读音（含多音字，声调符号），如 行 -> ['xíng', 'háng']。
 * 非汉字（字母/数字）返回空数组。
 */
export function readingsOf(ch: string): string[] {
  if (cache.has(ch)) return cache.get(ch)!;
  let result: string[] = [];
  if (isCjk(ch)) {
    const arr = pinyin(ch, { multiple: true, type: 'array' });
    result = [...new Set(arr)];
  }
  cache.set(ch, result);
  return result;
}

/** 默认读音（多音字取最常用读法） */
export function defaultReading(ch: string): string | undefined {
  return readingsOf(ch)[0];
}
