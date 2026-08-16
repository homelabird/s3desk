import { Alert, Button, Input, Typography } from 'antd'
import { useMemo, useState } from 'react'

import { getHttpHeaderValueValidationError } from '../lib/httpHeaderValue'
import { BrandLockup } from './BrandLockup'
import { FormField } from './FormField'
import styles from './TokenLoginPanel.module.css'

type TokenLoginPanelProps = {
	initialToken: string
	subtitle: string
	hintVariant: 'required' | 'stored-token'
	submitting: boolean
	validationError?: string | null
	onSubmitToken: (token: string) => void | Promise<void>
	onClearSavedToken?: () => void
	autoFocus?: boolean
	errorId?: string
	inputId?: string
	className?: string
}

export function TokenLoginPanel(props: TokenLoginPanelProps) {
	const [token, setToken] = useState(props.initialToken ?? '')
	const [localError, setLocalError] = useState<string | null>(null)
	const errorId = props.errorId ?? 'api-token-login-error'
	const inputId = props.inputId ?? 'api-token-login-input'
	const visibleError = localError ?? props.validationError ?? null
	const rootClassName = [styles.root, props.className].filter(Boolean).join(' ')

	const hint = useMemo(() => {
		if (props.hintVariant === 'stored-token') {
			return 'Stored API token for this browser session is invalid. Please log in again with a valid token.'
		}
		return 'This server requires an API token. Enter the backend API_TOKEN used to start the server.'
	}, [props.hintVariant])

	const handleSubmit = () => {
		const trimmed = token.trim()
		if (!trimmed || props.submitting) return
		const headerError = getHttpHeaderValueValidationError('API token', trimmed)
		if (headerError) {
			setLocalError(headerError)
			return
		}
		setLocalError(null)
		void props.onSubmitToken(trimmed)
	}

	return (
		<div className={rootClassName}>
			<BrandLockup titleAs="h1" subtitle={props.subtitle} variant="hero" className={styles.brand} />

			<div className={styles.card}>
				{props.hintVariant === 'stored-token' ? (
					<Alert type="warning" showIcon title={hint} />
				) : (
					<Typography.Text type="secondary" className={styles.hint}>{hint}</Typography.Text>
				)}
				{visibleError ? <Alert id={errorId} type="error" showIcon title={visibleError} /> : null}

				<form
					onSubmit={(event) => {
						event.preventDefault()
						handleSubmit()
					}}
					className={styles.form}
				>
					<input
						type="text"
						name="username"
						value="api-token"
						autoComplete="username"
						className="sr-only"
						tabIndex={-1}
						aria-hidden="true"
						readOnly
					/>
					<FormField label="API Token" required htmlFor={inputId}>
						<Input.Password
							id={inputId}
							value={token}
							onChange={(event) => {
								setToken(event.target.value)
								if (localError) setLocalError(null)
							}}
							placeholder="API_TOKEN…"
							autoFocus={props.autoFocus}
							autoComplete="current-password"
							aria-invalid={visibleError ? 'true' : undefined}
							aria-describedby={visibleError ? errorId : undefined}
						/>
					</FormField>

					<div className={styles.actions}>
						<Button type="primary" htmlType="submit" loading={props.submitting} disabled={!token.trim() || props.submitting}>
							Login
						</Button>
						{props.initialToken && props.onClearSavedToken ? (
							<Button onClick={props.onClearSavedToken} disabled={props.submitting}>
								Clear stored token
							</Button>
						) : null}
					</div>
				</form>

				<Typography.Paragraph type="secondary" className={styles.meta}>
					This is not your S3 access key. It must match the server{' '}
					<Typography.Text code>API_TOKEN</Typography.Text> and is stored only for this browser session.
				</Typography.Paragraph>
			</div>
		</div>
	)
}
