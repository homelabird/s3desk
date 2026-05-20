import { MoonOutlined, SunOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import { useState } from 'react'

import { APIClient, APIError } from '../api/client'
import { TokenLoginPanel } from '../components/TokenLoginPanel'
import { useThemeMode } from '../useThemeMode'
import styles from './LoginPage.module.css'

type Props = {
	initialToken: string
	onLogin: (token: string) => void
	onClearSavedToken?: () => void
	error?: unknown
}

export function LoginPage(props: Props) {
	const [submitting, setSubmitting] = useState(false)
	const [validationError, setValidationError] = useState<string | null>(null)
	const shouldAutoFocus = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches
	const { mode, toggleMode } = useThemeMode()
	const showSavedTokenWarning = !!props.initialToken

	const submit = async (trimmed: string) => {
		if (submitting) return
		setSubmitting(true)
		setValidationError(null)
		try {
			const api = new APIClient({ apiToken: trimmed })
			// Validate token by calling /meta
			await api.server.getMeta()
			props.onLogin(trimmed)
		} catch (err) {
			if (err instanceof APIError && err.status === 401) {
				setValidationError('Login failed: invalid API token.')
			} else if (err instanceof APIError) {
				setValidationError(`${err.code}: ${err.message}`)
			} else if (err instanceof Error) {
				setValidationError(err.message)
			} else {
				setValidationError('unknown error')
			}
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<div className={styles.shell}>
			<div className={styles.topRightActions}>
				<Button icon={mode === 'dark' ? <SunOutlined /> : <MoonOutlined />} onClick={toggleMode}>
					{mode === 'dark' ? 'Light mode' : 'Dark mode'}
				</Button>
			</div>
			<TokenLoginPanel
				key={props.initialToken || 'empty'}
				initialToken={props.initialToken}
				subtitle="Local Dashboard"
				hintVariant={showSavedTokenWarning ? 'stored-token' : 'required'}
				submitting={submitting}
				validationError={validationError}
				onSubmitToken={submit}
				onClearSavedToken={props.onClearSavedToken}
				autoFocus={shouldAutoFocus}
				inputId="login-api-token"
				errorId="login-api-token-error"
			/>
		</div>
	)
}
