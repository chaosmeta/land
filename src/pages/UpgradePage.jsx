import { useState, useEffect, useCallback } from 'react'
import { usePublicClient, useAccount, useWalletClient } from '../contexts/WalletContext.jsx'
import { formatEther, encodeFunctionData, parseEther } from 'viem'
import { CONTRACTS } from '../constants/contracts'
import './UpgradePage.css'

// ── 升级合约地址（部署后填入）──────────────────────────────────────────
// 暂时为空，等管理员部署后填入
const UPGRADE_ADDR = '0xd8083a57b479bb920d52f0db2257936023b49ea7'

// ── ABIs ──────────────────────────────────────────────────────────────────
const ERC20_ABI = [
  { type:'function', name:'balanceOf', inputs:[{name:'a',type:'address'}], outputs:[{type:'uint256'}], stateMutability:'view' },
  { type:'function', name:'allowance', inputs:[{name:'o',type:'address'},{name:'s',type:'address'}], outputs:[{type:'uint256'}], stateMutability:'view' },
  { type:'function', name:'approve', inputs:[{name:'s',type:'address'},{name:'a',type:'uint256'}], outputs:[{type:'bool'}], stateMutability:'nonpayable' },
]
const APO_ABI = [
  { type:'function', name:'attrs', inputs:[{name:'id',type:'uint256'}], outputs:[{name:'strength',type:'uint8'},{name:'element',type:'uint8'},{name:'gender',type:'uint8'},{name:'gen',type:'uint16'},{name:'genes',type:'uint64'},{name:'birthTime',type:'uint64'},{name:'cooldown',type:'uint64'},{name:'motherId',type:'uint32'},{name:'fatherId',type:'uint32'}], stateMutability:'view' },
  { type:'function', name:'ownerOf', inputs:[{name:'id',type:'uint256'}], outputs:[{type:'address'}], stateMutability:'view' },
  { type:'function', name:'nextId', inputs:[], outputs:[{type:'uint256'}], stateMutability:'view' },
]
const DRL_ABI = [
  { type:'function', name:'attrs', inputs:[{name:'id',type:'uint256'}], outputs:[{name:'tier',type:'uint8'},{name:'affinity',type:'uint8'}], stateMutability:'view' },
  { type:'function', name:'ownerOf', inputs:[{name:'id',type:'uint256'}], outputs:[{type:'address'}], stateMutability:'view' },
  { type:'function', name:'nextId', inputs:[], outputs:[{type:'uint256'}], stateMutability:'view' },
  { type:'function', name:'isApprovedForAll', inputs:[{name:'o',type:'address'},{name:'s',type:'address'}], outputs:[{type:'bool'}], stateMutability:'view' },
  { type:'function', name:'setApprovalForAll', inputs:[{name:'op',type:'address'},{name:'v',type:'bool'}], outputs:[], stateMutability:'nonpayable' },
]
const UPGRADE_ABI = [
  { type:'function', name:'upgradeApostle', inputs:[{name:'apostleId',type:'uint256'},{name:'currentStar',type:'uint8'}], outputs:[], stateMutability:'nonpayable' },
  { type:'function', name:'mergedrills', inputs:[{name:'drillIds',type:'uint256[3]'}], outputs:[], stateMutability:'nonpayable' },
  { type:'function', name:'chargeLand', inputs:[{name:'landId',type:'uint256'},{name:'element',type:'uint8'}], outputs:[], stateMutability:'nonpayable' },
  { type:'function', name:'apostleUpgradeCost', inputs:[{name:'',type:'uint256'}], outputs:[{type:'uint256'}], stateMutability:'view' },
  { type:'function', name:'drillMergeCost', inputs:[{name:'',type:'uint256'}], outputs:[{type:'uint256'}], stateMutability:'view' },
  { type:'function', name:'landChargeCost', inputs:[{name:'',type:'uint256'}], outputs:[{type:'uint256'}], stateMutability:'view' },
  { type:'function', name:'chargeCountdown', inputs:[{name:'landId',type:'uint256'}], outputs:[{type:'uint256'}], stateMutability:'view' },
]
const LAND_ABI = [
  { type:'function', name:'ownerOf', inputs:[{name:'id',type:'uint256'}], outputs:[{type:'address'}], stateMutability:'view' },
  { type:'function', name:'getRate', inputs:[{name:'id',type:'uint256'},{name:'res',type:'uint8'}], outputs:[{type:'uint16'}], stateMutability:'view' },
  { type:'function', name:'isApprovedForAll', inputs:[{name:'o',type:'address'},{name:'s',type:'address'}], outputs:[{type:'bool'}], stateMutability:'view' },
  { type:'function', name:'setApprovalForAll', inputs:[{name:'op',type:'address'},{name:'v',type:'bool'}], outputs:[], stateMutability:'nonpayable' },
]

const ELEM_NAMES = ['金', '木', '水', '火', '土']
const ELEM_COLORS = ['#f59e0b','#22c55e','#3b82f6','#ef4444','#a78bfa']
const ELEM_TOKENS = ['GOLD','WOOD','HHO','FIRE','SIOO']
const ELEM_ADDRS = () => [CONTRACTS.gold, CONTRACTS.wood, CONTRACTS.water, CONTRACTS.fire, CONTRACTS.soil]

const fmtR = (w, dp=2) => w ? Number(formatEther(w)).toFixed(dp) : '0'

// 升级费用静态表（与合约一致）
const APO_COSTS  = [0, 100, 200, 400, 800]    // 消耗元素数量
const DRILL_COSTS = [0, 300, 600, 1200, 2400]
const LAND_COSTS  = [500, 2000, 8000]
const GRADE_NAMES = ['C级', 'B级', 'A级', 'S级']

function getGrade(rate) {
  if (rate >= 80) return 3
  if (rate >= 60) return 2
  if (rate >= 40) return 1
  return 0
}

// ──────────────────────────────────────────────────────────────────────────
// Tab 1：使徒升星
// ──────────────────────────────────────────────────────────────────────────
function ApostleUpgradeTab({ pc, address, wc }) {
  const [apoId, setApoId] = useState('')
  const [apoData, setApoData] = useState(null)
  const [elemBal, setElemBal] = useState(0n)
  const [msg, setMsg] = useState({ text: '', ok: true })
  const [busy, setBusy] = useState(false)

  const lookup = useCallback(async () => {
    if (!pc || !apoId || isNaN(apoId)) return
    try {
      const id = BigInt(apoId)
      const [owner, attrs] = await Promise.all([
        pc.readContract({ address: CONTRACTS.apostle, abi: APO_ABI, functionName: 'ownerOf', args: [id] }).catch(() => null),
        pc.readContract({ address: CONTRACTS.apostle, abi: APO_ABI, functionName: 'attrs', args: [id] }).catch(() => null),
      ])
      if (!owner || !attrs) { setApoData(null); return }
      const bal = await pc.readContract({ address: ELEM_ADDRS()[Number(attrs[1])], abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }).catch(() => 0n)
      setApoData({ id: Number(apoId), owner, strength: Number(attrs[0]), element: Number(attrs[1]), gen: Number(attrs[3]) })
      setElemBal(bal)
    } catch { setApoData(null) }
  }, [pc, apoId, address])

  useEffect(() => { if (apoId) lookup() }, [lookup])

  // 使徒"星级"根据力量划分：1星1-30, 2星31-50, 3星51-70, 4星71-85, 5星86-100
  const getStar = (str) => {
    if (str <= 30) return 1
    if (str <= 50) return 2
    if (str <= 70) return 3
    if (str <= 85) return 4
    return 5
  }

  async function doUpgrade() {
    if (!wc || !apoData || !UPGRADE_ADDR) { setMsg({ text: '升级合约未部署，请联系管理员', ok: false }); return }
    const curStar = getStar(apoData.strength)
    if (curStar >= 5) { setMsg({ text: '已是满星，无法继续升级', ok: false }); return }
    if (apoData.owner.toLowerCase() !== address?.toLowerCase()) { setMsg({ text: '不是你的使徒', ok: false }); return }
    const cost = parseEther(String(APO_COSTS[curStar]))
    if (elemBal < cost) { setMsg({ text: `元素不足！需要 ${APO_COSTS[curStar]}，当前 ${fmtR(elemBal)}`, ok: false }); return }
    setBusy(true)
    try {
      const elemAddr = ELEM_ADDRS()[apoData.element]
      const allow = await pc.readContract({ address: elemAddr, abi: ERC20_ABI, functionName: 'allowance', args: [address, UPGRADE_ADDR] })
      if (allow < cost) {
        setMsg({ text: '授权元素...', ok: true })
        const h = await wc.sendTransaction({ to: elemAddr, data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [UPGRADE_ADDR, cost * 10n] }) })
        await pc.waitForTransactionReceipt({ hash: h })
      }
      setMsg({ text: '升星中...', ok: true })
      const h = await wc.sendTransaction({ to: UPGRADE_ADDR, data: encodeFunctionData({ abi: UPGRADE_ABI, functionName: 'upgradeApostle', args: [BigInt(apoData.id), curStar] }) })
      await pc.waitForTransactionReceipt({ hash: h })
      setMsg({ text: `✅ 升星成功！使徒 #${apoData.id} 已从 ${curStar}星 升到 ${curStar+1}星`, ok: true })
      lookup()
    } catch (e) {
      setMsg({ text: '❌ ' + (e.shortMessage || e.message), ok: false })
    } finally { setBusy(false) }
  }

  return (
    <div>
      <div className="up-section">
        <div className="up-section-title">🧙 使徒升星</div>
        <div className="up-desc">
          消耗与使徒相同属性的元素 token 提升使徒力量。升星效果显著——传奇使徒(86-100力量)挖矿效率×1.4。
        </div>
        <table className="up-cost-table">
          <thead><tr><th>当前星级</th><th>力量范围</th><th>消耗元素</th><th>升后效率</th></tr></thead>
          <tbody>
            {[[1,'1-30',100,'×0.85'],[2,'31-50',200,'×1.0'],[3,'51-70',400,'×1.1'],[4,'71-85',800,'×1.4']].map(([s,r,c,e]) => (
              <tr key={s}><td>{s}★</td><td>{r}</td><td>{c} 元素</td><td>{e}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="up-form">
          <div>
            <div className="up-label">使徒 ID</div>
            <input className="up-input" placeholder="输入使徒 ID..." value={apoId} onChange={e => setApoId(e.target.value)} type="number" min="1" />
          </div>
          {apoData && (
            <div className="up-info-grid">
              <div className="up-info-card"><div className="up-info-label">当前力量</div><div className="up-info-value" style={{color: '#c0a0ff'}}>{apoData.strength}</div></div>
              <div className="up-info-card"><div className="up-info-label">当前星级</div><div className="up-info-value">{'★'.repeat(getStar(apoData.strength))}</div></div>
              <div className="up-info-card"><div className="up-info-label">属性</div><div className="up-info-value" style={{color: ELEM_COLORS[apoData.element]}}>{ELEM_NAMES[apoData.element]}系</div></div>
              <div className="up-info-card"><div className="up-info-label">{ELEM_TOKENS[apoData.element]} 余额</div><div className="up-info-value">{fmtR(elemBal)}</div></div>
              <div className="up-info-card"><div className="up-info-label">升星消耗</div><div className="up-info-value">{getStar(apoData.strength) < 5 ? APO_COSTS[getStar(apoData.strength)] : '已满星'}</div></div>
            </div>
          )}
          {msg.text && <div className={`up-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
          <button className="up-btn up-btn-primary" onClick={doUpgrade} disabled={busy || !apoData || getStar(apoData?.strength||0) >= 5 || !address}>
            {busy ? '处理中...' : `⬆️ 升星 (消耗 ${apoData ? APO_COSTS[getStar(apoData.strength)] : '?'} ${apoData ? ELEM_TOKENS[apoData.element] : '元素'})`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Tab 2：钻头合成升星
// ──────────────────────────────────────────────────────────────────────────
function DrillMergeTab({ pc, address, wc }) {
  const [drillIds, setDrillIds] = useState(['', '', ''])
  const [drillData, setDrillData] = useState([null, null, null])
  const [elemBal, setElemBal] = useState(0n)
  const [msg, setMsg] = useState({ text: '', ok: true })
  const [busy, setBusy] = useState(false)

  const lookupDrill = useCallback(async (idx, id) => {
    if (!pc || !id || isNaN(id)) return
    try {
      const [owner, attrs] = await Promise.all([
        pc.readContract({ address: CONTRACTS.drill, abi: DRL_ABI, functionName: 'ownerOf', args: [BigInt(id)] }).catch(() => null),
        pc.readContract({ address: CONTRACTS.drill, abi: DRL_ABI, functionName: 'attrs', args: [BigInt(id)] }).catch(() => null),
      ])
      const nd = [...drillData]
      nd[idx] = attrs ? { id: Number(id), owner, tier: Number(attrs[0]), affinity: Number(attrs[1]) } : null
      setDrillData(nd)
      if (attrs) {
        const bal = await pc.readContract({ address: ELEM_ADDRS()[Number(attrs[1])], abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }).catch(() => 0n)
        setElemBal(bal)
      }
    } catch { const nd = [...drillData]; nd[idx] = null; setDrillData(nd) }
  }, [pc, address, drillData])

  const allValid = drillData.every(d => d !== null) &&
    drillData[0] && drillData[1] && drillData[2] &&
    drillData[0].tier === drillData[1].tier && drillData[1].tier === drillData[2].tier &&
    drillData[0].affinity === drillData[1].affinity && drillData[1].affinity === drillData[2].affinity &&
    drillData.every(d => d?.owner?.toLowerCase() === address?.toLowerCase())

  async function doMerge() {
    if (!wc || !allValid || !UPGRADE_ADDR) { setMsg({ text: '升级合约未部署', ok: false }); return }
    const tier = drillData[0].tier
    const aff  = drillData[0].affinity
    const cost = parseEther(String(DRILL_COSTS[tier]))
    if (elemBal < cost) { setMsg({ text: `元素不足！需要 ${DRILL_COSTS[tier]}`, ok: false }); return }
    setBusy(true)
    try {
      // 授权升级合约操作钻头
      const isAppr = await pc.readContract({ address: CONTRACTS.drill, abi: DRL_ABI, functionName: 'isApprovedForAll', args: [address, UPGRADE_ADDR] })
      if (!isAppr) {
        setMsg({ text: '授权钻头...', ok: true })
        const h = await wc.sendTransaction({ to: CONTRACTS.drill, data: encodeFunctionData({ abi: DRL_ABI, functionName: 'setApprovalForAll', args: [UPGRADE_ADDR, true] }) })
        await pc.waitForTransactionReceipt({ hash: h })
      }
      // 授权元素
      const elemAddr = ELEM_ADDRS()[aff]
      const allow = await pc.readContract({ address: elemAddr, abi: ERC20_ABI, functionName: 'allowance', args: [address, UPGRADE_ADDR] })
      if (allow < cost) {
        setMsg({ text: '授权元素...', ok: true })
        const h = await wc.sendTransaction({ to: elemAddr, data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [UPGRADE_ADDR, cost * 10n] }) })
        await pc.waitForTransactionReceipt({ hash: h })
      }
      setMsg({ text: '合成中...', ok: true })
      const ids = [BigInt(drillIds[0]), BigInt(drillIds[1]), BigInt(drillIds[2])]
      const h = await wc.sendTransaction({ to: UPGRADE_ADDR, data: encodeFunctionData({ abi: UPGRADE_ABI, functionName: 'mergedrills', args: [ids] }) })
      await pc.waitForTransactionReceipt({ hash: h })
      setMsg({ text: `✅ 合成成功！3个${tier}★钻头 → 1个${tier+1}★钻头`, ok: true })
      setDrillIds(['','','']); setDrillData([null,null,null])
    } catch (e) { setMsg({ text: '❌ ' + (e.shortMessage || e.message), ok: false }) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <div className="up-section">
        <div className="up-section-title">⛏️ 钻头合成升星</div>
        <div className="up-desc">3个相同星级+相同属性的钻头 + 对应属性元素 → 1个高一星钻头。5星钻头产出加成×1.5。</div>
        <table className="up-cost-table">
          <thead><tr><th>合成目标</th><th>所需钻头</th><th>消耗元素</th></tr></thead>
          <tbody>
            {[[2,1,300],[3,2,600],[4,3,1200],[5,4,2400]].map(([to,from,c]) => (
              <tr key={to}><td>{to}★</td><td>3个{from}★同属性</td><td>{c} 元素</td></tr>
            ))}
          </tbody>
        </table>
        <div className="up-form">
          {[0,1,2].map(i => (
            <div key={i}>
              <div className="up-label">钻头 {i+1} ID</div>
              <input className="up-input" placeholder="输入钻头 ID..." type="number" min="1"
                value={drillIds[i]}
                onChange={e => {
                  const nd = [...drillIds]; nd[i] = e.target.value; setDrillIds(nd)
                  if (e.target.value) lookupDrill(i, e.target.value)
                }}
              />
              {drillData[i] && (
                <div style={{ fontSize: '.72rem', color: ELEM_COLORS[drillData[i].affinity], marginTop: 3 }}>
                  {drillData[i].owner?.toLowerCase() === address?.toLowerCase() ? '✅' : '❌ 不是你的'} {'★'.repeat(drillData[i].tier)} {ELEM_NAMES[drillData[i].affinity]}系
                </div>
              )}
            </div>
          ))}
          {allValid && (
            <div className="up-info-grid">
              <div className="up-info-card"><div className="up-info-label">合成目标</div><div className="up-info-value">{'★'.repeat((drillData[0]?.tier||0)+1)}</div></div>
              <div className="up-info-card"><div className="up-info-label">消耗元素</div><div className="up-info-value">{DRILL_COSTS[drillData[0]?.tier||0]} {ELEM_TOKENS[drillData[0]?.affinity||0]}</div></div>
              <div className="up-info-card"><div className="up-info-label">当前余额</div><div className="up-info-value">{fmtR(elemBal)}</div></div>
            </div>
          )}
          {!allValid && drillIds.some(id => id) && (
            <div className="up-msg err">3个钻头必须星级相同、属性相同，且均为你持有</div>
          )}
          {msg.text && <div className={`up-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
          <button className="up-btn up-btn-primary" onClick={doMerge} disabled={busy || !allValid || !address}>
            {busy ? '处理中...' : `🔨 合成升星`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Tab 3：地块充能
// ──────────────────────────────────────────────────────────────────────────
function LandChargeTab({ pc, address, wc }) {
  const [landId, setLandId] = useState('')
  const [landData, setLandData] = useState(null)
  const [selElem, setSelElem] = useState(0)
  const [countdown, setCountdown] = useState(0n)
  const [elemBals, setElemBals] = useState([0n,0n,0n,0n,0n])
  const [msg, setMsg] = useState({ text: '', ok: true })
  const [busy, setBusy] = useState(false)

  const lookup = useCallback(async () => {
    if (!pc || !landId || isNaN(landId)) return
    try {
      const id = BigInt(landId)
      const owner = await pc.readContract({ address: CONTRACTS.land, abi: LAND_ABI, functionName: 'ownerOf', args: [id] }).catch(() => null)
      if (!owner) { setLandData(null); return }
      const rates = await Promise.all([0,1,2,3,4].map(r => pc.readContract({ address: CONTRACTS.land, abi: LAND_ABI, functionName: 'getRate', args: [id, r] }).catch(() => 0)))
      const bals = await Promise.all(ELEM_ADDRS().map(a => pc.readContract({ address: a, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }).catch(() => 0n)))
      let cd = 0n
      if (UPGRADE_ADDR) cd = await pc.readContract({ address: UPGRADE_ADDR, abi: UPGRADE_ABI, functionName: 'chargeCountdown', args: [id] }).catch(() => 0n)
      setLandData({ id: Number(landId), owner, rates: rates.map(Number) })
      setElemBals(bals)
      setCountdown(cd)
    } catch { setLandData(null) }
  }, [pc, landId, address])

  useEffect(() => { if (landId) lookup() }, [lookup])

  const currentRate = landData?.rates[selElem] || 0
  const grade = getGrade(currentRate)
  const cost = LAND_COSTS[Math.min(grade, 2)]

  async function doCharge() {
    if (!wc || !landData || !UPGRADE_ADDR) { setMsg({ text: '升级合约未部署', ok: false }); return }
    if (landData.owner.toLowerCase() !== address?.toLowerCase()) { setMsg({ text: '不是你的土地', ok: false }); return }
    if (countdown > 0n) { setMsg({ text: `冷却中，还需等待 ${Math.floor(Number(countdown)/86400)} 天`, ok: false }); return }
    if (grade >= 3) { setMsg({ text: '该元素已达 S级，无法充能', ok: false }); return }
    const costWei = parseEther(String(cost))
    if (elemBals[selElem] < costWei) { setMsg({ text: `${ELEM_TOKENS[selElem]} 不足！需要 ${cost}`, ok: false }); return }
    setBusy(true)
    try {
      const elemAddr = ELEM_ADDRS()[selElem]
      const allow = await pc.readContract({ address: elemAddr, abi: ERC20_ABI, functionName: 'allowance', args: [address, UPGRADE_ADDR] })
      if (allow < costWei) {
        setMsg({ text: '授权元素...', ok: true })
        const h = await wc.sendTransaction({ to: elemAddr, data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [UPGRADE_ADDR, costWei * 10n] }) })
        await pc.waitForTransactionReceipt({ hash: h })
      }
      // 授权土地
      const landAppr = await pc.readContract({ address: CONTRACTS.land, abi: LAND_ABI, functionName: 'isApprovedForAll', args: [address, UPGRADE_ADDR] })
      if (!landAppr) {
        setMsg({ text: '授权土地...', ok: true })
        const h = await wc.sendTransaction({ to: CONTRACTS.land, data: encodeFunctionData({ abi: LAND_ABI, functionName: 'setApprovalForAll', args: [UPGRADE_ADDR, true] }) })
        await pc.waitForTransactionReceipt({ hash: h })
      }
      setMsg({ text: '充能中...', ok: true })
      const h = await wc.sendTransaction({ to: UPGRADE_ADDR, data: encodeFunctionData({ abi: UPGRADE_ABI, functionName: 'chargeLand', args: [BigInt(landData.id), selElem] }) })
      await pc.waitForTransactionReceipt({ hash: h })
      setMsg({ text: `✅ 充能成功！土地 #${landData.id} ${ELEM_NAMES[selElem]}系属性 +20`, ok: true })
      lookup()
    } catch (e) { setMsg({ text: '❌ ' + (e.shortMessage || e.message), ok: false }) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <div className="up-section">
        <div className="up-section-title">🏡 地块属性充能</div>
        <div className="up-desc">消耗对应属性元素为地块充能，提升该元素的产出属性值 +20。每个纪元（90天）可充能一次。</div>
        <table className="up-cost-table">
          <thead><tr><th>当前等级</th><th>属性范围</th><th>消耗元素</th><th>升后等级</th></tr></thead>
          <tbody>
            <tr><td>C级</td><td>&lt;40</td><td>500 元素</td><td>→ B级</td></tr>
            <tr><td>B级</td><td>40-59</td><td>2,000 元素</td><td>→ A级</td></tr>
            <tr><td>A级</td><td>60-79</td><td>8,000 元素</td><td>→ S级</td></tr>
          </tbody>
        </table>
        <div className="up-form">
          <div>
            <div className="up-label">土地 ID</div>
            <input className="up-input" placeholder="输入土地 ID..." type="number" min="1" value={landId} onChange={e => setLandId(e.target.value)} />
          </div>
          <div>
            <div className="up-label">选择充能元素</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ELEM_NAMES.map((n, i) => (
                <button key={i} className={`up-btn ${selElem === i ? 'up-btn-primary' : 'up-btn-secondary'}`}
                  style={{ padding: '.3rem .7rem', borderColor: ELEM_COLORS[i] + '66' }}
                  onClick={() => setSelElem(i)}>
                  {n}系
                </button>
              ))}
            </div>
          </div>
          {landData && (
            <div className="up-info-grid">
              <div className="up-info-card"><div className="up-info-label">当前属性值</div><div className="up-info-value" style={{color: ELEM_COLORS[selElem]}}>{currentRate}</div></div>
              <div className="up-info-card"><div className="up-info-label">当前等级</div><div className="up-info-value">{GRADE_NAMES[grade]}</div></div>
              <div className="up-info-card"><div className="up-info-label">需要元素</div><div className="up-info-value">{grade < 3 ? cost : 'MAX'}</div></div>
              <div className="up-info-card"><div className="up-info-label">{ELEM_TOKENS[selElem]} 余额</div><div className="up-info-value">{fmtR(elemBals[selElem])}</div></div>
              {countdown > 0n && <div className="up-info-card"><div className="up-info-label">冷却剩余</div><div className="up-info-value" style={{color:'#f0c040'}}>{Math.floor(Number(countdown)/86400)}天</div></div>}
            </div>
          )}
          {msg.text && <div className={`up-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
          <button className="up-btn up-btn-primary" onClick={doCharge} disabled={busy || !landData || grade >= 3 || countdown > 0n || !address}>
            {busy ? '处理中...' : `⚡ 充能 (消耗 ${cost} ${ELEM_TOKENS[selElem]})`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// 主页面
// ──────────────────────────────────────────────────────────────────────────
const TABS = [
  { k: 'apostle', label: '🧙 使徒升星' },
  { k: 'drill',   label: '⛏️ 钻头合成' },
  { k: 'land',    label: '🏡 地块充能' },
]

export default function UpgradePage() {
  const pc = usePublicClient()
  const { address } = useAccount()
  const { data: wc } = useWalletClient()
  const [tab, setTab] = useState('apostle')

  if (!address) return (
    <div style={{ padding: 32, textAlign: 'center', color: '#5040a0' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
      请先连接钱包
    </div>
  )

  return (
    <div className="up-root">
      <div className="up-header">
        <h1 className="up-title">⬆️ 升级系统</h1>
        <p className="up-subtitle">消耗元素资源升级你的 NFT · 元素的内生消耗价值锚定</p>
        {!UPGRADE_ADDR && (
          <div style={{ fontSize: '.72rem', color: '#f0a040', background: '#1a0f00', border: '1px solid #4a2a00', borderRadius: 8, padding: '6px 10px', marginTop: 8 }}>
            ⚠️ 升级合约尚未部署，管理员需先部署 UpgradeSystem.sol 并填入合约地址
          </div>
        )}
      </div>
      <div className="up-tabs">
        {TABS.map(t => (
          <button key={t.k} className={`up-tab${tab === t.k ? ' on' : ''}`} onClick={() => setTab(t.k)}>{t.label}</button>
        ))}
      </div>
      {tab === 'apostle' && <ApostleUpgradeTab pc={pc} address={address} wc={wc} />}
      {tab === 'drill'   && <DrillMergeTab    pc={pc} address={address} wc={wc} />}
      {tab === 'land'    && <LandChargeTab    pc={pc} address={address} wc={wc} />}
    </div>
  )
}
