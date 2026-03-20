import { Typography } from 'antd'

import styles from './ProfileModal.module.css'
import type { ProfileModalSectionContentArgs } from './profileModalSectionShared'

export function buildAdvancedSection(args: ProfileModalSectionContentArgs) {
	const { values, setField, viewState } = args

	return (
		<div className={styles.sectionBody}>
			<Typography.Text type="secondary" className={styles.sectionNote}>
				Only change these when your provider requires non-default behavior.
			</Typography.Text>
			<div className={styles.toggleGrid}>
				{viewState.isS3Provider
					? args.renderSwitchCard({
							title: 'Force Path Style',
							description: 'Recommended for MinIO, Ceph, and most custom S3 gateways.',
							checked: values.forcePathStyle,
							onChange: (checked) => setField('forcePathStyle', checked),
							ariaLabel: 'Force Path Style',
						})
					: null}
				{viewState.isAzure
					? args.renderSwitchCard({
							title: 'Use Emulator',
							description: 'Enable this only for local Azurite or compatible emulators.',
							checked: values.azureUseEmulator,
							onChange: (checked) => setField('azureUseEmulator', checked),
							ariaLabel: 'Use Emulator',
						})
					: null}
				{args.renderSwitchCard({
					title: 'Preserve Leading Slash',
					description: 'Keep a leading slash in object keys for strict S3 semantics.',
					checked: values.preserveLeadingSlash,
					onChange: (checked) => setField('preserveLeadingSlash', checked),
					ariaLabel: 'Preserve Leading Slash',
				})}
				{args.renderSwitchCard({
					title: 'TLS Insecure Skip Verify',
					description: 'Skip certificate validation for self-signed or development endpoints.',
					checked: values.tlsInsecureSkipVerify,
					onChange: (checked) => setField('tlsInsecureSkipVerify', checked),
					ariaLabel: 'TLS Insecure Skip Verify',
				})}
			</div>
		</div>
	)
}
