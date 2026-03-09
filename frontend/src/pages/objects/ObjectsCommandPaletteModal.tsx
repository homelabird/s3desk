import { Button, Empty, Input, Space, Typography } from 'antd'
import type { KeyboardEvent } from 'react'

import { DialogModal } from '../../components/DialogModal'
import type { CommandItem } from './objectsActions'

type ObjectsCommandPaletteModalProps = {
	open: boolean
	query: string
	commands: CommandItem[]
	activeIndex: number
	onQueryChange: (value: string) => void
	onActiveIndexChange: (index: number) => void
	onRunCommand: (cmd: CommandItem) => void
	onCancel: () => void
	onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
}

export function ObjectsCommandPaletteModal(props: ObjectsCommandPaletteModalProps) {
	return (
		<DialogModal
			open={props.open}
			title="Commands"
			onClose={props.onCancel}
			width={640}
			footer={
				<Button onClick={props.onCancel}>
					Close
				</Button>
			}
		>
			<Space orientation="vertical" size="small" style={{ width: '100%' }}>
				<Input
					id="objectsCommandPaletteInput"
					autoComplete="off"
					placeholder="Type a command…"
					aria-label="Command search"
					value={props.query}
					onChange={(e) => props.onQueryChange(e.target.value)}
					onKeyDown={props.onKeyDown}
					allowClear
				/>

				<div style={{ border: '1px solid var(--s3d-color-border)', borderRadius: 8, overflow: 'auto', maxHeight: 360 }}>
					{props.commands.length === 0 ? (
						<Empty description="No commands" style={{ padding: 24 }} />
					) : (
						props.commands.map((cmd, idx) => {
							const active = idx === props.activeIndex
							return (
								<div
									key={cmd.id}
									onMouseEnter={() => props.onActiveIndexChange(idx)}
									onClick={() => props.onRunCommand(cmd)}
									style={{
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'space-between',
										gap: 12,
										padding: '8px 12px',
										background: active ? 'var(--s3d-color-primary-light)' : undefined,
										cursor: cmd.enabled ? 'pointer' : 'not-allowed',
										opacity: cmd.enabled ? 1 : 0.45,
									}}
								>
									<Space size="small">
										{cmd.icon}
										<Typography.Text>{cmd.label}</Typography.Text>
									</Space>
								</div>
							)
						})
					)}
				</div>

				<Typography.Text type="secondary">Ctrl+K - up/down - Enter</Typography.Text>
			</Space>
		</DialogModal>
	)
}
