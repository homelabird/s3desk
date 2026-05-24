#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const rootDir = process.cwd()
const sourceDir = path.join(rootDir, 'src')
const failOnFindings = process.argv.includes('--fail-on-findings')

const patterns = [
	{
		name: 'opacity styling',
		re: /\bopacity:\s*0\.\d+/g,
		reason: 'Prefer semantic text/surface tokens over opacity for readable repeated UI.',
	},
	{
		name: 'flat app background',
		re: /background:\s*var\(--s3d-color-bg\)\s*;/g,
		reason: 'Major cards, overlays, and dense panels usually need elevated or gradient surfaces.',
	},
	{
		name: 'shadow removed',
		re: /box-shadow:\s*none\s*;/g,
		reason: 'Confirm this is intentional; audited surfaces should keep hierarchy through border, shadow, or accent.',
	},
	{
		name: 'transparent background',
		re: /background:\s*transparent\s*;/g,
		reason: 'Transparent controls are fine, but floating or selectable surfaces need visible hierarchy.',
	},
	{
		name: 'small hardcoded radius',
		re: /border-radius:\s*(?:6|8)px\s*;/g,
		reason: 'Prefer shared radius tokens unless a compact primitive intentionally needs a smaller radius.',
	},
]

const cssFiles = await listCssFiles(sourceDir)
const findings = []

for (const file of cssFiles) {
	const text = await readFile(file, 'utf8')
	const lines = text.split(/\r?\n/)

	for (const pattern of patterns) {
		for (const match of text.matchAll(pattern.re)) {
			const index = match.index ?? 0
			const lineNumber = lineNumberForIndex(text, index)
			const line = lines[lineNumber - 1]?.trim() ?? ''
			findings.push({
				file: path.relative(rootDir, file),
				line: lineNumber,
				name: pattern.name,
				reason: pattern.reason,
				source: line,
			})
		}
	}
}

if (findings.length === 0) {
	console.log('No design-audit advisory patterns found.')
	process.exit(0)
}

console.log(`Found ${findings.length} design-audit advisory pattern${findings.length === 1 ? '' : 's'}.`)
console.log('These are review prompts, not automatic failures unless --fail-on-findings is passed.\n')

for (const finding of findings) {
	console.log(`${finding.file}:${finding.line} [${finding.name}] ${finding.source}`)
	console.log(`  ${finding.reason}`)
}

if (failOnFindings) {
	process.exit(1)
}

async function listCssFiles(dir) {
	const entries = await readdir(dir, { withFileTypes: true })
	const files = []

	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name)
		if (entry.isDirectory()) {
			files.push(...await listCssFiles(fullPath))
			continue
		}

		if (entry.isFile() && entry.name.endsWith('.module.css')) {
			files.push(fullPath)
		}
	}

	return files.sort()
}

function lineNumberForIndex(text, index) {
	let line = 1
	for (let i = 0; i < index; i += 1) {
		if (text.charCodeAt(i) === 10) {
			line += 1
		}
	}
	return line
}
