import { useState, useEffect, useCallback } from 'react'
import { usePublicClient, useAccount, useWalletClient } from '../contexts/WalletContext.jsx'
import { formatEther, encodeFunctionData, parseEther } from 'viem'
import { CONTRACTS } from '../constants/contracts'
import { ELEMS, landImgUrl } from '../constants/images'
import './RentalPage.css'

// ── 租赁合约地址（部署后填入）──────────────────────────────────────────
const RENTAL_ADDR = '0x7fb3cdf115552721b3f19f06592c07c83f6c7858'

// ── ABIs ──────────────────────────────────────────────────────────────────
const RING_ABI = [
  { type:'function', name:'balanceOf', inputs:[{name:'a',type:'address'}], outputs:[{type:'uint256'}], stateMutability:'view' },
  { type:'function', name:'allowance', inputs:[{name:'o',type:'address'},{name:'s',type:'address'}], outputs:[{type:'uint256'}], stateMutability:'view' },
  { type:'function', name:'approve', inputs:[{name:'s',type:'address'},{name:'a',type:'uint256'}], outputs:[{type:'bool'}], stateMutability:'nonpayable' },
]
const LAND_ABI = [
  { type:'function', name:'ownerOf', inputs:[{name:'id',type:'uint256'}], outputs:[{type:'address'}], stateMutability:'view' },
  { type:'function', name:'getRate', inputs:[{name:'id',type:'uint256'},{name:'res',type:'uint8'}], outputs:[{type:'uint16'}], stateMutability:'view' },
  { type:'function', name:'isApprovedForAll', inputs:[{name:'o',type:'address'},{name:'s',type:'address'}], outputs:[{type:'bool'}], stateMutability:'view' },
  { type:'function', name:'setApprovalForAll', inputs:[{name:'op',type:'address'},{name:'v',type:'bool'}], outputs:[], stateMutability:'nonpayable' },
]
const RENTAL_ABI = [
  { type:'function', name:'depositAmount', inputs:[], outputs:[{type:'uint256'}], stateMutability:'view' },
  { type:'function', name:'listForRent', inputs:[{name:'landId',type:'uint256'},{name:'listPrice',type:'uint256'}], outputs:[], stateMutability:'nonpayable' },
  { type:'function', name:'unlist', inputs:[{name:'landId',type:'uint256'}], outputs:[], stateMutability:'nonpayable' },
  { type:'function', name:'rent', inputs:[{name:'landId',type:'uint256'}], outputs:[], stateMutability:'nonpayable' },
  { type:'function', name:'endRental', inputs:[{name:'landId',type:'uint256'}], outputs:[], stateMutability:'nonpayable' },
  { type:'function', name:'expireRental', inputs:[{name:'landId',type:'uint256'}], outputs:[], stateMutability:'nonpayable' },
  { type:'function', name:'listings', inputs:[{name:'landId',type:'uint256'}], outputs:[{name:'landOwner',type:'address'},{name:'listPrice',type:'uint256'},{name:'active',type:'bool'}], stateMutability:'view' },
  { type:'function', name:'getRental', inputs:[{name:'landId',type:'uint256'}], outputs:[{components:[{name:'tenant',type:'address'},{name:'landOwner',type:'address'},{name:'startTime',type:'uint256'},{name:'endTime',type:'uint256'},{name:'deposit',type:'uint256'}],type:'tuple'}], stateMutability:'view' },
  { type:'function', name:'timeRemaining', inputs:[{name:'landId',type:'uint256'}], outputs:[{type:'uint256'}], stateMutability:'view' },
  { type:'function', name:'getListedLands', inputs:[{name:'offset',type:'uint256'},{name:'limit',type:'uint256'}], outputs:[{name:'ids',type:'uint256[]'},{name:'info',type:'tuple[]'}], stateMutability:'view' },
]

const fmtR = (w, dp=2) => w ? Number(formatEther(w)).toFixed(dp) : '0'
const fmtDay = (s) => {
  const d = Math.floor(Number(s) / 86400)
  const h = Math.floor((Number(s) % 86400) / 3600)
  return d > 0 ? `${d}天${h}小时` : `${h}小时`
}

// ──────────────────────────────────────────────────────────────────────────
// 市场列表（租户视角）
// ──────────────────────────────────────────────────────────────────────────
function MarketTab({ pc, address, wc }) {
  const [listings, setListings] = useState([])
  const [deposit, setDeposit] = useState(50n * BigInt(1e18))
  const [ringBal, setRingBal] = useState(0n)
  const [msg, setMsg] = useState({ text: '', ok: true })
  const [busy, setBusy] = useState(null)

  const load = useCallback(async () => {
    if (!pc || !RENTAL_ADDR) return
    try {
      const dep = await pc.readContract({ address: RENTAL_ADDR, abi: RENTAL_ABI, functionName: 'depositAmount' }).catch(() => 50n * BigInt(1e18))
      setDeposit(dep)
      const [ids] = await pc.readContract({ address: RENTAL_ADDR, abi: RENTAL_ABI, functionName: 'getListedLands', args: [0n, 50n] }).catch(() => [[], []])
      if (!ids?.length) { setListings([]); return }
      const details = await Promise.all(ids.map(async id => {
        const [rates, rental, remaining] = await Promise.all([
          Promise.all([0,1,2,3,4].map(r => pc.readContract({ address: CONTRACTS.land, abi: LAND_ABI, functionName: 'getRate', args: [id, r] }).catch(() => 0))),
          pc.readContract({ address: RENTAL_ADDR, abi: RENTAL_ABI, functionName: 'getRental', args: [id] }).catch(() => null),
          pc.readContract({ address: RENTAL_ADDR, abi: RENTAL_ABI, functionName: 'timeRemaining', args: [id] }).catch(() => 0n),
        ])
        return { id: Number(id), rates: rates.map(Number), rental, remaining }
      }))
      setListings(details)
      if (address) {
        const bal = await pc.readContract({ address: CONTRACTS.ring, abi: RING_ABI, functionName: 'balanceOf', args: [address] }).catch(() => 0n)
        setRingBal(bal)
      }
    } catch (e) { console.error(e) }
  }, [pc, address])

  useEffect(() => { load() }, [load])

  async function doRent(landId) {
    if (!wc || !address) { setMsg({ text: '请先连接钱包', ok: false }); return }
    if (ringBal < deposit) { setMsg({ text: `RING 不足！需要 ${fmtR(deposit)} RING`, ok: false }); return }
    setBusy(landId)
    try {
      const allow = await pc.readContract({ address: CONTRACTS.ring, abi: RING_ABI, functionName: 'allowance', args: [address, RENTAL_ADDR] })
      if (allow < deposit) {
        setMsg({ text: '授权 RING...', ok: true })
        const h = await wc.sendTransaction({ to: CONTRACTS.ring, data: encodeFunctionData({ abi: RING_ABI, functionName: 'approve', args: [RENTAL_ADDR, deposit * 2n] }) })
        await pc.waitForTransactionReceipt({ hash: h })
      }
      setMsg({ text: '租赁中...', ok: true })
      const h = await wc.sendTransaction({ to: RENTAL_ADDR, data: encodeFunctionData({ abi: RENTAL_ABI, functionName: 'rent', args: [BigInt(landId)] }) })
      await pc.waitForTransactionReceipt({ hash: h })
      setMsg({ text: `✅ 成功租赁土地 #${landId}！有效期90天`, ok: true })
      load()
    } catch (e) { setMsg({ text: '❌ ' + (e.shortMessage || e.message), ok: false }) }
    finally { setBusy(null) }
  }

  if (!RENTAL_ADDR) return (
    <div className="rp-empty">租赁合约尚未部署<br/><span style={{fontSize:'.75rem'}}>管理员需先部署 LandRental.sol</span></div>
  )

  return (
    <div>
      <div className="rp-section">
        <div className="rp-section-title">🏪 可租赁地块</div>
        <div className="rp-desc">
          缴纳 <strong style={{color:'#c090ff'}}>{fmtR(deposit)} RING</strong> 押金 → 获得该地块3个月使用权
          · 挖矿产出 <strong style={{color:'#52c462'}}>70%</strong> 归你
          · <strong style={{color:'#f0c040'}}>30%</strong> 归土地持有者
          · 到期后押金返还（扣1 RING损耗费）
        </div>
        {msg.text && <div className={`rp-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
        {address && <div style={{fontSize:'.75rem',color:'#5040a0',marginBottom:12}}>你的 RING 余额：<span style={{color:'#c090ff'}}>{fmtR(ringBal)}</span></div>}
      </div>
      {listings.length === 0 ? (
        <div className="rp-empty">暂无可租赁地块</div>
      ) : (
        <div className="rp-grid">
          {listings.map(l => {
            const isRented = l.remaining > 0n
            const isMyRental = l.rental?.tenant?.toLowerCase() === address?.toLowerCase()
            return (
              <div key={l.id} className="rp-card">
                <img src={landImgUrl(l.id)} alt="land" style={{width:'100%',height:80,objectFit:'cover',borderRadius:8}}/>
                <div className="rp-card-title">土地 #{l.id}</div>
                <div className="rp-card-info">
                  {l.rates.map((r, i) => r > 0 && (
                    <span key={i} style={{color: ELEMS[i].color, marginRight: 6}}>
                      {ELEMS[i].name}: {r}
                    </span>
                  ))}
                </div>
                {isRented ? (
                  <>
                    <div className="rp-card-status rented">📌 租用中</div>
                    <div className="rp-timer">⏱ 剩余 {fmtDay(l.remaining)}</div>
                    {isMyRental && (
                      <button className="rp-btn rp-btn-danger" onClick={async () => {
                        const h = await wc.sendTransaction({ to: RENTAL_ADDR, data: encodeFunctionData({ abi: RENTAL_ABI, functionName: 'endRental', args: [BigInt(l.id)] }) })
                        await pc.waitForTransactionReceipt({ hash: h })
                        load()
                      }}>提前结束（返还押金）</button>
                    )}
                  </>
                ) : (
                  <>
                    <div className="rp-card-status available">✅ 可租赁</div>
                    <div style={{fontSize:'.72rem',color:'#4a3a7a'}}>押金：{fmtR(deposit)} RING · 租期90天</div>
                    <button className="rp-btn rp-btn-primary" onClick={() => doRent(l.id)} disabled={busy === l.id || !address}>
                      {busy === l.id ? '处理中...' : '🏡 立即租赁'}
                    </button>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// 我的挂单（地主视角）
// ──────────────────────────────────────────────────────────────────────────
function MyListingsTab({ pc, address, wc }) {
  const [landId, setLandId] = useState('')
  const [listPrice, setListPrice] = useState('0')
  const [msg, setMsg] = useState({ text: '', ok: true })
  const [busy, setBusy] = useState(false)

  async function doList() {
    if (!wc || !landId) { setMsg({ text: '请输入土地ID', ok: false }); return }
    if (!RENTAL_ADDR) { setMsg({ text: '租赁合约未部署', ok: false }); return }
    setBusy(true)
    try {
      const id = BigInt(landId)
      const owner = await pc.readContract({ address: CONTRACTS.land, abi: LAND_ABI, functionName: 'ownerOf', args: [id] }).catch(() => null)
      if (!owner || owner.toLowerCase() !== address.toLowerCase()) { setMsg({ text: '不是你的土地', ok: false }); setBusy(false); return }
      const isAppr = await pc.readContract({ address: CONTRACTS.land, abi: LAND_ABI, functionName: 'isApprovedForAll', args: [address, RENTAL_ADDR] })
      if (!isAppr) {
        setMsg({ text: '授权土地合约...', ok: true })
        const h = await wc.sendTransaction({ to: CONTRACTS.land, data: encodeFunctionData({ abi: LAND_ABI, functionName: 'setApprovalForAll', args: [RENTAL_ADDR, true] }) })
        await pc.waitForTransactionReceipt({ hash: h })
      }
      setMsg({ text: '挂单中...', ok: true })
      const price = listPrice ? parseEther(listPrice) : 0n
      const h = await wc.sendTransaction({ to: RENTAL_ADDR, data: encodeFunctionData({ abi: RENTAL_ABI, functionName: 'listForRent', args: [id, price] }) })
      await pc.waitForTransactionReceipt({ hash: h })
      setMsg({ text: `✅ 土地 #${landId} 已挂出租赁！`, ok: true })
      setLandId('')
    } catch (e) { setMsg({ text: '❌ ' + (e.shortMessage || e.message), ok: false }) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <div className="rp-section">
        <div className="rp-section-title">🏠 挂出我的土地供租赁</div>
        <div className="rp-desc">
          挂出地块后你的土地将由租户使用，你获得：
          租户挖矿产出的 <strong style={{color:'#f0c040'}}>30%</strong> + 月租金（如设置）+ <strong style={{color:'#c090ff'}}>1 RING</strong> 损耗费。
          土地在租期内无法取回，但租期结束后自动归还。
        </div>
        <div className="rp-form">
          <div>
            <div className="rp-label">土地 ID</div>
            <input className="rp-input" type="number" min="1" placeholder="输入你持有的土地ID" value={landId} onChange={e => setLandId(e.target.value)} />
          </div>
          <div>
            <div className="rp-label">月租金（RING，选填，0=仅靠产出分成）</div>
            <input className="rp-input" type="number" min="0" step="0.1" placeholder="0" value={listPrice} onChange={e => setListPrice(e.target.value)} />
          </div>
          {msg.text && <div className={`rp-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
          <button className="rp-btn rp-btn-primary" onClick={doList} disabled={busy || !address || !landId}>
            {busy ? '处理中...' : '📋 挂出租赁'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// 主页面
// ──────────────────────────────────────────────────────────────────────────
export default function RentalPage() {
  const pc = usePublicClient()
  const { address } = useAccount()
  const { data: wc } = useWalletClient()
  const [tab, setTab] = useState('market')

  return (
    <div className="rp-root">
      <div className="rp-header">
        <h1 className="rp-title">🏘 土地租赁市场</h1>
        <p className="rp-subtitle">无需购买地块，缴押金即可挖矿 · 地主获得被动收入</p>
      </div>
      <div className="rp-tabs">
        <button className={`rp-tab${tab==='market'?' on':''}`} onClick={() => setTab('market')}>🏪 可租地块</button>
        <button className={`rp-tab${tab==='mylist'?' on':''}`} onClick={() => setTab('mylist')}>🏠 挂出我的地块</button>
      </div>
      {tab === 'market'  && <MarketTab     pc={pc} address={address} wc={wc} />}
      {tab === 'mylist'  && <MyListingsTab pc={pc} address={address} wc={wc} />}
    </div>
  )
}
