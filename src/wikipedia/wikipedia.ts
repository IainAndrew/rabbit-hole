// Client for the English Wikipedia Action API.

import { fetchWithRetry } from "../http/retry.ts";
import { isRecord } from "../is-record.ts";

const API_URL = "https://en.wikipedia.org/w/api.php";

// Wikipedia allows far more requests from clients that say who they are.
const USER_AGENT = "RabbitHole/0.1 (https://iainandrew.com) bot";

// Namespace 0 is articles. Other namespaces (Talk:, Category:, Help:) aren't
// part of the race.
const ARTICLE_NAMESPACE = 0;

/** One page's article links, as fetched from Wikipedia. */
export type LinksPage = {
  /**
   * The canonical title, after normalisation ("guinness" → "Guinness") and
   * redirects ("Einstein" → "Albert Einstein").
   */
  title: string;
  /** Titles of every article the page links to, in Wikipedia's order. */
  links: string[];
  /** How many API requests it took to collect every link. */
  requests: number;
};

/**
 * The page doesn't exist. Unlike a network failure, this is something the
 * model asked for, so callers can report it back instead of crashing.
 */
export class PageNotFoundError extends Error {
  override name = "PageNotFoundError";
}

/** One response's worth of links. */
type Batch = {
  title: string;
  links: string[];
  /** Fields to send back to get the next batch, or null on the last one. */
  continueFrom: Record<string, string> | null;
};

/**
 * Pages already fetched this run, keyed by both the requested and the
 * canonical title. Storing the promise means two lookups of the same page at
 * once share one fetch.
 */
const cache = new Map<string, Promise<LinksPage>>();

/**
 * Every article link on a page, fetched at most once per run.
 *
 * @param title Any title Wikipedia accepts, including a redirect.
 * @throws {PageNotFoundError} If the page doesn't exist or the title is invalid.
 */
export function fetchLinks(title: string): Promise<LinksPage> {
  const cached = cache.get(title);
  if (cached) {
    return cached;
  }

  const pending = fetchAllLinks(title);
  cache.set(title, pending);
  pending.then(
    (page) => cache.set(page.title, pending),
    // Don't remember failures: the next lookup should try again.
    () => cache.delete(title),
  );
  return pending;
}

/**
 * Wikipedia returns at most 500 links per request, so keep asking until it
 * stops giving a continuation token.
 */
async function fetchAllLinks(title: string): Promise<LinksPage> {
  const links: string[] = [];
  let continueFrom: Record<string, string> | null = {};
  let canonicalTitle = title;
  let requests = 0;

  while (continueFrom) {
    const batch = await fetchBatch(title, continueFrom);
    canonicalTitle = batch.title;
    links.push(...batch.links);
    continueFrom = batch.continueFrom;
    requests++;
  }

  return { title: canonicalTitle, links, requests };
}

/**
 * One API request for a page's links.
 *
 * @param continueFrom The previous batch's continuation, or `{}` for the first.
 */
async function fetchBatch(
  title: string,
  continueFrom: Record<string, string>,
): Promise<Batch> {
  const body = await query(
    {
      prop: "links",
      titles: title,
      redirects: "1",
      plnamespace: String(ARTICLE_NAMESPACE),
      pllimit: "max",
      ...continueFrom,
    },
    `"${title}"`,
  );
  return parseBatch(body, title);
}

/**
 * Send one Action API query and return its JSON, unchecked.
 *
 * @param what Names what was asked for, in error messages.
 */
async function query(params: Record<string, string>, what: string): Promise<unknown> {
  const search = new URLSearchParams({ action: "query", format: "json", formatversion: "2", ...params });
  const response = await fetchWithRetry(() =>
    fetch(`${API_URL}?${search}`, { headers: { "User-Agent": USER_AGENT } }),
  );
  if (!response.ok) {
    throw new Error(`Wikipedia returned HTTP ${response.status} for ${what}`);
  }
  return response.json();
}

/**
 * The pages a move from this page can land on: the canonical title of every
 * article it links to, with redirects followed and red links (links to pages
 * that don't exist) left out. Used to measure races, not to play them.
 */
export async function fetchNeighbours(title: string): Promise<Set<string>> {
  const neighbours = new Set<string>();
  let continueFrom: Record<string, string> | null = {};
  while (continueFrom) {
    const body = await query(
      {
        generator: "links",
        titles: title,
        redirects: "1",
        gplnamespace: String(ARTICLE_NAMESPACE),
        gpllimit: "max",
        ...continueFrom,
      },
      `the links of "${title}"`,
    );
    if (!isRecord(body)) {
      throw new Error(`Unexpected Wikipedia response for the links of "${title}"`);
    }
    // A page with no links has no "query" at all.
    const pages: unknown[] = isRecord(body.query) && Array.isArray(body.query.pages) ? body.query.pages : [];
    for (const page of pages) {
      if (!isRecord(page) || typeof page.title !== "string") {
        throw new Error(`Malformed page in the links of "${title}"`);
      }
      if (page.missing !== true && page.invalid !== true) {
        neighbours.add(page.title);
      }
    }
    continueFrom = parseContinue(body.continue);
  }
  return neighbours;
}

/** A popular page has hundreds of thousands of backlinks; stop well before. */
const MAX_BACKLINK_REQUESTS = 200;

/**
 * The pages that link to this one, directly or through one of its redirects,
 * as canonical titles. Used to measure races, not to play them.
 *
 * @param title A canonical title.
 * @param enough Called after each batch with everything found so far; return
 *   true to stop early.
 * @returns The pages found, and whether that's every one of them.
 */
export async function fetchBacklinks(
  title: string,
  enough: (found: Set<string>) => boolean,
): Promise<{ pages: Set<string>; complete: boolean }> {
  const pages = new Set<string>();
  let continueFrom: Record<string, string> | null = {};
  for (let requests = 0; continueFrom && requests < MAX_BACKLINK_REQUESTS; requests++) {
    const body = await query(
      {
        list: "backlinks",
        bltitle: title,
        blnamespace: String(ARTICLE_NAMESPACE),
        bllimit: "max",
        blredirect: "1",
        ...continueFrom,
      },
      `the backlinks of "${title}"`,
    );
    if (!isRecord(body) || !isRecord(body.query) || !Array.isArray(body.query.backlinks)) {
      throw new Error(`Unexpected Wikipedia response for the backlinks of "${title}"`);
    }
    for (const link of body.query.backlinks) {
      if (!isRecord(link) || typeof link.title !== "string") {
        throw new Error(`Malformed backlink of "${title}"`);
      }
      // A redirect isn't a page a move can stop on: count the pages that link
      // through it instead.
      if (link.redirect !== true) {
        pages.add(link.title);
      }
      const through: unknown[] = Array.isArray(link.redirlinks) ? link.redirlinks : [];
      for (const page of through) {
        if (!isRecord(page) || typeof page.title !== "string") {
          throw new Error(`Malformed backlink of "${title}"`);
        }
        pages.add(page.title);
      }
    }
    continueFrom = parseContinue(body.continue);
    if (enough(pages)) {
      break;
    }
  }
  return { pages, complete: continueFrom === null };
}

/**
 * The API's JSON is outside data: check its shape before trusting it.
 *
 * @param requested The title asked for, used in error messages.
 */
function parseBatch(body: unknown, requested: string): Batch {
  if (!isRecord(body) || !isRecord(body.query) || !Array.isArray(body.query.pages)) {
    throw new Error(`Unexpected Wikipedia response for "${requested}"`);
  }

  const page: unknown = body.query.pages[0];
  if (!isRecord(page) || typeof page.title !== "string") {
    throw new Error(`No page in Wikipedia response for "${requested}"`);
  }
  if (page.invalid === true) {
    throw new PageNotFoundError(`"${requested}" is not a valid Wikipedia title`);
  }
  if (page.missing === true) {
    throw new PageNotFoundError(`Wikipedia has no page called "${requested}"`);
  }

  // A page with no article links has no "links" field at all.
  const rawLinks: unknown[] = Array.isArray(page.links) ? page.links : [];
  const links = rawLinks.map((link) => {
    if (!isRecord(link) || typeof link.title !== "string") {
      throw new Error(`Malformed link in Wikipedia response for "${requested}"`);
    }
    return link.title;
  });

  return { title: page.title, links, continueFrom: parseContinue(body.continue) };
}

/** The continuation block is opaque: send every field back exactly as given. */
function parseContinue(value: unknown): Record<string, string> | null {
  if (value === undefined) {
    return null;
  }
  if (!isRecord(value)) {
    throw new Error("Malformed continuation in Wikipedia response");
  }
  const fields: Record<string, string> = {};
  for (const [key, field] of Object.entries(value)) {
    if (typeof field !== "string") {
      throw new Error(`Malformed continuation field "${key}" in Wikipedia response`);
    }
    fields[key] = field;
  }
  return fields;
}
