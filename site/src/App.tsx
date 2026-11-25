// The whole site: the results page, or one of the docs at docs/<name>/. The
// host serves index.html for any path it has no file for, so the app picks
// the page from the address.

import { DocPage } from "./components/DocPage/DocPage.tsx";
import { Footer } from "./components/Footer/Footer.tsx";
import { Header } from "./components/Header/Header.tsx";
import { Home } from "./components/Home/Home.tsx";
import { BASE } from "./data.ts";

export function App() {
  const doc = docName(location.pathname);
  return (
    <>
      <Header />
      {doc === null ? <Home /> : <DocPage name={doc} />}
      <Footer />
    </>
  );
}

/** The doc the address names (…/docs/<name>/), or null for the results page. */
function docName(pathname: string): string | null {
  const match = /^docs\/([\w-]+)\/?$/.exec(pathname.slice(BASE.length));
  return match === null ? null : match[1]!;
}
