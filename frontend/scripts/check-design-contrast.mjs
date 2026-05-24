#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const indexCssPath = path.join(rootDir, 'src', 'index.css')
const failOnFindings = process.argv.includes('--fail-on-findings')

const pairs = [
	{ label: 'body text on card', fg: 's3d-color-text', bg: 's3d-color-bg-card', min: 4.5 },
	{ label: 'secondary text on card', fg: 's3d-color-text-secondary', bg: 's3d-color-bg-card', min: 4.5 },
	{ label: 'muted text on card', fg: 's3d-color-text-muted', bg: 's3d-color-bg-card', min: 3 },
	{ label: 'body text on page', fg: 's3d-color-text', bg: 's3d-color-bg-page', min: 4.5 },
	{ label: 'body text on input', fg: 's3d-color-text', bg: 's3d-color-bg-input', min: 4.5 },
	{ label: 'disabled text on disabled bg', fg: 's3d-color-text-muted', bg: 's3d-color-bg-disabled', min: 3 },
	{ label: 'primary link on card', fg: 's3d-color-primary', bg: 's3d-color-bg-card', min: 4.5 },
	{ label: 'warning text on warning bg', fg: 's3d-color-warning-text', bg: 's3d-color-warning-bg', min: 4.5 },
	{ label: 'error text on error bg', fg: 's3d-color-error-dark', bg: 's3d-color-error-bg', min: 4.5 },
	{ label: 'success text on success bg', fg: 's3d-color-success-text', bg: 's3d-color-success-bg', min: 4.5 },
	{ label: 'tooltip text on tooltip bg', fg: 's3d-color-tooltip-text', bg: 's3d-color-tooltip-bg', min: 4.5 },
	{ label: 'sidebar text on sidebar bg', fg: 's3d-sidebar-text', bg: 's3d-sidebar-bg', min: 4.5 },
	{ label: 'sidebar secondary on sidebar bg', fg: 's3d-sidebar-text-secondary', bg: 's3d-sidebar-bg', min: 3 },
	{ label: 'sidebar active text on sidebar active bg', fg: 's3d-sidebar-active-text', bg: 's3d-sidebar-active', bgBase: 's3d-sidebar-bg', min: 4.5 },
]

const css = await readFile(indexCssPath, 'utf8')
const themes = {
	light: parseThemeBlock(css, ':root,'),
	dark: parseThemeBlock(css, ":root[data-theme='dark']"),
}

const findings = []

for (const [themeName, tokens] of Object.entries(themes)) {
	for (const pair of pairs) {
		const bgBase = pair.bgBase ?? 's3d-color-bg-card'
		const bg = resolveColorToken(pair.bg, tokens, bgBase)
		const fg = resolveColorToken(pair.fg, tokens, pair.bg)
		const ratio = contrastRatio(fg, bg)

		if (ratio < pair.min) {
			findings.push({ themeName, pair, ratio })
		}

		console.log(`${themeName.padEnd(5)} ${ratio.toFixed(2).padStart(5)} ${pair.label}`)
	}
}

if (findings.length === 0) {
	console.log('\nAll tracked design contrast pairs meet their advisory thresholds.')
	process.exit(0)
}

console.log(`\nFound ${findings.length} contrast advisory finding${findings.length === 1 ? '' : 's'}.`)
console.log('These are review prompts, not automatic failures unless --fail-on-findings is passed.\n')

for (const finding of findings) {
	console.log(
		`${finding.themeName} ${finding.pair.label}: ${finding.ratio.toFixed(2)} < ${finding.pair.min} `
		+ `(${finding.pair.fg} on ${finding.pair.bg})`,
	)
}

if (failOnFindings) {
	process.exit(1)
}

function parseThemeBlock(text, marker) {
	const start = text.indexOf(marker)
	if (start === -1) {
		throw new Error(`Could not find theme marker: ${marker}`)
	}

	const open = text.indexOf('{', start)
	const close = findMatchingBrace(text, open)
	const block = text.slice(open + 1, close)
	const tokens = new Map()

	for (const match of block.matchAll(/--([a-zA-Z0-9-]+):\s*([^;]+);/g)) {
		tokens.set(match[1], match[2].trim())
	}

	return tokens
}

function findMatchingBrace(text, openIndex) {
	let depth = 0
	for (let index = openIndex; index < text.length; index += 1) {
		const char = text[index]
		if (char === '{') {
			depth += 1
		} else if (char === '}') {
			depth -= 1
			if (depth === 0) {
				return index
			}
		}
	}
	throw new Error('Could not find matching CSS block brace.')
}

function resolveColorToken(name, tokens, bgTokenName, seen = new Set()) {
	const tokenName = name.replace(/^--/, '')
	if (seen.has(tokenName)) {
		throw new Error(`Circular token reference: ${[...seen, tokenName].join(' -> ')}`)
	}

	const raw = tokens.get(tokenName)
	if (!raw) {
		throw new Error(`Missing token: --${tokenName}`)
	}

	const varMatch = raw.match(/^var\(--([a-zA-Z0-9-]+)(?:,\s*([^)]+))?\)$/)
	if (varMatch) {
		seen.add(tokenName)
		return resolveColorToken(varMatch[1], tokens, bgTokenName, seen)
	}

	const fallbackBg = bgTokenName && bgTokenName !== tokenName
		? () => resolveColorToken(bgTokenName, tokens, undefined, new Set())
		: undefined

	return parseColor(raw, fallbackBg)
}

function parseColor(value, fallbackBg) {
	const hexMatch = value.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
	if (hexMatch) {
		return parseHex(hexMatch[1])
	}

	const rgbaMatch = value.match(/^rgba?\(([^)]+)\)$/)
	if (rgbaMatch) {
		const parts = rgbaMatch[1].split(',').map((part) => part.trim())
		const color = {
			r: Number(parts[0]),
			g: Number(parts[1]),
			b: Number(parts[2]),
			a: parts[3] === undefined ? 1 : Number(parts[3]),
		}
		if (color.a >= 1) {
			return color
		}
		const bg = fallbackBg?.() ?? { r: 255, g: 255, b: 255, a: 1 }
		return blend(color, bg)
	}

	throw new Error(`Unsupported color value for contrast check: ${value}`)
}

function parseHex(hex) {
	const normalized = hex.length === 3
		? hex.split('').map((char) => char + char).join('')
		: hex
	return {
		r: Number.parseInt(normalized.slice(0, 2), 16),
		g: Number.parseInt(normalized.slice(2, 4), 16),
		b: Number.parseInt(normalized.slice(4, 6), 16),
		a: 1,
	}
}

function blend(fg, bg) {
	const alpha = fg.a + bg.a * (1 - fg.a)
	return {
		r: Math.round((fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / alpha),
		g: Math.round((fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / alpha),
		b: Math.round((fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / alpha),
		a: alpha,
	}
}

function contrastRatio(fg, bg) {
	const lighter = Math.max(relativeLuminance(fg), relativeLuminance(bg))
	const darker = Math.min(relativeLuminance(fg), relativeLuminance(bg))
	return (lighter + 0.05) / (darker + 0.05)
}

function relativeLuminance(color) {
	const [r, g, b] = [color.r, color.g, color.b].map((channel) => {
		const srgb = channel / 255
		return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
	})
	return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
