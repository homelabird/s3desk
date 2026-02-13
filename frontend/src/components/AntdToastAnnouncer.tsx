import { useEffect } from 'react'

import { announceAssertive, announcePolite } from '../lib/a11yAnnounce'

type ToastType = 'error' | 'warning' | 'info' | 'success' | 'loading' | 'default'

function announceText(text: string, type: ToastType) {
	const trimmed = text.trim()
	if (!trimmed) return
	if (type === 'error') announceAssertive(trimmed)
	else announcePolite(trimmed)
}

function guessType(el: Element): ToastType {
	const types: Exclude<ToastType, 'default'>[] = ['error', 'warning', 'info', 'success', 'loading']
	for (const t of types) {
		if (el.classList.contains(`ant-message-${t}`)) return t
	}
	return 'default'
}

function readToastText(notice: Element): string {
	// Try to avoid reading icons/close buttons by focusing on content nodes.
	const content =
		notice.querySelector('.ant-message-custom-content') ??
		notice.querySelector('.ant-message-notice-content') ??
		notice.querySelector('.ant-notification-notice-message') ??
		notice.querySelector('.ant-notification-notice-description') ??
		notice
	return (content.textContent ?? '').replace(/\s+/g, ' ').trim()
}

export function AntdToastAnnouncer() {
	useEffect(() => {
		if (typeof document === 'undefined') return

		const seen = new WeakSet<Element>()
		const observer = new MutationObserver((mutations) => {
			for (const m of mutations) {
				for (const node of m.addedNodes) {
					if (!(node instanceof Element)) continue
					const candidates: Element[] = []
					if (node.matches('.ant-message-notice, .ant-notification-notice')) candidates.push(node)
					candidates.push(...Array.from(node.querySelectorAll('.ant-message-notice, .ant-notification-notice')))
					for (const notice of candidates) {
						if (seen.has(notice)) continue
						seen.add(notice)
						const text = readToastText(notice)
						if (!text) continue
						const type = guessType(notice.querySelector('.ant-message-custom-content') ?? notice)
						announceText(text, type)
					}
				}
			}
		})

		observer.observe(document.body, { childList: true, subtree: true })
		return () => observer.disconnect()
	}, [])

	return null
}

