import { createContext, useContext, useMemo, useState } from "react";

const WELCOME_MESSAGES = [
  "Welcome. Describe what you’d like to visualize, and I’ll help turn it into a Manim video.",
  "Hi there. Share an idea, and we’ll gently turn it into an animated explanation.",
  "You’re in the right place. Tell me what concept you want to see come alive.",
  "Ready when you are. Type a prompt, and we’ll explore it through animation together.",
  "Let’s create something clear and calm. What would you like this video to explain?"
];

const SessionContext = createContext(null);

function pickWelcomeMessage() {
  const index = Math.floor(Math.random() * WELCOME_MESSAGES.length);
  return WELCOME_MESSAGES[index];
}

function createSession() {
  const now = Date.now();
  return {
    id: String(now),
    createdAt: now,
    welcomeMessage: pickWelcomeMessage(),
    messages: [],
    videos: []
  };
}

export function SessionProvider({ children }) {
  const [sessions, setSessions] = useState(() => [createSession()]);
  const [activeId, setActiveId] = useState(null);

  const activeSessionId = activeId ?? sessions[0]?.id ?? null;

  const value = useMemo(() => {
    const activeSession =
      sessions.find((session) => session.id === activeSessionId) ?? sessions[0] ?? null;

    function createAndSelectSession() {
      const next = createSession();
      setSessions((prev) => [...prev, next]);
      setActiveId(next.id);
      return next.id;
    }

    function selectSession(id) {
      setActiveId(id);
    }

    function addMessageToActiveSession({ text, videoUrl }) {
      if (!activeSessionId) return;

      setSessions((prev) =>
        prev.map((session) => {
          if (session.id !== activeSessionId) return session;

          const nextMessages = [
            ...session.messages,
            {
              id: `${session.id}-${session.messages.length + 1}`,
              text
            }
          ];

          let nextVideos = session.videos;
          if (videoUrl) {
            const combined = [...session.videos, videoUrl];
            if (combined.length > 3) {
              nextVideos = combined.slice(combined.length - 3);
            } else {
              nextVideos = combined;
            }
          }

          return {
            ...session,
            messages: nextMessages,
            videos: nextVideos
          };
        })
      );
    }

    return {
      sessions,
      activeSession,
      activeSessionId,
      selectSession,
      createAndSelectSession,
      addMessageToActiveSession
    };
  }, [sessions, activeSessionId]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSessions() {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSessions must be used within a SessionProvider");
  }
  return ctx;
}

