import { ConfigProvider } from 'antd'
import 'antd/dist/reset.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Suspense, lazy } from 'react'

import { AntdToastAnnouncer } from './components/AntdToastAnnouncer'
import FullAppInner from './FullAppInner'

const Devtools =
	import.meta.env.DEV
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
	return (
		<QueryClientProvider client={queryClient}>
			<ConfigProvider getPopupContainer={() => document.body}>
				<AntdToastAnnouncer />
				<FullAppInner />
			</ConfigProvider>
			{Devtools ? (
				<Suspense fallback={null}>
					<Devtools initialIsOpen={false} />
				</Suspense>
			) : null}
		</QueryClientProvider>
	)
}
