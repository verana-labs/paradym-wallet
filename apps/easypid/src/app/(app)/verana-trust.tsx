import { VeranaTrustDetailScreen } from '@easypid/features/wallet/VeranaTrustDetailScreen'
import type { VeranaTrustDetails } from '@paradym/wallet-sdk'
import { Redirect, useLocalSearchParams } from 'expo-router'

// Gating this on TRUSTED redirected the user away from the one screen that explains a
// failure. [UW-POT-6]: a failed verdict is content, not an edge case.
const isTrustStatus = (value: unknown): value is VeranaTrustDetails['trustStatus'] =>
  value === 'TRUSTED' || value === 'PARTIAL' || value === 'UNTRUSTED' || value === 'UNVERIFIED'

const parseDetails = (value?: string): VeranaTrustDetails | undefined => {
  if (!value) return undefined

  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(value))
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('did' in parsed) ||
      typeof parsed.did !== 'string' ||
      !('resolverUrl' in parsed) ||
      typeof parsed.resolverUrl !== 'string' ||
      !('trustStatus' in parsed) ||
      !isTrustStatus(parsed.trustStatus) ||
      !('production' in parsed) ||
      typeof parsed.production !== 'boolean' ||
      !('credentials' in parsed) ||
      !Array.isArray(parsed.credentials)
    ) {
      return undefined
    }

    return parsed as VeranaTrustDetails
  } catch {
    return undefined
  }
}

export default function Screen() {
  const { details, name } = useLocalSearchParams<{ details: string; name?: string }>()

  const veranaDetails = parseDetails(details)
  if (!veranaDetails) return <Redirect href="/" />

  return <VeranaTrustDetailScreen details={veranaDetails} name={name} />
}
