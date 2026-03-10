import { Input, Tag, Typography } from 'antd'

import { FormField } from '../../../components/FormField'
import { NativeSelect } from '../../../components/NativeSelect'
import { ToggleSwitch } from '../../../components/ToggleSwitch'
import styles from '../BucketModal.module.css'
import type { AwsDefaultsState, AwsEncryptionMode, AwsObjectOwnershipMode } from './types'

export function AwsBucketCreateDefaults(props: {
	state: AwsDefaultsState
	onChange: (next: AwsDefaultsState) => void
	clearSubmitError: () => void
}) {
	const { state } = props
	return (
		<section className={styles.secureDefaultsCard} data-testid="bucket-modal-secure-defaults">
			<div className={styles.secureDefaultsHeader}>
				<div className={styles.secureDefaultsCopy}>
					<Typography.Text strong>Secure Defaults</Typography.Text>
					<Typography.Text type="secondary">
						Apply the recommended AWS S3 baseline during bucket creation, then tune controls later if needed.
					</Typography.Text>
					<Tag color="green" variant="filled">
						Recommended preset
					</Tag>
				</div>
				<ToggleSwitch
					checked={state.enabled}
					onChange={(checked) => {
						props.clearSubmitError()
						props.onChange({ ...state, enabled: checked })
					}}
					ariaLabel="Apply recommended AWS secure defaults"
				/>
			</div>

			{state.enabled ? (
				<div className={styles.secureDefaultsGrid}>
					<section className={styles.settingCard}>
						<div className={styles.settingHeader}>
							<div className={styles.settingCopy}>
								<Typography.Text strong>Block Public Access</Typography.Text>
								<Typography.Text type="secondary">All four S3 public access block flags are enabled.</Typography.Text>
							</div>
							<ToggleSwitch
								checked={state.blockPublicAccess}
								onChange={(checked) => {
									props.clearSubmitError()
									props.onChange({ ...state, blockPublicAccess: checked })
								}}
								ariaLabel="Enable block public access defaults"
							/>
						</div>
					</section>

					<section className={styles.settingCard}>
						<div className={styles.settingHeader}>
							<div className={styles.settingCopy}>
								<Typography.Text strong>Object Ownership</Typography.Text>
								<Typography.Text type="secondary">Start with ACLs disabled and bucket ownership enforced.</Typography.Text>
							</div>
							<ToggleSwitch
								checked={state.objectOwnershipEnabled}
								onChange={(checked) => {
									props.clearSubmitError()
									props.onChange({ ...state, objectOwnershipEnabled: checked })
								}}
								ariaLabel="Enable object ownership defaults"
							/>
						</div>
						{state.objectOwnershipEnabled ? (
							<div className={styles.settingBody}>
								<FormField label="Ownership mode" htmlFor="bucket-create-object-ownership">
									<NativeSelect
										id="bucket-create-object-ownership"
										value={state.objectOwnership}
										onChange={(value) => {
											props.clearSubmitError()
											props.onChange({ ...state, objectOwnership: value as AwsObjectOwnershipMode })
										}}
										options={[
											{ value: 'bucket_owner_enforced', label: 'Bucket owner enforced' },
											{ value: 'bucket_owner_preferred', label: 'Bucket owner preferred' },
											{ value: 'object_writer', label: 'Object writer' },
										]}
										ariaLabel="Ownership mode"
									/>
								</FormField>
							</div>
						) : null}
					</section>

					<section className={styles.settingCard}>
						<div className={styles.settingHeader}>
							<div className={styles.settingCopy}>
								<Typography.Text strong>Versioning</Typography.Text>
								<Typography.Text type="secondary">Enable version history at creation time.</Typography.Text>
							</div>
							<ToggleSwitch
								checked={state.versioningEnabled}
								onChange={(checked) => {
									props.clearSubmitError()
									props.onChange({ ...state, versioningEnabled: checked })
								}}
								ariaLabel="Enable versioning defaults"
							/>
						</div>
					</section>

					<section className={styles.settingCard}>
						<div className={styles.settingHeader}>
							<div className={styles.settingCopy}>
								<Typography.Text strong>Default Encryption</Typography.Text>
								<Typography.Text type="secondary">Use SSE-S3 by default or promote to SSE-KMS when a managed key policy is ready.</Typography.Text>
							</div>
							<ToggleSwitch
								checked={state.encryptionEnabled}
								onChange={(checked) => {
									props.clearSubmitError()
									props.onChange({ ...state, encryptionEnabled: checked })
								}}
								ariaLabel="Enable encryption defaults"
							/>
						</div>
						{state.encryptionEnabled ? (
							<div className={styles.settingBody}>
								<FormField label="Encryption mode" htmlFor="bucket-create-encryption-mode">
									<NativeSelect
										id="bucket-create-encryption-mode"
										value={state.encryptionMode}
										onChange={(value) => {
											props.clearSubmitError()
											props.onChange({ ...state, encryptionMode: value as AwsEncryptionMode })
										}}
										options={[
											{ value: 'sse_s3', label: 'SSE-S3' },
											{ value: 'sse_kms', label: 'SSE-KMS' },
										]}
										ariaLabel="Encryption mode"
									/>
								</FormField>
								{state.encryptionMode === 'sse_kms' ? (
									<FormField
										label="KMS key ID (optional)"
										htmlFor="bucket-create-kms-key-id"
										extra={<span className={styles.inlineHint}>Leave blank to use the AWS managed KMS key.</span>}
									>
										<Input
											id="bucket-create-kms-key-id"
											value={state.kmsKeyId}
											onChange={(e) => {
												props.clearSubmitError()
												props.onChange({ ...state, kmsKeyId: e.target.value })
											}}
											placeholder="alias/my-bucket-key"
											autoComplete="off"
										/>
									</FormField>
								) : null}
							</div>
						) : null}
					</section>
				</div>
			) : null}
		</section>
	)
}
