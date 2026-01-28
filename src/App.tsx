import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { check } from "@tauri-apps/plugin-updater";
import { getVersion } from "@tauri-apps/api/app";
import { Eraser, Search as SearchIcon, Github, Heart, Shield, Bot } from "lucide-react";
import { ChatMessage } from "./types";
import { ChatList } from "./components/ChatList";
import TitleBar from "./components/TitleBar";
import "./App.css";

const COMMON_BOTS = ['streamlabs', 'streamelements', 'moobot', 'nightbot', 'fossabot', 'soundalerts'];

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
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'TWITCH' | 'YOUTUBE' | 'VIP' | 'MOD'>('ALL');
  const [hideBots, setHideBots] = useState(false);

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
      // 1. Bot Filter (Highest priority exclusion)
      if (hideBots && COMMON_BOTS.includes(msg.username.toLowerCase())) {
          return false;
      }

      // 2. Search Query
      if (searchQuery && !msg.username.toLowerCase().includes(searchQuery.toLowerCase())) {
          return false;
      }

      // 3. Quick Filters
      switch (activeFilter) {
          case 'TWITCH': return msg.platform === 'Twitch';
          case 'YOUTUBE': return msg.platform === 'YouTube';
          case 'VIP': return msg.is_vip;
          case 'MOD': return msg.is_mod;
          case 'ALL': default: return true;
      }
  });

  const toggleFilter = (filter: typeof activeFilter) => {
      setActiveFilter(prev => prev === filter ? 'ALL' : filter);
  };

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
            
            <div className="quick-filters">
                <button 
                    className={`filter-btn twitch ${activeFilter === 'TWITCH' ? 'active' : ''}`}
                    onClick={() => toggleFilter('TWITCH')}
                    title="Show Twitch Only"
                >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                        <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/>
                    </svg>
                </button>
                <button 
                    className={`filter-btn youtube ${activeFilter === 'YOUTUBE' ? 'active' : ''}`}
                    onClick={() => toggleFilter('YOUTUBE')}
                    title="Show YouTube Only"
                >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                    </svg>
                </button>
                <button 
                    className={`filter-btn vip ${activeFilter === 'VIP' ? 'active' : ''}`}
                    onClick={() => toggleFilter('VIP')}
                    title="Show VIPs Only"
                >
                    <Heart size={16} fill="currentColor" />
                </button>
                <button 
                    className={`filter-btn mod ${activeFilter === 'MOD' ? 'active' : ''}`}
                    onClick={() => toggleFilter('MOD')}
                    title="Show Mods Only"
                >
                    <Shield size={16} fill="currentColor" />
                </button>
                
                <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)', height: '20px', margin: '0 4px' }} />

                <button 
                    className={`filter-btn bot ${hideBots ? 'active' : ''}`}
                    onClick={() => setHideBots(!hideBots)}
                    title={hideBots ? "Show Bots" : "Hide Bots"}
                >
                    <Bot size={16} fill={hideBots ? "currentColor" : "none"} strokeWidth={hideBots ? 0 : 2} />
                </button>
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
        <ChatList 
            messages={filteredMessages} 
            favorites={favoriteUsers} 
            highlightTerms={[twitchChannel, youtubeVideoId].filter(Boolean)}
        />
      </div>
    </div>
    </>
  );
}

export default App;
