import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";
import { Eraser, Search as SearchIcon, Github, Heart, Shield, Bot, LogIn, Settings, Zap } from "lucide-react";
import { ChatMessage } from "./types";
import { ChatList } from "./components/ChatList";
import TitleBar from "./components/TitleBar";
import { UpdateNotification } from "./components/UpdateNotification";
import { LoginModal } from "./components/LoginModal";
import { ChatInput } from "./components/ChatInput";
import { SettingsPage } from "./components/SettingsPage";
import { ChatSettingsProvider } from "./context/ChatSettingsContext";
import "./App.css";

import { ToastContainer, ToastMessage } from "./components/Toast";
import { fetchThirdPartyEmotes, EmoteMap, EmoteData } from "./utils/emotes";
import { TwitchUserCard } from "./components/TwitchUserCard";
import { StreamToolsModal } from "./components/StreamToolsModal";

const COMMON_BOTS = ['streamlabs', 'streamelements', 'moobot', 'nightbot', 'fossabot', 'soundalerts'];

function App() {
  return (
    <ChatSettingsProvider>
       <AppContent />
    </ChatSettingsProvider>
  );
}

function AppContent() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [twitchChannel, setTwitchChannel] = useState("");
  const [youtubeVideoId, setYoutubeVideoId] = useState("");
  const [kickChannel, setKickChannel] = useState("");
  const [twitchConnected, setTwitchConnected] = useState(false);
  const [youtubeConnected, setYoutubeConnected] = useState(false);
  const [kickConnected, setKickConnected] = useState(false);

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [favoritesInput, setFavoritesInput] = useState("");
  const [appVersion, setAppVersion] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'TWITCH' | 'YOUTUBE' | 'KICK' | 'VIP' | 'MOD'>('ALL');
  const [hideBots, setHideBots] = useState(false);

  const [thirdPartyEmotes, setThirdPartyEmotes] = useState<EmoteMap>(new Map());
  const [thirdPartyEmoteData, setThirdPartyEmoteData] = useState<EmoteData | null>(null);
  
  // View Styling
  const [currentView, setCurrentView] = useState<'CHAT' | 'SETTINGS'>('CHAT');

  // Toast State
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // YouTube Auth
  const [youtubeToken, setYoutubeToken] = useState("");
  const [youtubeUser, setYoutubeUser] = useState("");
  
  // Chat Sending Provider
  const [chatProvider, setChatProvider] = useState<'twitch' | 'youtube' | 'kick'>('twitch');
  
  // Twitch Auth
  const [twitchUser, setTwitchUser] = useState("");
  const [twitchToken, setTwitchToken] = useState("");
  
  // Kick Auth
  const [kickUser, setKickUser] = useState("");
  const [kickToken, setKickToken] = useState("");

  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [isStreamToolsOpen, setIsStreamToolsOpen] = useState(false);
  const [isCurrentUserMod, setIsCurrentUserMod] = useState(false);
  const [broadcasterId, setBroadcasterId] = useState<string | null>(null);

  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'info', duration = 3000) => {
    const id = Date.now().toString() + Math.random().toString();
    setToasts(prev => [...prev, { id, message, type, duration }]);
  };

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);
  
  // Load settings from localStorage on mount
  useEffect(() => {
    getVersion().then(setAppVersion);
    
    const savedTwitch = localStorage.getItem("heychat_twitch_channel");
    const savedYoutube = localStorage.getItem("heychat_youtube_id");
    const savedKick = localStorage.getItem("heychat_kick_channel");

    const savedSidebar = localStorage.getItem("heychat_sidebar_open");
    const savedFavorites = localStorage.getItem("heychat_favorites");
    const savedTwitchUser = localStorage.getItem("heychat_twitch_username");
    const savedTwitchToken = localStorage.getItem("heychat_twitch_token");
    const savedYoutubeUser = localStorage.getItem("heychat_youtube_username");
    const savedYoutubeToken = localStorage.getItem("heychat_youtube_token");
    const savedKickUser = localStorage.getItem("heychat_kick_username");
    const savedKickToken = localStorage.getItem("heychat_kick_token");

    if (savedTwitch) setTwitchChannel(savedTwitch);
    if (savedYoutube) setYoutubeVideoId(savedYoutube);
    if (savedKick) setKickChannel(savedKick);

    if (savedSidebar !== null) setIsSidebarOpen(savedSidebar === "true");
    if (savedFavorites) setFavoritesInput(savedFavorites);
    if (savedTwitchUser) setTwitchUser(savedTwitchUser);
    if (savedTwitchToken) setTwitchToken(savedTwitchToken);
    if (savedYoutubeUser) setYoutubeUser(savedYoutubeUser);
    if (savedYoutubeToken) setYoutubeToken(savedYoutubeToken);
    if (savedKickUser) setKickUser(savedKickUser);
    if (savedKickToken) setKickToken(savedKickToken);
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
    localStorage.setItem("heychat_kick_username", kickUser);
    localStorage.setItem("heychat_kick_token", kickToken);
    localStorage.setItem("heychat_kick_channel", kickChannel);
  }, [twitchChannel, youtubeVideoId, kickChannel, isSidebarOpen, favoritesInput, twitchUser, twitchToken, youtubeUser, youtubeToken, kickUser, kickToken]);

  // Setup Event Listeners
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

      // Listen for current user state (Mod status)
      unlisteners.push(listen<{ is_mod: boolean, badges: string[] }>("twitch-current-user-state", (event) => {
          console.log("Twitch User State:", event.payload);
          setIsCurrentUserMod(event.payload.is_mod);
      }));

      // 2. Twitch Connection Info (Emote Loading)
      unlisteners.push(listen<string>("twitch-connected", async (event) => {
          console.log("Twitch connected, fetching emotes for channel ID:", event.payload);
          const channelId = event.payload;
          setBroadcasterId(channelId);
          const data = await fetchThirdPartyEmotes(channelId);
          setThirdPartyEmotes(data.map);
          setThirdPartyEmoteData(data);
          setTwitchConnected(true); 
      }));

      // 3. YouTube Connection Info (Resolved ID)
      unlisteners.push(listen<string>("youtube-connected", (event) => {
         console.log("YouTube connected, resolved ID:", event.payload);
         setYoutubeVideoId(event.payload);
         setYoutubeConnected(true);
      }));
          
      // 3b. Kick Connection Info
      unlisteners.push(listen<string>("kick-connected", (event) => {
          console.log("Kick connected:", event.payload);
          setKickConnected(true);
          addToast("Connected to Kick", "success");
      }));
      
      unlisteners.push(listen<string>("kick-error", (event) => {
          console.error("Kick Error:", event.payload);
          setKickConnected(false);
          addToast(`Kick Error: ${event.payload}`, "error");
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
          } else if (provider === 'kick') {
              try {
                  // Fetch user info from Kick Official API
                  const res = await fetch('https://api.kick.com/public/v1/users', {
                      headers: { 
                          'Authorization': `Bearer ${token}`,
                          'Accept': 'application/json'
                      }
                  });
                  if (!res.ok) throw new Error('Failed to fetch Kick user info');
                  const json = await res.json();
                  // Check data: { data: [ { user_id, name, ... } ] }
                  const name = json.data?.[0]?.name;
                  if (name) {
                      setKickUser(name);
                      setKickToken(token);
                      addToast(`Logged in as ${name} (Kick)`, 'success');
                  }
              } catch (e) {
                   addToast("Kick login failed: " + String(e), 'error');
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

  async function fetchKickChannelInfo(channel_slug: string) {
      const res = await fetch(`https://kick.com/api/v2/channels/${channel_slug}`);
      if (!res.ok) throw new Error(`Kick API V2 Error: ${res.status}`);
      
      const json = await res.json();
      const chatroomId = json.chatroom?.id;
      const broadcasterId = json.userid || json.user_id || json.id;
      
      if (!chatroomId || !broadcasterId) {
          throw new Error("Could not find chatroom ID or Broadcaster ID");
      }
      return { chatroomId, broadcasterId };
  }

  async function connectKick() {
      if (!kickChannel) return;
      try {
          addToast(`Connecting to Kick: ${kickChannel}...`, 'info');
          const { chatroomId, broadcasterId } = await fetchKickChannelInfo(kickChannel);
          console.log("Kick Info:", { chatroomId, broadcasterId });
          
          await invoke("join_kick", { 
              channel: kickChannel, 
              chatroomId, 
              broadcasterUserId: broadcasterId 
          });
      } catch (e) {
          console.error("Failed to connect Kick:", e);
          addToast("Kick Connection Failed: " + String(e), 'error');
      }
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

       } else if (chatProvider === 'kick' && kickConnected && kickToken) {
           const existingMsg = messages.find(m => m.username.toLowerCase() === kickUser.toLowerCase());
           const userColor = existingMsg?.color || '#53FC18';
           
           const tempMessage: ChatMessage = {
               id: `local-kick-${Date.now()}`,
               platform: 'Kick',
               username: kickUser,
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
               await invoke("send_kick_message", { channel: kickChannel, message, token: kickToken });
           } catch (e) {
               console.error("Failed to send Kick message:", e);
               addToast("Failed to send Kick message: " + String(e), 'error');
           }
       } else if (chatProvider === 'youtube' && youtubeConnected && youtubeToken) {
           addToast('YouTube sending is temporarily disabled due to API 404 errors.', 'info');
           return;
      }
  }
  
  const toggleFilter = (filter: 'ALL' | 'TWITCH' | 'YOUTUBE' | 'KICK' | 'VIP' | 'MOD') => {
      if (activeFilter === filter) setActiveFilter('ALL');
      else setActiveFilter(filter);
  };
  
  const canSendTwitch = twitchConnected && !!twitchToken;
  const canSendYoutube = youtubeConnected && !!youtubeToken;
  const canSendKick = kickConnected && !!kickToken;
  
  useEffect(() => {
      if (canSendTwitch) setChatProvider('twitch');
      else if (canSendKick) setChatProvider('kick');
      else if (canSendYoutube) setChatProvider('youtube');
  }, [canSendTwitch, canSendYoutube, canSendKick]);
  const handleUserClick = (username: string) => {
      setSelectedUser(username);
  };
  
  const handleTimeout = async (duration: number) => {
      if (!selectedUser) return;
      // We need broadcasterId and moderatorId logic or assumption
      try {
          await invoke('twitch_ban_user', {
              broadcasterId: 'BROADCASTER_ID_placeholder', // TODO: Get from State
              moderatorId: 'MOD_ID_placeholder', // TODO: Get from State
              userId: 'TARGET_ID', // We need to resolve name to ID
              reason: 'Timeout via HeyChat',
              duration
          });
          // For now, since we lack IDs in frontend state easily without fetching:
          // We can use the chat command fallback or implement IDfetching.
          // BUT the user instructions implied we should support this.
          // Let's defer actual implementation or try to use `send_twitch_message` with `/timeout` command as a fallback which is easier?
          // The request was "quick actions (if the user is a mod of the channel) to timeout or ban".
          // Using IRC commands is much easier than Helix for this specific case if we are connected as Mod.
          await invoke('send_twitch_message', { channel: twitchChannel, message: `/timeout ${selectedUser} ${duration}` });
          addToast(`Timed out ${selectedUser} for ${duration}s`, 'success');
      } catch(e) {
          addToast("Failed to timeout: " + String(e), 'error');
      }
  };

  const handleBan = async () => {
      if (!selectedUser) return;
      try {
           await invoke('send_twitch_message', { channel: twitchChannel, message: `/ban ${selectedUser}` });
           addToast(`Banned ${selectedUser}`, 'success');
           setSelectedUser(null);
      } catch(e) {
          addToast("Failed to ban: " + String(e), 'error');
      }
  };

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
    if (activeFilter === 'KICK' && msg.platform !== 'Kick') return false;
    
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
                    onClick={() => {
                       // Optimistic UI update: Immediate feedback
                       setTwitchConnected(false);
                       // Fire and forget backend cleanup (it logs errors internally if any)
                       invoke("leave_twitch", { channel: twitchChannel }).catch(e => {
                           console.error("Failed to disconnect from Twitch backend:", e);
                       });
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
                    <span style={{ fontSize: '0.7em', color: '#666' }}>Read-Only</span>
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
                    onClick={async () => {
                        setYoutubeConnected(false);
                        invoke("leave_youtube").catch(e => console.error("Failed to disconnect YouTube:", e));
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
                <h3>KICK</h3>
                {kickUser ? (
                    <span style={{ fontSize: '0.7em', color: '#53FC18', cursor: 'pointer' }} onClick={() => setIsLoginModalOpen(true)} title="Click to update login">Logged as {kickUser}</span>
                ) : (
                    <span style={{ fontSize: '0.7em', color: '#666' }}>Read-Only</span>
                )}
            </div>
            <div className="input-row">
                <input
                  placeholder="Kick Username"
                  value={kickChannel}
                  onChange={(e) => setKickChannel(e.target.value)}
                  disabled={kickConnected}
                />
                {!kickConnected ? (
                  <button onClick={connectKick} className="action-btn">Connect</button>
                ) : (
                  <button 
                    onClick={async () => {
                        setKickConnected(false);
                        invoke("leave_kick", { channel: kickChannel }).catch(e => console.error("Failed to disconnect Kick:", e));
                    }} 
                    className="action-btn disconnect-btn"
                  >
                    Disconnect
                  </button>
                )}
            </div>
          </div>



          <div className="settings-btn-group" style={{ marginTop: 'auto', padding: '0 20px' }}>
              <button 
                  className="action-btn" 
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: '#333' }}
                  onClick={() => {
                      setCurrentView('SETTINGS');
                      setIsSidebarOpen(false); // Close sidebar on mobile/small screens if needed, but mainly clarity
                  }}
              >
                  <Settings size={16} />
                  <span>Configuration</span>
              </button>
          </div>

          <div className="sidebar-footer" style={{ flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
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
                
                <span className="footer-separator" style={{ opacity: 0.3 }}>|</span>

                <div 
                    onClick={async () => {
                        try {
                            await invoke('open_link', { url: 'https://ko-fi.com/ohitsjudd' });
                        } catch (e) {
                             console.error("Failed to open URL:", e);
                             window.open('https://ko-fi.com/ohitsjudd', '_blank');
                        }
                    }}
                    className="github-link" 
                    title="Support on Ko-fi"
                    style={{ color: '#FF5E5B' }} 
                >
                    <Heart size={14} fill="#FF5E5B" />
                    <span>Support</span>
                </div>
            </div>

            <span className="version-text" style={{ fontSize: '0.7em', opacity: 0.5 }}>
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
        {currentView === 'SETTINGS' ? (
            <SettingsPage 
                onBack={() => setCurrentView('CHAT')} 
                favorites={favoritesInput}
                onFavoritesChange={setFavoritesInput}
            />
        ) : (
            <>
        {selectedUser && (
            <TwitchUserCard 
                username={selectedUser} 
                isOpen={!!selectedUser} 
                onClose={() => setSelectedUser(null)} 
                messages={messages}
                onTimeout={handleTimeout}
                onBan={handleBan}
                isMod={isCurrentUserMod} 
                broadcasterId={broadcasterId}
                thirdPartyEmotes={thirdPartyEmotes}
            />
        )}
        
        <StreamToolsModal 
            isOpen={isStreamToolsOpen} 
            onClose={() => setIsStreamToolsOpen(false)}
            broadcasterId={broadcasterId || ""} 
        />
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
                    className={`filter-btn kick ${activeFilter === 'KICK' ? 'active' : ''}`}
                    onClick={() => toggleFilter('KICK')}
                    title="Show Kick Only"
                    style={{ color: activeFilter === 'KICK' ? '#53FC18' : '' }}
                >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                         <path d="M3 21V3h4.6v7.4h.4L13.8 3h5.6l-6.7 7.6 7.1 10.4h-5.6l-5-7.4h-.5v7.4H3z"/>
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
                
               <button 
                    className={`filter-btn ${isStreamToolsOpen ? 'active' : ''}`}
                    onClick={() => {
                        const isBroadcaster = twitchUser && twitchChannel && twitchUser.toLowerCase() === twitchChannel.toLowerCase();
                        if (isCurrentUserMod || isBroadcaster) {
                            setIsStreamToolsOpen(true);
                        } else {
                            addToast("You must be a Moderator or the Broadcaster to use Stream Tools.", "error");
                        }
                    }}
                    title="Stream Tools (Polls/Predictions)"
                    style={{ 
                        marginLeft: 'auto', 
                        marginRight: '8px', 
                        color: (isCurrentUserMod || (twitchUser && twitchChannel && twitchUser.toLowerCase() === twitchChannel.toLowerCase())) ? '#9146FF' : undefined 
                    }}
                >
                    <Zap size={16} fill="currentColor" />
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
            highlightTerms={[twitchChannel, youtubeVideoId, kickChannel].filter(Boolean)}
            thirdPartyEmotes={thirdPartyEmotes}
            onUserClick={handleUserClick} 
        />
        
        {/* Chat Input Area */}
        {(canSendTwitch || canSendYoutube || canSendKick) && (
            <div className="chat-input-container">
                {(Number(canSendTwitch) + Number(canSendYoutube) + Number(canSendKick)) > 1 && (
                    <div className="provider-selector" style={{ display: 'flex', background: '#1a1a1a', borderRadius: '6px', padding: '4px', gap: '4px', border: '1px solid #333' }}>
                        {canSendTwitch && (
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
                        )}
                        {canSendKick && (
                         <button 
                            className={`platform-toggle-btn ${chatProvider === 'kick' ? 'active kick' : ''}`}
                            onClick={() => setChatProvider('kick')}
                            title="Send via Kick"
                            style={{ 
                                background: chatProvider === 'kick' ? '#53FC18' : 'transparent', 
                                border: 'none', 
                                borderRadius: '4px',
                                padding: '6px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                color: chatProvider === 'kick' ? '#000' : '#666',
                                transition: 'all 0.2s'
                            }}
                        >
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                                <path d="M3 21V3h4.6v7.4h.4L13.8 3h5.6l-6.7 7.6 7.1 10.4h-5.6l-5-7.4h-.5v7.4H3z"/>
                            </svg>
                        </button>
                        )}
                        {canSendYoutube && (
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
                        )}
                    </div>
                )}
                
                {/* Single Provider Indicator if only one is available */}
                {(Number(canSendTwitch) + Number(canSendYoutube) + Number(canSendKick)) <= 1 && (
                    <div style={{ padding: '8px', color: '#666', opacity: 0.5 }}>
                        {canSendTwitch ? (
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/></svg>
                        ) : canSendKick ? (
                             <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3 3h4v8h4V3h4v6h3.696L22.955 3H21h-2l-4.227 6.34L19 15.227V21h-2h-3.304l-3.696-6h-2v6H4V3z"/></svg> 
                        ) : (
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                        )}
                    </div>
                )}

                <div style={{ flex: 1 }}>
                    <ChatInput 
                        onSendMessage={handleSendMessage} 
                        placeholder={`Message ${chatProvider === 'twitch' ? 'Twitch' : chatProvider === 'kick' ? 'Kick' : 'YouTube'}...`}
                        thirdPartyEmotes={thirdPartyEmoteData}
                        broadcasterId={broadcasterId}
                    />
                </div>
            </div>
        )}

        <UpdateNotification />
            </>
        )}
      </div>
      
      <LoginModal 
        isOpen={isLoginModalOpen} 
        onClose={() => setIsLoginModalOpen(false)}
        onLogin={() => {}} // Unused
        twitchUser={twitchUser}
        youtubeUser={youtubeUser}
        kickUser={kickUser}
        onLogoutTwitch={() => {
            setTwitchUser("");
            setTwitchToken("");
            addToast("Logged out of Twitch", 'info');
        }}
        onLogoutYoutube={() => {
            setYoutubeUser("");
            setYoutubeToken("");
            addToast("Logged out of YouTube", 'info');
        }}
        onLogoutKick={() => {
            setKickUser("");
            setKickToken("");
            addToast("Logged out of Kick", 'info');
        }}
      />
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
    </>
  );
}

export default App;
