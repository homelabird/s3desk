import { CheckCircleFilled, DownOutlined, SearchOutlined } from '@ant-design/icons'
import { Button, Drawer, Empty, Input, Select, Space, Tag, Typography } from 'antd'
import { useCallback, useMemo, useState } from 'react'

import styles from './objects.module.css'

type BucketOption = {
	label: string
	value: string
}

type BucketPickerEntry = BucketOption & {
	isCurrent: boolean
	isRecent: boolean
}

type BucketPickerSelectOption = BucketPickerEntry & {
	searchText: string
}

type ObjectsBucketPickerProps = {
	isDesktop: boolean
	value: string
	recentBuckets: string[]
	options: BucketOption[]
	placeholder: string
	disabled?: boolean
	className?: string
	onChange: (value: string | null) => void
	onOpenChange?: (open: boolean) => void
}

function normalizeTestIdPart(value: string): string {
	const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
	return normalized || 'bucket'
}

function buildBucketEntries(value: string, options: BucketOption[], recentBuckets: string[]): BucketPickerEntry[] {
	const optionMap = new Map<string, BucketOption>()
	for (const option of options) {
		optionMap.set(option.value, option)
	}

	const currentEntry =
		value.trim().length > 0
			? {
					label: optionMap.get(value)?.label ?? value,
					value,
					isCurrent: true,
					isRecent: false,
				}
			: null

	const recentEntries = recentBuckets
		.filter((entry) => entry && entry !== value)
		.map((entry) => optionMap.get(entry))
		.filter((entry): entry is BucketOption => !!entry)
		.map((entry) => ({ ...entry, isCurrent: false, isRecent: true }))

	const recentSet = new Set(recentEntries.map((entry) => entry.value))
	const allEntries = options
		.filter((entry) => entry.value !== value && !recentSet.has(entry.value))
		.map((entry) => ({ ...entry, isCurrent: false, isRecent: false }))

	return [...(currentEntry ? [currentEntry] : []), ...recentEntries, ...allEntries]
}

export function ObjectsBucketPicker(props: ObjectsBucketPickerProps) {
	const [mobileOpen, setMobileOpen] = useState(false)
	const [mobileQuery, setMobileQuery] = useState('')

	const orderedEntries = useMemo(
		() => buildBucketEntries(props.value, props.options, props.recentBuckets),
		[props.options, props.recentBuckets, props.value],
	)
	const selectOptions = useMemo<BucketPickerSelectOption[]>(
		() => orderedEntries.map((entry) => ({ ...entry, searchText: `${entry.label} ${entry.value}`.toLowerCase() })),
		[orderedEntries],
	)
	const normalizedMobileQuery = mobileQuery.trim().toLowerCase()
	const filteredEntries = useMemo(() => {
		if (!normalizedMobileQuery) return orderedEntries
		return orderedEntries.filter((entry) => `${entry.label} ${entry.value}`.toLowerCase().includes(normalizedMobileQuery))
	}, [normalizedMobileQuery, orderedEntries])
	const currentEntry = filteredEntries.find((entry) => entry.isCurrent) ?? null
	const recentEntries = filteredEntries.filter((entry) => entry.isRecent)
	const allEntries = filteredEntries.filter((entry) => !entry.isCurrent && !entry.isRecent)
	const currentBucketLabel = props.value || props.placeholder

	const notifyOpenChange = useCallback(
		(open: boolean) => {
			props.onOpenChange?.(open)
		},
		[props],
	)

	const openMobileDrawer = useCallback(() => {
		if (props.disabled) return
		setMobileOpen(true)
		notifyOpenChange(true)
	}, [notifyOpenChange, props.disabled])

	const closeMobileDrawer = useCallback(() => {
		setMobileOpen(false)
		setMobileQuery('')
		notifyOpenChange(false)
	}, [notifyOpenChange])

	const handleSelect = useCallback(
		(nextValue: string | null) => {
			props.onChange(nextValue && nextValue.trim() ? nextValue : null)
			closeMobileDrawer()
		},
		[closeMobileDrawer, props],
	)

	const renderEntry = (entry: BucketPickerEntry, variant: 'desktop' | 'mobile') => (
		<div
			className={variant === 'desktop' ? styles.bucketPickerOption : styles.bucketPickerRowContent}
			data-testid={`objects-bucket-picker-option-${normalizeTestIdPart(entry.value)}`}
		>
			<Space size={8} wrap className={styles.bucketPickerOptionText}>
				<Typography.Text strong={entry.isCurrent}>{entry.label}</Typography.Text>
				{entry.isCurrent ? (
					<Tag color="blue" bordered={false}>
						Current
					</Tag>
				) : null}
				{entry.isRecent ? (
					<Tag bordered={false} className={styles.bucketPickerRecentTag}>
						Recent
					</Tag>
				) : null}
			</Space>
			{entry.isCurrent && variant === 'mobile' ? <CheckCircleFilled className={styles.bucketPickerCurrentIcon} /> : null}
		</div>
	)

	if (props.isDesktop) {
		return (
			<Select
				showSearch
				allowClear
				value={props.value || undefined}
				placeholder={props.placeholder}
				disabled={props.disabled}
				className={`${styles.bucketPickerDesktopSelect} ${props.className ?? ''}`.trim()}
				aria-label="Bucket"
				data-testid="objects-bucket-picker-desktop"
				options={selectOptions}
				optionFilterProp="searchText"
				filterOption={(input, option) => {
					const searchText = String((option as { searchText?: string } | undefined)?.searchText ?? '').toLowerCase()
					return searchText.includes(input.trim().toLowerCase())
				}}
				onOpenChange={notifyOpenChange}
				onChange={(nextValue) => props.onChange(typeof nextValue === 'string' && nextValue.trim() ? nextValue : null)}
				optionRender={(option) => renderEntry(option.data as BucketPickerEntry, 'desktop')}
				notFoundContent={props.disabled && props.options.length === 0 ? 'Loading buckets…' : 'No matching buckets'}
				suffixIcon={<DownOutlined />}
			/>
		)
	}

	return (
		<>
			<button
				type="button"
				className={`${styles.bucketPickerTrigger} ${props.className ?? ''}`.trim()}
				aria-label="Bucket"
				disabled={props.disabled}
				onClick={openMobileDrawer}
				data-testid="objects-bucket-picker-mobile-trigger"
			>
				<span className={styles.bucketPickerTriggerText}>
					<span className={props.value ? styles.bucketPickerTriggerValue : styles.bucketPickerTriggerPlaceholder}>{currentBucketLabel}</span>
					<span className={styles.bucketPickerTriggerHint}>
						{props.value ? 'Tap to switch bucket' : props.options.length > 0 ? 'Tap to choose a bucket' : 'No buckets available'}
					</span>
				</span>
				<DownOutlined className={styles.bucketPickerTriggerIcon} />
			</button>

			<Drawer
				open={mobileOpen}
				onClose={closeMobileDrawer}
				title="Select bucket"
				placement="bottom"
				height="78vh"
				className={styles.bucketPickerDrawer}
				data-testid="objects-bucket-picker-mobile-drawer"
				extra={
					props.value ? (
						<Button type="text" onClick={() => handleSelect(null)} data-testid="objects-bucket-picker-mobile-clear">
							Clear
						</Button>
					) : null
				}
			>
				<div className={styles.bucketPickerDrawerBody}>
					<Input
						allowClear
						value={mobileQuery}
						onChange={(event) => setMobileQuery(event.target.value)}
						placeholder="Search buckets…"
						prefix={<SearchOutlined />}
						aria-label="Search buckets"
						data-testid="objects-bucket-picker-mobile-search"
					/>

					{currentEntry ? (
						<div className={styles.bucketPickerSection}>
							<Typography.Text type="secondary" className={styles.bucketPickerSectionLabel}>
								Current
							</Typography.Text>
							<button
								type="button"
								className={`${styles.bucketPickerRow} ${styles.bucketPickerRowCurrent}`}
								onClick={() => handleSelect(currentEntry.value)}
							>
								{renderEntry(currentEntry, 'mobile')}
							</button>
						</div>
					) : null}

					{recentEntries.length > 0 ? (
						<div className={styles.bucketPickerSection}>
							<Typography.Text type="secondary" className={styles.bucketPickerSectionLabel}>
								Recent
							</Typography.Text>
							<div className={styles.bucketPickerList}>
								{recentEntries.map((entry) => (
									<button
										key={`recent-${entry.value}`}
										type="button"
										className={styles.bucketPickerRow}
										onClick={() => handleSelect(entry.value)}
									>
										{renderEntry(entry, 'mobile')}
									</button>
								))}
							</div>
						</div>
					) : null}

					<div className={styles.bucketPickerSection}>
						<Typography.Text type="secondary" className={styles.bucketPickerSectionLabel}>
							All buckets
						</Typography.Text>
						<div className={styles.bucketPickerList}>
							{allEntries.length > 0 ? (
								allEntries.map((entry) => (
									<button
										key={entry.value}
										type="button"
										className={styles.bucketPickerRow}
										onClick={() => handleSelect(entry.value)}
									>
										{renderEntry(entry, 'mobile')}
									</button>
								))
							) : (
								<div className={styles.bucketPickerEmpty}>
									<Empty
										image={Empty.PRESENTED_IMAGE_SIMPLE}
										description={normalizedMobileQuery ? 'No buckets match this search.' : 'No buckets available.'}
									/>
								</div>
							)}
						</div>
					</div>
				</div>
			</Drawer>
		</>
	)
}
