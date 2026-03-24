
import { CONTRACTS } from '../constants/contracts'

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
import { AUCTION_ABI } from '../constants/abi'
import { formatEther } from 'viem'

// Check first 50 tokenIds for active auctions
const TOKEN_IDS = Array.from({ length: 50 }, (_, i) => i + 1)

export function useAuctions() {
  // Read auction structs
  const { data: auctionData, isLoading, refetch } = useReadContracts({
    contracts: TOKEN_IDS.map(id => ({
      address: CONTRACTS.auction,
      abi: AUCTION_ABI,
      functionName: 'auctions',
      args: [BigInt(id)],
    })),
    query: { refetchInterval: 20_000 },
  })

  // Read current prices for active auctions
  const { data: priceData } = useReadContracts({
    contracts: TOKEN_IDS.map(id => ({
      address: CONTRACTS.auction,
      abi: AUCTION_ABI,
      functionName: 'currentPrice',
      args: [BigInt(id)],
    })),
    query: { refetchInterval: 10_000 },
  })

  const auctions = []
  if (auctionData) {
    TOKEN_IDS.forEach((id, i) => {
      const res = auctionData[i]?.result
      if (!res) return
      const [seller, startPrice, endPrice, duration, startedAt] = res
      if (!startedAt || startedAt === 0n) return
      const price = priceData?.[i]?.result ?? startPrice
      auctions.push({
        id,
        seller,
        startPrice: formatEther(startPrice),
        endPrice: formatEther(endPrice),
        currentPrice: formatEther(price),
        duration: Number(duration),
        startedAt: Number(startedAt),
        endsAt: Number(startedAt) + Number(duration),
      })
    })
  }

  return { auctions, isLoading, refetch }
}

function useReadContracts(){return{data:[],isLoading:false}}