// Stepping through a run one turn at a time, at the reader's pace. Next plays
// a turn the way the model worked: its reasoning streams in a few words at a
// time, then the turn acts, then it waits. Pressing Next mid-thought finishes
// the turn at once. Previous steps back; Restart goes back to turn 1.

import { useEffect, useState } from "react";
import type { Step } from "./model.ts";
import { wordsOf } from "./model.ts";

const TICK_MS = 40;
// About 250 characters a second, roughly 60 tokens: a little slower than a
// fast model, so it can be read as it arrives.
const CHARS_PER_TICK = 10;
// No turn's thinking takes longer than this to stream: long ones speed up.
const MAX_THINKING_MS = 10_000;
// Between the thinking and the turn acting.
const BEAT_MS = 300;

/** A turn being thought through: which, and how many characters of it are written. */
export type Thinking = { count: number; chars: number };

export type Stepper = {
  /** Turns shown done: 1 to the run's length (0 only for a run with no turns). */
  shown: number;
  thinking: Thinking | null;
  first: number;
  last: number;
  next: () => void;
  previous: () => void;
  restart: () => void;
  end: () => void;
};

export function useStepper(steps: Step[]): Stepper {
  const last = steps.length;
  // A run opens on turn 1; only a run that crashed before any reply has none.
  const first = Math.min(1, last);
  const [shown, setShown] = useState(first);
  const [thinking, setThinking] = useState<Thinking | null>(null);

  // Stream the thought a few words at a time, then let the turn act.
  useEffect(() => {
    if (thinking === null) {
      return;
    }
    const words = wordsOf(steps[thinking.count - 1]!.turn);
    if (thinking.chars < words.length) {
      const perTick = Math.max(CHARS_PER_TICK, Math.ceil(words.length / (MAX_THINKING_MS / TICK_MS)));
      const timer = setTimeout(
        () => setThinking({ count: thinking.count, chars: nextWordEnd(words, thinking.chars + perTick) }),
        TICK_MS,
      );
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => {
      setShown(thinking.count);
      setThinking(null);
    }, BEAT_MS);
    return () => clearTimeout(timer);
  }, [thinking, steps]);

  const settle = (count: number) => {
    setThinking(null);
    setShown(count);
  };

  return {
    shown,
    thinking,
    first,
    last,
    next: () => {
      if (thinking !== null) {
        settle(thinking.count);
      } else if (shown < last) {
        const words = wordsOf(steps[shown]!.turn);
        setThinking({ count: shown + 1, chars: matchMedia("(prefers-reduced-motion: reduce)").matches ? words.length : 0 });
      }
    },
    // Mid-thought, the turn on screen is the one before the thought: stay there.
    previous: () => settle(thinking === null ? Math.max(first, shown - 1) : shown),
    restart: () => settle(first),
    end: () => settle(last),
  };
}

/** The end of the word at or after `index`, so text streams a word at a time. */
function nextWordEnd(words: string, index: number): number {
  if (index >= words.length) {
    return words.length;
  }
  const space = words.indexOf(" ", index);
  return space === -1 ? words.length : space;
}
