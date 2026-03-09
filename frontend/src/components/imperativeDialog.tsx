import { createRoot } from 'react-dom/client'
import type { ReactElement } from 'react'

export function mountImperativeDialog(render: (close: () => void) => ReactElement) {
	if (typeof document === 'undefined') return () => {}
	const host = document.createElement('div')
	document.body.appendChild(host)
	const root = createRoot(host)

	const cleanup = () => {
		queueMicrotask(() => {
			root.unmount()
			host.remove()
		})
	}

	root.render(render(cleanup))
	return cleanup
}
