import { useCallback, useEffect, useRef, useState } from "react";

const TOTAL_MS = 9000;
const MIN_MS_PER_FRAME = 160;
const MAX_MS_PER_FRAME = 480;

export interface Replay {
  position: number;
  playing: boolean;
  atEnd: boolean;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (position: number) => void;
  step: (delta: number) => void;
}

export function usePrefersReducedMotion(): boolean {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setReduced(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

export function useReplay(frameCount: number, reducedMotion: boolean, onComplete: () => void): Replay {
  const last = Math.max(frameCount - 1, 0);
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const positionRef = useRef(0);
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;

  const commit = useCallback(
    (next: number) => {
      const clamped = Math.min(Math.max(next, 0), last);
      positionRef.current = clamped;
      setPosition(clamped);
    },
    [last],
  );

  useEffect(() => {
    if (!playing) return;
    const msPerFrame = Math.min(Math.max(TOTAL_MS / Math.max(last, 1), MIN_MS_PER_FRAME), MAX_MS_PER_FRAME);
    let handle = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const next = positionRef.current + (now - previous) / msPerFrame;
      previous = now;
      if (next >= last) {
        commit(last);
        setPlaying(false);
        completeRef.current();
        return;
      }
      commit(next);
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [playing, last, commit]);

  const play = useCallback(() => {
    if (reducedMotion) {
      commit(last);
      completeRef.current();
      return;
    }
    if (positionRef.current >= last) commit(0);
    setPlaying(true);
  }, [reducedMotion, last, commit]);

  const pause = useCallback(() => {
    setPlaying(false);
    commit(Math.round(positionRef.current));
  }, [commit]);

  const toggle = useCallback(() => {
    if (playing) pause();
    else play();
  }, [playing, pause, play]);

  const seek = useCallback(
    (next: number) => {
      setPlaying(false);
      commit(next);
    },
    [commit],
  );

  const step = useCallback(
    (delta: number) => {
      setPlaying(false);
      commit(Math.round(positionRef.current) + delta);
    },
    [commit],
  );

  return { position, playing, atEnd: position >= last, play, pause, toggle, seek, step };
}
