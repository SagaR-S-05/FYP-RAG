import { useState } from "react";

export default function Chat() {
  const [text, setText] = useState("");
  const [videoUrl, setVideoUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedText = text.trim();
    if (!trimmedText) return;

    setLoading(true);
    setError(null);
    setVideoUrl(null);

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
        setVideoUrl(data.video_url);
      } else {
        throw new Error("No video_url in response");
      }
    } catch (err) {
      setError(err.message || "Failed to generate video");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chatPage">
      <div className="chatContainer">
        <div className="chatMessages">
          {videoUrl && (
            <div className="videoContainer">
              <video
                className="generatedVideo"
                src={videoUrl}
                controls
                autoPlay
              >
                Your browser does not support the video tag.
              </video>
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
