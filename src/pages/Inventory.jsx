import React, { useState, useEffect } from 'react'

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
import { useAccount, usePublicClient } from '../contexts/WalletContext.jsx'

import { formatEther, getContract } from 'viem'
import { CONTRACTS, RES_KEYS, RES_NAMES_ZH, RES_EMOJIS, RES_COLORS, isDeployed } from '../constants/contracts.js'
import { APOSTLE_ABI, DRILL_ABI, ERC20_ABI } from '../constants/abi.js'
import ResourceBar from '../components/ResourceBar.jsx'

const ZERO = '0x0000000000000000000000000000000000000000'

function TokenCard({ label, sublabel, emoji, color, addr }) {
  const { address } = useAccount()
  const { data } = useReadContract({
    address: addr, abi: ERC20_ABI, functionName: 'balanceOf',
    args: [address],
    query: { enabled: !!address && addr !== ZERO },
  })
  const v = data ? parseFloat(formatEther(data)) : 0
  const fmt = n =>
    n >= 1e6 ? (n/1e6).toFixed(2)+'M' :
    n >= 1e3 ? (n/1e3).toFixed(2)+'K' :
    n.toFixed(4)
  return (
    <div style={{
      background: '#1a2540', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 10, padding: '14px 16px',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <span style={{ fontSize: 30, flexShrink: 0 }}>{emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, color: '#334155', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: 'Rajdhani,monospace', lineHeight: 1.15 }}>{fmt(v)}</div>
        <div style={{ fontSize: 10, color: '#1e2a3a', marginTop: 2 }}>{sublabel}</div>
      </div>
    </div>
  )
}

export default function Inventory() {
  const { address } = useAccount()
  const pub = usePublicClient()
  const [apostles, setApostles] = useState([])
  const [drills,   setDrills]   = useState([])
  const [loading,  setLoading]  = useState(false)
  const [tab, setTab] = useState('tokens')
  const dep = isDeployed('apostle')

  const getOwned = async (addr, abi) => {
    const f1  = await pub.createContractEventFilter({ address: addr, abi, eventName: 'Transfer', args: { to: address }, fromBlock: 0n })
    const rcv = await pub.getFilterLogs({ filter: f1 })
    const ids = new Set(rcv.map(e => Number(e.args.tokenId)))
    const f2  = await pub.createContractEventFilter({ address: addr, abi, eventName: 'Transfer', args: { from: address }, fromBlock: 0n })
    const snt = await pub.getFilterLogs({ filter: f2 })
    snt.forEach(e => ids.delete(Number(e.args.tokenId)))
    return [...ids]
  }

  const load = async () => {
    if (!address || !pub || !dep) return
    setLoading(true)
    try {
      const [aIds, dIds] = await Promise.all([
        getOwned(CONTRACTS.apostle, APOSTLE_ABI),
        getOwned(CONTRACTS.drill,   DRILL_ABI),
      ])
      const ac = getContract({ address: CONTRACTS.apostle, abi: APOSTLE_ABI, client: pub })
      const dc = getContract({ address: CONTRACTS.drill,   abi: DRILL_ABI,   client: pub })
      const [as, ds] = await Promise.all([
        Promise.all(aIds.map(async id => { const a = await ac.read.attrs([BigInt(id)]); return { tokenId: id, strength: Number(a.strength), element: Number(a.element) } })),
        Promise.all(dIds.map(async id => { const a = await dc.read.attrs([BigInt(id)]); return { tokenId: id, tier: Number(a.tier), affinity: Number(a.affinity) } })),
      ])
      setApostles(as); setDrills(ds)
    } catch {}
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [address])

  if (!address) return (
    <div style={{ height: '100%', overflow: 'hidden' }}>
      <div className="nc-state"><div className="nc-icon">💎</div><h3>请先连接钱包</h3><p>Connect wallet to view assets</p></div>
    </div>
  )

  const RES_LABELS = ['黄金','木材','水源','火焰','土地']

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <ResourceBar />
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: '#f1f5f9' }}>我的资产</h2>
            <p style={{ fontSize: 12, color: '#334155' }}>My Assets</p>
          </div>
          <button className="btn btn-sm" onClick={load} disabled={loading}>
            {loading ? <span className="spin-anim">◌</span> : '↻'} 刷新
          </button>
        </div>

        <div className="tabs">
          {[['tokens','💰 代币'],['apostles','🧙 使徒'],['drills','⛏ 钻头']].map(([id,l]) => (
            <button key={id} className={`tab-item${tab===id?' active':''}`} onClick={() => setTab(id)}>{l}</button>
          ))}
        </div>

        {tab === 'tokens' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 12 }}>
            <TokenCard label="RING" sublabel="主要货币 Main Currency" emoji="💎" color="#a78bfa" addr={CONTRACTS.ring} />
            {RES_KEYS.map((k, i) => (
              <TokenCard key={k} label={RES_NAMES_ZH[i]} sublabel="挖矿产出 Mining Reward"
                emoji={RES_EMOJIS[i]} color={RES_COLORS[i]} addr={CONTRACTS[k]} />
            ))}
          </div>
        )}

        {tab === 'apostles' && (
          !dep ? <div className="notice-bar"><span className="notice-icon">⚠</span>合约未部署</div> :
          loading ? <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(175px,1fr))',gap:12}}>{[...Array(4)].map((_,i)=><div key={i} className="skeleton" style={{height:190}}/>)}</div> :
          apostles.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🧙</div>
              <h4>暂无使徒</h4>
              <p>使徒是派往地块挖矿的工作者</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(175px,1fr))', gap: 12 }}>
              {apostles.map(a => (
                <div key={a.tokenId} style={{ background: '#1a2540', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 14, textAlign: 'center' }}>
                  <div style={{ fontSize: 38, marginBottom: 8 }}>🧙</div>
                  <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#334155', marginBottom: 6 }}>#{String(a.tokenId).padStart(4,'0')}</div>
                  <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden', margin: '0 8px 5px' }}>
                    <div style={{ height: '100%', width: `${a.strength}%`, background: 'linear-gradient(90deg,#f59e0b,#fbbf24)' }} />
                  </div>
                  <div style={{ fontSize: 13, color: '#fbbf24', fontWeight: 700 }}>力量 {a.strength}/100</div>
                  <div style={{ fontSize: 11, color: RES_COLORS[a.element], marginTop: 4 }}>
                    {RES_EMOJIS[a.element]} {RES_LABELS[a.element]} 属性
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {tab === 'drills' && (
          !dep ? <div className="notice-bar"><span className="notice-icon">⚠</span>合约未部署</div> :
          loading ? <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(175px,1fr))',gap:12}}>{[...Array(4)].map((_,i)=><div key={i} className="skeleton" style={{height:180}}/>)}</div> :
          drills.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">⛏</div>
              <h4>暂无钻头</h4>
              <p>钻头可以提升挖矿产出效率</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(175px,1fr))', gap: 12 }}>
              {drills.map(d => (
                <div key={d.tokenId} style={{ background: '#1a2540', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 14, textAlign: 'center' }}>
                  <div style={{ fontSize: 38, marginBottom: 8 }}>⛏</div>
                  <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#334155', marginBottom: 6 }}>#{String(d.tokenId).padStart(4,'0')}</div>
                  <div style={{ fontSize: 16, color: '#fbbf24', letterSpacing: 2, marginBottom: 4 }}>
                    {'★'.repeat(d.tier)}{'☆'.repeat(5 - d.tier)}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24' }}>{d.tier} 星钻头</div>
                  <div style={{ fontSize: 11, color: RES_COLORS[d.affinity], marginTop: 4 }}>
                    {RES_EMOJIS[d.affinity]} {RES_LABELS[d.affinity]}亲和 +{d.tier * 20}%
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}
