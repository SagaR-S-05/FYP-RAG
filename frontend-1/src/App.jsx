import { useEffect, useMemo, useState } from "react";
import Chat from "./pages/Chat.jsx";
import About from "./pages/About.jsx";

function useHashRoute() {
  const getHash = () => window.location.hash || "#/";
  const [hash, setHash] = useState(getHash);

  useEffect(() => {
    const onChange = () => setHash(getHash());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  return hash;
}

function useDarkMode() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) root.classList.add("dark");
    else root.classList.remove("dark");
  }, [isDark]);

  return { isDark, setIsDark };
}

export default function App() {
  const hash = useHashRoute();
  const { isDark, setIsDark } = useDarkMode();

  const route = useMemo(() => {
    if (hash === "#/about") return "about";
    return "chat";
  }, [hash]);

  return (
    <div className="app">
      <header className="appHeader">
        <div className="brand">
          <div className="brandTitle">Manim RAG</div>
          <div className="brandSubtitle">Prompt → video</div>
        </div>

        <nav className="nav">
          <a className={route === "chat" ? "navLink active" : "navLink"} href="#/">
            Chat
          </a>
          <a
            className={route === "about" ? "navLink active" : "navLink"}
            href="#/about"
          >
            About
          </a>
          <button
            type="button"
            className="toggleButton"
            onClick={() => setIsDark((v) => !v)}
            aria-pressed={isDark}
          >
            {isDark ? "Dark" : "Light"}
          </button>
        </nav>
      </header>

      <main className="appMain">{route === "about" ? <About /> : <Chat />}</main>
    </div>
  );
}

