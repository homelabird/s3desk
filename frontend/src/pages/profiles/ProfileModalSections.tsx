import { Typography } from 'antd'
import type { ReactNode } from 'react'

import { ToggleSwitch } from '../../components/ToggleSwitch'
import styles from './ProfileModal.module.css'
import type { ProfileFormValues } from './profileTypes'
import type { FieldErrors, ProfileModalViewState } from './profileModalValidation'
import {
	buildAdvancedSection,
	buildBasicConnectionSection,
	buildCredentialsSection,
	buildSecuritySection,
} from './profileModalSectionContent'

type ProfileModalSectionsArgs = {
	values: ProfileFormValues
	errors: FieldErrors
	disabled?: boolean
	tlsStatusLoading?: boolean
	onRetryTLSStatus?: () => void
	editMode?: boolean
	setField: <K extends keyof ProfileFormValues>(key: K, value: ProfileFormValues[K]) => void
	viewState: ProfileModalViewState
}

type BuiltSection = {
	key?: 'advanced' | 'security'
	title: string
	description?: string
	configuredCount?: number
	statusLabel?: string
	content: ReactNode
}

function hasValue(value: string | null | undefined) {
	return Boolean(value && value.trim())
}

export function renderSectionHeader(props: { title: string; description?: string; meta?: string }) {
	return (
		<div className={styles.sectionHeader}>
			<div className={styles.sectionText}>
				<Typography.Text className={styles.sectionTitle}>{props.title}</Typography.Text>
				{props.description ? <Typography.Text className={styles.sectionDescription}>{props.description}</Typography.Text> : null}
			</div>
			{props.meta ? <Typography.Text className={styles.sectionMetaText}>{props.meta}</Typography.Text> : null}
		</div>
	)
}

export function buildProfileModalSections(args: ProfileModalSectionsArgs): {
	basic: BuiltSection
	credentials: BuiltSection
	optionalSections: BuiltSection[]
} {
	const advancedConfiguredCount = [
		args.values.forcePathStyle,
		args.values.azureUseEmulator,
		args.values.preserveLeadingSlash,
	].filter(Boolean).length
	const securityConfiguredCount = [
		args.values.tlsInsecureSkipVerify,
		args.viewState.showTLSFields || args.viewState.tlsAction === 'enable',
		hasValue(args.values.tlsCaCertPem),
	].filter(Boolean).length

	const renderSwitchCard = (props: {
		title: string
		description: string
		checked: boolean
		onChange: (checked: boolean) => void
		disabled?: boolean
		ariaLabel?: string
	}) => (
		<div className={styles.switchCard}>
			<div className={styles.switchCardCopy}>
				<Typography.Text className={styles.switchCardTitle}>{props.title}</Typography.Text>
				<Typography.Text className={styles.switchCardDescription}>{props.description}</Typography.Text>
			</div>
			<ToggleSwitch checked={props.checked} onChange={props.onChange} disabled={args.disabled || props.disabled} ariaLabel={props.ariaLabel ?? props.title} />
		</div>
	)

	const sectionArgs = {
		...args,
		renderSwitchCard,
	}

	return {
		basic: {
			title: 'Connection',
			description: 'Provider, endpoint, and region.',
			content: buildBasicConnectionSection(sectionArgs),
		},
		credentials: {
			title: 'Credentials',
			description: 'Only the auth material this provider needs.',
			content: buildCredentialsSection(sectionArgs),
		},
		optionalSections: [
			{
				key: 'advanced',
				title: 'Options',
				description: 'Compatibility toggles and provider-specific overrides.',
				configuredCount: advancedConfiguredCount,
				content: buildAdvancedSection(sectionArgs),
			},
			{
				key: 'security',
				title: 'TLS',
				description: 'mTLS and TLS verification.',
				configuredCount: securityConfiguredCount,
				statusLabel: args.viewState.tlsUnavailable
					? 'mTLS unavailable'
					: args.editMode
						? args.viewState.tlsAction === 'keep'
							? args.viewState.tlsStatusLabel
							: args.viewState.tlsAction === 'enable' ? 'Enable or update' : 'Disable mTLS'
						: undefined,
				content: buildSecuritySection(sectionArgs),
			},
		],
	}
}
