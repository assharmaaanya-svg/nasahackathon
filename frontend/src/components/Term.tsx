import { useId, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  note: string;
}

export function Term({ children, note }: Props) {
  const id = useId();
  return (
    <span className="term" tabIndex={0} aria-describedby={id}>
      {children}
      <span className="term-note" role="tooltip" id={id}>
        {note}
      </span>
    </span>
  );
}
