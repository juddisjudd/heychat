import { ChatMessage } from "../types";
import { Star } from "lucide-react"; 
import { useChatSettings } from "../context/ChatSettingsContext";

import { renderMessageWithEmotes } from "../utils/chatRenderer";

interface Props {
  msg: ChatMessage;
  isFavorite: boolean;
  highlightTerms: string[];
  thirdPartyEmotes?: Map<string, string>;
  onUserClick?: (username: string) => void;
}

export const ChatMessageItem = ({ msg, isFavorite, highlightTerms, thirdPartyEmotes, onUserClick }: Props) => {
  const { settings } = useChatSettings();
  const isMod = msg.is_mod;
  const isVip = msg.is_vip;


  let messageClass = "chat-message-item";
  if (isFavorite) messageClass += " favorite-message";
  else if (isMod) messageClass += " mod-message";
  else if (isVip && msg.msg_type !== 'sub') messageClass += " vip-message";
  
  if (msg.msg_type === 'sub') {
      messageClass += " sub-message";
  }

  return (
    <div 
        className={messageClass}
        style={{
            fontSize: `${settings.fontSize}px`,
            lineHeight: settings.lineHeight,
            paddingTop: `${settings.messageSpacing / 2}px`,
            paddingBottom: `${settings.messageSpacing / 2}px`,
            '--mod-color': msg.platform === 'Kick' ? settings.kickModColor : settings.twitchModColor,
            '--vip-color': msg.platform === 'Kick' ? settings.kickVipColor : settings.twitchVipColor,
            '--member-color': settings.youtubeMemberColor
        } as any}
    >
      <div className="message-meta">
        {settings.showTimestamp && (
            <span className="timestamp" style={{ marginRight: '6px', opacity: 0.5, fontSize: '0.9em' }}>
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
        )}

        {/* Badges / Icons */}
        {settings.showBadges && (
            <div className="badges">
                {/* Show Mod/VIP badges even on subs */}
                {isFavorite && <Star size={14} className="favorite-badge" fill="currentColor" />}
                {isMod && <span className="mod-badge-text">MOD</span>}
                {isVip && <span className="vip-badge-text">VIP</span>}
                {msg.is_member && <span className="member-badge-text">MEMBER</span>}
                
                {/* Platform Icon */}
                {msg.platform === "Twitch" ? (
                    <span className="platform-icon" style={{color: '#9146FF'}}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                            <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/>
                        </svg>
                    </span>
                ) : msg.platform === "Kick" ? (
                    <span className="platform-icon" style={{color: '#53FC18'}}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                            <path d="M3 21V3h4.6v7.4h.4L13.8 3h5.6l-6.7 7.6 7.1 10.4h-5.6l-5-7.4h-.5v7.4H3z"/> 
                        </svg>
                    </span>
                ) : (
                    <span className="platform-icon" style={{color: '#FF0000'}}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                        </svg>
                    </span>
                )}
            </div>
        )}
        
        <span 
            className="username" 
            onClick={() => onUserClick?.(msg.username)}
            style={{ 
                color: settings.usernameColor === 'static' 
                    ? settings.staticUsernameColor 
                    : (msg.color || (isFavorite ? '#ffd700' : 'inherit')),
                cursor: 'pointer' 
            }}
        >
            {msg.username}
        </span>
        <span className="separator">:</span>
      </div>
      
      {msg.msg_type === 'sub' && msg.system_message && (
          <div className="system-text" style={{ fontSize: '0.85em', fontStyle: 'italic', marginBottom: '2px', color: '#a970ff' }}>
              {msg.system_message}
          </div>
      )}

      {/* Only render message text if it exists (for subs it might be empty if they didn't type anything) */}
      {msg.message && (
          <div className="text" style={{ wordBreak: "break-word" }}>
            {renderMessageWithEmotes(msg.message, msg.emotes, highlightTerms, thirdPartyEmotes)}
          </div>
      )}
    </div>
  );
};
