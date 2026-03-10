import { PlusOutlined } from '@ant-design/icons'
import { Alert, Button, Input, Tag, Typography } from 'antd'

import { FormField } from '../../../components/FormField'
import { NativeSelect } from '../../../components/NativeSelect'
import { ToggleSwitch } from '../../../components/ToggleSwitch'
import styles from '../BucketModal.module.css'
import type { GCSBindingRow, GCSPublicMode, GcsDefaultsState } from './types'

export function GcsBucketCreateDefaults(props: {
	state: GcsDefaultsState
	onChange: (next: GcsDefaultsState) => void
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
						Start new GCS buckets with private exposure, then optionally seed the first IAM bindings during creation.
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
					ariaLabel="Apply recommended GCS secure defaults"
				/>
			</div>

			{state.enabled ? (
				<>
					<Alert
						type="info"
						showIcon
						className={styles.providerDefaultsHint}
						title="Current create-time GCS controls are limited"
						description="Uniform bucket-level access and Public Access Prevention are not wired into this create flow yet. Use Controls after creation when you need deeper governance."
					/>
					<div className={styles.secureDefaultsGrid}>
						<section className={styles.settingCard}>
							<div className={styles.settingCopy}>
								<Typography.Text strong>Public Exposure</Typography.Text>
								<Typography.Text type="secondary">Keep the bucket private by default or bootstrap it as public if the workload explicitly needs anonymous reads.</Typography.Text>
							</div>
							<div className={styles.settingBody}>
								<FormField label="Access mode" htmlFor="bucket-create-gcs-public-mode">
									<NativeSelect
										id="bucket-create-gcs-public-mode"
										value={state.publicMode}
										onChange={(value) => {
											props.clearSubmitError()
											props.onChange({
												...state,
												publicMode: (value === 'public' ? 'public' : 'private') as GCSPublicMode,
											})
										}}
										options={[
											{ value: 'private', label: 'Private' },
											{ value: 'public', label: 'Public' },
										]}
										ariaLabel="GCS access mode"
									/>
								</FormField>
							</div>
						</section>

						<section className={styles.settingCard}>
							<div className={styles.settingHeader}>
								<div className={styles.settingCopy}>
									<Typography.Text strong>Initial IAM bindings</Typography.Text>
									<Typography.Text type="secondary">Optionally seed the first bucket-level IAM bindings without dropping into raw JSON.</Typography.Text>
								</div>
								<ToggleSwitch
									checked={state.bindingsEnabled}
									onChange={(checked) => {
										props.clearSubmitError()
										props.onChange({ ...state, bindingsEnabled: checked })
									}}
									ariaLabel="Seed GCS IAM bindings during creation"
								/>
							</div>
							{state.bindingsEnabled ? (
								<div className={styles.settingBody}>
									{state.bindings.length === 0 ? (
										<Typography.Text type="secondary">No initial bindings</Typography.Text>
									) : (
										<div className={styles.structuredCardList}>
											{state.bindings.map((row, index) => (
												<section key={row.key} className={styles.structuredCard}>
													<div className={styles.structuredCardHeader}>
														<Typography.Text strong>{`Binding ${index + 1}`}</Typography.Text>
														<Button
															danger
															size="small"
															onClick={() =>
																props.onChange({
																	...state,
																	bindings: state.bindings.filter((binding) => binding.key !== row.key),
																})
															}
														>
															Remove
														</Button>
													</div>
													<div className={styles.structuredField}>
														<Typography.Text type="secondary" className={styles.structuredFieldLabel}>
															Role
														</Typography.Text>
														<Input
															value={row.role}
															aria-label={`GCS binding ${index + 1} role`}
															onChange={(e) => updateGcsBindingRow(props, row.key, { role: e.target.value })}
															placeholder="roles/storage.objectViewer"
														/>
													</div>
													<div className={styles.structuredField}>
														<Typography.Text type="secondary" className={styles.structuredFieldLabel}>
															Members
														</Typography.Text>
														<Input.TextArea
															value={row.membersText}
															aria-label={`GCS binding ${index + 1} members`}
															onChange={(e) => updateGcsBindingRow(props, row.key, { membersText: e.target.value })}
															className={styles.membersInput}
															rows={4}
															placeholder="One per line: user:ops@example.com"
														/>
													</div>
												</section>
											))}
										</div>
									)}
									<Button
										icon={<PlusOutlined />}
										onClick={() => {
											props.clearSubmitError()
											props.onChange({
												...state,
												bindings: [...state.bindings, { key: props.nextKey(), role: '', membersText: '' }],
											})
										}}
									>
										Add binding
									</Button>
									<Typography.Text type="secondary" className={styles.inlineHint}>
										Use one member per line, for example <Typography.Text code>user:ops@example.com</Typography.Text> or <Typography.Text code>allUsers</Typography.Text>.
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

function updateGcsBindingRow(
	props: {
		state: GcsDefaultsState
		onChange: (next: GcsDefaultsState) => void
		clearSubmitError: () => void
	},
	key: string,
	patch: Partial<GCSBindingRow>,
) {
	props.clearSubmitError()
	props.onChange({
		...props.state,
		bindings: props.state.bindings.map((binding) => (binding.key === key ? { ...binding, ...patch } : binding)),
	})
}
