import React from 'react';
import { Emote } from "../types";

// Helper to replace text with emote images AND highlight mentions
export const renderMessageWithEmotes = (text: string, emotes?: Emote[], highlightTerms?: string[], thirdPartyEmotes?: Map<string, string>) => {
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

    // 2. Process Kick Emotes (String replacement in text nodes)
    // Format: [emote:ID:Name] - Name allows alphanumeric, dashes, underscores
    const kickEmoteRegex = /\[emote:(\d+):([\w\-]+)\]/g;
    
    // We need to process existing nodes to find these strings
    let kickProcessedParts: React.ReactNode[] = [];
    processedNodeParts.forEach(part => {
        if (typeof part === 'string') {
            const split = part.split(kickEmoteRegex);
            // Split will be: ["text before", "ID", "Name", "text after", ...]
            for (let i = 0; i < split.length; i += 3) {
                // 1. Text part
                if (split[i]) kickProcessedParts.push(split[i]);
                
                // 2. Emote part (if exists)
                if (i + 1 < split.length) {
                    const id = split[i+1];
                    const name = split[i+2];
                    const url = `https://files.kick.com/emotes/${id}/fullsize`;
                    kickProcessedParts.push(
                        <img 
                            key={`emote-kick-${id}-${i}`} 
                            src={url} 
                            alt={name} 
                            title={name} 
                            className="chat-emote" 
                        />
                    );
                }
            }
        } else {
            kickProcessedParts.push(part);
        }
    });
    processedNodeParts = kickProcessedParts;

    // 3. Process 3rd Party Emotes (String replacement in text nodes)
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

    // 4. Process Mentions (String replacement in text nodes)
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
