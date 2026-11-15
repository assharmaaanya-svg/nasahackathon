import type { VerdictId } from "../types";

interface Props {
  verdict: VerdictId;
  size?: number;
}

export function VerdictMark({ verdict, size = 18 }: Props) {
  const tone = verdict === "detected_rising" || verdict === "detected_falling" ? "var(--signal)" : "var(--quiet)";
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true" style={{ flex: "none" }}>
      {verdict === "detected_rising" && (
        <>
          <path d="M9 2 L15.5 12 H2.5 Z" fill={tone} />
          <path d="M2 15.5 H16" stroke={tone} strokeWidth="1.5" />
        </>
      )}
      {verdict === "detected_falling" && (
        <>
          <path d="M2 2.5 H16" stroke={tone} strokeWidth="1.5" />
          <path d="M9 16 L15.5 6 H2.5 Z" fill={tone} />
        </>
      )}
      {verdict === "suggestive" && (
        <>
          <circle cx="9" cy="9" r="6.5" fill="none" stroke={tone} strokeWidth="1.5" />
          <path d="M9 2.5 A6.5 6.5 0 0 1 9 15.5 Z" fill={tone} />
        </>
      )}
      {verdict === "not_detectable_yet" && (
        <circle cx="9" cy="9" r="6.5" fill="none" stroke={tone} strokeWidth="1.5" strokeDasharray="2.6 2.5" />
      )}
      {verdict === "not_enough_data" && (
        <>
          <rect x="2.75" y="2.75" width="12.5" height="12.5" fill="none" stroke={tone} strokeWidth="1.5" />
          <path d="M3 15 L15 3" stroke={tone} strokeWidth="1.5" />
        </>
      )}
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="wordmark">
      <svg width="46" height="26" viewBox="0 0 46 26" aria-hidden="true">
        <defs>
          <linearGradient id="mark-horizon" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#7cc4dc" />
            <stop offset="0.55" stopColor="#f4f5f0" />
            <stop offset="0.8" stopColor="#f5a742" />
            <stop offset="1" stopColor="#f5a742" stopOpacity="0.35" />
          </linearGradient>
          <linearGradient id="mark-orbit" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#7cc4dc" stopOpacity="0.25" />
            <stop offset="1" stopColor="#bfe3ec" />
          </linearGradient>
        </defs>
        <path d="M2 24 Q23 11 44 24" fill="none" stroke="url(#mark-horizon)" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M3 22 C8 10 19 3.6 29.5 3.4" fill="none" stroke="url(#mark-orbit)" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M34.6 4.2 C38 5.2 41 7.4 43 10" fill="none" stroke="#f5a742" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="32" cy="3.7" r="2.5" fill="#f5a742" />
        <path d="M15 14.4l0.4 1.8M19 12.8l0.3 1.9M23 10.6v3.8M27 12.8l-0.3 1.9M31 14.4l-0.4 1.8" stroke="#ccd6da" strokeWidth="0.9" strokeLinecap="round" />
      </svg>
      The Long Watch
    </span>
  );
}
