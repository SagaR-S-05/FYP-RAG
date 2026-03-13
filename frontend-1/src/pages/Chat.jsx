import { useState, useRef, useEffect } from "react";
import { ArrowUp } from "lucide-react";
import { useSessions } from "../sessionContext.jsx";

const FALLBACK_VIDEO_URL =
  "D:\\Final Year Project - RAG\\FYP-RAG\\rendered_videos\\8c705372-5401-4cfa-ab1b-415c06d09081";

const stages = [
  { name: "Analyzing Prompt", duration: 5000 },
  { name: "Generating Code", duration: 8000 },
  { name: "Code Ready", duration: 4000 },
  { name: "Rendering Frames", duration: 20000 },
  { name: "Finalizing Video", duration: 8000 },
  { name: "Complete", duration: 0 },
];

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

  // Determine if the current session has zero messages
  const isEmptySession =
    !!activeSession &&
    (!activeSession.messages || activeSession.messages.length === 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const userPrompt = prompt.trim();
    if (!userPrompt || !activeSession) return;

    setLoading(true);
    setError(null);
    setIsAnimating(true);
    setCurrentStageIndex(0);
    setStageProgress(0);
    setStageStatus(stages.map((_, index) => (index === 0 ? "running" : "pending")));

    let finalVideoUrl = null;
    let messageText = userPrompt;

    try {
      // Try API
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt: userPrompt }),
      });

      let data = null;
      try {
        data = await response.json();
      } catch (e) {
        // JSON parse failed - will use fallback
      }

      // Check for success
      if (response.ok && data?.videoUrl) {
        finalVideoUrl = data.videoUrl;
      } else {
        // API failed or no video_url - use fallback
        finalVideoUrl = FALLBACK_VIDEO_URL;
        messageText = "Fallback Video (API unavailable)";
      }
    } catch (err) {
      // Network error or other exception - use fallback immediately
      console.error("API error:", err.message);
      finalVideoUrl = FALLBACK_VIDEO_URL;
      messageText = "Fallback Video (API unavailable)";
    }

    // Always render video
    const cacheBustedUrl = `${finalVideoUrl}?t=${Date.now()}`;
    addMessageToActiveSession({ text: messageText, videoUrl: cacheBustedUrl });

    setPrompt("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.overflowY = "hidden";
    }

    setLoading(false);
  };

  const videos = activeSession?.videos ?? [];
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
    const hasAnyProgress = stageStatus.some((status) => status !== "pending");

    if (!isAnimating && !hasAnyProgress) {
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

              {videos.length > 0 && (
                <div className="videoList">
                  {videos.map((url, index) => (
                    <div
                      key={`${activeSession.id}-video-${index}`}
                      className="videoContainer"
                    >
                      <video
                        key={url}
                        className="generatedVideo"
                        controls
                        autoPlay={index === videos.length - 1}
                      >
                        <source src={url} type="video/mp4" />
                        Your browser does not support the video tag.
                      </video>
                    </div>
                  ))}
                </div>
              )}

              {error && (
                <div className="errorMessage" role="alert">
                  {error}
                </div>
              )}
            </div>

            <form className="chatForm" onSubmit={handleSubmit}>
              {renderStageProgress()}
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
