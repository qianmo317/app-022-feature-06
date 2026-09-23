import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { initData } from './lib/data';
import Home from './pages/Home';
import Editor from './pages/Editor';
import PrintView from './pages/PrintView';
import Library from './pages/Library';
import Play from './pages/Play';

/** 应用入口：先加载本地笔顺数据，再挂路由 */
export default function App(): JSX.Element {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    initData()
      .then(() => setReady(true))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) {
    return (
      <div className="app-state">
        笔顺数据加载失败：{error}
        <div>
          <button className="btn" onClick={() => location.reload()}>重试</button>
        </div>
      </div>
    );
  }
  if (!ready) return <div className="app-state">正在加载笔顺数据…</div>;

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/worksheet/:id" element={<Editor />} />
      <Route path="/worksheet/:id/print" element={<PrintView />} />
      <Route path="/library" element={<Library />} />
      <Route path="/play/:id" element={<Play />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
