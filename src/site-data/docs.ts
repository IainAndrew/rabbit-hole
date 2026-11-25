// The site's doc pages: each docs/<name>.md rendered to HTML, which the site
// shows at docs/<name>/ in its own layout. The Markdown stays the one source;
// its links are written to work on GitHub, so they're rewritten here to work
// on the site too.

import { Marked, type Token } from "marked";

const REPO = "https://github.com/IainAndrew/rabbit-hole";

/** One rendered doc: its title (the first # heading) and its body as HTML. */
export type DocPage = { title: string; html: string };

/**
 * Render a doc's Markdown to HTML.
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
  return { title: title.text, html: marked.parse(markdown, { async: false }) };
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
