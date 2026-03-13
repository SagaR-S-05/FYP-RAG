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
import { supabase } from "../supabaseClient"; // adjust path if different

export default function VideoGallery() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchVideos() {
      try {
        const { data, error } = await supabase
          .from("videos")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) {
          console.error("Error fetching videos:", error);
          return;
        }

        setVideos(data || []);
      } catch (err) {
        console.error("Unexpected error fetching videos:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchVideos();
  }, []);

  if (loading) {
    return (
      <div className="videoGalleryPage">
        <h1 className="pageTitle">Video Gallery</h1>
        <p className="mutedText">Loading videos...</p>
      </div>
    );
  }

  if (!videos || videos.length === 0) {
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

          return (
            <section key={video.id} className="sessionCard">
              <header className="sessionHeader">
                <div className="sessionTitle">Video {index + 1}</div>
                <div className="sessionMeta">{label}</div>
              </header>

              <div className="sessionVideos">
                <div className="sessionVideo">
                  <video
                    className="sessionVideoPlayer"
                    src={video.video_url}
                    controls
                  />

                  <div className="sessionVideoFooter">
                    <span className="sessionVideoLabel">
                      Prompt ID: {video.prompt_id}
                    </span>

                    <a
                      className="downloadButton"
                      href={video.video_url}
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