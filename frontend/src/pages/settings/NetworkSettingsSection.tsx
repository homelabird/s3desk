import { Button, Collapse, Space, Tag, Typography } from 'antd'
import { useEffect, useState } from 'react'

import {
	DEFAULT_RETRY_COUNT,
	DEFAULT_RETRY_DELAY_MS,
	RETRY_COUNT_STORAGE_KEY,
	RETRY_COUNT_MAX,
	RETRY_COUNT_MIN,
	RETRY_DELAY_STORAGE_KEY,
	RETRY_DELAY_MAX_MS,
	RETRY_DELAY_MIN_MS,
} from '../../api/client'
import { FormField } from '../../components/FormField'
import { NumberField } from '../../components/NumberField'
import { formatTime } from '../../lib/format'
import { clearNetworkLog, getNetworkLog, subscribeNetworkLog, type NetworkLogEvent } from '../../lib/networkStatus'
import { useLocalStorageState } from '../../lib/useLocalStorageState'
import styles from '../SettingsPage.module.css'

function networkLogTagColor(kind: NetworkLogEvent['kind']): string {
	return kind === 'retry' ? 'orange' : 'blue'
}

function clampNumber(value: number | null, fallback: number, min: number, max: number): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
	return Math.min(max, Math.max(min, value))
}

export function NetworkSettingsSection() {
	const [apiRetryCount, setApiRetryCount] = useLocalStorageState<number>(RETRY_COUNT_STORAGE_KEY, DEFAULT_RETRY_COUNT)
	const [apiRetryDelayMs, setApiRetryDelayMs] = useLocalStorageState<number>(RETRY_DELAY_STORAGE_KEY, DEFAULT_RETRY_DELAY_MS)
	const [networkLog, setNetworkLog] = useState<NetworkLogEvent[]>(() => getNetworkLog())

	useEffect(() => {
		return subscribeNetworkLog(
			(entry) => {
				setNetworkLog((prev) => [entry, ...prev].slice(0, 50))
			},
			() => setNetworkLog([]),
		)
	}, [])

	return (
		<Space orientation="vertical" size="middle" className={styles.fullWidth}>
			<Typography.Text type="secondary" className={styles.sectionIntro}>
				Saved immediately in this browser.
			</Typography.Text>
			<FormField
				label="Request retry attempts"
				htmlFor="settings-http-retry-count"
				extra="Applies to GET and other idempotent requests."
			>
				<NumberField
					id="settings-http-retry-count"
					min={RETRY_COUNT_MIN}
					max={RETRY_COUNT_MAX}
					value={apiRetryCount}
					onChange={(value) =>
						setApiRetryCount(clampNumber(value, DEFAULT_RETRY_COUNT, RETRY_COUNT_MIN, RETRY_COUNT_MAX))
					}
					className={styles.fullWidth}
				/>
			</FormField>
			<FormField
				label="Delay before retry (ms)"
				htmlFor="settings-retry-base-delay-ms"
				extra={`Exponential backoff, capped at ${RETRY_DELAY_MAX_MS}ms.`}
			>
				<NumberField
					id="settings-retry-base-delay-ms"
					min={RETRY_DELAY_MIN_MS}
					max={RETRY_DELAY_MAX_MS}
					step={100}
					value={apiRetryDelayMs}
					onChange={(value) =>
						setApiRetryDelayMs(clampNumber(value, DEFAULT_RETRY_DELAY_MS, RETRY_DELAY_MIN_MS, RETRY_DELAY_MAX_MS))
					}
					className={styles.fullWidth}
				/>
			</FormField>
			<Collapse
				size="small"
				items={[
					{
						key: 'advanced',
						label: `Network troubleshooting log (${networkLog.length})`,
						children: (
							<FormField
								label="Network diagnostics"
								extra="Recent network events and retries (this session)."
								className={styles.marginBottom0}
							>
								<Space orientation="vertical" size={8} className={styles.fullWidth}>
										<Typography.Text type="secondary">Session log ({networkLog.length})</Typography.Text>
									<Typography.Text type="secondary">
										Retry entries include wait time and reason. If <Typography.Text code>Retry-After</Typography.Text> appears, wait that
										interval before manual retry.
									</Typography.Text>
										<Button size="small" onClick={clearNetworkLog} disabled={networkLog.length === 0}>
										Clear log
									</Button>
									<div className={styles.networkLogBox}>
										<Space orientation="vertical" size={4} className={styles.fullWidth}>
											{networkLog.length === 0 ? (
												<Typography.Text type="secondary">No network events yet.</Typography.Text>
											) : (
												networkLog.map((entry, index) => (
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
		</Space>
	)
}
