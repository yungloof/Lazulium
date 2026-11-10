import { RefObject, useLayoutEffect, useRef, useState } from 'react';

// Quantas colunas de largura mínima `minWidth` cabem no elemento (prateleiras de uma linha só)
export function useGridColumns<T extends HTMLElement>(minWidth: number, gap: number): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [columns, setColumns] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const width = el.clientWidth;
      setColumns(Math.max(1, Math.floor((width + gap) / (minWidth + gap))));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [minWidth, gap]);

  return [ref, columns];
}
