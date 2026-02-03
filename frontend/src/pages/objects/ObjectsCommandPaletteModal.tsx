import { Empty, Input, Modal, Space, Typography } from 'antd'
import type { KeyboardEvent } from 'react'

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
		<Modal open={props.open} title="Commands" footer={null} onCancel={props.onCancel} destroyOnHidden>
			<Space orientation="vertical" size="small" style={{ width: '100%' }}>
				<Input
					id="objectsCommandPaletteInput"
					autoComplete="off"
					placeholder="Type a command...…"
					value={props.query}
					onChange={(e) => props.onQueryChange(e.target.value)}
					onKeyDown={props.onKeyDown}
					allowClear
				/>

				<div style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'auto', maxHeight: 360 }}>
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
										background: active ? '#e6f4ff' : undefined,
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
		</Modal>
	)
}
