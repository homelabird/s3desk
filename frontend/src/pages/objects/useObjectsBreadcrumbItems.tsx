import { useMemo, type DragEvent, type ReactNode } from 'react'

import styles from './ObjectsListView.module.css'
import { ObjectsMenuPopover } from './ObjectsMenuPopover'
import { normalizePrefix } from './objectsListUtils'

type UseObjectsBreadcrumbItemsArgs = {
	bucket: string
	prefix: string
	isMd: boolean
	canDragDrop: boolean
	dndHoverPrefix: string | null
	normalizeDropTargetPrefix: (raw: string) => string
	onDndTargetDragOver: (event: DragEvent, targetPrefixRaw: string) => void
	onDndTargetDragLeave: (event: DragEvent, targetPrefixRaw: string) => void
	onDndTargetDrop: (event: DragEvent, targetPrefixRaw: string) => void
	navigateToLocation: (nextBucket: string, nextPrefix: string, options?: { recordHistory?: boolean }) => void
}

type BreadcrumbItem = { title: ReactNode }

export function useObjectsBreadcrumbItems({
	bucket,
	prefix,
	isMd,
	canDragDrop,
	dndHoverPrefix,
	normalizeDropTargetPrefix,
	onDndTargetDragOver,
	onDndTargetDragLeave,
	onDndTargetDrop,
	navigateToLocation,
}: UseObjectsBreadcrumbItemsArgs): { breadcrumbItems: BreadcrumbItem[] } {
	const breadcrumbItems = useMemo(() => {
		const parts = prefix.split('/').filter(Boolean)
		const items: BreadcrumbItem[] = []
		const canNavigate = !!bucket

		const wrap = (targetPrefixRaw: string, node: ReactNode) => {
			const target = normalizeDropTargetPrefix(targetPrefixRaw)
			const active = canDragDrop && dndHoverPrefix === target
			return (
				<span
					onDragOver={(event) => onDndTargetDragOver(event, targetPrefixRaw)}
					onDragLeave={(event) => onDndTargetDragLeave(event, targetPrefixRaw)}
					onDrop={(event) => onDndTargetDrop(event, targetPrefixRaw)}
					className={`${styles.breadcrumbDropTarget} ${active ? styles.breadcrumbDropTargetActive : ''}`.trim()}
				>
					{node}
				</span>
			)
		}

		const linkToPrefix = (targetPrefix: string, label: string) => (
			<button
				type="button"
				className={styles.breadcrumbLink}
				onClick={() => (canNavigate ? navigateToLocation(bucket, targetPrefix, { recordHistory: true }) : undefined)}
				disabled={!canNavigate}
			>
				{label}
			</button>
		)

		items.push({
			title: wrap('', linkToPrefix('', '(root)')),
		})

		if (!parts.length) return items

		if (!isMd && parts.length > 2) {
			const collapsedParts = parts.slice(0, -1)
			const collapsedPrefix = normalizePrefix(collapsedParts.join('/'))
			const menu = {
				items: collapsedParts.map((part, index) => {
					const targetPrefix = normalizePrefix(collapsedParts.slice(0, index + 1).join('/'))
					return {
						key: targetPrefix || part,
						label: `${part}/`,
						disabled: !canNavigate,
						onClick: () =>
							canNavigate ? navigateToLocation(bucket, targetPrefix, { recordHistory: true }) : undefined,
					}
				}),
			}

			items.push({
				title: wrap(
					collapsedPrefix,
					<ObjectsMenuPopover menu={menu}>
						{({ toggle, open }) => (
							<button
								type="button"
								className={styles.breadcrumbLink}
								aria-haspopup="menu"
								aria-expanded={open}
								disabled={!canNavigate}
								onClick={(event) => {
									event.stopPropagation()
									toggle()
								}}
							>
								.../
							</button>
						)}
					</ObjectsMenuPopover>,
				),
			})

			const lastPart = parts[parts.length - 1]
			const lastPrefix = normalizePrefix(`${collapsedPrefix}${lastPart}`)
			items.push({
				title: wrap(lastPrefix, linkToPrefix(lastPrefix, `${lastPart}/`)),
			})

			return items
		}

		let current = ''
		for (const part of parts) {
			current += `${part}/`
			items.push({
				title: wrap(current, linkToPrefix(current, `${part}/`)),
			})
		}

		return items
	}, [
		bucket,
		canDragDrop,
		dndHoverPrefix,
		isMd,
		navigateToLocation,
		normalizeDropTargetPrefix,
		onDndTargetDragLeave,
		onDndTargetDragOver,
		onDndTargetDrop,
		prefix,
	])

	return { breadcrumbItems }
}
