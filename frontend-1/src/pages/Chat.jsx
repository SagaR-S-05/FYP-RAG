import { useState, useRef, useEffect } from "react";
import { ArrowUp } from "lucide-react";
import { useSessions } from "../sessionContext.jsx";

const FALLBACK_VIDEO_URL =
  "D:\\Final Year Project - RAG\\FYP-RAG\\rendered_videos\\8c705372-5401-4cfa-ab1b-415c06d09081";

export default function Chat() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
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
                      disabled={loading}
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
                      disabled={loading || !prompt.trim()}
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
                          loading || !prompt.trim() ? "not-allowed" : "pointer",
                        opacity: loading || !prompt.trim() ? 0.6 : 1,
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
                    disabled={loading}
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
                    disabled={loading || !prompt.trim()}
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
                        loading || !prompt.trim() ? "not-allowed" : "pointer",
                      opacity: loading || !prompt.trim() ? 0.6 : 1,
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
