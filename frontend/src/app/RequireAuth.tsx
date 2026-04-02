import { Suspense, lazy, type Dispatch, type ReactNode, type SetStateAction } from 'react'

import { APIError } from '../api/client'

const LoginPage = lazy(async () => {
	const m = await import('../pages/LoginPage')
	return { default: m.LoginPage }
})

export function renderUnauthorizedAuthGate(args: {
	error: unknown
	apiToken: string
	setApiToken: Dispatch<SetStateAction<string>>
	fallback: ReactNode
}) {
	const { error, apiToken, setApiToken, fallback } = args
	if (!(error instanceof APIError) || error.status !== 401) {
		return null
	}

	return (
		<Suspense fallback={fallback}>
			<LoginPage
				key={apiToken || 'empty'}
				initialToken={apiToken}
				onLogin={(token) => setApiToken(token)}
				onClearSavedToken={() => setApiToken('')}
				error={error}
			/>
		</Suspense>
	)
}
