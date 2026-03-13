import { useState } from 'react';
import { Download, Calendar, MessageSquare, Folder as FolderIcon, Plus, Edit2, Check, X, MoreVertical, FolderPlus, Timer, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from './ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import type { GeneratedVideo, Chat, Folder } from '../App';

type VideoGalleryProps = {
  videos: GeneratedVideo[];
  chats: Chat[];
  folders: Folder[];
  saveFolders: (folders: Folder[]) => void;
  videoFolders: Record<string, string>;
  saveVideoFolders: (videoFolders: Record<string, string>) => void;
};

export function VideoGallery({
  videos,
  chats,
  folders,
  saveFolders,
  videoFolders,
  saveVideoFolders,
}: VideoGalleryProps) {
  const [selectedFolder, setSelectedFolder] = useState<string>('recents');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [selectedVideo, setSelectedVideo] = useState<GeneratedVideo | null>(null);
  const [moveVideoDialogOpen, setMoveVideoDialogOpen] = useState(false);
  const [deleteVideoId, setDeleteVideoId] = useState<string | null>(null);
  const [folderLimitError, setFolderLimitError] = useState<string | null>(null);

  const MAX_VIDEOS_PER_FOLDER = 5;
  const MAX_VIDEOS_IN_RECENTS = 10;

  const filteredVideos = videos.filter(video => video.folderId === selectedFolder);

  const handleDownload = async (videoUrl: string, prompt: string) => {
    try {
      const response = await fetch(videoUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${prompt.slice(0, 30).replace(/[^a-z0-9]/gi, '_')}.mp4`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading video:', error);
    }
  };

  const getChatTitle = (chatId: string) => {
    return chats.find(chat => chat.id === chatId)?.title || 'Unknown Chat';
  };

  const createFolder = () => {
    if (!newFolderName.trim()) return;
    
    const newFolder: Folder = {
      id: `folder-${Date.now()}`,
      name: newFolderName,
      createdAt: new Date(),
    };
    
    saveFolders([...folders, newFolder]);
    setNewFolderName('');
    setIsCreatingFolder(false);
  };

  const renameFolder = (folderId: string) => {
    if (!editingFolderName.trim() || folderId === 'recents') return;
    
    const updatedFolders = folders.map(folder =>
      folder.id === folderId ? { ...folder, name: editingFolderName } : folder
    );
    
    saveFolders(updatedFolders);
    setEditingFolderId(null);
    setEditingFolderName('');
  };

  const deleteFolder = (folderId: string) => {
    if (folderId === 'recents') return;
    
    // Move all videos from this folder to recents
    const updatedVideoFolders = { ...videoFolders };
    Object.keys(updatedVideoFolders).forEach(videoId => {
      if (updatedVideoFolders[videoId] === folderId) {
        updatedVideoFolders[videoId] = 'recents';
      }
    });
    saveVideoFolders(updatedVideoFolders);
    
    // Remove folder
    const updatedFolders = folders.filter(folder => folder.id !== folderId);
    saveFolders(updatedFolders);
    
    if (selectedFolder === folderId) {
      setSelectedFolder('recents');
    }
  };

  const moveVideoToFolder = (videoId: string, targetFolderId: string) => {
    const targetFolderVideos = videos.filter(v => v.folderId === targetFolderId);
    const maxLimit = targetFolderId === 'recents' ? MAX_VIDEOS_IN_RECENTS : MAX_VIDEOS_PER_FOLDER;
    
    if (targetFolderVideos.length >= maxLimit && videoFolders[videoId] !== targetFolderId) {
      setFolderLimitError(
        targetFolderId === 'recents' 
          ? `Recents folder is full (max ${MAX_VIDEOS_IN_RECENTS} videos)`
          : `This folder is full (max ${MAX_VIDEOS_PER_FOLDER} videos)`
      );
      setTimeout(() => setFolderLimitError(null), 3000);
      return;
    }

    const updatedVideoFolders = {
      ...videoFolders,
      [videoId]: targetFolderId,
    };
    saveVideoFolders(updatedVideoFolders);
    setMoveVideoDialogOpen(false);
    setSelectedVideo(null);
  };

  const deleteVideo = (videoId: string) => {
    const updatedVideoFolders = { ...videoFolders };
    delete updatedVideoFolders[videoId];
    saveVideoFolders(updatedVideoFolders);
    setDeleteVideoId(null);
  };

  return (
    <>
      {/* Folder Sidebar */}
      <div className="w-64 bg-[#E8F0E6] border-r border-[#D5CBBE] flex flex-col">
        <div className="p-4 border-b border-[#D5CBBE]">
          <h2 className="mb-3 text-[#2F342E]">Folders</h2>
          <Button
            onClick={() => setIsCreatingFolder(true)}
            variant="outline"
            className="w-full"
            size="sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Folder
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {folders.map(folder => (
            <div
              key={folder.id}
              className={`group flex items-center gap-2 p-3 rounded-lg mb-1 transition-colors ${
                selectedFolder === folder.id
                  ? 'bg-[#C7D6C1] text-[#2F342E]'
                  : 'hover:bg-[#C7D6C1]/50'
              }`}
            >
              {editingFolderId === folder.id ? (
                <div className="flex-1 flex items-center gap-2">
                  <Input
                    value={editingFolderName}
                    onChange={e => setEditingFolderName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') renameFolder(folder.id);
                      if (e.key === 'Escape') {
                        setEditingFolderId(null);
                        setEditingFolderName('');
                      }
                    }}
                    className="h-7"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => renameFolder(folder.id)}
                    className="h-7 w-7 p-0"
                  >
                    <Check className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingFolderId(null);
                      setEditingFolderName('');
                    }}
                    className="h-7 w-7 p-0"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => setSelectedFolder(folder.id)}
                    className="flex-1 flex items-center gap-2 text-left"
                  >
                    {folder.id === 'recents' ? (
                      <Timer className="w-4 h-4" />
                    ) : (
                      <FolderIcon className="w-4 h-4" />
                    )}
                    <span className="truncate">{folder.name}</span>
                    <span className="text-xs text-[#5A625A] ml-auto">
                      {videos.filter(v => v.folderId === folder.id).length}/
                      {folder.id === 'recents' ? MAX_VIDEOS_IN_RECENTS : MAX_VIDEOS_PER_FOLDER}
                    </span>
                  </button>
                  {folder.id !== 'recents' && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setEditingFolderId(folder.id);
                            setEditingFolderName(folder.name);
                          }}
                        >
                          <Edit2 className="w-4 h-4 mr-2" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => deleteFolder(folder.id)}
                          className="text-[#C67A5A]"
                        >
                          <X className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </>
              )}
            </div>
          ))}

          {isCreatingFolder && (
            <div className="p-3 bg-white border border-[#D5CBBE] rounded-lg mb-1">
              <div className="flex items-center gap-2">
                <Input
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') createFolder();
                    if (e.key === 'Escape') {
                      setIsCreatingFolder(false);
                      setNewFolderName('');
                    }
                  }}
                  placeholder="Folder name"
                  className="h-7"
                  autoFocus
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={createFolder}
                  className="h-7 w-7 p-0"
                >
                  <Check className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setIsCreatingFolder(false);
                    setNewFolderName('');
                  }}
                  className="h-7 w-7 p-0"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Video Grid */}
      <div className="flex-1 flex flex-col bg-[#FAF8F4]">
        <div className="border-b border-[#D5CBBE] bg-white p-6">
          <div className="max-w-7xl mx-auto">
            <h1 className="text-3xl text-[#2F342E]">
              {folders.find(f => f.id === selectedFolder)?.name || 'Videos'}
            </h1>
            <p className="text-[#5A625A] mt-1">
              {filteredVideos.length} {filteredVideos.length === 1 ? 'video' : 'videos'}
              {' '}/ {selectedFolder === 'recents' ? MAX_VIDEOS_IN_RECENTS : MAX_VIDEOS_PER_FOLDER} max
            </p>
            {folderLimitError && (
              <div className="mt-3 p-3 bg-[#E8C7C7] border border-[#C67A5A] rounded-lg text-[#C67A5A] text-sm">
                {folderLimitError}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto">
            {filteredVideos.length === 0 ? (
              <div className="text-center py-12">
                <FolderIcon className="w-16 h-16 mx-auto mb-4 text-[#AABCA3]" />
                <h2 className="text-2xl mb-2 text-[#2F342E]">No Videos in This Folder</h2>
                <p className="text-[#5A625A]">Videos you generate will appear here</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredVideos.map(video => (
                  <div
                    key={video.id}
                    className="bg-white rounded-xl overflow-hidden border border-[#D5CBBE] shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="aspect-video bg-[#2F342E]">
                      <video
                        src={video.videoUrl}
                        controls
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="p-4">
                      <h3 className="mb-2 line-clamp-2 text-[#2F342E]">{video.prompt}</h3>
                      <div className="flex items-center gap-2 text-sm text-[#5A625A] mb-3">
                        <Calendar className="w-4 h-4" />
                        <span>
                          {video.createdAt.toLocaleDateString()}
                        </span>
                      </div>
                      <div className="text-xs text-[#5A625A] mb-3 flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" />
                        From: {getChatTitle(video.chatId)}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => handleDownload(video.videoUrl, video.prompt)}
                          variant="outline"
                          className="flex-1"
                          size="sm"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download
                        </Button>
                        <Button
                          onClick={() => {
                            setSelectedVideo(video);
                            setMoveVideoDialogOpen(true);
                          }}
                          variant="outline"
                          size="sm"
                        >
                          <FolderPlus className="w-4 h-4" />
                        </Button>
                        <Button
                          onClick={() => setDeleteVideoId(video.id)}
                          variant="outline"
                          size="sm"
                        >
                          <Trash2 className="w-4 h-4 text-[#C67A5A]" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Move Video Dialog */}
      <Dialog open={moveVideoDialogOpen} onOpenChange={setMoveVideoDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move to Folder</DialogTitle>
            <DialogDescription>
              Select a folder to move this video. Folders have a maximum capacity.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            {folders.map(folder => {
              const folderVideoCount = videos.filter(v => v.folderId === folder.id).length;
              const maxLimit = folder.id === 'recents' ? MAX_VIDEOS_IN_RECENTS : MAX_VIDEOS_PER_FOLDER;
              const isFull = folderVideoCount >= maxLimit && selectedVideo?.folderId !== folder.id;
              
              return (
                <button
                  key={folder.id}
                  onClick={() => !isFull && selectedVideo && moveVideoToFolder(selectedVideo.id, folder.id)}
                  disabled={isFull}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                    selectedVideo?.folderId === folder.id
                      ? 'border-[#546F54] bg-[#E8F0E6]'
                      : isFull
                      ? 'border-[#D5CBBE] bg-[#EAE3D6] opacity-50 cursor-not-allowed'
                      : 'border-[#D5CBBE] hover:bg-[#E8F0E6]'
                  }`}
                >
                  {folder.id === 'recents' ? (
                    <Timer className="w-5 h-5" />
                  ) : (
                    <FolderIcon className="w-5 h-5" />
                  )}
                  <span className="flex-1 text-left">{folder.name}</span>
                  <span className="text-sm text-[#5A625A]">
                    {folderVideoCount}/{maxLimit}
                  </span>
                  {isFull && (
                    <span className="text-xs text-[#C67A5A]">Full</span>
                  )}
                </button>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveVideoDialogOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteVideoId} onOpenChange={() => setDeleteVideoId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Video</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this video? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteVideoId && deleteVideo(deleteVideoId)}
              className="bg-[#C67A5A] hover:bg-[#C67A5A]/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
