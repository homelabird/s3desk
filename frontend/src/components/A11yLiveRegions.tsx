import { A11Y_ALERT_ID, A11Y_STATUS_ID } from '../lib/a11yAnnounce'

export function A11yLiveRegions() {
	return (
		<>
			<div id={A11Y_STATUS_ID} className="sr-only" aria-live="polite" aria-atomic="true" />
			<div id={A11Y_ALERT_ID} className="sr-only" aria-live="assertive" aria-atomic="true" />
		</>
	)
}

