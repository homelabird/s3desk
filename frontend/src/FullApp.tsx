import { ConfigProvider } from 'antd'
import 'antd/dist/reset.css'

import { AntdToastAnnouncer } from './components/AntdToastAnnouncer'
import FullAppInner from './FullAppInner'

export default function FullApp() {
	return (
		<ConfigProvider getPopupContainer={() => document.body}>
			<AntdToastAnnouncer />
			<FullAppInner />
		</ConfigProvider>
	)
}

