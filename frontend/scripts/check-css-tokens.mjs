import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const srcRoot = path.resolve(fileURLToPath(new URL('../src', import.meta.url)))
const cssFilePattern = /\.css$/i
const definitionPattern = /(--s3d-[A-Za-z0-9-]+)\s*:/g
const usagePattern = /var\(\s*(--s3d-[A-Za-z0-9-]+)\s*(,|\))/g

async function collectCssFiles(directory) {
	const entries = await readdir(directory, { withFileTypes: true })
	const files = []

	for (const entry of entries) {
		const filePath = path.join(directory, entry.name)
		if (entry.isDirectory()) {
			files.push(...(await collectCssFiles(filePath)))
			continue
		}
		if (entry.isFile() && cssFilePattern.test(entry.name)) {
			files.push(filePath)
		}
	}

	return files
}

function positionForIndex(source, index) {
	const before = source.slice(0, index)
	const lines = before.split('\n')
	return {
		line: lines.length,
		column: lines.at(-1).length + 1,
	}
}

const cssFiles = await collectCssFiles(srcRoot)
const definedTokens = new Set()
const unresolvedUsages = []

for (const filePath of cssFiles) {
	const source = await readFile(filePath, 'utf8')
	for (const match of source.matchAll(definitionPattern)) {
		definedTokens.add(match[1])
	}
}

for (const filePath of cssFiles) {
	const source = await readFile(filePath, 'utf8')
	for (const match of source.matchAll(usagePattern)) {
		const [, token, delimiter] = match
		const hasFallback = delimiter === ','
		if (definedTokens.has(token) || hasFallback) continue

		const position = positionForIndex(source, match.index ?? 0)
		unresolvedUsages.push({
			filePath: path.relative(process.cwd(), filePath),
			line: position.line,
			column: position.column,
			token,
		})
	}
}

if (unresolvedUsages.length > 0) {
	console.error('[check:css-tokens] undefined --s3d-* CSS variable usages without fallback:')
	for (const usage of unresolvedUsages) {
		console.error(`- ${usage.filePath}:${usage.line}:${usage.column} ${usage.token}`)
	}
	process.exit(1)
}

console.log(`[check:css-tokens] ok (${cssFiles.length} CSS files, ${definedTokens.size} tokens)`)
