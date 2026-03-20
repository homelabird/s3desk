import { Alert, Input, Tag, Typography } from 'antd'

import { FormField } from '../../components/FormField'
import { NativeSelect } from '../../components/NativeSelect'
import styles from './ProfileModal.module.css'
import type { TLSAction } from './profileTypes'
import type { ProfileModalSectionContentArgs } from './profileModalSectionShared'

export function buildSecuritySection(args: ProfileModalSectionContentArgs) {
	const { values, errors, editMode, setField, viewState } = args
	const tlsAction = viewState.tlsAction as TLSAction

	return (
		<div className={styles.sectionBody}>
			<div className={styles.securityStatusRow}>
				<Typography.Text type="secondary">Current status: {viewState.tlsStatusLabel}</Typography.Text>
				<Tag color={viewState.tlsUnavailable ? 'default' : viewState.tlsStatusLabel === 'mTLS enabled' ? 'success' : 'default'}>
					{viewState.tlsStatusLabel}
				</Tag>
			</div>

			{viewState.tlsUnavailable ? <Alert type="warning" showIcon title="mTLS is disabled" description={viewState.tlsDisabledReason} /> : null}
			{viewState.showTLSStatusError ? <Alert type="warning" showIcon title="Failed to load TLS status" description={viewState.showTLSStatusError} /> : null}

			{editMode ? (
				<FormField label="mTLS action">
					<NativeSelect
						disabled={viewState.tlsUnavailable}
						value={tlsAction}
						onChange={(v) => setField('tlsAction', v as TLSAction)}
						options={[
							{ label: 'Keep current', value: 'keep' },
							{ label: 'Enable or update', value: 'enable' },
							{ label: 'Disable', value: 'disable' },
						]}
						ariaLabel="mTLS action"
					/>
				</FormField>
			) : (
				<div className={styles.toggleGrid}>
					{args.renderSwitchCard({
						title: 'Enable mTLS',
						description: 'Attach a client certificate and key for mutual TLS.',
						checked: !!values.tlsEnabled,
						onChange: (checked) => setField('tlsEnabled', checked),
						disabled: viewState.tlsUnavailable,
						ariaLabel: 'Enable mTLS',
					})}
				</div>
			)}

			{editMode && tlsAction === 'disable' ? (
				<Typography.Text type="secondary" className={styles.sectionNote}>
					Saving will remove the current mTLS material from this profile.
				</Typography.Text>
			) : null}

			{viewState.showTLSFields ? (
				<>
					<FormField label="Client Certificate (PEM)" required error={errors.tlsClientCertPem}>
						<Input.TextArea
							disabled={viewState.tlsUnavailable}
							value={values.tlsClientCertPem ?? ''}
							onChange={(e) => setField('tlsClientCertPem', e.target.value)}
							autoSize={{ minRows: 5, maxRows: 10 }}
							aria-label="Client Certificate (PEM)"
							placeholder="-----BEGIN CERTIFICATE-----…"
						/>
					</FormField>
					<FormField label="Client Key (PEM)" required error={errors.tlsClientKeyPem}>
						<Input.TextArea
							disabled={viewState.tlsUnavailable}
							value={values.tlsClientKeyPem ?? ''}
							onChange={(e) => setField('tlsClientKeyPem', e.target.value)}
							autoSize={{ minRows: 5, maxRows: 10 }}
							aria-label="Client Key (PEM)"
							placeholder="-----BEGIN PRIVATE KEY-----…"
						/>
					</FormField>
					<FormField label="CA Certificate (optional)">
						<Input.TextArea
							disabled={viewState.tlsUnavailable}
							value={values.tlsCaCertPem ?? ''}
							onChange={(e) => setField('tlsCaCertPem', e.target.value)}
							autoSize={{ minRows: 4, maxRows: 8 }}
							aria-label="CA Certificate (optional)"
							placeholder="-----BEGIN CERTIFICATE-----…"
						/>
					</FormField>
				</>
			) : null}
		</div>
	)
}
