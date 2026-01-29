import React, { useEffect, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { ExternalLink, X } from 'lucide-react';

interface ReleaseData {
    tag_name: string;
    html_url: string;
}

export const UpdateNotification: React.FC = () => {
    const [updateAvailable, setUpdateAvailable] = useState<ReleaseData | null>(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const checkUpdate = async () => {
            try {
                const version = await getVersion();

                const response = await fetch('https://api.github.com/repos/juddisjudd/heychat/releases/latest');
                if (!response.ok) return;

                const data: ReleaseData = await response.json();
                
                // Compare versions. Assuming tag is "v1.0.0" and version is "1.0.0"
                // Simple semver comparison by stripping 'v'
                const latest = data.tag_name.replace(/^v/, '');
                
                if (latest !== version && isNewer(latest, version)) {
                    setUpdateAvailable(data);
                    setIsVisible(true);
                }
            } catch (e) {
                console.error("Failed to check for updates:", e);
            }
        };

        checkUpdate();
    }, []);

    // Simple SemVer comparison helper
    const isNewer = (latest: string, current: string) => {
        const lParts = latest.split('.').map(Number);
        const cParts = current.split('.').map(Number);
        
        for (let i = 0; i < Math.max(lParts.length, cParts.length); i++) {
            const l = lParts[i] || 0;
            const c = cParts[i] || 0;
            if (l > c) return true;
            if (l < c) return false;
        }
        return false;
    };

    if (!updateAvailable || !isVisible) return null;

    return (
        <div className="update-notification">
            <div className="update-content">
                <span className="update-badge">NEW</span>
                <span className="update-text">
                    v{updateAvailable.tag_name.replace(/^v/, '')} available
                </span>
                <button 
                    className="update-link-btn"
                    onClick={async () => {
                         try {
                              // We use dynamic import or just invoke logic here to avoid circular dep or missing file
                              const { invoke } = await import('@tauri-apps/api/core');
                              await invoke('open_link', { url: updateAvailable.html_url });
                         } catch(e) {
                              window.open(updateAvailable.html_url, '_blank');
                         }
                    }}
                >
                    Download <ExternalLink size={12} style={{ marginLeft: 4 }} />
                </button>
            </div>
            <button className="update-close-btn" onClick={() => setIsVisible(false)}>
                <X size={14} />
            </button>
        </div>
    );
};
