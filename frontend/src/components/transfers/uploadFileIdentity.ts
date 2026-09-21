/** Full-content identity for resume, not an S3 ETag or a standard file SHA256.
 * Read bounded 8 MiB blocks and chain SHA256(previous || SHA256(block)). Every
 * byte is covered; sampling/name/size/mtime are never accepted as content proof.
 * WebCrypto absence (e.g. insecure LAN HTTP) disables reuse, not uploads.
 */
const BLOCK_BYTES = 8 * 1024 * 1024
const PREFIX = 's3desk-sha256-chain-v1:'
const identities = new WeakMap<Blob, string>()

function checkAbort(signal?: AbortSignal) {
	if (signal?.aborted) throw new DOMException('File identity canceled', 'AbortError')
}

export function isUploadFingerprint(value?: string): value is string {
	return typeof value === 'string' && /^s3desk-sha256-chain-v1:[0-9a-f]{64}$/.test(value)
}

export type FingerprintProgress = { loadedBytes: number; totalBytes: number }

// Abort the wait promptly even if a filesystem/cloud-backed Blob read or a
// WebCrypto operation is still pending. Its result is observed then discarded;
// no further block is scheduled, and aborted results never enter the cache.
async function abortable<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
	if (!signal) return operation
	return new Promise<T>((resolve, reject) => {
		const abort = () => reject(new DOMException('File identity canceled', 'AbortError'))
		signal.addEventListener('abort', abort, { once: true })
		operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
		if (signal.aborted) { signal.removeEventListener('abort', abort); abort() }
	})
}

export async function fingerprintUploadFile(file: Blob, signal?: AbortSignal, onProgress?: (progress: FingerprintProgress) => void): Promise<string | undefined> {
	checkAbort(signal)
	const subtle = globalThis.crypto?.subtle
	if (!subtle) return undefined
	const cached = identities.get(file)
	if (cached) { onProgress?.({ loadedBytes: file.size, totalBytes: file.size }); return cached }
	if (!Number.isSafeInteger(file.size) || file.size < 0) throw new Error('Invalid file size')
	onProgress?.({ loadedBytes: 0, totalBytes: file.size })
	let state = new Uint8Array(await abortable(subtle.digest('SHA-256', new TextEncoder().encode(`${PREFIX}${BLOCK_BYTES}:${file.size}`)), signal))
	for (let offset = 0; offset < file.size; offset += BLOCK_BYTES) {
		checkAbort(signal)
		const block = await abortable(file.slice(offset, Math.min(file.size, offset + BLOCK_BYTES)).arrayBuffer(), signal)
		checkAbort(signal)
		const digest = new Uint8Array(await abortable(subtle.digest('SHA-256', block), signal))
		const link = new Uint8Array(64)
		link.set(state)
		link.set(digest, 32)
		state = new Uint8Array(await abortable(subtle.digest('SHA-256', link), signal))
		checkAbort(signal)
		onProgress?.({ loadedBytes: Math.min(file.size, offset + BLOCK_BYTES), totalBytes: file.size })
		// Yield between blocks, even on very fast local filesystems.
		await new Promise<void>((resolve) => setTimeout(resolve, 0))
	}
	checkAbort(signal)
	const identity = PREFIX + Array.from(state, (value) => value.toString(16).padStart(2, '0')).join('')
	identities.set(file, identity)
	return identity
}
