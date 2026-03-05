import { InfoCircleOutlined } from '@ant-design/icons'
import { Alert, Collapse, Descriptions, Space, Spin, Tag, Tooltip, Typography } from 'antd'

import type { MetaResponse } from '../../api/types'
import styles from '../SettingsPage.module.css'

type ServerSettingsSectionProps = {
	meta: MetaResponse | undefined
	isFetching: boolean
	errorMessage: string | null
}

export function ServerSettingsSection(props: ServerSettingsSectionProps) {
	const tlsCapability = props.meta?.capabilities?.profileTls
	const tlsEnabled = tlsCapability?.enabled ?? false
	const tlsReason = tlsCapability?.reason ?? ''

	const mtlsLabel = (
		<Space size={4}>
			<span>mTLS (client cert)</span>
			<Tooltip title="Requires ENCRYPTION_KEY to store client certificates at rest.">
				<InfoCircleOutlined />
			</Tooltip>
		</Space>
	)

	return (
		<Space orientation="vertical" size="middle" className={styles.fullWidth}>
			{props.isFetching && !props.meta ? (
				<div className={styles.centerRow}>
					<Spin />
				</div>
			) : null}

			{props.errorMessage ? (
				<Alert type="error" showIcon title="Failed to load /meta" description={props.errorMessage} className={styles.marginBottom12} />
			) : null}

			{props.meta ? (
				<>
					{props.meta.transferEngine.available && !props.meta.transferEngine.compatible ? (
						<Alert
							type="warning"
							showIcon
							title="Transfer engine is incompatible"
							description={`Requires rclone >= ${props.meta.transferEngine.minVersion}. Current: ${props.meta.transferEngine.version || 'unknown'}.`}
						/>
					) : null}

					<Collapse
						size="small"
						items={[
							{
								key: 'advanced',
								label: 'Advanced',
								children: (
									<Space orientation="vertical" size="middle" className={styles.fullWidth}>
										<Typography.Text type="secondary">Detailed server metadata and capability status.</Typography.Text>
										<Descriptions size="small" bordered column={1}>
											<Descriptions.Item label="Version">{props.meta.version}</Descriptions.Item>
											<Descriptions.Item label="Server Addr">
												<Typography.Text code>{props.meta.serverAddr}</Typography.Text>
											</Descriptions.Item>
											<Descriptions.Item label="Data Dir">
												<Typography.Text code>{props.meta.dataDir}</Typography.Text>
											</Descriptions.Item>
											<Descriptions.Item label="Static Dir">
												<Typography.Text code>{props.meta.staticDir}</Typography.Text>
											</Descriptions.Item>
											<Descriptions.Item label="API Token Required">
												<Tag color={props.meta.apiTokenEnabled ? 'warning' : 'default'}>
													{props.meta.apiTokenEnabled ? 'enabled' : 'disabled'}
												</Tag>
											</Descriptions.Item>
											<Descriptions.Item label="Encryption">
												<Tag color={props.meta.encryptionEnabled ? 'success' : 'default'}>
													{props.meta.encryptionEnabled ? 'enabled' : 'disabled'}
												</Tag>
											</Descriptions.Item>
											<Descriptions.Item label={mtlsLabel}>
												<Space orientation="vertical" size={0}>
													<Tag color={tlsEnabled ? 'success' : 'default'}>{tlsEnabled ? 'enabled' : 'disabled'}</Tag>
													{!tlsEnabled && tlsReason ? <Typography.Text type="secondary">{tlsReason}</Typography.Text> : null}
												</Space>
											</Descriptions.Item>
											<Descriptions.Item label="Allowed Local Dirs">
												<Space orientation="vertical" size={0}>
													{props.meta.allowedLocalDirs?.length ? (
														<Typography.Text code>{props.meta.allowedLocalDirs.join(', ')}</Typography.Text>
													) : (
														<Typography.Text type="secondary">(not configured)</Typography.Text>
													)}
													<Typography.Text type="secondary">
														Server-side local sync jobs are restricted to these roots.
													</Typography.Text>
												</Space>
											</Descriptions.Item>
											<Descriptions.Item label="Job Concurrency">{props.meta.jobConcurrency}</Descriptions.Item>
											<Descriptions.Item label="Job Log Max Bytes">
												{props.meta.jobLogMaxBytes ? (
													<Typography.Text code>{props.meta.jobLogMaxBytes}</Typography.Text>
												) : (
													<Typography.Text type="secondary">(unlimited)</Typography.Text>
												)}
											</Descriptions.Item>
											<Descriptions.Item label="Job Retention (seconds)">
												{props.meta.jobRetentionSeconds ? (
													<Typography.Text code>{props.meta.jobRetentionSeconds}</Typography.Text>
												) : (
													<Typography.Text type="secondary">(keep forever)</Typography.Text>
												)}
											</Descriptions.Item>
											<Descriptions.Item label="Job Log Retention (seconds)">
												{props.meta.jobLogRetentionSeconds ? (
													<Typography.Text code>{props.meta.jobLogRetentionSeconds}</Typography.Text>
												) : (
													<Typography.Text type="secondary">(keep forever)</Typography.Text>
												)}
											</Descriptions.Item>
											<Descriptions.Item label="Upload Session TTL (seconds)">
												{props.meta.uploadSessionTTLSeconds}
											</Descriptions.Item>
											<Descriptions.Item label="Upload Max Bytes">
												{props.meta.uploadMaxBytes ? (
													<Typography.Text code>{props.meta.uploadMaxBytes}</Typography.Text>
												) : (
													<Typography.Text type="secondary">(unlimited)</Typography.Text>
												)}
											</Descriptions.Item>
											<Descriptions.Item label="Transfer Engine">
												<Space>
													<Tag color={props.meta.transferEngine.available ? 'success' : 'default'}>
														{props.meta.transferEngine.available ? 'available' : 'missing'}
													</Tag>
													{props.meta.transferEngine.available ? (
														<Tag color={props.meta.transferEngine.compatible ? 'success' : 'error'}>
															{props.meta.transferEngine.compatible
																? 'compatible'
																: `incompatible (>= ${props.meta.transferEngine.minVersion})`}
														</Tag>
													) : null}
													<Typography.Text code>{props.meta.transferEngine.name}</Typography.Text>
													{props.meta.transferEngine.version ? (
														<Typography.Text code>{props.meta.transferEngine.version}</Typography.Text>
													) : null}
													{props.meta.transferEngine.path ? (
														<Typography.Text code>{props.meta.transferEngine.path}</Typography.Text>
													) : null}
												</Space>
											</Descriptions.Item>
										</Descriptions>
									</Space>
								),
							},
						]}
					/>
				</>
			) : null}
		</Space>
	)
}
