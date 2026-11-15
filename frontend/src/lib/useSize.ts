import { useLayoutEffect, useRef, useState } from "react";

export function useSize<T extends HTMLElement>(): [React.RefObject<T | null>, { width: number; height: number }] {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 1280, height: 760 });
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => setSize({ width: Math.max(node.clientWidth, 300), height: Math.max(node.clientHeight, 300) });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, size];
}
