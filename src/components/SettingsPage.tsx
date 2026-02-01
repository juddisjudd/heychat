import React, { useState } from 'react';
import { useChatSettings } from '../context/ChatSettingsContext';
import { RotateCcw, Type, PaintBucket, Layout, Star, Settings, Tv, Youtube, MessageSquare, X } from 'lucide-react';

interface Props {
    onBack: () => void;
    favorites: string;
    onFavoritesChange: (val: string) => void;
}

type Tab = 'GENERAL' | 'TWITCH' | 'KICK' | 'YOUTUBE';

export const SettingsPage = ({ onBack, favorites, onFavoritesChange }: Props) => {
    const { settings, updateSettings, resetSettings } = useChatSettings();
    const [activeTab, setActiveTab] = useState<Tab>('GENERAL');
    const [localFavorites, setLocalFavorites] = useState(favorites);

    const handleFavoritesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setLocalFavorites(e.target.value);
        onFavoritesChange(e.target.value);
    };

    const renderTabContent = () => {
        switch (activeTab) {
            case 'GENERAL':
                return (
                    <>
                        <div className="settings-section">
                            <h3><Type size={18} /> Typography</h3>
                            <div className="setting-item">
                                <label>
                                    Font Size ({settings.fontSize}px)
                                    <input 
                                        type="range" 
                                        min="10" 
                                        max="24" 
                                        value={settings.fontSize} 
                                        onChange={(e) => updateSettings({ fontSize: Number(e.target.value) })}
                                    />
                                </label>
                            </div>
                            <div className="setting-item">
                                <label>
                                    Line Height ({settings.lineHeight})
                                    <input 
                                        type="range" 
                                        min="1" 
                                        max="2" 
                                        step="0.1"
                                        value={settings.lineHeight} 
                                        onChange={(e) => updateSettings({ lineHeight: Number(e.target.value) })}
                                    />
                                </label>
                            </div>
                        </div>

                        <div className="settings-section">
                            <h3><Layout size={18} /> Layout & Elements</h3>
                            <div className="setting-row">
                                <label className="checkbox-label">
                                    <input 
                                        type="checkbox" 
                                        checked={settings.showBadges} 
                                        onChange={(e) => updateSettings({ showBadges: e.target.checked })}
                                    />
                                    Show Badges
                                </label>
                            </div>
                            <div className="setting-row">
                                <label className="checkbox-label">
                                    <input 
                                        type="checkbox" 
                                        checked={settings.showTimestamp} 
                                        onChange={(e) => updateSettings({ showTimestamp: e.target.checked })}
                                    />
                                    Show Timestamp
                                </label>
                            </div>
                            <div className="setting-item">
                                <label>
                                    Message Spacing ({settings.messageSpacing}px)
                                    <input 
                                        type="range" 
                                        min="0" 
                                        max="20" 
                                        value={settings.messageSpacing} 
                                        onChange={(e) => updateSettings({ messageSpacing: Number(e.target.value) })}
                                    />
                                </label>
                            </div>
                        </div>

                        <div className="settings-section">
                            <h3><PaintBucket size={18} /> Global Colors</h3>
                            <div className="setting-item">
                                <label>Username Color</label>
                                <div className="radio-group" style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                                    <label className="radio-label">
                                        <input 
                                            type="radio" 
                                            checked={settings.usernameColor === 'original'}
                                            onChange={() => updateSettings({ usernameColor: 'original' })}
                                        />
                                        Platform Default
                                    </label>
                                    <label className="radio-label">
                                        <input 
                                            type="radio" 
                                            checked={settings.usernameColor === 'static'}
                                            onChange={() => updateSettings({ usernameColor: 'static' })}
                                        />
                                        Static White
                                    </label>
                                </div>
                            </div>
                        </div>

                        <div className="settings-section">
                            <h3><Star size={18} /> Favorites</h3>
                            <p style={{ fontSize: '0.85rem', color: '#888', marginBottom: '8px' }}>
                                Enter usernames one per line to highlight their messages.
                            </p>
                            <textarea
                                className="favorites-textarea"
                                value={localFavorites}
                                onChange={handleFavoritesChange}
                                placeholder="Usernames (one per line)..."
                                style={{ 
                                    width: '100%', 
                                    minHeight: '120px', 
                                    background: '#1a1a1a', 
                                    border: '1px solid #333', 
                                    color: 'white', 
                                    padding: '10px',
                                    borderRadius: '6px'
                                }}
                            />
                        </div>
                    </>
                );
            case 'TWITCH':
                return (
                    <div className="settings-section">
                        <h3><Tv size={18} /> Twitch Styling</h3>
                         <div className="setting-row" style={{ display: 'flex', gap: '20px' }}>
                             <label className="color-picker-label">
                                 <span>Moderator Color</span>
                                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                     <input 
                                        type="color" 
                                        value={settings.twitchModColor}
                                        onChange={(e) => updateSettings({ twitchModColor: e.target.value })}
                                     />
                                     <span style={{ fontSize: '0.8em', fontFamily: 'monospace' }}>{settings.twitchModColor}</span>
                                 </div>
                             </label>
                             <label className="color-picker-label">
                                 <span>VIP Color</span>
                                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                     <input 
                                        type="color" 
                                        value={settings.twitchVipColor}
                                        onChange={(e) => updateSettings({ twitchVipColor: e.target.value })}
                                     />
                                     <span style={{ fontSize: '0.8em', fontFamily: 'monospace' }}>{settings.twitchVipColor}</span>
                                 </div>
                             </label>
                         </div>
                    </div>
                );
            case 'KICK':
                return (
                    <div className="settings-section">
                        <h3><MessageSquare size={18} /> Kick Styling</h3>
                         <div className="setting-row" style={{ display: 'flex', gap: '20px' }}>
                             <label className="color-picker-label">
                                 <span>Moderator Color</span>
                                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                     <input 
                                        type="color" 
                                        value={settings.kickModColor}
                                        onChange={(e) => updateSettings({ kickModColor: e.target.value })}
                                     />
                                     <span style={{ fontSize: '0.8em', fontFamily: 'monospace' }}>{settings.kickModColor}</span>
                                 </div>
                             </label>
                             <label className="color-picker-label">
                                 <span>VIP Color</span>
                                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                     <input 
                                        type="color" 
                                        value={settings.kickVipColor}
                                        onChange={(e) => updateSettings({ kickVipColor: e.target.value })}
                                     />
                                     <span style={{ fontSize: '0.8em', fontFamily: 'monospace' }}>{settings.kickVipColor}</span>
                                 </div>
                             </label>
                         </div>
                    </div>
                );
            case 'YOUTUBE':
                return (
                    <div className="settings-section">
                        <h3><Youtube size={18} /> YouTube Styling</h3>
                         <div className="setting-row" style={{ display: 'flex', gap: '20px' }}>
                             <label className="color-picker-label">
                                 <span>Member Color</span>
                                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                     <input 
                                        type="color" 
                                        value={settings.youtubeMemberColor}
                                        onChange={(e) => updateSettings({ youtubeMemberColor: e.target.value })}
                                     />
                                     <span style={{ fontSize: '0.8em', fontFamily: 'monospace' }}>{settings.youtubeMemberColor}</span>
                                 </div>
                             </label>
                         </div>
                    </div>
                );
        }
    };

    return (
        <div className="settings-page" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className="settings-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 20px 0 20px' }}>
                <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Configuration</h2>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={resetSettings} className="action-btn" title="Reset to Defaults" style={{ background: '#333' }}>
                        <RotateCcw size={16} />
                    </button>
                    <button onClick={onBack} className="action-btn" title="Close" style={{ background: '#333' }}>
                        <X size={16} />
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="settings-tabs" style={{ display: 'flex', gap: '12px', padding: '20px', borderBottom: '1px solid #333' }}>
                <button 
                    className={`tab-btn ${activeTab === 'GENERAL' ? 'active' : ''}`}
                    onClick={() => setActiveTab('GENERAL')}
                >
                    <Settings size={14} /> General
                </button>
                <button 
                    className={`tab-btn ${activeTab === 'TWITCH' ? 'active' : ''}`}
                    onClick={() => setActiveTab('TWITCH')}
                >
                    <Tv size={14} /> Twitch
                </button>
                <button 
                    className={`tab-btn ${activeTab === 'KICK' ? 'active' : ''}`}
                    onClick={() => setActiveTab('KICK')}
                >
                    <MessageSquare size={14} /> Kick
                </button>
                <button 
                    className={`tab-btn ${activeTab === 'YOUTUBE' ? 'active' : ''}`}
                    onClick={() => setActiveTab('YOUTUBE')}
                >
                    <Youtube size={14} /> YouTube
                </button>
            </div>

            <div className="settings-content" style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                {renderTabContent()}
            </div>

            <style>{`
                .tab-btn {
                    background: transparent;
                    border: none;
                    color: #666;
                    padding: 8px 12px;
                    border-radius: 6px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-weight: 600;
                    transition: all 0.2s;
                }
                .tab-btn:hover {
                    color: #bbb;
                    background: rgba(255,255,255,0.05);
                }
                .tab-btn.active {
                    color: #fff;
                    background: #333;
                }
                
                .settings-section {
                    background: rgba(255, 255, 255, 0.03);
                    border: 1px solid rgba(255, 255, 255, 0.05);
                    border-radius: 8px;
                    padding: 16px;
                    margin-bottom: 20px;
                }
                .settings-section h3 {
                    margin-top: 0;
                    margin-bottom: 16px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 1rem;
                    color: #ddd;
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                    padding-bottom: 8px;
                }
                .setting-item {
                    margin-bottom: 12px;
                }
                .setting-item label {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    font-size: 0.9em;
                    color: #bbb;
                }
                .setting-row {
                    margin-bottom: 12px;
                }
                .checkbox-label {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    cursor: pointer;
                    user-select: none;
                }
                .radio-label {
                     display: flex;
                    align-items: center;
                    gap: 6px;
                    cursor: pointer;
                    font-size: 0.9em;
                    color: #bbb;
                }
                input[type="range"] {
                    width: 100%;
                    accent-color: #9146FF;
                }
                input[type="checkbox"], input[type="radio"] {
                    accent-color: #9146FF;
                    width: 16px;
                    height: 16px;
                }
                
                /* Custom Color Picker Styles */
                input[type="color"] {
                    -webkit-appearance: none;
                    border: none;
                    width: 40px;
                    height: 40px;
                    padding: 0;
                    border-radius: 6px;
                    cursor: pointer;
                    background: none;
                }
                input[type="color"]::-webkit-color-swatch-wrapper {
                    padding: 0;
                }
                input[type="color"]::-webkit-color-swatch {
                    border: 1px solid rgba(255,255,255,0.2);
                    border-radius: 6px;
                }
            `}</style>
        </div>
    );
};
