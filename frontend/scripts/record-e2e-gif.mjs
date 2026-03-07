#!/usr/bin/env node
import { mkdirSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '..');

const cliArgs = process.argv.slice(2);
let ffmpegStatic = null;

try {
	const imported = await import('ffmpeg-static');
	ffmpegStatic = imported?.default || null;
} catch {
	ffmpegStatic = null;
}

const hasProjectArg = cliArgs.some((arg) => arg === '--project' || arg.startsWith('--project='));
const hasOutputArg = cliArgs.some((arg) => arg === '--output' || arg.startsWith('--output='));

const now = new Date();
const runId = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
const baseRecordDir = resolve(process.env.PLAYWRIGHT_RECORD_DIR || join(projectRoot, 'recordings'));
const explicitOutputDir = extractOutputDir(cliArgs);
const defaultRecordDir = resolve(baseRecordDir, runId);
const runRecordDir = explicitOutputDir ? resolve(explicitOutputDir) : defaultRecordDir;
const gifOutputDir = explicitOutputDir ? resolve(runRecordDir, 'gifs') : resolve(baseRecordDir, 'gifs', runId);

const projectArg = hasProjectArg ? [] : ['--project', process.env.PLAYWRIGHT_PROJECT || 'chromium'];
const outputArg = hasOutputArg ? [] : ['--output', runRecordDir];
const playwrightArgs = [...projectArg, ...outputArg, ...cliArgs];

if (!process.env.PLAYWRIGHT_OUTPUT_DIR && !hasOutputArg) {
	process.env.PLAYWRIGHT_OUTPUT_DIR = runRecordDir;
}
process.env.PLAYWRIGHT_RECORD_VIDEOS = '1';

mkdirSync(runRecordDir, { recursive: true });
mkdirSync(gifOutputDir, { recursive: true });

const exit = runCommand('npx', ['playwright', 'test', ...playwrightArgs], {
	cwd: projectRoot,
	env: process.env,
	stdio: 'inherit',
});
if (exit !== 0) {
	process.exit(exit);
}

const ffmpegBinary = resolveFfmpegBinary();
if (!ffmpegBinary) {
	console.error('ffmpeg를 찾을 수 없습니다. 시스템 ffmpeg 또는 npm 패키지 ffmpeg-static가 설치되어 있어야 합니다.');
	process.exit(1);
}

const videos = collectVideos(runRecordDir);
if (videos.length === 0) {
	console.log(`녹화 파일이 없습니다. 출력 경로: ${runRecordDir}`);
	process.exit(0);
}

for (const webm of videos) {
	const stem = webm.slice(0, -extname(webm).length);
	const base = stem.split('/').pop() || stem;
	const mp4Path = join(gifOutputDir, `${base}.mp4`);
	const gifPath = join(gifOutputDir, `${base}.gif`);

	runCommand(ffmpegBinary, [
		'-y',
		'-i',
		webm,
		'-c:v',
		'libx264',
		'-pix_fmt',
		'yuv420p',
		'-movflags',
		'+faststart',
		mp4Path,
	]);

	runCommand(ffmpegBinary, [
		'-y',
		'-i',
		webm,
		'-vf',
		'fps=12,scale=1280:-1:flags=lanczos',
		'-loop',
		'0',
		'-pix_fmt',
		'rgb24',
		gifPath,
	]);

	console.log(`변환 완료: ${webm}`);
	console.log(`  - mp4: ${mp4Path}`);
	console.log(`  - gif: ${gifPath}`);
}

console.log(`완료: ${videos.length}개 녹화 파일 -> ${gifOutputDir}`);

function collectVideos(dir, out = []) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			collectVideos(fullPath, out);
			continue;
		}
		if (entry.isFile() && fullPath.toLowerCase().endsWith('.webm')) {
			out.push(fullPath);
		}
	}
	return out;
}

function runCommand(command, args, options = {}) {
	const result = spawnSync(command, args, {
		stdio: 'inherit',
		...options,
	});
	if (result.error) {
		throw result.error;
	}
	if (result.status !== 0) {
		throw new Error(`Command failed: ${command} ${args.join(' ')} (exit ${result.status})`);
	}
	return result.status ?? 1;
}

function resolveFfmpegBinary() {
	if (commandExists('ffmpeg')) {
		return 'ffmpeg';
	}
	if (ffmpegStatic) {
		return ffmpegStatic;
	}
	return null;
}

function commandExists(command) {
	const result = spawnSync('sh', ['-lc', `command -v ${command} >/dev/null 2>&1`], {
		stdio: 'ignore',
	});
	return result.status === 0;
}

function extractOutputDir(args) {
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === '--output') {
			return args[i + 1];
		}
		if (arg.startsWith('--output=')) {
			return arg.split('=').slice(1).join('=');
		}
	}
	return null;
}
