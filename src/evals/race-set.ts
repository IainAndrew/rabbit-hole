// The fixed set of races evals run on, and the checks that keep it honest.

import { DISTANCE_LIMITS, shortestPath } from "./distance.ts";
import { PageNotFoundError } from "../wikipedia/wikipedia.ts";
import { hasWon, hops, move, normalizeTitle, startRace, type LinkSource } from "../race/race.ts";

/**
 * How hard a race is, from two facts about the map (see `tierFor`): how far
 * the target is, and how many pages link to it.
 * - `easy`: 2 hops.
 * - `medium`: 3 hops, to a target many pages link to.
 * - `hard`: 4 hops, or 3 hops to a target few pages link to, so few routes
 *   lead in and one has to be planned.
 */
export type Difficulty = "easy" | "medium" | "hard";

/** Fewer backlinks than this makes a target rare: few ways in. */
export const RARE_TARGET = 100;

/**
 * Backlinks worth counting. Past this many, a target is a hub that most
 * routes run into, and the exact number doesn't matter.
 */
export const BACKLINKS_COUNTED = 1000;

/** The evidence for a race's difficulty, measured on live Wikipedia by measure-races. */
export type Measurement = {
  /** The fewest hops from start to target. */
  distance: number;
  /**
   * Articles that link to the target, directly or through a redirect: how
   * findable it is. Counted up to BACKLINKS_COUNTED, which means "that many
   * or more".
   */
  targetBacklinks: number;
  /** The day it was measured (YYYY-MM-DD): Wikipedia keeps changing. */
  measuredOn: string;
};

/** The parts of a race written by hand. */
export type RaceDraft = {
  /** Stable name for reports, e.g. "pizza-united-states". */
  id: string;
  /** Canonical title, so traces and reports name the page one way. */
  start: string;
  /** Canonical title. */
  target: string;
  /**
   * A path known to win: the start, then each move as you'd type it. Proof
   * the race can be won, and an upper bound on the fewest hops.
   */
  knownPath: string[];
};

/** One race in the set: the hand-written parts plus what measure-races wrote. */
export type RaceSpec = RaceDraft & { difficulty: Difficulty; measured: Measurement };

/** The tier a measurement puts a race in. */
export function tierFor(measured: Measurement): Difficulty {
  if (measured.distance <= 2) {
    return "easy";
  }
  if (measured.distance === 3 && measured.targetBacklinks >= RARE_TARGET) {
    return "medium";
  }
  return "hard";
}

/**
 * Check the hand-written parts of each race. Anything else is ignored, so
 * measure-races can read races that haven't been measured yet.
 *
 * @param value The parsed JSON of races.json.
 * @throws On the first malformed race, or a repeated id.
 */
export function parseRaceDrafts(value: unknown): RaceDraft[] {
  if (!Array.isArray(value)) {
    throw new Error("The race set must be a JSON array");
  }
  const seen = new Set<string>();
  return value.map((raw: unknown, index) => {
    const bad = (why: string) => new Error(`Race ${index + 1}: ${why}`);
    if (!isRecord(raw)) {
      throw bad("not an object");
    }
    const { id, start, target, knownPath } = raw;
    if (typeof id !== "string" || id === "") {
      throw bad('needs an "id"');
    }
    if (seen.has(id)) {
      throw bad(`repeats the id "${id}"`);
    }
    seen.add(id);
    if (typeof start !== "string" || typeof target !== "string") {
      throw bad('"start" and "target" must be strings');
    }
    if (!Array.isArray(knownPath) || !knownPath.every((step) => typeof step === "string")) {
      throw bad('"knownPath" must be an array of titles');
    }
    return { id, start, target, knownPath };
  });
}

/**
 * Check the whole race file, measurements included, before anything trusts it.
 *
 * @param value The parsed JSON of races.json.
 * @throws On the first malformed race, a repeated id, or a race not yet measured.
 */
export function parseRaceSet(value: unknown): RaceSpec[] {
  const drafts = parseRaceDrafts(value);
  const raws = value as unknown[];
  return drafts.map((draft, index) => {
    const bad = (why: string) => new Error(`Race ${index + 1} ("${draft.id}"): ${why}`);
    const { difficulty, measured } = raws[index] as Record<string, unknown>;
    if (difficulty !== "easy" && difficulty !== "medium" && difficulty !== "hard") {
      throw bad('"difficulty" must be easy, medium or hard: run measure-races');
    }
    if (
      !isRecord(measured) ||
      typeof measured.distance !== "number" ||
      typeof measured.targetBacklinks !== "number" ||
      typeof measured.measuredOn !== "string"
    ) {
      throw bad('"measured" is missing or malformed: run measure-races');
    }
    const { distance, targetBacklinks, measuredOn } = measured;
    return { ...draft, difficulty, measured: { distance, targetBacklinks, measuredOn } };
  });
}

/** Where measureRace gets its facts: live Wikipedia, or fakes in tests. */
export type GraphSource = {
  neighbours: (title: string) => Promise<Set<string>>;
  backlinks: (
    title: string,
    enough: (found: Set<string>) => boolean,
  ) => Promise<{ pages: Set<string>; complete: boolean }>;
};

/**
 * Measure a race: the fewest hops from start to target, and how many pages
 * link to the target.
 *
 * @param today The date to record, YYYY-MM-DD.
 * @returns The measurement and the tier it puts the race in, or why the race
 *   can't be used.
 */
export async function measureRace(
  draft: RaceDraft,
  graph: GraphSource,
  today: string,
): Promise<{ ok: true; measured: Measurement; difficulty: Difficulty } | { ok: false; problem: string }> {
  const backlinks = await graph.backlinks(draft.target, (found) => found.size >= BACKLINKS_COUNTED);
  const found = await shortestPath(draft.start, draft.target, graph, DISTANCE_LIMITS, () => {});
  if (found.hops === null) {
    return { ok: false, problem: `no path of ${found.searchedHops} hops or fewer: too far to be a fair race` };
  }
  if (!found.exact) {
    return { ok: false, problem: "a hub's backlinks were cut off, so a shorter path may exist: can't tell its tier" };
  }
  if (found.hops === 1) {
    return { ok: false, problem: "the start links the target directly: a 1-hop race measures nothing" };
  }
  const measured = {
    distance: found.hops,
    targetBacklinks: Math.min(backlinks.pages.size, BACKLINKS_COUNTED),
    measuredOn: today,
  };
  return { ok: true, measured, difficulty: tierFor(measured) };
}

/**
 * Check a race against the pages, using the race's own rules: both pages
 * exist under the titles given, the start doesn't link the target directly,
 * the difficulty matches the measurement, and the known path wins in the
 * measured distance.
 *
 * @returns What's wrong with the race; empty if nothing.
 * @throws Only for failures that aren't the race's fault, such as the network.
 */
export async function checkRace(spec: RaceSpec, getLinks: LinkSource): Promise<string[]> {
  const problems: string[] = [];
  for (const title of [spec.start, spec.target]) {
    try {
      const page = await getLinks(title);
      if (page.title !== title) {
        problems.push(`"${title}" is not canonical: it resolves to "${page.title}"`);
      }
    } catch (error) {
      if (!(error instanceof PageNotFoundError)) {
        throw error;
      }
      problems.push(error.message);
    }
  }
  if (problems.length > 0) {
    return problems;
  }

  if (tierFor(spec.measured) !== spec.difficulty) {
    problems.push(`marked ${spec.difficulty}, but its measurement says ${tierFor(spec.measured)}`);
  }

  const startLinks = await getLinks(spec.start);
  if (startLinks.links.some((link) => normalizeTitle(link) === spec.target)) {
    problems.push("the start links the target directly: a 1-hop race measures nothing");
  }

  const [first, ...moves] = spec.knownPath;
  if (first !== spec.start) {
    return [...problems, "the known path must begin with the start"];
  }
  let race = await startRace(spec.start, spec.target, getLinks);
  for (const step of moves) {
    let result;
    try {
      result = await move(race, step, getLinks);
    } catch (error) {
      // A red link: on the page, but there's no page behind it.
      if (!(error instanceof PageNotFoundError)) {
        throw error;
      }
      return [...problems, `known path: can't move to "${step}": ${error.message}`];
    }
    if (!result.ok) {
      const why = result.reason === "race_over" ? "the race was already won" : "it isn't a link there";
      return [...problems, `known path: can't move to "${step}": ${why}`];
    }
    race = result.race;
  }
  if (!hasWon(race)) {
    return [...problems, "the known path doesn't reach the target"];
  }

  // The distance was measured live and the path walked on the snapshot: if
  // they disagree, a page has changed between them.
  if (hops(race) !== spec.measured.distance) {
    problems.push(`the known path takes ${hops(race)} hops, but the race was measured at ${spec.measured.distance}`);
  }
  return problems;
}

/** True for any non-null object, so its fields can be read and checked. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
