import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ThemeProvider } from './theme';
import { MotionProvider } from './motion';
import { SettingsProvider } from './features/app-settings';
import './index.css';

// Service worker-registreringen injiceras automatiskt av vite-plugin-pwa
// (injectRegister: 'auto'), därför behövs ingen manuell registrering här.
const rootElement = document.getElementById('root');

// Fail loud: saknas root-noden är index.html trasig, då ska det synas direkt
// i stället för en tyst tom sida.
if (!rootElement) {
  throw new Error('Kunde inte montera appen: elementet #root saknas i index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider>
      <SettingsProvider>
        <MotionProvider>
          <App />
        </MotionProvider>
      </SettingsProvider>
    </ThemeProvider>
  </StrictMode>
);
