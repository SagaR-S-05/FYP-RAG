import { createContext, useContext, useMemo, useState } from "react";

const WELCOME_MESSAGES = [
  "Welcome. Describe what you’d like to visualize, and I’ll help turn it into a Manim video.",
  "Hi there. Share an idea, and we’ll gently turn it into an animated explanation.",
  "You’re in the right place. Tell me what concept you want to see come alive.",
  "Ready when you are. Type a prompt, and we’ll explore it through animation together.",
  "Let’s create something clear and calm. What would you like this video to explain?"
];

const SessionContext = createContext(null);

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "what",
  "when",
  "where",
  "which",
  "why",
  "with"
]);

function deriveTitleFromText(text) {
  const tokens = text
    .split(/\s+/)
    .map((word) => word.replace(/[^a-zA-Z]/g, "").toLowerCase())
    .filter(Boolean);

  const keyword = tokens.find((word) => !STOPWORDS.has(word));
  if (!keyword) return "Chat";
  return keyword.charAt(0).toUpperCase() + keyword.slice(1);
}

function pickWelcomeMessage() {
  const index = Math.floor(Math.random() * WELCOME_MESSAGES.length);
  return WELCOME_MESSAGES[index];
}

function createSession() {
  const now = Date.now();
  return {
    id: String(now),
    createdAt: now,
    title: null,
    welcomeMessage: pickWelcomeMessage(),
    messages: [],
    videos: []
  };
}

function normalizeMessage(input, session) {
  const role = input.role ?? "assistant";
  const text = input.text ?? "";

  return {
    id: input.id ?? `${session.id}-${session.messages.length + 1}`,
    role,
    text,
    videoUrl: input.videoUrl ?? null,
    error: Boolean(input.error),
    pending: Boolean(input.pending),
    insight: Boolean(input.insight),
    galleryVideoId: input.galleryVideoId ?? null,
    galleryName: input.galleryName ?? "",
    gallerySaved: Boolean(input.gallerySaved)
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

    function addMessageToActiveSession(messageInput) {
      if (!activeSessionId) return;

      setSessions((prev) =>
        prev.map((session) => {
          if (session.id !== activeSessionId) return session;

          const isFirstInteraction = session.messages.length === 0;
          const nextMessage = normalizeMessage(messageInput, session);

          const nextMessages = [
            ...session.messages,
            nextMessage
          ];

          let nextVideos = session.videos;
          if (nextMessage.videoUrl) {
            const combined = [...session.videos, nextMessage.videoUrl];
            if (combined.length > 3) {
              nextVideos = combined.slice(combined.length - 3);
            } else {
              nextVideos = combined;
            }
          }

          let nextTitle = session.title;
          if (isFirstInteraction && !nextTitle) {
            nextTitle = deriveTitleFromText(nextMessage.text);
          }

          return {
            ...session,
            title: nextTitle,
            messages: nextMessages,
            videos: nextVideos
          };
        })
      );
    }

    function updateSessionTitle(id, title) {
      const trimmed = title.trim();
      if (!trimmed) return;
      setSessions((prev) =>
        prev.map((session) =>
          session.id === id
            ? {
                ...session,
                title: trimmed
              }
            : session
        )
      );
    }

    function updateMessageInActiveSession(messageId, patch) {
      if (!activeSessionId) return;

      setSessions((prev) =>
        prev.map((session) => {
          if (session.id !== activeSessionId) return session;

          return {
            ...session,
            messages: session.messages.map((message) =>
              message.id === messageId
                ? {
                    ...message,
                    ...patch
                  }
                : message
            )
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
      addMessageToActiveSession,
      updateMessageInActiveSession,
      updateSessionTitle
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

