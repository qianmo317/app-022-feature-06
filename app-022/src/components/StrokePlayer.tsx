/**
 * 笔顺播放器：requestAnimationFrame 逐笔描边动画。
 * 已完成笔画灰色，当前笔画用 dashoffset 从 0 长度逐渐画出。
 * 支持播放/暂停/重置/上一笔/下一笔、点击步骤圆点跳转、Space/←/→ 键盘控制。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSX, KeyboardEvent } from 'react';
import { getStrokes } from '../lib/data';
import { glyphTransform } from './paint';
import { isCjk } from '../lib/input';

export const SPEED_PRESETS = [
  { label: '慢', ms: 600 },
  { label: '常', ms: 400 },
  { label: '快', ms: 250 },
] as const;

type Props = {
  char: string;
  /** 显示尺寸（mm），默认 40 */
  sizeMm?: number;
  autoPlay?: boolean;
  /** 每笔时长 ms */
  speed?: number;
  /** 迷你模式隐藏文字按钮，只保留图标 */
  compact?: boolean;
};

export function StrokePlayer({ char, sizeMm = 40, autoPlay = false, speed = 400, compact = false }: Props): JSX.Element {
  const strokes = getStrokes(char);
  const total = strokes?.length ?? 0;
  const [done, setDone] = useState(0); // 已完成笔画数（当前笔 = done，0 基索引）
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 当前笔 0..1
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const rafRef = useRef(0);
  const startRef = useRef(0);

  // 切字时重置
  useEffect(() => {
    setDone(0);
    setProgress(0);
    setPlaying(autoPlay && total > 0);
  }, [char, autoPlay, total]);

  // rAF 动画循环
  useEffect(() => {
    if (!playing) return;
    startRef.current = performance.now() - progress * speed;
    const tick = (now: number) => {
      const p = (now - startRef.current) / speed;
      if (p >= 1) {
        if (done + 1 >= total) {
          setDone(total);
          setProgress(1);
          setPlaying(false);
          return;
        }
        setDone(done + 1);
        setProgress(0);
        startRef.current = now;
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      setProgress(p);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, done, speed, total]);

  const reset = useCallback(() => {
    setPlaying(false);
    setDone(0);
    setProgress(0);
  }, []);

  const prev = useCallback(() => {
    setPlaying(false);
    setProgress(0);
    setDone((d) => Math.max(0, d - 1));
  }, []);

  const next = useCallback(() => {
    setPlaying(false);
    setProgress(0);
    setDone((d) => Math.min(total, d + 1));
  }, [total]);

  const toggle = useCallback(() => {
    if (total === 0) return;
    if (!playing && done >= total) {
      setDone(0);
      setProgress(0);
      setPlaying(true);
      return;
    }
    setPlaying((p) => !p);
  }, [playing, done, total]);

  // 键盘：Space 播放/暂停，← 上一笔，→ 下一笔
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === ' ') {
      e.preventDefault();
      toggle();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prev();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      next();
    }
  };

  if (!strokes) {
    return (
      <div className="player player-empty" data-testid="player-no-data">
        {isCjk(char) ? `「${char}」无笔顺数据` : `「${char}」不是汉字`}
      </div>
    );
  }

  const curLen = pathRefs.current[done]?.getTotalLength() ?? 0;

  return (
    <div className="player" data-testid="stroke-player" tabIndex={0} onKeyDown={onKeyDown}>
      <svg
        className="player-svg"
        width={`${sizeMm}mm`}
        height={`${sizeMm}mm`}
        viewBox="0 0 100 100"
        role="img"
        aria-label={`${char} 笔顺演示`}
      >
        <rect x={1} y={1} width={98} height={98} fill="#fff" stroke="#d0d4d8" strokeWidth={1.5} rx={3} />
        <g transform={glyphTransform(50, 50)}>
          {strokes.map((s, i) => {
            if (i > done) return null; // 未写到的笔不显示
            if (i === done && playing) {
              return (
                <path
                  key={s.order}
                  ref={(el) => {
                    pathRefs.current[i] = el;
                  }}
                  d={s.path}
                  fill="none"
                  stroke="#222"
                  strokeWidth={58}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={curLen}
                  strokeDashoffset={curLen * (1 - progress)}
                />
              );
            }
            // 已完成（或暂停时的当前笔）：灰色整笔；暂停在当前笔时显示深色提示
            return (
              <path
                key={s.order}
                ref={(el) => {
                  pathRefs.current[i] = el;
                }}
                d={s.path}
                fill="none"
                stroke={i === done ? '#222' : '#bfbfbf'}
                strokeWidth={i === done ? 58 : 52}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}
        </g>
      </svg>
      <div className="player-status" data-testid="player-step">
        第 {Math.min(done + 1, total)} / {total} 笔
      </div>
      <div className="player-dots" data-testid="player-dots">
        {strokes.map((s, i) => (
          <button
            key={s.order}
            className={`dot ${i < done ? 'done' : ''} ${i === done ? 'current' : ''}`}
            data-testid="stroke-dot"
            aria-label={`第 ${i + 1} 笔`}
            onClick={() => {
              setPlaying(false);
              setProgress(0);
              setDone(i);
            }}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <div className="player-controls">
        <button onClick={toggle} data-testid="player-toggle" aria-label={playing ? '暂停' : '播放'}>
          {playing ? '⏸' : '▶'}
        </button>
        <button onClick={prev} data-testid="player-prev" aria-label="上一笔">
          ◀
        </button>
        <button onClick={next} data-testid="player-next" aria-label="下一笔">
          ▶|
        </button>
        <button onClick={reset} data-testid="player-reset" aria-label="重置">
          ⟲
        </button>
        {!compact && <span className="char-label">{char}</span>}
      </div>
      {!compact && <div className="player-hint">空格 播放/暂停 · ←→ 逐笔</div>}
    </div>
  );
}
