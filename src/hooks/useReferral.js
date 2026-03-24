/**
 * useReferral — bind referrer and read referral tree
 * Returns: { isBound, referrer, ancestors, rates, bind, totalEarned }
 */

import { useAccount } from '../contexts/WalletContext.jsx'

// ── wagmi shims ──────────────────────────────────────────────────────────────
import { publicClient } from '../contexts/WalletContext.jsx'

function useReadContracts({ contracts=[], enabled=true }) {
  const [data, setData] = React.useState([])
  const [isLoading, setIsLoading] = React.useState(false)
  React.useEffect(() => {
    if (!enabled || !contracts.length) return
    setIsLoading(true)
    publicClient.multicall({ contracts, allowFailure:true }).then(r=>setData(r.map(x=>({result:x.result,status:x.status})))).catch(()=>setData([])).finally(()=>setIsLoading(false))
  }, [JSON.stringify(contracts), enabled])
  return { data, isLoading }
}

function useWriteContract() {
  const [isPending, setIsPending] = React.useState(false)
  async function writeContractAsync(params) {
    // pages using this should migrate to wc.writeContract
    setIsPending(true)
    try { return await Promise.reject(new Error('migrate to wc.writeContract')) }
    finally { setIsPending(false) }
  }
  return { writeContractAsync, isPending }
}
// ────────────────────────────────────────────────────────────────────────────
import { CONTRACTS } from '../constants/contracts'
import { REFERRAL_ABI } from '../constants/abi'

export function useReferral() {
  const { address } = useAccount()
  const { writeContractAsync } = useWriteContract()

  const enabled = !!address && CONTRACTS.referral !== '0x0000000000000000000000000000000000000000'

  const { data, refetch } = useReadContracts({
    contracts: [
      { address: CONTRACTS.referral, abi: REFERRAL_ABI, functionName: 'bound',        args: [address ?? '0x0'] },
      { address: CONTRACTS.referral, abi: REFERRAL_ABI, functionName: 'referrer',     args: [address ?? '0x0'] },
      { address: CONTRACTS.referral, abi: REFERRAL_ABI, functionName: 'getAncestors', args: [address ?? '0x0'] },
      { address: CONTRACTS.referral, abi: REFERRAL_ABI, functionName: 'getRates' },
    ],
    query: { enabled, refetchInterval: 30_000 },
  })

  const isBound   = data?.[0]?.result ?? false
  const referrer  = data?.[1]?.result ?? ''
  const ancestors = data?.[2]?.result ?? []
  const rates     = (data?.[3]?.result ?? []).map(r => Number(r) / 100) // convert bps → %

  async function bindReferrer(refAddress) {
    if (!address) throw new Error('wallet not connected')
    await writeContractAsync({
      address: CONTRACTS.referral,
      abi: REFERRAL_ABI,
      functionName: 'bind',
      args: [refAddress],
    })
    await refetch()
  }

  return { isBound, referrer, ancestors, rates, bind: bindReferrer, refetch }
}
