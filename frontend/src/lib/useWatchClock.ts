import { useCallback, useEffect, useRef, useState } from "react";

const FULL_SWEEP_MS = 12500;
const HOLD_MS = 1500;

export interface WatchClock {
  time: number;
  playing: boolean;
  holding: boolean;
  finished: boolean;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (time: number) => void;
  restart: () => void;
  untouched: () => boolean;
}

export function useWatchClock(start: number, end: number, holds: number[], reducedMotion: boolean, initial: number): WatchClock {
  const [time, setTime] = useState(initial);
  const [playing, setPlaying] = useState(false);
  const [holding, setHolding] = useState(false);
  const timeRef = useRef(initial);
  const holdsRef = useRef(holds);
  holdsRef.current = holds;

  const commit = useCallback(
    (next: number) => {
      const clamped = Math.min(Math.max(next, start), end);
      timeRef.current = clamped;
      setTime(clamped);
    },
    [start, end],
  );

  useEffect(() => {
    if (!playing) return;
    const yearsPerMs = (end - start) / FULL_SWEEP_MS;
    let handle = 0;
    let previous = performance.now();
    let holdUntil = 0;
    const tick = (now: number) => {
      const elapsed = Math.min(now - previous, 400);
      previous = now;
      if (now < holdUntil) {
        handle = requestAnimationFrame(tick);
        return;
      }
      if (holdUntil !== 0) {
        holdUntil = 0;
        setHolding(false);
      }
      const from = timeRef.current;
      let next = from + elapsed * yearsPerMs;
      const stop = holdsRef.current.find((h) => from < h && next >= h);
      if (stop !== undefined) {
        next = stop;
        holdUntil = now + HOLD_MS;
        setHolding(true);
      }
      if (next >= end) {
        commit(end);
        setPlaying(false);
        setHolding(false);
        return;
      }
      commit(next);
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [playing, start, end, commit]);

  const play = useCallback(() => {
    if (reducedMotion) {
      commit(end);
      return;
    }
    if (timeRef.current >= end) commit(start);
    setPlaying(true);
  }, [reducedMotion, start, end, commit]);

  const pause = useCallback(() => {
    setPlaying(false);
    setHolding(false);
    commit(Math.max(Math.round(timeRef.current), start + 1));
  }, [commit, start]);

  const toggle = useCallback(() => {
    if (playing) pause();
    else play();
  }, [playing, pause, play]);

  const seek = useCallback(
    (next: number) => {
      setPlaying(false);
      setHolding(false);
      commit(next);
    },
    [commit],
  );

  const restart = useCallback(() => {
    if (reducedMotion) {
      commit(end);
      return;
    }
    commit(start);
    setHolding(false);
    setPlaying(true);
  }, [reducedMotion, start, end, commit]);

  const untouched = useCallback(() => timeRef.current === initial, [initial]);

  return { time, playing, holding, finished: time >= end, play, pause, toggle, seek, restart, untouched };
}
