import { useState, useEffect } from 'react'

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

import { parseEther, formatEther, parseUnits } from 'viem'
import { CONTRACTS, PANCAKE_ROUTER, WBNB } from '../constants/contracts'
import { ERC20_ABI } from '../constants/abi'
import { useTokenBalances } from '../hooks/useTokenBalances'
import './SwapPage.css'

const PANCAKE_ROUTER_ABI = [
  'function getAmountsOut(uint256 amountIn, address[] calldata path) view returns (uint256[] memory)',
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) returns (uint256[] memory)',
  'function swapExactETHForTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) payable returns (uint256[] memory)',
  'function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) returns (uint256[] memory)',
]

const TOKENS = [
  { symbol: 'BNB',  addr: null,             decimals: 18 },
  { symbol: 'RING', addr: CONTRACTS.ring,   decimals: 18 },
  { symbol: 'GOLD', addr: CONTRACTS.gold,   decimals: 18 },
  { symbol: 'WOOD', addr: CONTRACTS.wood,   decimals: 18 },
  { symbol: 'HHO',  addr: CONTRACTS.water,  decimals: 18 },
  { symbol: 'FIRE', addr: CONTRACTS.fire,   decimals: 18 },
  { symbol: 'SIOO', addr: CONTRACTS.soil,   decimals: 18 },
]

const SLIPPAGE_OPTIONS = [0.1, 0.5, 1.0]

function buildPath(fromToken, toToken) {
  const from = fromToken.addr ?? WBNB
  const to   = toToken.addr ?? WBNB
  if (from === WBNB || to === WBNB) return [from, to]
  return [from, WBNB, to]
}

export default function SwapPage() {
  const { address } = useAccount()
  const [fromIdx, setFromIdx] = useState(0)  // BNB
  const [toIdx,   setToIdx]   = useState(1)  // RING
  const [amountIn,  setAmountIn]  = useState('')
  const [amountOut, setAmountOut] = useState('')
  const [slippage,  setSlippage]  = useState(0.5)
  const [customSlip, setCustomSlip] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [txHash,   setTxHash]   = useState(null)

  const { balances } = useTokenBalances()
  const { writeContractAsync } = useWriteContract()
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  const fromToken = TOKENS[fromIdx]
  const toToken   = TOKENS[toIdx]

  // Get quote from PancakeSwap
  const path = buildPath(fromToken, toToken)
  const amountInParsed = amountIn ? parseEther(amountIn) : 0n

  const { data: amountsOut } = useReadContract({
    address: PANCAKE_ROUTER,
    abi: PANCAKE_ROUTER_ABI,
    functionName: 'getAmountsOut',
    args: [amountInParsed > 0n ? amountInParsed : 1n, path],
    query: { enabled: amountInParsed > 0n, refetchInterval: 5000 },
  })

  useEffect(() => {
    if (amountsOut && amountsOut.length > 0) {
      setAmountOut(parseFloat(formatEther(amountsOut[amountsOut.length - 1])).toFixed(6))
    }
  }, [amountsOut])

  function swap(i, j) {
    setFromIdx(j); setToIdx(i)
    setAmountIn(''); setAmountOut('')
  }

  async function handleSwap() {
    if (!address || !amountIn) return alert('请先连接钱包并输入金额')
    setLoading(true)
    try {
      const amIn  = parseEther(amountIn)
      const amOut = amountsOut?.[amountsOut.length - 1] ?? 0n
      const slip  = BigInt(Math.floor((100 - (customSlip || slippage)) * 100))
      const amMin = amOut * slip / 10000n
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200)

      if (fromToken.addr) {
        // Token → approve first
        await writeContractAsync({
          address: fromToken.addr,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [PANCAKE_ROUTER, amIn],
        })
      }

      let tx
      if (!fromToken.addr) {
        // BNB → Token
        tx = await writeContractAsync({
          address: PANCAKE_ROUTER,
          abi: PANCAKE_ROUTER_ABI,
          functionName: 'swapExactETHForTokens',
          args: [amMin, path, address, deadline],
          value: amIn,
        })
      } else if (!toToken.addr) {
        // Token → BNB
        tx = await writeContractAsync({
          address: PANCAKE_ROUTER,
          abi: PANCAKE_ROUTER_ABI,
          functionName: 'swapExactTokensForETH',
          args: [amIn, amMin, path, address, deadline],
        })
      } else {
        // Token → Token
        tx = await writeContractAsync({
          address: PANCAKE_ROUTER,
          abi: PANCAKE_ROUTER_ABI,
          functionName: 'swapExactTokensForTokens',
          args: [amIn, amMin, path, address, deadline],
        })
      }
      setTxHash(tx)
    } catch (e) {
      alert(e.shortMessage || e.message)
    } finally {
      setLoading(false)
    }
  }

  const fromBal = fromToken.symbol === 'BNB' ? '—' : (balances[fromToken.symbol]?.formatted ?? '0')
  const toBal   = toToken.symbol   === 'BNB' ? '—' : (balances[toToken.symbol]?.formatted   ?? '0')

  return (
    <div className="swap-page">
      <div className="swap-card">
        <div className="swap-title">🔄 代币兑换</div>

        {/* From */}
        <div className="swap-token-box">
          <div className="swap-label">卖出</div>
          <div className="swap-row">
            <select className="token-select" value={fromIdx} onChange={e => setFromIdx(+e.target.value)}>
              {TOKENS.map((t, i) => i !== toIdx && <option key={t.symbol} value={i}>{t.symbol}</option>)}
            </select>
            <input
              type="number"
              className="amount-input"
              placeholder="0.0"
              value={amountIn}
              onChange={e => setAmountIn(e.target.value)}
            />
          </div>
          <div className="balance-row">余额: {fromBal}</div>
        </div>

        {/* Swap Arrow */}
        <button className="swap-arrow" onClick={() => swap(fromIdx, toIdx)}>⇅</button>

        {/* To */}
        <div className="swap-token-box">
          <div className="swap-label">买入</div>
          <div className="swap-row">
            <select className="token-select" value={toIdx} onChange={e => setToIdx(+e.target.value)}>
              {TOKENS.map((t, i) => i !== fromIdx && <option key={t.symbol} value={i}>{t.symbol}</option>)}
            </select>
            <input
              type="number"
              className="amount-input"
              placeholder="0.0"
              readOnly
              value={amountOut}
            />
          </div>
          <div className="balance-row">余额: {toBal}</div>
        </div>

        {/* Slippage */}
        <div className="slippage-row">
          <span>滑点容忍:</span>
          {SLIPPAGE_OPTIONS.map(s => (
            <button
              key={s}
              className={`slip-btn ${slippage === s && !customSlip ? 'active' : ''}`}
              onClick={() => { setSlippage(s); setCustomSlip('') }}
            >{s}%</button>
          ))}
          <input
            className="slip-custom"
            placeholder="自定义"
            value={customSlip}
            onChange={e => setCustomSlip(e.target.value)}
          />
        </div>

        {/* Swap Button */}
        <button
          className="swap-btn"
          onClick={handleSwap}
          disabled={loading || !amountIn || isSuccess}
        >
          {isSuccess ? '✅ 兑换成功' : loading ? '处理中…' : '兑换'}
        </button>

        {txHash && (
          <a
            className="tx-link"
            href={`https://testnet.bscscan.com/tx/${txHash}`}
            target="_blank" rel="noreferrer"
          >
            查看交易 ↗
          </a>
        )}

        {/* Router info */}
        <div className="router-info">
          路由: PancakeSwap Testnet ·
          <a href={`https://testnet.bscscan.com/address/${PANCAKE_ROUTER}`} target="_blank" rel="noreferrer">
            {PANCAKE_ROUTER.slice(0,8)}…
          </a>
        </div>
      </div>
    </div>
  )
}
