import { Button, Modal, Space, Typography } from 'antd'
import type { ReactNode } from 'react'

import type { RemoveEntriesResult } from '../../lib/deviceFs'
import { MOVE_CLEANUP_FILENAME_MAX_LEN, MOVE_CLEANUP_FILENAME_TEMPLATE } from '../../lib/moveCleanupDefaults'

export type MoveCleanupReportArgs = {
	title: string
	result: RemoveEntriesResult
	label?: string
	kind?: 'info' | 'warning'
	bucket?: string
	prefix?: string
	filenameTemplate: string
	filenameMaxLen: number
}

export function formatMoveCleanupSummary(result: RemoveEntriesResult, label: string): string {
	const parts = [`Moved ${result.removed.length} item(s)`]
	if (label) parts[0] += ` from ${label}`
	if (result.failed.length) parts.push(`failed ${result.failed.length}`)
	if (result.skipped.length) parts.push(`skipped ${result.skipped.length}`)
	if (result.removedDirs.length) parts.push(`cleaned ${result.removedDirs.length} folder(s)`)
	return parts.join(' · ')
}

function buildMoveCleanupReportText(result: RemoveEntriesResult, label: string, bucket?: string, prefix?: string): string {
	const lines: string[] = []
	lines.push('Move cleanup report')
	lines.push(`Generated: ${new Date().toISOString()}`)
	if (label) lines.push(`Source: ${label}`)
	if (bucket) {
		const normalizedPrefix = prefix?.trim() ? normalizePrefixLabel(prefix) : '(root)'
		lines.push(`Destination: s3://${bucket}/${normalizedPrefix}`)
	}
	lines.push('')
	lines.push(`Summary: ${formatMoveCleanupSummary(result, label)}`)
	lines.push('')

	const pushSection = (title: string, items: string[]) => {
		lines.push(`${title} (${items.length})`)
		if (items.length === 0) {
			lines.push('-')
		} else {
			for (const item of items) lines.push(item)
		}
		lines.push('')
	}

	pushSection('Removed files', result.removed)
	pushSection('Failed to remove', result.failed)
	pushSection('Skipped', result.skipped)
	pushSection('Removed empty folders', result.removedDirs)

	return lines.join('\n')
}

function downloadTextFile(filename: string, content: string): void {
	const blob = new Blob([content], { type: 'text/plain' })
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = filename
	a.style.display = 'none'
	document.body.appendChild(a)
	a.click()
	a.remove()
	window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function buildMoveCleanupFilename(args: {
	label?: string
	bucket?: string
	prefix?: string
	template: string
	maxLen: number
}): string {
	const stamp = new Date().toISOString().replace(/[:]/g, '-')
	const template = (args.template || MOVE_CLEANUP_FILENAME_TEMPLATE).trim()
	const maxLen = normalizeMaxFilenameLength(args.maxLen)

	const prefixToken = args.prefix ? normalizePrefixToken(args.prefix) : ''
	const parts: Record<string, string> = {
		bucket: sanitizeForFilename(args.bucket ?? ''),
		prefix: sanitizeForFilename(prefixToken),
		label: sanitizeForFilename(args.label ?? ''),
		timestamp: sanitizeForFilename(stamp),
	}

	let name = applyFilenameTemplate(template, parts)
	if (!name.toLowerCase().endsWith('.txt')) {
		name = `${name}.txt`
	}

	if (!name.trim()) {
		name = `move-cleanup-${stamp}.txt`
	}

	return enforceFilenameLength(name, maxLen)
}

function sanitizeForFilename(value: string): string {
	return value
		.trim()
		.replace(/[\\/:*?"<>|]/g, '-')
		.replace(/\s+/g, '_')
		.replace(/-+/g, '-')
		.replace(/_+/g, '_')
		.replace(/[-_]+$/g, '')
}

function normalizePrefixLabel(prefix: string): string {
	const trimmed = prefix.trim().replace(/^\/+/, '').replace(/\/+$/, '')
	return trimmed || '(root)'
}

function normalizePrefixToken(prefix: string): string {
	const normalized = normalizePrefixLabel(prefix)
	return normalized === '(root)' ? 'root' : normalized
}

function normalizeMaxFilenameLength(value: number): number {
	if (!Number.isFinite(value) || value <= 0) return MOVE_CLEANUP_FILENAME_MAX_LEN
	return Math.max(40, Math.min(200, Math.floor(value)))
}

function applyFilenameTemplate(template: string, parts: Record<string, string>): string {
	let out = template
	for (const [key, value] of Object.entries(parts)) {
		out = out.replaceAll(`{${key}}`, value)
	}
	out = out.replace(/\{[^}]+\}/g, '')
	out = out.replace(/\s+/g, '_')
	out = out.replace(/-+/g, '-')
	out = out.replace(/_+/g, '_')
	out = out.replace(/[-_]+$/g, '')
	out = out.replace(/^[-_]+/g, '')
	return out
}

function enforceFilenameLength(filename: string, maxLen: number): string {
	if (filename.length <= maxLen) return filename
	const extMatch = filename.match(/(\.[^.]+)$/)
	const ext = extMatch ? extMatch[1] : ''
	const base = ext ? filename.slice(0, -ext.length) : filename
	const allowed = Math.max(1, maxLen - ext.length)
	const trimmed = base.slice(0, allowed).replace(/[-_]+$/g, '')
	return `${trimmed}${ext}`
}

export function showMoveCleanupReport(args: MoveCleanupReportArgs) {
	const { title, result, label, kind, bucket, prefix, filenameTemplate, filenameMaxLen } = args
	const modal = kind === 'info' ? Modal.info : Modal.warning
	const sections: ReactNode[] = []
	const maxItems = 10
	const reportText = buildMoveCleanupReportText(result, label ?? '', bucket, prefix)
	const reportFilename = buildMoveCleanupFilename({
		label,
		bucket,
		prefix,
		template: filenameTemplate,
		maxLen: filenameMaxLen,
	})

	const pushSection = (sectionTitle: string, items: string[]) => {
		if (items.length === 0) return
		const sample = items.slice(0, maxItems)
		sections.push(
			<Space key={sectionTitle} orientation="vertical" size={4}>
				<Typography.Text strong>
					{sectionTitle} ({items.length})
				</Typography.Text>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
					{sample.map((item) => (
						<Typography.Text key={`${sectionTitle}_${item}`} code>
							{item}
						</Typography.Text>
					))}
					{items.length > maxItems ? (
						<Typography.Text type="secondary">+{items.length - maxItems} more</Typography.Text>
					) : null}
				</div>
			</Space>,
		)
	}

	pushSection('Removed files', result.removed)
	pushSection('Failed to remove', result.failed)
	pushSection('Skipped', result.skipped)
	pushSection('Removed empty folders', result.removedDirs)

	modal({
		title,
		content: (
			<Space orientation="vertical" size="middle">
				<Typography.Text type="secondary">{formatMoveCleanupSummary(result, label ?? '')}</Typography.Text>
				<Button size="small" onClick={() => downloadTextFile(reportFilename, reportText)}>
					Download report
				</Button>
				{sections}
			</Space>
		),
		width: 720,
	})
}

