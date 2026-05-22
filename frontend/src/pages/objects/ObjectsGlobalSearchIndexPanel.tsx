import { DownOutlined } from '@ant-design/icons'
import { Button, Input } from 'antd'
import { useState } from 'react'

import styles from './ObjectsSearch.module.css'

type ObjectsGlobalSearchIndexPanelProps = {
	bucket: string
	currentPrefix: string
	indexFullReindex: boolean
	indexPrefix: string
	isCreatingIndexJob: boolean
	isMd: boolean
	isNotIndexed: boolean
	onCreateIndexJob: () => void
	onIndexFullReindexChange: (value: boolean) => void
	onIndexPrefixChange: (value: string) => void
	onUseCurrentPrefix: () => void
}

export function ObjectsGlobalSearchIndexPanel({
	bucket,
	currentPrefix,
	indexFullReindex,
	indexPrefix,
	isCreatingIndexJob,
	isMd,
	isNotIndexed,
	onCreateIndexJob,
	onIndexFullReindexChange,
	onIndexPrefixChange,
	onUseCurrentPrefix,
}: ObjectsGlobalSearchIndexPanelProps) {
	const [open, setOpen] = useState(isNotIndexed)
	const inputFieldClass = `${styles.drawerResponsiveField} ${isMd ? styles.globalSearchInputMd : ''}`
	const buttonSize = isMd ? 'middle' : 'small'

	return (
		<section className={styles.globalSearchIndexCard} data-testid="objects-global-search-index-card">
			<button
				type="button"
				className={styles.globalSearchIndexToggle}
				onClick={() => setOpen((value) => !value)}
				aria-expanded={open}
				data-testid="objects-global-search-index-toggle"
			>
				<span className={styles.globalSearchSectionTitle}>Search index setup</span>
				<DownOutlined className={`${styles.globalSearchIndexIcon} ${open ? styles.globalSearchIndexIconOpen : ''}`} />
			</button>
			{open ? (
				<div className={styles.globalSearchIndexPanel} data-testid="objects-global-search-index-panel">
					<p className={styles.globalSearchIndexHint}>
						Build/rebuild the index for <code className={styles.globalSearchCode}>{bucket}</code>.
					</p>
					<div className={styles.globalSearchFieldRow}>
						<Input
							size={buttonSize}
							allowClear
							placeholder="Index folder path (optional)…"
							aria-label="Index folder path"
							className={inputFieldClass}
							value={indexPrefix}
							onChange={(event) => onIndexPrefixChange(event.target.value)}
						/>
						<Button size={buttonSize} className={styles.globalSearchCompactButton} onClick={onUseCurrentPrefix} disabled={!currentPrefix.trim()}>
							Use current prefix
						</Button>
						<label className={styles.globalSearchCheckboxRow}>
							<input
								type="checkbox"
								checked={indexFullReindex}
								onChange={(event) => onIndexFullReindexChange(event.currentTarget.checked)}
								aria-label="Rebuild from scratch"
							/>
							<span>Rebuild from scratch</span>
						</label>
						<Button
							type="primary"
							size={buttonSize}
							className={styles.globalSearchCompactButton}
							onClick={onCreateIndexJob}
							loading={isCreatingIndexJob}
						>
							Build search index
						</Button>
					</div>
				</div>
			) : null}
		</section>
	)
}
