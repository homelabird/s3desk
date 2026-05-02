import { DownOutlined, SearchOutlined } from '@ant-design/icons'
import { useCallback, useId, useMemo, useState, type CSSProperties } from 'react'

import {
	loadingBucketsPlaceholder,
	noMatchingBucketsHint,
	noBucketsAvailableHint,
	noBucketsAvailableSentenceHint,
	noBucketsMatchSearchHint,
	searchBucketsPlaceholder,
	selectBucketTitle,
	tapToChooseBucketHint,
	tapToSwitchBucketHint,
} from '../../lib/actionHints'
import { ObjectsBucketPickerEntryList } from './ObjectsBucketPickerEntryList'
import styles from './ObjectsBucketPicker.module.css'
import { ObjectsOverlaySheet } from './ObjectsOverlaySheet'
import {
	buildBucketEntries,
	filterBucketEntries,
	splitBucketEntries,
	type BucketOption,
} from './objectsBucketPickerModel'
import { useObjectsBucketPickerDesktopLayout } from './useObjectsBucketPickerDesktopLayout'

type ObjectsBucketPickerProps = {
	scopeKey: string
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

export function ObjectsBucketPicker({
	className,
	disabled,
	isDesktop,
	onChange,
	onOpenChange,
	options,
	placeholder,
	recentBuckets,
	scopeKey,
	value,
}: ObjectsBucketPickerProps) {
	const [desktopOpen, setDesktopOpen] = useState(false)
	const [desktopScopeKey, setDesktopScopeKey] = useState('')
	const [desktopQuery, setDesktopQuery] = useState('')
	const [mobileOpen, setMobileOpen] = useState(false)
	const [mobileScopeKey, setMobileScopeKey] = useState('')
	const [mobileQuery, setMobileQuery] = useState('')
	const desktopPopoverId = useId()

	const desktopScopeMatches = desktopScopeKey === scopeKey
	const mobileScopeMatches = mobileScopeKey === scopeKey
	const desktopOpenVisible = desktopOpen && desktopScopeMatches
	const mobileOpenVisible = mobileOpen && mobileScopeMatches
	const desktopQueryValue = desktopScopeMatches ? desktopQuery : ''
	const mobileQueryValue = mobileScopeMatches ? mobileQuery : ''

	const orderedEntries = useMemo(
		() => buildBucketEntries(value, options, recentBuckets),
		[options, recentBuckets, value],
	)
	const filteredDesktopEntries = useMemo(
		() => filterBucketEntries(orderedEntries, desktopQueryValue),
		[desktopQueryValue, orderedEntries],
	)
	const filteredMobileEntries = useMemo(
		() => filterBucketEntries(orderedEntries, mobileQueryValue),
		[mobileQueryValue, orderedEntries],
	)
	const desktopEntries = useMemo(() => splitBucketEntries(filteredDesktopEntries), [filteredDesktopEntries])
	const mobileEntries = useMemo(() => splitBucketEntries(filteredMobileEntries), [filteredMobileEntries])
	const currentBucketLabel = value || placeholder
	const triggerLabel = `Bucket: ${currentBucketLabel}`

	const notifyOpenChange = useCallback(
		(open: boolean) => {
			onOpenChange?.(open)
		},
		[onOpenChange],
	)

	const closeDesktopPopover = useCallback(() => {
		setDesktopOpen(false)
		setDesktopScopeKey('')
		setDesktopQuery('')
		notifyOpenChange(false)
	}, [notifyOpenChange])

	const closeMobileDrawer = useCallback(() => {
		setMobileOpen(false)
		setMobileScopeKey('')
		setMobileQuery('')
		notifyOpenChange(false)
	}, [notifyOpenChange])

	const {
		desktopInputRef,
		desktopPopoverLayout,
		desktopRootRef,
		desktopTriggerRef,
		handleDesktopRootKeyDownCapture,
		handleDesktopTriggerKeyDown,
	} = useObjectsBucketPickerDesktopLayout({
		open: desktopOpenVisible,
		onClose: closeDesktopPopover,
	})

	const handleSelect = useCallback(
		(nextValue: string | null, source: 'desktop' | 'mobile') => {
			onChange(nextValue && nextValue.trim() ? nextValue : null)
			if (source === 'desktop') {
				closeDesktopPopover()
				return
			}
			closeMobileDrawer()
		},
		[closeDesktopPopover, closeMobileDrawer, onChange],
	)

	const openDesktopPopover = useCallback(() => {
		if (disabled) return
		setDesktopScopeKey(scopeKey)
		setDesktopQuery('')
		setDesktopOpen(true)
		notifyOpenChange(true)
	}, [disabled, notifyOpenChange, scopeKey])

	const openMobileDrawer = useCallback(() => {
		if (disabled) return
		setMobileScopeKey(scopeKey)
		setMobileQuery('')
		setMobileOpen(true)
		notifyOpenChange(true)
	}, [disabled, notifyOpenChange, scopeKey])

	const commitFirstDesktopMatch = useCallback(() => {
		const nextEntry = filteredDesktopEntries[0] ?? null
		if (!nextEntry) return
		handleSelect(nextEntry.value, 'desktop')
	}, [filteredDesktopEntries, handleSelect])

	if (isDesktop) {
		const desktopPopoverStyle: CSSProperties = {
			width: desktopPopoverLayout.width,
			left: desktopPopoverLayout.align === 'left' ? 0 : 'auto',
			right: desktopPopoverLayout.align === 'right' ? 0 : 'auto',
		}
		const desktopBodyStyle: CSSProperties = {
			maxHeight: desktopPopoverLayout.maxBodyHeight,
		}

		return (
			<div
				ref={desktopRootRef}
				className={`${styles.bucketPickerDesktop} ${className ?? ''}`.trim()}
				onKeyDownCapture={handleDesktopRootKeyDownCapture}
			>
				<button
					ref={desktopTriggerRef}
					type="button"
					className={styles.bucketPickerDesktopTrigger}
					aria-label={triggerLabel}
					aria-expanded={desktopOpenVisible}
					aria-haspopup="dialog"
					aria-controls={desktopOpenVisible ? desktopPopoverId : undefined}
					disabled={disabled}
					title={currentBucketLabel}
					onClick={() => {
						if (desktopOpenVisible) {
							closeDesktopPopover()
							return
						}
						openDesktopPopover()
					}}
					onKeyDown={handleDesktopTriggerKeyDown}
					data-testid="objects-bucket-picker-desktop"
				>
					<span
						className={value ? styles.bucketPickerDesktopValue : styles.bucketPickerDesktopPlaceholder}
						title={currentBucketLabel}
						data-testid="objects-bucket-picker-desktop-value"
					>
						{currentBucketLabel}
					</span>
					<DownOutlined
						className={`${styles.bucketPickerDesktopChevron} ${desktopOpenVisible ? styles.bucketPickerDesktopChevronOpen : ''}`}
					/>
				</button>

				{desktopOpenVisible ? (
					<div
						className={`${styles.bucketPickerDesktopPopover} ${
							desktopPopoverLayout.align === 'right' ? styles.bucketPickerDesktopPopoverAlignRight : ''
						}`.trim()}
						id={desktopPopoverId}
						role="dialog"
						aria-label={selectBucketTitle()}
						style={desktopPopoverStyle}
						data-testid="objects-bucket-picker-desktop-popover"
					>
						<div className={styles.bucketPickerDesktopHeader}>
							<label className={styles.bucketPickerSearchField}>
								<SearchOutlined className={styles.bucketPickerSearchIcon} />
								<input
									ref={desktopInputRef}
									type="text"
									value={desktopQueryValue}
									onChange={(event) => {
										setDesktopScopeKey(scopeKey)
										setDesktopQuery(event.currentTarget.value)
									}}
									onKeyDown={(event) => {
										if (event.key !== 'Enter') return
										event.preventDefault()
										commitFirstDesktopMatch()
									}}
									placeholder={searchBucketsPlaceholder()}
									aria-label="Search buckets"
									className={styles.bucketPickerSearchInput}
								/>
							</label>
							{value ? (
								<button type="button" className={styles.bucketPickerInlineAction} onClick={() => handleSelect(null, 'desktop')}>
									Clear
								</button>
							) : null}
						</div>

						<div className={styles.bucketPickerDesktopBody} style={desktopBodyStyle}>
							<ObjectsBucketPickerEntryList
								{...desktopEntries}
								variant="desktop"
								emptyMessage={disabled && options.length === 0 ? loadingBucketsPlaceholder() : noMatchingBucketsHint()}
								onSelect={(nextValue) => handleSelect(nextValue, 'desktop')}
							/>
						</div>
					</div>
				) : null}
			</div>
		)
	}

	return (
		<>
			<button
				type="button"
				className={`${styles.bucketPickerTrigger} ${className ?? ''}`.trim()}
				aria-label={triggerLabel}
				disabled={disabled}
				onClick={openMobileDrawer}
				data-testid="objects-bucket-picker-mobile-trigger"
			>
				<span className={styles.bucketPickerTriggerText}>
					<span className={value ? styles.bucketPickerTriggerValue : styles.bucketPickerTriggerPlaceholder}>
						{currentBucketLabel}
					</span>
					<span className={styles.bucketPickerTriggerHint}>
						{value ? tapToSwitchBucketHint() : options.length > 0 ? tapToChooseBucketHint() : noBucketsAvailableHint()}
					</span>
				</span>
				<DownOutlined className={styles.bucketPickerTriggerIcon} />
			</button>

			<ObjectsOverlaySheet
				open={mobileOpenVisible}
				onClose={closeMobileDrawer}
				title={selectBucketTitle()}
				placement="bottom"
				height="78dvh"
				dataTestId="objects-bucket-picker-mobile-drawer"
				extra={
					value ? (
						<button
							type="button"
							className={styles.bucketPickerInlineAction}
							onClick={() => handleSelect(null, 'mobile')}
							data-testid="objects-bucket-picker-mobile-clear"
						>
							Clear
						</button>
					) : null
				}
			>
				<div className={styles.bucketPickerDrawerBody}>
					<label className={styles.bucketPickerSearchField}>
						<SearchOutlined className={styles.bucketPickerSearchIcon} />
						<input
							type="text"
							value={mobileQueryValue}
							onChange={(event) => {
								setMobileScopeKey(scopeKey)
								setMobileQuery(event.currentTarget.value)
							}}
							placeholder={searchBucketsPlaceholder()}
							aria-label="Search buckets"
							className={styles.bucketPickerSearchInput}
							data-testid="objects-bucket-picker-mobile-search"
						/>
					</label>

					<ObjectsBucketPickerEntryList
						{...mobileEntries}
						variant="mobile"
						emptyMessage={mobileQueryValue.trim() ? noBucketsMatchSearchHint() : noBucketsAvailableSentenceHint()}
						onSelect={(nextValue) => handleSelect(nextValue, 'mobile')}
					/>
				</div>
			</ObjectsOverlaySheet>
		</>
	)
}
