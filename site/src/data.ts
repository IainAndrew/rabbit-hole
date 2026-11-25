// Loading the data build-site writes into site/public/. Its shape is the
// types build-site itself uses, imported from src/site-data/, so the page and the
// build can't disagree about it.

import { useEffect, useState } from "react";
import type { SiteData } from "@harness/site-data/leaderboards.ts";

/** Where the site is served from, e.g. "/rabbit-hole/". */
export const BASE = import.meta.env.BASE_URL;

export const REPO = "https://github.com/IainAndrew/rabbit-hole";

/**
 * Fetch one of the site's data files. The files come from our own build, so
 * their shape is trusted to match the type; a missing file fails loudly.
 */
export async function loadJson<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE}${path}`);
  if (!response.ok) {
    throw new Error(`${path}: HTTP ${response.status}. Run npm run build-site first.`);
  }
  return (await response.json()) as T;
}

/** The leaderboards and races, once loaded, or the error that stopped them. */
export function useSiteData(): { data: SiteData | null; error: Error | null } {
  const [data, setData] = useState<SiteData | null>(null);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    loadJson<SiteData>("data/leaderboards.json").then(setData, setError);
  }, []);
  return { data, error };
}
