#!/usr/bin/env node
import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, '..')
const repoRoot = resolve(projectRoot, '..')
const cliArgs = process.argv.slice(2)

let ffmpegStatic = null

try {
	const imported = await import('ffmpeg-static')
	ffmpegStatic = imported?.default || null
} catch {
	ffmpegStatic = null
}

const now = new Date()
const runId = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`
const baseRecordDir = resolve(process.env.PLAYWRIGHT_RECORD_DIR || join(projectRoot, 'recordings'))
const explicitOutputDir = extractOptionValue(cliArgs, '--output')
const defaultRecordDir = resolve(baseRecordDir, runId)
const runRecordDir = explicitOutputDir ? resolve(explicitOutputDir) : defaultRecordDir
const reportDir = resolve(process.env.PLAYWRIGHT_HTML_REPORT_DIR || join(runRecordDir, 'report'))
const mediaDir = resolve(runRecordDir, 'media')

const exportGif = isTruthy(process.env.PLAYWRIGHT_EXPORT_GIF)
const exportMp4 = exportGif || isTruthy(process.env.PLAYWRIGHT_EXPORT_MP4)
const exportGifToDocs = exportGif && isTruthy(process.env.PLAYWRIGHT_EXPORT_GIF_TO_DOCS)
const docsGifDir = resolve(repoRoot, 'docs', 'assets', 'gifs', runId)
const docsLatestGif = resolve(repoRoot, 'docs', 'assets', 'gifs', 'latest.gif')

const hasProjectArg = cliArgs.some((arg) => arg === '--project' || arg.startsWith('--project='))
const hasOutputArg = cliArgs.some((arg) => arg === '--output' || arg.startsWith('--output='))

const projectArg = hasProjectArg ? [] : ['--project', process.env.PLAYWRIGHT_PROJECT || 'chromium']
const outputArg = hasOutputArg ? [] : ['--output', runRecordDir]
const playwrightArgs = [...projectArg, ...outputArg, ...cliArgs]

if (!process.env.PLAYWRIGHT_OUTPUT_DIR && !hasOutputArg) {
	process.env.PLAYWRIGHT_OUTPUT_DIR = runRecordDir
}
process.env.PLAYWRIGHT_HTML_REPORT = process.env.PLAYWRIGHT_HTML_REPORT || '1'
process.env.PLAYWRIGHT_HTML_REPORT_DIR = reportDir
process.env.PLAYWRIGHT_RECORD_ARTIFACTS = process.env.PLAYWRIGHT_RECORD_ARTIFACTS || '1'
process.env.PLAYWRIGHT_RECORD_VIDEOS = process.env.PLAYWRIGHT_RECORD_VIDEOS || '1'
process.env.PLAYWRIGHT_VIDEO_MODE = process.env.PLAYWRIGHT_VIDEO_MODE || 'on'
process.env.PLAYWRIGHT_TRACE_MODE = process.env.PLAYWRIGHT_TRACE_MODE || 'on'
process.env.PLAYWRIGHT_SCREENSHOT_MODE = process.env.PLAYWRIGHT_SCREENSHOT_MODE || 'on'

mkdirSync(runRecordDir, { recursive: true })
mkdirSync(reportDir, { recursive: true })

if (exportGif || exportMp4) {
	mkdirSync(mediaDir, { recursive: true })
	if (exportGifToDocs) {
		mkdirSync(docsGifDir, { recursive: true })
	}
}

const testExitCode = runCommand('npx', ['playwright', 'test', ...playwrightArgs], {
	cwd: projectRoot,
	env: process.env,
	stdio: 'inherit',
	allowFailure: true,
})

const videos = collectFiles(runRecordDir, (filePath) => filePath.toLowerCase().endsWith('.webm'))
const traces = collectFiles(runRecordDir, (filePath) => filePath.toLowerCase().endsWith('.zip') && filePath.includes('trace'))
const screenshots = collectFiles(runRecordDir, (filePath) => /\.(png|jpe?g)$/i.test(filePath))
const manifestPath = join(runRecordDir, 'capture-summary.json')

const converted = {
	mp4: [],
	gif: [],
	errors: [],
}

if (videos.length > 0 && (exportGif || exportMp4)) {
	const ffmpegBinary = resolveFfmpegBinary()
	if (!ffmpegBinary) {
		converted.errors.push('ffmpeg를 찾지 못해 mp4/gif 변환을 건너뛰었습니다.')
	} else {
		for (const webmPath of videos) {
			const stem = webmPath.slice(0, -extname(webmPath).length)
			const baseName = stem.split('/').pop() || stem
			const mp4Path = join(mediaDir, `${baseName}.mp4`)
			const gifPath = join(mediaDir, `${baseName}.gif`)

			if (exportMp4) {
				const mp4Exit = runCommand(
					ffmpegBinary,
					['-y', '-i', webmPath, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4Path],
					{ allowFailure: true },
				)
				if (mp4Exit === 0) {
					converted.mp4.push(mp4Path)
				} else {
					converted.errors.push(`mp4 변환 실패: ${webmPath}`)
				}
			}

			if (exportGif) {
				const gifExit = runCommand(
					ffmpegBinary,
					['-y', '-i', webmPath, '-vf', 'fps=12,scale=1280:-1:flags=lanczos', '-loop', '0', '-pix_fmt', 'rgb24', gifPath],
					{ allowFailure: true },
				)
				if (gifExit === 0) {
					converted.gif.push(gifPath)
					if (exportGifToDocs) {
						const docsGifPath = join(docsGifDir, `${baseName}.gif`)
						copyFileSync(gifPath, docsGifPath)
						copyFileSync(gifPath, docsLatestGif)
					}
				} else {
					converted.errors.push(`gif 변환 실패: ${webmPath}`)
				}
			}
		}
	}
}

const summary = {
	runId,
	testExitCode,
	outputDir: runRecordDir,
	reportDir,
	manifestPath,
	videos: videos.map((filePath) => relative(repoRoot, filePath)),
	traces: traces.map((filePath) => relative(repoRoot, filePath)),
	screenshots: screenshots.map((filePath) => relative(repoRoot, filePath)),
	converted: {
		mp4: converted.mp4.map((filePath) => relative(repoRoot, filePath)),
		gif: converted.gif.map((filePath) => relative(repoRoot, filePath)),
		errors: converted.errors,
	},
}

writeFileSync(manifestPath, `${JSON.stringify(summary, null, 2)}\n`)

console.log(`[capture] summary: ${manifestPath}`)
console.log(`[capture] html report: ${reportDir}`)
console.log(`[capture] videos=${videos.length} traces=${traces.length} screenshots=${screenshots.length}`)
if (converted.mp4.length > 0 || converted.gif.length > 0) {
	console.log(`[capture] converted mp4=${converted.mp4.length} gif=${converted.gif.length}`)
}
for (const message of converted.errors) {
	console.warn(`[capture] ${message}`)
}

process.exit(testExitCode)

function collectFiles(dir, matcher, out = []) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const fullPath = join(dir, entry.name)
		if (entry.isDirectory()) {
			collectFiles(fullPath, matcher, out)
			continue
		}
		if (entry.isFile() && matcher(fullPath)) {
			out.push(fullPath)
		}
	}
	return out
}

function runCommand(command, args, options = {}) {
	const { allowFailure = false, ...spawnOptions } = options
	const result = spawnSync(command, args, {
		stdio: 'inherit',
		...spawnOptions,
	})
	if (result.error) {
		throw result.error
	}
	if (!allowFailure && result.status !== 0) {
		throw new Error(`Command failed: ${command} ${args.join(' ')} (exit ${result.status})`)
	}
	return result.status ?? 1
}

function resolveFfmpegBinary() {
	if (commandExists('ffmpeg')) {
		return 'ffmpeg'
	}
	if (ffmpegStatic) {
		return ffmpegStatic
	}
	return null
}

function commandExists(command) {
	const result = spawnSync('sh', ['-lc', `command -v ${command} >/dev/null 2>&1`], {
		stdio: 'ignore',
	})
	return result.status === 0
}

function extractOptionValue(args, optionName) {
	for (let i = 0; i < args.length; i++) {
		const arg = args[i]
		if (arg === optionName) {
			return args[i + 1]
		}
		if (arg.startsWith(`${optionName}=`)) {
			return arg.split('=').slice(1).join('=')
		}
	}
	return null
}

function isTruthy(value) {
	return ['1', 'true', 'on', 'yes'].includes((value || '').toLowerCase())
}
