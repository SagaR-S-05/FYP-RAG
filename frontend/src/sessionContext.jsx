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
  const cleaned = text
    .replace(/^(visualize|show|animate|demonstrate|illustrate|create|plot|draw)\s+/i, "")
    .replace(/[.?!]+$/g, "")
    .trim();

  if (!cleaned) return "New Chat";

  const words = cleaned
    .split(/\s+/)
    .map((word) => word.replace(/[^a-zA-Z0-9+-]/g, ""))
    .filter((word) => word && !STOPWORDS.has(word.toLowerCase()));

  const titleWords = words.length > 0 ? words : cleaned.split(/\s+/);
  return titleWords
    .slice(0, 6)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
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
    title: "New Chat",
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
    quickFact: Boolean(input.quickFact),
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

    function addMessageToSession(sessionId, messageInput) {
      if (!sessionId) return;

      setSessions((prev) =>
        prev.map((session) => {
          if (session.id !== sessionId) return session;

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

          let nextTitle = session.title || "New Chat";
          if (
            nextMessage.role === "user" &&
            (session.title === "New Chat" || !session.title)
          ) {
            nextTitle = deriveTitleFromText(nextMessage.text);
          } else if (nextMessage.videoUrl && nextMessage.galleryName) {
            nextTitle = deriveTitleFromText(nextMessage.galleryName);
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

    function addMessageToActiveSession(messageInput) {
      addMessageToSession(activeSessionId, messageInput);
    }

    function updateMessageInSession(sessionId, messageId, patch) {
      if (!sessionId) return;

      setSessions((prev) =>
        prev.map((session) => {
          if (session.id !== sessionId) return session;

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

    function updateMessageInActiveSession(messageId, patch) {
      updateMessageInSession(activeSessionId, messageId, patch);
    }

    return {
      sessions,
      activeSession,
      activeSessionId,
      selectSession,
      createAndSelectSession,
      addMessageToSession,
      addMessageToActiveSession,
      updateMessageInSession,
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

