/**
 * useLandAuction — reads active auctions from LandAuction contract
 * Returns: { auctions, isLoading, bid, refetch }
 *
 * Reads tokenIds 1-20 (the genesis auctions) and returns active ones.
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
import { parseUnits, formatUnits } from 'viem'
import { CONTRACTS } from '../constants/contracts'
import { AUCTION_ABI, ERC20_ABI } from '../constants/abi'

const GENESIS_IDS = Array.from({ length: 20 }, (_, i) => i + 1)

export function useLandAuction() {
  const { address } = useAccount()
  const { writeContractAsync } = useWriteContract()

  // Read auction data for all 20 genesis lands
  const auctionCalls = GENESIS_IDS.map(id => ({
    address: CONTRACTS.auction,
    abi: AUCTION_ABI,
    functionName: 'auctions',
    args: [BigInt(id)],
  }))
  const priceCalls = GENESIS_IDS.map(id => ({
    address: CONTRACTS.auction,
    abi: AUCTION_ABI,
    functionName: 'currentPrice',
    args: [BigInt(id)],
  }))

  const { data: auctionData, isLoading, refetch } = useReadContracts({
    contracts: [...auctionCalls, ...priceCalls],
    query: { refetchInterval: 10_000 },
  })

  const auctions = GENESIS_IDS.map((id, i) => {
    const info  = auctionData?.[i]?.result
    const price = auctionData?.[i + GENESIS_IDS.length]?.result
    if (!info || info[0] === '0x0000000000000000000000000000000000000000') return null
    return {
      id,
      seller    : info[0],
      startPrice: formatUnits(info[1], 18),
      endPrice  : formatUnits(info[2], 18),
      duration  : Number(info[3]),
      startedAt : Number(info[4]),
      currentPrice: price ? formatUnits(price, 18) : '0',
    }
  }).filter(Boolean)

  // Approve RING then bid
  async function bid(landId, currentPriceEth, slippagePct = 1) {
    if (!address) throw new Error('wallet not connected')
    const amount = parseUnits(
      (parseFloat(currentPriceEth) * (1 + slippagePct / 100)).toFixed(18),
      18
    )
    // 1. approve
    await writeContractAsync({
      address: CONTRACTS.ring,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [CONTRACTS.auction, amount],
    })
    // 2. bid
    await writeContractAsync({
      address: CONTRACTS.auction,
      abi: AUCTION_ABI,
      functionName: 'bid',
      args: [BigInt(landId), amount],
    })
  }

  return { auctions, isLoading, bid, refetch }
}
