export type ParsedPolicy =
  | { ok: true; error: null; value: Record<string, unknown> }
  | { ok: false; error: string; value: null }

export type GcsBindingRow = { key: string; role: string; members: string[] }

export type AzureStoredPolicyRow = {
  key: string
  id: string
  start?: string
  expiry?: string
  permission?: string
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const parsePolicyText = (rawText: string): ParsedPolicy => {
  const raw = rawText.trim()
  if (raw === '') {
    return { ok: false, error: 'Policy is empty', value: null }
  }
  try {
    const value = JSON.parse(raw) as unknown
    if (!isRecord(value)) {
      return { ok: false, error: 'Policy must be a JSON object', value: null }
    }
    return { ok: true, error: null, value }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      value: null,
    }
  }
}
