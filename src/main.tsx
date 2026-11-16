import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';
import { startAutoSync } from './lib/offline';

// Everything done on site is saved on the phone first and uploads by itself whenever there is signal.
startAutoSync();

// Lets the app open with no signal. Not used inside the Android app, which already carries its own copy of the code.
if ('serviceWorker' in navigator && import.meta.env.PROD && !(window as any).Capacitor?.isNativePlatform?.()) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => undefined); });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
