import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, JSX } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import type { Layout, Worksheet } from '../types';
import {
  GRID_LABELS,
  STRUCTURE_LABELS,
  TRACE_PRESETS,
  clampLayout,
  maxLines,
  maxPerLine,
  paginate,
} from '../lib/layout';
import { parseInput } from '../lib/input';
import { readingsOf } from '../lib/pinyin';
import { charMetaOf, dataStats, importStrokes, strokeCountOf } from '../lib/data';
import { saveWorksheet } from '../lib/storage';
import { PageView } from '../components/PageView';
import { StrokePlayer } from '../components/StrokePlayer';
import { exportPng, exportSvg } from '../lib/exportImage';
import {
  HISTORY_LIMIT,
  canRedo,
  canUndo,
  emptyHistory,
  jumpHistory,
  pushHistory,
  redoHistory,
  undoHistory,
} from '../lib/history';
import type { HistoryState } from '../lib/history';
import { isFormTarget, useWorksheetDoc } from '../hooks';

const PAGE_W_PX = 210 * (96 / 25.4); // 793.7

function NumField({
  label,
  value,
  min,
  max,
  onChange,
  testid,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  testid?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        data-testid={testid}
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) onChange(n);
        }}
      />
    </label>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  onChange,
  testid,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  testid?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <span className="range-wrap">
        <input type="range" data-testid={testid} value={value} min={min} max={max} onChange={(e) => onChange(Number(e.target.value))} />
        <b>{value}</b>
      </span>
    </label>
  );
}

/** 编辑器：三栏（设置 | 预览 | 单字面板），自动保存，Ctrl+P 打印，←→ 切换选中字 */
export default function Editor(): JSX.Element {
  const { id } = useParams();
  const navigate = useNavigate();
  const { ws, setWs, notFound } = useWorksheetDoc(id);
  const [text, setText] = useState('');
  const [selected, setSelected] = useState('');
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const [fitScale, setFitScale] = useState(0.7);
  const [importMsg, setImportMsg] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [dataVer, setDataVer] = useState(0);
  const [exportPage, setExportPage] = useState(0);
  const previewRef = useRef<HTMLDivElement>(null);
  // 编辑历史：ref 持有栈本体（避免键盘回调闭包过期），histVer 仅用于触发重渲染
  const histRef = useRef<HistoryState>(emptyHistory());
  const histIdRef = useRef(0);
  const [, setHistVer] = useState(0);
  const [histOpen, setHistOpen] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(0);

  const showToast = (msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 4000);
  };

  // 会话边界：清空历史栈并提示（栈只活在内存里，不落盘）
  const clearHistory = (reason: string) => {
    histRef.current = emptyHistory();
    setHistVer((v) => v + 1);
    showToast(reason);
  };

  // 切到另一份字帖 → 清空历史（重新生成内容会换 id / 重新挂载，同样从零开始）
  const prevIdRef = useRef(id);
  useEffect(() => {
    if (prevIdRef.current !== id) {
      prevIdRef.current = id;
      clearHistory('已切换到另一份字帖，编辑历史已清空');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // 进入编辑器时初始化输入框与选中字
  useEffect(() => {
    if (ws) {
      setText(ws.chars.join(' '));
      setSelected(ws.chars[0] ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws?.id]);

  // 预览「适应」缩放
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const calc = () => {
      const w = el.clientWidth - 48;
      setFitScale(Math.max(0.2, Math.min(2, w / PAGE_W_PX)));
    };
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);

  // 自动保存（防抖），并记录页数
  useEffect(() => {
    if (!ws) return;
    const t = setTimeout(() => {
      saveWorksheet({ ...ws, pages: paginate(ws.chars, ws.layout, strokeCountOf).length, updatedAt: Date.now() });
    }, 250);
    return () => clearTimeout(t);
  }, [ws]);

  // 选中字失效时回退到第一个字
  useEffect(() => {
    if (ws && ws.chars.length > 0 && !ws.chars.includes(selected)) setSelected(ws.chars[0]);
  }, [ws, selected]);

  // 页码选择器越界回退
  const pageCount = useMemo(() => (ws ? paginate(ws.chars, ws.layout, strokeCountOf).length : 0), [ws]);
  useEffect(() => {
    setExportPage((p) => Math.min(p, Math.max(0, pageCount - 1)));
  }, [pageCount]);

  // 全局键盘：Ctrl/Cmd+P → 打印视图；Ctrl/Cmd+Z 撤销、Ctrl/Cmd+Shift+Z 或 Ctrl+Y 重做；←→ 切换选中字
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        navigate(`/worksheet/${id}/print?autoprint=1`);
        return;
      }
      // 撤销/重做在编辑器内全局生效（含输入框：受控组件下浏览器原生撤销本就不一致）
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 'z') {
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
          return;
        }
        if (k === 'y') {
          e.preventDefault();
          redo();
          return;
        }
      }
      if (isFormTarget(e) || !ws || ws.chars.length === 0) return;
      // 播放器聚焦时 ←→ 由播放器自行处理（逐笔），避免双重响应
      if ((e.target as HTMLElement | null)?.closest?.('.player')) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const i = ws.chars.indexOf(selected);
        const d = e.key === 'ArrowLeft' ? -1 : 1;
        const ni = i < 0 ? 0 : (i + d + ws.chars.length) % ws.chars.length;
        setSelected(ws.chars[ni]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ws, selected, id, navigate]);

  if (notFound) return <Navigate to="/" replace />;
  if (!ws) return <div className="app-state">加载中…</div>;

  const layout = ws.layout;
  const clamped = clampLayout(layout);
  const char = selected;
  const readings = char ? readingsOf(char) : [];
  const meta = char ? charMetaOf(char) : undefined;
  const strokeCount = char ? strokeCountOf(char) : undefined;
  const stats = dataStats();
  const scale = zoom === 'fit' ? fitScale : zoom;
  const hist = histRef.current;

  /** 记录一步编辑：进入历史栈（哪一项 / 哪个字 / 改前改后），并应用新状态 */
  const commit = (
    edit: { label: string; target?: string; beforeText: string; afterText: string; mergeKey?: string },
    next: Worksheet,
  ) => {
    histRef.current = pushHistory(histRef.current, {
      id: ++histIdRef.current,
      ...edit,
      before: ws,
      after: next,
      time: Date.now(),
    });
    setHistVer((v) => v + 1);
    setWs(next);
  };

  /** 撤销/重做/跳转后恢复快照，并同步原文输入框 */
  const applySnapshot = (snap: Worksheet) => {
    setWs(snap);
    setText(snap.chars.join(' '));
  };

  const undo = () => {
    const r = undoHistory(histRef.current);
    if (!r) return;
    histRef.current = r.state;
    setHistVer((v) => v + 1);
    applySnapshot(r.snapshot);
  };

  const redo = () => {
    const r = redoHistory(histRef.current);
    if (!r) return;
    histRef.current = r.state;
    setHistVer((v) => v + 1);
    applySnapshot(r.snapshot);
  };

  /** 跳到任意一步（-1 = 所有修改之前） */
  const jumpTo = (index: number) => {
    const r = jumpHistory(histRef.current, index);
    if (!r) return;
    histRef.current = r.state;
    setHistVer((v) => v + 1);
    applySnapshot(r.snapshot);
  };

  const updateLayout = (patch: Partial<Layout>, label: string, beforeText: string, afterText: string, mergeKey?: string) =>
    commit({ label, beforeText, afterText, mergeKey }, { ...ws, layout: clampLayout({ ...ws.layout, ...patch }) });

  const onTextChange = (v: string) => {
    setText(v);
    const chars = parseInput(v, { sortByStrokes: ws.sortByStrokes, strokeCountOf });
    // 被过滤掉的字符（标点等）不改变内容，不进历史
    if (chars.join() === ws.chars.join()) return;
    commit(
      { label: '内容文字', beforeText: `${ws.chars.length} 字`, afterText: `${chars.length} 字`, mergeKey: 'text' },
      { ...ws, chars },
    );
  };

  const onSortToggle = (v: boolean) => {
    const chars = parseInput(text, { sortByStrokes: v, strokeCountOf });
    commit(
      { label: '按笔画数排序', beforeText: ws.sortByStrokes ? '开' : '关', afterText: v ? '开' : '关' },
      { ...ws, sortByStrokes: v, chars },
    );
  };

  const setPinyinChoice = (ch: string, idx: number) =>
    commit(
      {
        label: '拼音读音',
        target: ch,
        beforeText: readingsOf(ch)[ws.pinyinChoice?.[ch] ?? 0] ?? '—',
        afterText: readingsOf(ch)[idx] ?? '—',
      },
      { ...ws, pinyinChoice: { ...ws.pinyinChoice, [ch]: idx } },
    );

  const doReplace = () => {
    const to = [...replaceText][0];
    if (!to || to === char) return;
    const idx = ws.chars.indexOf(char);
    if (idx < 0) return;
    const arr = [...ws.chars];
    arr[idx] = to;
    const chars: string[] = [];
    const seen = new Set<string>();
    for (const c of arr) {
      if (!seen.has(c)) {
        seen.add(c);
        chars.push(c);
      }
    }
    commit({ label: '替换字', target: char, beforeText: char, afterText: to }, { ...ws, chars });
    setText(chars.join(' '));
    setSelected(to);
    setReplaceText('');
  };

  const doDelete = () => {
    const chars = ws.chars.filter((c) => c !== char);
    commit(
      { label: '删除字', target: char, beforeText: `${char}（共 ${ws.chars.length} 字）`, afterText: `已删除（余 ${chars.length} 字）` },
      { ...ws, chars },
    );
    setText(chars.join(' '));
  };

  /** 导出存到本机 → 清空历史并提示 */
  const doExport = (kind: 'svg' | 'png') => {
    if (kind === 'svg') exportSvg(ws, exportPage);
    else exportPng(ws, exportPage);
    clearHistory('字帖已导出存到本机，编辑历史已清空');
  };

  const onImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const json: unknown = JSON.parse(await f.text());
      const n = importStrokes(json, selected);
      setDataVer((v) => v + 1);
      setImportMsg(`已导入 ${n} 条笔顺数据`);
    } catch (err) {
      setImportMsg(`导入失败：${err instanceof Error ? err.message : String(err)}`);
    }
    e.target.value = '';
  };

  return (
    <div className="editor">
      <header className="editor-bar">
        <Link to="/" className="btn ghost">← 首页</Link>
        <input
          className="title-input"
          data-testid="title-input"
          value={ws.title}
          onChange={(e) =>
            commit(
              { label: '标题', beforeText: ws.title, afterText: e.target.value, mergeKey: 'title' },
              { ...ws, title: e.target.value },
            )
          }
        />
        <div className="history-controls">
          <button className="btn" data-testid="undo" disabled={!canUndo(hist)} onClick={undo} title="撤销（Ctrl/Cmd+Z）">↩ 撤销</button>
          <button className="btn" data-testid="redo" disabled={!canRedo(hist)} onClick={redo} title="重做（Ctrl/Cmd+Shift+Z）">↪ 重做</button>
          <button
            className={`btn ${histOpen ? 'active' : ''}`}
            data-testid="history-toggle"
            onClick={() => setHistOpen((o) => !o)}
          >
            历史 {hist.entries.length}
          </button>
        </div>
        {histOpen && (
          <div className="history-panel" data-testid="history-panel">
            <div className="history-head">
              <strong>编辑历史</strong>
              <span className="hint">最多 {HISTORY_LIMIT} 步，满后丢弃最早一步</span>
            </div>
            {hist.entries.length === 0 ? (
              <p className="hint" data-testid="history-empty">还没有可撤销的修改</p>
            ) : (
              <ul className="history-list">
                <li
                  data-testid="history-base"
                  className={hist.cursor === -1 ? 'current' : ''}
                  onClick={() => jumpTo(-1)}
                  title="回到所有修改之前"
                >
                  <span className="history-label">初始状态</span>
                </li>
                {hist.entries.map((e, i) => (
                  <li
                    key={e.id}
                    data-testid="history-item"
                    className={i === hist.cursor ? 'current' : i > hist.cursor ? 'undone' : ''}
                    onClick={() => jumpTo(i)}
                    title={`改之前：${e.beforeText}\n改之后：${e.afterText}`}
                  >
                    <span className="history-label">
                      {i + 1}. {e.label}
                      {e.target ? ` · ${e.target}` : ''}
                    </span>
                    <span className="history-diff">{e.beforeText} → {e.afterText}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="bar-actions">
          <Link className="btn" data-testid="print-link" to={`/worksheet/${id}/print?autoprint=1`}>打印</Link>
          <select data-testid="export-page" value={exportPage} onChange={(e) => setExportPage(Number(e.target.value))}>
            {Array.from({ length: pageCount }, (_, i) => (
              <option key={i} value={i}>第 {i + 1} 页</option>
            ))}
          </select>
          <button className="btn" data-testid="export-svg" onClick={() => doExport('svg')}>导出 SVG</button>
          <button className="btn" data-testid="export-png" onClick={() => doExport('png')}>导出 PNG</button>
        </div>
      </header>
      {toast && <div className="toast" data-testid="history-toast" role="status">{toast}</div>}

      <div className="editor-grid">
        {/* 左栏：设置 */}
        <aside className="panel">
          <h3>原文输入</h3>
          <textarea
            data-testid="editor-chars"
            value={text}
            rows={4}
            onChange={(e) => onTextChange(e.target.value)}
          />
          <p className="hint">自动去重（保留首次出现顺序），支持汉字/字母/数字。</p>
          <label className="field">
            <span>按笔画数排序</span>
            <input
              type="checkbox"
              data-testid="sort-strokes"
              checked={Boolean(ws.sortByStrokes)}
              onChange={(e) => onSortToggle(e.target.checked)}
            />
          </label>

          <h3>格线与尺寸</h3>
          <label className="field">
            <span>格线类型</span>
            <select
              data-testid="grid-select"
              value={layout.grid}
              onChange={(e) => {
                const v = e.target.value as Layout['grid'];
                updateLayout({ grid: v }, '版式 · 格线类型', GRID_LABELS[layout.grid], GRID_LABELS[v]);
              }}
            >
              {Object.entries(GRID_LABELS).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </label>
          {layout.grid === 'line' && (
            <label className="field">
              <span>拼音四线格</span>
              <input
                type="checkbox"
                data-testid="four-line"
                checked={Boolean(layout.fourLine)}
                onChange={(e) =>
                  updateLayout(
                    { fourLine: e.target.checked },
                    '版式 · 拼音四线格',
                    layout.fourLine ? '开' : '关',
                    e.target.checked ? '开' : '关',
                  )
                }
              />
            </label>
          )}
          <RangeField label="格宽 mm" value={layout.cellMm} min={12} max={35} testid="cell-mm" onChange={(n) => updateLayout({ cellMm: n }, '版式 · 格宽', `${layout.cellMm}mm`, `${n}mm`, 'cellMm')} />
          <p className="hint">每行最多 {maxPerLine(clamped.cellMm)} 格</p>
          <NumField label="每行格数" value={layout.perLine} min={1} max={maxPerLine(clamped.cellMm)} testid="per-line" onChange={(n) => updateLayout({ perLine: n }, '版式 · 每行格数', `${layout.perLine} 格`, `${n} 格`, 'perLine')} />
          <NumField label="每页行数" value={layout.lines} min={1} max={maxLines(clamped.cellMm, clamped.lineGapMm)} testid="lines" onChange={(n) => updateLayout({ lines: n }, '版式 · 每页行数', `${layout.lines} 行`, `${n} 行`, 'lines')} />
          <RangeField label="行距 mm" value={layout.lineGapMm} min={0} max={12} testid="line-gap" onChange={(n) => updateLayout({ lineGapMm: n }, '版式 · 行距', `${layout.lineGapMm}mm`, `${n}mm`, 'lineGap')} />

          <h3>内容组合</h3>
          <label className="field">
            <span>例字</span>
            <input
              type="checkbox"
              data-testid="mix-model"
              checked={layout.mix.model > 0}
              onChange={(e) =>
                updateLayout(
                  { mix: { ...layout.mix, model: e.target.checked ? 1 : 0 } },
                  '内容组合 · 例字',
                  layout.mix.model > 0 ? '显示' : '隐藏',
                  e.target.checked ? '显示' : '隐藏',
                )
              }
            />
          </label>
          <RangeField label="笔顺分解" value={layout.mix.strokeSteps} min={0} max={8} testid="mix-steps" onChange={(n) => updateLayout({ mix: { ...layout.mix, strokeSteps: n } }, '内容组合 · 笔顺分解', `${layout.mix.strokeSteps} 格`, `${n} 格`, 'mix-steps')} />
          <RangeField label="描红格" value={layout.mix.trace} min={0} max={8} testid="mix-trace" onChange={(n) => updateLayout({ mix: { ...layout.mix, trace: n } }, '内容组合 · 描红格', `${layout.mix.trace} 格`, `${n} 格`, 'mix-trace')} />
          <RangeField label="空格" value={layout.mix.blank} min={0} max={8} testid="mix-blank" onChange={(n) => updateLayout({ mix: { ...layout.mix, blank: n } }, '内容组合 · 空格', `${layout.mix.blank} 格`, `${n} 格`, 'mix-blank')} />

          <h3>描红颜色</h3>
          <div className="checks">
            {TRACE_PRESETS.map((t) => (
              <label key={t.value}>
                <input
                  type="radio"
                  name="trace-color"
                  data-testid="trace-color"
                  checked={layout.traceColor === t.value}
                  onChange={() =>
                    updateLayout(
                      { traceColor: t.value },
                      '描红颜色',
                      TRACE_PRESETS.find((p) => p.value === layout.traceColor)?.label ?? layout.traceColor,
                      t.label,
                    )
                  }
                />
                {t.label}
              </label>
            ))}
          </div>

          <h3>信息显示</h3>
          <div className="checks">
            {(
              [
                ['pinyin', '拼音'],
                ['radical', '部首'],
                ['strokeCount', '笔画数'],
                ['structure', '结构'],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  data-testid={`show-${key}`}
                  checked={layout.show[key]}
                  onChange={(e) =>
                    updateLayout(
                      { show: { ...layout.show, [key]: e.target.checked } },
                      `信息显示 · ${label}`,
                      layout.show[key] ? '显示' : '隐藏',
                      e.target.checked ? '显示' : '隐藏',
                    )
                  }
                />
                {label}
              </label>
            ))}
          </div>

          <h3>笔顺数据</h3>
          <p className="hint" data-testid="data-stats">
            内置 {stats.bundled} 字 · 自定义 {stats.custom} 字
          </p>
        </aside>

        {/* 中栏：预览 */}
        <main className="preview-col">
          <div className="zoom-bar">
            <button className={`btn ${zoom === 'fit' ? 'active' : ''}`} data-testid="zoom-fit" onClick={() => setZoom('fit')}>适应</button>
            <button className={`btn ${zoom === 1 ? 'active' : ''}`} data-testid="zoom-100" onClick={() => setZoom(1)}>100%</button>
            <button className="btn" data-testid="zoom-out" onClick={() => setZoom(Math.max(0.2, (typeof zoom === 'number' ? zoom : fitScale) - 0.1))}>−</button>
            <button className="btn" data-testid="zoom-in" onClick={() => setZoom(Math.min(2, (typeof zoom === 'number' ? zoom : fitScale) + 0.1))}>＋</button>
            <span className="hint" data-testid="char-count">{ws.chars.length} 字 · {pageCount} 页</span>
            <label className="file-btn">
              导入笔顺数据
              <input type="file" accept=".json,application/json" data-testid="import-strokes" onChange={onImportFile} />
            </label>
            {importMsg && <span className="hint" data-testid="import-msg">{importMsg}</span>}
          </div>
          <div className="preview-scroll" ref={previewRef} data-testid="preview">
            <div className="preview-inner" style={{ transform: `scale(${scale})` }} key={`v${dataVer}`}>
              <PageView worksheet={ws} selectedChar={selected} onSelectChar={setSelected} />
            </div>
          </div>
        </main>

        {/* 右栏：单字面板 */}
        <aside className="panel" data-testid="char-panel">
          {char ? (
            <>
              <h3>选中字：{char}</h3>
              <StrokePlayer key={char} char={char} sizeMm={40} autoPlay />
              {readings.length > 0 ? (
                <div className="field-group">
                  <span>拼音{readings.length > 1 ? '（多音字）' : ''}</span>
                  <div className="pinyin-choices" data-testid="pinyin-choices">
                    {readings.map((r, i) => (
                      <label key={r}>
                        <input
                          type="radio"
                          name="pinyin"
                          data-testid="pinyin-choice"
                          checked={(ws.pinyinChoice?.[char] ?? 0) === i}
                          onChange={() => setPinyinChoice(char, i)}
                        />
                        {r}
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="hint">无拼音（非汉字）</p>
              )}
              <ul className="meta-list" data-testid="char-meta">
                <li>部首：{meta?.radical ?? '—'}</li>
                <li>笔画：{strokeCount ?? '—'}</li>
                <li>结构：{meta?.structure ? (STRUCTURE_LABELS[meta.structure] ?? '—') : '—'}</li>
              </ul>
              <div className="field-row">
                <input
                  type="text"
                  data-testid="replace-input"
                  placeholder="替换为…"
                  value={replaceText}
                  maxLength={4}
                  onChange={(e) => setReplaceText(e.target.value)}
                />
                <button className="btn" data-testid="replace-btn" onClick={doReplace}>替换</button>
              </div>
              <div className="field-row">
                <button className="btn danger" data-testid="delete-char" onClick={doDelete}>删除该字</button>
              </div>
            </>
          ) : (
            <p className="hint">点击预览中的格子选择字</p>
          )}
        </aside>
      </div>
    </div>
  );
}
