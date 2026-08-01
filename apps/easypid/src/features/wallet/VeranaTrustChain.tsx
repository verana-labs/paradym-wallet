import { HeroIcons, Paragraph, XStack, YStack } from '@package/ui'
import {
  describeVerdict,
  findOrganizationCredential,
  findServiceCredential,
  readEcsOrganization,
  readEcsService,
  stripLinks,
  type VeranaTrustCredential,
  type VeranaTrustDetails,
} from '@paradym/wallet-sdk'

import {
  ConditionRow,
  DidRow,
  IdentityHeading,
  LogoBadge,
  RegistryChip,
  SectionLabel,
  StepTick,
  type StepTone,
  VerdictPill,
} from './VeranaTrustCard'

function ChainStep({
  tone,
  label,
  isLast,
  children,
}: {
  tone: StepTone
  label: string
  isLast?: boolean
  children: React.ReactNode
}) {
  const rail = tone === 'ok' ? '$positive-300' : tone === 'bad' ? '$danger-300' : '$grey-300'
  return (
    <XStack gap="$2.5">
      <YStack ai="center" width={28}>
        <StepTick tone={tone} />
        {!isLast ? <YStack flex={1} width={2} bg={rail} minHeight={16} /> : null}
      </YStack>
      <YStack flex={1} pb={isLast ? '$0' : '$3.5'} gap="$1">
        <SectionLabel>{label}</SectionLabel>
        {children}
      </YStack>
    </XStack>
  )
}

/**
 * A credential can be structurally VALID and still verify nothing: the untrusted demo services
 * issue their ECS credentials to themselves. A green tick there would be a trust signal the
 * resolver never gave, which is exactly what [UW-POT-5] forbids, so the tick follows the
 * resolution and the self-issued claims are withheld rather than shown as facts ([UW-POT-4]).
 */
const selfIssued = (credential: VeranaTrustCredential | undefined, did: string) =>
  Boolean(credential?.issuedBy && credential.issuedBy.split('#')[0] === did)

export type VeranaTrustAsk = {
  kind: 'offer' | 'request'
  /** Undefined while the check is in flight, or when it could not be determined. */
  granted?: boolean
  party: string
  credential: string
  ecosystem?: string
  reason?: string
}

export type VeranaTrustChainProps = {
  did: string
  verdict: VeranaTrustDetails['trustStatus']
  credentials: VeranaTrustCredential[]
  isLoading?: boolean
  ask?: VeranaTrustAsk
}

/** [UW-POT-2]/[UW-POT-3]: the Q2 or Q3 verdict, in words, above the accept action. */
function AskBlock({ ask }: { ask: VeranaTrustAsk }) {
  const verb = ask.kind === 'offer' ? 'authorized issuer' : 'authorized verifier'
  const granted = ask.granted === true
  const tone = ask.granted === undefined ? '$grey-500' : granted ? '$positive-500' : '$danger-500'

  return (
    <YStack
      gap="$2"
      br="$7"
      p="$3.5"
      bw={1.5}
      borderColor={ask.granted === undefined ? '$grey-200' : granted ? '$positive-500' : '$danger-500'}
      bg={ask.granted === undefined ? '$grey-50' : granted ? '$positive-100' : '$danger-100'}
    >
      <SectionLabel>{ask.kind === 'offer' ? 'Offers you' : 'Asks you for'}</SectionLabel>
      <Paragraph fontWeight="800" color="$grey-900">
        {ask.credential}
      </Paragraph>
      <XStack gap="$2" ai="flex-start">
        {ask.granted === undefined ? (
          <HeroIcons.InformationCircle size={18} color="$grey-500" />
        ) : granted ? (
          <HeroIcons.Check size={18} color={tone} />
        ) : (
          <HeroIcons.X size={18} color={tone} />
        )}
        <Paragraph flexShrink={1} color="$grey-800">
          {ask.granted === undefined
            ? (ask.reason ?? 'This could not be checked against the registry.')
            : `${ask.party} is ${granted ? 'an' : 'not an'} ${verb} of ${ask.credential}${
                ask.ecosystem ? ` in ${ask.ecosystem}` : ''
              }`}
        </Paragraph>
      </XStack>
    </YStack>
  )
}

/**
 * The proof-of-trust card as versioned at playground/public/trust-card/index.html: identity chain
 * first, verdict second, conditions third. Shared verbatim by the consent screen and the detail
 * screen so a wallet never shows two different faces of the same evaluation.
 */
export function VeranaTrustChain({ did, verdict, credentials, isLoading, ask }: VeranaTrustChainProps) {
  const serviceCredential = findServiceCredential(credentials)
  const organizationCredential = findOrganizationCredential(credentials)

  const rowTone = (credential: VeranaTrustCredential | undefined): StepTone => {
    if (verdict === 'UNVERIFIED') return 'none'
    if (verdict === 'UNTRUSTED') return 'bad'
    return credential?.result === 'VALID' ? 'ok' : 'bad'
  }
  const serviceTone = rowTone(serviceCredential)
  const organizationTone = rowTone(organizationCredential)

  const service = serviceTone === 'ok' ? readEcsService(serviceCredential) : undefined
  const organization = organizationTone === 'ok' ? readEcsOrganization(organizationCredential) : undefined

  const withheld = (credential: VeranaTrustCredential | undefined, tone: StepTone) =>
    tone === 'none'
      ? 'Not checked.'
      : credential
        ? selfIssued(credential, did)
          ? 'Issued by this service to itself, so nothing independent verifies it.'
          : 'Nothing in the registry vouches for this credential, so its claims are not shown.'
        : undefined
  const description = stripLinks(service?.description)
  const hasConditions = Boolean(service?.terms || service?.privacy || service?.minimumAgeRequired)
  const note =
    verdict === 'UNVERIFIED'
      ? 'The Verana resolver could not be reached. This counterparty is neither trusted nor untrusted.'
      : credentials.length > 0
        ? describeVerdict(verdict, credentials)
        : undefined

  return (
    <YStack gap="$4">
      <DidRow did={did} verdict={verdict} />

      {isLoading ? (
        <Paragraph variant="sub" color="$grey-600">
          Resolving trust credentials…
        </Paragraph>
      ) : null}

      {credentials.length > 0 ? (
        <YStack>
          <ChainStep tone={serviceTone} label="Service">
            {service ? (
              <XStack gap="$3" ai="flex-start">
                <LogoBadge name={service.name} verified={Boolean(service.logo?.digest)} />
                <YStack gap="$1" flex={1}>
                  <IdentityHeading name={service.name} />
                  {description.text ? <Paragraph color="$grey-700">{description.text}</Paragraph> : null}
                  {description.removed > 0 ? (
                    <Paragraph variant="sub" color="$grey-500">
                      {description.removed} link{description.removed > 1 ? 's' : ''} removed from this description
                      before display
                    </Paragraph>
                  ) : null}
                </YStack>
              </XStack>
            ) : (
              <YStack gap="$1">
                <Paragraph color={serviceTone === 'none' ? '$grey-600' : '$danger-500'} fontWeight="600">
                  {serviceCredential ? 'Service claims not verified' : 'No ECS-Service credential presented'}
                </Paragraph>
                {withheld(serviceCredential, serviceTone) ? (
                  <Paragraph variant="sub" color="$grey-500">
                    {withheld(serviceCredential, serviceTone)}
                  </Paragraph>
                ) : null}
              </YStack>
            )}
          </ChainStep>

          <ChainStep tone={organizationTone} label="Operated by" isLast>
            {organization ? (
              <XStack gap="$3" ai="flex-start">
                <LogoBadge name={organization.name} verified={Boolean(organization.logo?.digest)} />
                <YStack gap="$2" flex={1}>
                  <IdentityHeading name={organization.name} countryCode={organization.countryCode} />
                  {organization.address ? <Paragraph color="$grey-700">{organization.address}</Paragraph> : null}
                  <XStack gap="$2" flexWrap="wrap">
                    <RegistryChip label="REG" value={organization.registryId} />
                  </XStack>
                </YStack>
              </XStack>
            ) : (
              <YStack gap="$1">
                <Paragraph color={organizationTone === 'none' ? '$grey-600' : '$danger-500'} fontWeight="600">
                  {organizationCredential
                    ? 'Operator claims not verified'
                    : 'No ECS-Organization credential presented'}
                </Paragraph>
                <Paragraph variant="sub" color="$grey-500">
                  {withheld(organizationCredential, organizationTone) ?? 'Nothing verifies who operates this service'}
                </Paragraph>
              </YStack>
            )}
          </ChainStep>
        </YStack>
      ) : null}

      <VerdictPill verdict={verdict} note={note} />

      {ask ? <AskBlock ask={ask} /> : null}

      {hasConditions ? (
        <YStack gap="$2.5" bg="$grey-100" br="$6" p="$3.5">
          <SectionLabel>Conditions of connecting</SectionLabel>
          {service?.minimumAgeRequired ? (
            <XStack ai="center" gap="$2">
              <Paragraph color="$warning-600" fontWeight="800">
                {service.minimumAgeRequired}+
              </Paragraph>
              <Paragraph color="$grey-700" flexShrink={1}>
                This service requires you to be at least {service.minimumAgeRequired} to connect
              </Paragraph>
            </XStack>
          ) : (
            <XStack ai="center" gap="$2">
              <HeroIcons.InformationCircle size={14} color="$grey-500" />
              <Paragraph color="$grey-700">No age restriction</Paragraph>
            </XStack>
          )}
          <ConditionRow asset={service?.terms} label="Terms & conditions" />
          <ConditionRow asset={service?.privacy} label="Privacy policy" />
        </YStack>
      ) : null}
    </YStack>
  )
}
