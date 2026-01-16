import type { ProfilerOnRenderCallback } from 'react'

type PerfMeta = Record<string, unknown>

const perfEnabled = (): boolean => {
	if (typeof window === 'undefined') return false
	const w = window as typeof window & { __S3DESK_PERF?: boolean }
	if (w.__S3DESK_PERF === true) return true
	try {
		const v = window.localStorage?.getItem('s3deskPerf')
		return v === '1' || v === 'true'
	} catch {
		return false
	}
}

const formatMeta = (meta?: PerfMeta): string => {
	if (!meta) return ''
	try {
		return ` ${JSON.stringify(meta)}`
	} catch {
		return ''
	}
}

export const logReactRender: ProfilerOnRenderCallback = (id, phase, actualDuration, baseDuration, startTime, commitTime) => {
	if (!perfEnabled()) return
	const timing = `actual=${actualDuration.toFixed(1)}ms base=${baseDuration.toFixed(1)}ms`
	const frame = `start=${startTime.toFixed(1)} commit=${commitTime.toFixed(1)}`
	console.debug(`[perf] ${id} ${phase} ${timing} ${frame}`)
}

export const measurePerf = <T>(label: string, fn: () => T, meta?: PerfMeta): T => {
	if (!perfEnabled()) return fn()
	const start = performance.now()
	const result = fn()
	const duration = performance.now() - start
	console.debug(`[perf] ${label} ${duration.toFixed(1)}ms${formatMeta(meta)}`)
	return result
}
