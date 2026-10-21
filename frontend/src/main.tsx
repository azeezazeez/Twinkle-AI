import {StrictMode, useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MotionConfig} from 'motion/react';
import App from './App.tsx';
import './index.css';
import { applyPreferences, loadPrefs, PREFS_EVENT } from './lib/preferences';
import { startBackendWake } from './lib/backendWake';
import GlobalTooltip from './components/GlobalTooltip';
import ClickCircle from './components/ClickCircle';

applyPreferences();
startBackendWake();

// A new deployment removes old hashed chunks; reload once so the fresh build loads.
window.addEventListener('vite:preloadError', (event) => {
  try {
    if (sessionStorage.getItem('twinkle:chunk-reload') === '1') return;
    sessionStorage.setItem('twinkle:chunk-reload', '1');
  } catch { /* storage unavailable */ }
  event.preventDefault();
  window.location.reload();
});

// Motion setting: "Reduced" forces reduced animation everywhere (including the
// JS animations); "System" follows the device's own reduced-motion setting.
function Root() {
  const [reduce, setReduce] = useState(() => loadPrefs().reduceMotion);
  useEffect(() => {
    const sync = () => setReduce(loadPrefs().reduceMotion);
    window.addEventListener(PREFS_EVENT, sync);
    return () => window.removeEventListener(PREFS_EVENT, sync);
  }, []);
  return (
    <MotionConfig reducedMotion={reduce ? 'always' : 'user'}>
      <App />
      <GlobalTooltip />
      <ClickCircle />
    </MotionConfig>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
