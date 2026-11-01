import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/styles.css';
import './ui/scenes.css';
import './ui/arena.css';
import './ui/comic.css';
import './ui/identity.css';
import './ui/manga.css';
import './ui/home.css';
import { App } from './ui/App';
import { store } from './store/store';
import { initAuth } from './online/auth';
import { codeFromLink } from './ui/screens/Online';
import './online/room';
import './online/friends';
import './store/career';

void store.init().then(() => { if (codeFromLink()) store.go('online'); });
void initAuth();
window.addEventListener('beforeunload', () => store.flushSave());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Development-only handle for driving the app from the browser console during testing.
if (import.meta.env.DEV) (window as unknown as { __store: typeof store }).__store = store;
