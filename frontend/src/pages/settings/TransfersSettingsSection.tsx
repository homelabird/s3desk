import { Button, Collapse, Space } from 'antd'

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

export function TransfersSettingsSection(props: TransfersSettingsSectionProps) {
	return (
		<div>
			<FormField
				label="Downloads and previews: Use server proxy"
				extra="When enabled, downloads, previews, and 'Link…' always use /download-proxy. When disabled, downloads try presigned URLs first and fall back to the proxy only if CORS blocks the request."
			>
				<ToggleSwitch
					checked={props.downloadLinkProxyEnabled}
					onChange={props.setDownloadLinkProxyEnabled}
					ariaLabel="Downloads and previews: Use server proxy"
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
							typeof value === 'number' ? value : DEFAULT_DOWNLOAD_TASK_CONCURRENCY,
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
							typeof value === 'number' ? value : DEFAULT_UPLOAD_TASK_CONCURRENCY,
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
							<Space orientation="vertical" size="middle" className={styles.fullWidth}>
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
									label="Upload batch concurrency"
									extra="Number of parallel upload batches per client. Higher values can improve throughput on fast networks."
								>
									<NumberField
										min={1}
										max={32}
										value={props.uploadBatchConcurrencySetting}
										onChange={(value) => props.setUploadBatchConcurrencySetting(typeof value === 'number' ? value : 16)}
										className={styles.fullWidth}
									/>
								</FormField>
								<FormField
									label="Upload batch size (MiB)"
									extra="Target size per upload batch. Larger batches reduce request overhead but increase memory use."
								>
									<NumberField
										min={8}
										max={256}
										step={8}
										value={props.uploadBatchBytesMiBSetting}
										onChange={(value) => props.setUploadBatchBytesMiBSetting(typeof value === 'number' ? value : 64)}
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
											Fast
										</Button>
										<Button
											type="primary"
											onClick={() => {
												props.setUploadBatchConcurrencySetting(32)
												props.setUploadBatchBytesMiBSetting(128)
												props.setUploadChunkSizeMiBSetting(256)
												props.setUploadChunkConcurrencySetting(16)
												props.setUploadChunkThresholdMiBSetting(512)
											}}
										>
											Max Throughput
										</Button>
									</Space>
								</FormField>
								<FormField
									label="Upload chunk size (MiB)"
									extra="Single-file uploads above the threshold are split into chunks of this size."
								>
									<NumberField
										min={16}
										max={512}
										step={16}
										value={props.uploadChunkSizeMiBSetting}
										onChange={(value) => props.setUploadChunkSizeMiBSetting(typeof value === 'number' ? value : 128)}
										className={styles.fullWidth}
									/>
								</FormField>
								<FormField
									label="Upload chunk concurrency"
									extra="Parallel chunk uploads for a single large file."
								>
									<NumberField
										min={1}
										max={16}
										value={props.uploadChunkConcurrencySetting}
										onChange={(value) => props.setUploadChunkConcurrencySetting(typeof value === 'number' ? value : 8)}
										className={styles.fullWidth}
									/>
								</FormField>
								<FormField
									label="Upload file concurrency (chunked)"
									extra="Number of large files uploaded in parallel when chunking."
								>
									<NumberField
										min={1}
										max={8}
										value={props.uploadChunkFileConcurrencySetting}
										onChange={(value) =>
											props.setUploadChunkFileConcurrencySetting(typeof value === 'number' ? value : 2)
										}
										className={styles.fullWidth}
									/>
								</FormField>
								<FormField
									label="Chunking threshold (MiB)"
									extra="Files larger than this threshold use chunked uploads."
								>
									<NumberField
										min={64}
										max={2048}
										step={64}
										value={props.uploadChunkThresholdMiBSetting}
										onChange={(value) =>
											props.setUploadChunkThresholdMiBSetting(typeof value === 'number' ? value : 256)
										}
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
		</div>
	)
}
