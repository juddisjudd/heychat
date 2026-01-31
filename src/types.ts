export interface Emote {
    id: string;
    code: string;
    start: number;
    end: number;
}

export interface ChatMessage {
    id: string;
    platform: 'Twitch' | 'YouTube' | 'Kick';
    username: string;
    message: string;
    color?: string;
    badges: string[];
    is_mod: boolean;
    is_vip: boolean;
    is_member: boolean;
    timestamp: string;
    emotes?: Emote[];
    msg_type?: 'chat' | 'sub';
    system_message?: string;
}
