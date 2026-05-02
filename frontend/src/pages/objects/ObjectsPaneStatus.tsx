import styles from '../../components/simpleTree.module.css'

type ObjectsPaneStatusProps = {
	kind: 'prereq' | 'loading' | 'empty' | 'error'
	title: string
	description?: string
	testId?: string
	kindAttributeName?: string
}

export function ObjectsPaneStatus(props: ObjectsPaneStatusProps) {
	const statusAttributes = {
		[props.kindAttributeName ?? 'data-pane-status-kind']: props.kind,
	}

	return (
		<div
			{...statusAttributes}
			className={`${styles.statusBlock} ${props.kind === 'error' ? styles.statusBlockError : styles.statusBlockMuted}`}
			data-testid={props.testId}
			role={props.kind === 'error' ? 'alert' : undefined}
		>
			<strong className={styles.statusTitle}>{props.title}</strong>
			{props.description ? <span className={styles.statusDescription}>{props.description}</span> : null}
		</div>
	)
}
