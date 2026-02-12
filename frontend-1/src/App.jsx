import { useEffect, useMemo, useState } from "react";
import Chat from "./pages/Chat.jsx";
import About from "./pages/About.jsx";
import VideoGallery from "./pages/VideoGallery.jsx";
import { Sidebar, SidebarInset, SidebarTrigger, useSidebar } from "./components/sidebar.jsx";
import { useSessions } from "./sessionContext.jsx";
import { Info, Lightbulb, MessageSquare, PlayCircle, Plus } from "lucide-react";

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
  const { sessions, activeSession, activeSessionId, selectSession, createAndSelectSession, updateSessionTitle } =
    useSessions();
  const { collapsed } = useSidebar();
  const [editingId, setEditingId] = useState(null);
  const [editingValue, setEditingValue] = useState("");

  const route = useMemo(() => {
    if (hash === "#/about") return "about";
    if (hash === "#/videos") return "videos";
    return "chat";
  }, [hash]);

  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => b.createdAt - a.createdAt),
    [sessions]
  );

  const handleStartEditing = (session) => {
    setEditingId(session.id);
    const fallbackTitle = session.title || `Chat ${session.id.slice(-4)}`;
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
              <Info size={18} />
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
              <PlayCircle size={18} />
            </span>
            {!collapsed && <span className="sidebarItemLabel">Video Gallery</span>}
          </button>

          <div className="sidebarDivider" />

          {/* New chat + sessions */}
          <button
            type="button"
            className="sidebarItem sidebarNewChat"
            onClick={() => {
              if (!activeSession || activeSession.messages.length === 0) {
                return;
              }
              const id = createAndSelectSession();
              if (!window.location.hash || window.location.hash === "#/about" || window.location.hash === "#/videos") {
                window.location.hash = "#/";
              }
              if (id) {
                // id is already active via context
              }
            }}
          >
            <span className="sidebarItemIcon">
              <Plus size={18} />
            </span>
            {!collapsed && <span className="sidebarItemLabel">New Chat</span>}
          </button>

          <div className="sidebarChatList">
            {sortedSessions.map((session) => {
              const isActive = route === "chat" && session.id === activeSessionId;
              const created = new Date(session.createdAt);
              const label = created.toLocaleTimeString();
              const displayTitle = session.title || `Chat ${session.id.slice(-4)}`;
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
                    <MessageSquare size={18} />
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
                <div className="brandTitle">Manim RAG</div>
                <div className="brandSubtitle">Prompt → video</div>
              </div>
            </div>

            <button
              type="button"
              className="toggleButton"
              onClick={() => setIsDark((v) => !v)}
              aria-pressed={isDark}
              aria-label="Toggle theme"
            >
              <Lightbulb size={18} />
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