import type { Worksheet } from '../types';

const LS_KEY = 'app022:worksheets';

export function listWorksheets(): Worksheet[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '[]') as Worksheet[];
  } catch {
    return [];
  }
}

export function getWorksheet(id: string): Worksheet | undefined {
  return listWorksheets().find((w) => w.id === id);
}

export function saveWorksheet(w: Worksheet): void {
  const all = listWorksheets().filter((x) => x.id !== w.id);
  all.unshift(w);
  localStorage.setItem(LS_KEY, JSON.stringify(all));
}

export function deleteWorksheet(id: string): void {
  localStorage.setItem(LS_KEY, JSON.stringify(listWorksheets().filter((x) => x.id !== id)));
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `w-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
