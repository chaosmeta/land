
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
import { CONTRACTS, RESOURCE_TOKENS } from '../constants/contracts'
import { ERC20_ABI } from '../constants/abi'
import { formatEther } from 'viem'

export function useTokenBalances() {
  const { address } = useAccount()

  const allTokens = [
    { addr: CONTRACTS.ring,  symbol: 'RING' },
    ...RESOURCE_TOKENS.map(t => ({ addr: t.addr, symbol: t.symbol })),
  ]

  const { data, isLoading, refetch } = useReadContracts({
    contracts: allTokens.map(t => ({
      address: t.addr,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [address ?? '0x0000000000000000000000000000000000000000'],
    })),
    query: { enabled: !!address, refetchInterval: 15_000 },
  })

  const balances = {}
  if (data) {
    allTokens.forEach((t, i) => {
      const raw = data[i]?.result ?? 0n
      balances[t.symbol] = {
        raw,
        formatted: parseFloat(formatEther(raw)).toFixed(4),
        symbol: t.symbol,
      }
    })
  }

  return { balances, isLoading, refetch }
}
