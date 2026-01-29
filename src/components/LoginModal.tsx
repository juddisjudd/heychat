import { useState } from 'react';
import { X, ExternalLink, KeyRound, User, LogOut } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (username: string, token: string) => void;
}

export function LoginModal({ isOpen, onClose, onLogin }: LoginModalProps) { 
  if (!isOpen) return null;

  const loginWithTwitch = async () => {
      try {
          await invoke('start_twitch_oauth');
          // Modal stays open until token is received via event in App.tsx
      } catch (e) {
          console.error("Failed to start OAuth:", e);
          alert("Failed to open browser for login: " + String(e));
      }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Twitch Login</h2>
          <button onClick={onClose} className="close-btn"><X size={20} /></button>
        </div>
        
        <div className="modal-body">
            <div className="info-box">
                <p>Log in securely with your browser.</p>
                <button type="button" onClick={loginWithTwitch} className="action-btn primary" style={{ width: '100%', justifyContent: 'center', marginTop: '10px' }}>
                    <ExternalLink size={16} style={{ marginRight: '8px' }} />
                    Log in with Twitch
                </button>
                
                <div style={{ marginTop: '20px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '15px' }}>
                    <button 
                        type="button" 
                        onClick={() => {
                            onLogin("", "");
                            onClose();
                        }} 
                        className="action-btn" 
                        style={{ width: '100%', justifyContent: 'center', background: 'rgba(255, 50, 50, 0.1)', color: '#ff5555', border: '1px solid rgba(255, 50, 50, 0.2)' }}
                    >
                        <LogOut size={16} style={{ marginRight: '8px' }} />
                        Log Out / Clear Credentials
                    </button>
                </div>
            </div>
            
            <p style={{ marginTop: '15px', fontSize: '0.85em', opacity: 0.6, textAlign: 'center' }}>
                We use secure OAuth to protect your account.
                The app never sees your password.
            </p>
        </div>
      </div>
    </div>
  );
}
