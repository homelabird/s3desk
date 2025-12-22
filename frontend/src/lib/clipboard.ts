export type ClipboardCopyResult = {
	ok: boolean
	method: 'clipboard' | 'execCommand' | null
	error?: unknown
}

export async function copyToClipboard(text: string): Promise<ClipboardCopyResult> {
	try {
		if (navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(text)
			return { ok: true, method: 'clipboard' }
		}
	} catch {
		// fall back to execCommand below
	}

	try {
		const el = document.createElement('textarea')
		el.value = text
		el.setAttribute('readonly', '')
		el.style.position = 'fixed'
		el.style.left = '-1000px'
		el.style.top = '0'
		el.style.opacity = '0'
		document.body.appendChild(el)
		el.focus()
		el.select()

		const ok = document.execCommand('copy')
		el.remove()
		if (!ok) return { ok: false, method: null, error: new Error('execCommand failed') }
		return { ok: true, method: 'execCommand' }
	} catch (error) {
		return { ok: false, method: null, error }
	}
}

export function clipboardFailureHint(): string {
	if (typeof window !== 'undefined' && window.isSecureContext === false) {
		return 'Copy failed. Clipboard access is restricted on insecure origins (try HTTPS or localhost).'
	}
	return 'Copy failed.'
}
