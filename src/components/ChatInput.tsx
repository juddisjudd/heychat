import { useState, KeyboardEvent, useRef, useEffect } from 'react';
import { Send, Smile } from 'lucide-react';
import { EmoteData } from '../utils/emotes';
import { EmotePicker } from './EmotePicker';

interface ChatInputProps {
    onSendMessage: (message: string) => void;
    disabled?: boolean;
    placeholder?: string;
    thirdPartyEmotes?: EmoteData | null;
    broadcasterId?: string | null;
}

export function ChatInput({ onSendMessage, disabled, placeholder = "Send a message...", thirdPartyEmotes, broadcasterId }: ChatInputProps) {
    const [message, setMessage] = useState('');
    const [showEmotes, setShowEmotes] = useState(false);
    const contentEditableRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setShowEmotes(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const serializeContent = () => {
        if (!contentEditableRef.current) return '';
        let text = '';
        const traverse = (node: Node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                text += node.textContent;
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node as HTMLElement;
                if (el.tagName === 'IMG' && el.hasAttribute('data-emote-code')) {
                    text += ' ' + el.getAttribute('data-emote-code') + ' ';
                } else if (el.tagName === 'BR') {
                    // text += '\n'; // Ignore BRs for now in single line chat
                } else {
                    for (let i = 0; i < node.childNodes.length; i++) {
                        traverse(node.childNodes[i]);
                    }
                }
            }
        };
        traverse(contentEditableRef.current);
        return text.trim().replace(/\s+/g, ' ');
    };

    const handleInput = () => {
        const text = serializeContent();
        setMessage(text);
    };

    const handleSend = () => {
        const text = serializeContent();
        if (text && !disabled) {
            onSendMessage(text);
            if (contentEditableRef.current) {
                contentEditableRef.current.innerHTML = '';
            }
            setMessage('');
            setShowEmotes(false);
        }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const insertEmote = (code: string, url?: string) => {
        if (!contentEditableRef.current) return;
        
        // Focus logic
        contentEditableRef.current.focus();

        // Create the image element
        const img = document.createElement('img');
        if (url) {
            img.src = url;
            img.alt = code;
            img.title = code;
            img.setAttribute('data-emote-code', code);
            img.className = 'inline-emote';
        } else {
            // Fallback if no URL (should rarely happen with picker)
            document.execCommand('insertText', false, ` ${code} `);
            return;
        }

        // Space padding
        const space = document.createTextNode('\u00A0'); // Non-breaking space for visual separation
        
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0 && contentEditableRef.current.contains(selection.anchorNode)) {
            const range = selection.getRangeAt(0);
            range.deleteContents();
            range.insertNode(space);
            range.insertNode(img);
            range.insertNode(document.createTextNode('\u00A0')); // Space after
            
            // Move cursor to end
            range.setStartAfter(img.nextSibling!);
            range.setEndAfter(img.nextSibling!);
            selection.removeAllRanges();
            selection.addRange(range);
        } else {
            // Append to end if no selection
            contentEditableRef.current.appendChild(document.createTextNode(' '));
            contentEditableRef.current.appendChild(img);
            contentEditableRef.current.appendChild(document.createTextNode(' '));
            
            // Move cursor to end
            const range = document.createRange();
            range.selectNodeContents(contentEditableRef.current);
            range.collapse(false);
            selection?.removeAllRanges();
            selection?.addRange(range);
        }

        handleInput(); // Trigger state update
    };

    return (
        <div className="chat-input-row" ref={containerRef} style={{ position: 'relative' }}>
            <EmotePicker 
                isOpen={showEmotes} 
                onClose={() => setShowEmotes(false)} 
                onSelect={insertEmote}
                thirdPartyEmotes={thirdPartyEmotes || null}
                broadcasterId={broadcasterId || null}
            />
            
            <button 
                className="emote-toggle-btn" 
                onClick={() => setShowEmotes(!showEmotes)}
                title="Emotes"
            >
                <Smile size={18} />
            </button>

            <div 
                ref={contentEditableRef}
                className="chat-input-field content-editable"
                contentEditable={!disabled}
                onInput={handleInput}
                onKeyDown={handleKeyDown}
                role="textbox"
                aria-multiline="false"
                data-placeholder={placeholder}
            />
            
            {/* Fallback placeholder CSS logic handled via :empty:before */}

            <button 
                onClick={handleSend} 
                disabled={disabled || !message.trim()}
                className="send-btn"
            >
                <Send size={18} />
            </button>
            <style>{`
                .chat-input-row {
                    display: flex;
                    gap: 8px;
                    background: #27272a;
                    padding: 8px 12px;
                    border-radius: 8px;
                    align-items: center; /* Center align items to fix weird offset */
                    min-height: 52px; /* Ensure content box has height */
                }
                .chat-input-field {
                    flex: 1;
                    background: transparent;
                    border: none;
                    color: #fff;
                    outline: none;
                    font-size: 0.95em;
                    min-height: 24px;
                    max-height: 100px;
                    overflow-y: auto;
                    line-height: 1.5;
                    padding: 4px 0; /* Slight padding for text breathing room */
                    white-space: pre-wrap;
                    word-break: break-word;
                    display: flex; /* Flex to align inline images */
                    flex-wrap: wrap;
                    align-items: center; 
                }
                /* Placeholder HACK */
                .chat-input-field:empty:before {
                    content: attr(data-placeholder);
                    color: #71717a;
                    pointer-events: none;
                    display: block; 
                }
                .inline-emote {
                    height: 24px; /* Matches line height roughly */
                    width: auto;
                    vertical-align: middle;
                    margin: 0 2px;
                    pointer-events: none;
                    display: inline-block;
                }
                .send-btn, .emote-toggle-btn {
                    background: none;
                    border: none;
                    color: #a1a1aa;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 8px;
                    border-radius: 6px;
                    transition: all 0.2s;
                    flex-shrink: 0; /* Prevent shrinking */
                    height: 36px;
                    width: 36px;
                }
                .send-btn:hover, .emote-toggle-btn:hover {
                    background: rgba(255,255,255,0.1);
                    color: #fff;
                }
                .send-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
            `}</style>
        </div>
    );
}
