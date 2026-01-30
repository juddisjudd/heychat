import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";
import { Eraser, Search as SearchIcon, Github, Heart, Shield, Bot, LogIn } from "lucide-react";
import { ChatMessage } from "./types";
import { ChatList } from "./components/ChatList";
import TitleBar from "./components/TitleBar";
import { UpdateNotification } from "./components/UpdateNotification";
import { LoginModal } from "./components/LoginModal";
import { ChatInput } from "./components/ChatInput";
import "./App.css";

import { ToastContainer, ToastMessage } from "./components/Toast";
import { fetchThirdPartyEmotes, EmoteMap } from "./utils/emotes";

const COMMON_BOTS = ['streamlabs', 'streamelements', 'moobot', 'nightbot', 'fossabot', 'soundalerts'];

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [twitchChannel, setTwitchChannel] = useState("");
  const [youtubeVideoId, setYoutubeVideoId] = useState("");
  const [twitchConnected, setTwitchConnected] = useState(false);
  const [youtubeConnected, setYoutubeConnected] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [favoritesInput, setFavoritesInput] = useState("");
  const [appVersion, setAppVersion] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'TWITCH' | 'YOUTUBE' | 'VIP' | 'MOD'>('ALL');
  const [hideBots, setHideBots] = useState(false);
  const [thirdPartyEmotes, setThirdPartyEmotes] = useState<EmoteMap>(new Map());

  // Toast State
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // YouTube Auth
  const [youtubeToken, setYoutubeToken] = useState("");
  const [youtubeUser, setYoutubeUser] = useState("");
  
  // Chat Sending Provider
  const [chatProvider, setChatProvider] = useState<'twitch' | 'youtube'>('twitch');
  
  // Twitch Auth
  const [twitchUser, setTwitchUser] = useState("");
  const [twitchToken, setTwitchToken] = useState("");

  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'info', duration = 3000) => {
    const id = Date.now().toString() + Math.random().toString();
    setToasts(prev => [...prev, { id, message, type, duration }]);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Load settings from localStorage on mount
  useEffect(() => {
    getVersion().then(setAppVersion);
    
    const savedTwitch = localStorage.getItem("heychat_twitch_channel");
    const savedYoutube = localStorage.getItem("heychat_youtube_id");
    const savedSidebar = localStorage.getItem("heychat_sidebar_open");
    const savedFavorites = localStorage.getItem("heychat_favorites");
    const savedTwitchUser = localStorage.getItem("heychat_twitch_username");
    const savedTwitchToken = localStorage.getItem("heychat_twitch_token");
    const savedYoutubeUser = localStorage.getItem("heychat_youtube_username");
    const savedYoutubeToken = localStorage.getItem("heychat_youtube_token");

    if (savedTwitch) setTwitchChannel(savedTwitch);
    if (savedYoutube) setYoutubeVideoId(savedYoutube);
    if (savedSidebar !== null) setIsSidebarOpen(savedSidebar === "true");
    if (savedFavorites) setFavoritesInput(savedFavorites);
    if (savedTwitchUser) setTwitchUser(savedTwitchUser);
    if (savedTwitchToken) setTwitchToken(savedTwitchToken);
    if (savedYoutubeUser) setYoutubeUser(savedYoutubeUser);
    if (savedYoutubeToken) setYoutubeToken(savedYoutubeToken);
  }, []);

  // Save settings when they change
  useEffect(() => {
    localStorage.setItem("heychat_twitch_channel", twitchChannel);
    localStorage.setItem("heychat_youtube_id", youtubeVideoId);
    localStorage.setItem("heychat_sidebar_open", String(isSidebarOpen));
    localStorage.setItem("heychat_favorites", favoritesInput);
    localStorage.setItem("heychat_twitch_username", twitchUser);
    localStorage.setItem("heychat_twitch_token", twitchToken);
    localStorage.setItem("heychat_youtube_username", youtubeUser);
    localStorage.setItem("heychat_youtube_token", youtubeToken);
  }, [twitchChannel, youtubeVideoId, isSidebarOpen, favoritesInput, twitchUser, twitchToken, youtubeUser, youtubeToken]);

  useEffect(() => {
    const unlisteners: Promise<() => void>[] = [];

    const setupListeners = async () => {
      // 1. Chat Messages
      unlisteners.push(listen<ChatMessage>("chat-message", (event) => {
          console.log("Frontend received event:", event);
          setMessages((prev) => {
              if (prev.some(m => m.id === event.payload.id)) return prev;
              return [...prev.slice(-200), event.payload];
          }); 
      }));

      // 2. Twitch Connection Info (Emote Loading)
      unlisteners.push(listen<string>("twitch-connected", async (event) => {
          console.log("Twitch connected, fetching emotes for channel ID:", event.payload);
          const channelId = event.payload;
          const emotes = await fetchThirdPartyEmotes(channelId);
          setThirdPartyEmotes(emotes);
          setTwitchConnected(true); 
      }));

      // 3. YouTube Connection Info (Resolved ID)
      unlisteners.push(listen<string>("youtube-connected", (event) => {
         console.log("YouTube connected, resolved ID:", event.payload);
         setYoutubeVideoId(event.payload);
         setYoutubeConnected(true);
      }));

      // 4. Twitch Error (Auth Failure)
      unlisteners.push(listen<string>("twitch-error", (event) => {
          console.error("Twitch Error:", event.payload);
          setTwitchConnected(false);
          addToast(`Twitch Error: ${event.payload}`, 'error');
      }));

      // 5. Auth Token Received (Generic)
      unlisteners.push(listen<string>("auth-token-received", async (event) => {
          const token = event.payload;
          const provider = localStorage.getItem("pending_auth_provider");
          console.log(`Auth token received for provider: ${provider}`);
          
          if (provider === 'twitch') {
              try {
                 const res = await fetch('https://api.twitch.tv/helix/users', {
                     headers: {
                         'Authorization': `Bearer ${token}`,
                         'Client-Id': 'j07v9449bxjpfqx1msfnceaol2uwhx'
                     }
                 });
                 if (!res.ok) throw new Error('Failed to fetch Twitch user info');
                 const data = await res.json();
                 const user = data.data[0]?.login;
                 if (user) {
                     setTwitchUser(user);
                     setTwitchToken(token);
                     addToast(`Logged in as ${user} (Twitch)`, 'success');
                 }
              } catch (e) {
                  addToast("Twitch login failed: " + String(e), 'error');
              }
          } else if (provider === 'youtube') {
              try {
                  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                      headers: { 'Authorization': `Bearer ${token}` }
                  });
                  if (!res.ok) throw new Error('Failed to fetch Google user info');
                  const data = await res.json();
                  const user = data.name || data.email;
                  if (user) {
                      setYoutubeUser(user);
                      setYoutubeToken(token);
                      addToast(`Logged in as ${user} (YouTube)`, 'success');
                  }
              } catch (e) {
                   addToast("YouTube login failed: " + String(e), 'error');
              }
          }
          
          setIsLoginModalOpen(false);
          localStorage.removeItem("pending_auth_provider");
      }));
    };
    
    setupListeners();

    return () => {
        unlisteners.forEach(p => p.then(f => f()));
    };
  }, []);

  async function connectTwitch() {
    if (!twitchChannel) return;
    try {
        await invoke("join_twitch", { 
            channel: twitchChannel,
            username: twitchUser || null,
            token: twitchToken || null
        });
        setTwitchConnected(true);
    } catch (e) {
        console.error("Failed to connect Twitch:", e);
    }
  }

  async function connectYoutube() {
    if (!youtubeVideoId) return;
    await invoke("join_youtube", { videoId: youtubeVideoId });
    setYoutubeConnected(true);
  }

  async function handleSendMessage(message: string) {
      if (chatProvider === 'twitch' && twitchConnected && twitchToken) {
           const existingMsg = messages.find(m => m.username.toLowerCase() === twitchUser.toLowerCase());
           const userColor = existingMsg?.color || '#9146FF';
           const tempMessage: ChatMessage = {
               id: `local-twitch-${Date.now()}`,
               platform: 'Twitch',
               username: twitchUser,
               message: message,
               color: userColor,
               badges: existingMsg?.badges || [],
               is_mod: existingMsg?.is_mod || false,
               is_vip: existingMsg?.is_vip || false,
               is_member: false,
               timestamp: new Date().toISOString(),
               emotes: [],
               msg_type: 'chat',
               system_message: undefined
           };
           setMessages(prev => [...prev.slice(-200), tempMessage]);

           try {
               await invoke("send_twitch_message", { channel: twitchChannel, message });
           } catch (e) {
               console.error("Failed to send Twitch message:", e);
               addToast("Failed to send Twitch message: " + String(e), 'error');
           }

      } else if (chatProvider === 'youtube' && youtubeConnected && youtubeToken) {
           // TEMPORARY: Block sending due to API 404 issues
           addToast('YouTube sending is temporarily disabled due to API 404 errors.', 'info');
           return;
           /* 
           const tempMessage: ChatMessage = {
               id: `local-yt-${Date.now()}`,
               platform: 'YouTube',
               username: youtubeUser,
               message: message,
               color: '#FF0000', // YouTube Red Default
               badges: [],
               is_mod: false, // Can't easily know yet
               is_vip: false,
               is_member: false,
               timestamp: new Date().toISOString(),
               emotes: [], // Handling emojis locally is hard, skipping for optimistic
               msg_type: 'chat',
               system_message: undefined
           };
           setMessages(prev => [...prev.slice(-200), tempMessage]);

           try {
               await invoke("send_youtube_message", { 
                   videoId: youtubeVideoId,
                   message, 
                   token: youtubeToken 
               });
           } catch (e) {
               console.error("Failed to send YouTube message:", e);
               addToast("Failed to send YouTube message: " + String(e), 'error'); 
           }
           */
      }
  }

  const toggleFilter = (filter: 'ALL' | 'TWITCH' | 'YOUTUBE' | 'VIP' | 'MOD') => {
      if (activeFilter === filter) setActiveFilter('ALL');
      else setActiveFilter(filter);
  };

  const openReleasesPage = async () => {
       try {
           await invoke('open_link', { url: 'https://github.com/juddisjudd/heychat/releases' });
       } catch (e) {
           console.error("Failed to open releases:", e);
           window.open('https://github.com/juddisjudd/heychat/releases', '_blank');
       }
  };
  
  const canSendTwitch = twitchConnected && !!twitchToken;
  const canSendYoutube = youtubeConnected && !!youtubeToken;
  // const canSendYoutube = false; // TEMPORARY: Disabled due to persistent API 404 errors. Reading works, sending is blocked.
  
  // Auto-switch provider: Prefer Twitch if available.
  useEffect(() => {
      if (canSendTwitch) setChatProvider('twitch');
      else if (canSendYoutube) setChatProvider('youtube');
  }, [canSendTwitch, canSendYoutube]);

  // Filter Logic
  const favoriteUsers = favoritesInput
    .split('\n')
    .map(u => u.trim())
    .filter(Boolean)
    .map(u => u.toLowerCase());

  const filteredMessages = messages.filter(msg => {
    // 1. Search filter
    if (searchQuery && !msg.username.toLowerCase().includes(searchQuery.toLowerCase()) && !msg.message.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
    }

    // 2. Platform filter
    if (activeFilter === 'TWITCH' && msg.platform !== 'Twitch') return false;
    if (activeFilter === 'YOUTUBE' && msg.platform !== 'YouTube') return false;
    
    // 3. Role filter
    if (activeFilter === 'VIP' && !msg.is_vip) return false;
    if (activeFilter === 'MOD' && !msg.is_mod) return false;

    // 4. Bot filter
    if (hideBots && COMMON_BOTS.includes(msg.username.toLowerCase())) return false;

    return true;
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h3>TWITCH</h3>
                {twitchUser ? (
                    <span style={{ fontSize: '0.7em', color: '#9146FF', cursor: 'pointer' }} onClick={() => setIsLoginModalOpen(true)} title="Click to update login">Logged as {twitchUser}</span>
                ) : (
                    <button className="filter-btn" style={{ width: 'auto', padding: '0 6px', fontSize: '0.7em' }} onClick={() => setIsLoginModalOpen(true)}>
                        <LogIn size={10} style={{ marginRight: 4 }} /> Login
                    </button>
                )}
            </div>
            
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h3>YOUTUBE</h3>
                {youtubeUser ? (
                    <span style={{ fontSize: '0.7em', color: '#ff4444', cursor: 'pointer' }} onClick={() => setIsLoginModalOpen(true)} title="Click to update login">Logged as {youtubeUser}</span>
                ) : (
                    <button className="filter-btn" style={{ width: 'auto', padding: '0 6px', fontSize: '0.7em' }} onClick={() => setIsLoginModalOpen(true)}>
                        <LogIn size={10} style={{ marginRight: 4 }} /> Login
                    </button>
                )}
            </div>
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
            <span 
                className="version-text clickable" 
                onClick={openReleasesPage}
                title="Click to View Releases"
                style={{ cursor: 'pointer', textDecoration: 'underline' }}
            >
                v{appVersion}
            </span>
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
            thirdPartyEmotes={thirdPartyEmotes}
        />
        
        {/* Chat Input Area */}
        {(canSendTwitch || canSendYoutube) && (
            <div className="chat-input-container">
                {canSendTwitch && canSendYoutube && (
                    <div className="provider-selector" style={{ display: 'flex', background: '#1a1a1a', borderRadius: '6px', padding: '4px', gap: '4px', border: '1px solid #333' }}>
                         <button 
                            className={`platform-toggle-btn ${chatProvider === 'twitch' ? 'active twitch' : ''}`}
                            onClick={() => setChatProvider('twitch')}
                            title="Send via Twitch"
                            style={{ 
                                background: chatProvider === 'twitch' ? '#9146FF' : 'transparent', 
                                border: 'none', 
                                borderRadius: '4px',
                                padding: '6px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                color: chatProvider === 'twitch' ? '#fff' : '#666',
                                transition: 'all 0.2s'
                            }}
                        >
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                                <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/>
                            </svg>
                        </button>
                        <button 
                            className={`platform-toggle-btn ${chatProvider === 'youtube' ? 'active youtube' : ''}`}
                            onClick={() => addToast("YouTube sending is temporarily disabled while we work on improvements.", 'info')}
                            title="Send via YouTube (Disabled)"
                            style={{ 
                                background: chatProvider === 'youtube' ? '#ff0000' : 'transparent', 
                                border: 'none', 
                                borderRadius: '4px',
                                padding: '6px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                color: chatProvider === 'youtube' ? '#fff' : '#666',
                                transition: 'all 0.2s'
                            }}
                        >
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                            </svg>
                        </button>
                    </div>
                )}
                
                {/* Single Provider Indicator if only one is available */}
                {(!canSendTwitch || !canSendYoutube) && (
                    <div style={{ padding: '8px', color: '#666', opacity: 0.5 }}>
                        {canSendTwitch ? (
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/></svg>
                        ) : (
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                        )}
                    </div>
                )}

                <div style={{ flex: 1 }}>
                    <ChatInput 
                        onSendMessage={handleSendMessage} 
                        placeholder={`Message ${chatProvider === 'twitch' ? 'Twitch' : 'YouTube'}...`}
                    />
                </div>
            </div>
        )}

        <UpdateNotification />
      </div>
      
      <LoginModal 
        isOpen={isLoginModalOpen} 
        onClose={() => setIsLoginModalOpen(false)} 
        onLogin={() => {}} 
        twitchUser={twitchUser}
        youtubeUser={youtubeUser}
        onLogoutTwitch={() => { setTwitchUser(""); setTwitchToken(""); }}
        onLogoutYoutube={() => { setYoutubeUser(""); setYoutubeToken(""); }}
      />
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
    </>
  );
}

export default App;
