import { ChatMessage, Emote } from "../types";
import { Star, Shield, Award } from "lucide-react"; // Import necessary icons

// Helper to replace text with emote images
const renderMessageWithEmotes = (text: string, emotes?: Emote[]) => {
    if (!emotes || emotes.length === 0) return text;

    // Emotes are ranges. We need to split string.
    // Twitch emote ranges are inclusive.
    // Sort emotes by start index
    const sortedEmotes = [...emotes].sort((a, b) => a.start - b.start);
    
    const parts = [];
    let lastIndex = 0;

    sortedEmotes.forEach(emote => {
        // Add text before emote
        if (emote.start > lastIndex) {
            parts.push(<span key={lastIndex}>{text.substring(lastIndex, emote.start)}</span>);
        }
        
        // Add emote image
        const url = `https://static-cdn.jtvnw.net/emoticons/v2/${emote.id}/default/dark/1.0`;
        parts.push(
            <img 
                key={emote.start + emote.id}
                src={url} 
                alt={emote.code}
                title={emote.code}
                style={{ verticalAlign: 'middle', maxHeight: '28px', margin: '0 2px' }} 
            />
        );

        lastIndex = emote.end + 1;
    });

    // Add remaining text
    if (lastIndex < text.length) {
        parts.push(<span key={lastIndex}>{text.substring(lastIndex)}</span>);
    }

    return parts;
};

interface Props {
  msg: ChatMessage;
  isFavorite: boolean;
}

export const ChatMessageItem = ({ msg, isFavorite }: Props) => {
  const isMod = msg.is_mod;
  const isVip = msg.is_vip;

  let messageClass = "chat-message-item";
  if (isFavorite) messageClass += " favorite-message";
  else if (isMod) messageClass += " mod-message";
  else if (isVip) messageClass += " vip-message";

  return (
    <div className={messageClass}>
      <div className="message-meta">
        {/* Badges / Icons */}
        <div className="badges">
            {isFavorite && <Star size={14} className="favorite-badge" fill="currentColor" />}
            {isMod && <Shield size={14} className="mod-badge" />}
            {isVip && <Award size={14} className="vip-badge" />}
            
            {/* Platform Icon */}
            {msg.platform === "Twitch" ? (
                <span className="platform-icon" style={{color: '#9146FF'}}>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                        <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/>
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

        <span className="username" style={{ color: msg.color || (isFavorite ? '#ffd700' : 'inherit') }}>
            {msg.username}
        </span>
        <span className="separator">:</span>
      </div>
      
      <div className="text" style={{ wordBreak: "break-word" }}>
        {renderMessageWithEmotes(msg.message, msg.emotes)}
      </div>
    </div>
  );
};
