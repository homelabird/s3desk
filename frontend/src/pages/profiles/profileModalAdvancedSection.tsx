import styles from './ProfileModal.module.css'
import type { ProfileModalSectionContentArgs } from './profileModalSectionShared'

export function buildAdvancedSection(args: ProfileModalSectionContentArgs) {
	const { values, setField, viewState } = args

	return (
		<div className={styles.sectionBody}>
			<div className={styles.toggleGrid}>
				{viewState.isS3Provider
					? args.renderSwitchCard({
							title: 'Force Path Style',
							description: 'For MinIO, Ceph, and most custom S3 gateways.',
							checked: values.forcePathStyle,
							onChange: (checked) => setField('forcePathStyle', checked),
							ariaLabel: 'Force Path Style',
						})
					: null}
				{viewState.isAzure
					? args.renderSwitchCard({
							title: 'Use Emulator',
							description: 'For local Azurite or similar emulators.',
							checked: values.azureUseEmulator,
							onChange: (checked) => setField('azureUseEmulator', checked),
							ariaLabel: 'Use Emulator',
						})
					: null}
				{args.renderSwitchCard({
					title: 'Preserve Leading Slash',
					description: 'Keep leading slashes in object keys.',
					checked: values.preserveLeadingSlash,
					onChange: (checked) => setField('preserveLeadingSlash', checked),
					ariaLabel: 'Preserve Leading Slash',
				})}
			</div>
		</div>
	)
}
