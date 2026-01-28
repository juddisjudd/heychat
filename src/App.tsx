import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { check } from "@tauri-apps/plugin-updater";
import { getVersion } from "@tauri-apps/api/app";
import { Eraser, Search as SearchIcon, Github } from "lucide-react";
import { ChatMessage } from "./types";
import { ChatList } from "./components/ChatList";
import TitleBar from "./components/TitleBar";
import "./App.css";

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [twitchChannel, setTwitchChannel] = useState("");
  const [youtubeVideoId, setYoutubeVideoId] = useState("");
  const [twitchConnected, setTwitchConnected] = useState(false);
  const [youtubeConnected, setYoutubeConnected] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [favoritesInput, setFavoritesInput] = useState("");
  const [appVersion, setAppVersion] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Check for updates on mount
  useEffect(() => {
    const checkForUpdates = async () => {
        try {
            const update = await check();
            if (update?.available) {
                console.log(`Update to ${update.version} available!`);
                await update.downloadAndInstall();
                // Notify user to restart
                alert(`Update to v${update.version} installed. Please restart HeyChat to apply.`);
            }
        } catch (error) {
            console.error("Update check failed (this is expected in dev mode):", error);
        }
    };
    
    checkForUpdates();
  }, []);

  // Load settings from localStorage on mount
  useEffect(() => {
    getVersion().then(setAppVersion);
    
    const savedTwitch = localStorage.getItem("heychat_twitch_channel");
    const savedYoutube = localStorage.getItem("heychat_youtube_id");
    const savedSidebar = localStorage.getItem("heychat_sidebar_open");
    const savedFavorites = localStorage.getItem("heychat_favorites");

    if (savedTwitch) setTwitchChannel(savedTwitch);
    if (savedYoutube) setYoutubeVideoId(savedYoutube);
    if (savedSidebar !== null) setIsSidebarOpen(savedSidebar === "true");
    if (savedFavorites) setFavoritesInput(savedFavorites);
  }, []);

  // Save settings when they change
  useEffect(() => {
    localStorage.setItem("heychat_twitch_channel", twitchChannel);
  }, [twitchChannel]);

  useEffect(() => {
    localStorage.setItem("heychat_youtube_id", youtubeVideoId);
  }, [youtubeVideoId]);

  useEffect(() => {
    localStorage.setItem("heychat_sidebar_open", String(isSidebarOpen));
  }, [isSidebarOpen]);

  useEffect(() => {
    localStorage.setItem("heychat_favorites", favoritesInput);
  }, [favoritesInput]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let unmounted = false;

    const setupListeners = async () => {
      const unlistenFn = await listen<ChatMessage>("chat-message", (event) => {
          console.log("Frontend received event:", event);
          setMessages((prev) => {
              if (prev.some(m => m.id === event.payload.id)) return prev;
              return [...prev.slice(-200), event.payload];
          }); 
      });

      if (unmounted) {
        unlistenFn();
      } else {
        unlisten = unlistenFn;
      }
    };
    
    setupListeners();

    return () => {
      unmounted = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  async function connectTwitch() {
    if (!twitchChannel) return;
    await invoke("join_twitch", { channel: twitchChannel });
    setTwitchConnected(true);
  }

  async function connectYoutube() {
    if (!youtubeVideoId) return;
    await invoke("join_youtube", { videoId: youtubeVideoId });
    setYoutubeConnected(true);
  }

  const favoriteUsers = favoritesInput.split("\n").map(s => s.trim().toLowerCase()).filter(s => s.length > 0);
  
  const filteredMessages = messages.filter(msg => {
      if (!searchQuery) return true;
      return msg.username.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <>
    <TitleBar />
    <div className="container app-with-titlebar">
      <div className={`sidebar ${isSidebarOpen ? "open" : "closed"}`}>
        <div className="sidebar-content">
          <div className="sidebar-header">
            {/* Header removed as requested */}
          </div>
          
          <div className="connection-group">
            <h3>TWITCH</h3>
            <div className="input-row">
                <input
                  placeholder="Channel Name"
                  value={twitchChannel}
                  onChange={(e) => setTwitchChannel(e.target.value)}
                  disabled={twitchConnected}
                />
                {!twitchConnected ? (
                  <button onClick={connectTwitch} className="action-btn">Connect</button>
                ) : (
                  <button 
                    onClick={async () => {
                       setTwitchConnected(false);
                    }} 
                    className="action-btn disconnect-btn"
                  >
                    Disconnect
                  </button>
                )}
            </div>
          </div>

          <div className="connection-group">
            <h3>YOUTUBE</h3>
            <div className="input-row">
                <input
                  placeholder="ID, URL, or @Handle"
                  value={youtubeVideoId}
                  onChange={(e) => setYoutubeVideoId(e.target.value)}
                  disabled={youtubeConnected}
                />
                {!youtubeConnected ? (
                  <button onClick={connectYoutube} className="action-btn">Connect</button>
                ) : (
                  <button 
                    onClick={async () => new Promise(resolve => setTimeout(resolve, 0)).then(() => setYoutubeConnected(false))} 
                    className="action-btn disconnect-btn"
                  >
                    Disconnect
                  </button>
                )}
            </div>
          </div>

          <div className="connection-group">
             <h3>{favoriteUsers.length} FAVORITES</h3>
             <textarea
                className="favorites-input"
                placeholder="Usernames (one per line)"
                value={favoritesInput}
                onChange={(e) => setFavoritesInput(e.target.value)}
             />
          </div>

          <div className="sidebar-footer">
            <div 
                onClick={async () => {
                    try {
                        await invoke('open_link', { url: 'https://github.com/juddisjudd/heychat' });
                    } catch (e) {
                         console.error("Failed to open URL:", e);
                         window.open('https://github.com/juddisjudd/heychat', '_blank');
                    }
                }}
                className="github-link"
                title="View Source on GitHub"
            >
                <Github size={14} />
                <span>Open Source</span>
            </div>
            <span className="footer-separator">|</span>
            <span className="version-text">v{appVersion}</span>
          </div>
        </div>
      </div>
      
      <button 
        className={`sidebar-toggle-btn ${isSidebarOpen ? "open" : ""}`} 
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        title={isSidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
      >
        {isSidebarOpen ? "«" : "»"}
      </button>

      <div className="main-content">
        <div className="chat-toolbar">
            <div className="search-container">
                <SearchIcon size={16} className="search-icon" />
                <input 
                    type="text" 
                    placeholder="Search User..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="search-input"
                />
            </div>
            
            <button 
                onClick={() => setMessages([])} 
                className="toolbar-btn clear-btn"
                title="Clear Chat"
            >
                <Eraser size={16} />
                <span>Clear</span>
            </button>
        </div>
        <ChatList messages={filteredMessages} favorites={favoriteUsers} />
      </div>
    </div>
    </>
  );
}

export default App;
