import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const targets = ['tests', 'tests/support']
const allowedMarker = 'e2e-geometry-allow'

const bannedPatterns = [
	{ name: 'boundingBox()', regex: /\bboundingBox\s*\(/ },
	{ name: 'getBoundingClientRect()', regex: /\bgetBoundingClientRect\s*\(/ },
	{ name: 'scrollWidth', regex: /\bscrollWidth\b/ },
	{ name: 'clientWidth', regex: /\bclientWidth\b/ },
	{ name: 'clientHeight', regex: /\bclientHeight\b/ },
	{ name: 'offsetWidth', regex: /\boffsetWidth\b/ },
	{ name: 'offsetHeight', regex: /\boffsetHeight\b/ },
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
	if (!stats.isDirectory()) continue

	for (const file of walk(targetPath)) {
		const lines = readFileSync(file, 'utf8').split(/\r?\n/)
		lines.forEach((line, index) => {
			if (line.includes(allowedMarker)) return
			for (const pattern of bannedPatterns) {
				if (!pattern.regex.test(line)) continue
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
	console.error('[check:e2e:geometry] banned geometry probe(s) found in Playwright tests/support files:')
	for (const violation of violations) {
		console.error(`- ${violation.file}:${violation.line} uses ${violation.pattern}`)
		console.error(`  ${violation.source}`)
	}
	console.error(`[check:e2e:geometry] if a probe is truly unavoidable, annotate the line with "${allowedMarker}" and justify it in code review.`)
	process.exit(1)
}

console.log('[check:e2e:geometry] ok')
