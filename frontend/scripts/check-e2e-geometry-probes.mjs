import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const targets = ['tests', 'playwright.config.ts']
const allowedMarker = 'e2e-geometry-allow'

const bannedPatterns = [
	{ name: 'boundingBox()', regex: /\bboundingBox\s*\(/, allowMarker: true },
	{ name: 'getBoundingClientRect()', regex: /\bgetBoundingClientRect\s*\(/, allowMarker: true },
	{ name: 'scrollWidth', regex: /\bscrollWidth\b/, allowMarker: true },
	{ name: 'clientWidth', regex: /\bclientWidth\b/, allowMarker: true },
	{ name: 'clientHeight', regex: /\bclientHeight\b/, allowMarker: true },
	{ name: 'offsetWidth', regex: /\boffsetWidth\b/, allowMarker: true },
	{ name: 'offsetHeight', regex: /\boffsetHeight\b/, allowMarker: true },
	{ name: 'maxDiffPixelRatio', regex: /\bmaxDiffPixelRatio\b/, allowMarker: false },
]

function walk(dir) {
	const entries = readdirSync(dir, { withFileTypes: true })
	const files = []
	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name)
		if (entry.isDirectory()) {
			files.push(...walk(fullPath))
			continue
		}
		if (!entry.isFile()) continue
		if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) continue
		files.push(fullPath)
	}
	return files
}

const violations = []

for (const target of targets) {
	const targetPath = path.join(root, target)
	let stats
	try {
		stats = statSync(targetPath)
	} catch {
		continue
	}
	const files = stats.isDirectory() ? walk(targetPath) : stats.isFile() ? [targetPath] : []
	for (const file of files) {
		const lines = readFileSync(file, 'utf8').split(/\r?\n/)
		lines.forEach((line, index) => {
			for (const pattern of bannedPatterns) {
				if (!pattern.regex.test(line)) continue
				if (pattern.allowMarker && line.includes(allowedMarker)) continue
				violations.push({
					file: path.relative(root, file),
					line: index + 1,
					pattern: pattern.name,
					source: line.trim(),
				})
			}
		})
	}
}

if (violations.length > 0) {
	console.error('[check:e2e:geometry] banned E2E authoring pattern(s) found:')
	for (const violation of violations) {
		console.error(`- ${violation.file}:${violation.line} uses ${violation.pattern}`)
		console.error(`  ${violation.source}`)
	}
	console.error(`[check:e2e:geometry] unavoidable geometry probes require "${allowedMarker}" and a code-review justification.`)
	console.error('[check:e2e:geometry] visual snapshots must use the global absolute maxDiffPixels budget; maxDiffPixelRatio is not allowed.')
	process.exit(1)
}

console.log('[check:e2e:geometry] ok')
