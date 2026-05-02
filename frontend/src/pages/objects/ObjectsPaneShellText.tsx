import shellStyles from './ObjectsShell.module.css'

export function ShellText({ children }: { children: string }) {
	return <span className={shellStyles.shellTextMuted}>{children}</span>
}
