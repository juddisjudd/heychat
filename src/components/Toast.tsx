import { useEffect, useState } from "react";
import { X, CheckCircle, AlertCircle, Info } from "lucide-react";

export interface ToastMessage {
    id: string;
    type: 'success' | 'error' | 'info';
    message: string;
    duration?: number;
}

interface ToastProps {
    toasts: ToastMessage[];
    removeToast: (id: string) => void;
}

export function ToastContainer({ toasts, removeToast }: ToastProps) {
    return (
        <div className="toast-container" style={{
            position: 'fixed',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            zIndex: 9999,
            pointerEvents: 'none' // Allow clicking through if no toasts
        }}>
            {toasts.map(toast => (
                <ToastItem key={toast.id} toast={toast} removeToast={removeToast} />
            ))}
        </div>
    );
}

function ToastItem({ toast, removeToast }: { toast: ToastMessage, removeToast: (id: string) => void }) {
    const [isExiting, setIsExiting] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsExiting(true);
            setTimeout(() => removeToast(toast.id), 300); // Wait for animation
        }, toast.duration || 3000);

        return () => clearTimeout(timer);
    }, [toast, removeToast]);

    const handleClose = () => {
        setIsExiting(true);
        setTimeout(() => removeToast(toast.id), 300);
    };

    return (
        <div style={{
            backgroundColor: '#1a1a1a',
            border: `1px solid ${toast.type === 'error' ? '#ff4444' : toast.type === 'success' ? '#00ad03' : '#333'}`,
            borderLeftWidth: '4px',
            borderRadius: '6px',
            padding: '12px 16px',
            minWidth: '300px',
            maxWidth: '90vw',
            color: '#eee',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            pointerEvents: 'auto',
            animation: isExiting ? 'toastOut 0.3s ease-in forwards' : 'toastIn 0.3s ease-out forwards',
            opacity: isExiting ? 0 : 1,
            transform: isExiting ? 'translateY(10px)' : 'translateY(0)'
        }}>
            {toast.type === 'success' && <CheckCircle size={20} color="#00ad03" />}
            {toast.type === 'error' && <AlertCircle size={20} color="#ff4444" />}
            {toast.type === 'info' && <Info size={20} color="#9146FF" />}
            
            <span style={{ flex: 1, fontSize: '0.9rem' }}>{toast.message}</span>
            
            <button 
                onClick={handleClose}
                style={{
                    background: 'none',
                    border: 'none',
                    color: '#666',
                    cursor: 'pointer',
                    padding: '4px'
                }}
            >
                <X size={16} />
            </button>
            <style>{`
                @keyframes toastIn {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                @keyframes toastOut {
                    from { transform: translateY(0); opacity: 1; }
                    to { transform: translateY(20px); opacity: 0; }
                }
            `}</style>
        </div>
    );
}
