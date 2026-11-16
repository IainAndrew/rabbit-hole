import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LinkSource } from "../race/race.ts";
import { fakeLinks } from "./fake-wikipedia.ts";
import { snapshotLinks } from "./snapshot.ts";
import { PageNotFoundError } from "./wikipedia.ts";

// A fresh snapshot directory, and a live source that counts its calls.
async function setup(live: LinkSource = fakeLinks) {
  const dir = await mkdtemp(join(tmpdir(), "snapshot-test-"));
  const calls: string[] = [];
  const getLinks = snapshotLinks(dir, (title) => {
    calls.push(title);
    return live(title);
  });
  return { dir, calls, getLinks };
}

test("a miss is fetched live once, then read from the snapshot", async () => {
  const { calls, getLinks } = await setup();
  const first = await getLinks("Guinness");
  const second = await getLinks("Guinness");
  assert.deepEqual(second, first);
  assert.deepEqual(calls, ["Guinness"]);
});

test("titles Wikipedia treats as the same share one entry", async () => {
  const { calls, getLinks } = await setup();
  await getLinks("Republic of Ireland");
  const page = await getLinks("republic_of Ireland");
  assert.equal(page.title, "Republic of Ireland");
  assert.deepEqual(calls, ["Republic of Ireland"]);
});

test("a redirect is recorded and followed offline", async () => {
  const { dir, calls, getLinks } = await setup();
  await getLinks("Einstein");
  const page = await getLinks("Einstein");
  assert.equal(page.title, "Albert Einstein");
  assert.deepEqual(calls, ["Einstein"]);
  assert.equal((await readdir(dir)).length, 2);
});

test("a missing page is recorded and fails the same way offline", async () => {
  const { calls, getLinks } = await setup();
  await assert.rejects(getLinks("Nowhere"), PageNotFoundError);
  await assert.rejects(getLinks("Nowhere"), PageNotFoundError);
  assert.deepEqual(calls, ["Nowhere"]);
});

test("a recorded page is never overwritten by a newer live copy", async () => {
  let version = 1;
  const changing: LinkSource = async (title) => {
    const page = await fakeLinks(title);
    return { ...page, links: [`version ${version}`] };
  };
  const { getLinks } = await setup(changing);
  await getLinks("Albert Einstein");
  version = 2;
  // A redirect miss fetches the page again; the snapshot's copy must win.
  const page = await getLinks("Einstein");
  assert.deepEqual(page.links, ["version 1"]);
});

test("a malformed snapshot file fails loudly", async () => {
  const { dir, getLinks } = await setup();
  await getLinks("Guinness");
  const [file] = await readdir(dir);
  await writeFile(join(dir, file!), JSON.stringify({ kind: "page", title: "Guinness" }));
  await assert.rejects(getLinks("Guinness"), /Malformed snapshot file/);
});
