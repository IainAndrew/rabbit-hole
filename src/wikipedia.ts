// Client for the English Wikipedia Action API.

const API_URL = "https://en.wikipedia.org/w/api.php";

// Wikipedia allows far more requests from clients that say who they are.
const USER_AGENT = "RabbitHole/0.1 (https://iainandrew.com) bot";

// Namespace 0 is articles. Other namespaces (Talk:, Category:, Help:) aren't
// part of the race.
const ARTICLE_NAMESPACE = 0;

export type LinksPage = {
  title: string;
  links: string[];
  // True when Wikipedia has more links than fit in this response.
  hasMore: boolean;
};

export async function fetchLinks(title: string): Promise<LinksPage> {
  const params = new URLSearchParams({
    action: "query",
    prop: "links",
    titles: title,
    plnamespace: String(ARTICLE_NAMESPACE),
    pllimit: "max",
    format: "json",
    formatversion: "2",
  });

  const response = await fetch(`${API_URL}?${params}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!response.ok) {
    throw new Error(`Wikipedia returned HTTP ${response.status} for "${title}"`);
  }

  return parseLinksResponse(await response.json(), title);
}

// The API's JSON is outside data: check its shape before trusting it.
function parseLinksResponse(body: unknown, requested: string): LinksPage {
  if (!isRecord(body) || !isRecord(body.query) || !Array.isArray(body.query.pages)) {
    throw new Error(`Unexpected Wikipedia response for "${requested}"`);
  }

  const page: unknown = body.query.pages[0];
  if (!isRecord(page) || typeof page.title !== "string") {
    throw new Error(`No page in Wikipedia response for "${requested}"`);
  }
  if (page.missing === true) {
    throw new Error(`Wikipedia has no page called "${requested}"`);
  }

  // A page with no article links has no "links" field at all.
  const rawLinks: unknown[] = Array.isArray(page.links) ? page.links : [];
  const links = rawLinks.map((link) => {
    if (!isRecord(link) || typeof link.title !== "string") {
      throw new Error(`Malformed link in Wikipedia response for "${requested}"`);
    }
    return link.title;
  });

  return { title: page.title, links, hasMore: "continue" in body };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
