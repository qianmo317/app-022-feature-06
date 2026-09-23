import { useState } from 'react';
import type { JSX } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { parseInput } from '../lib/input';
import { strokeCountOf } from '../lib/data';
import { deleteWorksheet, listWorksheets, newId, saveWorksheet } from '../lib/storage';
import { defaultLayout } from '../lib/layout';
import type { Worksheet } from '../types';

/** 首页：输入生字 → 生成字帖；展示最近字帖列表 */
export default function Home(): JSX.Element {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [sortByStrokes, setSortByStrokes] = useState(false);
  const [error, setError] = useState('');
  const [recent, setRecent] = useState<Worksheet[]>(() => listWorksheets());

  const preview = parseInput(text, { sortByStrokes, strokeCountOf });

  const create = () => {
    const chars = preview;
    if (chars.length === 0) {
      setError('请至少输入一个汉字、字母或数字');
      return;
    }
    setError('');
    const ws: Worksheet = {
      id: newId(),
      title: `${chars.slice(0, 4).join('')}字帖`,
      chars,
      layout: defaultLayout,
      pages: 0,
      updatedAt: Date.now(),
      sortByStrokes,
    };
    saveWorksheet(ws);
    navigate(`/worksheet/${ws.id}`);
  };

  const remove = (id: string) => {
    deleteWorksheet(id);
    setRecent(listWorksheets());
  };

  return (
    <div className="home">
      <header className="home-header">
        <h1>田字格字帖与笔顺生成</h1>
        <nav>
          <Link className="btn" to="/library" data-testid="to-library">模板库</Link>
        </nav>
      </header>

      <section className="home-create card">
        <h2>新建字帖</h2>
        <textarea
          data-testid="input-chars"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError('');
          }}
          placeholder="输入或粘贴生字，如：春天 花朵 小鸟"
          rows={4}
        />
        <p className="hint">
          自动去除重复字（保留首次出现顺序）；支持汉字、字母与数字；没有笔顺数据的汉字会明确标注，不会伪造笔画。
        </p>
        <div className="field-row">
          <label>
            <input
              type="checkbox"
              data-testid="sort-strokes"
              checked={sortByStrokes}
              onChange={(e) => setSortByStrokes(e.target.checked)}
            />{' '}
            按笔画数排序
          </label>
          <span className="hint" data-testid="home-count">已识别 {preview.length} 个字</span>
        </div>
        {error && <p className="error" data-testid="home-error">{error}</p>}
        <button className="btn primary" data-testid="create" onClick={create}>生成字帖</button>
      </section>

      <section className="home-recent">
        <h2>最近字帖</h2>
        {recent.length === 0 ? (
          <p className="hint">还没有字帖，先在上面新建，或去模板库看看。</p>
        ) : (
          <ul className="recent-list">
            {recent.map((w) => (
              <li key={w.id} className="card recent-item">
                <div>
                  <strong>{w.title}</strong>
                  <span className="hint">
                    {w.chars.length} 字 · {w.pages || '?'} 页 · {new Date(w.updatedAt).toLocaleString('zh-CN')}
                  </span>
                  <div className="recent-chars">
                    {w.chars.slice(0, 20).join(' ')}
                    {w.chars.length > 20 ? '…' : ''}
                  </div>
                </div>
                <div className="recent-actions">
                  <Link className="btn" to={`/worksheet/${w.id}`} data-testid="open">打开</Link>
                  <Link className="btn ghost" to={`/play/${w.id}`}>笔顺</Link>
                  <button className="btn danger" onClick={() => remove(w.id)}>删除</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
