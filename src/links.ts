// Try the Wikipedia client: print the links on one page.
// Usage: npm run links -- "Page title"

import { fetchLinks } from "./wikipedia.ts";

const title = process.argv[2];
if (!title) {
  console.error('Usage: npm run links -- "Page title"');
  process.exit(1);
}

const page = await fetchLinks(title);

console.log(`${page.title}: ${page.links.length} links in this response`);
console.log(page.hasMore ? "(Wikipedia has more; paging comes next step)" : "(that's all of them)");
console.log();
for (const link of page.links.slice(0, 20)) {
  console.log(`  ${link}`);
}
if (page.links.length > 20) {
  console.log(`  ...and ${page.links.length - 20} more`);
}
