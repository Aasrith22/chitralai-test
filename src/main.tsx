import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { GoogleAuthConfig } from './config/GoogleAuthConfig';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GoogleAuthConfig>
      <App />
    </GoogleAuthConfig>
  </StrictMode>
);
