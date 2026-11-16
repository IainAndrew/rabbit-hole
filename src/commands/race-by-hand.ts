// Play a race yourself by typing tool calls, and see what a model would see.
// Usage: npm run race-by-hand -- "Start page" "Target page"

import { createInterface } from "node:readline";
import { currentPage, hops, startRace } from "../race/race.ts";
import { executeTool, type ToolCall } from "../race/tools.ts";
import { fetchLinks } from "../wikipedia/wikipedia.ts";

// Long link lists would bury the terminal. The model gets the full text.
const PREVIEW_LINES = 30;

const [start, target] = process.argv.slice(2);
if (!start || !target) {
  console.error('Usage: npm run race-by-hand -- "Start page" "Target page"');
  process.exit(1);
}

let race = await startRace(start, target, fetchLinks);
let calls = 0;
let resultChars = 0;

console.log(`Start: "${race.start}"   Target: "${race.target}"`);
console.log("Type a tool call, e.g.  get_links Guinness  |  move_to Stout  |  give_up lost");
console.log();

const input = createInterface({ input: process.stdin, output: process.stdout, prompt: "> " });
// With piped input, stdin can end while a tool call is still running.
let inputClosed = false;
input.on("close", () => (inputClosed = true));
const prompt = () => {
  if (!inputClosed) input.prompt();
};
prompt();

for await (const line of input) {
  const call = parseCall(line);
  if (!call) {
    prompt();
    continue;
  }

  const outcome = await executeTool(call, race, fetchLinks);
  race = outcome.race;
  calls++;
  resultChars += outcome.content.length;

  printPreview(outcome.content);
  // Every tool result stays in the conversation and is re-sent each turn,
  // so this total is roughly how much the model would be carrying.
  console.log(
    `[calls ${calls} | hops ${hops(race)} | on "${currentPage(race)}" | tool results so far ≈ ${Math.round(resultChars / 4).toLocaleString()} tokens]`,
  );
  console.log();

  if (outcome.end) {
    console.log(outcome.end === "won" ? `Won in ${hops(race)} hops.` : "Race over: gave up.");
    console.log(`Path: ${race.path.join(" > ")}`);
    break;
  }
  prompt();
}
input.close();

// "move_to Republic of Ireland" → { name: "move_to", arguments: '{"page":"Republic of Ireland"}' }.
// Arguments are sent as a JSON string, exactly as a model sends them.
function parseCall(line: string): ToolCall | null {
  const trimmed = line.trim();
  if (trimmed === "") return null;
  const space = trimmed.indexOf(" ");
  const name = space === -1 ? trimmed : trimmed.slice(0, space);
  const value = space === -1 ? "" : trimmed.slice(space + 1).trim();
  const key = name === "give_up" ? "reason" : "page";
  return { name, arguments: JSON.stringify({ [key]: value }) };
}

function printPreview(content: string): void {
  const lines = content.split("\n");
  console.log(lines.slice(0, PREVIEW_LINES).join("\n"));
  if (lines.length > PREVIEW_LINES) {
    console.log(`  ...${lines.length - PREVIEW_LINES} more lines (the model sees all of them)`);
  }
}
