import type { X509Certificate } from '@credo-ts/core'
import type { OpenId4VciResolvedCredentialOffer, OpenId4VpResolvedAuthorizationRequest } from '@credo-ts/openid4vc'
import { getCredentialDisplayForOffer } from '../openid4vc/func/getCredentialDisplayForOffer'
import type { ParadymWalletSdk } from '../ParadymWalletSdk'
import type { Optionalize } from '../types'
import {
  type GetTrustedEntitiesForDidForOpenId4VpOptions,
  getTrustedEntitiesForDidForOpenId4Vci,
  getTrustedEntitiesForDidForOpenId4Vp,
  type TrustedDidEntity,
} from './handlers/did'
import {
  type GetTrustedEntitiesForEudiRpAuthenticationForOpenId4VpOptions,
  getTrustedEntitiesForEudiRpAuthenticationForOpenId4Vp,
  type TrustList,
} from './handlers/eudiRpAuthentication'
import {
  type GetTrustedEntitiesForFallbackForOpenId4VciOptions,
  type GetTrustedEntitiesForFallbackForOpenId4VpOptions,
  getTrustedEntitiesForFallbackForOpenId4Vci,
  getTrustedEntitiesForFallbackForOpenId4Vp,
  type TrustedOpenId4VciEntity,
} from './handlers/fallback'
import { getTrustedEntitiesForVeranaForOpenId4Vci, getTrustedEntitiesForVeranaForOpenId4Vp } from './handlers/verana'
import { resolveSignedIssuerMetadata } from './signedIssuerMetadata'
import {
  type GetTrustedEntitiesForX509CertificateForOpenId4VpOptions,
  getTrustedEntitiesForX509CertificateForOpenId4Vci,
  getTrustedEntitiesForX509CertificateForOpenId4Vp,
  type TrustedX509Entity,
} from './handlers/x509'

export type VeranaTrustCredential = {
  ecsType?: string
  result?: string
  format?: string
  issuedBy?: string
  claims?: Record<string, unknown>
}

export type VeranaTrustDetails = {
  did: string
  /** UNVERIFIED is wallet-local: the peer identifies by DID but the resolver could not be reached. */
  trustStatus: 'TRUSTED' | 'PARTIAL' | 'UNTRUSTED' | 'UNVERIFIED'
  production: boolean
  evaluatedAtBlock?: number
  expiresAt?: string
  /** Resolver base URL, so the detail screen can lazily fetch the full evaluation (credentials, ecosystem). */
  resolverUrl: string
  /** VPR REST base URL. The resolver answers Q1 only; issuer and verifier permissions live here. */
  apiUrl?: string
  credentials: VeranaTrustCredential[]
}

export type TrustedEntity = {
  entityId: string
  organizationName: string
  logoUri?: string
  uri?: string
  demo?: boolean
  /** Full Verana trust evaluation, present when the entity was resolved via the Verana registry. */
  veranaDetails?: VeranaTrustDetails
}

export type TrustedIssuerEntity = {
  issuer: TrustedEntity
  trustedEntities: TrustedEntity[]
}

export type TrustedRelyingPartyEntity = {
  relyingParty: Optionalize<TrustedEntity, 'organizationName' | 'entityId'>
  trustedEntities: TrustedEntity[]
}

export type TrustMechanism = 'eudi_rp_authentication' | 'x509' | 'did' | 'none'

export type EudiRpAuthenticationTrustMechanismConfiguration = {
  trustMechanism: 'eudi_rp_authentication'
  trustList: TrustList
  trustedX509Entities: TrustedX509Entity[]
}

export type X509TrustMechanismConfiguration = {
  trustMechanism: 'x509'
  trustedX509Entities: TrustedX509Entity[]
}

export type DidTrustMechanismConfiguration = {
  trustMechanism: 'did'
  trustedDidEntities: TrustedDidEntity[]
}

export type VeranaTrustMechanismConfiguration = {
  trustMechanism: 'verana'
  resolverUrl: string
  /** VPR REST base URL, required to answer Q2/Q3. Without it the wallet resolves Q1 only. */
  apiUrl?: string
  registryDisplay?: {
    organizationName?: string
    logoUri?: string
    uri?: string
  }
}

export type FallbackMechanismConfiguration = {
  trustMechanism: 'none'
  trustedEntities: TrustedOpenId4VciEntity[]
}

export type TrustMechanismConfiguration =
  | EudiRpAuthenticationTrustMechanismConfiguration
  | X509TrustMechanismConfiguration
  | DidTrustMechanismConfiguration
  | VeranaTrustMechanismConfiguration
  | FallbackMechanismConfiguration
  | { walletTrustedEntity?: TrustedEntity }

const findVeranaConfiguration = (trustMechanisms: TrustMechanismConfiguration[]) =>
  trustMechanisms.find(
    (tm): tm is VeranaTrustMechanismConfiguration => 'trustMechanism' in tm && tm.trustMechanism === 'verana'
  )

export type AuthorizationRequestVerificationResult = {
  isValidButUntrusted: boolean
  isValidAndTrusted: boolean
  x509RegistrationCertificate: X509Certificate
}[]

export type GetTrustedEntitiesForOpenId4VpOptions = Omit<
  { paradym: ParadymWalletSdk } & GetTrustedEntitiesForEudiRpAuthenticationForOpenId4VpOptions &
    GetTrustedEntitiesForDidForOpenId4VpOptions &
    GetTrustedEntitiesForX509CertificateForOpenId4VpOptions &
    GetTrustedEntitiesForFallbackForOpenId4VpOptions,
  'trustMechanismConfiguration'
>

export type GetTrustedEntitiesForOpenId4VciOptions = Omit<
  { paradym: ParadymWalletSdk } & GetTrustedEntitiesForDidForOpenId4VpOptions &
    GetTrustedEntitiesForX509CertificateForOpenId4VpOptions &
    GetTrustedEntitiesForFallbackForOpenId4VciOptions,
  'trustMechanismConfiguration'
>

export const detectTrustMechanismForAuthorizationRequest = (options: {
  resolvedAuthorizationRequest: OpenId4VpResolvedAuthorizationRequest
  authorizationRequestVerificationResult?: AuthorizationRequestVerificationResult
}): TrustMechanism => {
  if (options.authorizationRequestVerificationResult && options.authorizationRequestVerificationResult.length > 0) {
    return 'eudi_rp_authentication'
  }

  if (options.resolvedAuthorizationRequest.signedAuthorizationRequest?.signer.method === 'x5c') {
    return 'x509'
  }

  if (options.resolvedAuthorizationRequest.verifier.clientIdPrefix === 'decentralized_identifier') {
    return 'did'
  }

  if (
    options.resolvedAuthorizationRequest.verifier.clientIdPrefix === 'origin' ||
    options.resolvedAuthorizationRequest.verifier.clientIdPrefix === 'redirect_uri'
  ) {
    return 'none'
  }

  throw new Error('Could not infer trust mechanism for authorization request')
}

export const detectTrustMechanismForCredentialOffer = (options: {
  resolvedCredentialOffer: OpenId4VciResolvedCredentialOffer
}): TrustMechanism => {
  const signer = options.resolvedCredentialOffer.metadata.signedCredentialIssuer?.signer
  if (signer?.method === 'x5c' && signer.x5c) {
    return 'x509'
  }

  if (signer?.method === 'did' && signer.didUrl) {
    return 'did'
  }

  return 'none'
}

export const getTrustedEntitiesForOpenId4Vp = async (
  options: GetTrustedEntitiesForOpenId4VpOptions
): Promise<{
  trustMechanism: TrustMechanism
  relyingParty: TrustedRelyingPartyEntity['relyingParty']
  trustedEntities: Array<TrustedEntity>
}> => {
  const trustMechanism = detectTrustMechanismForAuthorizationRequest(options)
  const walletTrustedEntity = options.paradym.trustMechanisms.find(
    (tm): tm is { walletTrustedEntity?: TrustedEntity } => 'walletTrustedEntity' in tm
  )?.walletTrustedEntity
  const trustMechanismConfiguration = options.paradym.trustMechanisms.find(
    (tm) => 'trustMechanism' in tm && tm.trustMechanism === trustMechanism
  )

  // TODO(sdk): what do we want to do when a trust mechanism is used, but not configured? Ignore or error?
  if (!trustMechanismConfiguration) {
    throw new Error(`Found '${trustMechanism}', but without any configuration`)
  }

  let trustedEntity: TrustedRelyingPartyEntity
  switch (trustMechanism) {
    case 'eudi_rp_authentication':
      trustedEntity = await getTrustedEntitiesForEudiRpAuthenticationForOpenId4Vp({
        ...options,
        walletTrustedEntity,
        trustMechanismConfiguration: trustMechanismConfiguration as EudiRpAuthenticationTrustMechanismConfiguration,
      })
      break
    case 'x509':
      trustedEntity = await getTrustedEntitiesForX509CertificateForOpenId4Vp({
        ...options,
        walletTrustedEntity,
        trustMechanismConfiguration: trustMechanismConfiguration as X509TrustMechanismConfiguration,
      })
      break
    case 'did': {
      const veranaConfiguration = findVeranaConfiguration(options.paradym.trustMechanisms)
      trustedEntity =
        (veranaConfiguration
          ? await getTrustedEntitiesForVeranaForOpenId4Vp({
              ...options,
              walletTrustedEntity,
              trustMechanismConfiguration: veranaConfiguration,
            })
          : undefined) ??
        (await getTrustedEntitiesForDidForOpenId4Vp({
          ...options,
          walletTrustedEntity,
          trustMechanismConfiguration: trustMechanismConfiguration as DidTrustMechanismConfiguration,
        }))
      break
    }
    case 'none':
      trustedEntity = await getTrustedEntitiesForFallbackForOpenId4Vp({ ...options, walletTrustedEntity })
      break
    default:
      throw new Error(`Could not handle trust mechanism: '${trustMechanism}'`)
  }

  const entityId = trustedEntity.relyingParty.entityId
  if (!entityId) {
    throw new Error('Missing required client_id in authorization request')
  }

  return {
    ...trustedEntity,
    trustMechanism,
    relyingParty: {
      ...trustedEntity.relyingParty,
      entityId,
    },
  }
}

export const getTrustedEntitiesForOpenId4Vci = async (options: {
  paradym: ParadymWalletSdk
  resolvedCredentialOffer: OpenId4VciResolvedCredentialOffer
  walletTrustedEntity?: TrustedEntity
}): Promise<{
  trustMechanism: TrustMechanism
  issuer: TrustedIssuerEntity['issuer']
  trustedEntities: Array<TrustedEntity>
}> => {
  // The bundled Credo holder drops the signed issuer-metadata variant entirely, so a DID-signed
  // issuer would be detected as 'none'. Fetch and verify it ourselves before detection.
  const signedIssuerMetadata = options.resolvedCredentialOffer.metadata.signedCredentialIssuer
    ? undefined
    : await resolveSignedIssuerMetadata(
        options.paradym.agent.context,
        options.resolvedCredentialOffer.metadata.credentialIssuer.credential_issuer
      )
  const trustMechanism = signedIssuerMetadata
    ? 'did'
    : detectTrustMechanismForCredentialOffer({
        resolvedCredentialOffer: options.resolvedCredentialOffer,
      })
  const walletTrustedEntity = options.paradym.trustMechanisms.find(
    (tm): tm is { walletTrustedEntity?: TrustedEntity } => 'walletTrustedEntity' in tm
  )?.walletTrustedEntity
  const trustMechanismConfiguration = options.paradym.trustMechanisms.find(
    (tm) => 'trustMechanism' in tm && tm.trustMechanism === trustMechanism
  )

  // TODO(sdk): what do we want to do when a trust mechanism is used, but not configured? Ignore or error?
  if (!trustMechanismConfiguration) {
    throw new Error(`Found '${trustMechanism}', but without any configuration`)
  }

  let trustedEntity: TrustedIssuerEntity | undefined
  switch (trustMechanism) {
    case 'x509':
      trustedEntity =
        (await getTrustedEntitiesForX509CertificateForOpenId4Vci({
          ...options,
          walletTrustedEntity,
          trustMechanismConfiguration: trustMechanismConfiguration as X509TrustMechanismConfiguration,
        })) ??
        (await getTrustedEntitiesForFallbackForOpenId4Vci({
          ...options,
          walletTrustedEntity,
          trustMechanismConfiguration: trustMechanismConfiguration as FallbackMechanismConfiguration,
        }))
      break
    case 'did': {
      const veranaConfiguration = findVeranaConfiguration(options.paradym.trustMechanisms)
      trustedEntity =
        (veranaConfiguration
          ? await getTrustedEntitiesForVeranaForOpenId4Vci({
              ...options,
              signedIssuerMetadata,
              walletTrustedEntity,
              trustMechanismConfiguration: veranaConfiguration,
            })
          : undefined) ??
        getTrustedEntitiesForDidForOpenId4Vci({
          ...options,
          walletTrustedEntity,
          trustMechanismConfiguration: trustMechanismConfiguration as DidTrustMechanismConfiguration,
        }) ??
        (await getTrustedEntitiesForFallbackForOpenId4Vci({
          ...options,
          walletTrustedEntity,
          trustMechanismConfiguration: trustMechanismConfiguration as FallbackMechanismConfiguration,
        }))
      break
    }
    case 'none':
      trustedEntity = await getTrustedEntitiesForFallbackForOpenId4Vci({
        ...options,
        walletTrustedEntity,
        trustMechanismConfiguration: trustMechanismConfiguration as FallbackMechanismConfiguration,
      })
      break
    default:
      throw new Error(`Could not handle trust mechanism: '${trustMechanism}'`)
  }

  const entityId =
    trustedEntity?.issuer.entityId ?? options.resolvedCredentialOffer.metadata.credentialIssuer.credential_issuer

  const display = getCredentialDisplayForOffer(options.resolvedCredentialOffer)

  return {
    trustedEntities: trustedEntity?.trustedEntities ?? [],
    trustMechanism,
    issuer: trustedEntity?.issuer
      ? { ...trustedEntity.issuer, entityId }
      : {
          organizationName: display.name,
          logoUri: display.issuer.logo?.url,
          entityId,
        },
  }
}
