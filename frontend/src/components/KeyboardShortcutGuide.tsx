import { useEffect, useRef, type CSSProperties } from 'react'

type Shortcut = {
	keys: string
	description: string
}

const navigationShortcuts: Shortcut[] = [
	{ keys: 'G then P', description: 'Go to Profiles' },
	{ keys: 'G then B', description: 'Go to Buckets' },
	{ keys: 'G then O', description: 'Go to Objects' },
	{ keys: 'G then U', description: 'Go to Uploads' },
	{ keys: 'G then J', description: 'Go to Jobs' },
]

const actionShortcuts: Shortcut[] = [
	{ keys: '?', description: 'Open this shortcut guide' },
	{ keys: 'Esc', description: 'Close modal / drawer' },
]

const overlayStyle: CSSProperties = {
	position: 'fixed',
	inset: 0,
	background: 'rgba(0,0,0,0.45)',
	zIndex: 1050,
	display: 'flex',
	alignItems: 'center',
	justifyContent: 'center',
	padding: 16,
}

const cardStyle: CSSProperties = {
	background: '#fff',
	borderRadius: 12,
	padding: 24,
	width: 480,
	maxWidth: '100%',
	maxHeight: '80vh',
	overflow: 'auto',
	boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
}

const kbdStyle: CSSProperties = {
	display: 'inline-block',
	background: '#f1f5f9',
	border: '1px solid #cbd5e1',
	borderRadius: 4,
	padding: '2px 6px',
	fontSize: 12,
	fontFamily: 'monospace',
	lineHeight: 1.4,
	minWidth: 24,
	textAlign: 'center',
}

function ShortcutRow(props: { shortcut: Shortcut }) {
	return (
		<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
			<span style={{ fontSize: 13 }}>{props.shortcut.description}</span>
			<span>
				{props.shortcut.keys.split(' ').map((part, i) => (
					<span key={`${part}-${i}`}>
						{part.toLowerCase() === 'then' ? (
							<span style={{ margin: '0 4px', fontSize: 11, opacity: 0.75 }}>then</span>
						) : (
							<kbd style={kbdStyle}>{part}</kbd>
						)}
					</span>
				))}
			</span>
		</div>
	)
}

type Props = {
	open: boolean
	onClose: () => void
}

export function KeyboardShortcutGuide(props: Props) {
	const { open, onClose } = props
	const closeRef = useRef<HTMLButtonElement>(null)

	useEffect(() => {
		if (!open) return
		closeRef.current?.focus()
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose()
		}
		document.addEventListener('keydown', handler)
		return () => document.removeEventListener('keydown', handler)
	}, [open, onClose])

	if (!props.open) return null

	return (
		<div style={overlayStyle} onClick={props.onClose} data-testid="keyboard-shortcut-guide">
			<div style={cardStyle} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Keyboard shortcuts" aria-modal="true">
				<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
					<h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Keyboard shortcuts</h2>
					<button
						ref={closeRef}
						type="button"
						onClick={props.onClose}
						aria-label="Close"
						style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', opacity: 0.75 }}
					>
						✕
					</button>
				</div>

				<div style={{ marginBottom: 16 }}>
					<div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, opacity: 0.85, textTransform: 'uppercase', letterSpacing: 0.5 }}>
						Navigation
					</div>
					{navigationShortcuts.map((s) => (
						<ShortcutRow key={s.keys} shortcut={s} />
					))}
				</div>

				<div>
					<div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, opacity: 0.85, textTransform: 'uppercase', letterSpacing: 0.5 }}>
						General
					</div>
					{actionShortcuts.map((s) => (
						<ShortcutRow key={s.keys} shortcut={s} />
					))}
				</div>

				<div style={{ marginTop: 16, fontSize: 12, opacity: 0.75 }}>
					Press <kbd style={kbdStyle}>?</kbd> anytime to open this guide.
				</div>
			</div>
		</div>
	)
}
