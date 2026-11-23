import assert from "node:assert/strict";
import { test } from "node:test";
import { renderDoc, siteHref, slug } from "./docs.ts";

test("another doc's .md link becomes its page, anchor kept", () => {
  assert.equal(siteHref("method.md"), "../method/");
  assert.equal(siteHref("down-the-rabbit-hole.md#the-fix"), "../down-the-rabbit-hole/#the-fix");
});

test("a link elsewhere in the repo becomes its page on GitHub", () => {
  assert.equal(siteHref("../results/"), "https://github.com/IainAndrew/rabbit-hole/tree/main/results/");
  assert.equal(siteHref("../races.json"), "https://github.com/IainAndrew/rabbit-hole/blob/main/races.json");
});

test("web links and anchors are left alone", () => {
  assert.equal(siteHref("https://arxiv.org/abs/2508.21433"), "https://arxiv.org/abs/2508.21433");
  assert.equal(siteHref("#related-work"), "#related-work");
});

test("a relative link the site can't resolve stops the build", () => {
  assert.throws(() => siteHref("notes.txt"), /can't resolve/);
});

test("heading ids match GitHub's", () => {
  assert.equal(slug("Related work"), "related-work");
  assert.equal(slug("One twist: free lookahead"), "one-twist-free-lookahead");
  assert.equal(slug("The real cause: two goals, no order"), "the-real-cause-two-goals-no-order");
});

test("a doc renders as a page titled by its # heading, with ids and rewritten links", () => {
  const { title, html } = renderDoc("# Method\n\n## Related work\n\nSee [the races](../races.json).\n");
  assert.equal(title, "Method");
  assert.match(html, /<title>Method · Rabbit Hole<\/title>/);
  assert.match(html, /<h2 id="related-work">Related work<\/h2>/);
  assert.match(html, /href="https:\/\/github.com\/IainAndrew\/rabbit-hole\/blob\/main\/races.json"/);
});

test("a doc with no # heading has no title", () => {
  assert.throws(() => renderDoc("## Not a title\n"), /needs a # heading/);
});
