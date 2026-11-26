import { REPO } from "../../data.ts";
import styles from "./Footer.module.scss";

export function Footer() {
  return (
    <footer className={styles.footer}>
      <p>Every number on this site is computed from the committed traces of real runs.</p>
      <p className={styles.credit}>
        Made by <a href="https://iainandrew.com">Iain Andrew</a> · <a href={REPO}>Code on GitHub</a>
      </p>
    </footer>
  );
}
