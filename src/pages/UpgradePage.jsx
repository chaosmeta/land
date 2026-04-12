import { useState, useEffect, useCallback } from 'react'
import { usePublicClient, useAccount, useWalletClient } from '../contexts/WalletContext.jsx'
import { useLang } from '../contexts/LangContext.jsx'
import { formatEther, encodeFunctionData, parseEther } from 'viem'
import { CONTRACTS } from '../constants/contracts'
import './UpgradePage.css'

const UPGRADE_ADDR = '0xd8083a57b479bb920d52f0db2257936023b49ea7'
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
  { type:'function', name:'chargeCountdown', inputs:[{name:'landId',type:'uint256'}], outputs:[{type:'uint256'}], stateMutability:'view' },
]
const LAND_ABI = [
  { type:'function', name:'ownerOf', inputs:[{name:'id',type:'uint256'}], outputs:[{type:'address'}], stateMutability:'view' },
  { type:'function', name:'getRate', inputs:[{name:'id',type:'uint256'},{name:'res',type:'uint8'}], outputs:[{type:'uint16'}], stateMutability:'view' },
  { type:'function', name:'isApprovedForAll', inputs:[{name:'o',type:'address'},{name:'s',type:'address'}], outputs:[{type:'bool'}], stateMutability:'view' },
  { type:'function', name:'setApprovalForAll', inputs:[{name:'op',type:'address'},{name:'v',type:'bool'}], outputs:[], stateMutability:'nonpayable' },
]

const ELEM_NAMES_ZH = ['金','木','水','火','土']
const ELEM_NAMES_EN = ['Gold','Wood','Water','Fire','Soil']
const ELEM_COLORS   = ['#f59e0b','#22c55e','#3b82f6','#ef4444','#a78bfa']
const ELEM_TOKENS   = ['GOLD','WOOD','HHO','FIRE','SIOO']
const ELEM_ADDRS    = () => [CONTRACTS.gold, CONTRACTS.wood, CONTRACTS.water, CONTRACTS.fire, CONTRACTS.soil]
const fmtR = (w, dp=2) => w ? Number(formatEther(w)).toFixed(dp) : '0'
const APO_COSTS   = [0, 100, 200, 400, 800]
const DRILL_COSTS = [0, 300, 600, 1200, 2400]
const LAND_COSTS  = [500, 2000, 8000]
function getGrade(r){ return r>=80?3:r>=60?2:r>=40?1:0 }
function getStar(s){ return s<=30?1:s<=50?2:s<=70?3:s<=85?4:5 }

async function scanMyNFTs(pc, address, contract, abi) {
  const nextId = Number(await pc.readContract({ address: contract, abi, functionName: 'nextId' }))
  const BATCH = 50, myIds = []
  for (let s = 1; s < nextId; s += BATCH) {
    const ids = Array.from({ length: Math.min(BATCH, nextId-s) }, (_, i) => s+i)
    const res = await pc.multicall({
      contracts: ids.map(id => ({ address: contract, abi: [{ type:'function', name:'ownerOf', inputs:[{name:'id',type:'uint256'}], outputs:[{type:'address'}], stateMutability:'view' }], functionName:'ownerOf', args:[BigInt(id)] })),
      allowFailure: true
    })
    ids.forEach((id, i) => { if (res[i]?.result?.toLowerCase() === address.toLowerCase()) myIds.push(id) })
  }
  return myIds
}

function ApostleUpgradeTab({ pc, address, wc }) {
  const { t, lang } = useLang()
  const EN = lang !== 'zh'
  const [myApos, setMyApos]   = useState([])
  const [selId,  setSelId]    = useState('')
  const [elemBal, setElemBal] = useState(0n)
  const [msg,    setMsg]      = useState({ text:'', ok:true })
  const [busy,   setBusy]     = useState(false)
  const [loading,setLoading]  = useState(false)

  useEffect(() => {
    if (!pc || !address) return
    setLoading(true)
    scanMyNFTs(pc, address, CONTRACTS.apostle, APO_ABI).then(async ids => {
      const attrRes = await pc.multicall({
        contracts: ids.map(id => ({ address:CONTRACTS.apostle, abi:APO_ABI, functionName:'attrs', args:[BigInt(id)] })),
        allowFailure: true
      })
      const list = ids.map((id, i) => {
        const a = attrRes[i]?.result
        return a ? { id, strength: Number(a[0]), element: Number(a[1]) } : null
      }).filter(Boolean).filter(x => getStar(x.strength) < 5)
      setMyApos(list)
      if (list.length > 0 && !selId) setSelId(String(list[0].id))
    }).finally(() => setLoading(false))
  }, [pc, address])

  const apo = myApos.find(a => String(a.id) === selId) || null
  const star = apo ? getStar(apo.strength) : 0
  const cost = apo ? APO_COSTS[star] : 0

  useEffect(() => {
    if (!apo || !pc || !address) return
    pc.readContract({ address: ELEM_ADDRS()[apo.element], abi: ERC20_ABI, functionName: 'balanceOf', args: [address] })
      .then(b => setElemBal(b)).catch(() => setElemBal(0n))
  }, [apo, pc, address])

  async function doUpgrade() {
    if (!wc || !apo) return
    const costWei = parseEther(String(cost))
    if (elemBal < costWei) { setMsg({ text: t(`元素不足！需要 ${cost}，当前 ${fmtR(elemBal)}`,`Insufficient! Need ${cost}, have ${fmtR(elemBal)}`), ok:false }); return }
    setBusy(true)
    try {
      const elemAddr = ELEM_ADDRS()[apo.element]
      const allow = await pc.readContract({ address:elemAddr, abi:ERC20_ABI, functionName:'allowance', args:[address, UPGRADE_ADDR] })
      if (allow < costWei) {
        setMsg({ text: t('授权元素...','Approving element token...'), ok:true })
        const h = await wc.sendTransaction({ to:elemAddr, data:encodeFunctionData({ abi:ERC20_ABI, functionName:'approve', args:[UPGRADE_ADDR, costWei*10n] }) })
        await pc.waitForTransactionReceipt({ hash:h })
      }
      setMsg({ text: t('升星中...','Upgrading...'), ok:true })
      const h = await wc.sendTransaction({ to:UPGRADE_ADDR, data:encodeFunctionData({ abi:UPGRADE_ABI, functionName:'upgradeApostle', args:[BigInt(apo.id), star] }) })
      await pc.waitForTransactionReceipt({ hash:h })
      setMsg({ text: t(`✅ 使徒 #${apo.id} 升星成功！${star}★ → ${star+1}★`,`✅ Apostle #${apo.id} upgraded! ${star}★ → ${star+1}★`), ok:true })
      const newApos = myApos.map(a => a.id === apo.id ? { ...a, strength: Math.min(a.strength+15, 100) } : a)
      setMyApos(newApos.filter(x => getStar(x.strength) < 5))
    } catch(e) { setMsg({ text:'❌ '+(e.shortMessage||e.message), ok:false }) }
    finally { setBusy(false) }
  }

  const starRows = [[1,'1-30',100],[2,'31-50',200],[3,'51-70',400],[4,'71-85',800]]

  return (
    <div className="up-section">
      <div className="up-section-title">🧙 {t('使徒升星','Apostle Upgrade')}</div>
      <div className="up-desc">{t('消耗与使徒同属性的元素 token 提升力量。每升一星力量+15，5星为满级。','Consume element tokens matching apostle affinity to boost strength. Each star adds +15 STR, max 5 stars.')}</div>
      <table className="up-cost-table">
        <thead><tr><th>{t('星级','Star')}</th><th>{t('力量','STR')}</th><th>{t('消耗','Cost')}</th></tr></thead>
        <tbody>
          {starRows.map(([s,r,c])=>(
            <tr key={s}><td>{s}★</td><td>{r}</td><td>{c} {t('元素','tokens')}</td></tr>
          ))}
        </tbody>
      </table>
      {loading ? <div className="up-loading">{t('扫描使徒中...','Scanning apostles...')}</div> : myApos.length === 0 ? (
        <div className="up-empty">{t('钱包中无可升星的使徒（5星已满级）','No upgradeable apostles (5★ is max)')}</div>
      ) : (
        <div className="up-form">
          <div>
            <div className="up-label">{t('选择使徒','Select Apostle')}</div>
            <select className="up-select" value={selId} onChange={e => setSelId(e.target.value)}>
              {myApos.map(a => (
                <option key={a.id} value={String(a.id)}>
                  #{a.id} — {getStar(a.strength)}★ {EN?ELEM_NAMES_EN[a.element]:ELEM_NAMES_ZH[a.element]} {t('力量','STR')}{a.strength}
                </option>
              ))}
            </select>
          </div>
          {apo && (
            <div className="up-info-grid">
              <div className="up-info-card"><div className="up-info-label">{t('力量','STR')}</div><div className="up-info-value" style={{color:'#c0a0ff'}}>{apo.strength}</div></div>
              <div className="up-info-card"><div className="up-info-label">{t('星级','Star')}</div><div className="up-info-value">{'★'.repeat(star)}</div></div>
              <div className="up-info-card"><div className="up-info-label">{t('属性','Element')}</div><div className="up-info-value" style={{color:ELEM_COLORS[apo.element]}}>{EN?ELEM_NAMES_EN[apo.element]:ELEM_NAMES_ZH[apo.element]}</div></div>
              <div className="up-info-card"><div className="up-info-label">{ELEM_TOKENS[apo.element]} {t('余额','Balance')}</div><div className="up-info-value">{fmtR(elemBal)}</div></div>
              <div className="up-info-card"><div className="up-info-label">{t('升星消耗','Upgrade Cost')}</div><div className="up-info-value">{cost} {ELEM_TOKENS[apo.element]}</div></div>
            </div>
          )}
          {msg.text && <div className={`up-msg ${msg.ok?'ok':'err'}`}>{msg.text}</div>}
          <button className="up-btn up-btn-primary" onClick={doUpgrade} disabled={busy||!apo||!address}>
            {busy ? t('处理中...','Processing...') : `⬆️ ${t('升星','Upgrade')} (${t('消耗','Cost')} ${cost} ${apo?ELEM_TOKENS[apo.element]:''})`}
          </button>
        </div>
      )}
    </div>
  )
}

function DrillMergeTab({ pc, address, wc }) {
  const { t, lang } = useLang()
  const EN = lang !== 'zh'
  const [myDrills, setMyDrills] = useState([])
  const [selIds,   setSelIds]   = useState(['', '', ''])
  const [elemBal,  setElemBal]  = useState(0n)
  const [msg,      setMsg]      = useState({ text:'', ok:true })
  const [busy,     setBusy]     = useState(false)
  const [loading,  setLoading]  = useState(false)

  useEffect(() => {
    if (!pc || !address) return
    setLoading(true)
    scanMyNFTs(pc, address, CONTRACTS.drill, DRL_ABI).then(async ids => {
      const attrRes = await pc.multicall({
        contracts: ids.map(id => ({ address:CONTRACTS.drill, abi:DRL_ABI, functionName:'attrs', args:[BigInt(id)] })),
        allowFailure: true
      })
      const list = ids.map((id, i) => {
        const a = attrRes[i]?.result
        return a ? { id, tier: Number(a[0]), affinity: Number(a[1]) } : null
      }).filter(Boolean).filter(x => x.tier < 5)
      setMyDrills(list)
    }).finally(() => setLoading(false))
  }, [pc, address])

  const drillData = selIds.map(sid => myDrills.find(d => String(d.id) === sid) || null)
  const allValid = drillData.every(Boolean) &&
    drillData[0].tier === drillData[1].tier && drillData[1].tier === drillData[2].tier &&
    drillData[0].affinity === drillData[1].affinity && drillData[1].affinity === drillData[2].affinity &&
    new Set(selIds).size === 3
  const tier = drillData[0]?.tier || 0
  const aff  = drillData[0]?.affinity || 0
  const cost = allValid ? DRILL_COSTS[tier] : 0

  useEffect(() => {
    if (!allValid || !pc || !address) return
    pc.readContract({ address: ELEM_ADDRS()[aff], abi: ERC20_ABI, functionName: 'balanceOf', args: [address] })
      .then(b => setElemBal(b)).catch(() => setElemBal(0n))
  }, [allValid, aff, pc, address])

  const groupedOptions = (slotIdx) => {
    const otherSel = selIds.filter((_, i) => i !== slotIdx)
    return myDrills.filter(d => !otherSel.includes(String(d.id)))
  }

  async function doMerge() {
    if (!wc || !allValid) return
    const costWei = parseEther(String(cost))
    if (elemBal < costWei) { setMsg({ text: t(`元素不足！需要 ${cost}`,`Insufficient! Need ${cost}`), ok:false }); return }
    setBusy(true)
    try {
      const isAppr = await pc.readContract({ address:CONTRACTS.drill, abi:DRL_ABI, functionName:'isApprovedForAll', args:[address, UPGRADE_ADDR] })
      if (!isAppr) {
        setMsg({ text: t('授权钻头...','Approving drill...'), ok:true })
        const h = await wc.sendTransaction({ to:CONTRACTS.drill, data:encodeFunctionData({ abi:DRL_ABI, functionName:'setApprovalForAll', args:[UPGRADE_ADDR, true] }) })
        await pc.waitForTransactionReceipt({ hash:h })
      }
      const elemAddr = ELEM_ADDRS()[aff]
      const allow = await pc.readContract({ address:elemAddr, abi:ERC20_ABI, functionName:'allowance', args:[address, UPGRADE_ADDR] })
      if (allow < costWei) {
        setMsg({ text: t('授权元素...','Approving element...'), ok:true })
        const h = await wc.sendTransaction({ to:elemAddr, data:encodeFunctionData({ abi:ERC20_ABI, functionName:'approve', args:[UPGRADE_ADDR, costWei*10n] }) })
        await pc.waitForTransactionReceipt({ hash:h })
      }
      setMsg({ text: t('合成中...','Merging...'), ok:true })
      const ids = selIds.map(id => BigInt(id))
      const h = await wc.sendTransaction({ to:UPGRADE_ADDR, data:encodeFunctionData({ abi:UPGRADE_ABI, functionName:'mergedrills', args:[ids] }) })
      await pc.waitForTransactionReceipt({ hash:h })
      setMsg({ text: t(`✅ 合成成功！3个${tier}★ → 1个${tier+1}★钻头`,`✅ Merged! 3×${tier}★ → 1×${tier+1}★ drill`), ok:true })
      setMyDrills(prev => prev.filter(d => !selIds.includes(String(d.id))))
      setSelIds(['','',''])
    } catch(e) { setMsg({ text:'❌ '+(e.shortMessage||e.message), ok:false }) }
    finally { setBusy(false) }
  }

  const mergeRows = [[2,1,300],[3,2,600],[4,3,1200],[5,4,2400]]

  return (
    <div className="up-section">
      <div className="up-section-title">⛏️ {t('钻头合成','Drill Merge')}</div>
      <div className="up-desc">{t('选3个相同星级+相同属性的钻头合成高一星。5星钻头产出加成×1.5。','Select 3 drills of same star + same affinity to merge up. 5★ drill gives ×1.5 output boost.')}</div>
      <table className="up-cost-table">
        <thead><tr><th>{t('目标','Target')}</th><th>{t('材料','Material')}</th><th>{t('消耗元素','Element Cost')}</th></tr></thead>
        <tbody>
          {mergeRows.map(([to,from,c])=>(
            <tr key={to}><td>{to}★</td><td>{t(`3个${from}★同属性`,`3×${from}★ same affinity`)}</td><td>{c}</td></tr>
          ))}
        </tbody>
      </table>
      {loading ? <div className="up-loading">{t('扫描钻头中...','Scanning drills...')}</div> : myDrills.length < 3 ? (
        <div className="up-empty">{t('至少需要3个相同星级+属性的钻头才能合成','Need at least 3 drills of same star + affinity to merge')}</div>
      ) : (
        <div className="up-form">
          {[0,1,2].map(i => (
            <div key={i}>
              <div className="up-label">{t('钻头','Drill')} {i+1}</div>
              <select className="up-select" value={selIds[i]} onChange={e => {
                const ns = [...selIds]; ns[i] = e.target.value; setSelIds(ns)
              }}>
                <option value="">{t('— 选择钻头 —','— Select Drill —')}</option>
                {groupedOptions(i).map(d => (
                  <option key={d.id} value={String(d.id)}>
                    #{d.id} — {'★'.repeat(d.tier)} {EN?ELEM_NAMES_EN[d.affinity]:ELEM_NAMES_ZH[d.affinity]}
                  </option>
                ))}
              </select>
            </div>
          ))}
          {allValid && (
            <div className="up-info-grid">
              <div className="up-info-card"><div className="up-info-label">{t('合成目标','Target')}</div><div className="up-info-value">{'★'.repeat(tier+1)} {EN?ELEM_NAMES_EN[aff]:ELEM_NAMES_ZH[aff]}</div></div>
              <div className="up-info-card"><div className="up-info-label">{t('消耗元素','Element Cost')}</div><div className="up-info-value">{cost} {ELEM_TOKENS[aff]}</div></div>
              <div className="up-info-card"><div className="up-info-label">{t('元素余额','Balance')}</div><div className="up-info-value">{fmtR(elemBal)}</div></div>
            </div>
          )}
          {!allValid && selIds.some(s => s) && (
            <div className="up-msg err">{t('3个钻头需星级相同、属性相同，且各不相同','3 drills must be same star, same affinity, and each different')}</div>
          )}
          {msg.text && <div className={`up-msg ${msg.ok?'ok':'err'}`}>{msg.text}</div>}
          <button className="up-btn up-btn-primary" onClick={doMerge} disabled={busy||!allValid||!address}>
            {busy ? t('处理中...','Processing...') : `🔨 ${t('合成升星','Merge Upgrade')}`}
          </button>
        </div>
      )}
    </div>
  )
}

function LandChargeTab({ pc, address, wc }) {
  const { t, lang } = useLang()
  const EN = lang !== 'zh'
  const GRADE_NAMES_ZH = ['C级','B级','A级','S级']
  const GRADE_NAMES_EN = ['Grade C','Grade B','Grade A','Grade S']
  const [myLands,   setMyLands]  = useState([])
  const [selId,     setSelId]    = useState('')
  const [selElem,   setSelElem]  = useState(0)
  const [countdown, setCountdown]= useState(0n)
  const [elemBals,  setElemBals] = useState([0n,0n,0n,0n,0n])
  const [msg,       setMsg]      = useState({ text:'', ok:true })
  const [busy,      setBusy]     = useState(false)
  const [loading,   setLoading]  = useState(false)

  useEffect(() => {
    if (!pc || !address) return
    setLoading(true)
    const allIds = []
    for (let x = 0; x < 12; x++) for (let y = 0; y < 5; y++) allIds.push(x*100+y+1)
    pc.multicall({
      contracts: allIds.map(id => ({ address:CONTRACTS.land, abi:LAND_ABI, functionName:'ownerOf', args:[BigInt(id)] })),
      allowFailure: true
    }).then(async ownerRes => {
      const myIds = allIds.filter((_, i) => ownerRes[i]?.result?.toLowerCase() === address.toLowerCase())
      if (!myIds.length) { setMyLands([]); setLoading(false); return }
      const rateReqs = myIds.flatMap(id => [0,1,2,3,4].map(r => ({ address:CONTRACTS.land, abi:LAND_ABI, functionName:'getRate', args:[BigInt(id), r] })))
      const rateRes = await pc.multicall({ contracts: rateReqs, allowFailure: true })
      const list = myIds.map((id, i) => ({
        id, rates: [0,1,2,3,4].map(r => Number(rateRes[i*5+r]?.result ?? 0))
      }))
      setMyLands(list)
      if (list.length > 0 && !selId) setSelId(String(list[0].id))
    }).finally(() => setLoading(false))
  }, [pc, address])

  const land = myLands.find(l => String(l.id) === selId) || null

  useEffect(() => {
    if (!land || !pc || !address) return
    Promise.all([
      ...ELEM_ADDRS().map(a => pc.readContract({ address:a, abi:ERC20_ABI, functionName:'balanceOf', args:[address] }).catch(()=>0n)),
      pc.readContract({ address:UPGRADE_ADDR, abi:UPGRADE_ABI, functionName:'chargeCountdown', args:[BigInt(land.id)] }).catch(()=>0n)
    ]).then(res => { setElemBals(res.slice(0,5)); setCountdown(res[5]) })
  }, [land, pc, address])

  const currentRate = land?.rates[selElem] ?? 0
  const grade = getGrade(currentRate)
  const cost  = LAND_COSTS[Math.min(grade, 2)]

  async function doCharge() {
    if (!wc || !land) return
    if (countdown > 0n) { setMsg({ text: t(`冷却中，还需 ${Math.ceil(Number(countdown)/86400)} 天`,`Cooldown: ${Math.ceil(Number(countdown)/86400)} days left`), ok:false }); return }
    if (grade >= 3) { setMsg({ text: t('该元素已达S级，无法充能','This element is already Grade S'), ok:false }); return }
    const costWei = parseEther(String(cost))
    if (elemBals[selElem] < costWei) { setMsg({ text: t(`${ELEM_TOKENS[selElem]} 不足！需要 ${cost}`,`Insufficient ${ELEM_TOKENS[selElem]}! Need ${cost}`), ok:false }); return }
    setBusy(true)
    try {
      const elemAddr = ELEM_ADDRS()[selElem]
      const allow = await pc.readContract({ address:elemAddr, abi:ERC20_ABI, functionName:'allowance', args:[address, UPGRADE_ADDR] })
      if (allow < costWei) {
        setMsg({ text: t('授权元素...','Approving element...'), ok:true })
        const h = await wc.sendTransaction({ to:elemAddr, data:encodeFunctionData({ abi:ERC20_ABI, functionName:'approve', args:[UPGRADE_ADDR, costWei*10n] }) })
        await pc.waitForTransactionReceipt({ hash:h })
      }
      const landAppr = await pc.readContract({ address:CONTRACTS.land, abi:LAND_ABI, functionName:'isApprovedForAll', args:[address, UPGRADE_ADDR] })
      if (!landAppr) {
        setMsg({ text: t('授权土地...','Approving land...'), ok:true })
        const h = await wc.sendTransaction({ to:CONTRACTS.land, data:encodeFunctionData({ abi:LAND_ABI, functionName:'setApprovalForAll', args:[UPGRADE_ADDR, true] }) })
        await pc.waitForTransactionReceipt({ hash:h })
      }
      setMsg({ text: t('充能中...','Charging...'), ok:true })
      const h = await wc.sendTransaction({ to:UPGRADE_ADDR, data:encodeFunctionData({ abi:UPGRADE_ABI, functionName:'chargeLand', args:[BigInt(land.id), selElem] }) })
      await pc.waitForTransactionReceipt({ hash:h })
      setMsg({ text: t(`✅ 土地 #${land.id} ${ELEM_NAMES_ZH[selElem]}系 +20 充能成功！`,`✅ Land #${land.id} ${ELEM_NAMES_EN[selElem]} +20 charge success!`), ok:true })
      setMyLands(prev => prev.map(l => l.id === land.id
        ? { ...l, rates: l.rates.map((r,i) => i===selElem ? r+20 : r) } : l))
    } catch(e) { setMsg({ text:'❌ '+(e.shortMessage||e.message), ok:false }) }
    finally { setBusy(false) }
  }

  const chargeRows = [['C→B','<40',500],['B→A','40-59',2000],['A→S','60-79',8000]]

  return (
    <div className="up-section">
      <div className="up-section-title">🏡 {t('地块充能','Land Charge')}</div>
      <div className="up-desc">{t('消耗元素提升地块属性值 +20。每90天可充能一次。','Consume elements to boost land attribute by +20. Can charge once every 90 days.')}</div>
      <table className="up-cost-table">
        <thead><tr><th>{t('等级','Grade')}</th><th>{t('属性','Attr')}</th><th>{t('消耗','Cost')}</th></tr></thead>
        <tbody>
          {chargeRows.map(([g,r,c])=>(
            <tr key={g}><td>{g}</td><td>{r}</td><td>{c} {t('元素','tokens')}</td></tr>
          ))}
        </tbody>
      </table>
      {loading ? <div className="up-loading">{t('扫描地块中...','Scanning lands...')}</div> : myLands.length === 0 ? (
        <div className="up-empty">{t('钱包中无地块','No lands in wallet')}</div>
      ) : (
        <div className="up-form">
          <div>
            <div className="up-label">{t('选择地块','Select Land')}</div>
            <select className="up-select" value={selId} onChange={e => setSelId(e.target.value)}>
              {myLands.map(l => (
                <option key={l.id} value={String(l.id)}>
                  #{l.id} — {[0,1,2,3,4].map(r=>`${EN?ELEM_NAMES_EN[r]:ELEM_NAMES_ZH[r]}:${l.rates[r]}`).join(' ')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="up-label">{t('选择充能元素','Select Element')}</div>
            <div className="up-elem-btns">
              {ELEM_NAMES_ZH.map((n, i) => (
                <button key={i} className={`up-btn ${selElem===i?'up-btn-primary':'up-btn-secondary'}`}
                  style={{ borderColor: ELEM_COLORS[i]+'66' }}
                  onClick={() => setSelElem(i)}>
                  {EN?ELEM_NAMES_EN[i]:n} {land ? land.rates[i] : ''}
                </button>
              ))}
            </div>
          </div>
          {land && (
            <div className="up-info-grid">
              <div className="up-info-card"><div className="up-info-label">{t('当前属性','Current Attr')}</div><div className="up-info-value" style={{color:ELEM_COLORS[selElem]}}>{currentRate}</div></div>
              <div className="up-info-card"><div className="up-info-label">{t('等级','Grade')}</div><div className="up-info-value">{EN?GRADE_NAMES_EN[grade]:GRADE_NAMES_ZH[grade]}</div></div>
              <div className="up-info-card"><div className="up-info-label">{t('消耗元素','Cost')}</div><div className="up-info-value">{grade<3?cost:'MAX'}</div></div>
              <div className="up-info-card"><div className="up-info-label">{ELEM_TOKENS[selElem]} {t('余额','Balance')}</div><div className="up-info-value">{fmtR(elemBals[selElem])}</div></div>
              {countdown>0n && <div className="up-info-card"><div className="up-info-label">{t('冷却剩余','Cooldown')}</div><div className="up-info-value" style={{color:'#f0c040'}}>{Math.ceil(Number(countdown)/86400)}{t('天','d')}</div></div>}
            </div>
          )}
          {msg.text && <div className={`up-msg ${msg.ok?'ok':'err'}`}>{msg.text}</div>}
          <button className="up-btn up-btn-primary" onClick={doCharge}
            disabled={busy||!land||grade>=3||countdown>0n||!address}>
            {busy ? t('处理中...','Processing...') : `⚡ ${t('充能','Charge')} (${cost} ${ELEM_TOKENS[selElem]})`}
          </button>
        </div>
      )}
    </div>
  )
}

export default function UpgradePage() {
  const pc = usePublicClient()
  const { address } = useAccount()
  const { data: wc } = useWalletClient()
  const { t } = useLang()
  const [tab, setTab] = useState('apostle')

  const TABS = [
    { k:'apostle', label:`🧙 ${t('使徒升星','Apostle Upgrade')}` },
    { k:'drill',   label:`⛏️ ${t('钻头合成','Drill Merge')}` },
    { k:'land',    label:`🏡 ${t('地块充能','Land Charge')}` },
  ]

  if (!address) return (
    <div style={{ padding:32, textAlign:'center', color:'#5040a0' }}>
      <div style={{ fontSize:40, marginBottom:12 }}>🔒</div>
      {t('请先连接钱包','Please connect wallet')}
    </div>
  )

  return (
    <div className="up-root">
      <div className="up-header">
        <h1 className="up-title">⬆️ {t('升级系统','Upgrade System')}</h1>
        <p className="up-subtitle">{t('从下拉列表选择你的 NFT 直接升级，无需输入 ID','Select your NFT from the dropdown to upgrade directly')}</p>
      </div>
      <div className="up-tabs">
        {TABS.map(tb => (
          <button key={tb.k} className={`up-tab${tab===tb.k?' on':''}`} onClick={() => setTab(tb.k)}>{tb.label}</button>
        ))}
      </div>
      {tab==='apostle' && <ApostleUpgradeTab pc={pc} address={address} wc={wc} />}
      {tab==='drill'   && <DrillMergeTab    pc={pc} address={address} wc={wc} />}
      {tab==='land'    && <LandChargeTab    pc={pc} address={address} wc={wc} />}
    </div>
  )
}
