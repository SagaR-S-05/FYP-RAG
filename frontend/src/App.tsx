import { useState } from 'react';
import { ChatInterface } from './components/ChatInterface';
import { VideoGallery } from './components/VideoGallery';
import { ProfilePage } from './components/ProfilePage';
import { AboutPage } from './components/AboutPage';
import { Video, MessageSquare, User, Info } from 'lucide-react';

export type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  videoUrl?: string;
  timestamp: Date;
};

export type Chat = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
};

export type GeneratedVideo = {
  id: string;
  prompt: string;
  videoUrl: string;
  chatId: string;
  createdAt: Date;
  folderId?: string;
};

export type Folder = {
  id: string;
  name: string;
  createdAt: Date;
};

export type UserProfile = {
  name: string;
  email: string;
  avatar?: string;
};

function App() {
  const [currentPage, setCurrentPage] = useState<'chat' | 'videos' | 'profile' | 'about'>('chat');
  const [chats, setChats] = useState<Chat[]>(() => {
    const saved = localStorage.getItem('chats');
    return saved ? JSON.parse(saved, (key, value) => {
      if (key === 'timestamp' || key === 'createdAt' || key === 'updatedAt') {
        return new Date(value);
      }
      return value;
    }) : [];
  });
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [folders, setFolders] = useState<Folder[]>(() => {
    const saved = localStorage.getItem('folders');
    return saved ? JSON.parse(saved, (key, value) => {
      if (key === 'createdAt') {
        return new Date(value);
      }
      return value;
    }) : [{ id: 'recents', name: 'Recents', createdAt: new Date() }];
  });
  const [videoFolders, setVideoFolders] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem('videoFolders');
    return saved ? JSON.parse(saved) : {};
  });
  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('userProfile');
    return saved ? JSON.parse(saved) : {
      name: 'User',
      email: 'user@example.com',
    };
  });

  const saveChats = (updatedChats: Chat[]) => {
    setChats(updatedChats);
    localStorage.setItem('chats', JSON.stringify(updatedChats));
    
    // Apply FIFO to Recents folder
    const recentsVideos = allVideos.filter(v => v.folderId === 'recents');
    if (recentsVideos.length > 10) {
      // Sort by creation date and keep only the 10 most recent
      const sortedRecents = recentsVideos.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const videosToRemove = sortedRecents.slice(10);
      
      const updatedVideoFolders = { ...videoFolders };
      videosToRemove.forEach(video => {
        delete updatedVideoFolders[video.id];
      });
      
      setVideoFolders(updatedVideoFolders);
      localStorage.setItem('videoFolders', JSON.stringify(updatedVideoFolders));
    }
  };

  const saveFolders = (updatedFolders: Folder[]) => {
    setFolders(updatedFolders);
    localStorage.setItem('folders', JSON.stringify(updatedFolders));
  };

  const saveVideoFolders = (updatedVideoFolders: Record<string, string>) => {
    setVideoFolders(updatedVideoFolders);
    localStorage.setItem('videoFolders', JSON.stringify(updatedVideoFolders));
  };

  const saveUserProfile = (updatedProfile: UserProfile) => {
    setUserProfile(updatedProfile);
    localStorage.setItem('userProfile', JSON.stringify(updatedProfile));
  };

  const allVideos: GeneratedVideo[] = chats.flatMap(chat =>
    chat.messages
      .filter(msg => msg.role === 'assistant' && msg.videoUrl)
      .map(msg => {
        const userMessage = chat.messages
          .slice(0, chat.messages.indexOf(msg))
          .reverse()
          .find(m => m.role === 'user');
        
        return {
          id: msg.id,
          prompt: userMessage?.content || 'Untitled',
          videoUrl: msg.videoUrl!,
          chatId: chat.id,
          createdAt: msg.timestamp,
          folderId: videoFolders[msg.id] || 'recents',
        };
      })
  );

  return (
    <div className="flex h-screen bg-[#FAF8F4]">
      {/* Navigation Sidebar */}
      <div className="w-16 bg-[#546F54] flex flex-col items-center py-4 gap-4">
        <button
          onClick={() => setCurrentPage('chat')}
          className={`p-3 rounded-lg transition-colors ${
            currentPage === 'chat'
              ? 'bg-[#799A78] text-[#F7F8F7]'
              : 'text-[#C7D6C1] hover:text-[#F7F8F7] hover:bg-[#6B5F53]/30'
          }`}
          title="Chat"
        >
          <MessageSquare className="w-6 h-6" />
        </button>
        <button
          onClick={() => setCurrentPage('videos')}
          className={`p-3 rounded-lg transition-colors ${
            currentPage === 'videos'
              ? 'bg-[#799A78] text-[#F7F8F7]'
              : 'text-[#C7D6C1] hover:text-[#F7F8F7] hover:bg-[#6B5F53]/30'
          }`}
          title="Videos"
        >
          <Video className="w-6 h-6" />
        </button>
        <button
          onClick={() => setCurrentPage('about')}
          className={`p-3 rounded-lg transition-colors ${
            currentPage === 'about'
              ? 'bg-[#799A78] text-[#F7F8F7]'
              : 'text-[#C7D6C1] hover:text-[#F7F8F7] hover:bg-[#6B5F53]/30'
          }`}
          title="About"
        >
          <Info className="w-6 h-6" />
        </button>
        <div className="flex-1" />
        <button
          onClick={() => setCurrentPage('profile')}
          className={`p-3 rounded-lg transition-colors ${
            currentPage === 'profile'
              ? 'bg-[#799A78] text-[#F7F8F7]'
              : 'text-[#C7D6C1] hover:text-[#F7F8F7] hover:bg-[#6B5F53]/30'
          }`}
          title="Profile"
        >
          <User className="w-6 h-6" />
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex">
        {currentPage === 'chat' && (
          <ChatInterface
            chats={chats}
            currentChatId={currentChatId}
            setCurrentChatId={setCurrentChatId}
            saveChats={saveChats}
          />
        )}
        {currentPage === 'videos' && (
          <VideoGallery
            videos={allVideos}
            chats={chats}
            folders={folders}
            saveFolders={saveFolders}
            videoFolders={videoFolders}
            saveVideoFolders={saveVideoFolders}
          />
        )}
        {currentPage === 'profile' && (
          <ProfilePage
            userProfile={userProfile}
            saveUserProfile={saveUserProfile}
          />
        )}
        {currentPage === 'about' && <AboutPage />}
      </div>
    </div>
  );
}

export default App;
