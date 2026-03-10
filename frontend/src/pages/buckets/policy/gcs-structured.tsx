import { PlusOutlined } from '@ant-design/icons'
import { Alert, Button, Input, Space, Typography } from 'antd'
import type { Dispatch, SetStateAction } from 'react'

import styles from '../BucketPolicyModal.module.css'
import type { GcsBindingRow } from './types'

export function GcsPolicyStructuredEditor(props: {
  useStructuredCards: boolean
  gcsPublicRead: boolean
  gcsEtag: string
  gcsBindings: GcsBindingRow[]
  nextKey: () => string
  setGcsBindings: Dispatch<SetStateAction<GcsBindingRow[]>>
}) {
  return (
    <Space orientation="vertical" className={styles.fullWidth} size="middle">
      <Space align="center" wrap className={styles.controlRow}>
        <input
          type="checkbox"
          checked={props.gcsPublicRead}
          aria-label="Public read access"
          onChange={(event) => {
            const checked = event.target.checked
            props.setGcsBindings((prev) => {
              const next = prev.map((b) => ({ ...b, members: [...b.members] }))
              const role = 'roles/storage.objectViewer'
              if (checked) {
                const idx = next.findIndex((b) => b.role === role)
                if (idx === -1) {
                  next.push({ key: props.nextKey(), role, members: ['allUsers'] })
                } else if (!next[idx].members.includes('allUsers')) {
                  next[idx].members.push('allUsers')
                }
              } else {
                for (const binding of next) {
                  binding.members = binding.members.filter((member) => member !== 'allUsers')
                }
                return next.filter((binding) => binding.members.length > 0 || binding.role.trim() !== '')
              }
              return next
            })
          }}
        />
        <Typography.Text>
          Public read access (adds <Typography.Text code>allUsers</Typography.Text> to{' '}
          <Typography.Text code>roles/storage.objectViewer</Typography.Text>)
        </Typography.Text>
      </Space>

      {props.gcsEtag.trim() === '' ? (
        <Alert
          type="warning"
          showIcon
          title="etag missing"
          description="GCS IAM policy updates are safest when preserving etag. Reload policy before saving if you hit conflicts."
        />
      ) : (
        <Alert
          type="info"
          showIcon
          title="etag preserved"
          description={
            <Space orientation="vertical" size={4} className={styles.fullWidth}>
              <Typography.Text type="secondary">This value will be sent back on save.</Typography.Text>
              <Typography.Text code>{props.gcsEtag}</Typography.Text>
            </Space>
          }
        />
      )}

      {props.gcsBindings.length === 0 ? (
        <Typography.Text type="secondary">No bindings</Typography.Text>
      ) : props.useStructuredCards ? (
        <div className={styles.structuredCardList} data-testid="bucket-policy-gcs-mobile-bindings">
          {props.gcsBindings.map((row, index) => (
            <section key={row.key} className={styles.structuredCard}>
              <div className={styles.structuredCardHeader}>
                <Typography.Text strong>{`Binding ${index + 1}`}</Typography.Text>
                <Button danger size="small" onClick={() => props.setGcsBindings((prev) => prev.filter((binding) => binding.key !== row.key))}>
                  Remove
                </Button>
              </div>
              <div className={styles.structuredField}>
                <Typography.Text type="secondary" className={styles.structuredFieldLabel}>Role</Typography.Text>
                <Input
                  value={row.role}
                  aria-label="Role"
                  onChange={(e) => {
                    const value = e.target.value
                    props.setGcsBindings((prev) => prev.map((binding) => (binding.key === row.key ? { ...binding, role: value } : binding)))
                  }}
                  placeholder="roles/storage.objectViewer…"
                />
              </div>
              <div className={styles.structuredField}>
                <Typography.Text type="secondary" className={styles.structuredFieldLabel}>Members</Typography.Text>
                <Input.TextArea
                  value={row.members.join('\n')}
                  aria-label="Members"
                  onChange={(e) => {
                    const uniq = new Set(
                      e.target.value
                        .split(/[\n,]+/)
                        .map((value) => value.trim())
                        .filter(Boolean),
                    )
                    props.setGcsBindings((prev) => prev.map((binding) => (binding.key === row.key ? { ...binding, members: Array.from(uniq) } : binding)))
                  }}
                  autoSize={{ minRows: 3, maxRows: 8 }}
                  className={styles.membersInput}
                  placeholder="One per line (e.g. allUsers, user:alice@example.com)…"
                />
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={`${styles.policyTable} ${styles.gcsTable}`}>
            <thead>
              <tr className={styles.headRow}>
                <th className={`${styles.th} ${styles.thRole}`}>Role</th>
                <th className={styles.th}>Members</th>
                <th className={`${styles.th} ${styles.thActions}`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {props.gcsBindings.map((row) => (
                <tr key={row.key}>
                  <td className={styles.td}>
                    <Input
                      value={row.role}
                      aria-label="Role"
                      onChange={(e) => {
                        const value = e.target.value
                        props.setGcsBindings((prev) => prev.map((binding) => (binding.key === row.key ? { ...binding, role: value } : binding)))
                      }}
                      placeholder="roles/storage.objectViewer…"
                    />
                  </td>
                  <td className={styles.td}>
                    <Input.TextArea
                      value={row.members.join('\n')}
                      aria-label="Members"
                      onChange={(e) => {
                        const uniq = new Set(
                          e.target.value
                            .split(/[\n,]+/)
                            .map((value) => value.trim())
                            .filter(Boolean),
                        )
                        props.setGcsBindings((prev) => prev.map((binding) => (binding.key === row.key ? { ...binding, members: Array.from(uniq) } : binding)))
                      }}
                      autoSize={{ minRows: 2, maxRows: 6 }}
                      className={styles.membersInput}
                      placeholder="One per line (e.g. allUsers, user:alice@example.com)…"
                    />
                  </td>
                  <td className={styles.td}>
                    <Button danger size="small" onClick={() => props.setGcsBindings((prev) => prev.filter((binding) => binding.key !== row.key))}>
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Button icon={<PlusOutlined />} onClick={() => props.setGcsBindings((prev) => [...prev, { key: props.nextKey(), role: '', members: [] }])}>
        Add binding
      </Button>
    </Space>
  )
}
