import { Button, Dropdown } from 'antd'
import { useMemo, type DragEvent, type ReactNode } from 'react'

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
}: UseObjectsBreadcrumbItemsArgs): { breadcrumbItems: { title: ReactNode }[] } {
	const breadcrumbItems = useMemo(() => {
		const parts = prefix.split('/').filter(Boolean)
		const items: { title: ReactNode }[] = []
		const canNavigate = !!bucket

		const wrap = (targetPrefixRaw: string, node: ReactNode) => {
			const target = normalizeDropTargetPrefix(targetPrefixRaw)
			const active = canDragDrop && dndHoverPrefix === target
			return (
				<span
					onDragOver={(e) => onDndTargetDragOver(e, targetPrefixRaw)}
					onDragLeave={(e) => onDndTargetDragLeave(e, targetPrefixRaw)}
					onDrop={(e) => onDndTargetDrop(e, targetPrefixRaw)}
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						paddingInline: 4,
						borderRadius: 4,
						background: active ? 'rgba(22, 119, 255, 0.12)' : undefined,
					}}
				>
					{node}
				</span>
			)
		}

		const linkToPrefix = (targetPrefix: string, label: string) => (
			<Button
				type="link"
				size="small"
				onClick={() => (canNavigate ? navigateToLocation(bucket, targetPrefix, { recordHistory: true }) : undefined)}
				disabled={!canNavigate}
				style={{ padding: 0, height: 'auto', whiteSpace: 'nowrap' }}
			>
				{label}
			</Button>
		)

		items.push({
			title: wrap('', linkToPrefix('', '(root)')),
		})

		if (!parts.length) return items

		if (!isMd && parts.length > 2) {
			const collapsedParts = parts.slice(0, -1)
			const collapsedPrefix = normalizePrefix(collapsedParts.join('/'))
			const menuItems = collapsedParts.map((part, index) => {
				const targetPrefix = normalizePrefix(collapsedParts.slice(0, index + 1).join('/'))
				return {
					key: targetPrefix || part,
					label: targetPrefix,
					disabled: !canNavigate,
					onClick: () => (canNavigate ? navigateToLocation(bucket, targetPrefix, { recordHistory: true }) : undefined),
				}
			})

			items.push({
				title: wrap(
					collapsedPrefix,
					<Dropdown trigger={['click']} menu={{ items: menuItems }} disabled={!canNavigate}>
						<Button type="link" size="small" disabled={!canNavigate} style={{ padding: 0, height: 'auto', whiteSpace: 'nowrap' }}>
							.../
						</Button>
					</Dropdown>,
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
			current += part + '/'
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
