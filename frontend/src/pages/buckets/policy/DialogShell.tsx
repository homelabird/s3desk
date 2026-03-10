import type { ReactNode } from 'react'

import { DialogModal } from '../../../components/DialogModal'
import { OverlaySheet } from '../../../components/OverlaySheet'
import styles from '../BucketPolicyModal.module.css'

export function BucketPolicyDialogShell(props: {
  mobile: boolean
  title: string
  onClose: () => void
  footer?: ReactNode
  children: ReactNode
}) {
  const shellContent = (
    <div
      className={props.mobile ? styles.mobileShell : styles.desktopShell}
      data-testid={props.mobile ? 'bucket-policy-mobile-shell' : 'bucket-policy-desktop-shell'}
    >
      {props.children}
    </div>
  )

  if (props.mobile) {
    return (
      <OverlaySheet
        open
        onClose={props.onClose}
        title={props.title}
        placement="right"
        footer={props.footer}
        width="100vw"
      >
        {shellContent}
      </OverlaySheet>
    )
  }

  return (
    <DialogModal
      open
      title={props.title}
      onClose={props.onClose}
      footer={props.footer ?? null}
      width="min(96vw, 920px)"
    >
      {shellContent}
    </DialogModal>
  )
}
