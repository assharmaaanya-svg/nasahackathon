import { useLayoutEffect, useRef, useState } from "react";

export function useWidth<T extends HTMLElement>(initial = 960): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(initial);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => setWidth(Math.max(Math.floor(node.clientWidth), 280));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}
