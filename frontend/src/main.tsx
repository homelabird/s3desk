import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { A11yLiveRegions } from './components/A11yLiveRegions.tsx'

const Devtools =
	import.meta.env.DEV
		? lazy(async () => {
				const m = await import('@tanstack/react-query-devtools')
				return { default: m.ReactQueryDevtools }
			})
		: null

// Keep a single QueryClient instance for the app lifetime.
const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 30_000,
			refetchOnWindowFocus: false,
		},
	},
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <A11yLiveRegions />
      <BrowserRouter>
        <App />
      </BrowserRouter>
      {Devtools ? (
        <Suspense fallback={null}>
          <Devtools initialIsOpen={false} />
        </Suspense>
      ) : null}
    </QueryClientProvider>
  </StrictMode>,
)
