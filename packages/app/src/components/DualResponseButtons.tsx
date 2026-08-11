import { useLingui } from '@lingui/react/macro'
import { commonMessages } from '@package/translations'
import { Button, Spinner, YStack } from '@package/ui'
import { PixelRatio } from 'react-native'

interface DualResponseButtonProps {
  isLoading?: boolean
  onAccept: () => void
  onDecline: () => void
  acceptText?: string
  declineText?: string
  variant?: 'confirmation' | 'regular'
  align?: 'horizontal' | 'vertical'
  removeBottomPadding?: boolean
  /** Blocks accept while leaving decline live, for a consent the wallet must not default to. */
  isAcceptDisabled?: boolean
}

export function DualResponseButtons({
  onAccept,
  onDecline,
  isLoading,
  align = 'vertical',
  acceptText,
  declineText,
  variant = 'regular',
  isAcceptDisabled,
}: DualResponseButtonProps) {
  const { t } = useLingui()
  const accept = acceptText ?? t(commonMessages.acceptButton)
  const deline = declineText ?? t(commonMessages.declineButton)

  // Give accept button more space to avoid truncation when OS font is scaled
  const giveAcceptButtonMoreSpace = PixelRatio.getFontScale() > 1.2 && accept.length > 6

  return (
    <YStack
      gap={align === 'horizontal' ? '$4' : '$2'}
      flexDirection={align === 'horizontal' ? 'row-reverse' : 'column'}
    >
      <Button.Solid
        f={1}
        fg={giveAcceptButtonMoreSpace ? 2 : 1}
        disabled={isLoading || isAcceptDisabled}
        opacity={isAcceptDisabled ? 0.45 : 1}
        onPress={isAcceptDisabled ? undefined : onAccept}
        {...(variant === 'confirmation' ? { bg: '$danger-500' } : {})}
      >
        {isLoading ? <Spinner variant="dark" /> : accept}
      </Button.Solid>
      <Button.Outline f={1} bg="$grey-100" disabled={isLoading} onPress={onDecline}>
        {deline}
      </Button.Outline>
    </YStack>
  )
}
