// Q2 and Q3 from the user-wallet guideline: is this service an authorized *issuer* of the
// credential it is offering, or an authorized *verifier* of the credential it is requesting,
// in that schema's ecosystem, right now?
//
// The trust resolver answers Q1 only. Its `permissionChain` comes back empty and it exposes no
// schema-scoped endpoint, so these two questions are asked of the VPR directly, which is what
// [UW-CFG-1] anticipates by having the wallet hold rpc/api endpoints alongside the resolver.
// If the resolver later grows a Q2/Q3 route, only `fetchPermissions` has to change.

export type VeranaPermissionType =
  | 'ISSUER'
  | 'VERIFIER'
  | 'ISSUER_GRANTOR'
  | 'VERIFIER_GRANTOR'
  | 'ECOSYSTEM'
  | 'HOLDER'

export type VeranaPermission = {
  id: string
  did: string
  schemaId: string
  type: VeranaPermissionType
  effectiveFrom?: string
  effectiveUntil?: string
  revoked?: string
  slashed?: string
  validationState?: string
}

export type VeranaAccreditation = {
  role: 'ISSUER' | 'VERIFIER'
  granted: boolean
  schemaId?: string
  permissionId?: string
  /** Why it is not granted, for the consent screen. Absent when granted. */
  reason?: string
}

const PERMISSION_TIMEOUT_MS = 10_000

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const PERMISSION_TYPES: VeranaPermissionType[] = [
  'ISSUER',
  'VERIFIER',
  'ISSUER_GRANTOR',
  'VERIFIER_GRANTOR',
  'ECOSYSTEM',
  'HOLDER',
]

const parsePermission = (value: unknown): VeranaPermission | undefined => {
  if (!isRecord(value)) return undefined

  const type = PERMISSION_TYPES.find((candidate) => candidate === value.type)
  const id = asString(value.id)
  const schemaId = asString(value.schema_id)
  if (!type || !id || !schemaId) return undefined

  return {
    id,
    schemaId,
    type,
    did: asString(value.did) ?? '',
    effectiveFrom: asString(value.effective_from),
    effectiveUntil: asString(value.effective_until),
    revoked: asString(value.revoked),
    slashed: asString(value.slashed),
    validationState: asString(value.vp_state),
  }
}

/**
 * A permission only counts while it is live: not revoked, not slashed, not terminated, and
 * inside its effective window. An expired accreditation reads exactly like a valid one in the
 * raw record, so the window is the check that matters most here.
 */
export const isPermissionActive = (permission: VeranaPermission, at: Date = new Date()): boolean => {
  if (permission.revoked || permission.slashed) return false
  if (permission.validationState === 'TERMINATED') return false

  const now = at.getTime()
  if (permission.effectiveFrom) {
    const from = Date.parse(permission.effectiveFrom)
    if (Number.isFinite(from) && from > now) return false
  }
  if (permission.effectiveUntil) {
    const until = Date.parse(permission.effectiveUntil)
    if (Number.isFinite(until) && until <= now) return false
  }
  return true
}

export const findAccreditation = (
  permissions: VeranaPermission[],
  options: { did: string; schemaId: string; role: 'ISSUER' | 'VERIFIER'; at?: Date }
): VeranaAccreditation => {
  const forSchema = permissions.filter(
    (permission) => permission.did === options.did && permission.schemaId === options.schemaId
  )
  const forRole = forSchema.filter((permission) => permission.type === options.role)
  const live = forRole.find((permission) => isPermissionActive(permission, options.at))

  if (live) {
    return { role: options.role, granted: true, schemaId: options.schemaId, permissionId: live.id }
  }

  // Distinguishing "never had one" from "had one, it lapsed" is the difference between a
  // stranger and a former partner, and the consent screen says so.
  const reason = forRole.length
    ? `A ${options.role.toLowerCase()} permission exists for this schema but is no longer in force`
    : `No ${options.role.toLowerCase()} permission for this schema in its ecosystem`

  return { role: options.role, granted: false, schemaId: options.schemaId, reason }
}

export const fetchPermissions = async (
  apiUrl: string,
  options?: { limit?: number }
): Promise<VeranaPermission[] | undefined> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PERMISSION_TIMEOUT_MS)

  try {
    const response = await fetch(
      `${apiUrl.replace(/\/$/, '')}/verana/perm/v1/list?pagination.limit=${options?.limit ?? 500}`,
      { signal: controller.signal }
    )
    if (!response.ok) return undefined

    const body: unknown = await response.json()
    if (!isRecord(body) || !Array.isArray(body.permissions)) return undefined

    return body.permissions
      .map(parsePermission)
      .filter((permission): permission is VeranaPermission => permission !== undefined)
  } catch {
    return undefined
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Undefined means the VPR could not be reached, which is not the same as "not accredited" and
 * must not be rendered as a refusal - [UW-RES-6] applies to Q2/Q3 exactly as it does to Q1.
 */
export const resolveAccreditation = async (
  apiUrl: string,
  options: { did: string; schemaId: string; role: 'ISSUER' | 'VERIFIER' }
): Promise<VeranaAccreditation | undefined> => {
  const permissions = await fetchPermissions(apiUrl)
  if (!permissions) return undefined

  return findAccreditation(permissions, options)
}
