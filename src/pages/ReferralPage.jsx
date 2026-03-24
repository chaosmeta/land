import { useState } from 'react'

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

function useWaitForTransactionReceipt({ hash } = {}) {
  const [data, setData] = React.useState(undefined)
  const [isLoading, setIsLoading] = React.useState(false)
  React.useEffect(() => {
    if (!hash) return
    setIsLoading(true)
    publicClient.waitForTransactionReceipt({ hash }).then(setData).catch(()=>{}).finally(()=>setIsLoading(false))
  }, [hash])
  return { data, isLoading }
}
// ────────────────────────────────────────────────────────────────────────────
import { useAccount } from '../contexts/WalletContext.jsx'

import { CONTRACTS, RESOURCE_TOKENS } from '../constants/contracts'
import { REFERRAL_ABI } from '../constants/abi'
import { formatEther } from 'viem'
import './ReferralPage.css'

const LEVEL_RATES = ['5%', '3%', '2%', '1%', '0.5%']
const LEVEL_COLORS = ['#f59e0b', '#94a3b8', '#cd7f32', '#60a5fa', '#a78bfa']

export default function ReferralPage() {
  const { address, isConnected } = useAccount()
  const [inputRef, setInputRef] = useState('')
  const [bindHash, setBindHash] = useState(null)
  const { writeContractAsync } = useWriteContract()
  const { isSuccess: bindSuccess } = useWaitForTransactionReceipt({ hash: bindHash })

  // Read on-chain data
  const { data, refetch } = useReadContracts({
    contracts: [
      { address: CONTRACTS.referral, abi: REFERRAL_ABI, functionName: 'bound',        args: [address ?? '0x0'] },
      { address: CONTRACTS.referral, abi: REFERRAL_ABI, functionName: 'referrer',      args: [address ?? '0x0'] },
      { address: CONTRACTS.referral, abi: REFERRAL_ABI, functionName: 'getAncestors',  args: [address ?? '0x0'] },
      { address: CONTRACTS.referral, abi: REFERRAL_ABI, functionName: 'getRates' },
      // Earnings per resource token
      ...RESOURCE_TOKENS.map(t => ({
        address: CONTRACTS.referral,
        abi: REFERRAL_ABI,
        functionName: 'earned',
        args: [address ?? '0x0', t.addr],
      })),
    ],
    query: { enabled: !!address, refetchInterval: 20_000 },
  })

  const isBound    = data?.[0]?.result ?? false
  const myReferrer = data?.[1]?.result ?? ''
  const ancestors  = data?.[2]?.result ?? []
  const rates      = data?.[3]?.result ?? []
  const earnings   = RESOURCE_TOKENS.map((t, i) => ({
    ...t,
    earned: data?.[4 + i]?.result ?? 0n,
  }))

  const refLink = address
    ? `${window.location.origin}?ref=${address}`
    : ''

  async function handleBind() {
    if (!inputRef || !inputRef.startsWith('0x')) return alert('请输入有效地址')
    try {
      const tx = await writeContractAsync({
        address: CONTRACTS.referral,
        abi: REFERRAL_ABI,
        functionName: 'bind',
        args: [inputRef],
      })
      setBindHash(tx)
    } catch (e) {
      alert(e.shortMessage || e.message)
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(refLink)
    alert('邀请链接已复制！')
  }

  if (!isConnected) {
    return <div className="referral-page"><div className="connect-prompt">请先连接钱包</div></div>
  }

  return (
    <div className="referral-page">
      {/* 我的邀请链接 */}
      <div className="ref-section">
        <h2>🤝 邀请系统</h2>
        <p className="ref-desc">邀请好友游玩，他们挖矿时你自动获得收益（5级奖励链）</p>
        <div className="ref-link-box">
          <input readOnly value={refLink} className="ref-link-input" />
          <button className="copy-btn" onClick={copyLink}>📋 复制</button>
        </div>
      </div>

      {/* 绑定邀请人 */}
      {!isBound && (
        <div className="ref-section">
          <h3>绑定邀请人</h3>
          <div className="bind-row">
            <input
              className="ref-input"
              placeholder="输入邀请人钱包地址 0x..."
              value={inputRef}
              onChange={e => setInputRef(e.target.value)}
            />
            <button className="bind-btn" onClick={handleBind}>确认绑定</button>
          </div>
          {bindSuccess && <p className="bind-ok">✅ 绑定成功！</p>}
        </div>
      )}

      {isBound && (
        <div className="ref-section bound-info">
          <h3>✅ 已绑定</h3>
          <p>我的邀请人：<code>{myReferrer}</code></p>
        </div>
      )}

      {/* 5级奖励率 */}
      <div className="ref-section">
        <h3>奖励率</h3>
        <div className="level-rates">
          {LEVEL_RATES.map((r, i) => (
            <div key={i} className="level-rate-card" style={{ borderLeft: `3px solid ${LEVEL_COLORS[i]}` }}>
              <span className="level-num">L{i + 1}</span>
              <span className="level-rate">{rates[i] ? (Number(rates[i]) / 100).toFixed(1) + '%' : r}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 我的上级链 */}
      {ancestors.filter(a => a && a !== '0x0000000000000000000000000000000000000000').length > 0 && (
        <div className="ref-section">
          <h3>上级链</h3>
          <div className="ancestor-chain">
            {ancestors.filter(a => a && a !== '0x0000000000000000000000000000000000000000').map((a, i) => (
              <div key={i} className="ancestor-item">
                <span className="ancestor-level" style={{ color: LEVEL_COLORS[i] }}>L{i + 1}</span>
                <a
                  href={`https://testnet.bscscan.com/address/${a}`}
                  target="_blank" rel="noreferrer"
                  className="ancestor-addr"
                >
                  {a.slice(0, 8)}…{a.slice(-6)}
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 我的挖矿收益 */}
      <div className="ref-section">
        <h3>📊 累计获得的邀请收益</h3>
        <div className="earnings-grid">
          {earnings.map(t => (
            <div key={t.key} className="earning-card">
              <span className="earning-icon">{t.icon}</span>
              <span className="earning-sym">{t.symbol}</span>
              <span className="earning-val">{parseFloat(formatEther(t.earned)).toFixed(6)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
