import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

// Register the VitePWA service worker immediately so the app shell and assets
// are precached for offline launch even if the remote origin goes down.
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(<App />);
