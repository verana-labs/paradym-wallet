import { Circle, Heading, HeroIcons, Paragraph, XStack, YStack } from '@package/ui'
import type { EcsAssetRef, EcsVerdict } from '@paradym/wallet-sdk'
import { Linking } from 'react-native'
import Svg, { Path, Rect } from 'react-native-svg'

export const VERANA_EXPLORER = 'https://app.testnet.verana.network'

const VERDICT_TONE = {
  TRUSTED: { color: '$positive-500', label: 'TRUSTED' },
  PARTIAL: { color: '$warning-600', label: 'PARTIAL' },
  UNTRUSTED: { color: '$danger-500', label: 'UNTRUSTED' },
} as const

export function VeranaMark({ size = 16 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Rect width={64} height={64} rx={12} fill="#763EF0" />
      <Path
        d="M46.3 22.8 32 50.4 17.7 22.8l1.9-3.4 2 3.5L32 43.4l10.4-20.5 2 -3.5 1.9 3.4Z"
        fill="#ffffff"
      />
      <Path d="M22.4 15.8 32 34.2l9.3-18.4H22.4Z" fill="#ffffff" />
    </Svg>
  )
}

// Drawn rather than an emoji: emoji flags resolve through the system font and fall
// back inconsistently across Android versions, on the screen where someone decides
// whether to trust a counterparty. Undrawn countries degrade to the ISO code.
export function CountryFlag({ code, size = 16 }: { code?: string; size?: number }) {
  if (!code) return null

  if (code === 'CH') {
    return (
      <Svg width={size} height={size} viewBox="0 0 32 32">
        <Rect width={32} height={32} rx={3} fill="#D52B1E" />
        <Rect x={13} y={6} width={6} height={20} fill="#ffffff" />
        <Rect x={6} y={13} width={20} height={6} fill="#ffffff" />
      </Svg>
    )
  }

  return (
    <Paragraph variant="sub" color="$grey-700" fontWeight="600">
      {code}
    </Paragraph>
  )
}

export function StepTick({ ok }: { ok: boolean }) {
  return (
    <Circle size={28} ai="center" jc="center" bg={ok ? '$positive-500' : '$danger-500'}>
      {ok ? <HeroIcons.Check size={15} color="$white" /> : <HeroIcons.X size={15} color="$white" />}
    </Circle>
  )
}

export function VerdictPill({ verdict, note }: { verdict: EcsVerdict; note?: string }) {
  const tone = VERDICT_TONE[verdict]
  return (
    <YStack gap="$2">
      <XStack
        ai="center"
        gap="$2"
        alignSelf="flex-start"
        bw={2}
        borderColor={tone.color}
        br="$6"
        px="$3.5"
        py="$2"
        bg="$white"
      >
        <VeranaMark />
        <Paragraph fontWeight="800" color={tone.color} letterSpacing={0.6}>
          {tone.label}
        </Paragraph>
      </XStack>
      {note ? (
        <Paragraph variant="sub" color={verdict === 'TRUSTED' ? '$grey-600' : '$danger-600'}>
          {note}
        </Paragraph>
      ) : null}
    </YStack>
  )
}

export function RegistryChip({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <XStack ai="center" gap="$1.5" bg="$grey-100" br="$3" px="$2" py="$1">
      <Paragraph variant="sub" color="$grey-500" fontWeight="700" fontSize={10}>
        {label}
      </Paragraph>
      <Paragraph variant="sub" color="$grey-700" fontWeight="600">
        {value}
      </Paragraph>
    </XStack>
  )
}

export function ConditionRow({ asset, label }: { asset?: EcsAssetRef; label: string }) {
  if (!asset) return null
  return (
    <XStack ai="center" gap="$2" onPress={() => Linking.openURL(asset.uri)} pressStyle={{ opacity: 0.6 }}>
      <HeroIcons.LockClosed size={14} color="$primary-500" />
      <Paragraph color="$primary-500" fontWeight="600" flexShrink={1}>
        {label}
      </Paragraph>
      {asset.digest ? (
        <XStack ai="center" gap="$1" ml="auto">
          <HeroIcons.Check size={12} color="$positive-500" />
          <Paragraph variant="sub" color="$positive-500" fontWeight="700">
            intact
          </Paragraph>
        </XStack>
      ) : (
        <Paragraph variant="sub" color="$grey-500" ml="auto">
          no digest
        </Paragraph>
      )}
    </XStack>
  )
}

export function ExplorerLink({ did }: { did: string }) {
  const url = `${VERANA_EXPLORER}/did/${encodeURIComponent(did)}`
  return (
    <XStack ai="center" gap="$1.5" onPress={() => Linking.openURL(url)} pressStyle={{ opacity: 0.6 }}>
      <Paragraph color="$primary-500" fontWeight="600">
        Open this DID in Verana
      </Paragraph>
      <HeroIcons.ArrowUpRightFilled size={13} color="$primary-500" />
    </XStack>
  )
}

export function SectionLabel({ children }: { children: string }) {
  return (
    <Paragraph variant="sub" color="$grey-500" fontWeight="700" letterSpacing={0.8} fontSize={10}>
      {children.toUpperCase()}
    </Paragraph>
  )
}

export function IdentityHeading({ name, countryCode }: { name?: string; countryCode?: string }) {
  return (
    <XStack ai="center" gap="$2" flexWrap="wrap">
      <Heading heading="h3" flexShrink={1}>
        {name ?? 'Not presented'}
      </Heading>
      <CountryFlag code={countryCode} />
    </XStack>
  )
}
