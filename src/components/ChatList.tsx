import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { ChatMessage } from '../types';
import { ChatMessageItem } from "./ChatMessageItem";

import { EmoteMap } from '../utils/emotes';

interface Props {
    messages: ChatMessage[];
    favorites: string[];
    highlightTerms: string[];
    thirdPartyEmotes?: EmoteMap;
}

export const ChatList: React.FC<Props> = ({ messages, favorites, highlightTerms, thirdPartyEmotes }) => {
    const bottomRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isAutoScroll, setIsAutoScroll] = React.useState(true);
    const [showScrollButton, setShowScrollButton] = React.useState(false);
    const isProgrammaticScroll = useRef(false);

    // Initial & Auto scroll - useLayoutEffect for immediate scrolling before paint
    useLayoutEffect(() => {
        if (isAutoScroll) {
            isProgrammaticScroll.current = true;
            bottomRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
            // Reset flag after a short delay to ensure the scroll event has fired/processed
            setTimeout(() => {
                isProgrammaticScroll.current = false;
            }, 100);
        }
    }, [messages, isAutoScroll]);

    const handleScroll = () => {
        if (!containerRef.current || isProgrammaticScroll.current) return;
        
        const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
        // Increased threshold to 150px for better tolerance during fast chat
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 150;

        setIsAutoScroll(isAtBottom);
        setShowScrollButton(!isAtBottom);
    };

    const scrollToBottom = () => {
        setIsAutoScroll(true);
        isProgrammaticScroll.current = true;
        bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        setTimeout(() => {
            isProgrammaticScroll.current = false;
        }, 500); // Longer timeout for smooth scroll
    };

    return (
        <div className="chat-list" ref={containerRef} onScroll={handleScroll}>
            {messages.map((msg) => (
                <ChatMessageItem 
                    key={msg.id} 
                    msg={msg} 
                    isFavorite={favorites.includes(msg.username.toLowerCase())}
                    highlightTerms={highlightTerms}
                    thirdPartyEmotes={thirdPartyEmotes}
                />
            ))}
            <div ref={bottomRef} />
            
            {showScrollButton && (
                <div 
                    className="scroll-pause-indicator"
                    onClick={scrollToBottom}
                >
                    More Messages ↓
                </div>
            )}
        </div>
    );
};
