import { Button, Grid } from 'antd'
import { useCallback, useMemo, useState } from 'react'

import type { ProfileTLSStatus } from '../../api/types'
import { DialogModal } from '../../components/DialogModal'
import { OverlaySheet } from '../../components/OverlaySheet'
import { ConfirmDangerDialog } from '../../lib/ConfirmDangerDialog'
import { runIfActionIdle } from '../../lib/pendingActionGuard'
import styles from './ProfileModal.module.css'
import { buildProfileModalSections, renderSectionHeader } from './ProfileModalSections'
import { formatConfiguredStateLabel } from './profileModalSectionShared'
import type { ProfileFormValues, TLSCapability } from './profileTypes'
import {
	buildProfileModalViewState,
	type FieldErrors,
	FIELD_SECTION_MAP,
	type SectionKey,
	validateProfileFormValues,
} from './profileModalValidation'
import { profilesFeedback } from './profilesFeedback'

export function ProfileModal(props: {
	open: boolean
	title: string
	okText: string
	onCancel: () => void
	onSubmit: (values: ProfileFormValues) => void
	loading: boolean
	initialValues?: Partial<ProfileFormValues>
	editMode?: boolean
	tlsCapability?: TLSCapability | null
	tlsStatus?: ProfileTLSStatus | null
	tlsStatusLoading?: boolean
	tlsStatusError?: string | null
}) {
	const sessionKey = [
		props.open ? 'open' : 'closed',
		props.editMode ? 'edit' : 'create',
		props.title,
		props.initialValues?.name ?? '',
		props.initialValues?.provider ?? '',
	].join(':')

	return <ProfileModalSession key={sessionKey} {...props} />
}

function ProfileModalSession(props: {
	open: boolean
	title: string
	okText: string
	onCancel: () => void
	onSubmit: (values: ProfileFormValues) => void
	loading: boolean
	initialValues?: Partial<ProfileFormValues>
	editMode?: boolean
	tlsCapability?: TLSCapability | null
	tlsStatus?: ProfileTLSStatus | null
	tlsStatusLoading?: boolean
	tlsStatusError?: string | null
}) {
	const defaults: ProfileFormValues = useMemo(
		() => ({
			provider: 's3_compatible',
			name: '',
			endpoint: '',
			publicEndpoint: '',
			region: 'us-east-1',
			accessKeyId: '',
			secretAccessKey: '',
			sessionToken: '',
			clearSessionToken: false,
			forcePathStyle: false,
			azureAccountName: '',
			azureAccountKey: '',
			azureEndpoint: '',
			azureSubscriptionId: '',
			azureResourceGroup: '',
			azureTenantId: '',
			azureClientId: '',
			azureClientSecret: '',
			azureUseEmulator: false,
			gcpAnonymous: false,
			gcpServiceAccountJson: '',
			gcpEndpoint: '',
			gcpProjectNumber: '',
			ociNamespace: '',
			ociCompartment: '',
			ociEndpoint: '',
			ociAuthProvider: 'user_principal_auth',
			ociConfigFile: '',
			ociConfigProfile: '',
			preserveLeadingSlash: false,
			tlsInsecureSkipVerify: false,
			tlsEnabled: false,
			tlsAction: 'keep',
			tlsClientCertPem: '',
			tlsClientKeyPem: '',
			tlsCaCertPem: '',
		}),
		[],
	)

	const screens = Grid.useBreakpoint()
	const [values, setValues] = useState<ProfileFormValues>(() => ({ ...defaults, ...(props.initialValues ?? {}) }))
	const [errors, setErrors] = useState<FieldErrors>({})
	const [openSections, setOpenSections] = useState<SectionKey[]>([])
	const [showTLSInsecureConfirm, setShowTLSInsecureConfirm] = useState(false)

	const viewState = buildProfileModalViewState({
		values,
		editMode: props.editMode,
		tlsCapability: props.tlsCapability,
		tlsStatus: props.tlsStatus,
		tlsStatusLoading: props.tlsStatusLoading,
		tlsStatusError: props.tlsStatusError,
	})
	const sheetPlacement = screens.md ? 'right' : 'bottom'
	const isBusy = props.loading

	const applyField = useCallback(<K extends keyof ProfileFormValues>(key: K, value: ProfileFormValues[K]) => {
		setValues((prev) => ({ ...prev, [key]: value }))
		setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev))
	}, [])

	const setField = useCallback(<K extends keyof ProfileFormValues>(key: K, value: ProfileFormValues[K]) => {
		if (key === 'tlsInsecureSkipVerify') {
			const enabled = Boolean(value)
			if (enabled && !values.tlsInsecureSkipVerify) {
				setShowTLSInsecureConfirm(true)
				return
			}
		}
		applyField(key, value)
	}, [applyField, values.tlsInsecureSkipVerify])

	const ensureSectionsOpenForErrors = useCallback((nextErrors: FieldErrors) => {
		const nextSections = new Set(openSections)
		for (const key of Object.keys(nextErrors) as Array<keyof ProfileFormValues>) {
			const sectionKey = FIELD_SECTION_MAP[key]
			if (sectionKey) nextSections.add(sectionKey)
		}
		setOpenSections(Array.from(nextSections))
	}, [openSections])

	const validateAndSubmit = async () => {
		if (isBusy) return
		const next = await validateProfileFormValues({
			values,
			editMode: props.editMode,
			viewState,
		})

		setErrors(next)
		if (Object.keys(next).length > 0) {
			ensureSectionsOpenForErrors(next)
			profilesFeedback.fixHighlightedFields()
			return
		}

		props.onSubmit(values)
	}

	const handleCancel = useCallback(() => {
		runIfActionIdle(isBusy, props.onCancel)
	}, [isBusy, props.onCancel])
	const mobileSheetHeight = 'calc(100dvh - env(safe-area-inset-top))'

	const sections = buildProfileModalSections({
		values,
		errors,
		editMode: props.editMode,
		setField,
		viewState,
	})
	const modalBody = (
		<form
			onSubmit={(event) => {
				event.preventDefault()
				void validateAndSubmit()
			}}
		>
			<div className={styles.formShell}>
				<section className={styles.staticSectionCard}>
					<div className={styles.staticSectionHeader}>
						{renderSectionHeader({ title: sections.basic.title })}
					</div>
					<div className={styles.staticSectionBody}>{sections.basic.content}</div>
				</section>
				<section className={styles.staticSectionCard}>
					<div className={styles.staticSectionHeader}>
						{renderSectionHeader({ title: sections.credentials.title })}
					</div>
					<div className={styles.staticSectionBody}>{sections.credentials.content}</div>
				</section>
				<div className={styles.optionalSections}>
					{sections.optionalSections.map((section) => {
						const key = section.key as SectionKey
						const statusLabel = formatConfiguredStateLabel(section.configuredCount)
						return (
							<details
								key={key}
								className={`${styles.disclosure} ${styles.optionalSection}`}
								open={openSections.includes(key)}
								onToggle={(event) => {
									const nextOpen = event.currentTarget.open
									setOpenSections((prev) => (nextOpen ? Array.from(new Set([...prev, key])) : prev.filter((value) => value !== key)))
								}}
							>
								<summary className={styles.disclosureSummary}>
									<span className={styles.disclosureSummaryCopy}>
										<span className={styles.disclosureSummaryHeader}>
											<span className={styles.disclosureSummaryTitle}>{section.title}</span>
											<span className={styles.disclosureCountBadge}>{statusLabel}</span>
										</span>
									</span>
								</summary>
								<div className={styles.disclosureBody}>
									{section.description ? <p className={styles.disclosureBodyNote}>{section.description}</p> : null}
									{section.content}
								</div>
							</details>
						)
					})}
				</div>
			</div>
		</form>
	)
	const modalFooter = (
		<div className={styles.drawerFooter}>
			<div className={styles.drawerFooterActions}>
				<Button onClick={handleCancel} disabled={isBusy}>Cancel</Button>
				<Button type="primary" loading={props.loading} disabled={isBusy} onClick={() => void validateAndSubmit()}>
					{props.okText}
				</Button>
			</div>
		</div>
	)

	return (
		<>
			{screens.md ? (
				<DialogModal
					open={props.open}
					onClose={handleCancel}
					title={props.title}
					width="min(92vw, 820px)"
					panelClassName={styles.profileDialog}
					bodyClassName={styles.profileDialogBody}
					footerClassName={styles.profileDialogFooter}
					footer={modalFooter}
				>
					{modalBody}
				</DialogModal>
			) : (
				<OverlaySheet
					open={props.open}
					onClose={handleCancel}
					title={props.title}
					placement={sheetPlacement}
					width={undefined}
					height={mobileSheetHeight}
					panelClassName={styles.profileSheet}
					footer={modalFooter}
				>
					{modalBody}
				</OverlaySheet>
			)}
			{showTLSInsecureConfirm ? (
				<ConfirmDangerDialog
					title="Disable certificate verification?"
					description="This turns off HTTPS certificate checks for the profile."
					details="Only for private self-signed endpoints you control."
					confirmText="INSECURE"
					confirmHint='Type "INSECURE" to enable this setting'
					okText="Enable anyway"
					onConfirm={() => applyField('tlsInsecureSkipVerify', true)}
					onClose={() => setShowTLSInsecureConfirm(false)}
				/>
			) : null}
		</>
	)
}
