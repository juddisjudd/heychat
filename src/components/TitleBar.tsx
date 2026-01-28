import { getCurrentWindow } from '@tauri-apps/api/window'; // Check API for v2
import { X, Minus, Square } from 'lucide-react';
import './TitleBar.css';
import logo from '../assets/logo.png';

export default function TitleBar() {
  const appWindow = getCurrentWindow();

  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="titlebar-left">
         <img src={logo} alt="Logo" className="titlebar-icon" />
         HeyChat
      </div>
      <div className="titlebar-controls">
        <div className="titlebar-button" onClick={() => appWindow.minimize()}>
          <Minus size={16} />
        </div>
        <div className="titlebar-button" onClick={() => appWindow.toggleMaximize()}>
          <Square size={14} />
        </div>
        <div className="titlebar-button close" onClick={() => appWindow.close()}>
          <X size={16} />
        </div>
      </div>
    </div>
  );
}
