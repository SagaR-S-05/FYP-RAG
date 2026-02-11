import { useEffect, useMemo, useState } from "react";
import Chat from "./pages/Chat.jsx";
import About from "./pages/About.jsx";
import VideoGallery from "./pages/VideoGallery.jsx";
import { Sidebar, SidebarInset, SidebarTrigger } from "./components/sidebar.jsx";
import { useSessions } from "./sessionContext.jsx";

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

function AppShell() {
  const hash = useHashRoute();
  const { isDark, setIsDark } = useDarkMode();
  const { sessions, activeSessionId, selectSession, createAndSelectSession } = useSessions();

  const route = useMemo(() => {
    if (hash === "#/about") return "about";
    if (hash === "#/videos") return "videos";
    return "chat";
  }, [hash]);

  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => b.createdAt - a.createdAt),
    [sessions]
  );

  return (
    <div className="appShell">
      <Sidebar>
        <div className="sidebarContent">
          <div className="sidebarSection">
            <div className="sidebarSectionHeader">Chat</div>
            <button
              type="button"
              className="sidebarNewChat bg-sidebar-accent text-sidebar-accent-foreground"
              onClick={() => {
                const id = createAndSelectSession();
                if (!window.location.hash || window.location.hash === "#/about" || window.location.hash === "#/videos") {
                  window.location.hash = "#/";
                }
                if (id) {
                  // id is already active via context
                }
              }}
            >
              New Chat
            </button>
            <div className="sidebarChatList">
              {sortedSessions.map((session) => {
                const isActive = session.id === activeSessionId;
                const created = new Date(session.createdAt);
                const label = created.toLocaleTimeString();

                return (
                  <button
                    key={session.id}
                    type="button"
                    className={
                      isActive
                        ? "sidebarChatItem sidebarChatItemActive"
                        : "sidebarChatItem"
                    }
                    onClick={() => {
                      selectSession(session.id);
                      window.location.hash = "#/";
                    }}
                  >
                    <span className="sidebarChatTitle">
                      Chat {session.id.slice(-4)}
                    </span>
                    <span className="sidebarChatMeta">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="sidebarSection">
            <div className="sidebarSectionHeader">Videos</div>
            <button
              type="button"
              className="sidebarNavItem"
              onClick={() => {
                window.location.hash = "#/videos";
              }}
            >
              Video Gallery
            </button>
          </div>

          <div className="sidebarSection">
            <div className="sidebarSectionHeader">About</div>
            <button
              type="button"
              className="sidebarNavItem"
              onClick={() => {
                window.location.hash = "#/about";
              }}
            >
              About
            </button>
          </div>
        </div>
      </Sidebar>

      <SidebarInset>
        <div className="app">
          <header className="appHeader">
            <div className="headerLeft">
              <SidebarTrigger aria-label="Toggle sidebar" />
              <div className="brand">
                <div className="brandTitle">Manim RAG</div>
                <div className="brandSubtitle">Prompt → video</div>
              </div>
            </div>

            <button
              type="button"
              className="toggleButton"
              onClick={() => setIsDark((v) => !v)}
              aria-pressed={isDark}
            >
              {isDark ? "Dark" : "Light"}
            </button>
          </header>

          <main className="appMain">
            {route === "about" && <About />}
            {route === "videos" && <VideoGallery />}
            {route === "chat" && <Chat />}
          </main>
        </div>
      </SidebarInset>
    </div>
  );
}

export default function App() {
  return <AppShell />;
}
