import { useState, useRef, useEffect } from "react";
import { Plus, Send, MessageSquare, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import type { Chat, Message } from "../App";

type ChatInterfaceProps = {
  chats: Chat[];
  currentChatId: string | null;
  setCurrentChatId: (id: string | null) => void;
  saveChats: (chats: Chat[]) => void;
};

export function ChatInterface({
  chats,
  currentChatId,
  setCurrentChatId,
  saveChats,
}: ChatInterfaceProps) {
  const [inputValue, setInputValue] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [deleteChatId, setDeleteChatId] = useState<string | null>(null);

  const currentChat = chats.find((chat) => chat.id === currentChatId);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentChat?.messages]);

  const createNewChat = () => {
    const newChat: Chat = {
      id: Date.now().toString(),
      title: "New Chat",
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const updatedChats = [newChat, ...chats];
    saveChats(updatedChats);
    setCurrentChatId(newChat.id);
  };

  const generateVideo = async (prompt: string): Promise<string> => {
    // Simulate video generation delay
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Return a mock video URL (using a sample video from a CDN)
    // In a real app, this would be an actual video generation API
    return "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isGenerating) return;

    let chatToUpdate = currentChat;
    let updatedChats = [...chats];

    // Create new chat if none exists
    if (!chatToUpdate) {
      const newChat: Chat = {
        id: Date.now().toString(),
        title: inputValue.slice(0, 50),
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      updatedChats = [newChat, ...chats];
      chatToUpdate = newChat;
      setCurrentChatId(newChat.id);
    }

    // Add user message
    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: inputValue,
      timestamp: new Date(),
    };

    const updatedMessages = [...chatToUpdate.messages, userMessage];
    chatToUpdate = {
      ...chatToUpdate,
      messages: updatedMessages,
      updatedAt: new Date(),
      title:
        chatToUpdate.messages.length === 0
          ? inputValue.slice(0, 50)
          : chatToUpdate.title,
    };

    updatedChats = updatedChats.map((chat) =>
      chat.id === chatToUpdate!.id ? chatToUpdate! : chat,
    );
    saveChats(updatedChats);
    setInputValue("");
    setIsGenerating(true);

    try {
      // Generate video
      const videoUrl = await generateVideo(inputValue);

      // Add assistant message with video
      const assistantMessage: Message = {
        id: `msg-${Date.now()}`,
        role: "assistant",
        content: `Generated video for: "${inputValue}"`,
        videoUrl,
        timestamp: new Date(),
      };

      const finalMessages = [...updatedMessages, assistantMessage];
      chatToUpdate = {
        ...chatToUpdate,
        messages: finalMessages,
        updatedAt: new Date(),
      };

      updatedChats = updatedChats.map((chat) =>
        chat.id === chatToUpdate!.id ? chatToUpdate! : chat,
      );
      saveChats(updatedChats);
    } catch (error) {
      console.error("Error generating video:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const deleteChat = (id: string) => {
    const updatedChats = chats.filter((chat) => chat.id !== id);
    saveChats(updatedChats);
    if (currentChatId === id) {
      setCurrentChatId(null);
    }
  };

  return (
    <>
      {/* Sidebar */}
      <div className="w-64 bg-[#E8F0E6] text-[#2F342E] flex flex-col border-r border-[#D5CBBE]">
        <div className="p-4">
          <Button
            onClick={createNewChat}
            className="w-full bg-[#546F54] text-[#F7F8F7] hover:bg-[#799A78]"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Chat
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-2">
          {chats.map((chat) => (
            <div
              key={chat.id}
              className={`group flex items-center gap-2 mb-1 rounded-lg transition-colors ${
                currentChatId === chat.id
                  ? "bg-[#C7D6C1]"
                  : "hover:bg-[#C7D6C1]/50"
              }`}
            >
              <button
                onClick={() => setCurrentChatId(chat.id)}
                className="flex-1 text-left p-3 min-w-0"
              >
                <div className="truncate">{chat.title}</div>
                <div className="text-xs text-[#5A625A] mt-1">
                  {chat.messages.length} messages
                </div>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteChatId(chat.id);
                }}
                className="p-2 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-[#E8C7C7] transition-opacity mr-2"
              >
                <Trash2 className="w-4 h-4 text-[#C67A5A]" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col bg-[#FAF8F4]">
        {currentChat ? (
          <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-3xl mx-auto space-y-6">
                {currentChat.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${
                      message.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl p-4 ${
                        message.role === "user"
                          ? "bg-[#546F54] text-[#F7F8F7]"
                          : "bg-white border border-[#D5CBBE]"
                      }`}
                    >
                      {message.role === "user" ? (
                        <p>{message.content}</p>
                      ) : (
                        <div>
                          <p className="mb-3 text-[#2F342E]">
                            {message.content}
                          </p>
                          {message.videoUrl && (
                            <div className="space-y-2">
                              <video
                                src={message.videoUrl}
                                controls
                                className="w-full rounded-lg"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {isGenerating && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-[#D5CBBE] rounded-2xl p-4">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 bg-[#AABCA3] rounded-full animate-bounce"
                          style={{ animationDelay: "0ms" }}
                        />
                        <div
                          className="w-2 h-2 bg-[#AABCA3] rounded-full animate-bounce"
                          style={{ animationDelay: "150ms" }}
                        />
                        <div
                          className="w-2 h-2 bg-[#AABCA3] rounded-full animate-bounce"
                          style={{ animationDelay: "300ms" }}
                        />
                      </div>
                      <p className="text-sm text-[#5A625A] mt-2">
                        Generating video...
                      </p>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Input */}
            <div className="border-t border-[#D5CBBE] p-4 bg-white">
              <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
                <div className="flex gap-3">
                  <Input
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Describe the video you want to generate..."
                    disabled={isGenerating}
                    className="flex-1"
                  />
                  <Button
                    type="submit"
                    disabled={isGenerating || !inputValue.trim()}
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-[#5A625A]">
            <div className="text-center">
              <MessageSquare className="w-16 h-16 mx-auto mb-4 text-[#AABCA3]" />
              <h2 className="text-2xl mb-2 text-[#2F342E]">Start a New Chat</h2>
              <p className="text-[#5A625A]">
                Click "New Chat" to begin generating videos
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Delete Chat Confirmation Dialog */}
      <AlertDialog
        open={!!deleteChatId}
        onOpenChange={() => setDeleteChatId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Chat</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this chat? All messages and
              generated videos will be permanently removed. This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteChatId && deleteChat(deleteChatId)}
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
