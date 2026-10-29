import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/styles.css';
import './ui/arena.css';
import './ui/comic.css';
import { App } from './ui/App';
import { store } from './store/store';

void store.init();
window.addEventListener('beforeunload', () => store.flushSave());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Development-only handle for driving the app from the browser console during testing.
if (import.meta.env.DEV) (window as unknown as { __store: typeof store }).__store = store;
