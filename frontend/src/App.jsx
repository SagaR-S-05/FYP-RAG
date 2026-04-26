import { useEffect, useMemo, useState } from "react";
import Chat from "./pages/Chat.jsx";
import About from "./pages/About.jsx";
import VideoGallery from "./pages/VideoGallery.jsx";
import {
  Sidebar,
  SidebarInset,
  SidebarTrigger,
  useSidebar,
} from "./components/sidebar.jsx";
import { useSessions } from "./sessionContext.jsx";
import { Info, MessageSquare, Moon, PlayCircle, Plus, Sun } from "lucide-react";

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
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      const stored = localStorage.getItem("theme");
      if (stored === "light") return false;
      if (stored === "dark") return true;
      // no stored preference -> default to dark
      return true;
    } catch (e) {
      return true;
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) root.classList.add("dark");
    else root.classList.remove("dark");

    try {
      localStorage.setItem("theme", isDark ? "dark" : "light");
    } catch (e) {
      // ignore localStorage errors
    }
  }, [isDark]);

  return { isDark, setIsDark };
}

function AppShell() {
  const hash = useHashRoute();
  const { isDark, setIsDark } = useDarkMode();
  const [showSplash, setShowSplash] = useState(true);
  const {
    sessions,
    activeSession,
    activeSessionId,
    selectSession,
    createAndSelectSession,
    updateSessionTitle,
  } = useSessions();
  const { collapsed } = useSidebar();
  const [editingId, setEditingId] = useState(null);
  const [editingValue, setEditingValue] = useState("");

  const route = useMemo(() => {
    if (hash === "#/about") return "about";
    if (hash === "#/videos") return "videos";
    return "chat";
  }, [hash]);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowSplash(false), 3200);
    return () => window.clearTimeout(timer);
  }, []);

  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => b.createdAt - a.createdAt),
    [sessions],
  );

  const handleStartEditing = (session) => {
    setEditingId(session.id);
    const fallbackTitle = session.title || "New Chat";
    setEditingValue(fallbackTitle);
  };

  const handleCommitTitle = () => {
    if (editingId && editingValue.trim()) {
      updateSessionTitle(editingId, editingValue);
    }
    setEditingId(null);
    setEditingValue("");
  };

  return (
    <div className="appShell">
      <div className={showSplash ? "entrySplash" : "entrySplash entrySplashExit"} aria-hidden={!showSplash}>
        <div className="entryGrid" />
        <div className="entryBeam entryBeamOne" />
        <div className="entryBeam entryBeamTwo" />
        <div className="entryCompass">ML</div>
        <div className="entryLogoWrap">
          <div className="entryKicker">Prompt to animated intelligence</div>
          <h1 className="entryTitle">MLViz</h1>
          <div className="entrySubline">Loading visual engine</div>
          <div className="entryLoader">
            <span />
          </div>
        </div>
      </div>

      <Sidebar>
        <div className="sidebarContent">
          {/* Static navigation items */}
          <button
            type="button"
            className={
              route === "about"
                ? "sidebarItem sidebarItemActive"
                : "sidebarItem"
            }
            onClick={() => {
              window.location.hash = "#/about";
            }}
          >
            <span className="sidebarItemIcon">
              <Info size={20} />
            </span>
            {!collapsed && <span className="sidebarItemLabel">About</span>}
          </button>

          <button
            type="button"
            className={
              route === "videos"
                ? "sidebarItem sidebarItemActive"
                : "sidebarItem"
            }
            onClick={() => {
              window.location.hash = "#/videos";
            }}
          >
            <span className="sidebarItemIcon">
              <PlayCircle size={20} />
            </span>
            {!collapsed && (
              <span className="sidebarItemLabel">Video Gallery</span>
            )}
          </button>

          <div className="sidebarDivider" />

          {/* New chat + sessions */}
          <button
            type="button"
            className="sidebarItem sidebarNewChat"
            onClick={() => {
              if (!activeSession || activeSession.messages.length === 0) {
                window.location.hash = "#/";
                return;
              }
              createAndSelectSession();
              window.location.hash = "#/";
            }}
          >
            <span className="sidebarItemIcon">
              <Plus size={20} />
            </span>
            {!collapsed && <span className="sidebarItemLabel">New Chat</span>}
          </button>

          <div className="sidebarChatList">
            {sortedSessions.map((session) => {
              const isActive =
                route === "chat" && session.id === activeSessionId;
              const created = new Date(session.createdAt);
              const label = created.toLocaleTimeString();
              const displayTitle = session.title || "New Chat";
              const isEditing = editingId === session.id;

              return (
                <button
                  key={session.id}
                  type="button"
                  className={
                    isActive
                      ? "sidebarItem sidebarChatItem sidebarItemActive"
                      : "sidebarItem sidebarChatItem"
                  }
                  onClick={() => {
                    selectSession(session.id);
                    window.location.hash = "#/";
                  }}
                >
                  <span className="sidebarItemIcon">
                    <MessageSquare size={20} />
                  </span>
                  {!collapsed && (
                    <span className="sidebarChatText">
                      {isEditing ? (
                        <input
                          className="sidebarChatInput"
                          autoFocus
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          onBlur={handleCommitTitle}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleCommitTitle();
                            } else if (e.key === "Escape") {
                              setEditingId(null);
                              setEditingValue("");
                            }
                          }}
                        />
                      ) : (
                        <>
                          <span
                            className="sidebarChatTitle"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartEditing(session);
                            }}
                          >
                            {displayTitle}
                          </span>
                          <span className="sidebarChatMeta">{label}</span>
                        </>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </Sidebar>

      <SidebarInset>
        <div className="app">
          <header className="appHeader">
            <div className="headerLeft">
              <SidebarTrigger aria-label="Toggle sidebar" />
              <div className="brand">
                <div className="brandTitle">MLViz</div>
                <div className="brandSubtitle">Prompt to video</div>
              </div>
            </div>

            <button
              type="button"
              className="toggleButton"
              onClick={() => setIsDark((v) => !v)}
              aria-pressed={isDark}
              aria-label="Toggle theme"
            >
              <span className="themeIcon themeIconSun">
                <Sun size={19} />
              </span>
              <span className="themeIcon themeIconMoon">
                <Moon size={19} />
              </span>
            </button>
          </header>

          <main className="appMain" key={route}>
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
