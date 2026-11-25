// How an eval's runs ended, as one stacked bar: wins first, in a vivid green,
// then one segment per way of losing, sized by how many runs ended
// that way. The bar spans all the eval's decided runs (crashes aren't
// decided), and each colour is named in the labels under it, so nothing
// rests on colour alone.
//
// The loss colours were chosen so that every pair that sits side by side in
// some bar on the site stays distinct, for colour-blind readers too, in both
// themes (checked with the dataviz palette validator). New results that put
// two other reasons next to each other would need that check again.

import type { EndReason } from "@harness/agent/agent.ts";
import styles from "./RunEndings.module.scss";

// How runs end, in the order the bar stacks them, with their colour token.
const ENDINGS: { reason: EndReason; words: string; colour: string }[] = [
  { reason: "won", words: "won", colour: "var(--end-won)" },
  { reason: "output_limit", words: "output limit", colour: "var(--end-output)" },
  { reason: "context_limit", words: "context limit", colour: "var(--end-context)" },
  { reason: "turn_limit", words: "turn limit", colour: "var(--end-turns)" },
  { reason: "gave_up", words: "gave up", colour: "var(--end-gave-up)" },
  { reason: "refused", words: "no tool call", colour: "var(--end-no-call)" },
];

export function RunEndings({ endReasons }: { endReasons: Record<EndReason, number> }) {
  const endings = ENDINGS.map((kind) => ({ ...kind, count: endReasons[kind.reason] })).filter((kind) => kind.count > 0);
  const decided = endings.reduce((sum, kind) => sum + kind.count, 0);
  if (decided === 0) {
    return <span className="hint">no decided runs</span>;
  }
  const described = endings.map((kind) => `${kind.count} ${kind.words}`).join(", ");
  return (
    <div className={styles.endings}>
      <span className={styles.bar} role="img" aria-label={`Of ${decided} runs: ${described}`}>
        {endings.map((kind) => (
          <span
            key={kind.reason}
            className={styles.segment}
            style={{ flexGrow: kind.count, background: kind.colour }}
            title={`${kind.count} ${kind.words}`}
          />
        ))}
      </span>
      <span className={styles.labels} aria-hidden="true">
        {endings.map((kind) => (
          <span key={kind.reason}>
            <i style={{ background: kind.colour }} />
            {kind.count} {kind.words}
          </span>
        ))}
      </span>
    </div>
  );
}
