// A tiny fake Wikipedia for tests: three pages and one redirect. No network.

import type { LinkSource } from "./race.ts";
import { PageNotFoundError } from "./wikipedia.ts";

const pages: Record<string, string[]> = {
  Guinness: ["Republic of Ireland", "Stout"],
  "Republic of Ireland": ["Einstein", "Guinness"],
  "Albert Einstein": ["Physics"],
};
const redirects: Record<string, string> = { Einstein: "Albert Einstein" };

export const fakeLinks: LinkSource = async (title) => {
  const canonical = redirects[title] ?? title;
  const links = pages[canonical];
  if (!links) throw new PageNotFoundError(`Wikipedia has no page called "${title}"`);
  return { title: canonical, links };
};
