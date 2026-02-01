import { useState, useEffect, useMemo } from 'react';
import { Search, X, Loader2, Lock } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { EmoteData } from '../utils/emotes';

interface TwitchEmote {
    id: string;
    name: string;
    emote_type: string;

    category?: string; // "Channel", "User", "Global"
    locked?: boolean;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (code: string, url?: string) => void;
    thirdPartyEmotes: EmoteData | null;
    broadcasterId: string | null;
}

type Tab = 'TWITCH' | '7TV' | 'BTTV' | 'FFZ';

export const EmotePicker = ({ isOpen, onClose, onSelect, thirdPartyEmotes, broadcasterId }: Props) => {
    const [activeTab, setActiveTab] = useState<Tab>('TWITCH');
    const [search, setSearch] = useState('');
    const [twitchEmotes, setTwitchEmotes] = useState<TwitchEmote[]>([]);
    const [loadingTwitch, setLoadingTwitch] = useState(false);
    const [hasFetchedTwitch, setHasFetchedTwitch] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && activeTab === 'TWITCH' && !hasFetchedTwitch && !loadingTwitch && !error && broadcasterId) {
            setLoadingTwitch(true);
            invoke<TwitchEmote[]>('twitch_get_user_emotes', { broadcasterId })
                .then(data => {
                    console.log("Fetched Twitch Emotes:", data.length);
                    setTwitchEmotes(data);
                })
                .catch(err => {
                    console.error("Failed to fetch twitch emotes:", err);
                    setError(String(err)); 
                })
                .finally(() => {
                    setLoadingTwitch(false);
                    setHasFetchedTwitch(true);
                });
        }
    }, [isOpen, activeTab, broadcasterId, hasFetchedTwitch, loadingTwitch, error]);

    interface GroupedEmote {
        category: string;
        items: { code: string; url: string; id: string; locked?: boolean }[];
    }

    const displayEmotesGrouped = useMemo<GroupedEmote[]>(() => {
        if (!thirdPartyEmotes) return [];

        let groups: GroupedEmote[] = [];
        
        // Helper to filter by search
        const filter = (list: { code: string; url: string; id: string; locked?: boolean }[]) => 
            list.filter(e => e.code.toLowerCase().includes(search.toLowerCase()));

        if (activeTab === 'TWITCH') {
            const channel = twitchEmotes.filter(e => e.category === 'Channel');
            const user = twitchEmotes.filter(e => e.category === 'User');
            const global = twitchEmotes.filter(e => e.category === 'Global');
            
            // If no categories found (legacy/fallback), just dump all in one
            if (channel.length === 0 && user.length === 0 && global.length === 0) {
                 const all = twitchEmotes.map(e => ({
                    code: e.name,
                    url: `https://static-cdn.jtvnw.net/emoticons/v2/${e.id}/default/dark/2.0`,
                    id: e.id,
                    locked: e.locked
                }));
                if (all.length > 0) groups.push({ category: 'All Twitch', items: filter(all) });
            } else {
                if (channel.length > 0) {
                    channel.sort((a, b) => Number(!!a.locked) - Number(!!b.locked));
                    groups.push({ 
                        category: 'Channel Emotes', 
                        items: filter(channel.map(e => ({ code: e.name, url: `https://static-cdn.jtvnw.net/emoticons/v2/${e.id}/default/dark/2.0`, id: e.id, locked: e.locked }))) 
                    });
                }
                if (user.length > 0) groups.push({ 
                    category: 'Your Emotes', 
                    items: filter(user.map(e => ({ code: e.name, url: `https://static-cdn.jtvnw.net/emoticons/v2/${e.id}/default/dark/2.0`, id: e.id, locked: e.locked }))) 
                });
                if (global.length > 0) groups.push({ 
                    category: 'Global', 
                    items: filter(global.map(e => ({ code: e.name, url: `https://static-cdn.jtvnw.net/emoticons/v2/${e.id}/default/dark/2.0`, id: e.id, locked: e.locked }))) 
                });
            }

        } else if (activeTab === '7TV') {
            groups.push({ category: 'Channel', items: filter(thirdPartyEmotes.categories.sevenTV.channel) });
            groups.push({ category: 'Global', items: filter(thirdPartyEmotes.categories.sevenTV.global) });
        } else if (activeTab === 'BTTV') {
            groups.push({ category: 'Channel', items: filter(thirdPartyEmotes.categories.bttv.channel) });
            groups.push({ category: 'Global', items: filter(thirdPartyEmotes.categories.bttv.global) });
        } else if (activeTab === 'FFZ') {
            groups.push({ category: 'Channel', items: filter(thirdPartyEmotes.categories.ffz.channel) });
            groups.push({ category: 'Global', items: filter(thirdPartyEmotes.categories.ffz.global) });
        }

        // Filter out empty groups
        return groups.filter(g => g.items.length > 0);
    }, [activeTab, thirdPartyEmotes, twitchEmotes, search]);

    // Helper for loading state
    const isTwitchLoading = activeTab === 'TWITCH' && (loadingTwitch || !hasFetchedTwitch);

    if (!isOpen) return null;

    return (
        <div className="emote-picker">
            <div className="picker-header">
                <div className="search-bar">
                    <Search size={14} className="picker-search-icon" />
                    <input 
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search emotes..."
                        autoFocus
                    />
                    {search ? (
                        <button onClick={() => setSearch('')}><X size={14} /></button>
                    ) : (
                        <button onClick={onClose} title="Close"><X size={14} /></button>
                    )}
                </div>
            </div>

            <div className="picker-content">
                {activeTab === 'TWITCH' && error ? (
                    <div className="error-state">
                        <p>{error}</p>
                    </div>
                ) : isTwitchLoading ? (
                    <div className="loading-state">
                        <Loader2 className="animate-spin" size={24} />
                    </div>
                ) : displayEmotesGrouped.length > 0 ? (
                    <div className="emote-grid-container">
                        {displayEmotesGrouped.map((group) => (
                            <div key={group.category} className="emote-group">
                                <div className="category-header">{group.category}</div>
                                <div className="emote-grid">
                                    {group.items.map((emote) => (
                                        <button 
                                            key={emote.id || emote.code} 
                                            className={`emote-btn ${emote.locked ? 'locked' : ''}`}
                                            onClick={() => !emote.locked && onSelect(emote.code, emote.url)}
                                            title={emote.locked ? `${emote.code} (Locked)` : emote.code}
                                            disabled={!!emote.locked}
                                        >
                                            <img src={emote.url} alt={emote.code} loading="lazy" />
                                            {emote.locked && <div className="lock-overlay"><Lock size={12} /></div>}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="empty-state">No emotes found</div>
                )}
            </div>

            <div className="picker-tabs">
                {(['TWITCH', '7TV', 'BTTV', 'FFZ'] as Tab[]).map(tab => (
                    <button 
                        key={tab}
                        className={activeTab === tab ? 'active' : ''}
                        onClick={() => setActiveTab(tab)}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            <style>{`
                .emote-picker {
                    position: absolute;
                    bottom: 100%;
                    right: 0;
                    width: 350px;
                    height: 400px;
                    background: #18181b;
                    border: 1px solid #27272a;
                    border-radius: 12px;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    margin-bottom: 12px;
                    z-index: 1000;
                }
                .picker-header {
                    padding: 12px;
                    border-bottom: 1px solid #27272a;
                    background: #18181b;
                }
                .search-bar {
                    background: #27272a;
                    border-radius: 6px;
                    display: flex;
                    align-items: center;
                    padding: 0 12px;
                    height: 36px; /* Explicit height */
                }
                .picker-search-icon {
                    color: #a1a1aa;
                    flex-shrink: 0;
                    margin-right: 8px;
                }
                .search-bar input {
                    background: transparent;
                    border: none;
                    color: #e4e4e7;
                    font-size: 0.9em;
                    flex: 1;
                    min-width: 0;
                    outline: none;
                    height: 100%; /* Fill height */
                    padding: 0; /* Let flex center it */
                }
                .search-bar button {
                    background: none;
                    border: none;
                    color: #71717a;
                    cursor: pointer;
                    display: flex;
                    padding: 4px;
                    margin-left: 4px;
                }
                .search-bar button:hover {
                    color: #fff;
                }
                .picker-content {
                    flex: 1;
                    overflow-y: auto;
                    padding: 12px;
                    background: #09090b;
                }
                .emote-grid-container {
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }
                .category-header {
                    font-size: 0.7rem;
                    text-transform: uppercase;
                    color: #a1a1aa;
                    font-weight: 700;
                    margin-bottom: 8px;
                    padding-bottom: 4px;
                    border-bottom: 1px solid #27272a;
                    letter-spacing: 0.05em;
                    position: sticky;
                    top: -12px; /* Sticky header offset accounting for padding */
                    background: #09090b;
                    z-index: 10;
                    padding-top: 4px;
                }
                .emote-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(36px, 1fr));
                    gap: 8px;
                }
                .emote-btn {
                    background: transparent;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    padding: 4px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: background 0.2s;
                    aspect-ratio: 1;
                }
                .emote-btn:hover {
                    background: #27272a;
                }
                .emote-btn img {
                    max-width: 100%;
                    max-height: 100%;
                    object-fit: contain;
                }
                .emote-btn.locked {
                    opacity: 0.5;
                    cursor: not-allowed;
                    position: relative;
                }
                .lock-overlay {
                    position: absolute;
                    bottom: 0;
                    right: 0;
                    background: rgba(0,0,0,0.7);
                    border-radius: 4px;
                    padding: 2px;
                    display: flex;
                    color: #fff;
                }
                .picker-tabs {
                    display: flex;
                    background: #18181b;
                    border-top: 1px solid #27272a;
                    padding: 4px;
                }
                .picker-tabs button {
                    flex: 1;
                    background: none;
                    border: none;
                    color: #71717a;
                    padding: 8px;
                    font-size: 0.8em;
                    font-weight: 600;
                    cursor: pointer;
                    border-radius: 4px;
                    transition: all 0.2s;
                }
                .picker-tabs button:hover {
                    color: #e4e4e7;
                    background: rgba(255,255,255,0.05);
                }
                .picker-tabs button.active {
                    color: #fff;
                    background: #27272a;
                }
                .loading-state, .empty-state, .error-state {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    height: 100%;
                    color: #52525b;
                    font-size: 0.9em;
                    text-align: center;
                    padding: 20px;
                }
                .error-state {
                    color: #ff4444;
                }
                .animate-spin {
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
};
