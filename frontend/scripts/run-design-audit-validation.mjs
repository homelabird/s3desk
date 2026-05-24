#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const logPath = path.join(rootDir, 'docs', 'DESIGN_AUDIT_VALIDATION_LOG.md')
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const checks = [
	{ title: 'npm run check:design', args: ['run', 'check:design'] },
	{ title: 'npm run build', args: ['run', 'build'] },
	{ title: 'npm run test:e2e:design-audit', args: ['run', 'test:e2e:design-audit'] },
]

const results = []
const previousLog = await readFile(logPath, 'utf8').catch(() => '')

for (const check of checks) {
	console.log(`\n=== ${check.title} ===`)
	const result = await runCommand(npmCommand, check.args)
	results.push({ ...check, ...result })
	if (result.exitCode !== 0) {
		console.log(`Stopping after failed validation step: ${check.title}`)
		break
	}
}

await writeFile(logPath, renderValidationLog(results, previousLog), 'utf8')

const failed = results.find((result) => result.exitCode !== 0)
if (failed) {
	process.exit(failed.exitCode ?? 1)
}

process.exit(0)

function runCommand(command, args) {
	return new Promise((resolve) => {
		const startedAt = new Date()
		const child = spawn(command, args, {
			cwd: rootDir,
			env: process.env,
			stdio: ['ignore', 'pipe', 'pipe'],
		})

		let stdout = ''
		let stderr = ''

		child.stdout.on('data', (chunk) => {
			const text = chunk.toString()
			stdout += text
			process.stdout.write(text)
		})

		child.stderr.on('data', (chunk) => {
			const text = chunk.toString()
			stderr += text
			process.stderr.write(text)
		})

		child.on('close', (exitCode) => {
			resolve({
				exitCode,
				startedAt,
				finishedAt: new Date(),
				stdout,
				stderr,
			})
		})
	})
}

function renderValidationLog(results, previousLog) {
	const byTitle = new Map(results.map((result) => [result.title, result]))
	const generatedAt = new Date().toISOString()
	const tail = renderEvidenceTail(results, previousLog)

	return `# Design Audit Validation Log

Date: ${generatedAt}

Use this file to record the evidence required before the UI/UX design audit can be considered complete.

## Command Results

${renderCommandSection('npm run check:design', byTitle)}

${renderCommandSection(
	'npm run check:css-tokens',
	byTitle,
	'Covered by `npm run check:design` when that aggregate command is run.',
	'npm run check:design',
)}

${renderCommandSection(
	'npm run check:design-audit',
	byTitle,
	'Covered by `npm run check:design` when that aggregate command is run.',
	'npm run check:design',
)}

${renderCommandSection(
	'npm run check:design-contrast',
	byTitle,
	'Covered by `npm run check:design` when that aggregate command is run.',
	'npm run check:design',
)}

${renderCommandSection('npm run build', byTitle)}

${renderCommandSection('npm run test:e2e:design-audit', byTitle)}

${tail}`
}

function renderEvidenceTail(results, previousLog) {
	const commandsPassed = results.length === checks.length && results.every((result) => result.exitCode === 0)
	const existingTail = extractEvidenceTail(previousLog)
	if (commandsPassed && existingTail) {
		return existingTail
	}

	const completionStatus = commandsPassed
		? 'Command gates passed; manual visual QA still required.'
		: 'Not complete'
	const completionReason = results.length === 0
		? 'No validation gates were executed.'
		: results.some((result) => result.exitCode !== 0)
			? 'At least one validation command failed.'
			: 'Required manual visual QA has not been recorded.'

	return `## Manual Visual QA Results

### Light theme desktop

- Status: Not reviewed
- Screens reviewed:
- Findings:

### Dark theme desktop

- Status: Not reviewed
- Screens reviewed:
- Findings:

### Mobile

- Status: Not reviewed
- Screens reviewed:
- Findings:

## Regression Findings

- None recorded by automated command runner.

## Completion Decision

- Status: ${completionStatus}
- Reason: ${completionReason}
`
}

function extractEvidenceTail(previousLog) {
	const supplementalIndex = previousLog.indexOf('## Supplemental Verification')
	if (supplementalIndex !== -1) {
		return previousLog.slice(supplementalIndex).trimEnd() + '\n'
	}

	const manualIndex = previousLog.indexOf('## Manual Visual QA Results')
	if (manualIndex !== -1) {
		return previousLog.slice(manualIndex).trimEnd() + '\n'
	}

	return ''
}

function renderCommandSection(title, byTitle, fallbackNote = '', coveredByTitle = '') {
	const result = byTitle.get(title)
	if (!result) {
		const coveringResult = coveredByTitle ? byTitle.get(coveredByTitle) : undefined
		if (coveringResult?.exitCode === 0) {
			return `### \`${title}\`

- Status: Passed via \`${coveredByTitle}\`
- Evidence: See the \`${coveredByTitle}\` command output above.
- Notes: ${fallbackNote}
`
		}

		return `### \`${title}\`

- Status: Not run
- Evidence:
- Notes: ${fallbackNote}
`
	}

	const status = result.exitCode === 0 ? 'Passed' : `Failed with exit code ${result.exitCode}`
	const output = tailLines([result.stdout, result.stderr].filter(Boolean).join('\n'), 80)

	return `### \`${title}\`

- Status: ${status}
- Started: ${result.startedAt.toISOString()}
- Finished: ${result.finishedAt.toISOString()}
- Evidence:

\`\`\`text
${output || '(no output)'}
\`\`\`

- Notes:
`
}

function tailLines(text, maxLines) {
	const lines = stripAnsi(text).trim().split(/\r?\n/)
	return lines.slice(Math.max(0, lines.length - maxLines)).join('\n')
}

function stripAnsi(text) {
	return text.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '')
}
