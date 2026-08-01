import type { AgentContext } from '@credo-ts/core'

import { DidsApi, getPublicJwkFromVerificationMethod, JsonEncoder, JwsService } from '@credo-ts/core'

export type SignedIssuerMetadata = {
  /** The DID URL (with fragment) of the key that signed the issuer metadata. */
  didUrl: string
  payload: Record<string, unknown>
}

const WELL_KNOWN_SUFFIX = '/.well-known/openid-credential-issuer'
const METADATA_JWT_TYP = 'openidvci-issuer-metadata+jwt'
const FETCH_TIMEOUT_MS = 10_000

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/**
 * The bundled Credo holder never negotiates the `application/jwt` issuer-metadata variant, so a
 * DID-signed issuer is indistinguishable from an unsigned one and the wallet can never
 * trust-resolve an OID4VCI counterparty. Fetch the signed variant directly and verify it with the
 * agent's own JWS machinery before believing anything in it - `undefined` on any failure, never an
 * unverified assertion.
 */
export const resolveSignedIssuerMetadata = async (
  agentContext: AgentContext,
  credentialIssuer: string
): Promise<SignedIssuerMetadata | undefined> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  const logger = agentContext.config.logger

  try {
    const response = await fetch(`${credentialIssuer.replace(/\/$/, '')}${WELL_KNOWN_SUFFIX}`, {
      headers: { accept: 'application/jwt' },
      signal: controller.signal,
    })
    logger.debug(
      `[verana] signed issuer metadata fetch: ${response.status} ${response.headers.get('content-type')}`
    )
    if (!response.ok || !response.headers.get('content-type')?.includes('application/jwt')) return undefined

    const jws = (await response.text()).trim()
    const parts = jws.split('.')
    if (parts.length !== 3) return undefined

    const header: unknown = JsonEncoder.fromBase64(parts[0])
    if (
      !isRecord(header) ||
      header.typ !== METADATA_JWT_TYP ||
      typeof header.kid !== 'string' ||
      !header.kid.startsWith('did:')
    ) {
      return undefined
    }

    const payload: unknown = JsonEncoder.fromBase64(parts[1])
    if (!isRecord(payload) || payload.sub !== credentialIssuer) return undefined

    const didsApi = agentContext.dependencyManager.resolve(DidsApi)
    const didDocument = await didsApi.resolveDidDocument(header.kid)
    const verificationMethod = didDocument.dereferenceKey(header.kid, ['authentication'])
    const publicJwk = getPublicJwkFromVerificationMethod(verificationMethod)

    const jwsService = agentContext.dependencyManager.resolve(JwsService)
    const { isValid } = await jwsService.verifyJws(agentContext, {
      jws,
      jwsSigner: { method: 'did', didUrl: header.kid, jwk: publicJwk },
    })
    logger.debug(`[verana] signed issuer metadata verify: ${isValid} (kid ${header.kid})`)
    if (!isValid) return undefined

    return { didUrl: header.kid, payload }
  } catch (error) {
    logger.debug(`[verana] signed issuer metadata failed: ${String(error)}`)
    return undefined
  } finally {
    clearTimeout(timeout)
  }
}
