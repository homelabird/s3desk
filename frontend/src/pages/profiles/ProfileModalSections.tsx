import { LinkOutlined, SettingOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import { Tag, Typography, type CollapseProps } from 'antd'
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
	editMode?: boolean
	setField: <K extends keyof ProfileFormValues>(key: K, value: ProfileFormValues[K]) => void
	viewState: ProfileModalViewState
}

export function buildProfileModalSectionItems(args: ProfileModalSectionsArgs): CollapseProps['items'] {
	const renderSectionHeader = (props: { title: string; description: string; tags?: ReactNode }) => (
		<div className={styles.sectionHeader}>
			<div className={styles.sectionText}>
				<Typography.Text className={styles.sectionTitle}>{props.title}</Typography.Text>
				<Typography.Text className={styles.sectionDescription}>{props.description}</Typography.Text>
			</div>
			{props.tags ? <div className={styles.sectionMeta}>{props.tags}</div> : null}
		</div>
	)

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
			<ToggleSwitch checked={props.checked} onChange={props.onChange} disabled={props.disabled} ariaLabel={props.ariaLabel ?? props.title} />
		</div>
	)

	const sectionArgs = {
		...args,
		renderSwitchCard,
	}

	return [
		{
			key: 'basic',
			label: renderSectionHeader({
				title: 'Basic Connection',
				description: 'Provider, display name, and the main endpoint or region values.',
				tags: <Tag icon={<LinkOutlined />}>{args.viewState.providerLabel}</Tag>,
			}),
			children: buildBasicConnectionSection(sectionArgs),
		},
		{
			key: 'credentials',
			label: renderSectionHeader({
				title: 'Credentials',
				description: 'Secrets and auth material used to sign requests.',
				tags: args.editMode ? <Tag color="default">Collapsed by default</Tag> : <Tag color="blue">Required on create</Tag>,
			}),
			children: buildCredentialsSection(sectionArgs),
		},
		{
			key: 'advanced',
			label: renderSectionHeader({
				title: 'Advanced Options',
				description: 'Compatibility and transport toggles for unusual environments.',
				tags: <Tag icon={<SettingOutlined />}>Optional</Tag>,
			}),
			children: buildAdvancedSection(sectionArgs),
		},
		{
			key: 'security',
			label: renderSectionHeader({
				title: 'Security & TLS',
				description: 'mTLS certificate material and connection trust settings.',
				tags: <Tag icon={<SafetyCertificateOutlined />}>{args.viewState.tlsStatusLabel}</Tag>,
			}),
			children: buildSecuritySection(sectionArgs),
		},
	]
}
