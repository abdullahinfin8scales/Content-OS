import '@fontsource-variable/inter';
import '@fontsource-variable/inter/wght-italic.css';
import '@fontsource-variable/newsreader';
import '@fontsource-variable/newsreader/wght-italic.css';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource/michroma';
import './styles/index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { repo } from './state/repo';

const SEEDED_KEY = 'infin8.seeded';

async function boot() {
  // First run only: a starter space with a welcome note. Never re-seeds after
  // the user deletes everything.
  try {
    if (!localStorage.getItem(SEEDED_KEY)) {
      await repo.seedIfEmpty();
      localStorage.setItem(SEEDED_KEY, '1');
    }
  } catch (err) {
    console.error('Seeding skipped', err);
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
