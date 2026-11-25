import { BASE, REPO } from "../../data.ts";
import styles from "./Header.module.scss";

const SECTIONS = [
  ["leaderboard", "Leaderboard"],
  ["context", "Context"],
  ["replays", "Replays"],
  ["story", "The story"],
  ["method", "Method"],
] as const;

/** The sticky header: the name, and links to each section of the results page. */
export function Header() {
  return (
    <header className={styles.header}>
      <a className={styles.brand} href={BASE}>
        <img src={`${BASE}logo.webp`} alt="" width="36" height="37" />
        <span>Rabbit Hole</span>
      </a>
      <nav className={styles.nav} aria-label="Sections">
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`${BASE}#${id}`}>
            {label}
          </a>
        ))}
        <a href={REPO}>Code</a>
      </nav>
    </header>
  );
}
