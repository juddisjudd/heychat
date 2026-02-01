import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface ChatSettings {
    fontSize: number;
    lineHeight: number;
    showBadges: boolean;
    showTimestamp: boolean;
    messageSpacing: number;
    usernameColor: 'original' | 'static';
    staticUsernameColor: string;
    // Platform Specifics
    twitchModColor: string;
    twitchVipColor: string;
    kickModColor: string;
    kickVipColor: string;
    youtubeMemberColor: string;
}

const DEFAULT_SETTINGS: ChatSettings = {
    fontSize: 14,
    lineHeight: 1.5,
    showBadges: true,
    showTimestamp: false,
    messageSpacing: 8,
    usernameColor: 'original',
    staticUsernameColor: '#ffffff',
    
    twitchModColor: '#00ad03',
    twitchVipColor: '#e9199f',
    
    kickModColor: '#00ad03',
    kickVipColor: '#e9199f',
    
    youtubeMemberColor: '#0f9d58'
};

interface ChatSettingsContextType {
    settings: ChatSettings;
    updateSettings: (newSettings: Partial<ChatSettings>) => void;
    resetSettings: () => void;
}

const ChatSettingsContext = createContext<ChatSettingsContextType | undefined>(undefined);

export const ChatSettingsProvider = ({ children }: { children: ReactNode }) => {
    const [settings, setSettings] = useState<ChatSettings>(() => {
        const saved = localStorage.getItem('heychat_settings');
        return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    });

    useEffect(() => {
        localStorage.setItem('heychat_settings', JSON.stringify(settings));
    }, [settings]);

    const updateSettings = (newSettings: Partial<ChatSettings>) => {
        setSettings(prev => ({ ...prev, ...newSettings }));
    };

    const resetSettings = () => {
        setSettings(DEFAULT_SETTINGS);
    };

    return (
        <ChatSettingsContext.Provider value={{ settings, updateSettings, resetSettings }}>
            {children}
        </ChatSettingsContext.Provider>
    );
};

export const useChatSettings = () => {
    const context = useContext(ChatSettingsContext);
    if (!context) {
        throw new Error('useChatSettings must be used within a ChatSettingsProvider');
    }
    return context;
};
