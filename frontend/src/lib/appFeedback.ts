import { message } from 'antd'

type MessageContent = Parameters<typeof message.success>[0]
type MessageDuration = Parameters<typeof message.success>[1]
type MessageOpenConfig = Parameters<typeof message.open>[0]
type MessageDestroyKey = Parameters<typeof message.destroy>[0]

export const appFeedback = {
	success(content: MessageContent, duration?: MessageDuration) {
		return duration === undefined ? message.success(content) : message.success(content, duration)
	},
	info(content: MessageContent, duration?: MessageDuration) {
		return duration === undefined ? message.info(content) : message.info(content, duration)
	},
	warning(content: MessageContent, duration?: MessageDuration) {
		return duration === undefined ? message.warning(content) : message.warning(content, duration)
	},
	error(content: MessageContent, duration?: MessageDuration) {
		return duration === undefined ? message.error(content) : message.error(content, duration)
	},
	open(config: MessageOpenConfig) {
		return message.open(config)
	},
	destroy(key?: MessageDestroyKey) {
		return key === undefined ? message.destroy() : message.destroy(key)
	},
}
