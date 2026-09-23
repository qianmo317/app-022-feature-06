import { describe, expect, it, beforeEach } from 'vitest';

// node 环境没有 localStorage，stub 一个
const store = new Map<string, string>();
type LS = { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void; removeItem: (k: string) => void; clear: () => void };
(globalThis as { localStorage?: LS }).localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k)! : null),
  setItem: (k, v) => void store.set(k, v),
  removeItem: (k) => void store.delete(k),
  clear: () => void store.clear(),
};

describe('笔顺数据导入 importStrokes', () => {
  beforeEach(() => store.clear());

  it('支持 {chars:{...}} 全量包格式', async () => {
    const { importStrokes } = await import('../../src/lib/data');
    const n = importStrokes({
      chars: {
        '㊙': undefined,
        '龘': { strokes: ['M0 0 L10 10'], medians: [[[5, 5]]] },
        '儸': { strokes: ['M0 0 L10 10', 'M10 0 L0 10'], medians: [[[5, 5]], [[5, 5]]] },
      },
    });
    expect(n).toBe(2); // 空 entry 被忽略
  });

  it('支持 {strokes}(单字) 格式并绑定当前字', async () => {
    const { importStrokes } = await import('../../src/lib/data');
    const n = importStrokes({ strokes: ['M1 1 L2 2'], medians: [[[1.5, 1.5]]] }, '罕');
    expect(n).toBe(1);
    expect(JSON.parse(store.get('app022:customStrokes')!)['罕'].strokes).toEqual(['M1 1 L2 2']);
  });

  it('非法 JSON 结构不写入', async () => {
    const { importStrokes } = await import('../../src/lib/data');
    expect(importStrokes(null)).toBe(0);
    expect(importStrokes('abc' as unknown as object)).toBe(0);
  });
});

describe('模板库', () => {
  it('5 个模板，且拼音模板使用四线格', async () => {
    const { TEMPLATES } = await import('../../src/lib/templates');
    expect(TEMPLATES.length).toBe(5);
    const py = TEMPLATES.find((t) => t.id === 'pinyin')!;
    expect(py.layoutPatch?.fourLine).toBe(true);
    expect(py.layoutPatch?.grid).toBe('line');
    const nameTpl = TEMPLATES.find((t) => t.id === 'name')!;
    expect(nameTpl.layoutPatch?.cellMm).toBe(25);
  });

  it('worksheetFromTemplate 生成唯一 id', async () => {
    const { TEMPLATES, worksheetFromTemplate } = await import('../../src/lib/templates');
    const a = worksheetFromTemplate(TEMPLATES[0]);
    const b = worksheetFromTemplate(TEMPLATES[0]);
    expect(a.id).not.toBe(b.id);
    expect(a.chars.length).toBeGreaterThan(0);
  });
});
