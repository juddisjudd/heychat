import React from 'react';
import { ChatMessage, Emote } from "../types";
import { Star } from "lucide-react"; // Import necessary icons

// Helper to replace text with emote images
// Helper to replace text with emote images AND highlight mentions
const renderMessageWithEmotes = (text: string, emotes?: Emote[], highlightTerms?: string[], thirdPartyEmotes?: Map<string, string>) => {
    // 1. Split by emotes first (highest priority, Twitch/YT native)
    
    // Sort native emotes
    const sortedEmotes = emotes ? [...emotes].sort((a, b) => a.start - b.start) : [];
    
    // Process Native Emotes (Slicing style)
    let processedNodeParts: React.ReactNode[] = [];
    
    if (sortedEmotes.length === 0) {
        processedNodeParts = [text];
    } else {
        let lastIndex = 0;
        sortedEmotes.forEach(emote => {
            if (emote.start > lastIndex) {
                 processedNodeParts.push(text.substring(lastIndex, emote.start));
            }
            const url = emote.id.startsWith('http') 
                ? emote.id 
                : `https://static-cdn.jtvnw.net/emoticons/v2/${emote.id}/default/dark/1.0`;
            processedNodeParts.push(
                <img key={`emote-native-${emote.id}-${emote.start}`} src={url} alt={emote.code} title={emote.code} className="chat-emote" />
            );
            lastIndex = emote.end + 1;
        });
        if (lastIndex < text.length) {
            processedNodeParts.push(text.substring(lastIndex));
        }
    }

    // 2. Process 3rd Party Emotes (String replacement in text nodes)
    // Only if we have them
    if (thirdPartyEmotes && thirdPartyEmotes.size > 0) {
        const nextParts: React.ReactNode[] = [];
        
        processedNodeParts.forEach(part => {
             if (typeof part === 'string') {
                 // Split by spaces to find emote codes
                 // Using regex bound by spaces or start/end of string
                 // Note: Emote codes can be "KEKW" or ":)" or "Ah_Yes"
                 // Simple split by space is safest for chat generally
                 const words = part.split(/(\s+)/); // Capture spaces to preserve them
                 
                 words.forEach((word, idx) => {
                     const cleanWord = word.trim();
                     if (thirdPartyEmotes.has(cleanWord)) {
                         const url = thirdPartyEmotes.get(cleanWord)!;
                         nextParts.push(
                             <img key={`emote-3p-${idx}-${cleanWord}`} src={url} alt={cleanWord} title={cleanWord} className="chat-emote" />
                         );
                     } else {
                         nextParts.push(word);
                     }
                 });
             } else {
                 nextParts.push(part);
             }
        });
        processedNodeParts = nextParts;
    }

    // 3. Process Mentions (String replacement in text nodes)
    const cleanHighlightTerms = (highlightTerms || [])
        .map(t => t.trim().replace(/^@/, '').toLowerCase())
        .filter(t => t.length > 0);

    const generalMentionRegex = /(@[\w]+)(?![\w])/gi;

    return processedNodeParts.map((part, index) => {
        if (typeof part !== 'string') return part;

        // Skip if whitespace only (optimization)
        if (!part.trim()) return part;

        const split = part.split(generalMentionRegex);
        if (split.length === 1) return part;

        return (
            <span key={`mention-part-${index}`}>
                {split.map((chunk, i) => {
                     if (chunk.match(generalMentionRegex)) {
                        const cleanChunk = chunk.replace(/^@/, '').toLowerCase();
                        if (cleanHighlightTerms.includes(cleanChunk)) {
                            return <span key={i} className="mention-highlight">{chunk}</span>;
                        } else {
                            return <span key={i} className="mention-bold">{chunk}</span>;
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
  thirdPartyEmotes?: Map<string, string>;
}

export const ChatMessageItem = ({ msg, isFavorite, highlightTerms, thirdPartyEmotes }: Props) => {
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
        </div><span className="username" style={{ color: msg.color || (isFavorite ? '#ffd700' : 'inherit') }}>{msg.username}</span><span className="separator">:</span>
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
