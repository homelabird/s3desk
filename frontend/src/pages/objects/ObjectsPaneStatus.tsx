import styles from '../../components/simpleTree.module.css'

type ObjectsPaneStatusProps = {
	kind: 'prereq' | 'loading' | 'empty' | 'error'
	title: string
	description?: string
	testId?: string
	kindAttributeName?: string
}

export function ObjectsPaneStatus(props: ObjectsPaneStatusProps) {
	const isError = props.kind === 'error'
	const statusAttributes = {
		[props.kindAttributeName ?? 'data-pane-status-kind']: props.kind,
	}

	return (
		<div
			{...statusAttributes}
			aria-atomic={isError ? undefined : 'true'}
			aria-live={isError ? undefined : 'polite'}
			className={`${styles.statusBlock} ${isError ? styles.statusBlockError : styles.statusBlockMuted}`}
			data-testid={props.testId}
			role={isError ? 'alert' : 'status'}
		>
			<strong className={styles.statusTitle}>{props.title}</strong>
			{props.description ? <span className={styles.statusDescription}>{props.description}</span> : null}
		</div>
	)
}
