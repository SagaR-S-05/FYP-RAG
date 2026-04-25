import { useEffect, useMemo, useState } from "react";
import { FolderPlus, Pencil, Trash2 } from "lucide-react";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

function buildApiUrl(path) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (API_BASE_URL) {
    return `${API_BASE_URL}${normalizedPath}`;
  }
  return `/api${normalizedPath}`;
}

function resolveVideoUrl(videoUrl) {
  if (!videoUrl) return "";
  if (/^https?:\/\//i.test(videoUrl)) return videoUrl;
  if (API_BASE_URL) return `${API_BASE_URL}${videoUrl}`;
  return videoUrl;
}

function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function VideoGallery() {
  const [folders, setFolders] = useState(["Unsorted"]);
  const [videos, setVideos] = useState([]);
  const [activeFolder, setActiveFolder] = useState("All");
  const [newFolderName, setNewFolderName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const folderOptions = useMemo(() => ["All", ...folders], [folders]);
  const visibleVideos = useMemo(() => {
    if (activeFolder === "All") return videos;
    return videos.filter((video) => video.folder === activeFolder);
  }, [activeFolder, videos]);

  async function loadGallery() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(buildApiUrl("/gallery"));
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.detail || "Unable to load gallery.");
      }
      setFolders(data.folders || ["Unsorted"]);
      setVideos(data.videos || []);
      if (activeFolder !== "All" && !data.folders?.includes(activeFolder)) {
        setActiveFolder("All");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load gallery.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadGallery();
  }, []);

  async function mutateGallery(path, options = {}) {
    setError(null);
    const response = await fetch(buildApiUrl(path), {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.detail || "Gallery update failed.");
    }
    setFolders(data.folders || ["Unsorted"]);
    setVideos(data.videos || []);
  }

  async function handleCreateFolder(e) {
    e.preventDefault();
    const name = newFolderName.trim();
    if (!name) return;
    try {
      await mutateGallery("/gallery/folders", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setActiveFolder(name);
      setNewFolderName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create folder.");
    }
  }

  async function handleRename(video) {
    const name = editingName.trim();
    if (!name) return;
    try {
      await mutateGallery(`/gallery/videos/${encodeURIComponent(video.id)}/rename`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      setEditingId(null);
      setEditingName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename video.");
    }
  }

  async function handleMove(video, folder) {
    try {
      await mutateGallery(`/gallery/videos/${encodeURIComponent(video.id)}/move`, {
        method: "PATCH",
        body: JSON.stringify({ folder }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not move video.");
    }
  }

  async function handleDelete(video) {
    const ok = window.confirm(`Delete "${video.name}" permanently?`);
    if (!ok) return;
    try {
      await mutateGallery(`/gallery/videos/${encodeURIComponent(video.id)}`, {
        method: "DELETE",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete video.");
    }
  }

  return (
    <div className="videoGalleryPage">
      <div className="galleryHeader">
        <div>
          <h1 className="pageTitle">Video Gallery</h1>
          <p className="mutedText">Organize rendered videos into folders.</p>
        </div>

        <form className="galleryFolderForm" onSubmit={handleCreateFolder}>
          <input
            className="galleryInput"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="New folder"
          />
          <button className="iconTextButton" type="submit" aria-label="Create folder">
            <FolderPlus size={18} />
            Create
          </button>
        </form>
      </div>

      {error && <div className="errorMessage">{error}</div>}

      <div className="galleryLayout">
        <aside className="galleryFolders">
          {folderOptions.map((folder) => (
            <button
              key={folder}
              type="button"
              className={`galleryFolderButton ${folder === activeFolder ? "galleryFolderButtonActive" : ""}`}
              onClick={() => setActiveFolder(folder)}
            >
              {folder}
            </button>
          ))}
        </aside>

        <section className="galleryContent">
          {loading ? (
            <p className="mutedText">Loading videos...</p>
          ) : visibleVideos.length === 0 ? (
            <p className="mutedText">No videos in this folder yet.</p>
          ) : (
            <div className="galleryGrid">
              {visibleVideos.map((video) => {
                const isEditing = editingId === video.id;
                const videoSrc = resolveVideoUrl(video.video_url);
                const created = new Date(video.created_at * 1000).toLocaleString();

                return (
                  <article key={video.id} className="galleryVideoCard">
                    <video className="sessionVideoPlayer" src={videoSrc} controls />

                    <div className="galleryVideoBody">
                      {isEditing ? (
                        <form
                          className="galleryRenameForm"
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleRename(video);
                          }}
                        >
                          <input
                            className="galleryInput"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            autoFocus
                          />
                          <button className="downloadButton" type="submit">
                            Save
                          </button>
                        </form>
                      ) : (
                        <div className="galleryVideoTitle">{video.name}</div>
                      )}

                      <div className="sessionMeta">
                        {video.folder} - {formatSize(video.size)} - {created}
                      </div>

                      <div className="galleryActions">
                        <select
                          className="gallerySelect"
                          value={video.folder}
                          onChange={(e) => handleMove(video, e.target.value)}
                          aria-label="Move video to folder"
                        >
                          {folders.map((folder) => (
                            <option key={folder} value={folder}>
                              {folder}
                            </option>
                          ))}
                        </select>

                        <button
                          className="iconButton"
                          type="button"
                          title="Rename"
                          aria-label="Rename video"
                          onClick={() => {
                            setEditingId(video.id);
                            setEditingName(video.name);
                          }}
                        >
                          <Pencil size={17} />
                        </button>

                        <button
                          className="iconButton iconButtonDanger"
                          type="button"
                          title="Delete"
                          aria-label="Delete video"
                          onClick={() => handleDelete(video)}
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
