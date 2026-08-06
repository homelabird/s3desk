import { ConfigProvider } from 'antd'
import 'antd/dist/reset.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router'
import { Suspense, lazy, useMemo } from 'react'

import { AntdToastAnnouncer } from './components/AntdToastAnnouncer'
import FullAppInner from './FullAppInner'
import { getAppTheme } from './theme'
import { useThemeMode } from './useThemeMode'

const enableQueryDevtools = import.meta.env.DEV && import.meta.env.VITE_ENABLE_QUERY_DEVTOOLS === 'true'

const Devtools =
	enableQueryDevtools
		? lazy(async () => {
				const m = await import('@tanstack/react-query-devtools')
				return { default: m.ReactQueryDevtools }
			})
		: null

// Keep a single QueryClient instance for the app lifetime (full shell).
const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 30_000,
			refetchOnWindowFocus: false,
		},
	},
})

export default function FullApp() {
	const { mode } = useThemeMode()
	const appTheme = useMemo(() => getAppTheme(mode), [mode])

	return (
		<BrowserRouter>
			<QueryClientProvider client={queryClient}>
				<ConfigProvider getPopupContainer={() => document.body} theme={appTheme}>
					<AntdToastAnnouncer />
					<FullAppInner />
				</ConfigProvider>
				{Devtools ? (
					<Suspense fallback={null}>
						<Devtools initialIsOpen={false} />
					</Suspense>
				) : null}
			</QueryClientProvider>
		</BrowserRouter>
	)
}
