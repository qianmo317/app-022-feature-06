import { describe, expect, it } from 'vitest';
import {
  HISTORY_LIMIT,
  canRedo,
  canUndo,
  emptyHistory,
  jumpHistory,
  pushHistory,
  redoHistory,
  undoHistory,
} from '../../src/lib/history';
import type { HistoryEntry, HistoryState } from '../../src/lib/history';
import { defaultLayout } from '../../src/lib/layout';
import type { Worksheet } from '../../src/types';

const ws = (title: string): Worksheet => ({
  id: 'w1',
  title,
  chars: [],
  layout: defaultLayout,
  pages: 0,
  updatedAt: 0,
});

let seq = 0;
const entry = (before: Worksheet, after: Worksheet, mergeKey?: string, time?: number): HistoryEntry => ({
  id: ++seq,
  label: `编辑 ${seq}`,
  beforeText: before.title,
  afterText: after.title,
  before,
  after,
  time: time ?? seq * 100,
  mergeKey,
});

/** 依次推入 n 步（标题 t1..tn），返回最终栈 */
const pushN = (n: number, start = 1): HistoryState => {
  let s = emptyHistory();
  for (let i = start; i < start + n; i++) s = pushHistory(s, entry(ws(`t${i}`), ws(`t${i + 1}`)));
  return s;
};

describe('编辑历史栈', () => {
  it('推入后连续撤回到任意一步，再连续重做回去', () => {
    const s = pushN(3); // t1→t2→t3→t4
    expect(s.entries).toHaveLength(3);
    expect(s.cursor).toBe(2);

    const u1 = undoHistory(s)!;
    expect(u1.snapshot.title).toBe('t3');
    const u2 = undoHistory(u1.state)!;
    expect(u2.snapshot.title).toBe('t2');
    const u3 = undoHistory(u2.state)!;
    expect(u3.snapshot.title).toBe('t1'); // 撤到最初
    expect(canUndo(u3.state)).toBe(false);
    expect(undoHistory(u3.state)).toBeUndefined();

    const r1 = redoHistory(u3.state)!;
    expect(r1.snapshot.title).toBe('t2');
    const r2 = redoHistory(r1.state)!;
    const r3 = redoHistory(r2.state)!;
    expect(r3.snapshot.title).toBe('t4');
    expect(canRedo(r3.state)).toBe(false);
    expect(redoHistory(r3.state)).toBeUndefined();
  });

  it('撤销后再编辑，丢弃重做分支', () => {
    const s = pushN(3);
    const u = undoHistory(s)!; // 撤掉第 3 步
    const s2 = pushHistory(u.state, entry(ws('t3'), ws('tX')));
    expect(s2.entries).toHaveLength(3);
    expect(s2.entries[2].afterText).toBe('tX');
    expect(canRedo(s2)).toBe(false);
  });

  it(`栈满 ${HISTORY_LIMIT} 步时丢弃最早的一步`, () => {
    const s = pushN(HISTORY_LIMIT + 5);
    expect(s.entries).toHaveLength(HISTORY_LIMIT);
    expect(s.cursor).toBe(HISTORY_LIMIT - 1);
    // 最早保留下来的应是第 6 步（前 5 步被丢弃）
    expect(s.entries[0].beforeText).toBe('t6');
    expect(s.entries[0].afterText).toBe('t7');
    // 一路撤到底，落在现存最早一步的 before
    let cur = s;
    while (canUndo(cur)) cur = undoHistory(cur)!.state;
    expect(cur.cursor).toBe(-1);
  });

  it('相同 mergeKey 且间隔很短的连续编辑合并为一步', () => {
    let s = emptyHistory();
    const t0 = 10_000;
    s = pushHistory(s, entry(ws('a'), ws('ab'), 'text', t0));
    s = pushHistory(s, entry(ws('ab'), ws('abc'), 'text', t0 + 300));
    expect(s.entries).toHaveLength(1);
    expect(s.entries[0].beforeText).toBe('a'); // 保留最早的 before
    expect(s.entries[0].afterText).toBe('abc'); // after 更新到最新
    // 撤销合并后的一步直接回到 a
    expect(undoHistory(s)!.snapshot.title).toBe('a');
  });

  it('mergeKey 不同或超出时间窗则不合并', () => {
    let s = emptyHistory();
    const t0 = 10_000;
    s = pushHistory(s, entry(ws('a'), ws('ab'), 'text', t0));
    s = pushHistory(s, entry(ws('ab'), ws('abc'), 'title', t0 + 100)); // key 不同
    s = pushHistory(s, entry(ws('abc'), ws('abcd'), 'text', t0 + 5000)); // 超出时间窗
    expect(s.entries).toHaveLength(3);
  });

  it('跳到任意一步：-1 回到初始，i 落在该步之后', () => {
    const s = pushN(4); // t1→…→t5
    const j2 = jumpHistory(s, 1)!;
    expect(j2.snapshot.title).toBe('t3');
    expect(j2.state.cursor).toBe(1);
    const j0 = jumpHistory(s, -1)!;
    expect(j0.snapshot.title).toBe('t1');
    expect(j0.state.cursor).toBe(-1);
    expect(jumpHistory(s, 4)).toBeUndefined(); // 越界
    expect(jumpHistory(emptyHistory(), -1)).toBeUndefined(); // 空栈
  });

  it('每一步都记录改的是哪一项、改前改后', () => {
    let s = emptyHistory();
    s = pushHistory(s, { ...entry(ws('旧'), ws('新')), label: '标题', target: '春' });
    const e = s.entries[0];
    expect(e.label).toBe('标题');
    expect(e.target).toBe('春');
    expect(e.beforeText).toBe('旧');
    expect(e.afterText).toBe('新');
  });
});
