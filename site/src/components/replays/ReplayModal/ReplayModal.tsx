// A replay over the page, in the browser's own modal dialog: it keeps focus
// inside, closes on Escape, and leaves the page behind it where it was.

import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import styles from "./ReplayModal.module.scss";

export function ReplayModal({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (element === null) {
      return;
    }
    element.showModal();
    // Escape closes the dialog itself; tell the owner so its state follows.
    // The close event arrives a moment later, so one from an earlier close
    // can land after the dialog was opened again: ignore it then.
    const onDialogClose = () => {
      if (!element.open) {
        onClose();
      }
    };
    element.addEventListener("close", onDialogClose);
    return () => {
      element.removeEventListener("close", onDialogClose);
      element.close();
    };
  }, [onClose]);

  // A click on the backdrop lands on the dialog element itself, outside its panel.
  const onClick = (event: MouseEvent) => {
    if (event.target === dialog.current) {
      onClose();
    }
  };

  return (
    <dialog ref={dialog} className={styles.dialog} aria-label="Replay" onClick={onClick}>
      <div className={styles.panel}>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close the replay">
          ✕
        </button>
        {children}
      </div>
    </dialog>
  );
}
