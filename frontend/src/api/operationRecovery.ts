/** Only endpoints with the server's durable receipt contract can be replayed. */
export function supportsOperationReceipt(path: string, method = 'GET'): boolean {
	const clean = path.split('?')[0].replace(/\/$/, '')
	if (method.toUpperCase() === 'DELETE') return /^\/buckets\/[^/]+\/objects$/.test(clean)
	if (method.toUpperCase() !== 'POST') return false
	return clean === '/jobs' || clean === '/uploads' || /^\/jobs\/[^/]+\/retry$/.test(clean) ||
		/^\/buckets\/[^/]+\/objects\/folder$/.test(clean) || /^\/uploads\/[^/]+\/(commit|multipart\/complete)$/.test(clean)
}
const storageKey = 's3desk.operationRecovery.v1'
const lifetimeMs = 23 * 60 * 60 * 1000 // shorter than server's 24-hour replay window
const maxPending = 64
export type PendingOperation = { key: string; createdAt: number }
function readPending(): Record<string, PendingOperation> {
	try {
		const value: unknown = JSON.parse(window.sessionStorage.getItem(storageKey) ?? '{}')
		if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
		const result: Record<string, PendingOperation> = {}
		for (const [digest, raw] of Object.entries(value)) {
			if (!raw || typeof raw !== 'object') continue
			const item = raw as Partial<PendingOperation>
			if (/^[a-f0-9]{64}$/.test(digest) && typeof item.key === 'string' && /^[a-f0-9]{32}$/.test(item.key) &&
				typeof item.createdAt === 'number' && Number.isFinite(item.createdAt)) result[digest] = { key: item.key, createdAt: item.createdAt }
		}
		return result
	} catch { return {} }
}
export function clearOperationRecovery(): void {
	try { window.sessionStorage.removeItem(storageKey) } catch { /* in-memory protection remains */ }
}
function persist(digest: string, item?: PendingOperation) {
	try {
		const entries = readPending()
		if (item) entries[digest] = item; else delete entries[digest]
		window.sessionStorage.setItem(storageKey, JSON.stringify(entries))
	} catch { /* current operation still has its in-memory key */ }
}
export class OperationRecoveryRegistry {
	private readonly pending = new Map<string, PendingOperation>()
	async acquire(identity: string): Promise<{ signature: string; operation: PendingOperation }> {
		let signature = identity
		if (globalThis.crypto?.subtle) {
			const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity))
			signature = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('')
		}
		const persisted = signature !== identity ? readPending() : {}
		const old = this.pending.get(signature) ?? persisted[signature]
		if (old) {
			if (Date.now() - old.createdAt > lifetimeMs) throw new Error('Previous operation recovery expired. Check Jobs and object state before submitting a new action.')
			this.pending.set(signature, old)
			return { signature, operation: old }
		}
		if (new Set([...this.pending.keys(), ...Object.keys(persisted)]).size >= maxPending) {
			throw new Error('Too many operations have an unconfirmed result. Reconcile them before starting more changes.')
		}
		if (!globalThis.crypto?.getRandomValues) throw new Error('Secure random operation identifiers are unavailable.')
		const key = Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('')
		const operation = { key, createdAt: Date.now() }
		this.pending.set(signature, operation)
		// Persist neither request bodies nor tokens, paths, or signed URLs.
		if (signature !== identity) persist(signature, operation)
		return { signature, operation }
	}
	settle(signature: string, key: string): void {
		if (this.pending.get(signature)?.key !== key) return
		this.pending.delete(signature)
		if (/^[a-f0-9]{64}$/.test(signature)) persist(signature)
	}
}
