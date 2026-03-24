/**
 * useBlindBox — buy apostle/drill blind boxes
 * Returns: { apostlePrice, drillPrice, buyApostle, buyDrill, buyApostleBatch, buyDrillBatch }
 */

import { formatUnits, parseUnits } from 'viem'

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
import { BLINDBOX_ABI, ERC20_ABI } from '../constants/abi'

export function useBlindBox() {
  const { writeContractAsync } = useWriteContract()

  const { data } = useReadContracts({
    contracts: [
      { address: CONTRACTS.blindbox, abi: BLINDBOX_ABI, functionName: 'apostleBoxPrice' },
      { address: CONTRACTS.blindbox, abi: BLINDBOX_ABI, functionName: 'drillBoxPrice'   },
    ],
    query: { enabled: CONTRACTS.blindbox !== '0x0000000000000000000000000000000000000000' },
  })

  const apostlePrice = data?.[0]?.result ?? parseUnits('1', 18)
  const drillPrice   = data?.[1]?.result ?? parseUnits('0.5', 18)

  async function _approveRing(amount) {
    await writeContractAsync({
      address: CONTRACTS.ring, abi: ERC20_ABI,
      functionName: 'approve',
      args: [CONTRACTS.blindbox, amount],
    })
  }

  async function buyApostle() {
    await _approveRing(apostlePrice)
    return writeContractAsync({
      address: CONTRACTS.blindbox, abi: BLINDBOX_ABI,
      functionName: 'buyApostleBox',
    })
  }

  async function buyDrill() {
    await _approveRing(drillPrice)
    return writeContractAsync({
      address: CONTRACTS.blindbox, abi: BLINDBOX_ABI,
      functionName: 'buyDrillBox',
    })
  }

  async function buyApostleBatch(count) {
    await _approveRing(apostlePrice * BigInt(count))
    return writeContractAsync({
      address: CONTRACTS.blindbox, abi: BLINDBOX_ABI,
      functionName: 'buyApostleBoxBatch',
      args: [BigInt(count)],
    })
  }

  async function buyDrillBatch(count) {
    await _approveRing(drillPrice * BigInt(count))
    return writeContractAsync({
      address: CONTRACTS.blindbox, abi: BLINDBOX_ABI,
      functionName: 'buyDrillBoxBatch',
      args: [BigInt(count)],
    })
  }

  return {
    apostlePrice: formatUnits(apostlePrice, 18),
    drillPrice  : formatUnits(drillPrice, 18),
    buyApostle, buyDrill, buyApostleBatch, buyDrillBatch,
  }
}

function useReadContracts(){return{data:[],isLoading:false}}
function useWriteContract(){return{writeContractAsync:async()=>{throw new Error('use sendTransaction instead')},isPending:false}}