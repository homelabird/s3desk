#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

function isRecord(value) {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toNumber(value) {
	return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function formatKB(bytes) {
	return `${(bytes / 1024).toFixed(1)} kB`
}

function readJSON(p) {
	if (!fs.existsSync(p)) throw new Error(`file not found: ${p}`)
	return JSON.parse(fs.readFileSync(p, 'utf8'))
}

function gzipBytes(buf) {
	return zlib.gzipSync(buf).length
}

function readAssetBytes(distDir, relPath) {
	const filePath = path.join(distDir, relPath)
	const buf = fs.readFileSync(filePath)
	return { raw: buf.length, gzip: gzipBytes(buf) }
}

function uniqSorted(list) {
	return [...new Set(list)].sort((a, b) => a.localeCompare(b))
}

function parseIndexInitialJs(distDir) {
	const htmlPath = path.join(distDir, 'index.html')
	const html = fs.readFileSync(htmlPath, 'utf8')

	const assets = []
	for (const m of html.matchAll(/<script[^>]*type="module"[^>]*src="([^"]+)"/g)) {
		assets.push(m[1])
	}
	for (const m of html.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g)) {
		assets.push(m[1])
	}

	return uniqSorted(
		assets
			.filter((p) => typeof p === 'string' && p.startsWith('/assets/') && p.endsWith('.js'))
			.map((p) => p.slice(1)),
	)
}

function findChunk(stats, prefix) {
	const children = stats?.tree?.children
	if (!Array.isArray(children)) return null
	return children.find((c) => isRecord(c) && typeof c.name === 'string' && c.name.startsWith('assets/') && c.name.includes(prefix) && c.name.endsWith('.js')) || null
}

function toPackageName(moduleId) {
	const id = String(moduleId || '').replace(/^\0+/, '').replace(/^[./]+/, '')
	const idx = id.indexOf('node_modules/')
	if (idx === -1) return '<app>'
	const rest = id.slice(idx + 'node_modules/'.length)
	const parts = rest.split('/').filter(Boolean)
	if (parts.length === 0) return '<node_modules>'
	if (parts[0].startsWith('@') && parts.length >= 2) return `${parts[0]}/${parts[1]}`
	return parts[0]
}

function topModulesForChunk(stats, chunkName, limit) {
	const metas = stats.nodeMetas || {}
	const parts = stats.nodeParts || {}
	const rows = []
	for (const meta of Object.values(metas)) {
		if (!isRecord(meta)) continue
		if (!isRecord(meta.moduleParts)) continue
		const partKey = meta.moduleParts[chunkName]
		if (typeof partKey !== 'string') continue
		const part = parts[partKey]
		if (!isRecord(part)) continue
		const gzip = toNumber(part.gzipLength)
		if (gzip <= 0) continue
		rows.push({
			gzip,
			rendered: toNumber(part.renderedLength),
			id: String(meta.id || ''),
		})
	}
	rows.sort((a, b) => b.gzip - a.gzip)
	return rows.slice(0, limit)
}

function topPackagesForChunks(stats, chunkNames, limit) {
	const metas = stats.nodeMetas || {}
	const parts = stats.nodeParts || {}
	const totals = new Map()

	for (const meta of Object.values(metas)) {
		if (!isRecord(meta)) continue
		if (!isRecord(meta.moduleParts)) continue

		let gzip = 0
		for (const chunkName of chunkNames) {
			const partKey = meta.moduleParts[chunkName]
			if (typeof partKey !== 'string') continue
			const part = parts[partKey]
			if (!isRecord(part)) continue
			gzip += toNumber(part.gzipLength)
		}
		if (gzip <= 0) continue

		const pkg = toPackageName(meta.id)
		totals.set(pkg, (totals.get(pkg) || 0) + gzip)
	}

	const rows = [...totals.entries()].map(([pkg, gzip]) => ({ pkg, gzip }))
	rows.sort((a, b) => b.gzip - a.gzip)
	return rows.slice(0, limit)
}

function parseArgs(argv) {
	const args = { statsPath: 'frontend/dist/stats.json', outPath: 'frontend/dist/bundle-report.md', fail: false }
	const positional = []
	for (const a of argv) {
		if (a === '--fail') args.fail = true
		else positional.push(a)
	}
	if (positional[0]) args.statsPath = positional[0]
	if (positional[1]) args.outPath = positional[1]
	return args
}

function main() {
	const { statsPath, outPath, fail } = parseArgs(process.argv.slice(2))
	const stats = readJSON(statsPath)
	const distDir = path.dirname(statsPath)

	const vendorUi = findChunk(stats, 'vendor-ui-')
	const vendorUiName = vendorUi ? vendorUi.name : null

	const initialJs = parseIndexInitialJs(distDir)
	const initialSizes = initialJs.map((rel) => ({ rel, ...readAssetBytes(distDir, rel) }))
	initialSizes.sort((a, b) => b.gzip - a.gzip)

	const initialTotal = initialSizes.reduce((acc, f) => acc + f.raw, 0)
	const initialTotalGzip = initialSizes.reduce((acc, f) => acc + f.gzip, 0)

	const vendorUiSizes = vendorUiName ? readAssetBytes(distDir, vendorUiName) : null

	const budgets = {
		vendorUiGzip: Number(process.env.BUNDLE_BUDGET_VENDOR_UI_GZIP_KB || 300) * 1024,
		initialJsGzip: Number(process.env.BUNDLE_BUDGET_INITIAL_JS_GZIP_KB || 450) * 1024,
	}

	const warnings = []
	if (vendorUiSizes && vendorUiSizes.gzip > budgets.vendorUiGzip) {
		warnings.push(`vendor-ui gzip ${formatKB(vendorUiSizes.gzip)} > budget ${formatKB(budgets.vendorUiGzip)}`)
	}
	if (initialTotalGzip > budgets.initialJsGzip) {
		warnings.push(`initial JS gzip ${formatKB(initialTotalGzip)} > budget ${formatKB(budgets.initialJsGzip)}`)
	}

	const initialChunks = initialJs
		.map((p) => p.replace(/^\/?/, ''))
		.filter((p) => typeof p === 'string' && p.startsWith('assets/') && p.endsWith('.js'))

	const topInitialPackages = topPackagesForChunks(stats, initialChunks, 20)
	const topVendorUiModules = vendorUiName ? topModulesForChunk(stats, vendorUiName, 25) : []

	let md = ''
	md += `# Bundle Report\n\n`
	md += `Generated from \`${statsPath}\` and \`${path.join(distDir, 'index.html')}\`.\n\n`

	md += `## Key Metrics\n\n`
	if (vendorUiName && vendorUiSizes) {
		md += `- vendor-ui: \`${vendorUiName}\` (${formatKB(vendorUiSizes.raw)} raw, ${formatKB(vendorUiSizes.gzip)} gzip)\n`
	} else {
		md += `- vendor-ui: (not found)\n`
	}
	md += `- initial JS (index.html): ${initialJs.length} files (${formatKB(initialTotal)} raw, ${formatKB(initialTotalGzip)} gzip)\n\n`

	md += `### Initial JS Files (Sorted by gzip)\n\n`
	md += `| gzip | raw | file |\n|---:|---:|---|\n`
	for (const f of initialSizes) {
		md += `| ${formatKB(f.gzip)} | ${formatKB(f.raw)} | \`${f.rel}\` |\n`
	}
	md += `\n`

	md += `### Top Packages in Initial JS (module gzip, approx)\n\n`
	md += `| gzip | package |\n|---:|---|\n`
	for (const row of topInitialPackages) {
		md += `| ${formatKB(row.gzip)} | \`${row.pkg}\` |\n`
	}
	md += `\n`

	md += `### Top Modules in vendor-ui (module gzip, approx)\n\n`
	if (!vendorUiName) {
		md += `vendor-ui chunk not found in stats tree.\n\n`
	} else {
		md += `| gzip | rendered | module |\n|---:|---:|---|\n`
		for (const row of topVendorUiModules) {
			md += `| ${formatKB(row.gzip)} | ${formatKB(row.rendered)} | \`${row.id}\` |\n`
		}
		md += `\n`
	}

	md += `## Budgets (Soft)\n\n`
	md += `- vendor-ui gzip budget: ${formatKB(budgets.vendorUiGzip)}\n`
	md += `- initial JS gzip budget: ${formatKB(budgets.initialJsGzip)}\n\n`
	if (warnings.length === 0) {
		md += `No budget warnings.\n`
	} else {
		md += `Budget warnings:\n`
		for (const w of warnings) md += `- ${w}\n`
	}
	md += `\n`

	fs.mkdirSync(path.dirname(outPath), { recursive: true })
	fs.writeFileSync(outPath, md, 'utf8')

	console.log(`[bundle-report] wrote ${outPath}`)
	if (warnings.length > 0) {
		console.warn(`[bundle-report] warnings: ${warnings.length}`)
		for (const w of warnings) console.warn(`[bundle-report] ${w}`)
		if (fail) process.exitCode = 1
	}
}

try {
	main()
} catch (error) {
	const msg = error instanceof Error ? error.message : String(error)
	console.error(`[bundle-report] error: ${msg}`)
	process.exit(1)
}
