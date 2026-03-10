import { LockOutlined } from '@ant-design/icons'
import { Button, Collapse, Grid, Tag, Typography, message } from 'antd'
import { useCallback, useMemo, useState } from 'react'

import type { ProfileTLSStatus } from '../../api/types'
import { OverlaySheet } from '../../components/OverlaySheet'
import { runIfActionIdle } from '../../lib/pendingActionGuard'
import styles from './ProfileModal.module.css'
import { buildProfileModalSectionItems } from './ProfileModalSections'
import type { ProfileFormValues, TLSCapability } from './profileTypes'
import {
	buildProfileModalViewState,
	type FieldErrors,
	FIELD_SECTION_MAP,
	DEFAULT_CREATE_SECTIONS,
	DEFAULT_EDIT_SECTIONS,
	type SectionKey,
	validateProfileFormValues,
} from './profileModalValidation'

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
			endpoint: 'http://127.0.0.1:9000',
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
	const [openSections, setOpenSections] = useState<SectionKey[]>(props.editMode ? DEFAULT_EDIT_SECTIONS : DEFAULT_CREATE_SECTIONS)

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

	const setField = useCallback(<K extends keyof ProfileFormValues>(key: K, value: ProfileFormValues[K]) => {
		setValues((prev) => ({ ...prev, [key]: value }))
		setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev))
	}, [])

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
			message.error('Fix the highlighted fields.')
			return
		}

		props.onSubmit(values)
	}

	const handleCancel = useCallback(() => {
		runIfActionIdle(isBusy, props.onCancel)
	}, [isBusy, props.onCancel])

	const sectionItems = buildProfileModalSectionItems({
		values,
		errors,
		editMode: props.editMode,
		setField,
		viewState,
	})

	return (
		<OverlaySheet
			open={props.open}
			onClose={handleCancel}
			title={props.title}
			placement={sheetPlacement}
			width={screens.md ? 'min(92vw, 980px)' : undefined}
			height={!screens.md ? '100dvh' : undefined}
			footer={
				<div className={styles.drawerFooter}>
					<Button onClick={handleCancel} disabled={isBusy}>Cancel</Button>
					<Button type="primary" loading={props.loading} disabled={isBusy} onClick={() => void validateAndSubmit()}>
						{props.okText}
					</Button>
				</div>
			}
		>
			<form
				onSubmit={(event) => {
					event.preventDefault()
					void validateAndSubmit()
				}}
			>
				<div className={styles.formShell}>
					<div className={styles.hero}>
						<div className={styles.heroCopy}>
							<Typography.Text className={styles.heroEyebrow}>Profiles</Typography.Text>
							<Typography.Text className={styles.heroDescription}>
								Configure connection details first, then open the advanced sections only if this provider needs them.
							</Typography.Text>
						</div>
						<div className={styles.heroMeta}>
							<Tag>{viewState.providerLabel}</Tag>
							<Tag icon={<LockOutlined />} color={props.editMode ? 'gold' : 'blue'}>
								{props.editMode ? 'Editing existing profile' : 'Creating new profile'}
							</Tag>
						</div>
					</div>

					<Collapse
						className={styles.sections}
						activeKey={openSections}
						onChange={(keys) => {
							const next = Array.isArray(keys) ? keys.map((key) => String(key) as SectionKey) : [String(keys) as SectionKey]
							setOpenSections(next)
						}}
						items={sectionItems}
					/>
				</div>
			</form>
		</OverlaySheet>
	)
}
