import { Alert, Button, Input, Space, Typography } from 'antd'
import { useMemo, useState } from 'react'

import { APIClient, APIError } from '../api/client'
import { FormField } from '../components/FormField'

type Props = {
	initialToken: string
	onLogin: (token: string) => void
	onClearSavedToken?: () => void
	error?: unknown
}

export function LoginPage(props: Props) {
	const [token, setToken] = useState(props.initialToken ?? '')
	const [submitting, setSubmitting] = useState(false)
	const [localError, setLocalError] = useState<string | null>(null)
	const shouldAutoFocus = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches

	const showSavedTokenWarning = !!props.initialToken
	const initialHint = useMemo(() => {
		if (showSavedTokenWarning) {
			return 'Saved API token is invalid. Please log in again with a valid token.'
		}
		return 'This server requires an API token. Enter the backend API_TOKEN used to start the server.'
	}, [showSavedTokenWarning])

	const submit = async () => {
		const trimmed = token.trim()
		if (!trimmed) return
		setSubmitting(true)
		setLocalError(null)
		try {
			const api = new APIClient({ apiToken: trimmed })
			// Validate token by calling /meta
			await api.getMeta()
			props.onLogin(trimmed)
		} catch (err) {
			if (err instanceof APIError && err.status === 401) {
				setLocalError('Login failed: invalid API token.')
			} else if (err instanceof APIError) {
				setLocalError(`${err.code}: ${err.message}`)
			} else if (err instanceof Error) {
				setLocalError(err.message)
			} else {
				setLocalError('unknown error')
			}
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
			<div style={{ width: 520, maxWidth: '100%' }}>
				<Typography.Title level={2} style={{ marginTop: 0 }}>
					S3Desk
				</Typography.Title>
				<Typography.Text type="secondary">Local Dashboard</Typography.Text>

				<div style={{ height: 16 }} />

				<Space orientation="vertical" size={12} style={{ width: '100%' }}>
					<Alert type={showSavedTokenWarning ? 'warning' : 'info'} showIcon title={initialHint} />
					{localError ? <Alert type="error" showIcon title={localError} /> : null}

					<form
						onSubmit={(e) => {
							e.preventDefault()
							void submit()
						}}
					>
						<FormField label="API Token" required htmlFor="login-api-token">
							<Input.Password
								id="login-api-token"
								value={token}
								onChange={(e) => setToken(e.target.value)}
								placeholder="API_TOKEN…"
								autoFocus={shouldAutoFocus}
							/>
						</FormField>
						<Space wrap>
							<Button type="primary" htmlType="submit" loading={submitting} disabled={!token.trim()}>
								Login
							</Button>
							{props.onClearSavedToken ? (
								<Button onClick={props.onClearSavedToken} disabled={submitting}>
									Clear saved token
								</Button>
							) : null}
						</Space>
					</form>

					<Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
						This is not your S3 access key. It must match the server{' '}
						<Typography.Text code>API_TOKEN</Typography.Text>.
					</Typography.Paragraph>
				</Space>
			</div>
		</div>
	)
}
