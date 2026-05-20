import { Button, Collapse, Space, Tag, Typography } from 'antd'
import { useState } from 'react'

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

function clampNumber(value: number | null, fallback: number, min: number, max: number): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
	return Math.min(max, Math.max(min, value))
}

export function NetworkSettingsSection(props: NetworkSettingsSectionProps) {
	const [retryDraft, setRetryDraft] = useState(() => ({
		count: props.apiRetryCount,
		delayMs: props.apiRetryDelayMs,
	}))
	const hasPendingRetryPolicy = retryDraft.count !== props.apiRetryCount || retryDraft.delayMs !== props.apiRetryDelayMs
	const applyRetryPolicy = () => {
		props.setApiRetryCount(retryDraft.count)
		props.setApiRetryDelayMs(retryDraft.delayMs)
	}
	const resetRetryDraft = () => {
		setRetryDraft({
			count: props.apiRetryCount,
			delayMs: props.apiRetryDelayMs,
		})
	}

	return (
		<Space orientation="vertical" size="middle" className={styles.fullWidth}>
			<Typography.Text type="secondary" className={styles.sectionIntro}>
				What this affects: API retry behavior and the current browser session's network troubleshooting log.
			</Typography.Text>
			<FormField
				label="HTTP retry count"
				htmlFor="settings-http-retry-count"
				extra="Applies to GET and other idempotent requests."
			>
				<NumberField
					id="settings-http-retry-count"
					min={RETRY_COUNT_MIN}
					max={RETRY_COUNT_MAX}
					value={retryDraft.count}
					onChange={(value) =>
						setRetryDraft((current) => ({
							...current,
							count: clampNumber(value, DEFAULT_RETRY_COUNT, RETRY_COUNT_MIN, RETRY_COUNT_MAX),
						}))
					}
					className={styles.fullWidth}
				/>
			</FormField>
			<FormField
				label="Retry base delay (ms)"
				htmlFor="settings-retry-base-delay-ms"
				extra={`Exponential backoff, capped at ${RETRY_DELAY_MAX_MS}ms.`}
			>
				<NumberField
					id="settings-retry-base-delay-ms"
					min={RETRY_DELAY_MIN_MS}
					max={RETRY_DELAY_MAX_MS}
					step={100}
					value={retryDraft.delayMs}
					onChange={(value) =>
						setRetryDraft((current) => ({
							...current,
							delayMs: clampNumber(value, DEFAULT_RETRY_DELAY_MS, RETRY_DELAY_MIN_MS, RETRY_DELAY_MAX_MS),
						}))
					}
					className={styles.fullWidth}
				/>
			</FormField>
			<div className={styles.settingsApplyBar}>
				<Typography.Text type="secondary">
					{hasPendingRetryPolicy ? 'Retry policy has unapplied changes.' : 'Retry policy matches the saved values.'}
				</Typography.Text>
				<Space wrap>
					<Button type="primary" onClick={applyRetryPolicy} disabled={!hasPendingRetryPolicy}>
						Apply retry policy
					</Button>
					<Button onClick={resetRetryDraft} disabled={!hasPendingRetryPolicy}>
						Cancel retry changes
					</Button>
				</Space>
			</div>
			<Collapse
				size="small"
				items={[
					{
						key: 'advanced',
						label: `Network log (${props.networkLog.length})`,
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
		</Space>
	)
}
