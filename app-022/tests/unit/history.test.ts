import { describe, expect, it } from 'vitest';
import {
  HISTORY_LIMIT,
  diffLayout,
  fmtChars,
  initHistory,
  pushHistory,
  snapshotAt,
  snapshotOf,
} from '../../src/lib/history';
import { defaultLayout } from '../../src/lib/layout';
import type { Worksheet } from '../../src/types';

const makeWs = (over: Partial<Worksheet> = {}): Worksheet => ({
  id: 'w1',
  title: '测试字帖',
  chars: ['甲', '乙', '丙'],
  layout: { ...defaultLayout, mix: { ...defaultLayout.mix }, show: { ...defaultLayout.show } },
  pages: 0,
  updatedAt: 0,
  ...over,
});

describe('历史栈：入栈与定位', () => {
  it('每步记录改了哪项、哪个字、改前改后', () => {
    const ws = makeWs();
    let h = initHistory(ws);
    const after = snapshotOf({ ...ws, chars: ['甲', '丙'] });
    h = pushHistory(h, { label: '删除字', char: '乙', before: '甲 乙 丙', after: '甲 丙' }, after, 1000);
    expect(h.entries).toHaveLength(1);
    expect(h.entries[0]).toMatchObject({ label: '删除字', char: '乙', before: '甲 乙 丙', after: '甲 丙' });
    expect(h.index).toBe(1);
  });

  it('可连续撤回到任意一步，也能重做回去', () => {
    const ws = makeWs();
    let h = initHistory(ws);
    h = pushHistory(h, { label: '标题', before: '测试字帖', after: 'A' }, snapshotOf({ ...ws, title: 'A' }), 1000);
    h = pushHistory(
      h,
      { label: '格线类型', before: '田字格', after: '米字格' },
      snapshotOf({ ...ws, title: 'A', layout: { ...defaultLayout, grid: 'mi' } }),
      2000,
    );
    expect(h.index).toBe(2);
    // 撤到底 → 初始状态；撤一步 → 第 1 步之后；到顶 → 最新
    expect(snapshotAt(h, 0).title).toBe('测试字帖');
    expect(snapshotAt(h, 1).title).toBe('A');
    expect(snapshotAt(h, 2).title).toBe('A');
    expect(snapshotAt(h, 2).layout.grid).toBe('mi');
    // 越界位置被夹紧
    expect(snapshotAt(h, -5).title).toBe('测试字帖');
    expect(snapshotAt(h, 99).layout.grid).toBe('mi');
  });

  it('撤销到中段再编辑：丢弃重做分支', () => {
    const ws = makeWs();
    let h = initHistory(ws);
    for (let i = 1; i <= 3; i++) {
      h = pushHistory(h, { label: `项${i}`, before: '', after: '' }, snapshotOf({ ...ws, title: `t${i}` }), i * 1000);
    }
    h = { ...h, index: 1 }; // 撤回到第 1 步
    h = pushHistory(h, { label: '新改动', before: '', after: '' }, snapshotOf({ ...ws, title: 'new' }), 99000);
    expect(h.entries.map((e) => e.label)).toEqual(['项1', '新改动']);
    expect(h.index).toBe(2);
    expect(snapshotAt(h, 2).title).toBe('new');
  });
});

describe('历史栈：连续微调合并', () => {
  it('连续型改动（同项连续触发）合并为一步，改前值保留最初', () => {
    const ws = makeWs();
    let h = initHistory(ws);
    h = pushHistory(h, { label: '标题', before: '测试字帖', after: '测', coalesce: true }, snapshotOf({ ...ws, title: '测' }), 1000);
    h = pushHistory(h, { label: '标题', before: '测', after: '测试', coalesce: true }, snapshotOf({ ...ws, title: '测试' }), 2000);
    expect(h.entries).toHaveLength(1);
    expect(h.entries[0].before).toBe('测试字帖');
    expect(h.entries[0].after).toBe('测试');
    expect(snapshotAt(h, 1).title).toBe('测试');
    // 间隔再久，只要中间没有其它改动，仍合并（敲标题/拖滑杆不被拆成多步）
    h = pushHistory(h, { label: '标题', before: '测试', after: '测试2', coalesce: true }, snapshotOf({ ...ws, title: '测试2' }), 999999);
    expect(h.entries).toHaveLength(1);
    expect(h.entries[0].after).toBe('测试2');
  });

  it('非连续型（下拉/勾选/换字）不合并；中间夹了别的改动也不合并', () => {
    const ws = makeWs();
    let h = initHistory(ws);
    h = pushHistory(h, { label: '格线类型', before: '田字格', after: '米字格' }, snapshotOf(ws), 1000);
    h = pushHistory(h, { label: '格线类型', before: '米字格', after: '方格' }, snapshotOf(ws), 1001);
    expect(h.entries).toHaveLength(2); // 下拉框离散改动不合并
    h = pushHistory(h, { label: '拼音', char: '行', before: 'xíng', after: 'háng' }, snapshotOf(ws), 1002);
    h = pushHistory(h, { label: '拼音', char: '乐', before: 'lè', after: 'yuè' }, snapshotOf(ws), 1003);
    expect(h.entries).toHaveLength(4); // 同项不同字不合并
    h = pushHistory(h, { label: '标题', before: 'a', after: 'ab', coalesce: true }, snapshotOf(ws), 1004);
    h = pushHistory(h, { label: '描红格', before: '2 格', after: '3 格', coalesce: true }, snapshotOf(ws), 1005);
    h = pushHistory(h, { label: '标题', before: 'ab', after: 'abc', coalesce: true }, snapshotOf(ws), 1006);
    expect(h.entries).toHaveLength(7); // 标题改动中间夹了描红格 → 不并入上一条标题
  });

  it('撤销中段后的连续改动不会并入旧分支', () => {
    const ws = makeWs();
    let h = initHistory(ws);
    h = pushHistory(h, { label: '标题', before: '', after: 'a', coalesce: true }, snapshotOf({ ...ws, title: 'a' }), 1000);
    h = { ...h, index: 0 }; // 撤回到栈底
    h = pushHistory(h, { label: '标题', before: '', after: 'b', coalesce: true }, snapshotOf({ ...ws, title: 'b' }), 2000);
    expect(h.entries).toHaveLength(1);
    expect(h.entries[0].after).toBe('b');
  });
});

describe('历史栈：50 步上限', () => {
  it('栈满丢弃最早的一步，栈底推进到被丢弃那步之后', () => {
    const ws = makeWs();
    let h = initHistory(ws);
    for (let i = 1; i <= HISTORY_LIMIT + 1; i++) {
      h = pushHistory(
        h,
        { label: `项${i}`, before: `${i - 1}`, after: `${i}` },
        snapshotOf({ ...ws, title: `t${i}` }),
        i * 1000,
      );
    }
    expect(h.entries).toHaveLength(HISTORY_LIMIT);
    expect(h.entries[0].label).toBe('项2'); // 最早的「项1」已丢弃
    expect(h.truncated).toBe(true);
    // 撤到底只能回到「项1 之后」的状态，无法回到最初
    expect(snapshotAt(h, 0).title).toBe('t1');
    expect(snapshotAt(h, HISTORY_LIMIT).title).toBe(`t${HISTORY_LIMIT + 1}`);
    // 继续入栈继续丢最早
    h = pushHistory(h, { label: '项52', before: '', after: '' }, snapshotOf({ ...ws, title: 't52' }), 99000);
    expect(h.entries).toHaveLength(HISTORY_LIMIT);
    expect(h.entries[0].label).toBe('项3');
    expect(snapshotAt(h, 0).title).toBe('t2');
  });
});

describe('diffLayout 逐项对比', () => {
  it('格线 / 内容组合 / 信息显示各有可读改动项', () => {
    const next = {
      ...defaultLayout,
      grid: 'mi' as const,
      mix: { ...defaultLayout.mix, trace: 4 },
      show: { ...defaultLayout.show, pinyin: false },
    };
    expect(diffLayout(defaultLayout, next)).toEqual([
      { label: '格线类型', before: '田字格', after: '米字格' },
      { label: '描红格', before: '2 格', after: '4 格' },
      { label: '显示拼音', before: '开', after: '关' },
    ]);
  });

  it('无改动返回空数组；四线格与描红颜色也有标签', () => {
    expect(diffLayout(defaultLayout, defaultLayout)).toEqual([]);
    const next = { ...defaultLayout, grid: 'line' as const, fourLine: true, traceColor: '#b3b3b3' };
    const changes = diffLayout(defaultLayout, next);
    expect(changes).toContainEqual({ label: '拼音四线格', before: '关', after: '开' });
    expect(changes).toContainEqual({ label: '描红颜色', before: '中', after: '深' });
  });
});

describe('快照与展示辅助', () => {
  it('snapshotOf 深拷贝可变子对象', () => {
    const ws = makeWs();
    const snap = snapshotOf(ws);
    ws.layout.mix.trace = 9;
    ws.layout.show.pinyin = false;
    ws.chars.push('丁');
    ws.pinyinChoice = { 行: 1 };
    expect(snap.layout.mix.trace).toBe(defaultLayout.mix.trace);
    expect(snap.layout.show.pinyin).toBe(true);
    expect(snap.chars).toEqual(['甲', '乙', '丙']);
    expect(snap.pinyinChoice).toBeUndefined();
  });

  it('fmtChars 连接与截断', () => {
    expect(fmtChars(['甲', '乙', '丙'])).toBe('甲 乙 丙');
    expect(fmtChars([])).toBe('（空）');
    expect(fmtChars(Array.from({ length: 20 }, (_, i) => `字${i}`))).toContain('…');
  });
});
