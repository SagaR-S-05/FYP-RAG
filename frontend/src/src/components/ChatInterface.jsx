import { useState, useRef, useEffect } from "react";
import { Plus, Send, MessageSquare, Trash2 } from "lucide-react";

export function ChatInterface({
  chats,
  currentChatId,
  setCurrentChatId,
  saveChats,
}) {
  const [inputValue, setInputValue] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const messagesEndRef = useRef(null);
  const [deleteChatId, setDeleteChatId] = useState(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const currentChat = chats.find((chat) => chat.id === currentChatId);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentChat?.messages]);

  const createNewChat = () => {
    const newChat = {
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

  const generateVideo = async (prompt) => {
    const res = await fetch("http://localhost:8000/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt }),
    });

    if (!res.ok) {
      throw new Error(`Server responded with status ${res.status}`);
    }

    const data = await res.json();
    if (!data || typeof data.code !== "string") {
      throw new Error("Invalid response from server");
    }

    return data.code;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputValue.trim() || isGenerating) return;

    let chatToUpdate = currentChat;
    let updatedChats = [...chats];

    // Create new chat if none exists
    if (!chatToUpdate) {
      const newChat = {
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
    const userMessage = {
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
      chat.id === chatToUpdate.id ? chatToUpdate : chat,
    );
    saveChats(updatedChats);
    setInputValue("");
    setIsGenerating(true);

    try {
      // Call backend to generate Manim code
      const code = await generateVideo(inputValue);

      // Add assistant message with returned Manim code
      const assistantMessage = {
        id: `msg-${Date.now()}`,
        role: "assistant",
        content: `Generated Manim code for: "${inputValue}"`,
        code,
        timestamp: new Date(),
      };

      const finalMessages = [...updatedMessages, assistantMessage];
      chatToUpdate = {
        ...chatToUpdate,
        messages: finalMessages,
        updatedAt: new Date(),
      };

      updatedChats = updatedChats.map((chat) =>
        chat.id === chatToUpdate.id ? chatToUpdate : chat,
      );
      saveChats(updatedChats);
    } catch (error) {
      console.error("Error generating video:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const deleteChat = (id) => {
    const updatedChats = chats.filter((chat) => chat.id !== id);
    saveChats(updatedChats);
    if (currentChatId === id) {
      setCurrentChatId(null);
    }
    setShowDeleteDialog(false);
    setDeleteChatId(null);
  };

  return (
    <>
      {/* Sidebar */}
      <div className="w-64 bg-[#E8F0E6] text-[#2F342E] flex flex-col border-r border-[#D5CBBE]">
        <div className="p-4">
          <button
            onClick={createNewChat}
            className="w-full inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md transition-all h-9 px-4 bg-[#546F54] text-[#F7F8F7] hover:bg-[#799A78]"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </button>
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
                  setShowDeleteDialog(true);
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
                          {message.code && (
                            <div className="space-y-2">
                              <pre className="whitespace-pre-wrap bg-[#F6F6F6] p-3 rounded-lg text-sm overflow-auto">
                                {message.code}
                              </pre>
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
                  <input
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Describe the video you want to generate..."
                    disabled={isGenerating}
                    className="flex-1 h-9 rounded-md border border-[#D5CBBE] bg-[#FFFFFF] px-3 py-1 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                  />
                  <button
                    type="submit"
                    disabled={isGenerating || !inputValue.trim()}
                    className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md transition-all h-9 px-4 bg-[#546F54] text-[#F7F8F7] hover:bg-[#799A78] disabled:pointer-events-none disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                  </button>
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
                Click &quot;New Chat&quot; to begin generating videos
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Delete Chat Confirmation Dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl mb-2 text-[#2F342E]">Delete Chat</h3>
            <p className="text-[#5A625A] mb-6">
              Are you sure you want to delete this chat? All messages and
              generated videos will be permanently removed. This action cannot
              be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowDeleteDialog(false);
                  setDeleteChatId(null);
                }}
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md transition-all h-9 px-4 border bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteChatId && deleteChat(deleteChatId)}
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md transition-all h-9 px-4 bg-[#C67A5A] text-white hover:bg-[#C67A5A]/90"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
