import { TextBackButton, useScrollViewPosition } from '@package/app'
import {
  Circle,
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
import { fetchVeranaTrustDetails, type VeranaTrustCredential, type VeranaTrustDetails } from '@paradym/wallet-sdk'
import { useEffect, useRef, useState } from 'react'
import { Linking } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export type VeranaTrustDetailScreenProps = {
  details: VeranaTrustDetails
  name?: string
}

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined

const asHttpUrl = (value: unknown): string | undefined => {
  const url = asString(value)
  if (!url) return undefined

  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : undefined
  } catch {
    return undefined
  }
}

const shortenDid = (did: string): string => {
  const parts = did.split(':')
  const host = parts[parts.length - 1]
  return host || did
}

const ecsTypeLabel = (ecsType?: string): string => {
  switch (ecsType) {
    case 'ECS-SERVICE':
      return 'Service'
    case 'ECS-ORG':
      return 'Organization'
    case 'ECS-PERSON':
      return 'Person'
    default:
      return ecsType ?? 'Credential'
  }
}

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <YStack gap="$1">
      <Paragraph variant="sub" color="$grey-600">
        {label}
      </Paragraph>
      <Paragraph>{value}</Paragraph>
    </YStack>
  )
}

function LinkField({ label, url }: { label: string; url?: string }) {
  if (!url) return null
  return (
    <YStack gap="$1">
      <Paragraph variant="sub" color="$grey-600">
        {label}
      </Paragraph>
      <XStack ai="center" gap="$1.5" onPress={() => Linking.openURL(url)} pressStyle={{ opacity: 0.6 }}>
        <Paragraph color="$primary-500" numberOfLines={1} flexShrink={1}>
          {url}
        </Paragraph>
        <HeroIcons.InformationCircle size={16} color="$primary-500" />
      </XStack>
    </YStack>
  )
}

function CredentialCard({ credential }: { credential: VeranaTrustCredential }) {
  const claims = credential.claims ?? {}
  const isService = credential.ecsType === 'ECS-SERVICE'
  return (
    <YStack gap="$3" br="$8" p="$4" bg="$grey-100">
      <XStack ai="center" gap="$2.5">
        <Circle size="$4" ai="center" jc="center" bg="$grey-50">
          {isService ? (
            <HeroIcons.GlobeAlt color="$grey-700" size={20} />
          ) : (
            <HeroIcons.BuildingOffice color="$grey-700" size={20} />
          )}
        </Circle>
        <YStack flexShrink={1}>
          <Heading heading="h3">{asString(claims.name) ?? ecsTypeLabel(credential.ecsType)}</Heading>
          <Paragraph variant="sub" color="$grey-600">
            {ecsTypeLabel(credential.ecsType)} credential · {credential.result ?? 'VALID'}
          </Paragraph>
        </YStack>
        <HeroIcons.CheckCircleFilled size={22} color="$positive-500" />
      </XStack>

      <Field label="Description" value={asString(claims.description)} />
      <Field label="Type" value={asString(claims.type)} />
      <Field label="Legal name" value={isService ? undefined : asString(claims.name)} />
      <Field label="Address" value={asString(claims.address)} />
      <Field label="Registry ID" value={asString(claims.registryId)} />
      <Field label="Country" value={asString(claims.countryCode)} />
      <LinkField label="Privacy policy" url={asHttpUrl(claims.privacyPolicy)} />
      <LinkField label="Terms & conditions" url={asHttpUrl(claims.termsAndConditions)} />
    </YStack>
  )
}

export function VeranaTrustDetailScreen({ details, name }: VeranaTrustDetailScreenProps) {
  const { handleScroll, isScrolledByOffset, scrollEventThrottle } = useScrollViewPosition()
  const { bottom } = useSafeAreaInsets()
  const scrollViewRef = useRef<ScrollViewRefType>(null)

  // The trust decision carries only the summary. Fetch the full evaluation (Verifiable Trust
  // Credentials, ecosystem chain) here, off the presentation critical path.
  const [credentials, setCredentials] = useState<VeranaTrustCredential[]>(details.credentials)
  const [isLoading, setIsLoading] = useState(details.credentials.length === 0)

  useEffect(() => {
    if (details.credentials.length > 0) return
    let cancelled = false
    ;(async () => {
      try {
        const full = await fetchVeranaTrustDetails(details.resolverUrl, details.did)
        if (!cancelled) setCredentials(full?.credentials ?? [])
      } catch {
        // leave credentials empty on failure; the verdict + ecosystem still render
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [details.did, details.resolverUrl, details.credentials.length])

  const ecosystemIssuer = credentials.find((c) => c.issuedBy)?.issuedBy

  return (
    <FlexPage gap="$0" paddingHorizontal="$0">
      <HeaderContainer title={name ?? 'Verana Trust Registry'} isScrolledByOffset={isScrolledByOffset} />

      <ScrollView ref={scrollViewRef} onScroll={handleScroll} scrollEventThrottle={scrollEventThrottle}>
        <YStack px="$4" gap="$4" marginBottom={bottom} pt="$2">
          {/* Verdict header */}
          <YStack gap="$3" br="$8" p="$4" bg="$positive-100">
            <XStack ai="center" gap="$2.5">
              <Circle size="$4" ai="center" jc="center" bg="$positive-500">
                <HeroIcons.ShieldCheck color="$white" size={22} />
              </Circle>
              <YStack flexShrink={1}>
                <Heading heading="h2">{details.trustStatus === 'TRUSTED' ? 'Trusted' : details.trustStatus}</Heading>
                <Paragraph variant="sub" color="$grey-700">
                  Resolved live via the Verana trust registry
                </Paragraph>
              </YStack>
            </XStack>
            <XStack flexWrap="wrap" gap="$2">
              <YStack gap="$1" flexBasis="45%">
                <Paragraph variant="sub" color="$grey-600">
                  Network
                </Paragraph>
                <Paragraph>{details.production ? 'Production' : 'Test'}</Paragraph>
              </YStack>
              {details.evaluatedAtBlock ? (
                <YStack gap="$1" flexBasis="45%">
                  <Paragraph variant="sub" color="$grey-600">
                    Evaluated at block
                  </Paragraph>
                  <Paragraph>{details.evaluatedAtBlock.toLocaleString()}</Paragraph>
                </YStack>
              ) : null}
            </XStack>
          </YStack>

          {/* Verifiable Trust Credentials */}
          {credentials.length > 0 ? (
            <YStack gap="$2">
              <Heading heading="sub2">Verifiable trust credentials</Heading>
              {credentials.map((credential, index) => (
                <CredentialCard key={`${credential.ecsType}-${index}`} credential={credential} />
              ))}
            </YStack>
          ) : isLoading ? (
            <Paragraph variant="sub" color="$grey-600">
              Loading trust credentials…
            </Paragraph>
          ) : null}

          {/* Ecosystem / issued by */}
          {ecosystemIssuer ? (
            <YStack gap="$2">
              <Heading heading="sub2">Ecosystem authority</Heading>
              <YStack gap="$2" br="$8" p="$4" bg="$grey-100">
                <XStack ai="center" gap="$2.5">
                  <Circle size="$4" ai="center" jc="center" bg="$grey-50">
                    <HeroIcons.Identification color="$grey-700" size={20} />
                  </Circle>
                  <YStack flexShrink={1}>
                    <Heading heading="h3">{shortenDid(ecosystemIssuer)}</Heading>
                    <Paragraph variant="sub" color="$grey-600">
                      Issued the trust credentials
                    </Paragraph>
                  </YStack>
                </XStack>
                <Field label="Registry DID" value={ecosystemIssuer} />
                <Field label="Subject DID" value={details.did} />
              </YStack>
            </YStack>
          ) : null}
        </YStack>
      </ScrollView>

      <YStack btw="$0.5" borderColor="$grey-200" pt="$4" mx="$-4" px="$4" bg="$background">
        <TextBackButton />
      </YStack>
    </FlexPage>
  )
}
