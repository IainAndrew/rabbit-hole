// A frozen copy of the Wikipedia pages races touch, kept as committed files.
// A page that isn't in the snapshot yet is fetched live once and recorded, so
// every later lookup of it reads the same links, offline.

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizeTitle, type LinkSource } from "../race/race.ts";
import { PageNotFoundError } from "./wikipedia.ts";
import { isRecord } from "../is-record.ts";

/**
 * What one snapshot file holds. There's one file per title looked up. A
 * redirect or a missing page is recorded too, so asking for "Einstein" or a
 * page that doesn't exist is also offline.
 */
type Entry =
  | { kind: "page"; title: string; links: string[]; fetchedAt: string }
  | { kind: "redirect"; from: string; to: string; fetchedAt: string }
  | { kind: "missing"; title: string; message: string; fetchedAt: string };

/**
 * A link source that reads from the snapshot and records any miss.
 *
 * @param dir The snapshot directory; created on the first write.
 * @param fetchLive Where a miss is fetched from: live Wikipedia, or a fake in tests.
 * @returns A source that gives the same answer for a title on every run.
 * @throws {PageNotFoundError} If the page doesn't exist, now or when recorded.
 */
export function snapshotLinks(dir: string, fetchLive: LinkSource): LinkSource {
  const lookup: LinkSource = async (title) => {
    const entry = await readEntry(dir, title);
    if (entry?.kind === "page") {
      return { title: entry.title, links: entry.links };
    }
    if (entry?.kind === "redirect") {
      return lookup(entry.to);
    }
    if (entry?.kind === "missing") {
      throw new PageNotFoundError(entry.message);
    }
    return record(dir, title, fetchLive);
  };
  return lookup;
}

/** Fetch a title live and write what came back: a page, a redirect, or a miss. */
async function record(dir: string, title: string, fetchLive: LinkSource) {
  const fetchedAt = new Date().toISOString();
  let live;
  try {
    live = await fetchLive(title);
  } catch (error) {
    if (error instanceof PageNotFoundError) {
      await writeEntry(dir, title, { kind: "missing", title, message: error.message, fetchedAt });
    }
    throw error;
  }

  if (normalizeTitle(live.title) !== normalizeTitle(title)) {
    await writeEntry(dir, title, { kind: "redirect", from: title, to: live.title, fetchedAt });
  }
  // If the page itself is already recorded, keep that copy: today's version
  // may have different links, and the snapshot must not drift.
  const existing = await readEntry(dir, live.title);
  if (existing?.kind === "page") {
    return { title: existing.title, links: existing.links };
  }

  await writeEntry(dir, live.title, { kind: "page", title: live.title, links: live.links, fetchedAt });
  return live;
}

/**
 * The file a title is stored in.
 *
 * "republic_of Ireland" and "Republic of Ireland" are one page to Wikipedia,
 * so they share a file. The hash keeps titles apart that differ only in case
 * or punctuation ("AIDS" and "Aids"), which macOS would treat as one file.
 */
function fileFor(dir: string, title: string): string {
  const key = normalizeTitle(title);
  const readable = key.replace(/[^A-Za-z0-9]+/g, "_").slice(0, 80);
  const hash = createHash("sha256").update(key).digest("hex").slice(0, 8);
  return join(dir, `${readable}.${hash}.json`);
}

/** The title's entry, or null if the snapshot doesn't have it yet. */
async function readEntry(dir: string, title: string): Promise<Entry | null> {
  const file = fileFor(dir, title);
  let text;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
  return parseEntry(JSON.parse(text), file);
}

/** Write a title's entry, replacing any file already there. */
async function writeEntry(dir: string, title: string, entry: Entry): Promise<void> {
  await mkdir(dir, { recursive: true });
  // Pretty-printed, one link per line, so a change to the snapshot reads as a diff.
  await writeFile(fileFor(dir, title), JSON.stringify(entry, null, 2) + "\n");
}

/**
 * Snapshot files are committed and could be hand-edited: check before trusting.
 *
 * @param file The file's path, used in the error message.
 */
function parseEntry(value: unknown, file: string): Entry {
  const bad = new Error(`Malformed snapshot file ${file}`);
  if (!isRecord(value) || typeof value.fetchedAt !== "string") {
    throw bad;
  }
  const { kind, fetchedAt } = value;

  if (kind === "page" && typeof value.title === "string" && Array.isArray(value.links)) {
    const links = value.links;
    if (!links.every((link) => typeof link === "string")) {
      throw bad;
    }
    return { kind, title: value.title, links, fetchedAt };
  }
  if (kind === "redirect" && typeof value.from === "string" && typeof value.to === "string") {
    return { kind, from: value.from, to: value.to, fetchedAt };
  }
  if (kind === "missing" && typeof value.title === "string" && typeof value.message === "string") {
    return { kind, title: value.title, message: value.message, fetchedAt };
  }
  throw bad;
}
