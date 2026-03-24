
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
// ────────────────────────────────────────────────────────────────────────────
import { CONTRACTS } from '../constants/contracts'
import { LAND_ABI, DRILL_ABI, APOSTLE_ABI } from '../constants/abi'

const MAX_SCAN = 100

export function useMyLands() {
  const { address } = useAccount()
  const ids = Array.from({ length: MAX_SCAN }, (_, i) => i + 1)

  const { data } = useReadContracts({
    contracts: ids.map(id => ({
      address: CONTRACTS.land,
      abi: LAND_ABI,
      functionName: 'ownerOf',
      args: [BigInt(id)],
    })),
    query: { enabled: !!address, refetchInterval: 30_000 },
  })

  const myIds = []
  if (data && address) {
    ids.forEach((id, i) => {
      if (data[i]?.result?.toLowerCase() === address.toLowerCase()) myIds.push(id)
    })
  }
  return myIds
}

export function useMyDrills() {
  const { address } = useAccount()
  const ids = Array.from({ length: 50 }, (_, i) => i + 1)

  const { data } = useReadContracts({
    contracts: ids.map(id => ({
      address: CONTRACTS.drill,
      abi: DRILL_ABI,
      functionName: 'ownerOf',
      args: [BigInt(id)],
    })),
    query: { enabled: !!address, refetchInterval: 30_000 },
  })

  const myIds = []
  if (data && address) {
    ids.forEach((id, i) => {
      const owner = data[i]?.result
      if (owner && owner.toLowerCase() === address.toLowerCase()) myIds.push(id)
    })
  }
  return myIds
}

export function useMyApostles() {
  const { address } = useAccount()
  const ids = Array.from({ length: 50 }, (_, i) => i + 1)

  const { data } = useReadContracts({
    contracts: ids.map(id => ({
      address: CONTRACTS.apostle,
      abi: APOSTLE_ABI,
      functionName: 'ownerOf',
      args: [BigInt(id)],
    })),
    query: { enabled: !!address, refetchInterval: 30_000 },
  })

  const myIds = []
  if (data && address) {
    ids.forEach((id, i) => {
      const owner = data[i]?.result
      if (owner && owner.toLowerCase() === address.toLowerCase()) myIds.push(id)
    })
  }
  return myIds
}
