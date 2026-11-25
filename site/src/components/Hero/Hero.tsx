import { BASE } from "../../data.ts";
import type { Facts } from "../../facts.ts";
import styles from "./Hero.module.scss";
import { Path } from "../Path/Path.tsx";

/** The name, the one-paragraph idea, an example race, and the headline figures. */
export function Hero({ facts }: { facts: Facts | null }) {
  const figures = [
    [facts?.models, "models"],
    [facts?.races, "races"],
    [facts?.repeats, "repeats each"],
    [facts?.runs, "runs to replay"],
  ] as const;
  return (
    <section className={styles.hero}>
      <img
        className={styles.logo}
        src={`${BASE}logo.webp`}
        alt="A rabbit peeking out of a puzzle-piece globe"
        width="180"
        height="186"
      />
      <div>
        <h1 className={styles.title}>Rabbit Hole</h1>
        <p className={styles.tagline}>AI agents play the Wikipedia game.</p>
        <p className={styles.intro}>
          Each agent gets a start page and a target page, and has to get from one to the other by following links. One
          twist: it can read any page's links for free. Only moves count.
        </p>
        <Path pages={["Guinness", "Republic of Ireland", "Albert Einstein"]} label="An example race" />
        <dl className={styles.facts}>
          {figures.map(([value, label]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value ?? "–"}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
