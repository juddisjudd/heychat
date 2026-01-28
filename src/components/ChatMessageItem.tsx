import { ChatMessage, Emote } from "../types";
import { Star } from "lucide-react"; // Import necessary icons

// Helper to replace text with emote images
// Helper to replace text with emote images AND highlight mentions
const renderMessageWithEmotes = (text: string, emotes?: Emote[], highlightTerms?: string[]) => {
    // 1. Split by emotes first (highest priority)
    const emoteParts: (string | JSX.Element)[] = [];
    
    if (!emotes || emotes.length === 0) {
        emoteParts.push(text);
    } else {
        const sortedEmotes = [...emotes].sort((a, b) => a.start - b.start);
        let lastIndex = 0;

        sortedEmotes.forEach(emote => {
            if (emote.start > lastIndex) {
                emoteParts.push(text.substring(lastIndex, emote.start));
            }
            
            const url = `https://static-cdn.jtvnw.net/emoticons/v2/${emote.id}/default/dark/1.0`;
            emoteParts.push(
                <img 
                    key={`emote-${emote.start}-${emote.id}`}
                    src={url} 
                    alt={emote.code}
                    title={emote.code}
                    style={{ verticalAlign: 'middle', maxHeight: '28px', margin: '0 2px' }} 
                />
            );
            lastIndex = emote.end + 1;
        });

        if (lastIndex < text.length) {
            emoteParts.push(text.substring(lastIndex));
        }
    }

    // 2. Process text parts for mentions
    // We want to highlight specific terms (channel name) AND bold any other @mentions
    const cleanHighlightTerms = (highlightTerms || [])
        .map(t => t.trim().replace(/^@/, '').toLowerCase())
        .filter(t => t.length > 0);

    // Regex to find ANY string starting with @ followed by word characters
    // (?:) non-capturing group not needed for the whole thing if we want to capture the mention itself
    const generalMentionRegex = /(@[\w]+)(?![\w])/gi;

    return emoteParts.map((part, index) => {
        if (typeof part !== 'string') return part;

        const split = part.split(generalMentionRegex);
        if (split.length === 1) return part;

        return (
            <span key={`part-${index}`}>
                {split.map((chunk, i) => {
                    // Check if chunk matches the basic mention structure
                    if (chunk.match(generalMentionRegex)) {
                        const cleanChunk = chunk.replace(/^@/, '').toLowerCase();
                        
                        // Check if it's a specific highlight term (Channel Mention)
                        if (cleanHighlightTerms.includes(cleanChunk)) {
                            return (
                                <span key={i} style={{ color: '#ffff00', fontWeight: 'bold' }}>
                                    {chunk}
                                </span>
                            );
                        } else {
                            // Generic Mention (Bold only)
                            return (
                                <span key={i} style={{ fontWeight: 'bold' }}>
                                    {chunk}
                                </span>
                            );
                        }
                    }
                    return chunk;
                })}
            </span>
        );
    });
};

interface Props {
  msg: ChatMessage;
  isFavorite: boolean;
  highlightTerms: string[];
}

export const ChatMessageItem = ({ msg, isFavorite, highlightTerms }: Props) => {
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
    <div className={messageClass}>
      <div className="message-meta">
        {/* Badges / Icons */}
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
      
      {msg.msg_type === 'sub' && msg.system_message && (
          <div className="system-text" style={{ fontSize: '0.85em', fontStyle: 'italic', marginBottom: '2px', color: '#a970ff' }}>
              {msg.system_message}
          </div>
      )}

      {/* Only render message text if it exists (for subs it might be empty if they didn't type anything) */}
      {msg.message && (
          <div className="text" style={{ wordBreak: "break-word" }}>
            {renderMessageWithEmotes(msg.message, msg.emotes, highlightTerms)}
          </div>
      )}
    </div>
  );
};
