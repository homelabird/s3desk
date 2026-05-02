import type { CSSProperties, ReactNode } from 'react'

import { confirmDangerAction } from '../../lib/confirmDangerAction'
import { objectsFeedback } from './objectsFeedback'

type ObjectsJobStartedFeedbackArgs = {
	jobId: string
	label: string
	onOpenJobs: () => void
}

type ConfirmMoveFolderDropArgs = {
	bucket: string
	dstPrefix: string
	onConfirm: () => Promise<void> | void
	srcPrefix: string
}

type ConfirmMoveObjectsDropArgs = {
	bucket: string
	count: number
	onConfirm: () => Promise<void> | void
	targetPrefix: string
}

type ConfirmMoveClipboardObjectsArgs = {
	count: number
	onConfirm: () => Promise<void> | void
}

const toastButtonStyle: CSSProperties = {
	border: 0,
	background: 'transparent',
	color: 'var(--s3d-color-accent)',
	cursor: 'pointer',
	padding: '0 4px',
}

const secondaryTextStyle: CSSProperties = {
	color: 'var(--s3d-color-text-muted)',
}

function renderOpenJobsButton(onOpenJobs: () => void) {
	return (
		<button type="button" style={toastButtonStyle} onClick={onOpenJobs}>
			Open Jobs
		</button>
	)
}

function renderMoveDescription(primary: ReactNode, secondary: string) {
	return (
		<span>
			{primary}
			<br />
			<span style={secondaryTextStyle}>{secondary}</span>
		</span>
	)
}

export function showObjectsJobStartedFeedback({ jobId, label, onOpenJobs }: ObjectsJobStartedFeedbackArgs) {
	objectsFeedback.open({
		type: 'success',
		content: (
			<span>
				{label} started: {jobId} {renderOpenJobsButton(onOpenJobs)}
			</span>
		),
		duration: 6,
	})
}

export function confirmMoveFolderDrop({ bucket, dstPrefix, onConfirm, srcPrefix }: ConfirmMoveFolderDropArgs) {
	confirmDangerAction({
		title: 'Move folder?',
		description: renderMoveDescription(
			<span>
				Move <code>{`s3://${bucket}/${srcPrefix}`}</code> -&gt; <code>{`s3://${bucket}/${dstPrefix}`}</code>
			</span>,
			'This will create a job and remove the source objects.',
		),
		confirmText: 'MOVE',
		confirmHint: 'Type "MOVE" to confirm',
		okText: 'Move',
		onConfirm,
	})
}

export function confirmMoveObjectsDrop({ bucket, count, onConfirm, targetPrefix }: ConfirmMoveObjectsDropArgs) {
	confirmDangerAction({
		title: `Move ${count} object(s)?`,
		description: renderMoveDescription(
			<span>
				Move to <code>{`s3://${bucket}/${targetPrefix}`}</code>
			</span>,
			'This will create a job and remove the source objects.',
		),
		confirmText: 'MOVE',
		confirmHint: 'Type "MOVE" to confirm',
		okText: 'Move',
		onConfirm,
	})
}

export function confirmMoveClipboardObjects({ count, onConfirm }: ConfirmMoveClipboardObjectsArgs) {
	confirmDangerAction({
		title: `Move ${count} object(s) here?`,
		description: 'This creates a move job (copy then delete source).',
		confirmText: 'MOVE',
		confirmHint: 'Type "MOVE" to confirm',
		okText: 'Move',
		onConfirm,
	})
}
