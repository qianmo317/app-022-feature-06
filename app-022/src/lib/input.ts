const CJK_RE = /[\u3400-\u9fff]/;
const VALID_RE = /[\u3400-\u9fffA-Za-z0-9]/;

export type InputOptions = {
  sortByStrokes?: boolean;
  strokeCountOf?: (ch: string) => number | undefined;
};

/**
 * 解析用户输入：提取有效字符（汉字/字母/数字）→ 去重（保持首次出现顺序）→ 可选按笔画数排序。
 */
export function parseInput(text: string, opts: InputOptions = {}): string[] {
  const valid = [...text].filter((ch) => VALID_RE.test(ch));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const ch of valid) {
    if (!seen.has(ch)) {
      seen.add(ch);
      out.push(ch);
    }
  }
  if (opts.sortByStrokes && opts.strokeCountOf) {
    out.sort((a, b) => {
      const ca = opts.strokeCountOf!(a);
      const cb = opts.strokeCountOf!(b);
      return (ca ?? Infinity) - (cb ?? Infinity);
    });
  }
  return out;
}

export function isCjk(ch: string): boolean {
  return CJK_RE.test(ch);
}
