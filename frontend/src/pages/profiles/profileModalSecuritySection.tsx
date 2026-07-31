import { Alert, Input, Typography } from 'antd'

import { FormField } from '../../components/FormField'
import { NativeSelect } from '../../components/NativeSelect'
import styles from './ProfileModal.module.css'
import type { TLSAction } from './profileTypes'
import { profileFieldA11y, type ProfileModalSectionContentArgs } from './profileModalSectionShared'

export function buildSecuritySection(args: ProfileModalSectionContentArgs) {
	const { values, errors, editMode, setField, viewState } = args
	const tlsAction = viewState.tlsAction as TLSAction

	return (
		<div className={styles.sectionBody}>
			{viewState.tlsUnavailable ? <Alert type="warning" showIcon title="mTLS is disabled" description={viewState.tlsDisabledReason} /> : null}
			{viewState.showTLSStatusError ? <Alert type="warning" showIcon title="Failed to load TLS status" description={viewState.showTLSStatusError} /> : null}

			{editMode ? (
				<FormField label="mTLS action" htmlFor="profile-mtls-action">
					<NativeSelect
						id="profile-mtls-action"
						disabled={viewState.tlsUnavailable}
						value={tlsAction}
						onChange={(v) => setField('tlsAction', v as TLSAction)}
						options={[
							{ label: 'Keep current', value: 'keep' },
							{ label: 'Enable or update', value: 'enable' },
							{ label: 'Disable', value: 'disable' },
						]}
					/>
				</FormField>
			) : (
				<div className={styles.toggleGrid}>
					{args.renderSwitchCard({
						title: 'Enable mTLS',
						description: 'Attach a client certificate and key.',
						checked: !!values.tlsEnabled,
						onChange: (checked) => setField('tlsEnabled', checked),
						disabled: viewState.tlsUnavailable,
						ariaLabel: 'Enable mTLS',
					})}
				</div>
			)}

			<div className={styles.toggleGrid}>
				{args.renderSwitchCard({
					title: 'TLS Insecure Skip Verify',
					description: 'Only for private self-signed HTTPS.',
					checked: values.tlsInsecureSkipVerify,
					onChange: (checked) => setField('tlsInsecureSkipVerify', checked),
					ariaLabel: 'TLS Insecure Skip Verify',
				})}
			</div>

			{values.tlsInsecureSkipVerify ? (
				<Typography.Text type="secondary" className={styles.sectionSummaryWarning}>
					<Typography.Text strong>Certificate verification disabled.</Typography.Text> Use only for private self-signed HTTPS you control.
				</Typography.Text>
			) : null}

			{editMode && tlsAction === 'disable' ? (
				<Typography.Text type="secondary" className={styles.sectionNote}>
					Saving will remove the current mTLS material from this profile.
				</Typography.Text>
			) : null}

			{viewState.showTLSFields ? (
				<>
					<FormField label="Client Certificate (PEM)" htmlFor="profile-tls-client-cert-pem" required error={errors.tlsClientCertPem}>
						<Input.TextArea
							{...profileFieldA11y('profile-tls-client-cert-pem', errors.tlsClientCertPem)}
							className={styles.compactTextArea}
							disabled={viewState.tlsUnavailable}
							value={values.tlsClientCertPem ?? ''}
							onChange={(e) => setField('tlsClientCertPem', e.target.value)}
							autoSize={{ minRows: 4, maxRows: 8 }}
							placeholder="-----BEGIN CERTIFICATE-----…"
						/>
					</FormField>
					<FormField label="Client Key (PEM)" htmlFor="profile-tls-client-key-pem" required error={errors.tlsClientKeyPem}>
						<Input.TextArea
							{...profileFieldA11y('profile-tls-client-key-pem', errors.tlsClientKeyPem)}
							className={styles.compactTextArea}
							disabled={viewState.tlsUnavailable}
							value={values.tlsClientKeyPem ?? ''}
							onChange={(e) => setField('tlsClientKeyPem', e.target.value)}
							autoSize={{ minRows: 4, maxRows: 8 }}
							placeholder="-----BEGIN PRIVATE KEY-----…"
						/>
					</FormField>
					<FormField label="CA Certificate (optional)" htmlFor="profile-tls-ca-cert-pem">
						<Input.TextArea
							id="profile-tls-ca-cert-pem"
							className={styles.compactTextArea}
							disabled={viewState.tlsUnavailable}
							value={values.tlsCaCertPem ?? ''}
							onChange={(e) => setField('tlsCaCertPem', e.target.value)}
							autoSize={{ minRows: 3, maxRows: 6 }}
							placeholder="-----BEGIN CERTIFICATE-----…"
						/>
					</FormField>
				</>
			) : null}
		</div>
	)
}
