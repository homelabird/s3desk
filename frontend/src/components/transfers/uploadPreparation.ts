import type { UploadPreparation, UploadTask } from './transferTypes'

export type UploadPreparationProgress = Omit<UploadPreparation, 'phase'>

/** Limit expensive row rerenders and isolate callbacks from canceled attempts. */
export function createUploadPreparationReporter(args: {
	taskId: string
	phase: UploadPreparation['phase']
	signal: AbortSignal
	isCurrent: () => boolean
	updateTask: (id: string, updater: (task: UploadTask) => UploadTask) => void
}) {
	let lastAt = 0
	let lastFile = -1
	let displayed = false
	return {
		report: (progress: UploadPreparationProgress) => {
			if (args.signal.aborted || !args.isCurrent()) return
			const now = Date.now()
			const boundary = progress.fileIndex !== lastFile || progress.loadedBytes === progress.totalBytes
			if (!boundary && now - lastAt < 100) return
			lastAt = now
			lastFile = progress.fileIndex
			displayed = true
			args.updateTask(args.taskId, (task) => ({ ...task, preparation: { ...progress, phase: args.phase } }))
		},
		clear: () => {
			if (!displayed || !args.isCurrent()) return
			displayed = false
			args.updateTask(args.taskId, (task) => ({ ...task, preparation: undefined }))
		},
	}
}
