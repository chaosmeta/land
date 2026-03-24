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

import { CONTRACTS, RESOURCE_ICONS, RESOURCE_KEYS, RESOURCE_COLORS, RESOURCE_NAMES } from '../constants/contracts.js'
import { ERC20_ABI } from '../constants/abi.js'
import { formatEther } from 'viem'

function TokenBal({ label, icon, color, address }) {
  const { address: acct } = useAccount()
  const { data: raw } = useReadContract({
    address, abi: ERC20_ABI, functionName: 'balanceOf',
    args: [acct], query: { enabled: !!acct && !!address && address !== '0x0000000000000000000000000000000000000000' },
  })
  const val = raw ? parseFloat(formatEther(raw)) : 0
  const fmt = v => v>=1e6?(v/1e6).toFixed(2)+'M':v>=1e3?(v/1e3).toFixed(2)+'K':v.toFixed(2)
  return (
    <div style={{display:'flex',alignItems:'center',gap:8,borderRight:'1px solid var(--border)',paddingRight:16}}>
      <span style={{fontSize:16,color}}>{icon}</span>
      <div>
        <div style={{fontFamily:'var(--font-mono)',fontSize:13,fontWeight:700,color,lineHeight:1}}>{fmt(val)}</div>
        <div style={{fontFamily:'var(--font-mono)',fontSize:9,color:'var(--text2)',letterSpacing:'0.1em',marginTop:2}}>{label}</div>
      </div>
    </div>
  )
}

export default function StatBar() {
  const { isConnected } = useAccount()
  if (!isConnected) return null
  const tokens = [
    {label:'RING',  icon:'⬡', color:'var(--gold)',  addr:CONTRACTS.ring},
    ...RESOURCE_KEYS.map((k,i)=>({label:k.toUpperCase(), icon:RESOURCE_EMOJIS?.[i]||RESOURCE_ICONS[i], color:RESOURCE_COLORS[i], addr:CONTRACTS[k]})),
  ]
  return (
    <div className="panel" style={{display:'flex',alignItems:'center',gap:16,padding:'10px 18px',marginBottom:20,flexWrap:'wrap'}}>
      <div style={{fontFamily:'var(--font-mono)',fontSize:9,color:'var(--text2)',letterSpacing:'0.12em',marginRight:4}}>BALANCE:</div>
      <TokenBal label="RING" icon="⬡" color="var(--gold)" address={CONTRACTS.ring}/>
      {RESOURCE_KEYS.map((k,i)=><TokenBal key={k} label={k.toUpperCase()} icon={['🪙','🌲','💧','🔥','⛰'][i]} color={RESOURCE_COLORS[i]} address={CONTRACTS[k]}/>)}
    </div>
  )
}
