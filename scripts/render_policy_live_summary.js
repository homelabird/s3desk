#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')

function escapeCell(value) {
	return String(value ?? '').replace(/\|/g, '\\|')
}

function isRecord(value) {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toArray(value) {
	return Array.isArray(value) ? value : []
}

function callHasIssue(call) {
	const status = typeof call.status === 'number' ? call.status : 0
	const errorsCount = typeof call.errorsCount === 'number' ? call.errorsCount : 0
	if (status >= 400) return true
	if (call.ok === false) return true
	if (typeof call.errorCode === 'string' && call.errorCode.length > 0) return true
	if (typeof call.normalizedCode === 'string' && call.normalizedCode.length > 0) return true
	if (call.validationOk === false) return true
	if (errorsCount > 0) return true
	return false
}

function readEntries(sourcePath) {
	if (!fs.existsSync(sourcePath)) {
		throw new Error(`source file not found: ${sourcePath}`)
	}
	const text = fs.readFileSync(sourcePath, 'utf8')
	const lines = text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
	const entries = []
	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i]
		let parsed
		try {
			parsed = JSON.parse(line)
		} catch (error) {
			throw new Error(`invalid JSON at line ${i + 1}: ${error instanceof Error ? error.message : String(error)}`)
		}
		if (!isRecord(parsed)) {
			throw new Error(`line ${i + 1} is not a JSON object`)
		}
		entries.push(parsed)
	}
	return entries
}

function summarize(entries) {
	const totals = {
		tests: entries.length,
		passed: 0,
		failed: 0,
		skipped: 0,
		other: 0,
		calls: 0,
		callsWithIssues: 0,
	}
	const byProvider = new Map()
	const tests = []
	const callFindings = []

	for (const entry of entries) {
		const provider = typeof entry.provider === 'string' ? entry.provider : 'unknown'
		const status = typeof entry.status === 'string' ? entry.status : 'unknown'
		const title = typeof entry.test === 'string' ? entry.test : '<unknown test>'
		const calls = toArray(entry.calls).filter(isRecord)
		const issues = calls.filter(callHasIssue)

		totals.calls += calls.length
		totals.callsWithIssues += issues.length
		if (status === 'passed') totals.passed += 1
		else if (status === 'failed' || status === 'timedOut' || status === 'interrupted') totals.failed += 1
		else if (status === 'skipped') totals.skipped += 1
		else totals.other += 1

		const providerStat = byProvider.get(provider) ?? {
			provider,
			tests: 0,
			passed: 0,
			failed: 0,
			skipped: 0,
			other: 0,
			calls: 0,
			callsWithIssues: 0,
		}
		providerStat.tests += 1
		providerStat.calls += calls.length
		providerStat.callsWithIssues += issues.length
		if (status === 'passed') providerStat.passed += 1
		else if (status === 'failed' || status === 'timedOut' || status === 'interrupted') providerStat.failed += 1
		else if (status === 'skipped') providerStat.skipped += 1
		else providerStat.other += 1
		byProvider.set(provider, providerStat)

		tests.push({
			title,
			provider,
			status,
			calls: calls.length,
			callsWithIssues: issues.length,
		})

		for (const call of issues) {
			const detail = [
				`phase=${call.phase ?? 'unknown'}`,
				`method=${call.method ?? 'UNKNOWN'}`,
				`path=${call.path ?? 'unknown'}`,
				`status=${typeof call.status === 'number' ? call.status : 'n/a'}`,
			]
			if (typeof call.normalizedCode === 'string') detail.push(`normalized=${call.normalizedCode}`)
			if (typeof call.errorCode === 'string') detail.push(`error=${call.errorCode}`)
			if (typeof call.errorsCount === 'number') detail.push(`errors=${call.errorsCount}`)
			if (typeof call.warningsCount === 'number') detail.push(`warnings=${call.warningsCount}`)
			callFindings.push({
				title,
				provider,
				status,
				detail: detail.join(', '),
			})
		}
	}

	return {
		totals,
		providers: Array.from(byProvider.values()).sort((a, b) => a.provider.localeCompare(b.provider)),
		tests,
		callFindings,
	}
}

function renderMarkdown(sourcePath, summary) {
	const generatedAt = new Date().toISOString()
	const lines = []
	lines.push('# Bucket Policy Live Summary')
	lines.push('')
	lines.push(`- Generated: ${generatedAt}`)
	lines.push(`- Source: ${sourcePath}`)
	lines.push('')
	lines.push('## Totals')
	lines.push('')
	lines.push('| tests | passed | failed | skipped | other | calls | calls_with_issues |')
	lines.push('| --- | --- | --- | --- | --- | --- | --- |')
	lines.push(
		`| ${summary.totals.tests} | ${summary.totals.passed} | ${summary.totals.failed} | ${summary.totals.skipped} | ${summary.totals.other} | ${summary.totals.calls} | ${summary.totals.callsWithIssues} |`,
	)
	lines.push('')
	lines.push('## By Provider')
	lines.push('')
	lines.push('| provider | tests | passed | failed | skipped | other | calls | calls_with_issues |')
	lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |')
	for (const row of summary.providers) {
		lines.push(
			`| ${escapeCell(row.provider)} | ${row.tests} | ${row.passed} | ${row.failed} | ${row.skipped} | ${row.other} | ${row.calls} | ${row.callsWithIssues} |`,
		)
	}
	if (summary.providers.length === 0) {
		lines.push('| (none) | 0 | 0 | 0 | 0 | 0 | 0 | 0 |')
	}
	lines.push('')
	lines.push('## Tests')
	lines.push('')
	lines.push('| test | provider | status | calls | calls_with_issues |')
	lines.push('| --- | --- | --- | --- | --- |')
	for (const row of summary.tests) {
		lines.push(
			`| ${escapeCell(row.title)} | ${escapeCell(row.provider)} | ${escapeCell(row.status)} | ${row.calls} | ${row.callsWithIssues} |`,
		)
	}
	if (summary.tests.length === 0) {
		lines.push('| (none) | - | - | 0 | 0 |')
	}
	lines.push('')
	lines.push('## Call Findings')
	lines.push('')
	if (summary.callFindings.length === 0) {
		lines.push('- No call-level issues found')
	} else {
		for (const finding of summary.callFindings) {
			lines.push(
				`- [${escapeCell(finding.status)}] ${escapeCell(finding.provider)} :: ${escapeCell(finding.title)} :: ${escapeCell(finding.detail)}`,
			)
		}
	}
	lines.push('')
	return `${lines.join('\n')}\n`
}

function main() {
	const [, , sourceArg, outputArg] = process.argv
	if (!sourceArg) {
		console.error(`Usage: node ${path.basename(process.argv[1])} <source-ndjson> [output-markdown]`)
		process.exit(1)
	}
	const sourcePath = path.resolve(process.cwd(), sourceArg)
	const outputPath = outputArg ? path.resolve(process.cwd(), outputArg) : null
	const entries = readEntries(sourcePath)
	const summary = summarize(entries)
	const markdown = renderMarkdown(sourcePath, summary)
	if (outputPath) {
		fs.mkdirSync(path.dirname(outputPath), { recursive: true })
		fs.writeFileSync(outputPath, markdown, 'utf8')
		console.error(`[policy-summary] report written: ${outputPath}`)
	}
	process.stdout.write(markdown)
}

main()
