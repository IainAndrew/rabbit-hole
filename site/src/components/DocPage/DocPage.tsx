// A long write-up from docs/, rendered to HTML by build-site and shown in the
// site's layout. The HTML is our own Markdown, built from the repo.

import { useEffect, useState } from "react";
import type { DocPage as Doc } from "@harness/site-data/docs.ts";
import { BASE, loadJson } from "../../data.ts";
import styles from "./DocPage.module.scss";

export function DocPage({ name }: { name: string }) {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    loadJson<Doc>(`docs/${name}.json`).then(setDoc, setError);
  }, [name]);
  useEffect(() => {
    if (doc !== null) {
      document.title = `${doc.title} · Rabbit Hole`;
      // The page arrived after the browser tried the address's #anchor: go there now.
      document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
    }
  }, [doc]);

  if (error !== null) {
    return (
      <main className={styles.doc}>
        <p>This page didn't load: {error.message}</p>
        <p>
          <a href={BASE}>Back to the results</a>
        </p>
      </main>
    );
  }
  return (
    <main className={styles.doc}>
      {doc !== null && <article dangerouslySetInnerHTML={{ __html: doc.html }} />}
      <p className={styles.back}>
        <a href={BASE}>← Back to the results</a>
      </p>
    </main>
  );
}
