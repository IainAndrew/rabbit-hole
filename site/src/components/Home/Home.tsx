// The results page: what the game is, the leaderboards, the replays, the
// failure story and the method, all filled from the built data.

import { useSiteData } from "../../data.ts";
import { boardOf, factsOf } from "../../facts.ts";
import { ContextSection } from "../ContextSection/ContextSection.tsx";
import { Hero } from "../Hero/Hero.tsx";
import styles from "./Home.module.scss";
import { HowItWorks } from "../HowItWorks/HowItWorks.tsx";
import { LeaderboardSection } from "../LeaderboardSection.tsx";
import { Method } from "../Method/Method.tsx";
import { Replays } from "../replays/Replays/Replays.tsx";
import { Story } from "../Story/Story.tsx";

export function Home() {
  const { data, error } = useSiteData();
  if (error !== null) {
    return <p className={styles.loadError}>The results didn't load: {error.message}</p>;
  }
  const facts = data === null ? null : factsOf(data);
  return (
    <main id="top">
      <Hero facts={facts} />
      <HowItWorks facts={facts} />
      {data !== null && facts !== null && (
        <>
          <LeaderboardSection board={boardOf(data, "models")} facts={facts} />
          <ContextSection strategies={boardOf(data, "strategies")} prompts={boardOf(data, "prompts")} facts={facts} />
          <Replays data={data} />
          <Story facts={facts} />
          <Method facts={facts} />
        </>
      )}
    </main>
  );
}
