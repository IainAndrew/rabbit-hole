// Try the Wikipedia client: print the links on one page.
// Usage: npm run links -- "Page title"

import { fetchLinks } from "./wikipedia.ts";

const title = process.argv[2];
if (!title) {
  console.error('Usage: npm run links -- "Page title"');
  process.exit(1);
}

const page = await fetchLinks(title);

// Rough size of this list if handed to a model as one title per line.
// About 4 characters per token for English text; a real tokenizer will differ.
const asText = page.links.join("\n");
const estimatedTokens = Math.round(asText.length / 4);

if (page.title !== title) {
  console.log(`"${title}" resolves to "${page.title}"`);
}
console.log(`${page.title}: ${page.links.length} links (${page.requests} requests)`);
console.log(`About ${estimatedTokens.toLocaleString()} tokens as a list`);
console.log();
for (const link of page.links.slice(0, 20)) {
  console.log(`  ${link}`);
}
if (page.links.length > 20) {
  console.log(`  ...and ${page.links.length - 20} more`);
}
