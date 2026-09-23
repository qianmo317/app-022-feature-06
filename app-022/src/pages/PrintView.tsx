import { useEffect } from 'react';
import type { JSX } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { useWorksheetDoc } from '../hooks';
import { PageView } from '../components/PageView';

/** 打印视图：只有纸面内容，?autoprint=1 时字体就绪后自动弹出打印 */
export default function PrintView(): JSX.Element {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { ws, notFound } = useWorksheetDoc(id);

  useEffect(() => {
    if (!ws || params.get('autoprint') !== '1') return;
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (!cancelled) setTimeout(() => window.print(), 300);
    });
    return () => {
      cancelled = true;
    };
  }, [ws, params]);

  if (notFound) return <Navigate to="/" replace />;
  if (!ws) return <div className="app-state">加载中…</div>;

  return (
    <div className="print-root">
      <div className="print-toolbar no-print">
        <Link className="btn ghost" to={`/worksheet/${id}`}>← 返回编辑</Link>
        <button className="btn primary" data-testid="print-now" onClick={() => window.print()}>打印</button>
        <span className="hint">打印时请选择 A4、实际大小（关闭「缩放/适应页面」）；第 1 页含 100mm 校验尺。</span>
      </div>
      <PageView worksheet={ws} plain />
    </div>
  );
}
