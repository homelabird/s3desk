import { CheckCircleFilled, DownOutlined, SearchOutlined } from '@ant-design/icons'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

import { ObjectsOverlaySheet } from './ObjectsOverlaySheet'
import styles from './ObjectsBucketPicker.module.css'

type BucketOption = {
	label: string
	value: string
}

type BucketPickerEntry = BucketOption & {
	isCurrent: boolean
	isRecent: boolean
}

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

type DesktopPopoverLayout = {
	width: number
	maxBodyHeight: number
	align: 'left' | 'right'
}

const DESKTOP_POPOVER_MIN_WIDTH = 380
const DESKTOP_POPOVER_DEFAULT_WIDTH = 440
const DESKTOP_POPOVER_MAX_WIDTH = 560
const DESKTOP_POPOVER_VIEWPORT_GUTTER = 16
const DESKTOP_POPOVER_TRIGGER_EXPANSION = 120
const DESKTOP_POPOVER_BODY_MIN_HEIGHT = 180
const DESKTOP_POPOVER_BODY_MAX_HEIGHT = 420

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

function filterBucketEntries(entries: BucketPickerEntry[], query: string): BucketPickerEntry[] {
	const normalizedQuery = query.trim().toLowerCase()
	if (!normalizedQuery) return entries
	return entries.filter((entry) => `${entry.label} ${entry.value}`.toLowerCase().includes(normalizedQuery))
}

function renderEntryContent(entry: BucketPickerEntry, variant: 'desktop' | 'mobile') {
	return (
		<div className={variant === 'desktop' ? styles.bucketPickerOption : styles.bucketPickerRowContent}>
			<div className={styles.bucketPickerOptionText}>
				<span className={`${styles.bucketPickerEntryLabel} ${entry.isCurrent ? styles.bucketPickerEntryLabelCurrent : ''}`}>{entry.label}</span>
				<div className={styles.bucketPickerBadgeRow}>
					{entry.isCurrent ? <span className={`${styles.bucketPickerBadge} ${styles.bucketPickerBadgeCurrent}`}>Current</span> : null}
					{entry.isRecent ? <span className={`${styles.bucketPickerBadge} ${styles.bucketPickerBadgeRecent}`}>Recent</span> : null}
				</div>
			</div>
			{entry.isCurrent && variant === 'mobile' ? <CheckCircleFilled className={styles.bucketPickerCurrentIcon} /> : null}
		</div>
	)
}

function renderEntryList(props: {
	variant: 'desktop' | 'mobile'
	currentEntry: BucketPickerEntry | null
	recentEntries: BucketPickerEntry[]
	allEntries: BucketPickerEntry[]
	emptyMessage: string
	onSelect: (value: string) => void
}) {
	const renderButton = (entry: BucketPickerEntry, sectionKey: string, current = false) => (
		<button
			key={`${sectionKey}-${entry.value}`}
			type="button"
			className={`${styles.bucketPickerRow} ${current ? styles.bucketPickerRowCurrent : ''}`}
			onClick={() => props.onSelect(entry.value)}
			data-testid={`objects-bucket-picker-option-${normalizeTestIdPart(entry.value)}`}
		>
			{renderEntryContent(entry, props.variant)}
		</button>
	)

	if (!props.currentEntry && props.recentEntries.length === 0 && props.allEntries.length === 0) {
		return <div className={styles.bucketPickerEmpty}>{props.emptyMessage}</div>
	}

	return (
		<>
			{props.currentEntry ? (
				<div className={styles.bucketPickerSection}>
					<div className={styles.bucketPickerSectionLabel}>Current</div>
					{renderButton(props.currentEntry, 'current', true)}
				</div>
			) : null}

			{props.recentEntries.length > 0 ? (
				<div className={styles.bucketPickerSection}>
					<div className={styles.bucketPickerSectionLabel}>Recent</div>
					<div className={styles.bucketPickerList}>{props.recentEntries.map((entry) => renderButton(entry, 'recent'))}</div>
				</div>
			) : null}

			{props.allEntries.length > 0 ? (
				<div className={styles.bucketPickerSection}>
					<div className={styles.bucketPickerSectionLabel}>All buckets</div>
					<div className={styles.bucketPickerList}>{props.allEntries.map((entry) => renderButton(entry, 'all'))}</div>
				</div>
			) : null}
		</>
	)
}

export function ObjectsBucketPicker(props: ObjectsBucketPickerProps) {
	const [desktopOpen, setDesktopOpen] = useState(false)
	const [desktopScopeKey, setDesktopScopeKey] = useState('')
	const [desktopQuery, setDesktopQuery] = useState('')
	const [mobileOpen, setMobileOpen] = useState(false)
	const [mobileScopeKey, setMobileScopeKey] = useState('')
	const [mobileQuery, setMobileQuery] = useState('')
	const desktopRootRef = useRef<HTMLDivElement>(null)
	const desktopTriggerRef = useRef<HTMLButtonElement>(null)
	const desktopInputRef = useRef<HTMLInputElement>(null)
	const [desktopPopoverLayout, setDesktopPopoverLayout] = useState<DesktopPopoverLayout>({
		width: DESKTOP_POPOVER_DEFAULT_WIDTH,
		maxBodyHeight: DESKTOP_POPOVER_BODY_MAX_HEIGHT,
		align: 'left',
	})

	const desktopScopeMatches = desktopScopeKey === props.scopeKey
	const mobileScopeMatches = mobileScopeKey === props.scopeKey
	const desktopOpenVisible = desktopOpen && desktopScopeMatches
	const mobileOpenVisible = mobileOpen && mobileScopeMatches
	const desktopQueryValue = desktopScopeMatches ? desktopQuery : ''
	const mobileQueryValue = mobileScopeMatches ? mobileQuery : ''

	const orderedEntries = useMemo(
		() => buildBucketEntries(props.value, props.options, props.recentBuckets),
		[props.options, props.recentBuckets, props.value],
	)
	const filteredDesktopEntries = useMemo(
		() => filterBucketEntries(orderedEntries, desktopQueryValue),
		[desktopQueryValue, orderedEntries],
	)
	const filteredMobileEntries = useMemo(
		() => filterBucketEntries(orderedEntries, mobileQueryValue),
		[mobileQueryValue, orderedEntries],
	)
	const currentBucketLabel = props.value || props.placeholder

	const notifyOpenChange = useCallback(
		(open: boolean) => {
			props.onOpenChange?.(open)
		},
		[props],
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

	const handleSelect = useCallback(
		(nextValue: string | null, source: 'desktop' | 'mobile') => {
			props.onChange(nextValue && nextValue.trim() ? nextValue : null)
			if (source === 'desktop') {
				closeDesktopPopover()
				return
			}
			closeMobileDrawer()
		},
		[closeDesktopPopover, closeMobileDrawer, props],
	)

	const openDesktopPopover = useCallback(() => {
		if (props.disabled) return
		setDesktopScopeKey(props.scopeKey)
		setDesktopQuery('')
		setDesktopOpen(true)
		notifyOpenChange(true)
	}, [notifyOpenChange, props.disabled, props.scopeKey])

	const openMobileDrawer = useCallback(() => {
		if (props.disabled) return
		setMobileScopeKey(props.scopeKey)
		setMobileQuery('')
		setMobileOpen(true)
		notifyOpenChange(true)
	}, [notifyOpenChange, props.disabled, props.scopeKey])

	const currentDesktopEntry = filteredDesktopEntries.find((entry) => entry.isCurrent) ?? null
	const recentDesktopEntries = filteredDesktopEntries.filter((entry) => entry.isRecent)
	const allDesktopEntries = filteredDesktopEntries.filter((entry) => !entry.isCurrent && !entry.isRecent)
	const currentMobileEntry = filteredMobileEntries.find((entry) => entry.isCurrent) ?? null
	const recentMobileEntries = filteredMobileEntries.filter((entry) => entry.isRecent)
	const allMobileEntries = filteredMobileEntries.filter((entry) => !entry.isCurrent && !entry.isRecent)

	const commitFirstDesktopMatch = useCallback(() => {
		const nextEntry = filteredDesktopEntries[0] ?? null
		if (!nextEntry) return
		handleSelect(nextEntry.value, 'desktop')
	}, [filteredDesktopEntries, handleSelect])

	const updateDesktopPopoverLayout = useCallback(() => {
		const rootEl = desktopRootRef.current
		const triggerEl = desktopTriggerRef.current
		if (!rootEl || !triggerEl) return

		const rootRect = rootEl.getBoundingClientRect()
		const triggerRect = triggerEl.getBoundingClientRect()
		const viewportWidth = window.innerWidth
		const viewportHeight = window.innerHeight
		const availableViewportWidth = Math.max(300, viewportWidth - DESKTOP_POPOVER_VIEWPORT_GUTTER * 2)
		const minWidth = Math.min(DESKTOP_POPOVER_MIN_WIDTH, availableViewportWidth)
		const maxWidth = Math.min(DESKTOP_POPOVER_MAX_WIDTH, availableViewportWidth)
		const desiredWidth = Math.max(
			minWidth,
			Math.min(maxWidth, Math.max(DESKTOP_POPOVER_DEFAULT_WIDTH, triggerRect.width + DESKTOP_POPOVER_TRIGGER_EXPANSION)),
		)
		const wouldOverflowRight = rootRect.left + desiredWidth > viewportWidth - DESKTOP_POPOVER_VIEWPORT_GUTTER
		const canAlignRight = rootRect.right - desiredWidth >= DESKTOP_POPOVER_VIEWPORT_GUTTER
		const align: DesktopPopoverLayout['align'] = wouldOverflowRight && canAlignRight ? 'right' : 'left'
		const availableBelow = viewportHeight - triggerRect.bottom - 24
		const maxBodyHeight = Math.max(
			DESKTOP_POPOVER_BODY_MIN_HEIGHT,
			Math.min(DESKTOP_POPOVER_BODY_MAX_HEIGHT, availableBelow),
		)

		setDesktopPopoverLayout((current) => {
			if (current.width === desiredWidth && current.maxBodyHeight === maxBodyHeight && current.align === align) {
				return current
			}
			return { width: desiredWidth, maxBodyHeight, align }
		})
	}, [])

	useEffect(() => {
		if (!desktopOpenVisible) return
		updateDesktopPopoverLayout()
		desktopInputRef.current?.focus()

		const rootEl = desktopRootRef.current
		const triggerEl = desktopTriggerRef.current
		const resizeObserver =
			typeof ResizeObserver !== 'undefined'
				? new ResizeObserver(() => {
						updateDesktopPopoverLayout()
					})
				: null
		if (resizeObserver && rootEl) resizeObserver.observe(rootEl)
		if (resizeObserver && triggerEl) resizeObserver.observe(triggerEl)

		const handlePointerDown = (event: PointerEvent) => {
			if (desktopRootRef.current?.contains(event.target as Node)) return
			closeDesktopPopover()
		}
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return
			event.preventDefault()
			closeDesktopPopover()
		}
		const handleWindowResize = () => updateDesktopPopoverLayout()
		document.addEventListener('pointerdown', handlePointerDown)
		document.addEventListener('keydown', handleKeyDown)
		window.addEventListener('resize', handleWindowResize)
		window.addEventListener('scroll', handleWindowResize, true)
	return () => {
			document.removeEventListener('pointerdown', handlePointerDown)
			document.removeEventListener('keydown', handleKeyDown)
			window.removeEventListener('resize', handleWindowResize)
			window.removeEventListener('scroll', handleWindowResize, true)
			resizeObserver?.disconnect()
		}
	}, [closeDesktopPopover, desktopOpenVisible, updateDesktopPopoverLayout])

	if (props.isDesktop) {
		const desktopPopoverStyle: CSSProperties = {
			width: desktopPopoverLayout.width,
			left: desktopPopoverLayout.align === 'left' ? 0 : 'auto',
			right: desktopPopoverLayout.align === 'right' ? 0 : 'auto',
		}
		const desktopBodyStyle: CSSProperties = {
			maxHeight: desktopPopoverLayout.maxBodyHeight,
		}

		return (
			<div ref={desktopRootRef} className={`${styles.bucketPickerDesktop} ${props.className ?? ''}`.trim()}>
				<button
					ref={desktopTriggerRef}
					type="button"
					className={styles.bucketPickerDesktopTrigger}
					aria-label="Bucket"
					aria-expanded={desktopOpenVisible}
					disabled={props.disabled}
					onClick={() => {
						if (desktopOpenVisible) {
							closeDesktopPopover()
							return
						}
						openDesktopPopover()
					}}
					data-testid="objects-bucket-picker-desktop"
				>
					<span className={props.value ? styles.bucketPickerDesktopValue : styles.bucketPickerDesktopPlaceholder}>{currentBucketLabel}</span>
					<DownOutlined
						className={`${styles.bucketPickerDesktopChevron} ${desktopOpenVisible ? styles.bucketPickerDesktopChevronOpen : ''}`}
					/>
				</button>

				{desktopOpenVisible ? (
					<div
						className={`${styles.bucketPickerDesktopPopover} ${
							desktopPopoverLayout.align === 'right' ? styles.bucketPickerDesktopPopoverAlignRight : ''
						}`.trim()}
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
										setDesktopScopeKey(props.scopeKey)
										setDesktopQuery(event.currentTarget.value)
									}}
									onKeyDown={(event) => {
										if (event.key !== 'Enter') return
										event.preventDefault()
										commitFirstDesktopMatch()
									}}
									placeholder="Search buckets…"
									aria-label="Search buckets"
									className={styles.bucketPickerSearchInput}
								/>
							</label>
							{props.value ? (
								<button type="button" className={styles.bucketPickerInlineAction} onClick={() => handleSelect(null, 'desktop')}>
									Clear
								</button>
							) : null}
						</div>

						<div className={styles.bucketPickerDesktopBody} style={desktopBodyStyle}>
							{renderEntryList({
								variant: 'desktop',
								currentEntry: currentDesktopEntry,
								recentEntries: recentDesktopEntries,
								allEntries: allDesktopEntries,
								emptyMessage: props.disabled && props.options.length === 0 ? 'Loading buckets…' : 'No matching buckets',
								onSelect: (value) => handleSelect(value, 'desktop'),
							})}
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

			<ObjectsOverlaySheet
				open={mobileOpenVisible}
				onClose={closeMobileDrawer}
				title="Select bucket"
				placement="bottom"
				height="78dvh"
				dataTestId="objects-bucket-picker-mobile-drawer"
				extra={
					props.value ? (
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
								setMobileScopeKey(props.scopeKey)
								setMobileQuery(event.currentTarget.value)
							}}
							placeholder="Search buckets…"
							aria-label="Search buckets"
							className={styles.bucketPickerSearchInput}
							data-testid="objects-bucket-picker-mobile-search"
						/>
					</label>

					{renderEntryList({
						variant: 'mobile',
						currentEntry: currentMobileEntry,
						recentEntries: recentMobileEntries,
						allEntries: allMobileEntries,
						emptyMessage: mobileQuery.trim() ? 'No buckets match this search.' : 'No buckets available.',
						onSelect: (value) => handleSelect(value, 'mobile'),
					})}
				</div>
			</ObjectsOverlaySheet>
		</>
	)
}
