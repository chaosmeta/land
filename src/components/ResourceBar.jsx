import React from 'react'

// ── wagmi shims ──────────────────────────────────────────────────────────────
import { publicClient } from '../contexts/WalletContext.jsx'

function useReadContract({ address, abi, functionName, args, enabled=true, watch=false }) {
  const [data, setData] = React.useState(undefined)
  const [isLoading, setIsLoading] = React.useState(false)
  React.useEffect(() => {
    if (!enabled || !address) return
    setIsLoading(true)
    publicClient.readContract({ address, abi, functionName, args }).then(setData).catch(()=>{}).finally(()=>setIsLoading(false))
  }, [address, functionName, JSON.stringify(args), enabled])
  return { data, isLoading, refetch: ()=>{} }
}
// ────────────────────────────────────────────────────────────────────────────
import { useAccount } from '../contexts/WalletContext.jsx'

import { formatEther } from 'viem'
import { CONTRACTS, RES_KEYS, RES_NAMES_ZH, RES_EMOJIS, RES_COLORS } from '../constants/contracts.js'
import { ERC20_ABI } from '../constants/abi.js'

const ZERO_ADDR = '0x0000000000000000000000000000000000000000'

function BalChip({ k, emoji, color, zh }) {
  const { address } = useAccount()
  const addr = CONTRACTS[k]
  const { data } = useReadContract({
    address: addr, abi: ERC20_ABI, functionName: 'balanceOf',
    args: [address],
    query: { enabled: !!address && addr !== ZERO_ADDR },
  })
  const v = data ? parseFloat(formatEther(data)) : 0
  const fmt = n =>
    n >= 1e6  ? (n / 1e6).toFixed(1) + 'M' :
    n >= 1e3  ? (n / 1e3).toFixed(1) + 'K' :
    n.toFixed(2)

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '3px 10px',
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 5,
    }}>
      <span style={{ fontSize: 14 }}>{emoji}</span>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color, lineHeight: 1, fontFamily: 'Rajdhani, monospace' }}>{fmt(v)}</div>
        <div style={{ fontSize: 9, color: '#334155', marginTop: 1 }}>{zh}</div>
      </div>
    </div>
  )
}

export default function ResourceBar() {
  const { isConnected } = useAccount()
  if (!isConnected) return null
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '5px 14px',
      background: 'rgba(10,16,32,0.92)',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
      flexWrap: 'wrap',
      flexShrink: 0,
    }}>
      <span style={{ fontSize: 10, color: '#2d3748', marginRight: 2, whiteSpace: 'nowrap' }}>资产 Assets</span>
      <BalChip k="ring"  emoji="💎" color="#a78bfa" zh="RING" />
      {RES_KEYS.map((k, i) => (
        <BalChip key={k} k={k} emoji={RES_EMOJIS[i]} color={RES_COLORS[i]} zh={RES_NAMES_ZH[i]} />
      ))}
    </div>
  )
}
