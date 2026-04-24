// import { useSessions } from "../sessionContext.jsx";

// export default function VideoGallery() {
//   const { sessions } = useSessions();

//   const gallerySessions = [...sessions]
//     .filter((session) => session.videos.length > 0)
//     .sort((a, b) => b.createdAt - a.createdAt)
//     .slice(0, 3);

//   if (gallerySessions.length === 0) {
//     return (
//       <div className="videoGalleryPage">
//         <h1 className="pageTitle">Video Gallery</h1>
//         <p className="mutedText">No videos have been generated yet.</p>
//       </div>
//     );
//   }

//   return (
//     <div className="videoGalleryPage">
//       <h1 className="pageTitle">Video Gallery</h1>

//       <div className="sessionList">
//         {gallerySessions.map((session) => {
//           const created = new Date(session.createdAt);
//           const label = created.toLocaleString();

//           return (
//             <section key={session.id} className="sessionCard">
//               <header className="sessionHeader">
//                 <div className="sessionTitle">Session {session.id}</div>
//                 <div className="sessionMeta">{label}</div>
//               </header>

//               <div className="sessionVideos">
//                 {session.videos.map((url, index) => (
//                   <div key={`${session.id}-video-${index}`} className="sessionVideo">
//                     <video className="sessionVideoPlayer" src={url} controls />
//                     <div className="sessionVideoFooter">
//                       <span className="sessionVideoLabel">Video {index + 1}</span>
//                       <a
//                         className="downloadButton"
//                         href={url}
//                         download
//                       >
//                         Download
//                       </a>
//                     </div>
//                   </div>
//                 ))}
//               </div>
//             </section>
//           );
//         })}
//       </div>
//     </div>
//   );
// }
import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

const BACKEND_BASE_URL = "http://localhost:8005";

export default function VideoGallery() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }

    async function fetchVideos() {
      try {
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
          .order("created_at", { ascending: false });

        if (error) {
          console.error("Error fetching videos:", error);
          return;
        }

        setVideos(data || []);
      } catch (err) {
        console.error("Unexpected error:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchVideos();
  }, []);

  if (!isSupabaseConfigured) {
    return (
      <div className="videoGalleryPage">
        <h1 className="pageTitle">Video Gallery</h1>
        <p className="mutedText">
          Supabase is not configured for the frontend yet. Add
          `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to
          `frontend-1/.env`.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="videoGalleryPage">
        <h1 className="pageTitle">Video Gallery</h1>
        <p className="mutedText">Loading videos...</p>
      </div>
    );
  }

  if (!videos.length) {
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
        {videos.map((video, index) => {
          const created = new Date(video.created_at);
          const label = created.toLocaleString();

          const videoSrc = `${BACKEND_BASE_URL}${video.video_url}`;
          const promptText = video.prompts?.prompt_text || "Prompt unavailable";

          return (
            <section key={video.id} className="sessionCard">
              <header className="sessionHeader">
                <div className="sessionTitle">
                  Prompt {video.prompt_id}
                </div>
                <div className="sessionMeta">{label}</div>
              </header>

              <div className="sessionPrompt">
                {promptText}
              </div>

              <div className="sessionVideos">
                <div className="sessionVideo">
                  <video
                    className="sessionVideoPlayer"
                    src={videoSrc}
                    controls
                  />

                  <div className="sessionVideoFooter">
                    <span className="sessionVideoLabel">
                      Video {index + 1}
                    </span>

                    <a
                      className="downloadButton"
                      href={videoSrc}
                      download
                    >
                      Download
                    </a>
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
