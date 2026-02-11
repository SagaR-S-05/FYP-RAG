import { useState } from "react";
import { useSessions } from "../sessionContext.jsx";

export default function Chat() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { activeSession, addMessageToActiveSession } = useSessions();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedText = text.trim();
    if (!trimmedText || !activeSession) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: trimmedText }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Request failed" }));
        throw new Error(errorData.detail || `HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.video_url) {
        addMessageToActiveSession({ text: trimmedText, videoUrl: data.video_url });
      } else {
        throw new Error("No video_url in response");
      }

      setText("");
    } catch (err) {
      setError(err.message || "Failed to generate video");
    } finally {
      setLoading(false);
    }
  };

  const videos = activeSession?.videos ?? [];
  const welcomeMessage = activeSession?.welcomeMessage;

  return (
    <div className="chatPage">
      <div className="chatContainer">
        <div className="chatMessages">
          {welcomeMessage && (
            <div className="welcomeMessage">
              {welcomeMessage}
            </div>
          )}

          {videos.length > 0 && (
            <div className="videoList">
              {videos.map((url, index) => (
                <div key={`${activeSession.id}-video-${index}`} className="videoContainer">
                  <video
                    className="generatedVideo"
                    src={url}
                    controls
                    autoPlay={index === videos.length - 1}
                  >
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
            <textarea
              className="chatInput"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter your prompt here..."
              rows={3}
              disabled={loading}
            />
            <button
              type="submit"
              className="submitButton"
              disabled={loading || !text.trim()}
            >
              {loading ? "Generating..." : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
