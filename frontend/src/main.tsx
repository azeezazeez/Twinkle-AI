import {StrictMode, useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MotionConfig} from 'motion/react';
import App from './App.tsx';
import './index.css';
import { applyPreferences, loadPrefs, PREFS_EVENT } from './lib/preferences';

applyPreferences();

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
    </MotionConfig>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
