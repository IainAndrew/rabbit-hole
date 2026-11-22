// Rabbit Hole site. Reads data/leaderboards.json, which npm run build-site
// writes from the committed traces, and fills the page from it. Nothing here
// computes a score: the build did that with the eval code.

const formatNumber = (value) => value.toLocaleString("en-US");

/** Fill every [data-fact] element with its fact, as text. */
function showFacts(facts) {
  for (const element of document.querySelectorAll("[data-fact]")) {
    const value = facts[element.dataset.fact];
    if (value !== undefined) {
      element.textContent = typeof value === "number" ? formatNumber(value) : value;
    }
  }
}

/** The headline facts: the model board's size and the limits every run had. */
function factsOf(data) {
  const models = data.boards.find((board) => board.id === "models");
  const runs = data.boards.reduce(
    (sum, board) =>
      sum + board.entries.reduce((n, entry) => n + entry.score.decided + entry.score.crashed + entry.score.killed, 0),
    0,
  );
  return {
    models: models.entries.length,
    races: data.races.length,
    repeats: models.repeats,
    runs,
    maxTurns: models.limits.maxTurns,
    maxContextChars: models.limits.maxContextChars,
    maxOutputTokens: models.limits.maxOutputTokens,
  };
}

async function main() {
  const response = await fetch("data/leaderboards.json");
  if (!response.ok) {
    throw new Error(`data/leaderboards.json: HTTP ${response.status}. Run npm run build-site first.`);
  }
  showFacts(factsOf(await response.json()));
}

main().catch((error) => {
  console.error(error);
  const notice = document.createElement("p");
  notice.className = "load-error";
  notice.textContent = `The results didn't load: ${error.message}`;
  document.body.prepend(notice);
});
