import { useEffect, useRef, useState } from 'react';
import type { Worksheet } from './types';
import { getWorksheet } from './lib/storage';

/** 按路由 id 加载字帖文档；找不到时置 notFound。只接受当前路由 id 对应的加载结果。 */
export function useWorksheetDoc(id: string | undefined) {
  const [ws, setWs] = useState<Worksheet | undefined>(undefined);
  const [notFound, setNotFound] = useState(false);
  const loadedFor = useRef<string | undefined>(undefined);
  useEffect(() => {
    // 进入加载态；loadedFor 记录「当前文档是为哪个 id 加载的」，
    // 防止旧 id 的 effect 闭包在后续渲染中再次触发把旧文档写回
    setWs(undefined);
    setNotFound(false);
    loadedFor.current = id;
    const found = id ? getWorksheet(id) : undefined;
    if (loadedFor.current !== id) return; // 已切走，丢弃过期结果
    if (found) setWs(found);
    else setNotFound(true);
  }, [id]);
  return { ws, setWs, notFound };
}

/** 键盘事件目标是否在表单控件内（避免方向键/快捷键与输入冲突） */
export function isFormTarget(e: Event): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
}
