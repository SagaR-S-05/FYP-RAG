import { useState, useRef, useEffect } from "react";
import { ArrowUp } from "lucide-react";
import { useSessions } from "../sessionContext.jsx";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

const stages = [
  { name: "Analyzing Prompt", duration: 5000 },
  { name: "Generating Code", duration: 8000 },
  { name: "Code Ready", duration: 4000 },
  { name: "Rendering Frames", duration: 20000 },
  { name: "Finalizing Video", duration: 8000 },
  { name: "Complete", duration: 0 },
];

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

function buildApiUrl(path) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (API_BASE_URL) {
    return `${API_BASE_URL}${normalizedPath}`;
  }
  return `/api${normalizedPath}`;
}

function resolveVideoUrl(videoUrl) {
  if (!videoUrl) return null;
  let normalized = String(videoUrl).trim().replace(/\\/g, "/");

  if (/^https?:\/\//i.test(normalized)) return normalized;

  const lower = normalized.toLowerCase();
  const renderedIndex = lower.lastIndexOf("rendered_videos/");
  if (renderedIndex >= 0) {
    normalized = `/${normalized.slice(renderedIndex)}`;
  } else if (/^[^/]+\.mp4$/i.test(normalized)) {
    normalized = `/rendered_videos/${normalized}`;
  } else {
    normalized = normalized.startsWith("/") ? normalized : `/${normalized}`;
  }

  if (normalized.startsWith("/api/rendered_videos/")) {
    normalized = normalized.replace(/^\/api/, "");
  }

  if (API_BASE_URL) {
    return `${API_BASE_URL}${normalized}`;
  }

  return normalized;
}

function buildVideoCandidates(videoPath, dbVideoId = null, dbPromptId = null) {
  if (!videoPath && !dbVideoId && !dbPromptId) return [];

  const raw = String(videoPath || "").trim().replace(/\\/g, "/");
  if (raw && /^https?:\/\//i.test(raw)) return [raw];

  const clean = raw ? raw.split("?")[0].split("#")[0] : "";
  const fileName = clean.split("/").filter(Boolean).pop() || "";

  let relativePath = clean;
  const renderedIndex = clean
    ? clean.toLowerCase().lastIndexOf("rendered_videos/")
    : -1;
  if (renderedIndex >= 0 && clean) {
    relativePath = `/${clean.slice(renderedIndex)}`;
  } else if (clean && /^[^/]+\.mp4$/i.test(clean)) {
    relativePath = `/rendered_videos/${clean}`;
  } else {
    relativePath = clean.startsWith("/") ? clean : `/${clean}`;
  }

  if (relativePath.startsWith("/api/rendered_videos/")) {
    relativePath = relativePath.replace(/^\/api/, "");
  }

  const renderedPathFromFile = fileName
    ? `/rendered_videos/${fileName}`
    : null;

  const candidates = [
    clean ? resolveVideoUrl(relativePath) : null,
    renderedPathFromFile ? resolveVideoUrl(renderedPathFromFile) : null,
    dbVideoId ? resolveVideoUrl(`/rendered_videos/${dbVideoId}.mp4`) : null,
    dbPromptId ? resolveVideoUrl(`/rendered_videos/${dbPromptId}.mp4`) : null,
    clean && API_BASE_URL ? `${API_BASE_URL}${relativePath}` : null,
    API_BASE_URL && renderedPathFromFile
      ? `${API_BASE_URL}${renderedPathFromFile}`
      : null,
    API_BASE_URL && dbVideoId
      ? `${API_BASE_URL}/rendered_videos/${dbVideoId}.mp4`
      : null,
    API_BASE_URL && dbPromptId
      ? `${API_BASE_URL}/rendered_videos/${dbPromptId}.mp4`
      : null,
  ].filter(Boolean);

  return [...new Set(candidates)];
}

async function canLoadVideoUrl(url) {
  try {
    const head = await fetch(url, { method: "HEAD" });
    if (head.ok) return true;

    if (head.status === 405) {
      const probe = await fetch(url, {
        method: "GET",
        headers: { Range: "bytes=0-1" },
      });
      return probe.ok || probe.status === 206;
    }
  } catch (_) {
    return false;
  }

  return false;
}

async function findLoadableVideoUrl(videoPath, dbVideoId = null, dbPromptId = null) {
  const candidates = buildVideoCandidates(videoPath, dbVideoId, dbPromptId);

  for (const candidate of candidates) {
    const ok = await canLoadVideoUrl(candidate);
    if (ok) return candidate;
  }

  return candidates[0] || null;
}

async function fetchVideoFromDb(promptText) {
  if (!isSupabaseConfigured || !supabase) return null;

  const { data, error } = await supabase
    .from("videos")
    .select(`
      id,
      video_url,
      created_at,
      prompt_id,
      prompts (
        prompt_text
      )
    `)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error || !Array.isArray(data) || data.length === 0) {
    return null;
  }

  const normalizedPrompt = promptText.trim().toLowerCase();
  const matchingVideo = data.find(
    (row) => {
      const promptRelation = Array.isArray(row?.prompts)
        ? row.prompts[0]
        : row?.prompts;
      const promptValue = promptRelation?.prompt_text?.trim().toLowerCase();
      return promptValue === normalizedPrompt;
    }
  );

  return matchingVideo || data[0] || null;
}

export default function Chat() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [currentStageIndex, setCurrentStageIndex] = useState(-1);
  const [stageProgress, setStageProgress] = useState(0);
  const [stageStatus, setStageStatus] = useState(() =>
    stages.map(() => "pending")
  );
  const { activeSession, addMessageToActiveSession } = useSessions();
  const textareaRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Determine if the current session has zero messages
  const isEmptySession =
    !!activeSession &&
    (!activeSession.messages || activeSession.messages.length === 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const userPrompt = prompt.trim();
    if (!userPrompt || !activeSession) return;

    addMessageToActiveSession({
      role: "user",
      text: userPrompt,
    });

    setLoading(true);
    setError(null);
    setIsAnimating(true);
    setCurrentStageIndex(0);
    setStageProgress(0);
    setStageStatus(stages.map((_, index) => (index === 0 ? "running" : "pending")));

    try {
      const response = await fetch(buildApiUrl("/generate"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt: userPrompt }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || data?.status !== "success") {
        const backendError =
          data?.error || data?.detail || "Video generation failed.";
        throw new Error(backendError);
      }

      let videoPath = data?.video_url || null;
      let dbVideoId = null;
      let dbPromptId = null;

      const dbVideo = await fetchVideoFromDb(userPrompt);
      if (dbVideo) {
        if (!videoPath) {
          videoPath = dbVideo.video_url || null;
        }
        dbVideoId = dbVideo.id || null;
        dbPromptId = dbVideo.prompt_id || null;
      }

      if (!videoPath) {
        throw new Error("Video generated, but no video path was found.");
      }

      const resolvedVideoUrl = await findLoadableVideoUrl(videoPath, dbVideoId, dbPromptId);
      if (!resolvedVideoUrl) {
        throw new Error("Unable to load video from rendered_videos.");
      }
      const cacheBustedUrl = `${resolvedVideoUrl}${resolvedVideoUrl.includes("?") ? "&" : "?"}t=${Date.now()}`;

      addMessageToActiveSession({
        role: "assistant",
        text: "Your animation is ready.",
        videoUrl: cacheBustedUrl,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      console.error("API error:", message);
      setError(message);
      addMessageToActiveSession({
        role: "assistant",
        text: message,
        error: true,
      });
    } finally {
      setPrompt("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.overflowY = "hidden";
      }

      setLoading(false);
      setIsAnimating(false);
      setCurrentStageIndex(-1);
      setStageProgress(0);
      setStageStatus(stages.map(() => "pending"));
    }
  };

  const welcomeMessage = activeSession?.welcomeMessage;

  // Auto-resize textarea: grow from 1 to 4 lines, then enable scroll
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;

    const resize = () => {
      // reset to allow shrink
      ta.style.height = "auto";
      const computed = window.getComputedStyle(ta);
      const lineHeight = parseFloat(computed.lineHeight) || 20;
      const maxHeight = lineHeight * 4; // 4 lines max
      const newHeight = Math.min(ta.scrollHeight, maxHeight);
      ta.style.height = `${newHeight}px`;
      ta.style.overflowY = ta.scrollHeight > maxHeight ? "auto" : "hidden";
    };

    // call on mount and when prompt changes
    resize();
    ta.addEventListener("input", resize);
    return () => ta.removeEventListener("input", resize);
  }, [prompt, activeSession?.id]);

  // Reset text/height when switching sessions
  useEffect(() => {
    setPrompt("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.overflowY = "hidden";
    }
  }, [activeSession?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeSession?.messages, isAnimating, error]);

  useEffect(() => {
    if (!isAnimating || currentStageIndex < 0 || currentStageIndex >= stages.length) {
      return;
    }

    const currentStage = stages[currentStageIndex];

    if (currentStage.duration === 0) {
      setStageProgress(100);
      setStageStatus((prev) => {
        const next = [...prev];
        next[currentStageIndex] = "complete";
        return next;
      });
      setIsAnimating(false);
      return;
    }

    const start = Date.now();
    const intervalMs = 100;

    const id = setInterval(() => {
      const elapsed = Date.now() - start;
      const rawProgress = (elapsed / currentStage.duration) * 100;
      const clamped = Math.min(100, rawProgress);

      setStageProgress(clamped);

      if (clamped >= 100) {
        clearInterval(id);

        setStageStatus((prev) => {
          const next = [...prev];
          next[currentStageIndex] = "complete";
          if (currentStageIndex < stages.length - 1) {
            next[currentStageIndex + 1] = "running";
          }
          return next;
        });

        if (currentStageIndex < stages.length - 1) {
          setCurrentStageIndex((prevIndex) => prevIndex + 1);
        } else {
          setIsAnimating(false);
        }
      }
    }, intervalMs);

    return () => clearInterval(id);
  }, [isAnimating, currentStageIndex]);

  const renderStageProgress = () => {
    const hasAnyProgress = isAnimating && stageStatus.some((status) => status !== "pending");

    if (!hasAnyProgress) {
      return null;
    }

    return (
      <div
        style={{
          marginTop: "1.5rem",
          padding: "1rem",
          borderRadius: "0.75rem",
          backgroundColor: "var(--card)",
          border: "1px solid var(--border)",
          boxShadow: "0 0 0 1px var(--ring)",
        }}
      >
        <div
          style={{
            fontSize: "0.9rem",
            fontWeight: 500,
            marginBottom: "0.75rem",
            color: "var(--foreground)",
          }}
        >
          Animation progress
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
          }}
        >
          {stages.map((stage, index) => {
            const status = stageStatus[index];
            const isCurrent = index === currentStageIndex;
            const progressValue =
              status === "complete"
                ? 100
                : isCurrent
                ? stageProgress
                : 0;

            const circleBackground =
              status === "complete"
                ? "var(--primary)"
                : progressValue > 0
                ? `conic-gradient(var(--primary) ${progressValue}%, var(--border) ${progressValue}% 100%)`
                : "var(--card)";

            const circleBorder =
              status === "pending" && progressValue === 0
                ? "1px solid var(--border)"
                : "none";

            return (
              <div
                key={stage.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "999px",
                    background: circleBackground,
                    border: circleBorder,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color:
                      status === "complete"
                        ? "var(--primary-foreground)"
                        : "var(--foreground)",
                    fontSize: 12,
                    fontWeight: 500,
                    transition: "background 0.2s linear",
                  }}
                >
                  {status === "complete" ? "✓" : `${Math.round(progressValue)}%`}
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    flex: 1,
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.9rem",
                      fontWeight: 500,
                      color: "var(--foreground)",
                    }}
                  >
                    {stage.name}
                  </div>
                  <div
                    style={{
                      position: "relative",
                      width: "100%",
                      height: 4,
                      borderRadius: 999,
                      backgroundColor: "var(--border)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: `${progressValue}%`,
                        backgroundColor: "var(--primary)",
                        transition: "width 0.1s linear",
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderMessage = (message) => {
    const isUser = message.role === "user";
    const messageClassName = isUser
      ? "chatBubble chatBubbleUser"
      : message.error
      ? "chatBubble chatBubbleError"
      : "chatBubble chatBubbleAssistant";

    return (
      <div key={message.id} className={messageClassName}>
        {message.text && <div className="chatMessageText">{message.text}</div>}
        {message.videoUrl && (
          <div className="videoContainer chatMessageVideo">
            <video
              className="generatedVideo"
              controls
              autoPlay
              src={message.videoUrl}
            >
              Your browser does not support the video tag.
            </video>
          </div>
        )}
      </div>
    );
  };

  const isSubmitDisabled = loading || isAnimating || !prompt.trim();

  return (
    <div className="chatPage">
      <div className="chatContainer">
        {/* If session is empty, center welcome + input vertically and horizontally */}
        {isEmptySession ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
            }}
          >
            <div style={{ width: "100%", maxWidth: 900, padding: "1rem" }}>
              {welcomeMessage && (
                <div className="welcomeMessage" style={{ textAlign: "center" }}>
                  {welcomeMessage}
                </div>
              )}

              <form
                className="chatForm"
                onSubmit={handleSubmit}
                style={{ marginTop: "1rem" }}
              >
                {renderStageProgress()}
                <div
                  className="inputWrapper"
                  style={{ display: "flex", justifyContent: "center" }}
                >
                  <div
                    style={{
                      width: "100%",
                      position: "relative",
                      backgroundColor: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "0.75rem",
                      padding: "0.5rem",
                      boxShadow: "0 0 0 1px var(--ring)",
                    }}
                  >
                    <textarea
                      ref={textareaRef}
                      className="chatInput"
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="Enter your prompt here..."
                      rows={1}
                      disabled={loading || isAnimating}
                      style={{
                        width: "100%",
                        paddingRight: 56,
                        background: "transparent",
                        border: "none",
                        resize: "none",
                        overflowY: "hidden",
                      }}
                    />

                    <button
                      type="submit"
                      aria-label="Send prompt"
                      disabled={isSubmitDisabled}
                      style={{
                        position: "absolute",
                        right: 8,
                        top: "50%",
                        transform: "translateY(-50%)",
                        border: "none",
                        backgroundColor: "var(--primary)",
                        color: "var(--primary-foreground)",
                        width: 40,
                        height: 40,
                        borderRadius: 999,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor:
                          isSubmitDisabled ? "not-allowed" : "pointer",
                        opacity: isSubmitDisabled ? 0.6 : 1,
                      }}
                    >
                      <ArrowUp size={18} />
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        ) : (
          <>
            <div className="chatMessages">
              {welcomeMessage && (
                <div className="welcomeMessage">{welcomeMessage}</div>
              )}

              {activeSession?.messages?.map(renderMessage)}

              {renderStageProgress()}

              <div ref={messagesEndRef} />
            </div>

            <form className="chatForm" onSubmit={handleSubmit}>
              <div className="inputWrapper">
                <div
                  style={{
                    width: "100%",
                    position: "relative",
                    backgroundColor: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.75rem",
                    padding: "0.5rem",
                    boxShadow: "0 0 0 1px var(--ring)",
                  }}
                >
                  <textarea
                    ref={textareaRef}
                    className="chatInput"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Enter your prompt here..."
                    rows={1}
                    disabled={loading || isAnimating}
                    style={{
                      width: "100%",
                      paddingRight: 56,
                      background: "transparent",
                      border: "none",
                      resize: "none",
                      overflowY: "hidden",
                    }}
                  />

                  <button
                    type="submit"
                    aria-label="Send prompt"
                    disabled={isSubmitDisabled}
                    style={{
                      position: "absolute",
                      right: 8,
                      top: "50%",
                      transform: "translateY(-50%)",
                      border: "none",
                      backgroundColor: "var(--primary)",
                      color: "var(--primary-foreground)",
                      width: 40,
                      height: 40,
                      borderRadius: 999,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor:
                        isSubmitDisabled ? "not-allowed" : "pointer",
                      opacity: isSubmitDisabled ? 0.6 : 1,
                    }}
                  >
                    <ArrowUp size={18} />
                  </button>
                </div>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
