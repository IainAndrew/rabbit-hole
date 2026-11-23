// The site's doc pages: each docs/<name>.md rendered as site/docs/<name>/,
// in the site's own header and styles. The Markdown stays the one source;
// its links are written to work on GitHub, so they're rewritten here to work
// on the site too.

import { Marked, type Token } from "marked";

const REPO = "https://github.com/IainAndrew/rabbit-hole";

/** One rendered doc: its title (the first # heading) and the whole page. */
export type DocPage = { title: string; html: string };

/**
 * Render a doc as a full page.
 *
 * @throws If the doc has no # heading, or a link the site can't resolve.
 */
export function renderDoc(markdown: string): DocPage {
  const marked = new Marked({
    walkTokens: (token: Token) => {
      if (token.type === "link") {
        token.href = siteHref(token.href);
      }
    },
    renderer: {
      // An id on every heading, as GitHub gives them, so links like #related-work work.
      heading({ tokens, depth, text }) {
        return `<h${depth} id="${slug(text)}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
      },
    },
  });
  const title = marked.lexer(markdown).find((token) => token.type === "heading" && token.depth === 1);
  if (title === undefined || title.type !== "heading") {
    throw new Error("A doc needs a # heading for its title");
  }
  return { title: title.text, html: page(title.text, marked.parse(markdown, { async: false })) };
}

/**
 * Where a doc's link points on the site, which serves each doc at
 * docs/<name>/. Another doc's .md becomes its page; anything else in the
 * repo (../results/, ../races.json) becomes its page on GitHub.
 *
 * @throws For any other relative link: better a failed build than a dead link.
 */
export function siteHref(href: string): string {
  if (/^[a-z]+:/.test(href) || href.startsWith("#")) {
    return href;
  }
  const doc = /^([\w-]+)\.md(#.*)?$/.exec(href);
  if (doc !== null) {
    return `../${doc[1]}/${doc[2] ?? ""}`;
  }
  if (href.startsWith("../")) {
    const path = href.slice(3);
    return `${REPO}/${path.endsWith("/") ? "tree" : "blob"}/main/${path}`;
  }
  throw new Error(`A doc links to "${href}", which the site can't resolve`);
}

/** A heading's id, the way GitHub makes it: lower case, punctuation dropped, spaces to hyphens. */
export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

/** The page around a rendered doc: the site's header and styles, two levels down. */
function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · Rabbit Hole</title>
  <link rel="icon" href="../../logo.webp">
  <link rel="stylesheet" href="../../style.css">
</head>
<body>
  <header class="site-header">
    <a class="brand" href="../../">
      <img src="../../logo.webp" alt="" width="36" height="37">
      <span>Rabbit Hole</span>
    </a>
    <nav aria-label="Sections">
      <a href="../../#leaderboard">Leaderboard</a>
      <a href="../../#context">Context</a>
      <a href="../../#replays">Replays</a>
      <a href="../../#story">The story</a>
      <a href="../../#method">Method</a>
      <a href="${REPO}">Code</a>
    </nav>
  </header>
  <main class="doc">
${body}
  </main>
  <footer class="site-footer">
    <p>Every number here comes from the committed traces of real runs. <a href="../../">Back to the results</a>.</p>
  </footer>
</body>
</html>
`;
}

/** Text made safe to put inside HTML. */
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}
