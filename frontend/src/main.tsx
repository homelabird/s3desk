import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { APIClientProvider } from './api/APIClientProvider.tsx'
import { AuthProvider } from './auth/AuthProvider.tsx'
import { A11yLiveRegions } from './components/A11yLiveRegions.tsx'
import { ThemeModeProvider } from './themeMode.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <A11yLiveRegions />
    <ThemeModeProvider>
        <AuthProvider>
          <APIClientProvider>
            <App />
          </APIClientProvider>
        </AuthProvider>
    </ThemeModeProvider>
  </StrictMode>,
)
