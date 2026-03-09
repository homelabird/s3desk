import { Button, Collapse, Space, Tag, Typography } from 'antd'

import {
	DEFAULT_RETRY_COUNT,
	DEFAULT_RETRY_DELAY_MS,
	RETRY_COUNT_MAX,
	RETRY_COUNT_MIN,
	RETRY_DELAY_MAX_MS,
	RETRY_DELAY_MIN_MS,
} from '../../api/client'
import { FormField } from '../../components/FormField'
import { NumberField } from '../../components/NumberField'
import { formatTime } from '../../lib/format'
import type { NetworkLogEvent } from '../../lib/networkStatus'
import styles from '../SettingsPage.module.css'

type NetworkSettingsSectionProps = {
	apiRetryCount: number
	setApiRetryCount: (v: number) => void
	apiRetryDelayMs: number
	setApiRetryDelayMs: (v: number) => void
	networkLog: NetworkLogEvent[]
	onClearNetworkLog: () => void
}

function networkLogTagColor(kind: NetworkLogEvent['kind']): string {
	return kind === 'retry' ? 'orange' : 'blue'
}

export function NetworkSettingsSection(props: NetworkSettingsSectionProps) {
	return (
		<div>
			<FormField label="HTTP retry count" extra="Applies to GET and other idempotent requests.">
				<NumberField
					min={RETRY_COUNT_MIN}
					max={RETRY_COUNT_MAX}
					value={props.apiRetryCount}
					onChange={(value) =>
						props.setApiRetryCount(
							typeof value === 'number' ? Math.min(RETRY_COUNT_MAX, Math.max(RETRY_COUNT_MIN, value)) : DEFAULT_RETRY_COUNT,
						)
					}
					className={styles.fullWidth}
				/>
			</FormField>
			<FormField label="Retry base delay (ms)" extra={`Exponential backoff, capped at ${RETRY_DELAY_MAX_MS}ms.`}>
				<NumberField
					min={RETRY_DELAY_MIN_MS}
					max={RETRY_DELAY_MAX_MS}
					step={100}
					value={props.apiRetryDelayMs}
					onChange={(value) =>
						props.setApiRetryDelayMs(
							typeof value === 'number'
								? Math.min(RETRY_DELAY_MAX_MS, Math.max(RETRY_DELAY_MIN_MS, value))
								: DEFAULT_RETRY_DELAY_MS,
						)
					}
					className={styles.fullWidth}
				/>
			</FormField>
			<Collapse
				size="small"
				items={[
					{
						key: 'advanced',
						label: 'Advanced',
						children: (
							<FormField
								label="Network diagnostics"
								extra="Recent network events and retries (this session)."
								className={styles.marginBottom0}
							>
								<Space orientation="vertical" size={8} className={styles.fullWidth}>
									<Typography.Text type="secondary">Session log ({props.networkLog.length})</Typography.Text>
									<Typography.Text type="secondary">
										Retry entries include wait time and reason. If <Typography.Text code>Retry-After</Typography.Text> appears, wait that
										interval before manual retry.
									</Typography.Text>
									<Button size="small" onClick={props.onClearNetworkLog} disabled={props.networkLog.length === 0}>
										Clear log
									</Button>
									<div className={styles.networkLogBox}>
										<Space orientation="vertical" size={4} className={styles.fullWidth}>
											{props.networkLog.length === 0 ? (
												<Typography.Text type="secondary">No network events yet.</Typography.Text>
											) : (
												props.networkLog.map((entry, index) => (
													<Space key={`${entry.ts}-${index}`} size={8} wrap>
														<Typography.Text type="secondary">{formatTime(entry.ts)}</Typography.Text>
														<Tag color={networkLogTagColor(entry.kind)}>{entry.kind.toUpperCase()}</Tag>
														<Typography.Text type="secondary">{entry.message}</Typography.Text>
													</Space>
												))
											)}
										</Space>
									</div>
								</Space>
							</FormField>
						),
					},
				]}
			/>
		</div>
	)
}
