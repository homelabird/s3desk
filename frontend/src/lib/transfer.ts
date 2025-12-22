export type TransferStats = {
	loadedBytes: number
	totalBytes?: number
	speedBps: number
	etaSeconds: number
}

export class TransferEstimator {
	private totalBytes?: number
	private startedAtMs: number
	private lastAtMs: number
	private lastLoadedBytes: number
	private emaBps: number
	private alpha: number

	constructor(args: { totalBytes?: number; startedAtMs?: number; alpha?: number } = {}) {
		this.totalBytes = args.totalBytes
		this.startedAtMs = args.startedAtMs ?? Date.now()
		this.lastAtMs = this.startedAtMs
		this.lastLoadedBytes = 0
		this.emaBps = 0
		this.alpha = args.alpha ?? 0.2
	}

	getStartedAtMs(): number {
		return this.startedAtMs
	}

	update(loadedBytes: number, totalBytes?: number): TransferStats {
		if (typeof totalBytes === 'number' && Number.isFinite(totalBytes) && totalBytes >= 0) {
			this.totalBytes = totalBytes
		}

		const total = this.totalBytes
		const loaded = clampBytes(loadedBytes, total)

		const nowMs = Date.now()
		const dtSeconds = Math.max(0, (nowMs - this.lastAtMs) / 1000)
		const deltaBytes = Math.max(0, loaded - this.lastLoadedBytes)

		if (dtSeconds >= 0.25 && deltaBytes > 0) {
			const instBps = deltaBytes / dtSeconds
			if (this.emaBps === 0) this.emaBps = instBps
			else this.emaBps = this.alpha * instBps + (1 - this.alpha) * this.emaBps
			this.lastAtMs = nowMs
			this.lastLoadedBytes = loaded
		}

		const etaSeconds = total != null && total > 0 && this.emaBps > 0 ? Math.max(0, (total - loaded) / this.emaBps) : 0

		return {
			loadedBytes: loaded,
			totalBytes: total,
			speedBps: this.emaBps,
			etaSeconds,
		}
	}
}

export function formatBytes(bytes: number): string {
	const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
	let v = bytes
	let i = 0
	while (Math.abs(v) >= 1024 && i < units.length - 1) {
		v /= 1024
		i++
	}
	const digits = i === 0 ? 0 : Math.abs(v) >= 10 ? 1 : 2
	return `${v.toFixed(digits)} ${units[i]}`
}

export function formatDurationSeconds(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds <= 0) return '0s'
	const s = Math.round(seconds)
	const h = Math.floor(s / 3600)
	const m = Math.floor((s % 3600) / 60)
	const sec = s % 60

	if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
	if (m > 0) return sec > 0 ? `${m}m ${sec}s` : `${m}m`
	return `${sec}s`
}

function clampBytes(loadedBytes: number, totalBytes?: number): number {
	const loaded = Number.isFinite(loadedBytes) ? Math.max(0, loadedBytes) : 0
	if (typeof totalBytes === 'number' && Number.isFinite(totalBytes) && totalBytes >= 0) {
		return Math.min(loaded, totalBytes)
	}
	return loaded
}

