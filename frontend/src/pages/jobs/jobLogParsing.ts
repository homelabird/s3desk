export type ParsedJobLogLine = {
	line: string
	lineNumber: number
	timestamp: string | null
	level: 'error' | 'warn' | 'info' | 'debug' | 'plain'
	levelLabel: string | null
	message: string
}

const TIMESTAMPED_LOG_LINE_PATTERN =
	/^(?<timestamp>\[?\d{4}-\d{2}-\d{2}[^\s\]]*\]?)\s+(?<level>trace|debug|info|warn|warning|error|fatal)\b[: -]*(?<message>.*)$/i
const LEGACY_LOG_LINE_PATTERN = /^\[(?<level>trace|debug|info|warn|warning|error|fatal)\]\s*(?<message>.*)$/i

function normalizeLevel(rawLevel: string): ParsedJobLogLine['level'] {
	const level = rawLevel.toLowerCase()
	if (level === 'error' || level === 'fatal') return 'error'
	if (level === 'warn' || level === 'warning') return 'warn'
	if (level === 'info') return 'info'
	return 'debug'
}

export function parseJobLogLine(line: string, lineNumber: number): ParsedJobLogLine {
	const timestamped = TIMESTAMPED_LOG_LINE_PATTERN.exec(line)
	const legacy = timestamped ? null : LEGACY_LOG_LINE_PATTERN.exec(line)
	const match = timestamped ?? legacy
	if (match?.groups) {
		const rawLevel = match.groups.level
		return {
			line,
			lineNumber,
			timestamp: timestamped ? (match.groups.timestamp ?? null) : null,
			level: normalizeLevel(rawLevel),
			levelLabel: rawLevel.toUpperCase(),
			message: match.groups.message || line,
		}
	}

	const normalized = line.toLowerCase()
	const level = normalized.includes('error') || normalized.includes('fatal')
		? 'error'
		: normalized.includes('warn')
			? 'warn'
			: 'plain'
	return {
		line,
		lineNumber,
		timestamp: null,
		level,
		levelLabel: level === 'plain' ? null : level.toUpperCase(),
		message: line,
	}
}
