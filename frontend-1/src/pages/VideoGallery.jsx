import { useSessions } from "../sessionContext.jsx";

export default function VideoGallery() {
  const { sessions } = useSessions();

  const gallerySessions = [...sessions]
    .filter((session) => session.videos.length > 0)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 3);

  if (gallerySessions.length === 0) {
    return (
      <div className="videoGalleryPage">
        <h1 className="pageTitle">Video Gallery</h1>
        <p className="mutedText">No videos have been generated yet.</p>
      </div>
    );
  }

  return (
    <div className="videoGalleryPage">
      <h1 className="pageTitle">Video Gallery</h1>

      <div className="sessionList">
        {gallerySessions.map((session) => {
          const created = new Date(session.createdAt);
          const label = created.toLocaleString();

          return (
            <section key={session.id} className="sessionCard">
              <header className="sessionHeader">
                <div className="sessionTitle">Session {session.id}</div>
                <div className="sessionMeta">{label}</div>
              </header>

              <div className="sessionVideos">
                {session.videos.map((url, index) => (
                  <div key={`${session.id}-video-${index}`} className="sessionVideo">
                    <video className="sessionVideoPlayer" src={url} controls />
                    <div className="sessionVideoFooter">
                      <span className="sessionVideoLabel">Video {index + 1}</span>
                      <a
                        className="downloadButton"
                        href={url}
                        download
                      >
                        Download
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

