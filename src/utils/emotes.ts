
export interface ThirdPartyEmote {
    code: string;
    url: string;
}

export type EmoteMap = Map<string, string>;

// 7TV Types
interface SevenTVUserResponse {
    emote_set: {
        emotes: Array<{
            name: string;
            data: {
                host: {
                    url: string;
                    files: Array<{
                        name: string;
                        format: string;
                    }>;
                };
            };
        }>;
    };
}

// BTTV Types
interface BTTVEmote {
    id: string;
    code: string;
    imageType: string;
}
interface BTTVUserResponse {
    channelEmotes: BTTVEmote[];
    sharedEmotes: BTTVEmote[];
}

// FFZ Types
interface FFZEmote {
    id: number;
    name: string;
    urls: {
        [key: string]: string; // "1", "2", "4"
    };
}
interface FFZRoomResponse {
    sets: {
        [key: string]: {
            emoticons: FFZEmote[];
        };
    };
}

export interface EmoteCategory {
    provider: '7tv' | 'bttv' | 'ffz' | 'twitch';
    emotes: { code: string; url: string; id: string }[];
}

export interface EmoteData {
    map: EmoteMap;
    categories: {
        sevenTV: { global: EmoteCategory['emotes']; channel: EmoteCategory['emotes'] };
        bttv: { global: EmoteCategory['emotes']; channel: EmoteCategory['emotes'] };
        ffz: { global: EmoteCategory['emotes']; channel: EmoteCategory['emotes'] };
    };
}

export const fetchThirdPartyEmotes = async (channelId: string): Promise<EmoteData> => {
    const emoteMap = new Map<string, string>();
    const categories = {
        sevenTV: { global: [] as any[], channel: [] as any[] },
        bttv: { global: [] as any[], channel: [] as any[] },
        ffz: { global: [] as any[], channel: [] as any[] }
    };

    console.log(`Fetching 3rd party emotes for channel ID: ${channelId}`);

    // Helper to add emote safely
    const addEmote = (code: string, url: string, id: string, provider: '7tv' | 'bttv' | 'ffz', type: 'global' | 'channel') => {
        if (!emoteMap.has(code)) {
            emoteMap.set(code, url);
        }
        
        const emoteObj = { code, url, id };
        if (provider === '7tv') {
            categories.sevenTV[type].push(emoteObj);
        } else if (provider === 'bttv') {
            categories.bttv[type].push(emoteObj);
        } else if (provider === 'ffz') {
            categories.ffz[type].push(emoteObj);
        }
    };

    // 1. BetterTTV Global
    try {
        const resp = await fetch('https://api.betterttv.net/3/cached/emotes/global');
        if (resp.ok) {
            const data: BTTVEmote[] = await resp.json();
            data.forEach(e => addEmote(e.code, `https://cdn.betterttv.net/emote/${e.id}/2x`, e.id, 'bttv', 'global'));
        }
    } catch (e) {
        console.error("Failed to fetch BTTV Global", e);
    }

    // 2. BetterTTV Channel
    try {
        const resp = await fetch(`https://api.betterttv.net/3/cached/users/twitch/${channelId}`);
        if (resp.ok) {
            const data: BTTVUserResponse = await resp.json();
            if (data.channelEmotes) data.channelEmotes.forEach(e => addEmote(e.code, `https://cdn.betterttv.net/emote/${e.id}/2x`, e.id, 'bttv', 'channel'));
            if (data.sharedEmotes) data.sharedEmotes.forEach(e => addEmote(e.code, `https://cdn.betterttv.net/emote/${e.id}/2x`, e.id, 'bttv', 'channel'));
        }
    } catch (e) {
        console.warn("BTTV Channel fetch failed", e);
    }

    // 3. FrankerFaceZ Global
    try {
        const resp = await fetch('https://api.frankerfacez.com/v1/set/global');
        if (resp.ok) {
            const data: FFZRoomResponse = await resp.json();
            Object.values(data.sets).forEach(set => {
                set.emoticons.forEach(e => {
                    const url = e.urls["2"] || e.urls["1"];
                    addEmote(e.name, url, e.id.toString(), 'ffz', 'global');
                });
            });
        }
    } catch (e) {
        console.error("Failed to fetch FFZ Global", e);
    }

    // 4. FrankerFaceZ Channel
    try {
        const resp = await fetch(`https://api.frankerfacez.com/v1/room/id/${channelId}`);
        if (resp.ok) {
            const data: FFZRoomResponse = await resp.json();
            Object.values(data.sets).forEach(set => {
                set.emoticons.forEach(e => {
                    const url = e.urls["2"] || e.urls["1"];
                    addEmote(e.name, url, e.id.toString(), 'ffz', 'channel');
                });
            });
        }
    } catch (e) {
       console.warn("FFZ Channel fetch failed", e);
    }

    // 5. 7TV Global
    try {
        const resp = await fetch('https://7tv.io/v3/emote-sets/global');
        if (resp.ok) {
           const globalData = await resp.json();
           if (globalData.emotes) {
               globalData.emotes.forEach((e: any) => {
                    const host = e.data.host;
                    const filename = e.data.host.files.find((f: any) => f.format === 'WEBP' && f.name === '2x.webp')?.name 
                                  || e.data.host.files[0].name;
                    const url = `https:${host.url}/${filename}`; 
                    addEmote(e.name, url, e.id, '7tv', 'global');
               });
           }
        }
    } catch (e) {
        console.warn("7TV Global fetch failed", e);
    }

    // 6. 7TV Channel
    try {
        const resp = await fetch(`https://7tv.io/v3/users/twitch/${channelId}`);
        if (resp.ok) {
            const data: SevenTVUserResponse = await resp.json();
            if (data.emote_set && data.emote_set.emotes) {
                data.emote_set.emotes.forEach((e: any) => {
                    const host = e.data.host;
                    const filename = e.data.host.files.find((f: any) => f.format === 'WEBP' && f.name === '2x.webp')?.name 
                                  || e.data.host.files[0].name;
                    
                    const url = `https:${host.url}/${filename}`; 
                    addEmote(e.name, url, e.id, '7tv', 'channel');
                });
            }
        }
    } catch (e) {
        console.warn("7TV Channel fetch failed", e);
    }

    console.log(`Loaded ${emoteMap.size} 3rd party emotes.`);
    
    return { map: emoteMap, categories };
};
