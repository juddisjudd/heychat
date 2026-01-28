import React, { useEffect, useRef } from 'react';
import { ChatMessage } from '../types';
import { ChatMessageItem } from "./ChatMessageItem";

interface Props {
    messages: ChatMessage[];
    favorites: string[];
    highlightTerms: string[];
}

export const ChatList: React.FC<Props> = ({ messages, favorites, highlightTerms }) => {
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (
        <div className="chat-list">
            {messages.map((msg) => (
                <ChatMessageItem 
                    key={msg.id} 
                    msg={msg} 
                    isFavorite={favorites.includes(msg.username.toLowerCase())}
                    highlightTerms={highlightTerms}
                />
            ))}
            <div ref={bottomRef} />
        </div>
    );
};
