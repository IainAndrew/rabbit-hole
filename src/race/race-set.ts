// The fixed set of races evals run on, and the checks that keep it honest.

import { PageNotFoundError } from "../wikipedia/wikipedia.ts";
import { hasWon, hops, move, normalizeTitle, startRace, type LinkSource } from "./race.ts";

/**
 * How hard a race is, judged by how many 2-hop routes exist (see `tierFor`):
 * - `easy`: 10 or more, so most sensible first moves work.
 * - `medium`: 1 to 9, so the right first move has to be found.
 * - `hard`: none, so the shortest path is at least 3 hops.
 */
export type Difficulty = "easy" | "medium" | "hard";

/** Routes needed for a race to be easy. Counting can stop once it has this many. */
export const EASY_ROUTES = 10;

/** The evidence for a race's difficulty, measured on live Wikipedia by measure-races. */
export type Measurement = {
  /** Pages the start links to that link to the target: each is a 2-hop win. */
  twoHopRoutes: number;
  /** False when counting stopped early, so the true count may be higher. */
  complete: boolean;
  /** A few of the routes, for readers. */
  examples: string[];
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

/**
 * The tier a measurement puts a race in, or null if it can't tell: fewer than
 * EASY_ROUTES routes found, but counting stopped before the end.
 */
export function tierFor(measured: Measurement): Difficulty | null {
  if (measured.twoHopRoutes >= EASY_ROUTES) return "easy";
  if (!measured.complete) return null;
  return measured.twoHopRoutes === 0 ? "hard" : "medium";
}

/**
 * Check the hand-written parts of each race. Anything else is ignored, so
 * measure-races can read races that haven't been measured yet.
 *
 * @param value The parsed JSON of races.json.
 * @throws On the first malformed race, or a repeated id.
 */
export function parseRaceDrafts(value: unknown): RaceDraft[] {
  if (!Array.isArray(value)) throw new Error("The race set must be a JSON array");
  const seen = new Set<string>();
  return value.map((raw: unknown, index) => {
    const bad = (why: string) => new Error(`Race ${index + 1}: ${why}`);
    if (!isRecord(raw)) throw bad("not an object");
    const { id, start, target, knownPath } = raw;
    if (typeof id !== "string" || id === "") throw bad('needs an "id"');
    if (seen.has(id)) throw bad(`repeats the id "${id}"`);
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
      typeof measured.twoHopRoutes !== "number" ||
      typeof measured.complete !== "boolean" ||
      !Array.isArray(measured.examples) ||
      !measured.examples.every((example) => typeof example === "string") ||
      typeof measured.measuredOn !== "string"
    ) {
      throw bad('"measured" is missing or malformed: run measure-races');
    }
    const { twoHopRoutes, complete, examples, measuredOn } = measured;
    return { ...draft, difficulty, measured: { twoHopRoutes, complete, examples, measuredOn } };
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
 * Count a race's 2-hop routes: pages the start can move to that link to the
 * target. Counting stops once there are enough to call it easy.
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
  const neighbours = await graph.neighbours(draft.start);
  // Neighbours have redirects followed, so this also catches a link to the
  // target under another name.
  if (neighbours.has(draft.target)) {
    return { ok: false, problem: "the start links the target directly: a 1-hop race measures nothing" };
  }
  const routesIn = (pages: Set<string>) => [...neighbours].filter((page) => pages.has(page));
  const backlinks = await graph.backlinks(draft.target, (found) => routesIn(found).length >= EASY_ROUTES);
  const routes = routesIn(backlinks.pages);
  const measured = {
    twoHopRoutes: routes.length,
    complete: backlinks.complete,
    examples: routes.slice(0, 3),
    measuredOn: today,
  };
  const difficulty = tierFor(measured);
  if (difficulty === null) {
    return { ok: false, problem: `only ${routes.length} routes found before counting stopped: can't tell its tier` };
  }
  return { ok: true, measured, difficulty };
}

/**
 * Check a race against the pages, using the race's own rules: both pages
 * exist under the titles given, the start doesn't link the target directly,
 * the difficulty matches the measurement, and the known path wins in the hops
 * that difficulty says.
 *
 * @returns What's wrong with the race; empty if nothing.
 * @throws Only for failures that aren't the race's fault, such as the network.
 */
export async function checkRace(spec: RaceSpec, getLinks: LinkSource): Promise<string[]> {
  const problems: string[] = [];
  for (const title of [spec.start, spec.target]) {
    try {
      const page = await getLinks(title);
      if (page.title !== title) problems.push(`"${title}" is not canonical: it resolves to "${page.title}"`);
    } catch (error) {
      if (!(error instanceof PageNotFoundError)) throw error;
      problems.push(error.message);
    }
  }
  if (problems.length > 0) return problems;

  if (tierFor(spec.measured) !== spec.difficulty) {
    problems.push(`marked ${spec.difficulty}, but its measurement says ${tierFor(spec.measured) ?? "nothing certain"}`);
  }

  const startLinks = await getLinks(spec.start);
  if (startLinks.links.some((link) => normalizeTitle(link) === spec.target)) {
    problems.push("the start links the target directly: a 1-hop race measures nothing");
  }

  const [first, ...moves] = spec.knownPath;
  if (first !== spec.start) return [...problems, "the known path must begin with the start"];
  let race = await startRace(spec.start, spec.target, getLinks);
  for (const step of moves) {
    let result;
    try {
      result = await move(race, step, getLinks);
    } catch (error) {
      // A red link: on the page, but there's no page behind it.
      if (!(error instanceof PageNotFoundError)) throw error;
      return [...problems, `known path: can't move to "${step}": ${error.message}`];
    }
    if (!result.ok) {
      const why = result.reason === "race_over" ? "the race was already won" : "it isn't a link there";
      return [...problems, `known path: can't move to "${step}": ${why}`];
    }
    race = result.race;
  }
  if (!hasWon(race)) return [...problems, "the known path doesn't reach the target"];

  const wrongLength = spec.difficulty === "hard" ? hops(race) < 3 : hops(race) !== 2;
  if (wrongLength) {
    problems.push(`a ${spec.difficulty} race's known path should be ${spec.difficulty === "hard" ? "3+" : "2"} hops`);
  }
  return problems;
}

/** True for any non-null object, so its fields can be read and checked. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
