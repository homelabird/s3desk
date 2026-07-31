import type { ReactNode } from 'react'

import styles from './ProfileModal.module.css'
import type { ProfileFormValues } from './profileTypes'
import type { FieldErrors, ProfileModalViewState } from './profileModalValidation'

export type ProfileModalSectionContentArgs = {
	values: ProfileFormValues
	errors: FieldErrors
	editMode?: boolean
	setField: <K extends keyof ProfileFormValues>(key: K, value: ProfileFormValues[K]) => void
	viewState: ProfileModalViewState
	renderSwitchCard: (props: {
		title: string
		description: string
		checked: boolean
		onChange: (checked: boolean) => void
		disabled?: boolean
		ariaLabel?: string
	}) => ReactNode
}

type AdvancedFieldDisclosureProps = {
	title: string
	description: string
	configuredCount?: number
	children: ReactNode
}

export function formatConfiguredStateLabel(configuredCount = 0) {
	return configuredCount > 0 ? `${configuredCount} configured` : 'Off'
}

export function countConfiguredValues(values: Array<string | null | undefined>) {
	return values.reduce((count, value) => (value && value.trim() ? count + 1 : count), 0)
}

export function profileFieldA11y(id: string, error?: ReactNode) {
	const hasError = Boolean(error)
	return {
		id,
		'aria-invalid': hasError || undefined,
		'aria-describedby': hasError ? `${id}-error` : undefined,
	}
}

export function renderAdvancedFieldDisclosure({
	title,
	description,
	configuredCount = 0,
	children,
}: AdvancedFieldDisclosureProps) {
	const statusLabel = formatConfiguredStateLabel(configuredCount)

	return (
		<details className={styles.disclosure}>
			<summary className={styles.disclosureSummary}>
				<span className={styles.disclosureSummaryCopy}>
					<span className={styles.disclosureSummaryHeader}>
						<span className={styles.disclosureSummaryTitle}>{title}</span>
						<span className={styles.disclosureCountBadge}>{statusLabel}</span>
					</span>
				</span>
			</summary>
			<div className={styles.disclosureBody}>
				<p className={styles.disclosureBodyNote}>{description}</p>
				{children}
			</div>
		</details>
	)
}
