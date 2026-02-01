import { renderMessageWithEmotes } from '../utils/chatRenderer';
import { EmoteMap } from '../utils/emotes';
import { useMemo, useEffect, useState, useRef } from 'react';
import { X, Shield, Clock, Ban, MessageSquare, Calendar, Heart, Star } from 'lucide-react';
import { ChatMessage } from '../types';
import { invoke } from '@tauri-apps/api/core';

interface Props {
  username: string;
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[]; 
  onTimeout: (duration: number) => void;
  onBan: () => void;
  isMod: boolean;
  broadcasterId: string | null;
  thirdPartyEmotes?: EmoteMap;
}

interface TwitchUserCardData {
  display_name: string;
  profile_image_url: string | null;
  created_at: string | null;
  followed_at: string | null;
  is_subscribed: boolean;
  subscription_tier: string | null;
  months_subscribed: number | null;
}

export const TwitchUserCard = ({ username, isOpen, onClose, messages, onTimeout, onBan, isMod, broadcasterId, thirdPartyEmotes }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [userData, setUserData] = useState<TwitchUserCardData | null>(null);

  if (!isOpen) return null;

  // Filter messages for this user, last 200
  const userMessages = useMemo(() => {
    return messages
        .filter(m => m.username.toLowerCase() === username.toLowerCase())
        .slice(-200); 
  }, [messages, username]);

  // Determine Sub Info from badges (Fallback for when API fails or not broadcaster)
  const subInfo = useMemo(() => {
      // Find maximum subscriber badge version
      let maxMonths = 0;
      let foundSubBadge = false;

      // Debug: Log badges for this user
      if (userMessages.length > 0) {
          console.log(`Badges for ${username}:`, userMessages.map(m => m.badges).flat());
      }

      for (const msg of userMessages) {
          const subBadge = msg.badges.find(b => b.startsWith('subscriber') || b.startsWith('founder'));
          if (subBadge) {
              foundSubBadge = true;
              const parts = subBadge.split('/');
              if (parts.length > 1) {
                  const months = parseInt(parts[1], 10);
                  if (!isNaN(months) && months > maxMonths) {
                      maxMonths = months;
                  }
              }
          }
      }

      const monthsDisplay = maxMonths > 0 ? `${maxMonths}` : (foundSubBadge ? "0" : "?");
       // Note: "0" usually means base badge (1st month)
       // If maxMonths is 0 but foundSubBadge is true, they ARE a sub, just on the first badge tier.
       
      return { isSub: foundSubBadge, months: monthsDisplay };
  }, [userMessages, username]);

  // Helper to format tier
  const getTierDisplay = (tier: string | null) => {
      if (!tier) return null;
      const t = parseInt(tier, 10);
      if (isNaN(t)) return tier;
      
      // If tier is like 1000, 2000, 3000 -> T1, T2, T3
      if (t >= 1000) {
          return `T${Math.floor(t / 1000)}`;
      }
      // If tier is like 1, 2, 3 -> T1, T2, T3
      return `T${t}`;
  };

  useEffect(() => {
      if (containerRef.current) {
          containerRef.current.scrollTop = containerRef.current.scrollHeight;
      }
  }, [userMessages, isOpen]);

  // Fetch User Data
  useEffect(() => {
      const fetchData = async () => {
          if (!isOpen || !username || !broadcasterId) return;
          
          try {
              const data = await invoke<TwitchUserCardData>('twitch_get_user_card_data', {
                  broadcasterId,
                  targetUsername: username
              });
              console.log("Twitch User Data:", data);
              setUserData(data);
          } catch (e) {
              console.error("Failed to fetch user card data:", e);
          }
      };
      
      fetchData();
  }, [isOpen, username, broadcasterId]);

  return (
    <div className="user-card-overlay" onClick={onClose}>
      <div className="user-card" onClick={e => e.stopPropagation()}>
        <div className="user-card-header">
          <h3>{username}</h3>
          <button onClick={onClose} className="close-btn"><X size={16} /></button>
        </div>

        <div className="user-card-content">
             {/* Enhanced Header */}
             {userData && (
                 <div className="user-profile-header">
                     <div className="avatar">
                        {userData.profile_image_url ? (
                            <img src={userData.profile_image_url} alt={userData.display_name} />
                        ) : (
                            <div className="avatar-placeholder">{userData.display_name[0]}</div>
                        )}
                     </div>
                     <div className="user-info">
                         <h2>{userData.display_name}</h2>
                         <div className="meta-badges">
                             {isMod && <span className="badge mod">MOD</span>}
                             {(userData.is_subscribed || subInfo.isSub) && <span className="badge sub">SUB</span>}
                             {userData.subscription_tier && (
                                 <span className="badge tier">{getTierDisplay(userData.subscription_tier)}</span>
                             )}
                         </div>
                     </div>
                 </div>
             )}

             {/* Stats Grid */}
             {userData && (
                 <div className="user-stats">
                     <div className="stat-row">
                         <Calendar size={14} />
                         <span>Created: {userData.created_at ? new Date(userData.created_at).toLocaleDateString() : 'Unknown'}</span>
                     </div>
                     <div className="stat-row">
                         <Heart size={14} />
                         <span>
                             {userData.followed_at 
                                ? `Followed: ${new Date(userData.followed_at).toLocaleDateString()}` 
                                : 'Not Following'}
                         </span>
                     </div>
                     {(userData.is_subscribed || subInfo.isSub) && (
                         <div className="stat-row highlight">
                             <Star size={14} />
                             <span>Subscribed: {
                                 userData.months_subscribed !== null && userData.months_subscribed !== undefined
                                 ? `${userData.months_subscribed} months`
                                 : `~${subInfo.months} months`
                             }</span>
                         </div>
                     )}
                 </div>
             )}

            <div className="recent-messages">
                <h4><MessageSquare size={14} /> Recent Messages</h4>
                <div className="messages-list" ref={containerRef}>
                    {userMessages.length === 0 ? (
                        <p className="no-messages">No recent messages recorded.</p>
                    ) : (
                        userMessages.map(msg => (
                            <div key={msg.id} className="history-item">
                                <span className="timestamp">
                                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                <span className="text">
                                  {renderMessageWithEmotes(msg.message, msg.emotes, [], thirdPartyEmotes)}
                                </span>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {isMod && (
                <div className="mod-actions">
                    <h4><Shield size={14} /> Moderation</h4>
                    <div className="action-grid">
                        <button className="mod-btn timeout" onClick={() => onTimeout(600)}>
                            <Clock size={14} /> 10m
                        </button>
                        <button className="mod-btn timeout" onClick={() => onTimeout(3600)}>
                            <Clock size={14} /> 1h
                        </button>
                        <button className="mod-btn ban" onClick={onBan}>
                            <Ban size={14} /> Ban
                        </button>
                    </div>
                </div>
            )}
        </div>
      </div>
      <style>{`
        .user-profile-header {
            display: flex;
            gap: 15px;
            padding-bottom: 15px;
            border-bottom: 1px solid #333;
            margin-bottom: 15px;
            align-items: center;
        }
        .avatar {
            width: 64px;
            height: 64px;
            border-radius: 50%;
            overflow: hidden;
            background: #333;
            flex-shrink: 0;
            border: 2px solid #9146FF;
        }
        .avatar img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        .avatar-placeholder {
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            color: #aaa;
            font-weight: bold;
        }
        .user-info h2 {
            margin: 0;
            font-size: 1.4rem;
            color: #fff;
        }
        .meta-badges {
            display: flex;
            gap: 8px;
            margin-top: 6px;
        }
        .badge {
            font-size: 0.7rem;
            padding: 2px 6px;
            border-radius: 4px;
            font-weight: bold;
            text-transform: uppercase;
        }
        .badge.mod {
            background: #22c55e;
            color: #000;
        }
        .badge.sub {
            background: #9146FF;
            color: #fff;
        }

        .user-stats {
            background: #27272a;
            border-radius: 6px;
            padding: 10px;
            margin-bottom: 15px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            font-size: 0.9rem;
            color: #ddd;
        }
        .stat-row {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .stat-row.highlight {
            color: #eab308;
            font-weight: 500;
        }

        /* ... reused styles ... */
        .user-card-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        }
        .user-card {
            background: #18181b;
            border: 1px solid #333;
            border-radius: 8px;
            width: 500px;
            max-width: 90vw;
            box-shadow: 0 10px 25px rgba(0,0,0,0.5);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            max-height: 80vh; 
        }
        .user-card-header {
            padding: 12px 16px;
            background: #27272a;
            border-bottom: 1px solid #333;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
        }
        .user-card-header h3 {
            margin: 0;
            color: #fff;
            font-size: 1.1rem;
        }
        .close-btn {
            background: none;
            border: none;
            color: #aaa;
            cursor: pointer;
            padding: 4px;
        }
        .close-btn:hover {
            color: #fff;
        }
        .user-card-content {
            padding: 16px;
            overflow-y: auto;
            flex-grow: 1;
            display: flex;
            flex-direction: column;
        }
        .recent-messages {
            margin-bottom: 20px;
            flex-grow: 1;
            display: flex;
            flex-direction: column;
            min-height: 150px;
        }
        .recent-messages h4, .mod-actions h4 {
            margin: 0 0 10px 0;
            font-size: 0.9rem;
            color: #aaa;
            display: flex;
            align-items: center;
            gap: 6px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            flex-shrink: 0;
        }
        .messages-list {
            background: #000;
            border-radius: 6px;
            border: 1px solid #333;
            flex-grow: 1;
            overflow-y: auto;
            max-height: 300px; /* Limit height to prevent infinite growth */
            /* Scrollbar styling */
            scrollbar-width: thin;
            scrollbar-color: #444 #111;
        }
        .history-item {
            padding: 6px 10px;
            border-bottom: 1px solid #222;
            font-size: 0.9rem;
            color: #ddd;
            display: flex;
            gap: 8px;
            align-items: baseline; /* Align timestamp with first line of text */
        }
        .history-item:last-child {
            border-bottom: none;
        }
        .history-item .timestamp {
            color: #666;
            font-size: 0.8em;
            white-space: nowrap;
            /* No margin needed with baseline alignment */
        }
        .no-messages {
            padding: 20px;
            text-align: center;
            color: #666;
            font-style: italic;
        }
        .mod-actions {
            flex-shrink: 0;
        }
        .action-grid {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 10px;
        }
        .mod-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            border: none;
            border-radius: 4px;
            padding: 8px;
            font-weight: 600;
            cursor: pointer;
            transition: opacity 0.2s;
        }
        .mod-btn:hover {
            opacity: 0.8;
        }
        .mod-btn.timeout {
            background: #eab308;
            color: #000;
        }
        .mod-btn.ban {
            background: #ef4444;
            color: #fff;
        }
      `}</style>
    </div>
  );
};
