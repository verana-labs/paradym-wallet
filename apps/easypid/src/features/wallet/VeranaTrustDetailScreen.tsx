import { TextBackButton, useScrollViewPosition } from '@package/app'
import {
  FlexPage,
  HeaderContainer,
  Heading,
  HeroIcons,
  Paragraph,
  ScrollView,
  type ScrollViewRefType,
  XStack,
  YStack,
} from '@package/ui'
import {
  deriveVerdict,
  describeVerdict,
  fetchVeranaTrustDetails,
  findOrganizationCredential,
  findServiceCredential,
  readEcsOrganization,
  readEcsService,
  stripLinks,
  type VeranaTrustCredential,
  type VeranaTrustDetails,
} from '@paradym/wallet-sdk'
import { useEffect, useRef, useState } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  ConditionRow,
  ExplorerLink,
  DidRow,
  IdentityHeading,
  LogoBadge,
  RegistryChip,
  SectionLabel,
  StepTick,
  VerdictPill,
} from './VeranaTrustCard'

export type VeranaTrustDetailScreenProps = {
  details: VeranaTrustDetails
  name?: string
}

function ChainStep({
  ok,
  label,
  isLast,
  children,
}: {
  ok: boolean
  label: string
  isLast?: boolean
  children: React.ReactNode
}) {
  return (
    <XStack gap="$3">
      <YStack ai="center" width={28}>
        <StepTick ok={ok} />
        {!isLast ? <YStack flex={1} width={2} bg={ok ? '$positive-300' : '$grey-300'} minHeight={16} /> : null}
      </YStack>
      <YStack flex={1} pb={isLast ? '$0' : '$4'} gap="$1">
        <SectionLabel>{label}</SectionLabel>
        {children}
      </YStack>
    </XStack>
  )
}

function ClaimRow({ name, value }: { name: string; value?: string | number }) {
  if (value === undefined || value === '') return null
  return (
    <XStack gap="$3" ai="flex-start">
      <Paragraph variant="sub" color="$primary-600" width={132} flexShrink={0}>
        {name}
      </Paragraph>
      <Paragraph variant="sub" color="$grey-700" flexShrink={1}>
        {String(value)}
      </Paragraph>
    </XStack>
  )
}

export function VeranaTrustDetailScreen({ details, name }: VeranaTrustDetailScreenProps) {
  const { handleScroll, isScrolledByOffset, scrollEventThrottle } = useScrollViewPosition()
  const { bottom } = useSafeAreaInsets()
  const scrollViewRef = useRef<ScrollViewRefType>(null)

  const [credentials, setCredentials] = useState<VeranaTrustCredential[]>(details.credentials)
  const [isLoading, setIsLoading] = useState(details.credentials.length === 0)
  const [showDetail, setShowDetail] = useState(false)

  useEffect(() => {
    if (details.credentials.length > 0) return
    let cancelled = false
    ;(async () => {
      try {
        const full = await fetchVeranaTrustDetails(details.resolverUrl, details.did)
        if (!cancelled) setCredentials(full?.credentials ?? [])
      } catch {
        // leave credentials empty on failure; the verdict still renders
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [details.did, details.resolverUrl, details.credentials.length])

  const serviceCredential = findServiceCredential(credentials)
  const organizationCredential = findOrganizationCredential(credentials)
  const service = readEcsService(serviceCredential)
  const organization = readEcsOrganization(organizationCredential)

  const verdict = credentials.length > 0 ? deriveVerdict(credentials) : details.trustStatus
  const verdictNote = credentials.length > 0 ? describeVerdict(verdict, credentials) : undefined
  const description = stripLinks(service?.description)
  const hasConditions = Boolean(service?.terms || service?.privacy || service?.minimumAgeRequired)

  return (
    <FlexPage gap="$0" paddingHorizontal="$0">
      <HeaderContainer title={name ?? 'Verana Trust Registry'} isScrolledByOffset={isScrolledByOffset} />

      <ScrollView ref={scrollViewRef} onScroll={handleScroll} scrollEventThrottle={scrollEventThrottle}>
        <YStack px="$4" gap="$4" marginBottom={bottom} pt="$2">
          <DidRow did={details.did} verdict={verdict} />

          {isLoading ? (
            <Paragraph variant="sub" color="$grey-600">
              Resolving trust credentials…
            </Paragraph>
          ) : null}

          <YStack>
            <ChainStep ok={serviceCredential?.result === 'VALID'} label="Service">
              {service ? (
                <XStack gap="$3" ai="flex-start">
                  <LogoBadge name={service.name} verified={Boolean(service.logo?.digest)} />
                  <YStack gap="$1" flex={1}>
                    <IdentityHeading name={service.name} />
                  {description.text ? <Paragraph color="$grey-700">{description.text}</Paragraph> : null}
                    {description.removed > 0 ? (
                      <Paragraph variant="sub" color="$grey-500">
                        {description.removed} link{description.removed > 1 ? 's' : ''} removed from this
                        description before display
                      </Paragraph>
                    ) : null}
                  </YStack>
                </XStack>
              ) : (
                <Paragraph color="$danger-500" fontWeight="600">
                  No ECS-Service credential presented
                </Paragraph>
              )}
            </ChainStep>

            <ChainStep ok={organizationCredential?.result === 'VALID'} label="Operated by" isLast>
              {organization ? (
                <XStack gap="$3" ai="flex-start">
                  <LogoBadge name={organization.name} verified={Boolean(organization.logo?.digest)} />
                  <YStack gap="$2" flex={1}>
                    <IdentityHeading name={organization.name} countryCode={organization.countryCode} />
                    {organization.address ? (
                      <Paragraph color="$grey-700">{organization.address}</Paragraph>
                    ) : null}
                    <XStack gap="$2" flexWrap="wrap">
                      <RegistryChip label="REG" value={organization.registryId} />
                    </XStack>
                  </YStack>
                </XStack>
              ) : (
                <YStack gap="$1">
                  <Paragraph color="$danger-500" fontWeight="600">
                    No ECS-Organization credential presented
                  </Paragraph>
                  <Paragraph variant="sub" color="$grey-500">
                    Nothing verifies who operates this service
                  </Paragraph>
                </YStack>
              )}
            </ChainStep>
          </YStack>

          <VerdictPill verdict={verdict} note={verdictNote} />

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

          {credentials.length > 0 ? (
            <YStack gap="$2">
              <XStack
                ai="center"
                gap="$2"
                onPress={() => setShowDetail((open) => !open)}
                pressStyle={{ opacity: 0.6 }}
              >
                <SectionLabel>Credential detail</SectionLabel>
                <Paragraph
                  variant="sub"
                  color="$primary-600"
                  fontWeight="700"
                  bg="$primary-100"
                  br="$10"
                  px="$2"
                >
                  {credentials.reduce((n, c) => n + Object.keys(c.claims ?? {}).length, 0)}
                </Paragraph>
                <XStack ml="auto">
                  {showDetail ? (
                    <HeroIcons.ChevronUp size={16} color="$grey-500" />
                  ) : (
                    <HeroIcons.ChevronDown size={16} color="$grey-500" />
                  )}
                </XStack>
              </XStack>

              {showDetail ? (
                <YStack gap="$3">
                  {service ? (
                    <YStack gap="$1.5" bg="$grey-100" br="$6" p="$3.5">
                      <Heading heading="sub2">ECS-Service</Heading>
                      <ClaimRow name="id" value={service.id} />
                      <ClaimRow name="name" value={service.name} />
                      <ClaimRow name="type" value={service.type} />
                      <ClaimRow name="description" value={service.description} />
                      <ClaimRow name="descriptionFormat" value={service.descriptionFormat} />
                      <ClaimRow name="logoUri" value={service.logo?.uri ?? 'not presented'} />
                      <ClaimRow name="logoDigestSri" value={service.logo?.digest ?? 'not presented'} />
                      <ClaimRow name="minimumAgeRequired" value={service.minimumAgeRequired} />
                      <ClaimRow name="termsAndConditionsUri" value={service.terms?.uri} />
                      <ClaimRow name="privacyPolicyUri" value={service.privacy?.uri} />
                    </YStack>
                  ) : null}

                  {organization ? (
                    <YStack gap="$1.5" bg="$grey-100" br="$6" p="$3.5">
                      <Heading heading="sub2">ECS-Organization</Heading>
                      <ClaimRow name="id" value={organization.id} />
                      <ClaimRow name="name" value={organization.name} />
                      <ClaimRow name="logoUri" value={organization.logo?.uri ?? 'not presented'} />
                      <ClaimRow name="registryId" value={organization.registryId} />
                      <ClaimRow name="address" value={organization.address} />
                      <ClaimRow name="countryCode" value={organization.countryCode} />
                      <ClaimRow name="legalJurisdiction" value={organization.legalJurisdiction} />
                      <ClaimRow name="organizationKind" value={organization.organizationKind} />
                      <ClaimRow name="lei" value={organization.lei} />
                    </YStack>
                  ) : null}
                </YStack>
              ) : null}
            </YStack>
          ) : null}

          <ExplorerLink did={details.did} />
        </YStack>
      </ScrollView>

      <YStack btw="$0.5" borderColor="$grey-200" pt="$4" mx="$-4" px="$4" bg="$background">
        <TextBackButton />
      </YStack>
    </FlexPage>
  )
}
