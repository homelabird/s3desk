import { Button, Collapse, Space, Typography } from 'antd'

import { FormField } from '../../components/FormField'
import { NumberField } from '../../components/NumberField'
import { ToggleSwitch } from '../../components/ToggleSwitch'
import {
	DEFAULT_DOWNLOAD_TASK_CONCURRENCY,
	DEFAULT_UPLOAD_TASK_CONCURRENCY,
	DOWNLOAD_TASK_CONCURRENCY_STORAGE_KEY,
	MAX_DOWNLOAD_TASK_CONCURRENCY,
	MAX_UPLOAD_TASK_CONCURRENCY,
	MIN_DOWNLOAD_TASK_CONCURRENCY,
	MIN_UPLOAD_TASK_CONCURRENCY,
	UPLOAD_TASK_CONCURRENCY_STORAGE_KEY,
	sanitizeDownloadTaskConcurrency,
	sanitizeUploadTaskConcurrency,
} from '../../components/transfers/transferConcurrencyPreferences'
import { useLocalStorageState } from '../../lib/useLocalStorageState'
import styles from '../SettingsPage.module.css'

function clampNumber(value: number | null, fallback: number, min: number, max: number): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
	return Math.min(max, Math.max(min, value))
}

export function TransfersSettingsSection() {
	const [downloadLinkProxyEnabled, setDownloadLinkProxyEnabled] = useLocalStorageState<boolean>(
		'downloadLinkProxyEnabled',
		false,
	)
	const [downloadTaskConcurrencySetting, setDownloadTaskConcurrencySetting] = useLocalStorageState<number>(
		DOWNLOAD_TASK_CONCURRENCY_STORAGE_KEY,
		DEFAULT_DOWNLOAD_TASK_CONCURRENCY,
		{ sanitize: sanitizeDownloadTaskConcurrency },
	)
	const [uploadAutoTuneEnabled, setUploadAutoTuneEnabled] = useLocalStorageState<boolean>('uploadAutoTuneEnabled', true)
	const [uploadTaskConcurrencySetting, setUploadTaskConcurrencySetting] = useLocalStorageState<number>(
		UPLOAD_TASK_CONCURRENCY_STORAGE_KEY,
		DEFAULT_UPLOAD_TASK_CONCURRENCY,
		{ sanitize: sanitizeUploadTaskConcurrency },
	)
	const [uploadBatchConcurrencySetting, setUploadBatchConcurrencySetting] = useLocalStorageState<number>(
		'uploadBatchConcurrency',
		16,
	)
	const [uploadBatchBytesMiBSetting, setUploadBatchBytesMiBSetting] = useLocalStorageState<number>(
		'uploadBatchBytesMiB',
		64,
	)
	const [uploadChunkSizeMiBSetting, setUploadChunkSizeMiBSetting] = useLocalStorageState<number>(
		'uploadChunkSizeMiB',
		128,
	)
	const [uploadChunkConcurrencySetting, setUploadChunkConcurrencySetting] = useLocalStorageState<number>(
		'uploadChunkConcurrency',
		8,
	)
	const [uploadChunkThresholdMiBSetting, setUploadChunkThresholdMiBSetting] = useLocalStorageState<number>(
		'uploadChunkThresholdMiB',
		256,
	)
	const [uploadChunkFileConcurrencySetting, setUploadChunkFileConcurrencySetting] = useLocalStorageState<number>(
		'uploadChunkFileConcurrency',
		2,
	)
	const [uploadResumeConversionEnabled, setUploadResumeConversionEnabled] = useLocalStorageState<boolean>(
		'uploadResumeConversionEnabled',
		false,
	)
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
										checked={downloadLinkProxyEnabled}
										onChange={setDownloadLinkProxyEnabled}
										ariaLabel="Force server proxy for downloads and previews"
									/>
								</FormField>
								<FormField
									label="Upload auto-tuning"
									extra="Automatically adjusts batch/chunk settings based on file size."
								>
									<ToggleSwitch
										checked={uploadAutoTuneEnabled}
										onChange={setUploadAutoTuneEnabled}
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
										value={downloadTaskConcurrencySetting}
										onChange={(value) =>
											setDownloadTaskConcurrencySetting(
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
										value={uploadTaskConcurrencySetting}
										onChange={(value) =>
											setUploadTaskConcurrencySetting(
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
										value={uploadBatchConcurrencySetting}
										onChange={(value) => setUploadBatchConcurrencySetting(clampNumber(value, 16, 1, 32))}
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
										value={uploadBatchBytesMiBSetting}
										onChange={(value) => setUploadBatchBytesMiBSetting(clampNumber(value, 64, 8, 256))}
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
												setUploadBatchConcurrencySetting(8)
												setUploadBatchBytesMiBSetting(32)
												setUploadChunkSizeMiBSetting(64)
												setUploadChunkConcurrencySetting(4)
												setUploadChunkThresholdMiBSetting(128)
											}}
										>
											Stable
										</Button>
										<Button
											onClick={() => {
												setUploadBatchConcurrencySetting(16)
												setUploadBatchBytesMiBSetting(64)
												setUploadChunkSizeMiBSetting(128)
												setUploadChunkConcurrencySetting(8)
												setUploadChunkThresholdMiBSetting(256)
											}}
										>
											Balanced
										</Button>
										<Button
											onClick={() => {
												setUploadBatchConcurrencySetting(32)
												setUploadBatchBytesMiBSetting(128)
												setUploadChunkSizeMiBSetting(256)
												setUploadChunkConcurrencySetting(16)
												setUploadChunkThresholdMiBSetting(512)
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
										value={uploadChunkSizeMiBSetting}
										onChange={(value) => setUploadChunkSizeMiBSetting(clampNumber(value, 128, 16, 512))}
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
										value={uploadChunkConcurrencySetting}
										onChange={(value) => setUploadChunkConcurrencySetting(clampNumber(value, 8, 1, 16))}
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
										value={uploadChunkFileConcurrencySetting}
										onChange={(value) => setUploadChunkFileConcurrencySetting(clampNumber(value, 2, 1, 8))}
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
										value={uploadChunkThresholdMiBSetting}
										onChange={(value) => setUploadChunkThresholdMiBSetting(clampNumber(value, 256, 64, 2048))}
										className={styles.fullWidth}
									/>
								</FormField>
								<FormField
									label="Resume conversion mode"
									extra="Allows resuming uploads even if chunk sizes changed between sessions."
								>
									<ToggleSwitch
										checked={uploadResumeConversionEnabled}
										onChange={setUploadResumeConversionEnabled}
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
