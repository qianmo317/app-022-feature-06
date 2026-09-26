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
import {
  HISTORY_LIMIT,
  diffLayout,
  fmtChars,
  initHistory,
  isCoalescable,
  pushHistory,
  snapshotAt,
  snapshotOf,
} from '../lib/history';
import type { HistoryState, StepDesc } from '../lib/history';
import { PageView } from '../components/PageView';
import { StrokePlayer } from '../components/StrokePlayer';
import { exportPng, exportSvg } from '../lib/exportImage';
import { isFormTarget, useWorksheetDoc } from '../hooks';

const PAGE_W_PX = 210 * (96 / 25.4); // 793.7

/**
 * 本 SPA 会话里上一份已加载字帖的 id。
 * 编辑器在路由去首页/打印页时会卸载，组件内 ref 会随之销毁；
 * 用模块级变量跨实例记忆，才能识别「从另一份字帖切过来」。
 */
let lastLoadedDocId: string | undefined;

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

/** 编辑器：三栏（设置 | 预览 | 单字面板），自动保存，Ctrl+P 打印，←→ 切换选中字，Ctrl+Z/Y 撤销重做 */
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
  const [hist, setHist] = useState<HistoryState | null>(null);
  const [histOpen, setHistOpen] = useState(false);
  // 悬停某一步时的前后对照浮层（fixed 定位，避免被历史面板的滚动区裁剪）
  const [tip, setTip] = useState<{ id: number; x: number; y: number } | null>(null);
  // 撤销/重做目标：restore 只移动历史位置，文档与输入框由 effect 统一按目标快照恢复
  const [histTarget, setHistTarget] = useState<number | null>(null);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  /** 底部提示（历史栈被清空等），4s 自动消失 */
  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 4000);
  };
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  // 进入编辑器时初始化输入框与选中字
  useEffect(() => {
    if (ws) {
      setText(ws.chars.join(' '));
      setSelected(ws.chars[0] ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws?.id]);

  // 每份字帖各自一份历史栈：文档 id 变化（含首次加载）时以当前文档重置栈；
  // 若本会话之前打开过另一份字帖（首页新建/模板库再进编辑器，组件已重新挂载），
  // 同时给出「历史已清空」提示
  const docId = ws?.id;
  useEffect(() => {
    if (!ws) return;
    if (lastLoadedDocId && lastLoadedDocId !== ws.id) {
      showToast('已切换到另一份字帖，撤销历史已清空');
    }
    lastLoadedDocId = ws.id;
    setHist(initHistory(ws));
    setHistTarget(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  const restore = (index: number) => {
    if (!hist) return;
    setHistTarget(Math.max(0, Math.min(index, hist.entries.length)));
  };
  useEffect(() => {
    if (histTarget === null || !hist || !ws) return;
    const snap = snapshotAt(hist, histTarget);
    setWs((w) => (w ? { ...w, ...snap } : w));
    setHist({ ...hist, index: histTarget });
    setText(snap.chars.join(' '));
    setSelected((sel) => (snap.chars.includes(sel) ? sel : (snap.chars[0] ?? '')));
    setHistTarget(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [histTarget]);
  const canUndo = Boolean(hist && hist.index > 0);
  const canRedo = Boolean(hist && hist.index < hist.entries.length);
  const undo = () => hist && canUndo && restore(hist.index - 1);
  const redo = () => hist && canRedo && restore(hist.index + 1);
  useEffect(() => {
    if (!histOpen) setTip(null);
  }, [histOpen]);

  // 点击预览区/页面空白处时收起历史面板（点其他控件按钮不收起，便于边操作边看栈）
  useEffect(() => {
    if (!histOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || t.closest('.hist') || t.closest('button') || t.closest('input') || t.closest('select') || t.closest('textarea') || t.closest('label')) return;
      setHistOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [histOpen]);

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

  // 全局键盘：Ctrl/Cmd+P → 打印视图；Ctrl/Cmd+Z 撤销、Ctrl/Cmd+Shift+Z 或 Ctrl/Cmd+Y 重做；←→ 切换选中字（输入控件内除外）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        navigate(`/worksheet/${id}/print?autoprint=1`);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !isFormTarget(e)) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws, selected, id, navigate, hist]);

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

  /** 记录一步编辑：更新文档 + 入历史栈（记下改前/改后与改后快照） */
  const commit = (next: Worksheet, step: StepDesc) => {
    setWs(next);
    setHist((h) => (h ? pushHistory(h, step, snapshotOf(next)) : h));
  };

  /** 版式修改：逐叶子对比；通常只有一项，联动修正（如改格宽夹紧每行格数）时合并记为一步 */
  const updateLayout = (patch: Partial<Layout>) => {
    const nextLayout = clampLayout({ ...layout, ...patch });
    const changes = diffLayout(layout, nextLayout);
    if (changes.length === 0) return;
    const next = { ...ws, layout: nextLayout };
    const step: StepDesc =
      changes.length === 1
        ? { ...changes[0], coalesce: isCoalescable(changes[0].label) }
        : {
            label: '版式调整',
            before: changes.map((c) => `${c.label} ${c.before}`).join('；'),
            after: changes.map((c) => `${c.label} ${c.after}`).join('；'),
          };
    commit(next, step);
  };

  /** 重新生成内容（改原文 / 改排序）：历史栈清空并提示 */
  const regenerate = (next: Worksheet) => {
    setWs(next);
    setHistTarget(null);
    if (hist && hist.entries.length > 0) showToast('内容已重新生成，撤销历史已清空');
    setHist(initHistory(next));
  };

  const onTextChange = (v: string, sortBy?: boolean) => {
    setText(v);
    regenerate({ ...ws, chars: parseInput(v, { sortByStrokes: sortBy ?? ws.sortByStrokes, strokeCountOf }) });
  };

  const onSortToggle = (v: boolean) => {
    regenerate({ ...ws, sortByStrokes: v, chars: parseInput(text, { sortByStrokes: v, strokeCountOf }) });
  };

  const setPinyinChoice = (ch: string, idx: number) => {
    const cur = ws.pinyinChoice?.[ch] ?? 0;
    if (cur === idx) return;
    const readings = readingsOf(ch);
    commit(
      { ...ws, pinyinChoice: { ...ws.pinyinChoice, [ch]: idx } },
      { label: '拼音', char: ch, before: readings[cur] ?? '—', after: readings[idx] ?? '—' },
    );
  };

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
    commit({ ...ws, chars }, { label: '替换字', char, before: char, after: to });
    setText(chars.join(' '));
    setSelected(to);
    setReplaceText('');
  };

  const doDelete = () => {
    const chars = ws.chars.filter((c) => c !== char);
    commit({ ...ws, chars }, { label: '删除字', char, before: fmtChars(ws.chars), after: fmtChars(chars) });
    setText(chars.join(' '));
  };

  /** 导出到本机：历史栈清空并提示 */
  const doExportSvg = () => {
    exportSvg(ws, exportPage);
    setHist(initHistory(ws));
    showToast('已导出 SVG 到本机，撤销历史已清空');
  };

  const doExportPng = () => {
    exportPng(ws, exportPage)
      .then(() => {
        setHist(initHistory(ws));
        showToast('已导出 PNG 到本机，撤销历史已清空');
      })
      .catch((err: unknown) => showToast(`PNG 导出失败：${err instanceof Error ? err.message : String(err)}`));
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
          onChange={(e) => commit({ ...ws, title: e.target.value }, { label: '标题', before: ws.title, after: e.target.value, coalesce: true })}
        />
        <div className="hist">
          <button className="btn" data-testid="undo-btn" disabled={!canUndo} onClick={undo} title="撤销（Ctrl/Cmd+Z）">↩ 撤销</button>
          <button className="btn" data-testid="redo-btn" disabled={!canRedo} onClick={redo} title="重做（Ctrl/Cmd+Y）">↪ 重做</button>
          <button
            className={`btn ${histOpen ? 'active' : ''}`}
            data-testid="history-toggle"
            onClick={() => setHistOpen((v) => !v)}
          >
            历史 {hist?.entries.length ?? 0}/{HISTORY_LIMIT}
          </button>
          {histOpen && hist && (
            <div className="hist-panel" data-testid="history-panel">
              <div className="hist-head">每步记下改前/改后，点击可跳转到该步</div>
              <ul className="hist-list">
                <li className={hist.index === 0 ? 'current' : ''}>
                  <button data-testid="history-base" onClick={() => restore(0)}>
                    <span className="hist-label">{hist.truncated ? '栈底（更早的已丢弃）' : '初始状态'}</span>
                  </button>
                  {hist.index === 0 && <span className="hist-cur">当前</span>}
                </li>
                {hist.entries.map((e, i) => (
                  <li
                    key={e.id}
                    className={`${i >= hist.index ? 'undone' : ''} ${i === hist.index - 1 ? 'current' : ''}`}
                    onMouseEnter={(ev) => setTip({ id: e.id, x: ev.currentTarget.getBoundingClientRect().right + 12, y: ev.currentTarget.getBoundingClientRect().top })}
                    onMouseLeave={() => setTip((t) => (t?.id === e.id ? null : t))}
                  >
                    <button data-testid="history-entry" onClick={() => restore(i + 1)}>
                      <span className="hist-label">{e.label}{e.char ? ` · ${e.char}` : ''}</span>
                      <span className="hist-change">{e.before} → {e.after}</span>
                      <span className="hist-time">{new Date(e.time).toLocaleTimeString('zh-CN', { hour12: false })}</span>
                    </button>
                    {i === hist.index - 1 && <span className="hist-cur">当前</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="bar-actions">
          <Link className="btn" data-testid="print-link" to={`/worksheet/${id}/print?autoprint=1`}>打印</Link>
          <select data-testid="export-page" value={exportPage} onChange={(e) => setExportPage(Number(e.target.value))}>
            {Array.from({ length: pageCount }, (_, i) => (
              <option key={i} value={i}>第 {i + 1} 页</option>
            ))}
          </select>
          <button className="btn" data-testid="export-svg" onClick={doExportSvg}>导出 SVG</button>
          <button className="btn" data-testid="export-png" onClick={doExportPng}>导出 PNG</button>
        </div>
      </header>

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
              onChange={(e) => updateLayout({ grid: e.target.value as Layout['grid'] })}
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
                onChange={(e) => updateLayout({ fourLine: e.target.checked })}
              />
            </label>
          )}
          <RangeField label="格宽 mm" value={layout.cellMm} min={12} max={35} testid="cell-mm" onChange={(n) => updateLayout({ cellMm: n })} />
          <p className="hint">每行最多 {maxPerLine(clamped.cellMm)} 格</p>
          <NumField label="每行格数" value={layout.perLine} min={1} max={maxPerLine(clamped.cellMm)} testid="per-line" onChange={(n) => updateLayout({ perLine: n })} />
          <NumField label="每页行数" value={layout.lines} min={1} max={maxLines(clamped.cellMm, clamped.lineGapMm)} testid="lines" onChange={(n) => updateLayout({ lines: n })} />
          <RangeField label="行距 mm" value={layout.lineGapMm} min={0} max={12} testid="line-gap" onChange={(n) => updateLayout({ lineGapMm: n })} />

          <h3>内容组合</h3>
          <label className="field">
            <span>例字</span>
            <input
              type="checkbox"
              data-testid="mix-model"
              checked={layout.mix.model > 0}
              onChange={(e) => updateLayout({ mix: { ...layout.mix, model: e.target.checked ? 1 : 0 } })}
            />
          </label>
          <RangeField label="笔顺分解" value={layout.mix.strokeSteps} min={0} max={8} testid="mix-steps" onChange={(n) => updateLayout({ mix: { ...layout.mix, strokeSteps: n } })} />
          <RangeField label="描红格" value={layout.mix.trace} min={0} max={8} testid="mix-trace" onChange={(n) => updateLayout({ mix: { ...layout.mix, trace: n } })} />
          <RangeField label="空格" value={layout.mix.blank} min={0} max={8} testid="mix-blank" onChange={(n) => updateLayout({ mix: { ...layout.mix, blank: n } })} />

          <h3>描红颜色</h3>
          <div className="checks">
            {TRACE_PRESETS.map((t) => (
              <label key={t.value}>
                <input
                  type="radio"
                  name="trace-color"
                  data-testid="trace-color"
                  checked={layout.traceColor === t.value}
                  onChange={() => updateLayout({ traceColor: t.value })}
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
                  onChange={(e) => updateLayout({ show: { ...layout.show, [key]: e.target.checked } })}
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

      {tip && hist && (() => {
        const e = hist.entries.find((x) => x.id === tip.id);
        if (!e) return null;
        const left = Math.min(tip.x, window.innerWidth - 268);
        const top = Math.min(tip.y, window.innerHeight - 150);
        return (
          <div className="hist-tip" data-testid="history-tip" style={{ left, top }}>
            <div className="hist-tip-title">{e.label}{e.char ? ` · ${e.char}` : ''}</div>
            <div><span>改前</span><em>{e.before}</em></div>
            <div><span>改后</span><em>{e.after}</em></div>
          </div>
        );
      })()}

      {toast && (
        <div className="toast" data-testid="toast" role="status">{toast}</div>
      )}
    </div>
  );
}
