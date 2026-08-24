import { Button, Collapse, Space, Typography } from 'antd'
import { Suspense, useCallback, useMemo, useSyncExternalStore } from 'react'
import { useSearchParams } from 'react-router'

import type { APIClientShape } from '../api/client'
import type { MetaResponse } from '../api/types'
import { getApiBaseUrl, stripApiBaseSuffix } from '../api/baseUrl'
import { AppTabs } from '../components/AppTabs'
import { confirmDangerAction } from '../lib/confirmDangerAction'
import { clearDismissedDialogs, countDismissedDialogs, subscribeDialogPreferences } from '../lib/dialogPreferences'
import { appFeedback } from '../lib/appFeedback'
import { reloadPage } from '../lib/reloadPage'
import { clearResettableUiState } from '../lib/storageResetRegistry'
import {
	AccessSettingsSection,
	NetworkSettingsSection,
	ObjectsSettingsSection,
	ServerSettingsSection,
	TransfersSettingsSection,
} from './settings/settingsLazy'
import styles from './SettingsPage.module.css'

type Props = {
	api: APIClientShape
	meta?: MetaResponse
	shellScopeKey: string
	apiToken: string
	setApiToken: (v: string) => void
	profileId: string | null
	profileName: string | null
}

function SettingsSectionFallback() {
	return (
		<div role="status" className={styles.sectionFallback}>
			<span>Loading settings…</span>
			<span className={styles.sectionFallbackBar} aria-hidden="true" />
		</div>
	)
}

function RecoverySettingsSection({
	apiToken,
	onResetDismissedDialogs,
	onResetUiState,
}: {
	apiToken: string
	onResetDismissedDialogs: () => void
	onResetUiState: () => void
}) {
	const dismissedDialogCount = useSyncExternalStore(
		subscribeDialogPreferences,
		() => countDismissedDialogs(apiToken),
		() => 0,
	)

	return (
		<Space orientation="vertical" size="middle" className={styles.fullWidth}>
			<div className={styles.recoveryCard}>
				<Space orientation="vertical" size={8} className={styles.fullWidth}>
					<Typography.Text strong>Clear saved layout and filters</Typography.Text>
					<Typography.Text type="secondary">Keeps your API token and profiles.</Typography.Text>
					<Button danger onClick={onResetUiState}>
						Clear saved layout
					</Button>
				</Space>
			</div>
			<div className={styles.recoveryCard}>
				<Space orientation="vertical" size={8} className={styles.fullWidth}>
					<Typography.Text strong>Restore hidden confirmations</Typography.Text>
					<Typography.Text type="secondary">
						{dismissedDialogCount > 0
							? `${dismissedDialogCount} confirmation preference(s) are currently hidden.`
							: 'No confirmation preferences are currently hidden.'}
					</Typography.Text>
					<Button onClick={onResetDismissedDialogs} disabled={dismissedDialogCount === 0}>
						Restore confirmations
					</Button>
				</Space>
			</div>
		</Space>
	)
}

export function SettingsPage(props: Props) {
	const [searchParams, setSearchParams] = useSearchParams()
	const settingsTab = searchParams.get('settings')
	const activeTab = ['access', 'objects', 'transfers', 'support'].includes(settingsTab ?? '') ? settingsTab! : 'access'
	const setActiveTab = (key: string) => {
		const next = new URLSearchParams(searchParams)
		next.set('settings', key)
		setSearchParams(next, { replace: true })
	}
	const apiDocsBase = useMemo(() => {
		const apiBaseUrl = getApiBaseUrl()
		const api = new URL(apiBaseUrl, window.location.origin)
		api.pathname = stripApiBaseSuffix(api.pathname)
		return `${api.origin}${api.pathname}`.replace(/\/+$/, '')
	}, [])
	const openapiUrl = `${apiDocsBase}/openapi.yml`
	const apiDocsUrl = `${apiDocsBase}/docs`

	const onResetUiState = useCallback(() => {
		confirmDangerAction({
			title: 'Clear saved layout and filters?',
			description:
				'Clears stored view, filter, layout, and selection state from this browser. Your API token and profiles will be kept.\n\nThe app will reload after clearing these browser preferences.',
			confirmText: 'CLEAR',
			confirmHint: 'CLEAR',
			okText: 'Clear and reload',
			onConfirm: async () => {
				clearResettableUiState()
				appFeedback.success('Saved layout and filters cleared. Reloading…')
				reloadPage()
			},
		})
	}, [])

	const onResetDismissedDialogs = useCallback(() => {
		clearDismissedDialogs(props.apiToken)
		appFeedback.success('Hidden confirmations restored.')
	}, [props.apiToken])

	return (
		<Space orientation="vertical" size="large" className={styles.fullWidth}>
			<AppTabs
				ariaLabel="Settings sections"
				type="card"
				size="small"
				activeKey={activeTab}
				onChange={setActiveTab}
				items={[
					{
						key: 'access',
						label: 'Access',
						children: (
							<Suspense fallback={<SettingsSectionFallback />}>
								<AccessSettingsSection
									apiToken={props.apiToken}
									setApiToken={props.setApiToken}
									profileId={props.profileId}
									profileName={props.profileName}
									apiDocsUrl={apiDocsUrl}
									openapiUrl={openapiUrl}
								/>
							</Suspense>
						),
					},
					{
						key: 'objects',
						label: 'Objects',
						children: (
							<Suspense fallback={<SettingsSectionFallback />}>
								<ObjectsSettingsSection />
							</Suspense>
						),
					},
					{
						key: 'transfers',
						label: 'Transfers',
						children: (
							<Suspense fallback={<SettingsSectionFallback />}>
								<TransfersSettingsSection />
							</Suspense>
						),
					},
					{
						key: 'support',
						label: 'Support',
						children: (
							<Collapse
								size="small"
								items={[
									{
									key: 'backup',
									label: 'Server and backup',
										children: (
											<Suspense fallback={<SettingsSectionFallback />}>
												<ServerSettingsSection api={props.api} meta={props.meta} scopeKey={props.shellScopeKey} />
											</Suspense>
										),
									},
									{
										key: 'network',
										label: 'Network',
										children: (
											<Suspense fallback={<SettingsSectionFallback />}>
												<NetworkSettingsSection />
											</Suspense>
										),
									},
									{
										key: 'browser',
										label: 'Browser recovery',
										children: (
											<RecoverySettingsSection
												apiToken={props.apiToken}
												onResetDismissedDialogs={onResetDismissedDialogs}
												onResetUiState={onResetUiState}
											/>
										),
									},
								]}
							/>
						),
					},
				]}
			/>
		</Space>
	)
}

// formatErr lives in ../lib/errors
