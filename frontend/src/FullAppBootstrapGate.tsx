import { Alert, Button, Space, Spin, Typography } from 'antd'
import type { Dispatch, ReactNode, SetStateAction } from 'react'

import { APIError } from './api/client'
import { renderUnauthorizedAuthGate } from './app/RequireAuth'
import { BrandLockup } from './components/BrandLockup'
import styles from './FullAppInner.module.css'

type FullAppBootstrapGateProps = {
	metaPending: boolean
	metaError: unknown
	onRetry: () => void
	apiToken: string
	setApiToken: Dispatch<SetStateAction<string>>
	profileGate: ReactNode
	profilesPending: boolean
	children: ReactNode
}

function renderFullscreenSpinner() {
	return (
		<div className={styles.fullscreenCenter}>
			<Spin />
		</div>
	)
}

function renderConnectionHint(error: unknown) {
	if (error instanceof APIError && error.status === 403) {
		return (
			<Space orientation="vertical" size={2} className={styles.fullWidth}>
				<Typography.Text type="secondary">Access blocked by server policy.</Typography.Text>
				<Typography.Text type="secondary">On the server host: open the UI from the same machine (loopback).</Typography.Text>
				<Typography.Text type="secondary">
					From another device: open the server&apos;s LAN IP (for example, 192.168.0.200) and verify ALLOW_REMOTE=true, API_TOKEN, and (if
					using a hostname) ALLOWED_HOSTS.
				</Typography.Text>
			</Space>
		)
	}

	return (
		<Typography.Text type="secondary">
			Failed to reach the backend. Check that the server is running and that the address/port are correct.
		</Typography.Text>
	)
}

function getConnectionErrorTitle(error: unknown) {
	if (error instanceof APIError) return `${error.code}: ${error.message}`
	if (error instanceof Error) return error.message
	return 'Unknown error'
}

export function FullAppBootstrapGate({
	metaPending,
	metaError,
	onRetry,
	apiToken,
	setApiToken,
	profileGate,
	profilesPending,
	children,
}: FullAppBootstrapGateProps) {
	if (metaPending) return renderFullscreenSpinner()

	if (metaError) {
		const unauthorizedGate = renderUnauthorizedAuthGate({
			error: metaError,
			apiToken,
			setApiToken,
			fallback: renderFullscreenSpinner(),
		})
		if (unauthorizedGate) return unauthorizedGate

		return (
			<div className={styles.fullscreenCenter}>
				<div className={styles.errorPanel}>
					<BrandLockup titleAs="h1" subtitle="Local Dashboard" variant="hero" />
					<Alert
						type="error"
						showIcon
						title="Backend connection failed"
						description={
							<Space orientation="vertical" size={8} className={styles.fullWidth}>
								<Typography.Text>{getConnectionErrorTitle(metaError)}</Typography.Text>
								{renderConnectionHint(metaError)}
								<Button onClick={onRetry}>Retry</Button>
							</Space>
						}
					/>
				</div>
			</div>
		)
	}

	if (profileGate && !profilesPending) return <>{profileGate}</>

	return <>{children}</>
}
