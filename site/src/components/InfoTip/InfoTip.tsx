// A small "i" that explains a number. The explanation shows on hover, and on
// focus, so a tap on a phone or a Tab from the keyboard opens it too. Screen
// readers get it as the button's description.

import { useId, type ReactNode } from "react";
import styles from "./InfoTip.module.scss";

export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <span className={styles.tip}>
      <button type="button" className={styles.button} aria-label={label} aria-describedby={id}>
        i
      </button>
      <span role="tooltip" id={id} className={styles.bubble}>
        {children}
      </span>
    </span>
  );
}
