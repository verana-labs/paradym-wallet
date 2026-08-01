import { VeranaTrustChain } from '@easypid/features/wallet/VeranaTrustChain'
import { Trans, useLingui } from '@lingui/react/macro'
import { DualResponseButtons, useHaptics, useWizard } from '@package/app'
import { commonMessages } from '@package/translations'
import {
  Circle,
  Heading,
  HeroIcons,
  Image,
  InfoButton,
  Paragraph,
  Stack,
  useMedia,
  XStack,
  YStack,
} from '@package/ui'
import { formatRelativeDate } from '@package/utils'
import type {
  DisplayImage,
  TrustedEntity,
  TrustMechanism,
  VeranaAccreditation,
  VeranaTrustCredential,
} from '@paradym/wallet-sdk'
import { fetchVeranaTrustDetails, resolveAccreditation, useActivities } from '@paradym/wallet-sdk'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const NO_ENTITY_ID = 'NO_ENTITY_ID'

interface VerifyPartySlideProps {
  type: 'offer' | 'request' | 'signing' | 'connect'
  host?: string
  name?: string
  entityId?: string
  logo?: DisplayImage
  backgroundColor?: string
  onContinue?: () => Promise<void>
  onDecline?: () => void
  trustedEntities?: Array<TrustedEntity>
  trustMechanism?: TrustMechanism
  /** The credential being offered or requested, so Q2/Q3 can be asked for its schema. */
  credentialType?: { vct?: string; title?: string }
}

export const VerifyPartySlide = ({
  type,
  entityId = NO_ENTITY_ID,
  name,
  logo,
  backgroundColor,
  onContinue,
  onDecline,
  trustedEntities,
  trustMechanism = 'none',
  credentialType,
}: VerifyPartySlideProps) => {
  const router = useRouter()
  const media = useMedia()
  // Without this the action bar lands inside the gesture strip on tall screens, where the
  // system swallows the touch and the user cannot accept or decline at all.
  const { bottom } = useSafeAreaInsets()
  const { onNext, onCancel } = useWizard()
  const { withHaptics } = useHaptics()
  const [isLoading, setIsLoading] = useState(false)
  const { activities } = useActivities({ filters: { entityId } })
  const lastInteractionDate = activities[0]?.date
  const { t } = useLingui()
  const [isImageLoaded, setIsImageLoaded] = useState(false)

  const entityIsTrustAnchor = trustedEntities?.some((entity) => entity.entityId === entityId)
  const isDemoTrustedEntity = trustedEntities?.some((entity) => entity.demo) ?? false

  const trustedEntitiesWithoutSelf = trustedEntities
    ?.filter((entity) => entity.entityId !== entityId)
    .map((entity) => ({
      ...entity,
      demo: isDemoTrustedEntity ? true : entity.demo,
    }))

  // The registry verdict belongs on this screen: it is the one every user sees before
  // deciding. Counting the entity as one more approver hides the difference between a
  // service the registry vouches for and one it explicitly does not.
  const veranaEntity = trustedEntities?.find((entity) => entity.veranaDetails)
  const veranaVerdict = veranaEntity?.veranaDetails?.trustStatus

  // Q2 on an offer, Q3 on a request ([UW-RES-2]/[UW-RES-3]): being a trusted service says
  // nothing about being allowed to issue or ask for *this* credential. `undefined` stays
  // undefined - an unreachable registry is not a refusal ([UW-RES-6]).
  const [accreditation, setAccreditation] = useState<VeranaAccreditation>()
  // [PW-RES-2]/[PW-RES-3]: the check must settle before accept is actionable, so the accept
  // button stays disabled while it is in flight - otherwise a normal-speed tap lands inside
  // the VPR round trip and takes a credential from an issuer the wallet never vetted.
  const [isCheckingAccreditation, setIsCheckingAccreditation] = useState(false)
  const veranaApiUrl = veranaEntity?.veranaDetails?.apiUrl
  const accreditationRole = type === 'offer' ? 'ISSUER' : 'VERIFIER'
  const shouldCheckAccreditation =
    Boolean(veranaApiUrl) && entityId !== NO_ENTITY_ID && (type === 'offer' || type === 'request')

  useEffect(() => {
    if (!shouldCheckAccreditation || !veranaApiUrl) return
    let cancelled = false
    setIsCheckingAccreditation(true)
    void resolveAccreditation(veranaApiUrl, {
      did: entityId,
      role: accreditationRole,
      vct: credentialType?.vct,
      title: credentialType?.title,
    })
      .then((result) => {
        if (!cancelled) setAccreditation(result)
      })
      .finally(() => {
        if (!cancelled) setIsCheckingAccreditation(false)
      })
    return () => {
      cancelled = true
    }
  }, [shouldCheckAccreditation, veranaApiUrl, entityId, accreditationRole, credentialType?.vct, credentialType?.title])

  // [UW-POT-2]/[UW-POT-3]: a failed Q2 or Q3 must not leave accept as the default action.
  const accreditationBlocks = accreditation?.granted === false

  // The card renders the same identity chain the detail screen does, so the consent screen shows
  // who this is before asking whether to trust them - not just a verdict word.
  const veranaDetails = veranaEntity?.veranaDetails
  const [veranaCredentials, setVeranaCredentials] = useState<VeranaTrustCredential[]>([])
  const [isLoadingChain, setIsLoadingChain] = useState(false)

  useEffect(() => {
    if (!veranaDetails?.resolverUrl || !veranaDetails.did) return
    let cancelled = false
    setIsLoadingChain(true)
    void fetchVeranaTrustDetails(veranaDetails.resolverUrl, veranaDetails.did)
      .then((full) => {
        if (!cancelled) setVeranaCredentials(full?.credentials ?? [])
      })
      .finally(() => {
        if (!cancelled) setIsLoadingChain(false)
      })
    return () => {
      cancelled = true
    }
  }, [veranaDetails?.resolverUrl, veranaDetails?.did])

  const handleContinue = async () => {
    setIsLoading(true)
    if (onContinue) {
      await onContinue()
    }
    onNext()
    setIsLoading(false)
  }

  const handleDecline = async () => {
    onDecline?.()
    onCancel()
  }

  const onPressVerifiedIssuer = withHaptics(() => {
    const searchParams = new URLSearchParams({
      trustedEntities: JSON.stringify(trustedEntitiesWithoutSelf ?? []),
      trustMechanism,
      isDemoTrustedEntity: `${isDemoTrustedEntity}`,
    })

    if (logo?.url) searchParams.set('logo', logo.url)
    if (name) searchParams.set('name', name)

    router.push(`trust?${searchParams}`)
  })

  const onPressInteraction = withHaptics(() => {
    router.push(`/activity?entityId=${entityId}`)
  })

  return (
    // flexShrink 0 is what makes the wizard's ScrollView scrollable: without it the slide is
    // squeezed to exactly one viewport, the overflow is clipped, and the action bar ends up
    // under the system gesture strip where touches never reach the app.
    <YStack fg={1} fs={0} jc="space-between" mb={Math.max(bottom, 32)}>
      {/* The wizard already scrolls the slide; a nested ScrollView deadlocks the gesture and
          strands the accept bar below the viewport when the trust card makes content tall. */}
      <YStack gap={media.short ? '$3' : '$4'}>
        <YStack gap="$3">
          <XStack ai="center" pt="$1" jc="center" display={veranaDetails ? 'none' : 'flex'}>
            <Circle size={72} bw="$0.5" borderColor="$grey-100" bg={backgroundColor ?? '$white'}>
              {logo?.url ? (
                <Image
                  circle
                  src={logo.url}
                  alt={logo.altText}
                  testID={isImageLoaded ? 'entity-image-loaded' : 'entity-image'}
                  onLoad={() => setIsImageLoaded(true)}
                  width="100%"
                  height="100%"
                  contentFit="contain"
                />
              ) : (
                <HeroIcons.BuildingOffice color="$grey-800" size={36} />
              )}
            </Circle>
          </XStack>
          <Stack gap="$2">
            <Heading heading="h2" numberOfLines={2} center fontSize={24} lineHeight="$5">
              {name ? (
                <Trans id="verifyPartySlide.interactWithHeading">Do you trust {name}?</Trans>
              ) : (
                <Trans id="verifyPartySlide.organizationNotVerifiedHeading">Organization not verified</Trans>
              )}
            </Heading>
            {type === 'offer' ? (
              <Paragraph center px="$4">
                {name ? (
                  <Trans id="verifyPartySlide.offerCardSubtitle">{name} wants to offer you a card.</Trans>
                ) : (
                  <Trans id="verifyPartySlide.offerCardSubtitleUnknownOrganization">
                    An unknown organization wants to offer you a card.
                  </Trans>
                )}
              </Paragraph>
            ) : type === 'signing' ? (
              <Paragraph center px="$4">
                {name ? (
                  <Trans id="verifyPartySlide.signingSubtitle">
                    {name} wants to interact to create a digital signature for a document.
                  </Trans>
                ) : (
                  <Trans id="verifyPartySlide.signingSubtitleUnknownOrganization">
                    An unknown organization wants to interact to create a digital signature for a document.
                  </Trans>
                )}
              </Paragraph>
            ) : type === 'request' ? (
              <Paragraph center px="$4">
                {name ? (
                  <Trans id="verifyPartySlide.requestSubtitle">{name} wants to request information from you.</Trans>
                ) : (
                  <Trans id="verifyPartySlide.requestSubtitleUnknownOrganization">
                    An unknown organization wants to request information from you.
                  </Trans>
                )}
              </Paragraph>
            ) : type === 'connect' ? (
              <Paragraph center px="$4">
                {name ? (
                  <Trans id="verifyPartySlide.connectSubtitle">{name} wants to connect with you.</Trans>
                ) : (
                  <Trans id="verifyPartySlide.connectSubtitleUnknownOrganization">
                    An unknown organization wants to connect with you.
                  </Trans>
                )}
              </Paragraph>
            ) : null}
          </Stack>
        </YStack>

        <YStack gap="$4">
          {veranaDetails && veranaVerdict ? (
            <YStack
              bg="$white"
              br="$8"
              bw={1}
              borderColor="$grey-100"
              px="$3"
              py="$3.5"
              mx="$-2"
              gap="$3"
              onPress={onPressVerifiedIssuer}
              pressStyle={{ bg: '$grey-50' }}
            >
              <VeranaTrustChain
                did={veranaDetails.did}
                verdict={veranaVerdict}
                credentials={veranaCredentials}
                isLoading={isLoadingChain}
                ask={
                  shouldCheckAccreditation && (type === 'offer' || type === 'request')
                    ? {
                        kind: type,
                        granted: accreditation?.granted,
                        party: name ?? entityId,
                        credential: credentialType?.title ?? credentialType?.vct ?? 'this credential',
                        reason: isCheckingAccreditation
                          ? 'Checking the Verana public registry…'
                          : accreditation?.reason,
                      }
                    : undefined
                }
              />
              {isDemoTrustedEntity && (
                <Paragraph variant="sub" color="$warning-600">
                  {t({
                    id: 'verifyPartySlide.veranaDemoNetwork',
                    message: 'Demo network - do not share real data',
                  })}
                </Paragraph>
              )}
            </YStack>
          ) : trustedEntitiesWithoutSelf && (trustedEntitiesWithoutSelf.length > 0 || entityIsTrustAnchor) ? (
            <InfoButton
              variant={entityIsTrustAnchor ? 'positive' : 'info'}
              title={t({
                id: 'verifyPartySlide.recognizedOrganizationTitle',
                message: 'Recognized organization',
              })}
              description={
                trustedEntitiesWithoutSelf.length > 1
                  ? t({
                      id: 'verifyPartySlide.approvedByMultipleOrganizations',
                      message: `Approved by ${trustedEntitiesWithoutSelf.length} organizations`,
                    })
                  : trustedEntitiesWithoutSelf.length === 1
                    ? t({
                        id: 'verifyPartySlide.approvedByOneOrganization',
                        message: 'Approved by one organization',
                      })
                    : undefined
              }
              onPress={onPressVerifiedIssuer}
            />
          ) : (
            <InfoButton
              variant="warning"
              title={t(commonMessages.unknownOrganization)}
              description={t({
                id: 'verifyPartySlide.unknownOrganizationDescription',
                message: 'Organization is not verified',
              })}
              onPress={onPressVerifiedIssuer}
            />
          )}
          {accreditation && !veranaDetails ? (
            <InfoButton
              variant={accreditation.granted ? 'positive' : 'danger'}
              title={
                accreditation.granted
                  ? type === 'offer'
                    ? t({ id: 'verifyPartySlide.q2PassTitle', message: 'Authorized issuer' })
                    : t({ id: 'verifyPartySlide.q3PassTitle', message: 'Authorized verifier' })
                  : type === 'offer'
                    ? t({ id: 'verifyPartySlide.q2FailTitle', message: 'Not an authorized issuer' })
                    : t({ id: 'verifyPartySlide.q3FailTitle', message: 'Not an authorized verifier' })
              }
              description={
                accreditation.granted
                  ? type === 'offer'
                    ? t({
                        id: 'verifyPartySlide.q2PassDescription',
                        message: 'Accredited to issue this credential in its ecosystem',
                      })
                    : t({
                        id: 'verifyPartySlide.q3PassDescription',
                        message: 'Authorized to request this credential in its ecosystem',
                      })
                  : accreditation.reason
              }
              onPress={onPressVerifiedIssuer}
            />
          ) : null}
          {isDemoTrustedEntity && !veranaVerdict && (
            <InfoButton
              variant="warning"
              title={t({
                id: 'verifyPartySlide.demoTrustedEntityTitle',
                message: 'Demo organization',
              })}
              description={t({
                id: 'verifyPartySlide.demoTrustedEntityDescription',
                message: 'Do not share real data',
              })}
            />
          )}
          {veranaVerdict && !lastInteractionDate ? null : (
            <InfoButton
              variant={lastInteractionDate ? 'interaction-success' : 'interaction-new'}
              title={
                lastInteractionDate
                  ? t({
                      id: 'verifyPartySlide.hasPreviousInteractionsTitle',
                      message: 'Previous interactions',
                    })
                  : t({
                      id: 'verifyPartySlide.hasNoPreviousInteractionsTitle',
                      message: 'First time interaction',
                    })
              }
              description={
                lastInteractionDate
                  ? t({
                      id: 'verifyPartySlide.hasPreviousInteractionsDescription',
                      message: `Last interaction: ${formatRelativeDate(new Date(lastInteractionDate))}`,
                    })
                  : undefined
              }
              onPress={lastInteractionDate ? onPressInteraction : undefined}
            />
          )}
        </YStack>
      </YStack>
      <Stack btw={1} borderColor="$grey-100" p="$4" mx="$-4">
        <DualResponseButtons
          align="horizontal"
          onAccept={handleContinue}
          onDecline={handleDecline}
          acceptText={t(commonMessages.confirmContinue)}
          declineText={t(commonMessages.stop)}
          isLoading={isLoading}
          isAcceptDisabled={
            accreditationBlocks ||
            veranaVerdict === 'UNTRUSTED' ||
            (shouldCheckAccreditation && isCheckingAccreditation)
          }
        />
      </Stack>
    </YStack>
  )
}
