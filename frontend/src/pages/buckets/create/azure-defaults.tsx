import { PlusOutlined } from '@ant-design/icons'
import { Alert, Button, Input, Tag, Typography } from 'antd'

import { FormField } from '../../../components/FormField'
import { NativeSelect } from '../../../components/NativeSelect'
import { ToggleSwitch } from '../../../components/ToggleSwitch'
import styles from '../BucketModal.module.css'
import type { AzureDefaultsState, AzureStoredPolicyRow, AzureVisibilityMode } from './types'

export function AzureBucketCreateDefaults(props: {
	state: AzureDefaultsState
	onChange: (next: AzureDefaultsState) => void
	clearSubmitError: () => void
	nextKey: () => string
}) {
	const { state } = props
	return (
		<section className={styles.secureDefaultsCard} data-testid="bucket-modal-secure-defaults">
			<div className={styles.secureDefaultsHeader}>
				<div className={styles.secureDefaultsCopy}>
					<Typography.Text strong>Secure Defaults</Typography.Text>
					<Typography.Text type="secondary">
						Start new Azure containers with private anonymous access, then optionally seed stored access policies during creation.
					</Typography.Text>
					<Tag color="green" variant="filled">
						Private baseline
					</Tag>
				</div>
				<ToggleSwitch
					checked={state.enabled}
					onChange={(checked) => {
						props.clearSubmitError()
						props.onChange({ ...state, enabled: checked })
					}}
					ariaLabel="Apply recommended Azure secure defaults"
				/>
			</div>

			{state.enabled ? (
				<>
					<Alert
						type="info"
						showIcon
						className={styles.providerDefaultsHint}
						title="Current create-time Azure controls are limited"
						description="Anonymous access visibility and stored access policies are available here. Immutability, versioning, and broader account-level governance still need post-create controls."
					/>
					<div className={styles.secureDefaultsGrid}>
						<section className={styles.settingCard}>
							<div className={styles.settingCopy}>
								<Typography.Text strong>Anonymous Access</Typography.Text>
								<Typography.Text type="secondary">Keep anonymous access private unless the container must serve blobs publicly.</Typography.Text>
							</div>
							<div className={styles.settingBody}>
								<FormField label="Visibility" htmlFor="bucket-create-azure-visibility">
									<NativeSelect
										id="bucket-create-azure-visibility"
										value={state.visibility}
										onChange={(value) => {
											props.clearSubmitError()
											props.onChange({
												...state,
												visibility: (value === 'blob' || value === 'container' ? value : 'private') as AzureVisibilityMode,
											})
										}}
										options={[
											{ value: 'private', label: 'Private' },
											{ value: 'blob', label: 'Blob' },
											{ value: 'container', label: 'Container' },
										]}
										ariaLabel="Azure visibility"
									/>
								</FormField>
							</div>
						</section>

						<section className={styles.settingCard}>
							<div className={styles.settingHeader}>
								<div className={styles.settingCopy}>
									<Typography.Text strong>Stored access policies</Typography.Text>
									<Typography.Text type="secondary">Optionally seed SAS-scoped stored access policies with structured fields.</Typography.Text>
								</div>
								<ToggleSwitch
									checked={state.storedPoliciesEnabled}
									onChange={(checked) => {
										props.clearSubmitError()
										props.onChange({ ...state, storedPoliciesEnabled: checked })
									}}
									ariaLabel="Seed Azure stored access policies during creation"
								/>
							</div>
							{state.storedPoliciesEnabled ? (
								<div className={styles.settingBody}>
									{state.storedPolicies.length === 0 ? (
										<Typography.Text type="secondary">No stored access policies</Typography.Text>
									) : (
										<div className={styles.structuredCardList}>
											{state.storedPolicies.map((row, index) => (
												<section key={row.key} className={styles.structuredCard}>
													<div className={styles.structuredCardHeader}>
														<Typography.Text strong>{`Stored access policy ${index + 1}`}</Typography.Text>
														<Button
															danger
															size="small"
															onClick={() =>
																props.onChange({
																	...state,
																	storedPolicies: state.storedPolicies.filter((policy) => policy.key !== row.key),
																})
															}
														>
															Remove
														</Button>
													</div>
													<div className={styles.structuredFieldGrid}>
														<div className={styles.structuredField}>
															<Typography.Text type="secondary" className={styles.structuredFieldLabel}>ID</Typography.Text>
															<Input
																value={row.id}
																aria-label={`Azure stored access policy ${index + 1} id`}
																onChange={(e) => updateAzurePolicyRow(props, row.key, { id: e.target.value })}
																placeholder="readonly"
															/>
														</div>
														<div className={styles.structuredField}>
															<Typography.Text type="secondary" className={styles.structuredFieldLabel}>Start</Typography.Text>
															<Input
																value={row.start}
																aria-label={`Azure stored access policy ${index + 1} start`}
																onChange={(e) => updateAzurePolicyRow(props, row.key, { start: e.target.value })}
																placeholder="2026-03-10T00:00:00Z"
															/>
														</div>
														<div className={styles.structuredField}>
															<Typography.Text type="secondary" className={styles.structuredFieldLabel}>Expiry</Typography.Text>
															<Input
																value={row.expiry}
																aria-label={`Azure stored access policy ${index + 1} expiry`}
																onChange={(e) => updateAzurePolicyRow(props, row.key, { expiry: e.target.value })}
																placeholder="2026-03-31T00:00:00Z"
															/>
														</div>
														<div className={styles.structuredField}>
															<Typography.Text type="secondary" className={styles.structuredFieldLabel}>Permission</Typography.Text>
															<Input
																value={row.permission}
																aria-label={`Azure stored access policy ${index + 1} permission`}
																onChange={(e) => updateAzurePolicyRow(props, row.key, { permission: e.target.value })}
																placeholder="rl"
															/>
														</div>
													</div>
												</section>
											))}
										</div>
									)}
									<Button
										icon={<PlusOutlined />}
										disabled={state.storedPolicies.length >= 5}
										onClick={() => {
											props.clearSubmitError()
											props.onChange({
												...state,
												storedPolicies: [
													...state.storedPolicies,
													{ key: props.nextKey(), id: '', start: '', expiry: '', permission: '' },
												],
											})
										}}
									>
										Add stored access policy
									</Button>
									<Typography.Text type="secondary" className={styles.inlineHint}>
										Permissions letters: r(read), w(write), d(delete), l(list), a(add), c(create), u(update), p(process)
									</Typography.Text>
								</div>
							) : null}
						</section>
					</div>
				</>
			) : null}
		</section>
	)
}

function updateAzurePolicyRow(
	props: {
		state: AzureDefaultsState
		onChange: (next: AzureDefaultsState) => void
		clearSubmitError: () => void
	},
	key: string,
	patch: Partial<AzureStoredPolicyRow>,
) {
	props.clearSubmitError()
	props.onChange({
		...props.state,
		storedPolicies: props.state.storedPolicies.map((policy) => (policy.key === key ? { ...policy, ...patch } : policy)),
	})
}
