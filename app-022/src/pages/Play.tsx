import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useWorksheetDoc } from '../hooks';
import { StrokePlayer, SPEED_PRESETS } from '../components/StrokePlayer';

/** 笔顺播放页：大屏逐笔演示，←→ 切换字 */
export default function Play(): JSX.Element {
  const { id } = useParams();
  const { ws, notFound } = useWorksheetDoc(id);
  const [idx, setIdx] = useState(0);
  const [speed, setSpeed] = useState(400);

  useEffect(() => {
    setIdx(0);
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!ws || ws.chars.length === 0) return;
      // 播放器获得焦点时由其自身处理 ←→（逐笔），避免双重响应
      if ((e.target as HTMLElement | null)?.closest?.('.player')) return;
      if (e.key === 'ArrowLeft') setIdx((i) => (i - 1 + ws.chars.length) % ws.chars.length);
      if (e.key === 'ArrowRight') setIdx((i) => (i + 1) % ws.chars.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ws]);

  if (notFound) return <Navigate to="/" replace />;
  if (!ws) return <div className="app-state">加载中…</div>;

  const chars = ws.chars;
  const char = chars[Math.min(idx, Math.max(0, chars.length - 1))] ?? '';

  return (
    <div className="play-page">
      <header className="play-bar">
        <Link to={`/worksheet/${id}`} className="btn ghost">← 返回编辑</Link>
        <h1>{ws.title}</h1>
        <div className="speed-btns" role="group" aria-label="播放速度">
          {SPEED_PRESETS.map((s) => (
            <button key={s.ms} className={speed === s.ms ? 'active' : ''} onClick={() => setSpeed(s.ms)}>
              {s.label}
            </button>
          ))}
        </div>
      </header>
      {chars.length === 0 ? (
        <div className="app-state">字帖还没有内容，请回到编辑器添加生字。</div>
      ) : (
        <>
          <div className="play-main">
            <button className="btn" data-testid="play-prev" onClick={() => setIdx((i) => Math.max(0, i - 1))}>
              ← 上一字
            </button>
            <StrokePlayer key={char} char={char} sizeMm={90} autoPlay speed={speed} />
            <button className="btn" data-testid="play-next" onClick={() => setIdx((i) => Math.min(chars.length - 1, i + 1))}>
              下一字 →
            </button>
          </div>
          <div className="play-chars" data-testid="play-chars">
            {chars.map((c, i) => (
              <button key={`${c}-${i}`} className={c === char ? 'active' : ''} onClick={() => setIdx(i)}>
                {c}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
