import type { JSX } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TEMPLATES, worksheetFromTemplate } from '../lib/templates';
import { saveWorksheet } from '../lib/storage';

/** 模板库：一键套用模板创建字帖 */
export default function Library(): JSX.Element {
  const navigate = useNavigate();
  const apply = (i: number) => {
    const ws = worksheetFromTemplate(TEMPLATES[i]);
    saveWorksheet(ws);
    navigate(`/worksheet/${ws.id}`);
  };
  return (
    <div className="library">
      <header className="home-header">
        <h1>模板库</h1>
        <Link className="btn ghost" to="/">← 首页</Link>
      </header>
      <div className="template-grid">
        {TEMPLATES.map((t, i) => (
          <button key={t.id} className="card template-card" data-testid={`template-${t.id}`} onClick={() => apply(i)}>
            <strong>{t.name}</strong>
            <span className="hint">{t.desc}</span>
            <span className="template-chars">{[...t.chars].slice(0, 12).join(' ')}…</span>
          </button>
        ))}
      </div>
    </div>
  );
}
