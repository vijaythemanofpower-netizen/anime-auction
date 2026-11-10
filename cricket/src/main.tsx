import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/styles.css';
import './engine/data/linesInit';
import { App } from './ui/App';
import { loadPhotos } from './store/photos';

void loadPhotos();
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
