import styles from "./Path.module.scss";

/**
 * A race path: pages joined by arrows, the first and last highlighted. Each
 * arrow belongs to the page after it, so a long path wraps with its arrows.
 */
export function Path({ pages, label }: { pages: readonly string[]; label: string }) {
  return (
    <ol className={styles.path} aria-label={label}>
      {pages.map((page, index) => (
        <li key={page}>
          <span className={index === 0 || index === pages.length - 1 ? styles.end : styles.page}>{page}</span>
        </li>
      ))}
    </ol>
  );
}
