// The rules of a race. The model can claim anything; these functions decide
// what actually happened.

/**
 * Where links come from: the live Wikipedia client, the committed snapshot,
 * or a fake in tests. Resolves a title (redirects included) to its canonical
 * title and links, or throws `PageNotFoundError`.
 */
export type LinkSource = (title: string) => Promise<{ title: string; links: string[] }>;

/** Where a race stands. Never changed in place: each move returns a new one. */
export type Race = {
  /** Canonical title of the start page. */
  start: string;
  /** Canonical title, so reaching it through a redirect still counts. */
  target: string;
  /**
   * Every page visited, starting with the start page. The last entry is the
   * current page.
   */
  path: string[];
};

/**
 * What a move did. A refused move leaves the race as it was: "not_a_link"
 * when the page isn't linked from here, "race_over" once the target is reached.
 */
export type MoveResult =
  | { ok: true; race: Race; won: boolean }
  | { ok: false; race: Race; reason: "not_a_link" | "race_over" };

/**
 * Begin a race on the start page, with both titles made canonical.
 *
 * @throws {PageNotFoundError} If either page doesn't exist.
 */
export async function startRace(start: string, target: string, getLinks: LinkSource): Promise<Race> {
  const startPage = await getLinks(start);
  const targetPage = await getLinks(target);
  return { start: startPage.title, target: targetPage.title, path: [startPage.title] };
}

/** The page the race is on now. */
export function currentPage(race: Race): string {
  // path always has the start page, so it's never empty.
  return race.path[race.path.length - 1]!;
}

/** Moves made so far. The score, along with whether the race was won. */
export function hops(race: Race): number {
  return race.path.length - 1;
}

/** True once the current page is the target. */
export function hasWon(race: Race): boolean {
  return currentPage(race) === race.target;
}

/**
 * Follow a link from the current page. Only links that are on the page count.
 *
 * @param to A link title as the model wrote it; matched the way Wikipedia
 *   matches titles (see `normalizeTitle`).
 * @throws {PageNotFoundError} If the link is a red link: on the page, but
 *   its article doesn't exist.
 */
export async function move(race: Race, to: string, getLinks: LinkSource): Promise<MoveResult> {
  if (hasWon(race)) {
    return { ok: false, race, reason: "race_over" };
  }

  const here = await getLinks(currentPage(race));
  const wanted = normalizeTitle(to);
  const link = here.links.find((title) => normalizeTitle(title) === wanted);
  if (!link) {
    return { ok: false, race, reason: "not_a_link" };
  }

  // A link may point at a redirect ("Einstein"), so record where it lands.
  const destination = await getLinks(link);
  const next: Race = { ...race, path: [...race.path, destination.title] };
  return { ok: true, race: next, won: hasWon(next) };
}

/**
 * A title in the form Wikipedia compares titles in. Wikipedia ignores the
 * case of a title's first letter and treats underscores as spaces, so
 * "republic_of Ireland" and "Republic of Ireland" are the same.
 */
export function normalizeTitle(title: string): string {
  const spaced = title.trim().replaceAll("_", " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
