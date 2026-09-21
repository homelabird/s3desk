/** Keep the extension and identifying suffix, without slicing UTF-16 surrogate pairs. */
export function compactObjectName(name: string, maxCharacters = 24): string {
	const chars = Array.from(name)
	const budget = Math.max(12, Number.isFinite(maxCharacters) ? Math.trunc(maxCharacters) || 24 : 24)
	if (chars.length <= budget) return name
	const dot = name.lastIndexOf('.')
	const extension = dot > 0 ? Array.from(name.slice(dot)) : []
	const tailLength = Math.min(budget - 5, Math.max(10, extension.length + 6))
	return chars.slice(0, budget - tailLength - 1).join('') + '…' + chars.slice(-tailLength).join('')
}
