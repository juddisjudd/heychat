import { useState } from 'react';
import { X, ExternalLink, KeyRound, User, LogOut } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  // onLogin prop is actually bypassed by event listener now, but kept for compatibility or types
  onLogin: (username: string, token: string) => void; 
  twitchUser?: string;
  youtubeUser?: string;
  onLogoutTwitch: () => void;
  onLogoutYoutube: () => void;
}

export function LoginModal({ isOpen, onClose, twitchUser, youtubeUser, onLogoutTwitch, onLogoutYoutube }: LoginModalProps) { 
  if (!isOpen) return null;

  const loginWithTwitch = async () => {
      localStorage.setItem("pending_auth_provider", "twitch");
      try {
          await invoke('start_twitch_oauth');
      } catch (e) {
          console.error("Failed to start Twitch OAuth:", e);
          alert("Failed to open browser: " + String(e));
      }
  };

  const loginWithYoutube = async () => {
      localStorage.setItem("pending_auth_provider", "youtube");
      try {
          await invoke('start_youtube_oauth');
      } catch (e) {
          console.error("Failed to start YouTube OAuth:", e);
          alert("Failed to open browser: " + String(e));
      }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Accounts</h2>
          <button onClick={onClose} className="close-btn"><X size={20} /></button>
        </div>
        
        <div className="modal-body">
            
            {/* Twitch Section */}
            <div className="info-box" style={{ marginBottom: '15px' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '1em', color: '#a970ff' }}>Twitch</h3>
                {twitchUser ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ fontSize: '0.9em', opacity: 0.8 }}>Logged in as <b>{twitchUser}</b></div>
                        <button 
                            type="button" 
                            onClick={onLogoutTwitch} 
                            className="action-btn" 
                            style={{ width: '100%', justifyContent: 'center', background: 'rgba(255, 50, 50, 0.1)', color: '#ff5555', border: '1px solid rgba(255, 50, 50, 0.2)' }}
                        >
                            <LogOut size={14} style={{ marginRight: '8px' }} />
                            Log Out
                        </button>
                    </div>
                ) : (
                    <button type="button" onClick={loginWithTwitch} className="action-btn primary" style={{ width: '100%', justifyContent: 'center', background: '#9146FF' }}>
                        <ExternalLink size={16} style={{ marginRight: '8px' }} />
                        Log in with Twitch
                    </button>
                )}
            </div>

            {/* YouTube Section */}
            <div className="info-box">
                <h3 style={{ margin: '0 0 10px 0', fontSize: '1em', color: '#ff4444' }}>YouTube</h3>
                {youtubeUser ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ fontSize: '0.9em', opacity: 0.8 }}>Logged in as <b>{youtubeUser}</b></div>
                        <button 
                            type="button" 
                            onClick={onLogoutYoutube} 
                            className="action-btn" 
                            style={{ width: '100%', justifyContent: 'center', background: 'rgba(255, 50, 50, 0.1)', color: '#ff5555', border: '1px solid rgba(255, 50, 50, 0.2)' }}
                        >
                            <LogOut size={14} style={{ marginRight: '8px' }} />
                            Log Out
                        </button>
                    </div>
                ) : (
                    <button type="button" onClick={loginWithYoutube} className="action-btn primary" style={{ width: '100%', justifyContent: 'center', background: '#ff0000' }}>
                        <ExternalLink size={16} style={{ marginRight: '8px' }} />
                        Log in with YouTube
                    </button>
                )}
            </div>
            
            <p style={{ marginTop: '20px', fontSize: '0.85em', opacity: 0.6, textAlign: 'center' }}>
                We use secure OAuth to protect your accounts.
                The app never sees your passwords.
            </p>
        </div>
      </div>
    </div>
  );
}
