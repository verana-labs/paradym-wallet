import type { OpenId4VciResolvedCredentialOffer, OpenId4VpResolvedAuthorizationRequest } from '@credo-ts/openid4vc'
import type {
  TrustedEntity,
  TrustedIssuerEntity,
  TrustedRelyingPartyEntity,
  VeranaTrustCredential,
  VeranaTrustDetails,
  VeranaTrustMechanismConfiguration,
} from '../trustMechanism'

export type VeranaTrustResolution = {
  did: string
  trustStatus: 'TRUSTED' | 'PARTIAL' | 'UNTRUSTED'
  production: boolean
  evaluatedAt?: string
  evaluatedAtBlock?: number
  expiresAt?: string
  credentials?: VeranaTrustCredential[]
}

const VERANA_TIMEOUT_MS = 10_000

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const isTrustStatus = (value: unknown): value is VeranaTrustResolution['trustStatus'] =>
  value === 'TRUSTED' || value === 'PARTIAL' || value === 'UNTRUSTED'

const parseCredential = (value: unknown): VeranaTrustCredential | undefined => {
  if (!isRecord(value)) return undefined

  return {
    ecsType: typeof value.ecsType === 'string' ? value.ecsType : undefined,
    result: typeof value.result === 'string' ? value.result : undefined,
    format: typeof value.format === 'string' ? value.format : undefined,
    issuedBy: typeof value.issuedBy === 'string' ? value.issuedBy : undefined,
    claims: isRecord(value.claims) ? value.claims : undefined,
  }
}

const parseResolution = (value: unknown, requestedDid: string): VeranaTrustResolution | undefined => {
  if (
    !isRecord(value) ||
    value.did !== requestedDid ||
    !isTrustStatus(value.trustStatus) ||
    typeof value.production !== 'boolean'
  ) {
    return undefined
  }

  return {
    did: value.did,
    trustStatus: value.trustStatus,
    production: value.production,
    evaluatedAt: typeof value.evaluatedAt === 'string' ? value.evaluatedAt : undefined,
    evaluatedAtBlock: typeof value.evaluatedAtBlock === 'number' ? value.evaluatedAtBlock : undefined,
    expiresAt: typeof value.expiresAt === 'string' ? value.expiresAt : undefined,
    credentials: Array.isArray(value.credentials)
      ? value.credentials
          .map(parseCredential)
          .filter((credential): credential is VeranaTrustCredential => credential !== undefined)
      : undefined,
  }
}

const fetchResolution = async (
  resolverUrl: string,
  did: string,
  detail: 'summary' | 'full'
): Promise<VeranaTrustResolution | undefined> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), VERANA_TIMEOUT_MS)

  try {
    const response = await fetch(
      `${resolverUrl.replace(/\/$/, '')}/v1/trust/resolve?did=${encodeURIComponent(did)}&detail=${detail}`,
      { signal: controller.signal }
    )
    if (!response.ok) return undefined

    return parseResolution(await response.json(), did)
  } catch {
    return undefined
  } finally {
    clearTimeout(timeout)
  }
}

export type GetTrustedEntitiesForVeranaForOpenId4VpOptions = {
  resolvedAuthorizationRequest: OpenId4VpResolvedAuthorizationRequest
  trustMechanismConfiguration: VeranaTrustMechanismConfiguration
  walletTrustedEntity?: TrustedEntity
}

export type GetTrustedEntitiesForVeranaForOpenId4VciOptions = {
  resolvedCredentialOffer: OpenId4VciResolvedCredentialOffer
  trustMechanismConfiguration: VeranaTrustMechanismConfiguration
  walletTrustedEntity?: TrustedEntity
}

// Fast trust decision on detail=summary (a cached DB lookup). A resolution is returned whatever
// its verdict: [UW-POT-6] requires UNTRUSTED to be shown and never softened, so discarding it here
// and falling through to the next trust mechanism would surface "unknown organization" for a peer
// the registry explicitly does not vouch for. Only an unreachable or malformed resolver yields
// undefined, which the caller renders as UNVERIFIED per [UW-RES-6]. The richer detail=full
// evaluation is fetched lazily by the detail screen, off the critical path.
export const resolveVeranaTrust = async (
  resolverUrl: string,
  did: string
): Promise<VeranaTrustResolution | undefined> => fetchResolution(resolverUrl, did, 'summary')

export const fetchVeranaTrustDetails = async (
  resolverUrl: string,
  did: string
): Promise<VeranaTrustDetails | undefined> => {
  // Unlike resolveVeranaTrust, which must stay TRUSTED-only so a half-verified peer is
  // never claimed as trusted on the consent screen, the detail screen has to render
  // PARTIAL and UNTRUSTED: the failures are the content.
  const resolution = await fetchResolution(resolverUrl, did, 'full')
  if (!resolution) return undefined

  return {
    ...resolution,
    resolverUrl,
    credentials: resolution.credentials ?? [],
  }
}

const getRegistryTrustedEntity = (
  configuration: VeranaTrustMechanismConfiguration,
  resolution: VeranaTrustResolution
): TrustedEntity => ({
  entityId: `verana:${resolution.did}`,
  organizationName: configuration.registryDisplay?.organizationName ?? 'Verana Trust Registry',
  logoUri: configuration.registryDisplay?.logoUri,
  uri: configuration.registryDisplay?.uri ?? 'https://verana.io',
  demo: !resolution.production,
  veranaDetails: {
    did: resolution.did,
    trustStatus: resolution.trustStatus,
    production: resolution.production,
    evaluatedAtBlock: resolution.evaluatedAtBlock,
    expiresAt: resolution.expiresAt,
    resolverUrl: configuration.resolverUrl,
    credentials: [],
  },
})

export const getTrustedEntitiesForVeranaForOpenId4Vp = async (
  options: GetTrustedEntitiesForVeranaForOpenId4VpOptions
): Promise<TrustedRelyingPartyEntity | undefined> => {
  const effectiveClientId = options.resolvedAuthorizationRequest.verifier.effectiveClientId
  if (!effectiveClientId?.startsWith('decentralized_identifier:')) return undefined

  const did = effectiveClientId.replace('decentralized_identifier:', '').split('#')[0]
  const resolution = await resolveVeranaTrust(options.trustMechanismConfiguration.resolverUrl, did)
  if (!resolution) return undefined

  const clientMetadata = options.resolvedAuthorizationRequest.authorizationRequestPayload.client_metadata
  const trustedEntities: TrustedEntity[] = [getRegistryTrustedEntity(options.trustMechanismConfiguration, resolution)]
  if (options.walletTrustedEntity) trustedEntities.push(options.walletTrustedEntity)

  return {
    relyingParty: {
      organizationName: clientMetadata?.client_name ?? did,
      logoUri: clientMetadata?.logo_uri,
      entityId: did,
    },
    trustedEntities,
  }
}

export const getTrustedEntitiesForVeranaForOpenId4Vci = async (
  options: GetTrustedEntitiesForVeranaForOpenId4VciOptions
): Promise<TrustedIssuerEntity | undefined> => {
  const signer = options.resolvedCredentialOffer.metadata.signedCredentialIssuer?.signer
  if (signer?.method !== 'did' || !signer.didUrl) return undefined

  const baseDid = signer.didUrl.split('#')[0]
  const resolution = await resolveVeranaTrust(options.trustMechanismConfiguration.resolverUrl, baseDid)
  if (!resolution) return undefined

  const metadataDisplay = options.resolvedCredentialOffer.metadata.signedCredentialIssuer?.jwt.payload.display?.[0]
  const organizationName = metadataDisplay?.name ?? baseDid
  const logoUri = metadataDisplay?.logo?.uri

  const trustedEntities: TrustedEntity[] = [getRegistryTrustedEntity(options.trustMechanismConfiguration, resolution)]
  if (options.walletTrustedEntity) trustedEntities.push(options.walletTrustedEntity)

  return {
    issuer: {
      organizationName,
      logoUri,
      entityId: baseDid,
    },
    trustedEntities,
  }
}
