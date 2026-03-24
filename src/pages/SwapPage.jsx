import { useState, useEffect, useCallback } from 'react'
import { useAccount, useWalletClient, usePublicClient } from '../contexts/WalletContext.jsx'
import { parseEther, formatEther, encodeFunctionData } from 'viem'
import { CONTRACTS, PANCAKE_ROUTER, WBNB } from '../constants/contracts'
import './SwapPage.css'

const ERC20_ABI = [
  { type:'function', name:'approve', inputs:[{name:'s',type:'address'},{name:'a',type:'uint256'}], outputs:[{type:'bool'}], stateMutability:'nonpayable' },
  { type:'function', name:'balanceOf', inputs:[{name:'a',type:'address'}], outputs:[{type:'uint256'}], stateMutability:'view' },
  { type:'function', name:'allowance', inputs:[{name:'o',type:'address'},{name:'s',type:'address'}], outputs:[{type:'uint256'}], stateMutability:'view' },
]

const ROUTER_ABI = [
  { type:'function', name:'getAmountsOut', inputs:[{name:'amountIn',type:'uint256'},{name:'path',type:'address[]'}], outputs:[{name:'amounts',type:'uint256[]'}], stateMutability:'view' },
  { type:'function', name:'swapExactTokensForTokens', inputs:[{name:'amountIn',type:'uint256'},{name:'amountOutMin',type:'uint256'},{name:'path',type:'address[]'},{name:'to',type:'address'},{name:'deadline',type:'uint256'}], outputs:[{type:'uint256[]'}], stateMutability:'nonpayable' },
  { type:'function', name:'swapExactETHForTokens', inputs:[{name:'amountOutMin',type:'uint256'},{name:'path',type:'address[]'},{name:'to',type:'address'},{name:'deadline',type:'uint256'}], outputs:[{type:'uint256[]'}], stateMutability:'payable' },
  { type:'function', name:'swapExactTokensForETH', inputs:[{name:'amountIn',type:'uint256'},{name:'amountOutMin',type:'uint256'},{name:'path',type:'address[]'},{name:'to',type:'address'},{name:'deadline',type:'uint256'}], outputs:[{type:'uint256[]'}], stateMutability:'nonpayable' },
]

const TOKENS = [
  { symbol:'BNB',  addr:null,            decimals:18 },
  { symbol:'RING', addr:CONTRACTS.ring,  decimals:18 },
  { symbol:'GOLD', addr:CONTRACTS.gold,  decimals:18 },
  { symbol:'WOOD', addr:CONTRACTS.wood,  decimals:18 },
  { symbol:'HHO',  addr:CONTRACTS.water, decimals:18 },
  { symbol:'FIRE', addr:CONTRACTS.fire,  decimals:18 },
  { symbol:'SIOO', addr:CONTRACTS.soil,  decimals:18 },
]

const SLIPPAGE_OPTIONS = [0.5, 1.0, 2.0]

function buildPath(from, to) {
  const f = from.addr ?? WBNB
  const t = to.addr ?? WBNB
  if (f === WBNB || t === WBNB) return [f, t]
  return [f, WBNB, t]
}

export default function SwapPage() {
  const { address } = useAccount()
  const { data: wc } = useWalletClient()
  const pc = usePublicClient()

  const [fromIdx, setFromIdx] = useState(0)
  const [toIdx,   setToIdx]   = useState(1)
  const [amountIn,  setAmountIn]  = useState('')
  const [amountOut, setAmountOut] = useState('')
  const [slippage,  setSlippage]  = useState(1.0)
  const [customSlip, setCustomSlip] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [balances, setBalances] = useState({})

  const fromToken = TOKENS[fromIdx]
  const toToken   = TOKENS[toIdx]

  // 加载余额
  const loadBalances = useCallback(async () => {
    if (!address || !pc) return
    const bals = {}
    // BNB 余额
    const bnb = await pc.getBalance({ address }).catch(() => 0n)
    bals['BNB'] = bnb
    // ERC20 余额
    for (const t of TOKENS) {
      if (!t.addr) continue
      const b = await pc.readContract({ address: t.addr, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }).catch(() => 0n)
      bals[t.symbol] = b
    }
    setBalances(bals)
  }, [address, pc])

  useEffect(() => { loadBalances() }, [loadBalances])

  // 报价
  useEffect(() => {
    if (!amountIn || !pc || Number(amountIn) <= 0) { setAmountOut(''); return }
    const path = buildPath(fromToken, toToken)
    let cancelled = false
    pc.readContract({
      address: PANCAKE_ROUTER, abi: ROUTER_ABI, functionName: 'getAmountsOut',
      args: [parseEther(amountIn), path],
    }).then(amounts => {
      if (!cancelled) setAmountOut(Number(formatEther(amounts[amounts.length - 1])).toFixed(6))
    }).catch(() => { if (!cancelled) setAmountOut('—') })
    return () => { cancelled = true }
  }, [amountIn, fromIdx, toIdx, pc])

  async function handleSwap() {
    if (!address) { alert('请先连接钱包'); return }
    if (!wc) { alert('钱包未连接'); return }
    if (!amountIn || Number(amountIn) <= 0) { alert('请输入金额'); return }
    if (fromIdx === toIdx) { alert('请选择不同的代币'); return }
    setLoading(true); setMsg('准备兑换...')
    try {
      const amIn = parseEther(amountIn)
      const path = buildPath(fromToken, toToken)
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200)
      const slip = Number(customSlip) || slippage
      // 获取最新报价计算最小输出
      const amounts = await pc.readContract({ address: PANCAKE_ROUTER, abi: ROUTER_ABI, functionName: 'getAmountsOut', args: [amIn, path] })
      const amOut = amounts[amounts.length - 1]
      const amMin = amOut * BigInt(Math.floor((100 - slip) * 100)) / 10000n

      if (fromToken.addr) {
        // 检查并设置授权
        const allowance = await pc.readContract({ address: fromToken.addr, abi: ERC20_ABI, functionName: 'allowance', args: [address, PANCAKE_ROUTER] }).catch(() => 0n)
        if (allowance < amIn) {
          setMsg('授权 ' + fromToken.symbol + '...')
          const h = await wc.sendTransaction({ to: fromToken.addr, data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [PANCAKE_ROUTER, amIn * 10n] }) })
          await pc.waitForTransactionReceipt({ hash: h })
        }
      }

      setMsg('兑换中...')
      let h
      if (!fromToken.addr) {
        // BNB → Token
        h = await wc.sendTransaction({ to: PANCAKE_ROUTER, value: amIn, data: encodeFunctionData({ abi: ROUTER_ABI, functionName: 'swapExactETHForTokens', args: [amMin, path, address, deadline] }) })
      } else if (!toToken.addr) {
        // Token → BNB
        h = await wc.sendTransaction({ to: PANCAKE_ROUTER, data: encodeFunctionData({ abi: ROUTER_ABI, functionName: 'swapExactTokensForETH', args: [amIn, amMin, path, address, deadline] }) })
      } else {
        // Token → Token
        h = await wc.sendTransaction({ to: PANCAKE_ROUTER, data: encodeFunctionData({ abi: ROUTER_ABI, functionName: 'swapExactTokensForTokens', args: [amIn, amMin, path, address, deadline] }) })
      }
      await pc.waitForTransactionReceipt({ hash: h })
      setMsg('✅ 兑换成功！')
      setAmountIn(''); setAmountOut('')
      setTimeout(() => { setMsg(''); loadBalances() }, 2000)
    } catch (e) {
      const m = e.shortMessage || e.message || ''
      if (m.includes('INSUFFICIENT_LIQUIDITY') || m.includes('insufficient')) {
        setMsg('❌ 流动性不足：该交易对在 PancakeSwap 上暂无流动性')
      } else {
        setMsg('❌ ' + m.slice(0, 100))
      }
    } finally { setLoading(false) }
  }

  const fmtBal = sym => {
    const b = balances[sym]
    if (b == null) return '—'
    return Number(formatEther(b)).toFixed(4)
  }

  return (
    <div className="swap-page">
      <div className="swap-card">
        <div className="swap-title">🔄 代币兑换</div>
        <div className="swap-notice" style={{fontSize:'.72rem',color:'#f0a040',background:'#1a1000',border:'1px solid #4a3000',borderRadius:8,padding:'8px 12px',marginBottom:12}}>
          ⚠️ 基于 PancakeSwap Testnet 路由。RING与各资源token的交易对需先在PancakeSwap添加流动性才能兑换。
        </div>
        {/* From */}
        <div className="swap-token-box">
          <div className="swap-label">卖出</div>
          <div className="swap-row">
            <select className="token-select" value={fromIdx} onChange={e => { setFromIdx(+e.target.value); setAmountIn(''); setAmountOut('') }}>
              {TOKENS.map((t,i) => <option key={t.symbol} value={i} disabled={i===toIdx}>{t.symbol}</option>)}
            </select>
            <input type="number" className="amount-input" placeholder="0.0" value={amountIn} onChange={e => setAmountIn(e.target.value)}/>
          </div>
          <div className="balance-row">余额: {fmtBal(fromToken.symbol)}</div>
        </div>
        {/* Arrow */}
        <button className="swap-arrow" onClick={() => { setFromIdx(toIdx); setToIdx(fromIdx); setAmountIn(''); setAmountOut('') }}>⇅</button>
        {/* To */}
        <div className="swap-token-box">
          <div className="swap-label">买入</div>
          <div className="swap-row">
            <select className="token-select" value={toIdx} onChange={e => { setToIdx(+e.target.value); setAmountOut('') }}>
              {TOKENS.map((t,i) => <option key={t.symbol} value={i} disabled={i===fromIdx}>{t.symbol}</option>)}
            </select>
            <input type="number" className="amount-input" placeholder="0.0" readOnly value={amountOut}/>
          </div>
          <div className="balance-row">余额: {fmtBal(toToken.symbol)}</div>
        </div>
        {/* Slippage */}
        <div className="slippage-row">
          <span>滑点:</span>
          {SLIPPAGE_OPTIONS.map(s => (
            <button key={s} className={`slip-btn${slippage===s&&!customSlip?' active':''}`} onClick={() => { setSlippage(s); setCustomSlip('') }}>{s}%</button>
          ))}
          <input className="slip-custom" placeholder="自定义%" value={customSlip} onChange={e => setCustomSlip(e.target.value)}/>
        </div>
        {msg && <div style={{fontSize:'.78rem',color:msg.startsWith('✅')?'#52c462':msg.startsWith('❌')?'#f06070':'#9080b0',margin:'8px 0',padding:'6px 10px',background:'#0d0a18',borderRadius:8}}>{msg}</div>}
        <button className="swap-btn" onClick={handleSwap} disabled={loading||!amountIn||!address}>
          {!address ? '请先连接钱包' : loading ? '处理中…' : '兑换'}
        </button>
        <div className="router-info" style={{fontSize:'.65rem',color:'#3a2860',marginTop:8,textAlign:'center'}}>
          路由: PancakeSwap Testnet ·&nbsp;
          <a href={`https://testnet.bscscan.com/address/${PANCAKE_ROUTER}`} target="_blank" rel="noreferrer" style={{color:'#5040a0'}}>
            {PANCAKE_ROUTER.slice(0,8)}…
          </a>
        </div>
      </div>
    </div>
  )
}
