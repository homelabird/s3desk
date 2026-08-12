import { Button, Collapse, Space, Typography } from 'antd'

import { FormField } from '../../components/FormField'
import { NumberField } from '../../components/NumberField'
import { ToggleSwitch } from '../../components/ToggleSwitch'
import {
	DEFAULT_DOWNLOAD_TASK_CONCURRENCY,
	DEFAULT_UPLOAD_TASK_CONCURRENCY,
	MAX_DOWNLOAD_TASK_CONCURRENCY,
	MAX_UPLOAD_TASK_CONCURRENCY,
	MIN_DOWNLOAD_TASK_CONCURRENCY,
	MIN_UPLOAD_TASK_CONCURRENCY,
} from '../../components/transfers/transferConcurrencyPreferences'
import styles from '../SettingsPage.module.css'

type TransfersSettingsSectionProps = {
	downloadLinkProxyEnabled: boolean
	setDownloadLinkProxyEnabled: (v: boolean) => void
	downloadTaskConcurrencySetting: number
	setDownloadTaskConcurrencySetting: (v: number) => void
	uploadAutoTuneEnabled: boolean
	setUploadAutoTuneEnabled: (v: boolean) => void
	uploadTaskConcurrencySetting: number
	setUploadTaskConcurrencySetting: (v: number) => void
	uploadBatchConcurrencySetting: number
	setUploadBatchConcurrencySetting: (v: number) => void
	uploadBatchBytesMiBSetting: number
	setUploadBatchBytesMiBSetting: (v: number) => void
	uploadChunkSizeMiBSetting: number
	setUploadChunkSizeMiBSetting: (v: number) => void
	uploadChunkConcurrencySetting: number
	setUploadChunkConcurrencySetting: (v: number) => void
	uploadChunkThresholdMiBSetting: number
	setUploadChunkThresholdMiBSetting: (v: number) => void
	uploadChunkFileConcurrencySetting: number
	setUploadChunkFileConcurrencySetting: (v: number) => void
	uploadResumeConversionEnabled: boolean
	setUploadResumeConversionEnabled: (v: boolean) => void
}

function clampNumber(value: number | null, fallback: number, min: number, max: number): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
	return Math.min(max, Math.max(min, value))
}

export function TransfersSettingsSection(props: TransfersSettingsSectionProps) {
	const advancedSummary = 'Advanced transfer options'

	return (
		<Space orientation="vertical" size="middle" className={styles.fullWidth}>
			<Typography.Text type="secondary" className={styles.sectionIntro}>
				Defaults work for most connections.
			</Typography.Text>

			<Collapse
				size="small"
				items={[
					{
						key: 'advanced',
						label: advancedSummary,
						children: (
							<Space orientation="vertical" size="middle" className={styles.fullWidth}>
								<Typography.Text type="secondary" className={styles.sectionIntro}>
									Saved immediately in this browser.
								</Typography.Text>
								<FormField
									label="Force server proxy for downloads and previews"
									extra="Leave this off unless direct downloads fail in this browser. When off, S3Desk tries direct links first and falls back automatically when needed."
								>
									<ToggleSwitch
										checked={props.downloadLinkProxyEnabled}
										onChange={props.setDownloadLinkProxyEnabled}
										ariaLabel="Force server proxy for downloads and previews"
									/>
								</FormField>
								<FormField
									label="Upload auto-tuning"
									extra="Automatically adjusts batch/chunk settings based on file size."
								>
									<ToggleSwitch
										checked={props.uploadAutoTuneEnabled}
										onChange={props.setUploadAutoTuneEnabled}
										ariaLabel="Upload auto-tuning"
									/>
								</FormField>
								<FormField
									label="Download task concurrency"
									htmlFor="transfers-download-task-concurrency"
									extra="Number of downloads started in parallel. Higher values can improve throughput on fast networks, but use more browser bandwidth and memory."
								>
									<NumberField
										id="transfers-download-task-concurrency"
										min={MIN_DOWNLOAD_TASK_CONCURRENCY}
										max={MAX_DOWNLOAD_TASK_CONCURRENCY}
										value={props.downloadTaskConcurrencySetting}
										onChange={(value) =>
											props.setDownloadTaskConcurrencySetting(
												clampNumber(value, DEFAULT_DOWNLOAD_TASK_CONCURRENCY, MIN_DOWNLOAD_TASK_CONCURRENCY, MAX_DOWNLOAD_TASK_CONCURRENCY),
											)
										}
										className={styles.fullWidth}
									/>
								</FormField>
								<FormField
									label="Upload task concurrency"
									htmlFor="transfers-upload-task-concurrency"
									extra="Number of upload tasks started in parallel. Keep this modest because each task can already upload multiple files and chunks at once."
								>
									<NumberField
										id="transfers-upload-task-concurrency"
										min={MIN_UPLOAD_TASK_CONCURRENCY}
										max={MAX_UPLOAD_TASK_CONCURRENCY}
										value={props.uploadTaskConcurrencySetting}
										onChange={(value) =>
											props.setUploadTaskConcurrencySetting(
												clampNumber(value, DEFAULT_UPLOAD_TASK_CONCURRENCY, MIN_UPLOAD_TASK_CONCURRENCY, MAX_UPLOAD_TASK_CONCURRENCY),
											)
										}
										className={styles.fullWidth}
									/>
								</FormField>
								<FormField
									label="Upload batch concurrency"
									htmlFor="settings-upload-batch-concurrency"
									extra="Number of parallel upload batches per client. Higher values can improve throughput on fast networks."
								>
									<NumberField
										id="settings-upload-batch-concurrency"
										min={1}
										max={32}
										value={props.uploadBatchConcurrencySetting}
										onChange={(value) => props.setUploadBatchConcurrencySetting(clampNumber(value, 16, 1, 32))}
										className={styles.fullWidth}
									/>
								</FormField>
								<FormField
									label="Upload batch size (MiB)"
									htmlFor="settings-upload-batch-size-mib"
									extra="Target size per upload batch. Larger batches reduce request overhead but increase memory use."
								>
									<NumberField
										id="settings-upload-batch-size-mib"
										min={8}
										max={256}
										step={8}
										value={props.uploadBatchBytesMiBSetting}
										onChange={(value) => props.setUploadBatchBytesMiBSetting(clampNumber(value, 64, 8, 256))}
										className={styles.fullWidth}
									/>
								</FormField>
								<FormField
									label="Upload tuning presets"
									extra="Quick presets for batch + chunk settings. You can still fine-tune below."
								>
									<Space wrap>
										<Button
											onClick={() => {
												props.setUploadBatchConcurrencySetting(8)
												props.setUploadBatchBytesMiBSetting(32)
												props.setUploadChunkSizeMiBSetting(64)
												props.setUploadChunkConcurrencySetting(4)
												props.setUploadChunkThresholdMiBSetting(128)
											}}
										>
											Stable
										</Button>
										<Button
											onClick={() => {
												props.setUploadBatchConcurrencySetting(16)
												props.setUploadBatchBytesMiBSetting(64)
												props.setUploadChunkSizeMiBSetting(128)
												props.setUploadChunkConcurrencySetting(8)
												props.setUploadChunkThresholdMiBSetting(256)
											}}
										>
											Balanced
										</Button>
										<Button
											onClick={() => {
												props.setUploadBatchConcurrencySetting(32)
												props.setUploadBatchBytesMiBSetting(128)
												props.setUploadChunkSizeMiBSetting(256)
												props.setUploadChunkConcurrencySetting(16)
												props.setUploadChunkThresholdMiBSetting(512)
											}}
										>
											High throughput
										</Button>
									</Space>
								</FormField>
								<FormField
									label="Upload chunk size (MiB)"
									htmlFor="settings-upload-chunk-size-mib"
									extra="Single-file uploads above the threshold are split into chunks of this size."
								>
									<NumberField
										id="settings-upload-chunk-size-mib"
										min={16}
										max={512}
										step={16}
										value={props.uploadChunkSizeMiBSetting}
										onChange={(value) => props.setUploadChunkSizeMiBSetting(clampNumber(value, 128, 16, 512))}
										className={styles.fullWidth}
									/>
								</FormField>
								<FormField
									label="Upload chunk concurrency"
									htmlFor="settings-upload-chunk-concurrency"
									extra="Parallel chunk uploads for a single large file."
								>
									<NumberField
										id="settings-upload-chunk-concurrency"
										min={1}
										max={16}
										value={props.uploadChunkConcurrencySetting}
										onChange={(value) => props.setUploadChunkConcurrencySetting(clampNumber(value, 8, 1, 16))}
										className={styles.fullWidth}
									/>
								</FormField>
								<FormField
									label="Upload file concurrency (chunked)"
									htmlFor="settings-upload-file-concurrency-chunked"
									extra="Number of large files uploaded in parallel when chunking."
								>
									<NumberField
										id="settings-upload-file-concurrency-chunked"
										min={1}
										max={8}
										value={props.uploadChunkFileConcurrencySetting}
										onChange={(value) => props.setUploadChunkFileConcurrencySetting(clampNumber(value, 2, 1, 8))}
										className={styles.fullWidth}
									/>
								</FormField>
								<FormField
									label="Chunking threshold (MiB)"
									htmlFor="settings-chunking-threshold-mib"
									extra="Files larger than this threshold use chunked uploads."
								>
									<NumberField
										id="settings-chunking-threshold-mib"
										min={64}
										max={2048}
										step={64}
										value={props.uploadChunkThresholdMiBSetting}
										onChange={(value) => props.setUploadChunkThresholdMiBSetting(clampNumber(value, 256, 64, 2048))}
										className={styles.fullWidth}
									/>
								</FormField>
								<FormField
									label="Resume conversion mode"
									extra="Allows resuming uploads even if chunk sizes changed between sessions."
								>
									<ToggleSwitch
										checked={props.uploadResumeConversionEnabled}
										onChange={props.setUploadResumeConversionEnabled}
										ariaLabel="Resume conversion mode"
									/>
								</FormField>
							</Space>
						),
					},
				]}
			/>
		</Space>
	)
}
