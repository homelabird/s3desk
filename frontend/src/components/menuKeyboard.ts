import type { KeyboardEvent } from 'react'

const menuItemSelector = 'button[role="menuitem"]:not(:disabled)'
const typeaheadResetMs = 700

type TypeaheadState = {
	query: string
	updatedAt: number
}

const typeaheadStateByContainer = new WeakMap<HTMLElement, TypeaheadState>()

function getEnabledMenuItems(container: HTMLElement): HTMLButtonElement[] {
	return Array.from(container.querySelectorAll<HTMLButtonElement>(menuItemSelector)).filter((item) => {
		if (item.hidden) return false
		if (item.getAttribute('aria-hidden') === 'true') return false
		if (item.closest('[aria-hidden="true"]')) return false
		return true
	})
}

function focusMenuItem(items: HTMLButtonElement[], index: number) {
	const item = items[index]
	if (!item) return
	item.focus()
}

function findCurrentMenuItemIndex(items: HTMLButtonElement[], target: EventTarget | null) {
	const activeElement = typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
		? document.activeElement
		: null
	const targetElement = target instanceof HTMLElement ? target : null
	const currentElement = activeElement ?? targetElement
	const index = currentElement
		? items.findIndex((item) => item === currentElement || item.contains(currentElement))
		: -1
	if (index >= 0) return index
	return targetElement ? items.findIndex((item) => item === targetElement || item.contains(targetElement)) : -1
}

function isTypeaheadKey(event: KeyboardEvent<HTMLElement>) {
	return event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey
}

function getMenuItemSearchText(item: HTMLButtonElement) {
	return (item.textContent ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase()
}

function getNextTypeaheadQuery(container: HTMLElement, key: string, now: number) {
	const previous = typeaheadStateByContainer.get(container)
	const keyText = key.toLocaleLowerCase()
	const query = previous && now - previous.updatedAt <= typeaheadResetMs ? `${previous.query}${keyText}` : keyText
	typeaheadStateByContainer.set(container, { query, updatedAt: now })
	return query
}

function normalizeRepeatedCharacterQuery(query: string) {
	if (query.length <= 1) return query
	const [firstCharacter] = query
	return query.split('').every((character) => character === firstCharacter) ? firstCharacter : query
}

function findTypeaheadMatchIndex(items: HTMLButtonElement[], currentIndex: number, query: string) {
	const normalizedQuery = normalizeRepeatedCharacterQuery(query)
	const startIndex = currentIndex >= 0 ? (currentIndex + 1) % items.length : 0
	for (let offset = 0; offset < items.length; offset += 1) {
		const index = (startIndex + offset) % items.length
		if (getMenuItemSearchText(items[index]).startsWith(normalizedQuery)) return index
	}
	return -1
}

export function handleMenuKeyboardNavigation(event: KeyboardEvent<HTMLElement>) {
	const key = event.key
	const isNavigationKey = key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End'
	if (!isNavigationKey && !isTypeaheadKey(event)) return

	const items = getEnabledMenuItems(event.currentTarget)
	if (items.length === 0) return

	const currentIndex = findCurrentMenuItemIndex(items, event.target)

	if (!isNavigationKey) {
		const now = Date.now()
		const query = getNextTypeaheadQuery(event.currentTarget, key, now)
		let matchIndex = findTypeaheadMatchIndex(items, currentIndex, query)
		if (matchIndex < 0 && query.length > 1) {
			const fallbackQuery = key.toLocaleLowerCase()
			typeaheadStateByContainer.set(event.currentTarget, { query: fallbackQuery, updatedAt: now })
			matchIndex = findTypeaheadMatchIndex(items, currentIndex, fallbackQuery)
		}
		if (matchIndex < 0) return
		event.preventDefault()
		event.stopPropagation()
		focusMenuItem(items, matchIndex)
		return
	}

	event.preventDefault()
	event.stopPropagation()

	if (key === 'Home') {
		focusMenuItem(items, 0)
		return
	}
	if (key === 'End') {
		focusMenuItem(items, items.length - 1)
		return
	}

	const safeIndex = currentIndex >= 0 ? currentIndex : key === 'ArrowUp' ? 0 : -1
	const nextIndex =
		key === 'ArrowDown'
			? (safeIndex + 1) % items.length
			: (safeIndex - 1 + items.length) % items.length
	focusMenuItem(items, nextIndex)
}
