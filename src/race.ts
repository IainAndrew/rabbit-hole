// The rules of a race. The model can claim anything; these functions decide
// what actually happened.

// Where links come from. The live Wikipedia client fits this shape, and so
// does a fake in tests (and, later, the committed snapshot).
export type LinkSource = (title: string) => Promise<{ title: string; links: string[] }>;

export type Race = {
  start: string;
  // Canonical title, so reaching it through a redirect still counts.
  target: string;
  // Every page visited, starting with the start page. The last entry is the
  // current page.
  path: string[];
};

export type MoveResult =
  | { ok: true; race: Race; won: boolean }
  | { ok: false; race: Race; reason: "not_a_link" | "race_over" };

export async function startRace(start: string, target: string, getLinks: LinkSource): Promise<Race> {
  const startPage = await getLinks(start);
  const targetPage = await getLinks(target);
  return { start: startPage.title, target: targetPage.title, path: [startPage.title] };
}

export function currentPage(race: Race): string {
  // path always has the start page, so it's never empty.
  return race.path[race.path.length - 1]!;
}

export function hops(race: Race): number {
  return race.path.length - 1;
}

export function hasWon(race: Race): boolean {
  return currentPage(race) === race.target;
}

// Follow a link from the current page. Only links that are on the page count.
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

// Wikipedia ignores the case of a title's first letter and treats underscores
// as spaces, so "republic_of Ireland" and "Republic of Ireland" are the same.
export function normalizeTitle(title: string): string {
  const spaced = title.trim().replaceAll("_", " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
