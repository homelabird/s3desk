export const A11Y_STATUS_ID = 'a11y-status'
export const A11Y_ALERT_ID = 'a11y-alert'

function announce(targetId: string, text: string) {
	if (typeof document === 'undefined') return
	const el = document.getElementById(targetId)
	if (!el) return
	// Clear first to make repeated announcements more reliable across SRs.
	el.textContent = ''
	window.setTimeout(() => {
		el.textContent = text
	}, 0)
}

export function announcePolite(text: string) {
	announce(A11Y_STATUS_ID, text)
}

export function announceAssertive(text: string) {
	announce(A11Y_ALERT_ID, text)
}

