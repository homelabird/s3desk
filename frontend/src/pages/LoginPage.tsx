import { MoonOutlined, SunOutlined } from '@ant-design/icons'
import { Alert, Button, Input, Space, Typography } from 'antd'
import { useMemo, useState } from 'react'

import { APIClient, APIError } from '../api/client'
import { BrandLockup } from '../components/BrandLockup'
import { FormField } from '../components/FormField'
import { getHttpHeaderValueValidationError } from '../lib/httpHeaderValue'
import { useThemeMode } from '../useThemeMode'

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
	const { mode, toggleMode } = useThemeMode()

	const showSavedTokenWarning = !!props.initialToken
	const initialHint = useMemo(() => {
		if (showSavedTokenWarning) {
			return 'Stored API token for this browser session is invalid. Please log in again with a valid token.'
		}
		return 'This server requires an API token. Enter the backend API_TOKEN used to start the server.'
	}, [showSavedTokenWarning])

	const submit = async () => {
		const trimmed = token.trim()
		if (!trimmed) return
		const headerError = getHttpHeaderValueValidationError('API token', trimmed)
		if (headerError) {
			setLocalError(headerError)
			return
		}
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
		<div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative' }}>
			<div style={{ position: 'absolute', top: 24, right: 24 }}>
				<Button icon={mode === 'dark' ? <SunOutlined /> : <MoonOutlined />} onClick={toggleMode}>
					{mode === 'dark' ? 'Light mode' : 'Dark mode'}
				</Button>
			</div>
			<div style={{ width: 520, maxWidth: '100%' }}>
				<BrandLockup titleAs="h1" subtitle="Local Dashboard" variant="hero" />

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
									Clear stored token
								</Button>
							) : null}
						</Space>
					</form>

					<Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
						This is not your S3 access key. It must match the server{' '}
						<Typography.Text code>API_TOKEN</Typography.Text> and is stored only for this browser session.
					</Typography.Paragraph>
				</Space>
			</div>
		</div>
	)
}
