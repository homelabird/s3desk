import { PlusOutlined } from '@ant-design/icons'
import { Alert, Button, Input, Space, Typography } from 'antd'
import type { Dispatch, ReactNode, SetStateAction } from 'react'

import { NativeSelect } from '../../../components/NativeSelect'
import styles from '../BucketPolicyModal.module.css'
import type { AzureStoredPolicyRow } from './types'

export function AzurePolicyStructuredEditor(props: {
  useStructuredCards: boolean
  azurePublicAccess: 'private' | 'blob' | 'container'
  azureStoredPolicies: AzureStoredPolicyRow[]
  nextKey: () => string
  setAzurePublicAccess: (value: 'private' | 'blob' | 'container') => void
  setAzureStoredPolicies: Dispatch<SetStateAction<AzureStoredPolicyRow[]>>
}) {
  return (
    <Space orientation="vertical" className={styles.fullWidth} size="middle">
      <Space align="center" wrap className={styles.controlRow}>
        <Typography.Text strong>Public access:</Typography.Text>
        <NativeSelect
          value={props.azurePublicAccess}
          onChange={(value) => props.setAzurePublicAccess(value as 'private' | 'blob' | 'container')}
          ariaLabel="Public access"
          className={styles.publicAccessSelect}
          options={[
            { value: 'private', label: 'private' },
            { value: 'blob', label: 'blob (public read for blobs)' },
            { value: 'container', label: 'container (public read for container + blobs)' },
          ]}
        />
      </Space>

      {props.azureStoredPolicies.length > 5 ? (
        <Alert type="warning" showIcon title="Azure supports at most 5 stored access policies" />
      ) : null}

      {props.azureStoredPolicies.length === 0 ? (
        <Typography.Text type="secondary">No stored access policies</Typography.Text>
      ) : props.useStructuredCards ? (
        <div className={styles.structuredCardList} data-testid="bucket-policy-azure-mobile-policies">
          {props.azureStoredPolicies.map((row, index) => (
            <section key={row.key} className={styles.structuredCard}>
              <div className={styles.structuredCardHeader}>
                <Typography.Text strong>{`Stored access policy ${index + 1}`}</Typography.Text>
                <Button danger size="small" onClick={() => props.setAzureStoredPolicies((prev) => prev.filter((policy) => policy.key !== row.key))}>
                  Remove
                </Button>
              </div>
              <div className={styles.structuredFieldGrid}>
                <Field label="ID">
                  <Input
                    value={row.id}
                    aria-label="ID"
                    onChange={(e) => updatePolicyRow(props, row.key, { id: e.target.value })}
                    placeholder="policy-id…"
                  />
                </Field>
                <Field label="Start">
                  <Input
                    value={row.start}
                    aria-label="Start"
                    onChange={(e) => updatePolicyRow(props, row.key, { start: e.target.value })}
                    placeholder="2024-01-01T00:00:00Z…"
                  />
                </Field>
                <Field label="Expiry">
                  <Input
                    value={row.expiry}
                    aria-label="Expiry"
                    onChange={(e) => updatePolicyRow(props, row.key, { expiry: e.target.value })}
                    placeholder="2024-02-01T00:00:00Z…"
                  />
                </Field>
                <Field label="Permission">
                  <Input
                    value={row.permission}
                    aria-label="Permission"
                    onChange={(e) => updatePolicyRow(props, row.key, { permission: e.target.value })}
                    placeholder="rl…"
                  />
                </Field>
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={`${styles.policyTable} ${styles.azureTable}`}>
            <thead>
              <tr className={styles.headRow}>
                <th className={`${styles.th} ${styles.thId}`}>ID</th>
                <th className={`${styles.th} ${styles.thTime}`}>Start (optional)</th>
                <th className={`${styles.th} ${styles.thTime}`}>Expiry (optional)</th>
                <th className={`${styles.th} ${styles.thPermission}`}>Permission</th>
                <th className={`${styles.th} ${styles.thActions}`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {props.azureStoredPolicies.map((row) => (
                <tr key={row.key}>
                  <td className={styles.td}>
                    <Input value={row.id} aria-label="ID" onChange={(e) => updatePolicyRow(props, row.key, { id: e.target.value })} placeholder="policy-id…" />
                  </td>
                  <td className={styles.td}>
                    <Input value={row.start} aria-label="Start" onChange={(e) => updatePolicyRow(props, row.key, { start: e.target.value })} placeholder="2024-01-01T00:00:00Z…" />
                  </td>
                  <td className={styles.td}>
                    <Input value={row.expiry} aria-label="Expiry" onChange={(e) => updatePolicyRow(props, row.key, { expiry: e.target.value })} placeholder="2024-02-01T00:00:00Z…" />
                  </td>
                  <td className={styles.td}>
                    <Input value={row.permission} aria-label="Permission" onChange={(e) => updatePolicyRow(props, row.key, { permission: e.target.value })} placeholder="rl…" />
                  </td>
                  <td className={styles.td}>
                    <Button danger size="small" onClick={() => props.setAzureStoredPolicies((prev) => prev.filter((policy) => policy.key !== row.key))}>
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Button
        icon={<PlusOutlined />}
        disabled={props.azureStoredPolicies.length >= 5}
        onClick={() =>
          props.setAzureStoredPolicies((prev) => [
            ...prev,
            { key: props.nextKey(), id: '', start: '', expiry: '', permission: '' },
          ])
        }
      >
        Add stored access policy
      </Button>

      <Typography.Text type="secondary">
        Permissions letters: r(read), w(write), d(delete), l(list), a(add), c(create), u(update), p(process)
      </Typography.Text>
    </Space>
  )
}

function Field(props: { label: string; children: ReactNode }) {
  return (
    <div className={styles.structuredField}>
      <Typography.Text type="secondary" className={styles.structuredFieldLabel}>
        {props.label}
      </Typography.Text>
      {props.children}
    </div>
  )
}

function updatePolicyRow(
  props: {
    azureStoredPolicies: AzureStoredPolicyRow[]
    setAzureStoredPolicies: Dispatch<SetStateAction<AzureStoredPolicyRow[]>>
  },
  key: string,
  patch: Partial<AzureStoredPolicyRow>,
) {
  props.setAzureStoredPolicies((prev) => prev.map((policy) => (policy.key === key ? { ...policy, ...patch } : policy)))
}
