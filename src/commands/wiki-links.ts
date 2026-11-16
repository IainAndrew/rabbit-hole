// Try the Wikipedia client: print the links on one page.
// Usage: npm run wiki-links -- "Page title"

import { fetchLinks } from "../wikipedia/wikipedia.ts";

const title = process.argv[2];
if (!title) {
  console.error('Usage: npm run wiki-links -- "Page title"');
  process.exit(1);
}

const firstStart = performance.now();
const page = await fetchLinks(title);
const firstMs = performance.now() - firstStart;

// Ask again to show the cache: no requests, near-instant.
const againStart = performance.now();
await fetchLinks(title);
const againMs = performance.now() - againStart;

// Rough size of this list if handed to a model as one title per line.
// About 4 characters per token for English text; a real tokenizer will differ.
const asText = page.links.join("\n");
const estimatedTokens = Math.round(asText.length / 4);

if (page.title !== title) {
  console.log(`"${title}" resolves to "${page.title}"`);
}
console.log(
  `${page.title}: ${page.links.length} links (${page.requests} requests, ${Math.round(firstMs)} ms)`,
);
console.log(`Asked again: ${againMs.toFixed(2)} ms from the cache`);
console.log(`About ${estimatedTokens.toLocaleString()} tokens as a list`);
console.log();
for (const link of page.links.slice(0, 20)) {
  console.log(`  ${link}`);
}
if (page.links.length > 20) {
  console.log(`  ...and ${page.links.length - 20} more`);
}
