import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { A11yLiveRegions } from './components/A11yLiveRegions.tsx'
import { ThemeModeProvider } from './themeMode.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <A11yLiveRegions />
    <ThemeModeProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeModeProvider>
  </StrictMode>,
)
