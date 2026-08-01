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

// The VPR list endpoints ignore `pagination.*` entirely - an offset silently returns page one -
// and default to 64 records. `response_max_size` is the parameter that actually widens the
// response. Reading the default would make an accredited issuer beyond record 64 look
// unaccredited, so the ceiling is requested explicitly and a full page is treated as truncated
// rather than complete.
const RESPONSE_MAX_SIZE = 1000

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
  // PENDING is an application under review, not a grant - live testnet holds such records.
  if (permission.validationState === 'TERMINATED' || permission.validationState === 'PENDING') return false

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
  const reason = forRole.some((permission) => permission.validationState === 'PENDING')
    ? `A ${options.role.toLowerCase()} permission for this schema is still pending validation`
    : forRole.length
      ? `A ${options.role.toLowerCase()} permission exists for this schema but is no longer in force`
      : `No ${options.role.toLowerCase()} permission for this schema`

  return { role: options.role, granted: false, schemaId: options.schemaId, reason }
}

export type VeranaSchema = {
  /** VPR schema id, the value permissions key off. */
  id: string
  /** Trust registry (ecosystem) id. */
  trustRegistryId?: string
  title?: string
  /** `vpr:verana:<chain>/cs/v1/js/<id>`, the `$id` of the published JSON schema. */
  vprId?: string
}

/**
 * A credential offer names its type with a `vct` (SD-JWT VC) or a schema URI. When that value is
 * the VPR schema `$id`, the schema id is the last path segment and no lookup is needed.
 */
export const schemaIdFromVct = (vct?: string): string | undefined => {
  if (!vct) return undefined
  const match = /\/cs\/v\d+\/js\/(\d+)\b/.exec(vct)
  return match?.[1]
}

export const fetchSchemas = async (apiUrl: string): Promise<VeranaSchema[] | undefined> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PERMISSION_TIMEOUT_MS)

  try {
    const response = await fetch(
      `${apiUrl.replace(/\/$/, '')}/verana/cs/v1/list?response_max_size=${RESPONSE_MAX_SIZE}`,
      { signal: controller.signal }
    )
    if (!response.ok) return undefined

    const body: unknown = await response.json()
    if (!isRecord(body) || !Array.isArray(body.schemas)) return undefined
    if (body.schemas.length >= RESPONSE_MAX_SIZE) return undefined

    return body.schemas.flatMap((entry): VeranaSchema[] => {
      if (!isRecord(entry)) return []
      const id = asString(entry.id)
      if (!id) return []

      let title: string | undefined
      let vprId: string | undefined
      const raw = asString(entry.json_schema)
      if (raw) {
        try {
          const parsed: unknown = JSON.parse(raw)
          if (isRecord(parsed)) {
            title = asString(parsed.title)
            vprId = asString(parsed.$id)
          }
        } catch {
          // a malformed schema still has a usable id; only its title is lost
        }
      }
      return [{ id, trustRegistryId: asString(entry.tr_id), title, vprId }]
    })
  } catch {
    return undefined
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Prefer the `$id`, which is exact. Falling back to the title is a convenience for offers that
 * name their type in prose, and is only trusted when exactly one schema carries that title -
 * `ServiceCredential` alone is registered a dozen times over.
 */
export const findSchemaId = (
  schemas: VeranaSchema[],
  options: { vct?: string; title?: string }
): string | undefined => {
  const direct = schemaIdFromVct(options.vct)
  if (direct) return direct

  if (options.vct) {
    const byVprId = schemas.find((schema) => schema.vprId === options.vct)
    if (byVprId) return byVprId.id
  }

  if (options.title) {
    const byTitle = schemas.filter((schema) => schema.title === options.title)
    if (byTitle.length === 1) return byTitle[0].id
  }

  return undefined
}

export const fetchPermissions = async (
  apiUrl: string,
  options?: { limit?: number }
): Promise<VeranaPermission[] | undefined> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PERMISSION_TIMEOUT_MS)

  try {
    const response = await fetch(
      `${apiUrl.replace(/\/$/, '')}/verana/perm/v1/list?response_max_size=${options?.limit ?? RESPONSE_MAX_SIZE}`,
      { signal: controller.signal }
    )
    if (!response.ok) return undefined

    const body: unknown = await response.json()
    if (!isRecord(body) || !Array.isArray(body.permissions)) return undefined
    if (body.permissions.length >= (options?.limit ?? RESPONSE_MAX_SIZE)) return undefined

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
  options: { did: string; role: 'ISSUER' | 'VERIFIER'; schemaId?: string; vct?: string; title?: string }
): Promise<VeranaAccreditation | undefined> => {
  let schemaId = options.schemaId ?? schemaIdFromVct(options.vct)

  if (!schemaId) {
    const schemas = await fetchSchemas(apiUrl)
    if (!schemas) return undefined
    schemaId = findSchemaId(schemas, { vct: options.vct, title: options.title })
  }

  // Not knowing which schema was offered is not evidence of anything. Titles alone are
  // ambiguous - `ServiceCredential` is registered a dozen times over - so an unresolved schema
  // stays undefined rather than becoming an accusation the wallet cannot support.
  if (!schemaId) return undefined

  const permissions = await fetchPermissions(apiUrl)
  if (!permissions) return undefined

  return findAccreditation(permissions, { did: options.did, schemaId, role: options.role })
}
