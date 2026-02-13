import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfigProvider } from 'antd'
import 'antd/dist/reset.css'
import './index.css'
import App from './App.tsx'

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
      <ConfigProvider getPopupContainer={() => document.body}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ConfigProvider>
      {Devtools ? (
        <Suspense fallback={null}>
          <Devtools initialIsOpen={false} />
        </Suspense>
      ) : null}
    </QueryClientProvider>
  </StrictMode>,
)
