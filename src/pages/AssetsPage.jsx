import { useState, useEffect, useCallback } from 'react'
import { usePublicClient, useAccount, useWalletClient } from '../contexts/WalletContext.jsx'
import { formatEther, encodeFunctionData, parseEther, isAddress } from 'viem'
import { CONTRACTS, NFT_AUCTION_ADDR } from '../constants/contracts'
import { APO_EGG_GIF, drillImgUrl, landImgUrl, ELEM_SVGS, ELEMS, RING_SVG } from '../constants/images'
import './AssetsPage.css'

// ── ABIs ─────────────────────────────────────────────────────────────────
const ERC20_ABI=[
  {type:'function',name:'balanceOf',inputs:[{name:'a',type:'address'}],outputs:[{type:'uint256'}],stateMutability:'view'},
  {type:'function',name:'approve',inputs:[{name:'s',type:'address'},{name:'a',type:'uint256'}],outputs:[{type:'bool'}],stateMutability:'nonpayable'},
  {type:'function',name:'transfer',inputs:[{name:'to',type:'address'},{name:'amount',type:'uint256'}],outputs:[{type:'bool'}],stateMutability:'nonpayable'},
]
const NFT_ABI=[
  {type:'function',name:'setApprovalForAll',inputs:[{name:'op',type:'address'},{name:'v',type:'bool'}],outputs:[],stateMutability:'nonpayable'},
  {type:'function',name:'isApprovedForAll',inputs:[{name:'owner',type:'address'},{name:'op',type:'address'}],outputs:[{type:'bool'}],stateMutability:'view'},
  {type:'function',name:'safeTransferFrom',inputs:[{name:'from',type:'address'},{name:'to',type:'address'},{name:'id',type:'uint256'}],outputs:[],stateMutability:'nonpayable'},
]
const APO_ABI=[{type:'function',name:'attrs',inputs:[{name:'id',type:'uint256'}],outputs:[{name:'strength',type:'uint8'},{name:'element',type:'uint8'}],stateMutability:'view'}]
const DRL_ABI=[{type:'function',name:'attrs',inputs:[{name:'id',type:'uint256'}],outputs:[{name:'tier',type:'uint8'},{name:'affinity',type:'uint8'}],stateMutability:'view'}]
const LAND_ABI=[{type:'function',name:'resourceAttr',inputs:[{name:'id',type:'uint256'}],outputs:[{type:'uint80'}],stateMutability:'view'}]
const MINING_ABI=[
  {type:'function',name:'slotCount',inputs:[{name:'l',type:'uint256'}],outputs:[{type:'uint256'}],stateMutability:'view'},
  {type:'function',name:'slots',inputs:[{name:'l',type:'uint256'},{name:'i',type:'uint256'}],outputs:[{name:'apostleId',type:'uint256'},{name:'drillId',type:'uint256'},{name:'startTime',type:'uint256'},{name:'placer',type:'address'},{name:'isOwnerSlot',type:'bool'}],stateMutability:'view'},
  {type:'function',name:'pendingRewards',inputs:[{name:'l',type:'uint256'}],outputs:[{type:'uint256[5]'}],stateMutability:'view'},
  {type:'function',name:'pendingMinerRewards',inputs:[{name:'miner',type:'address'},{name:'l',type:'uint256'}],outputs:[{type:'uint256[5]'}],stateMutability:'view'},
  {type:'function',name:'claim',inputs:[{name:'l',type:'uint256'}],outputs:[],stateMutability:'nonpayable'},
  {type:'function',name:'claimMiner',inputs:[{name:'l',type:'uint256'}],outputs:[],stateMutability:'nonpayable'},
  {type:'function',name:'stopMining',inputs:[{name:'l',type:'uint256'},{name:'apostleId',type:'uint256'}],outputs:[],stateMutability:'nonpayable'},
  {type:'function',name:'landFeeBps',inputs:[],outputs:[{type:'uint256'}],stateMutability:'view'},
]
const AUC_ABI=[
  {type:'function',name:'createAuction',inputs:[{name:'id',type:'uint256'},{name:'sp',type:'uint128'},{name:'ep',type:'uint128'},{name:'dur',type:'uint64'}],outputs:[],stateMutability:'nonpayable'},
  {type:'function',name:'auctions',inputs:[{name:'id',type:'uint256'}],outputs:[{name:'seller',type:'address'},{name:'startPrice',type:'uint128'},{name:'endPrice',type:'uint128'},{name:'duration',type:'uint64'},{name:'startedAt',type:'uint64'}],stateMutability:'view'},
  {type:'function',name:'cancelAuction',inputs:[{name:'id',type:'uint256'}],outputs:[],stateMutability:'nonpayable'},
]
const NFT_AUC_ABI=[
  {type:'function',name:'createAuction',inputs:[{name:'nft',type:'address'},{name:'id',type:'uint256'},{name:'sp',type:'uint128'},{name:'ep',type:'uint128'},{name:'dur',type:'uint64'}],outputs:[],stateMutability:'nonpayable'},
  {type:'function',name:'getAuction',inputs:[{name:'nft',type:'address'},{name:'id',type:'uint256'}],outputs:[{components:[{name:'nftContract',type:'address'},{name:'seller',type:'address'},{name:'startPrice',type:'uint128'},{name:'endPrice',type:'uint128'},{name:'duration',type:'uint64'},{name:'startedAt',type:'uint64'}],type:'tuple'}],stateMutability:'view'},
  {type:'function',name:'cancelAuction',inputs:[{name:'nft',type:'address'},{name:'id',type:'uint256'}],outputs:[],stateMutability:'nonpayable'},
]
const BB_ABI=[
  {type:'function',name:'apostleBoxPrice',inputs:[],outputs:[{type:'uint256'}],stateMutability:'view'},
  {type:'function',name:'drillBoxPrice',inputs:[],outputs:[{type:'uint256'}],stateMutability:'view'},
  {type:'function',name:'buyApostleBox',inputs:[],outputs:[{type:'uint256'}],stateMutability:'nonpayable'},
  {type:'function',name:'buyDrillBox',inputs:[],outputs:[{type:'uint256'}],stateMutability:'nonpayable'},
]

// ── 工具 ──────────────────────────────────────────────────────────────────
function fmtR(w,dp=3){return w?Number(formatEther(w)).toFixed(dp):'0'}
function decodeAttr(a){if(!a)return[0,0,0,0,0];const b=BigInt(a);return[Number(b&0xffffn),Number((b>>16n)&0xffffn),Number((b>>32n)&0xffffn),Number((b>>48n)&0xffffn),Number((b>>64n)&0xffffn)]}
function ElemIcon({i,size=15}){return <img src={ELEM_SVGS[i]} alt={ELEMS[i].name} style={{width:size,height:size,verticalAlign:'middle'}}/>}

const TABS=[
  {k:'token',   label:'💰 代币'},
  {k:'blindbox',label:'🎁 盲盒'},
  {k:'land',    label:'🏡 地块'},
  {k:'apostle', label:'🧙 使徒'},
  {k:'drill',   label:'⛏️ 钻头'},
  {k:'mining',  label:'⚒️ 挖矿'},
]

// ── 通用转移弹窗（ERC20 / NFT 共用）─────────────────────────────────────
// type: 'erc20' | 'nft'
// 调用方提供: tokenContract, tokenId(nft), symbol(erc20), decimals(erc20), balance(erc20)
function TransferModal({ type, title, tokenContract, tokenId, symbol, balance, address, wc, pc, onClose, onDone }) {
  const [toAddr, setToAddr] = useState('')
  const [amount, setAmount] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const addrOk = isAddress(toAddr) && toAddr.toLowerCase() !== address?.toLowerCase()

  async function doTransfer() {
    if (!addrOk) { setMsg('❌ 地址无效'); return }
    if (!wc) { setMsg('❌ 请先连接钱包'); return }
    setBusy(true)
    try {
      let h
      if (type === 'erc20') {
        if (!amount || isNaN(amount) || Number(amount) <= 0) { setMsg('❌ 请输入有效金额'); setBusy(false); return }
        const amt = parseEther(amount)
        if (amt > balance) { setMsg('❌ 余额不足'); setBusy(false); return }
        setMsg('转账中...')
        h = await wc.sendTransaction({ to: tokenContract, data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'transfer', args: [toAddr, amt] }) })
      } else {
        setMsg('转移 NFT...')
        h = await wc.sendTransaction({ to: tokenContract, data: encodeFunctionData({ abi: NFT_ABI, functionName: 'safeTransferFrom', args: [address, toAddr, BigInt(tokenId)] }) })
      }
      await pc.waitForTransactionReceipt({ hash: h })
      setMsg('✅ 转移成功！')
      setTimeout(() => { onClose(); onDone?.() }, 1500)
    } catch (e) {
      setMsg('❌ ' + (e.shortMessage || e.message))
    } finally { setBusy(false) }
  }

  return (
    <div className="as-sell-overlay" onClick={onClose}>
      <div className="as-sell-modal" onClick={e => e.stopPropagation()} style={{ minWidth: 300 }}>
        <div style={{ fontWeight: 700, marginBottom: 10, color: '#c090ff' }}>📤 转移 {title}</div>
        <div style={{ fontSize: '.75rem', color: '#7060a0', marginBottom: 6 }}>接收地址</div>
        <input
          className="as-sell-input"
          placeholder="0x..."
          value={toAddr}
          onChange={e => setToAddr(e.target.value.trim())}
          style={{ marginBottom: 8, fontSize: '.8rem', fontFamily: 'monospace' }}
        />
        {type === 'erc20' && (
          <>
            <div style={{ fontSize: '.75rem', color: '#7060a0', marginBottom: 4 }}>
              金额 <span style={{ color: '#5040a0' }}>（余额 {fmtR(balance)} {symbol}）</span>
            </div>
            <input
              className="as-sell-input"
              type="number"
              placeholder={`最大 ${fmtR(balance)}`}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              min="0"
              step="any"
              style={{ marginBottom: 8 }}
            />
            <button
              style={{ fontSize: '.7rem', color: '#5040a0', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 8px', textDecoration: 'underline' }}
              onClick={() => setAmount(fmtR(balance, 6))}
            >全部转出</button>
          </>
        )}
        {msg && <div style={{ fontSize: '.78rem', color: msg.startsWith('✅') ? '#52c462' : '#f06070', margin: '4px 0 8px' }}>{msg}</div>}
        {!addrOk && toAddr.length > 5 && (
          <div style={{ fontSize: '.72rem', color: '#f06070', marginBottom: 6 }}>地址格式不正确</div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button className="as-btn-primary" style={{ padding: '.4rem .8rem', borderRadius: 8 }}
            onClick={doTransfer} disabled={busy || !addrOk}>
            {busy ? '处理中...' : '确认转移'}
          </button>
          <button className="as-btn-secondary" onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  )
}

// ── BlindBox Tab ──────────────────────────────────────────────────────────
function BlindBoxTab({pc, address, wc}){
  const [apoPx,setApoPx]=useState(null)
  const [drlPx,setDrlPx]=useState(null)
  const [buying,setBuying]=useState(null)
  const [msg,setMsg]=useState('')
  const [results,setResults]=useState([])
  const [count,setCount]=useState(1)
  useEffect(()=>{
    if(!pc) return
    Promise.all([
      pc.readContract({address:CONTRACTS.blindbox,abi:BB_ABI,functionName:'apostleBoxPrice'}).catch(()=>null),
      pc.readContract({address:CONTRACTS.blindbox,abi:BB_ABI,functionName:'drillBoxPrice'}).catch(()=>null),
    ]).then(([a,d])=>{ setApoPx(a); setDrlPx(d) })
  },[pc])
  async function buy(type){
    if(!wc||!address){ setMsg('请先连接钱包'); return }
    const price=type==='apostle'?apoPx:drlPx; if(!price) return
    const total=price*BigInt(count)
    setBuying(type); setMsg(`授权 ${fmtR(total)} RING...`)
    try{
      // approve 一次性授权足够的额度
      const h1=await wc.sendTransaction({to:CONTRACTS.ring,data:encodeFunctionData({abi:ERC20_ABI,functionName:'approve',args:[CONTRACTS.blindbox,total]})})
      await pc.waitForTransactionReceipt({hash:h1})
      // 合约不支持批量，循环单次调用
      const allNewIds=[]
      const buyFn=type==='apostle'?'buyApostleBox':'buyDrillBox'
      for(let i=0;i<count;i++){
        setMsg(`开启第 ${i+1}/${count} 个${type==='apostle'?'使徒':'钻头'}盲盒...`)
        const h=await wc.sendTransaction({to:CONTRACTS.blindbox,data:encodeFunctionData({abi:BB_ABI,functionName:buyFn,args:[]})})
        const receipt=await pc.waitForTransactionReceipt({hash:h})
        const nftAddr=(type==='apostle'?CONTRACTS.apostle:CONTRACTS.drill).toLowerCase()
        const ids=receipt.logs.filter(l=>l.address.toLowerCase()===nftAddr).map(l=>{try{return Number(BigInt(l.topics[3]))}catch{return null}}).filter(Boolean)
        allNewIds.push(...ids)
      }
      if(allNewIds.length>0){
        const attrRes=await pc.multicall({contracts:allNewIds.map(id=>({address:type==='apostle'?CONTRACTS.apostle:CONTRACTS.drill,abi:type==='apostle'?APO_ABI:DRL_ABI,functionName:'attrs',args:[BigInt(id)]})),allowFailure:true})
        setResults(r=>[...allNewIds.map((id,i)=>{const at=attrRes[i]?.result;return type==='apostle'?{type,id,strength:at?Number(at[0]):30,elem:at?Number(at[1]):0}:{type,id,tier:at?Number(at[0]):1,elem:at?Number(at[1]):0}}),...r].slice(0,20))
        setMsg(`🎉 获得 ${allNewIds.length} 个${type==='apostle'?'使徒':'钻头'}！`)
      } else { setMsg('✅ 购买成功！去使徒/钻头 Tab 查看') }
    }catch(e){ setMsg('❌ '+(e.shortMessage||e.message)) }
    finally{ setBuying(null) }
  }
  const GH='https://raw.githubusercontent.com/evolutionlandorg/evo-frontend/main/public/images'
  return(
    <div>
      {msg&&<div className="as-msg">{msg}</div>}
      {!address&&<div className="as-empty">请先连接钱包</div>}
      <div className="bb-asset-cards">
        <div className="bb-count-row">
          <span style={{color:'#9080b0',fontSize:'.8rem'}}>购买数量：</span>
          {[1,5,10].map(n=><button key={n} className={`bb-count-btn${count===n?' on':''}`} onClick={()=>setCount(n)}>{n}个</button>)}
        </div>
        {[['apostle','🧙 使徒盲盒','新手30% · 普通55% · 精英13% · 传奇2%',apoPx,`${GH}/apostle/egg.gif`],['drill','⛏️ 钻头盲盒','1星35% · 2星30% · 3星20% · 4星10% · 5星5%',drlPx,drillImgUrl(2,3)]].map(([type,name,desc,px,img])=>(
          <div key={type} className={`bb-asset-card ${type}`}>
            <div className="bb-asset-img-wrap"><img src={img} alt={type} className="bb-asset-img"/></div>
            <div className="bb-asset-info">
              <div className="bb-asset-name">{name}</div>
              <div className="bb-asset-desc">{desc}</div>
              <div className="bb-asset-price">{px?<><span style={{color:'#f0c040',fontWeight:800,fontSize:'1.1rem'}}>{fmtR(px*BigInt(count))}</span> RING × {count}</>:'加载中...'}</div>
            </div>
            <button className="as-btn-primary" style={{padding:'.45rem 1rem',borderRadius:10,fontSize:'.85rem'}} onClick={()=>buy(type)} disabled={!address||buying===type||!px}>{buying===type?'开启中...':'🎁 开盲盒'}</button>
          </div>
        ))}
      </div>
      {results.length>0&&(
        <div style={{marginTop:'1rem'}}>
          <div style={{fontSize:'.75rem',color:'#5040a0',marginBottom:'.5rem',fontWeight:700}}>🎉 本次获得：</div>
          <div className="as-nft-grid">
            {results.map((r,i)=>(
              <div key={i} className="as-nft-card" style={{border:`1px solid ${ELEMS[r.elem].color}44`}}>
                <div className="as-nft-img-wrap" style={{background:`linear-gradient(135deg,${ELEMS[r.elem].color}22,#0a0814)`}}>
                  <img src={r.type==='apostle'?`${GH}/apostle/egg.gif`:drillImgUrl(r.elem,r.tier)} alt={r.type} className="as-nft-img" style={{objectFit:'contain'}}/>
                </div>
                <div className="as-nft-body">
                  <div className="as-nft-title">{r.type==='apostle'?'使徒':'钻头'} #{r.id}</div>
                  <div style={{fontSize:'.7rem',color:ELEMS[r.elem].color}}><ElemIcon i={r.elem} size={11}/>{ELEMS[r.elem].name}系{r.type==='apostle'?` · 力量${r.strength}`:` · ${'★'.repeat(r.tier)}`}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{fontSize:'.72rem',color:'#5040a0',marginTop:'.6rem',textAlign:'center'}}>💡 切换到「🧙 使徒」或「⛏️ 钻头」Tab 查看全部</div>
        </div>
      )}
    </div>
  )
}

// ── Token Tab（含转账功能）────────────────────────────────────────────────
function TokenTab({pc, address, wc}){
  const [bals,setBals]=useState({})
  const [loading,setLoading]=useState(true)
  const [transferModal,setTransferModal]=useState(null) // {sym,addr,color}
  const tokens=[
    {sym:'RING',addr:CONTRACTS.ring,icon:RING_SVG,color:'#c090ff'},
    {sym:'GOLD',addr:CONTRACTS.gold,icon:ELEM_SVGS[0],color:ELEMS[0].color},
    {sym:'WOOD',addr:CONTRACTS.wood,icon:ELEM_SVGS[1],color:ELEMS[1].color},
    {sym:'HHO', addr:CONTRACTS.water,icon:ELEM_SVGS[2],color:ELEMS[2].color},
    {sym:'FIRE',addr:CONTRACTS.fire,icon:ELEM_SVGS[3],color:ELEMS[3].color},
    {sym:'SIOO',addr:CONTRACTS.soil,icon:ELEM_SVGS[4],color:ELEMS[4].color},
  ]
  const loadBals=useCallback(()=>{
    if(!address||!pc){setLoading(false);return}
    pc.multicall({contracts:tokens.map(t=>({address:t.addr,abi:ERC20_ABI,functionName:'balanceOf',args:[address]})),allowFailure:true})
      .then(res=>{const b={};tokens.forEach((t,i)=>{b[t.sym]=res[i]?.result??0n});setBals(b)}).finally(()=>setLoading(false))
  },[address,pc])
  useEffect(()=>{loadBals()},[loadBals])
  if(!address)return <div className="as-empty">请先连接钱包</div>
  if(loading)return <div className="as-loading"><span className="as-spin"/>加载中...</div>
  const cur=transferModal?tokens.find(t=>t.sym===transferModal):null
  return(
    <div>
      <div className="as-token-grid">
        {tokens.map(t=>(
          <div key={t.sym} className="as-token-card">
            <img src={t.icon} alt={t.sym} style={{width:36,height:36}}/>
            <div className="as-token-sym" style={{color:t.color}}>{t.sym}</div>
            <div className="as-token-bal">{fmtR(bals[t.sym]||0n)}</div>
            <button
              className="as-btn-sm as-btn-secondary"
              style={{marginTop:6,fontSize:'.7rem',padding:'3px 10px'}}
              onClick={()=>setTransferModal(t.sym)}
              disabled={!wc||(bals[t.sym]||0n)===0n}
            >📤 转账</button>
          </div>
        ))}
      </div>
      {transferModal&&cur&&(
        <TransferModal
          type="erc20"
          title={`${cur.sym} 代币`}
          tokenContract={cur.addr}
          symbol={cur.sym}
          balance={bals[cur.sym]||0n}
          address={address} wc={wc} pc={pc}
          onClose={()=>setTransferModal(null)}
          onDone={()=>{setTransferModal(null);loadBals()}}
        />
      )}
    </div>
  )
}

// ── 配置弹窗：选择使徒+钻头放到土地上挖矿 ──────────────────────────────
const APO_FULL_ABI=[
  {type:'function',name:'attrs',inputs:[{name:'id',type:'uint256'}],outputs:[{name:'strength',type:'uint8'},{name:'element',type:'uint8'}],stateMutability:'view'},
  {type:'function',name:'ownerOf',inputs:[{name:'id',type:'uint256'}],outputs:[{type:'address'}],stateMutability:'view'},
  {type:'function',name:'nextId',inputs:[],outputs:[{type:'uint256'}],stateMutability:'view'},
  {type:'function',name:'isApprovedForAll',inputs:[{name:'owner',type:'address'},{name:'op',type:'address'}],outputs:[{type:'bool'}],stateMutability:'view'},
  {type:'function',name:'setApprovalForAll',inputs:[{name:'op',type:'address'},{name:'v',type:'bool'}],outputs:[],stateMutability:'nonpayable'},
]
const DRL_FULL_ABI=[
  {type:'function',name:'attrs',inputs:[{name:'id',type:'uint256'}],outputs:[{name:'tier',type:'uint8'},{name:'affinity',type:'uint8'}],stateMutability:'view'},
  {type:'function',name:'ownerOf',inputs:[{name:'id',type:'uint256'}],outputs:[{type:'address'}],stateMutability:'view'},
  {type:'function',name:'nextId',inputs:[],outputs:[{type:'uint256'}],stateMutability:'view'},
  {type:'function',name:'isApprovedForAll',inputs:[{name:'owner',type:'address'},{name:'op',type:'address'}],outputs:[{type:'bool'}],stateMutability:'view'},
  {type:'function',name:'setApprovalForAll',inputs:[{name:'op',type:'address'},{name:'v',type:'bool'}],outputs:[],stateMutability:'nonpayable'},
]
const MINING_FULL_ABI=[
  {type:'function',name:'slotCount',inputs:[{name:'l',type:'uint256'}],outputs:[{type:'uint256'}],stateMutability:'view'},
  {type:'function',name:'slots',inputs:[{name:'l',type:'uint256'},{name:'i',type:'uint256'}],outputs:[{name:'apostleId',type:'uint256'},{name:'drillId',type:'uint256'},{name:'startTime',type:'uint256'},{name:'placer',type:'address'},{name:'isOwnerSlot',type:'bool'}],stateMutability:'view'},
  {type:'function',name:'MAX_APOSTLES_PER_LAND',inputs:[],outputs:[{type:'uint256'}],stateMutability:'view'},
  {type:'function',name:'startMining',inputs:[{name:'landId',type:'uint256'},{name:'apostleId',type:'uint256'},{name:'drillId',type:'uint256'}],outputs:[],stateMutability:'nonpayable'},
  {type:'function',name:'stopMining',inputs:[{name:'l',type:'uint256'},{name:'apostleId',type:'uint256'}],outputs:[],stateMutability:'nonpayable'},
]

function ConfigModal({landId, pc, address, wc, onClose, onDone}) {
  const [step, setStep] = useState('loading') // loading | slots | pickApo | pickDrill
  const [slots, setSlots] = useState([])
  const [myApos, setMyApos] = useState([])
  const [myDrills, setMyDrills] = useState([])
  const [selApo, setSelApo] = useState(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  // 加载当前槽位 + 我的使徒钻头
  useEffect(() => {
    if (!pc || !address) return
    let dead = false
    async function load() {
      setStep('loading')
      try {
        // 读槽位
        const cnt = Number(await pc.readContract({address:CONTRACTS.mining,abi:MINING_FULL_ABI,functionName:'slotCount',args:[BigInt(landId)]}))
        const slotArr = []
        for (let i=0; i<cnt; i++) {
          const s = await pc.readContract({address:CONTRACTS.mining,abi:MINING_FULL_ABI,functionName:'slots',args:[BigInt(landId),BigInt(i)]})
          let apoElem=0,apoStr=50,drlTier=1,drlElem=0
          if(s[0]>0n){try{const a=await pc.readContract({address:CONTRACTS.apostle,abi:APO_FULL_ABI,functionName:'attrs',args:[s[0]]});apoStr=Number(a[0]);apoElem=Number(a[1])}catch{}}
          if(s[1]>0n){try{const d=await pc.readContract({address:CONTRACTS.drill,abi:DRL_FULL_ABI,functionName:'attrs',args:[s[1]]});drlTier=Number(d[0]);drlElem=Number(d[1])}catch{}}
          slotArr.push({apostleId:s[0],drillId:s[1],apoStr,apoElem,drlTier,drlElem,isOwnerSlot:s[4]})
        }
        if (!dead) setSlots(slotArr)
        // 读我的使徒
        const apoNext = Number(await pc.readContract({address:CONTRACTS.apostle,abi:APO_FULL_ABI,functionName:'nextId'}))
        const apoIds=[], BATCH=50
        for(let s=1;s<apoNext;s+=BATCH){
          const ids=Array.from({length:Math.min(BATCH,apoNext-s)},(_,i)=>s+i)
          const res=await pc.multicall({contracts:ids.map(id=>({address:CONTRACTS.apostle,abi:APO_FULL_ABI,functionName:'ownerOf',args:[BigInt(id)]})),allowFailure:true})
          ids.forEach((id,i)=>{if(res[i]?.result?.toLowerCase()===address.toLowerCase())apoIds.push(id)})
        }
        if(apoIds.length>0){
          const attrRes=await pc.multicall({contracts:apoIds.map(id=>({address:CONTRACTS.apostle,abi:APO_FULL_ABI,functionName:'attrs',args:[BigInt(id)]})),allowFailure:true})
          const list=apoIds.map((id,i)=>({id,strength:attrRes[i]?.result?Number(attrRes[i].result[0]):30,elem:attrRes[i]?.result?Number(attrRes[i].result[1]):0}))
          list.sort((a,b)=>b.strength-a.strength)
          if(!dead) setMyApos(list)
        }
        // 读我的钻头
        const drlNext = Number(await pc.readContract({address:CONTRACTS.drill,abi:DRL_FULL_ABI,functionName:'nextId'}))
        const drlIds=[]
        for(let s=1;s<drlNext;s+=BATCH){
          const ids=Array.from({length:Math.min(BATCH,drlNext-s)},(_,i)=>s+i)
          const res=await pc.multicall({contracts:ids.map(id=>({address:CONTRACTS.drill,abi:DRL_FULL_ABI,functionName:'ownerOf',args:[BigInt(id)]})),allowFailure:true})
          ids.forEach((id,i)=>{if(res[i]?.result?.toLowerCase()===address.toLowerCase())drlIds.push(id)})
        }
        if(drlIds.length>0){
          const attrRes=await pc.multicall({contracts:drlIds.map(id=>({address:CONTRACTS.drill,abi:DRL_FULL_ABI,functionName:'attrs',args:[BigInt(id)]})),allowFailure:true})
          const list=drlIds.map((id,i)=>({id,tier:attrRes[i]?.result?Number(attrRes[i].result[0]):1,elem:attrRes[i]?.result?Number(attrRes[i].result[1]):0}))
          list.sort((a,b)=>b.tier-a.tier)
          if(!dead) setMyDrills(list)
        }
        if(!dead) setStep('slots')
      } catch(e) { if(!dead){setMsg('加载失败: '+e.message); setStep('slots')} }
    }
    load()
    return ()=>{dead=true}
  }, [landId, pc, address])

  async function handlePlace(apo, drl) {
    if(!wc) return
    setBusy(true); setMsg('检查授权...')
    try {
      // 授权使徒
      const apoAppr = await pc.readContract({address:CONTRACTS.apostle,abi:APO_FULL_ABI,functionName:'isApprovedForAll',args:[address,CONTRACTS.mining]}).catch(()=>false)
      if(!apoAppr){
        setMsg('授权使徒...')
        const h=await wc.sendTransaction({to:CONTRACTS.apostle,data:encodeFunctionData({abi:APO_FULL_ABI,functionName:'setApprovalForAll',args:[CONTRACTS.mining,true]})})
        await pc.waitForTransactionReceipt({hash:h})
      }
      // 如果带钻头，授权钻头
      if(drl){
        const drlAppr = await pc.readContract({address:CONTRACTS.drill,abi:DRL_FULL_ABI,functionName:'isApprovedForAll',args:[address,CONTRACTS.mining]}).catch(()=>false)
        if(!drlAppr){
          setMsg('授权钻头...')
          const h=await wc.sendTransaction({to:CONTRACTS.drill,data:encodeFunctionData({abi:DRL_FULL_ABI,functionName:'setApprovalForAll',args:[CONTRACTS.mining,true]})})
          await pc.waitForTransactionReceipt({hash:h})
        }
      }
      setMsg(drl ? `放置使徒#${apo.id}+钻头#${drl.id}...` : `放置使徒#${apo.id}...`)
      const h=await wc.sendTransaction({to:CONTRACTS.mining,data:encodeFunctionData({abi:MINING_FULL_ABI,functionName:'startMining',args:[BigInt(landId),BigInt(apo.id),drl?BigInt(drl.id):0n]})})
      await pc.waitForTransactionReceipt({hash:h})
      setMsg('✅ 放置成功！')
      setTimeout(()=>{onDone?.();onClose()},1200)
    } catch(e){ setMsg('❌ '+(e.shortMessage||e.message)) }
    setBusy(false)
  }

  async function handleStop(apostleId) {
    if(!wc) return
    setBusy(true); setMsg('停止挖矿...')
    try {
      const h=await wc.sendTransaction({to:CONTRACTS.mining,data:encodeFunctionData({abi:MINING_FULL_ABI,functionName:'stopMining',args:[BigInt(landId),apostleId]})})
      await pc.waitForTransactionReceipt({hash:h})
      setMsg('✅ 已停止')
      setTimeout(()=>{onDone?.();onClose()},1200)
    } catch(e){ setMsg('❌ '+(e.shortMessage||e.message)) }
    setBusy(false)
  }

  return (
    <div className="as-sell-overlay" onClick={onClose}>
      <div className="as-sell-modal cfg-modal" onClick={e=>e.stopPropagation()}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
          <div style={{fontWeight:700,color:'#c090ff',fontSize:'.95rem'}}>⚙️ 配置土地 #{landId}</div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'#7060a0',fontSize:'1.1rem',cursor:'pointer'}}>✕</button>
        </div>

        {step==='loading' && <div className="as-loading"><span className="as-spin"/>加载中...</div>}

        {step!=='loading' && (
          <>
            {/* 当前槽位 */}
            <div style={{fontSize:'.75rem',color:'#5040a0',marginBottom:6,fontWeight:600}}>当前工作区 ({slots.length} 个使徒)</div>
            {slots.length===0
              ? <div style={{fontSize:'.78rem',color:'#3a2a6a',padding:'8px 0',marginBottom:8}}>暂无使徒在挖矿</div>
              : <div className="cfg-slots">
                {slots.map((s,i)=>(
                  <div key={i} className="cfg-slot-row">
                    <img src={APO_EGG_GIF} style={{width:28,height:28,filter:`hue-rotate(${s.apoElem*72}deg) saturate(1.4)`}}/>
                    <div style={{flex:1}}>
                      <div style={{fontSize:'.75rem',color:'#c090ff'}}>使徒 #{s.apostleId.toString()} <span style={{color:ELEMS[s.apoElem].color}}>力量{s.apoStr}</span></div>
                      {s.drillId>0n && <div style={{fontSize:'.68rem',color:ELEMS[s.drlElem].color}}>⛏️ 钻头#{s.drillId.toString()} {'★'.repeat(s.drlTier)}</div>}
                      {s.isOwnerSlot && <div style={{fontSize:'.62rem',color:'#f0c040'}}>⭐ 地主槽</div>}
                    </div>
                    <button className="as-btn-xs as-btn-danger" onClick={()=>handleStop(s.apostleId)} disabled={busy}>停止</button>
                  </div>
                ))}
              </div>
            }

            <div style={{borderTop:'1px solid #1a1040',margin:'10px 0'}}/>

            {/* 选择使徒放置 */}
            {step==='slots' && (
              <>
                <div style={{fontSize:'.75rem',color:'#5040a0',marginBottom:6,fontWeight:600}}>放置新使徒（{myApos.length} 个可用）</div>
                {myApos.length===0
                  ? <div style={{fontSize:'.78rem',color:'#3a2a6a'}}>钱包中无使徒，去市场或盲盒购买</div>
                  : <div className="cfg-pick-grid">
                    {myApos.slice(0,20).map(a=>(
                      <div key={a.id} className="cfg-pick-item" onClick={()=>{setSelApo(a);setStep('pickDrill')}}
                        style={{borderColor:ELEMS[a.elem].color+'44'}}>
                        <img src={APO_EGG_GIF} style={{width:32,height:32,filter:`hue-rotate(${a.elem*72}deg) saturate(1.4)`}}/>
                        <div style={{fontSize:'.68rem',color:'#c090ff'}}>#{ a.id}</div>
                        <div style={{fontSize:'.65rem',color:ELEMS[a.elem].color}}>力{a.strength}</div>
                      </div>
                    ))}
                  </div>
                }
              </>
            )}

            {/* 选择钻头 */}
            {step==='pickDrill' && selApo && (
              <>
                <div style={{fontSize:'.75rem',color:'#5040a0',marginBottom:6,fontWeight:600}}>
                  已选使徒 #{selApo.id}，选配钻头（可跳过）
                </div>
                <button style={{width:'100%',padding:'.4rem',background:'#1a2a1a',border:'1px solid #2a5a2a',borderRadius:7,color:'#52c462',fontSize:'.8rem',cursor:'pointer',marginBottom:8}}
                  onClick={()=>handlePlace(selApo,null)} disabled={busy}>
                  ⚡ 不带钻头，直接放置
                </button>
                {myDrills.length===0
                  ? <div style={{fontSize:'.78rem',color:'#3a2a6a'}}>钱包中无钻头</div>
                  : <div className="cfg-pick-grid">
                    {myDrills.slice(0,20).map(d=>(
                      <div key={d.id} className="cfg-pick-item" onClick={()=>handlePlace(selApo,d)} style={{borderColor:ELEMS[d.elem].color+'44'}}>
                        <img src={drillImgUrl(d.elem,d.tier)} style={{width:32,height:32,objectFit:'contain'}}/>
                        <div style={{fontSize:'.68rem',color:'#c090ff'}}>#{d.id}</div>
                        <div style={{fontSize:'.65rem',color:ELEMS[d.elem].color}}>{'★'.repeat(d.tier)}</div>
                      </div>
                    ))}
                  </div>
                }
                <button style={{marginTop:8,background:'none',border:'none',color:'#5040a0',fontSize:'.75rem',cursor:'pointer',textDecoration:'underline'}}
                  onClick={()=>setStep('slots')}>← 重新选使徒</button>
              </>
            )}

            {msg && <div style={{fontSize:'.78rem',marginTop:10,padding:'6px 10px',borderRadius:6,background:'#0a0818',color:msg.startsWith('✅')?'#52c462':'#f06070',border:`1px solid ${msg.startsWith('✅')?'#1a4a2a':'#4a1a2a'}`}}>{msg}</div>}
          </>
        )}
      </div>
    </div>
  )
}

// ── Land Tab（含转移 + 配置）─────────────────────────────────────────────
function LandTab({pc,address,wc}){
  const [lands,setLands]=useState([])
  const [loading,setLoading]=useState(true)
  const [msg,setMsg]=useState('')
  const [sellModal,setSellModal]=useState(null)
  const [sellPrice,setSellPrice]=useState('5')
  const [transferId,setTransferId]=useState(null)
  const [configId,setConfigId]=useState(null)

  const load=useCallback(async()=>{
    if(!address||!pc){setLoading(false);return}
    setLoading(true)
    try{
      let allIds=[]
      try{const res=await fetch('/api/lands');if(res.ok){const d=await res.json();if(d.ok)allIds=d.lands.map(l=>l.id)}}catch{}
      if(!allIds.length){for(let x=0;x<12;x++) for(let y=0;y<5;y++) allIds.push(x*100+y+1)}
      const BATCH=100,myIds=[]
      for(let i=0;i<allIds.length;i+=BATCH){
        const batch=allIds.slice(i,i+BATCH)
        const ownerRes=await pc.multicall({contracts:batch.map(id=>({address:CONTRACTS.land,abi:[{type:'function',name:'ownerOf',inputs:[{name:'id',type:'uint256'}],outputs:[{type:'address'}],stateMutability:'view'}],functionName:'ownerOf',args:[BigInt(id)]})),allowFailure:true})
        batch.forEach((id,j)=>{if(ownerRes[j]?.result?.toLowerCase()===address.toLowerCase())myIds.push(id)})
      }
      if(!myIds.length){setLands([]);setLoading(false);return}
      const NFT_AUC_ABI_MIN=[{type:'function',name:'getAuction',inputs:[{name:'nft',type:'address'},{name:'id',type:'uint256'}],outputs:[{components:[{name:'nftContract',type:'address'},{name:'seller',type:'address'},{name:'startPrice',type:'uint128'},{name:'endPrice',type:'uint128'},{name:'duration',type:'uint64'},{name:'startedAt',type:'uint64'}],type:'tuple'}],stateMutability:'view'}]
      const [attrs,slots,oldAucs,newAucs]=await Promise.all([
        pc.multicall({contracts:myIds.map(id=>({address:CONTRACTS.land,abi:LAND_ABI,functionName:'resourceAttr',args:[BigInt(id)]})),allowFailure:true}),
        pc.multicall({contracts:myIds.map(id=>({address:CONTRACTS.mining,abi:MINING_ABI,functionName:'slotCount',args:[BigInt(id)]})),allowFailure:true}),
        pc.multicall({contracts:myIds.map(id=>({address:CONTRACTS.auction,abi:AUC_ABI,functionName:'auctions',args:[BigInt(id)]})),allowFailure:true}),
        pc.multicall({contracts:myIds.map(id=>({address:NFT_AUCTION_ADDR,abi:NFT_AUC_ABI_MIN,functionName:'getAuction',args:[CONTRACTS.land,BigInt(id)]})),allowFailure:true}),
      ])
      setLands(myIds.map((id,i)=>{
        const oldA=oldAucs[i]?.result,newA=newAucs[i]?.result
        return{id,resourceAttr:attrs[i]?.result??0n,slots:Number(slots[i]?.result??0n),inAuction:(oldA&&oldA[4]>0n)||(newA&&newA.startedAt>0n),auctionType:(newA&&newA.startedAt>0n)?'new':(oldA&&oldA[4]>0n)?'old':'none'}
      }))
    }catch(e){console.error(e)}
    setLoading(false)
  },[address,pc])
  useEffect(()=>{load()},[load])

  async function handleSell(landId){
    if(!wc){alert('请先连接钱包');return}; setMsg('授权中...')
    try{
      const isAppr=await pc.readContract({address:CONTRACTS.land,abi:NFT_ABI,functionName:'isApprovedForAll',args:[address,NFT_AUCTION_ADDR]}).catch(()=>false)
      if(!isAppr){const h=await wc.sendTransaction({to:CONTRACTS.land,data:encodeFunctionData({abi:NFT_ABI,functionName:'setApprovalForAll',args:[NFT_AUCTION_ADDR,true]})});await pc.waitForTransactionReceipt({hash:h})}
      setMsg('挂单中...')
      const h=await wc.sendTransaction({to:NFT_AUCTION_ADDR,data:encodeFunctionData({abi:[{type:'function',name:'createAuction',inputs:[{name:'nft',type:'address'},{name:'id',type:'uint256'},{name:'sp',type:'uint128'},{name:'ep',type:'uint128'},{name:'dur',type:'uint64'}],outputs:[],stateMutability:'nonpayable'}],functionName:'createAuction',args:[CONTRACTS.land,BigInt(landId),parseEther(sellPrice),parseEther('1'),BigInt(3*24*3600)]})})
      await pc.waitForTransactionReceipt({hash:h})
      setMsg('✅ 挂单成功！');setSellModal(null);setTimeout(()=>{setMsg('');load()},3000)
    }catch(e){setMsg('❌ '+(e.shortMessage||e.message))}
  }
  async function handleCancel(landId,auctionType){
    if(!wc)return; setMsg('撤销中...')
    try{
      const h=auctionType==='old'
        ?await wc.sendTransaction({to:CONTRACTS.auction,data:encodeFunctionData({abi:AUC_ABI,functionName:'cancelAuction',args:[BigInt(landId)]})})
        :await wc.sendTransaction({to:NFT_AUCTION_ADDR,data:encodeFunctionData({abi:[{type:'function',name:'cancelAuction',inputs:[{name:'nft',type:'address'},{name:'id',type:'uint256'}],outputs:[],stateMutability:'nonpayable'}],functionName:'cancelAuction',args:[CONTRACTS.land,BigInt(landId)]})})
      await pc.waitForTransactionReceipt({hash:h}); setMsg('✅ 已撤销');setTimeout(()=>{setMsg('');load()},2000)
    }catch(e){setMsg('❌ '+(e.shortMessage||e.message))}
  }

  if(!address)return <div className="as-empty">请先连接钱包</div>
  if(loading)return <div className="as-loading"><span className="as-spin"/>加载中...</div>
  return(
    <div>
      {msg&&<div className="as-msg">{msg}</div>}
      {sellModal&&(
        <div className="as-sell-overlay" onClick={()=>setSellModal(null)}>
          <div className="as-sell-modal" onClick={e=>e.stopPropagation()}>
            <div style={{fontWeight:700,marginBottom:8}}>挂卖土地 #{sellModal}</div>
            <div style={{fontSize:'.78rem',color:'#9080b0',marginBottom:10}}>起拍价 (RING)，3天荷兰拍，底价1 RING</div>
            <input className="as-sell-input" type="number" value={sellPrice} onChange={e=>setSellPrice(e.target.value)} min="1" step="0.5"/>
            <div style={{display:'flex',gap:8,marginTop:12}}>
              <button className="as-btn-primary" style={{padding:'.4rem .8rem',borderRadius:8}} onClick={()=>handleSell(sellModal)}>确认挂单</button>
              <button className="as-btn-secondary" onClick={()=>setSellModal(null)}>取消</button>
            </div>
          </div>
        </div>
      )}
      {transferId!=null&&(
        <TransferModal type="nft" title={`土地 #${transferId}`} tokenContract={CONTRACTS.land} tokenId={transferId}
          address={address} wc={wc} pc={pc} onClose={()=>setTransferId(null)} onDone={()=>{setTransferId(null);load()}}/>
      )}
      {configId!=null&&(
        <ConfigModal landId={configId} pc={pc} address={address} wc={wc}
          onClose={()=>setConfigId(null)} onDone={()=>{setConfigId(null);load()}}/>
      )}
      <div className="as-nft-grid">
        {lands.map(l=>{
          const vals=decodeAttr(l.resourceAttr),maxV=Math.max(1,...vals)
          return(
            <div key={l.id} className="as-nft-card">
              <div className="as-nft-img-wrap"><img src={landImgUrl(l.id)} alt="land" className="as-nft-img"/></div>
              <div className="as-nft-body">
                <div className="as-nft-title">土地 #{l.id} <span style={{fontSize:'.6rem',color:'#4030a0'}}>({(l.id-1)%100},{Math.floor((l.id-1)/100)})</span></div>
                {l.slots>0&&<div style={{fontSize:'.68rem',color:'#f0c040'}}>⛏️ {l.slots}槽挖矿中</div>}
                {l.inAuction&&<div style={{fontSize:'.68rem',color:'#52c462'}}>🔖 拍卖中</div>}
                <div className="as-res-bars">{vals.map((v,i)=><div key={i} className="as-res-bar-row"><ElemIcon i={i} size={11}/><div className="as-res-bar-bg"><div style={{width:`${(v/maxV*100).toFixed(0)}%`,height:'100%',background:ELEMS[i].color,borderRadius:2}}/></div><span style={{color:ELEMS[i].color,fontSize:'.62rem',minWidth:22}}>{v}</span></div>)}</div>
                <div className="as-nft-actions">
                  {l.inAuction
                    ?<button className="as-btn-sm as-btn-danger" onClick={()=>handleCancel(l.id,l.auctionType)}>撤销挂单</button>
                    :<button className="as-btn-sm as-btn-primary" onClick={()=>setSellModal(l.id)}>挂卖</button>
                  }
                  {!l.inAuction&&<button className="as-btn-sm as-btn-secondary" onClick={()=>setTransferId(l.id)}>📤 转移</button>}
                  <button className="as-btn-sm" style={{background:'#1a1a40',border:'1px solid #3a2a6a',color:'#a080d0',borderRadius:6,padding:'4px 8px',fontSize:'.72rem',cursor:'pointer'}} onClick={()=>setConfigId(l.id)}>⚙️ 配置</button>
                </div>
              </div>
            </div>
          )
        })}
        {lands.length===0&&<div className="as-empty">暂无地块</div>}
      </div>
    </div>
  )
}

// ── Apostle Tab（含转移+批量挂单）──────────────────────────────────────────
function ApostleTab({pc,address,wc}){
  const [apos,setApos]=useState([])
  const [loading,setLoading]=useState(true)
  const [msg,setMsg]=useState('')
  const [sellModal,setSellModal]=useState(null)
  const [sellPrice,setSellPrice]=useState('3')
  const [transferId,setTransferId]=useState(null)
  // 批量挂单
  const [batchModal,setBatchModal]=useState(false)
  const [batchCount,setBatchCount]=useState('5')
  const [batchSP,setBatchSP]=useState('3')
  const [batchEP,setBatchEP]=useState('0.5')
  const [batchBusy,setBatchBusy]=useState(false)

  const load=useCallback(async()=>{
    if(!address||!pc){setLoading(false);return}; setLoading(true)
    try{
      const nextId=await pc.readContract({address:CONTRACTS.apostle,abi:[{type:'function',name:'nextId',inputs:[],outputs:[{type:'uint256'}],stateMutability:'view'}],functionName:'nextId'})
      const total=Number(nextId)-1; if(total<=0){setApos([]);setLoading(false);return}
      const BATCH=50,myIds=[]
      for(let s=1;s<=total;s+=BATCH){
        const ids=Array.from({length:Math.min(BATCH,total-s+1)},(_,i)=>s+i)
        const res=await pc.multicall({contracts:ids.map(id=>({address:CONTRACTS.apostle,abi:[{type:'function',name:'ownerOf',inputs:[{name:'id',type:'uint256'}],outputs:[{type:'address'}],stateMutability:'view'}],functionName:'ownerOf',args:[BigInt(id)]})),allowFailure:true})
        ids.forEach((id,i)=>{if(res[i]?.result?.toLowerCase()===address.toLowerCase())myIds.push(id)})
      }
      if(!myIds.length){setApos([]);setLoading(false);return}
      const [attrRes,aucRes]=await Promise.all([
        pc.multicall({contracts:myIds.map(id=>({address:CONTRACTS.apostle,abi:APO_ABI,functionName:'attrs',args:[BigInt(id)]})),allowFailure:true}),
        pc.multicall({contracts:myIds.map(id=>({address:NFT_AUCTION_ADDR,abi:NFT_AUC_ABI,functionName:'getAuction',args:[CONTRACTS.apostle,BigInt(id)]})),allowFailure:true}),
      ])
      setApos(myIds.map((id,i)=>({id,strength:attrRes[i]?.result?Number(attrRes[i].result[0]):30,elem:attrRes[i]?.result?Number(attrRes[i].result[1]):0,auction:aucRes[i]?.result})))
    }catch(e){console.error(e)}; setLoading(false)
  },[address,pc])
  useEffect(()=>{load()},[load])

  async function handleSell(apoId){
    if(!wc)return; setMsg('授权中...')
    try{
      const isAppr=await pc.readContract({address:CONTRACTS.apostle,abi:NFT_ABI,functionName:'isApprovedForAll',args:[address,NFT_AUCTION_ADDR]}).catch(()=>false)
      if(!isAppr){const h=await wc.sendTransaction({to:CONTRACTS.apostle,data:encodeFunctionData({abi:NFT_ABI,functionName:'setApprovalForAll',args:[NFT_AUCTION_ADDR,true]})});await pc.waitForTransactionReceipt({hash:h})}
      setMsg('挂单中...')
      const h=await wc.sendTransaction({to:NFT_AUCTION_ADDR,data:encodeFunctionData({abi:NFT_AUC_ABI,functionName:'createAuction',args:[CONTRACTS.apostle,BigInt(apoId),parseEther(sellPrice),parseEther('0.5'),BigInt(3*24*3600)]})})
      await pc.waitForTransactionReceipt({hash:h}); setMsg('✅ 成功！');setSellModal(null);setTimeout(()=>{setMsg('');load()},2000)
    }catch(e){setMsg('❌ '+(e.shortMessage||e.message))}
  }
  async function handleCancel(apoId){
    if(!wc)return; setMsg('撤销中...')
    try{
      const h=await wc.sendTransaction({to:NFT_AUCTION_ADDR,data:encodeFunctionData({abi:NFT_AUC_ABI,functionName:'cancelAuction',args:[CONTRACTS.apostle,BigInt(apoId)]})})
      await pc.waitForTransactionReceipt({hash:h}); setMsg('✅ 已撤销');setTimeout(()=>{setMsg('');load()},2000)
    }catch(e){setMsg('❌ '+(e.shortMessage||e.message))}
  }
  // 批量挂单
  async function handleBatchSell(){
    if(!wc)return; setBatchBusy(true); setMsg('批量挂单中...')
    try{
      const n=Number(batchCount)||5
      const sp=parseEther(batchSP||'3'), ep=parseEther(batchEP||'0.5')
      const isAppr=await pc.readContract({address:CONTRACTS.apostle,abi:NFT_ABI,functionName:'isApprovedForAll',args:[address,NFT_AUCTION_ADDR]}).catch(()=>false)
      if(!isAppr){ setMsg('授权中...'); const h=await wc.sendTransaction({to:CONTRACTS.apostle,data:encodeFunctionData({abi:NFT_ABI,functionName:'setApprovalForAll',args:[NFT_AUCTION_ADDR,true]})}); await pc.waitForTransactionReceipt({hash:h}) }
      let done=0
      for(const a of apos){
        if(done>=n) break
        if(a.auction&&Number(a.auction.startedAt??0)>0) continue
        setMsg(`挂单 ${done+1}/${n} 使徒#${a.id}...`)
        const h=await wc.sendTransaction({to:NFT_AUCTION_ADDR,data:encodeFunctionData({abi:NFT_AUC_ABI,functionName:'createAuction',args:[CONTRACTS.apostle,BigInt(a.id),sp,ep,BigInt(3*24*3600)]})})
        await pc.waitForTransactionReceipt({hash:h})
        done++
      }
      setMsg(`✅ 批量挂单完成 ${done}个！`); setBatchModal(false); setTimeout(()=>{setMsg('');load()},2000)
    }catch(e){setMsg('❌ '+(e.shortMessage||e.message))}
    setBatchBusy(false)
  }

  if(!address)return <div className="as-empty">请先连接钱包</div>
  if(loading)return <div className="as-loading"><span className="as-spin"/>扫描使徒中...</div>
  return(
    <div>
      {msg&&<div className="as-msg">{msg}</div>}
      {/* 批量挂单按钮 */}
      {apos.length>0&&<div style={{marginBottom:8,display:'flex',gap:8,alignItems:'center'}}>
        <button className="as-btn-sm as-btn-primary" onClick={()=>setBatchModal(true)}>📦 批量挂单</button>
        <span style={{fontSize:'.72rem',color:'#5040a0'}}>可批量将多个使徒挂到市场</span>
      </div>}
      {batchModal&&(
        <div className="as-sell-overlay" onClick={()=>setBatchModal(false)}>
          <div className="as-sell-modal" onClick={e=>e.stopPropagation()} style={{minWidth:280}}>
            <div style={{fontWeight:700,marginBottom:10,color:'#c090ff'}}>📦 批量挂使徒</div>
            {[['数量上限',batchCount,setBatchCount,'5'],['起拍价(RING)',batchSP,setBatchSP,'3'],['底价(RING)',batchEP,setBatchEP,'0.5']].map(([l,v,s,p])=>(
              <div key={l} style={{marginBottom:8}}>
                <div style={{fontSize:'.72rem',color:'#7060a0',marginBottom:3}}>{l}</div>
                <input className="as-sell-input" type="number" value={v} onChange={e=>s(e.target.value)} placeholder={p}/>
              </div>
            ))}
            <div style={{fontSize:'.68rem',color:'#5040a0',marginBottom:10}}>拍卖时长3天 · 跳过已挂单的</div>
            <div style={{display:'flex',gap:8}}>
              <button className="as-btn-primary" style={{padding:'.4rem .8rem',borderRadius:8}} onClick={handleBatchSell} disabled={batchBusy}>{batchBusy?'挂单中...':'确认批量挂单'}</button>
              <button className="as-btn-secondary" onClick={()=>setBatchModal(false)}>取消</button>
            </div>
          </div>
        </div>
      )}
      {sellModal&&(
        <div className="as-sell-overlay" onClick={()=>setSellModal(null)}>
          <div className="as-sell-modal" onClick={e=>e.stopPropagation()}>
            <div style={{fontWeight:700,marginBottom:8}}>挂卖使徒 #{sellModal}</div>
            <input className="as-sell-input" type="number" value={sellPrice} onChange={e=>setSellPrice(e.target.value)} min="1"/>
            <div style={{display:'flex',gap:8,marginTop:12}}>
              <button className="as-btn-primary" style={{padding:'.4rem .8rem',borderRadius:8}} onClick={()=>handleSell(sellModal)}>确认</button>
              <button className="as-btn-secondary" onClick={()=>setSellModal(null)}>取消</button>
            </div>
          </div>
        </div>
      )}
      {transferId!=null&&(
        <TransferModal type="nft" title={`使徒 #${transferId}`} tokenContract={CONTRACTS.apostle} tokenId={transferId}
          address={address} wc={wc} pc={pc} onClose={()=>setTransferId(null)} onDone={()=>{setTransferId(null);load()}}/>
      )}
      <div className="as-nft-grid">
        {apos.map(a=>{
          const inAuction=a.auction&&Number(a.auction.startedAt??a.auction[4]??0)>0
          return(
            <div key={a.id} className="as-nft-card">
              <div className="as-nft-img-wrap" style={{background:`linear-gradient(135deg,${ELEMS[a.elem].color}22,#0a0814)`}}>
                <img src={APO_EGG_GIF} alt="apostle" className="as-nft-img" style={{objectFit:'contain'}}/>
              </div>
              <div className="as-nft-body">
                <div className="as-nft-title">使徒 #{a.id}</div>
                <div style={{fontSize:'.7rem',color:ELEMS[a.elem].color}}><ElemIcon i={a.elem} size={11}/>{ELEMS[a.elem].name}系 · 力量{a.strength}</div>
                {inAuction&&<div style={{fontSize:'.68rem',color:'#52c462'}}>🔖 拍卖中</div>}
                <div className="as-nft-actions">
                  {inAuction
                    ?<button className="as-btn-sm as-btn-danger" onClick={()=>handleCancel(a.id)}>撤销</button>
                    :<button className="as-btn-sm as-btn-primary" onClick={()=>setSellModal(a.id)}>挂卖</button>
                  }
                  {!inAuction&&<button className="as-btn-sm as-btn-secondary" onClick={()=>setTransferId(a.id)}>📤 转移</button>}
                </div>
              </div>
            </div>
          )
        })}
        {apos.length===0&&<div className="as-empty">暂无使徒<br/><span style={{fontSize:'.75rem',color:'#4030a0'}}>去盲盒 Tab 购买</span></div>}
      </div>
    </div>
  )
}

// ── Drill Tab（含转移+批量挂单）─────────────────────────────────────────────
function DrillTab({pc,address,wc}){
  const [drills,setDrills]=useState([])
  const [loading,setLoading]=useState(true)
  const [msg,setMsg]=useState('')
  const [sellModal,setSellModal]=useState(null)
  const [sellPrice,setSellPrice]=useState('3')
  const [transferId,setTransferId]=useState(null)
  const [batchModal,setBatchModal]=useState(false)
  const [batchCount,setBatchCount]=useState('5')
  const [batchSP,setBatchSP]=useState('1')
  const [batchEP,setBatchEP]=useState('0.2')
  const [batchBusy,setBatchBusy]=useState(false)

  const load=useCallback(async()=>{
    if(!address||!pc){setLoading(false);return}; setLoading(true)
    try{
      const nextId=await pc.readContract({address:CONTRACTS.drill,abi:[{type:'function',name:'nextId',inputs:[],outputs:[{type:'uint256'}],stateMutability:'view'}],functionName:'nextId'})
      const total=Number(nextId)-1; if(total<=0){setDrills([]);setLoading(false);return}
      const BATCH=50,myIds=[]
      for(let s=1;s<=total;s+=BATCH){
        const ids=Array.from({length:Math.min(BATCH,total-s+1)},(_,i)=>s+i)
        const res=await pc.multicall({contracts:ids.map(id=>({address:CONTRACTS.drill,abi:[{type:'function',name:'ownerOf',inputs:[{name:'id',type:'uint256'}],outputs:[{type:'address'}],stateMutability:'view'}],functionName:'ownerOf',args:[BigInt(id)]})),allowFailure:true})
        ids.forEach((id,i)=>{if(res[i]?.result?.toLowerCase()===address.toLowerCase())myIds.push(id)})
      }
      if(!myIds.length){setDrills([]);setLoading(false);return}
      const [attrRes,aucRes]=await Promise.all([
        pc.multicall({contracts:myIds.map(id=>({address:CONTRACTS.drill,abi:DRL_ABI,functionName:'attrs',args:[BigInt(id)]})),allowFailure:true}),
        pc.multicall({contracts:myIds.map(id=>({address:NFT_AUCTION_ADDR,abi:NFT_AUC_ABI,functionName:'getAuction',args:[CONTRACTS.drill,BigInt(id)]})),allowFailure:true}),
      ])
      setDrills(myIds.map((id,i)=>({id,tier:attrRes[i]?.result?Number(attrRes[i].result[0]):1,elem:attrRes[i]?.result?Number(attrRes[i].result[1]):0,auction:aucRes[i]?.result})))
    }catch(e){console.error(e)}; setLoading(false)
  },[address,pc])
  useEffect(()=>{load()},[load])

  async function handleSell(drlId){
    if(!wc)return; setMsg('授权中...')
    try{
      const isAppr=await pc.readContract({address:CONTRACTS.drill,abi:NFT_ABI,functionName:'isApprovedForAll',args:[address,NFT_AUCTION_ADDR]}).catch(()=>false)
      if(!isAppr){const h=await wc.sendTransaction({to:CONTRACTS.drill,data:encodeFunctionData({abi:NFT_ABI,functionName:'setApprovalForAll',args:[NFT_AUCTION_ADDR,true]})});await pc.waitForTransactionReceipt({hash:h})}
      setMsg('挂单中...')
      const h=await wc.sendTransaction({to:NFT_AUCTION_ADDR,data:encodeFunctionData({abi:NFT_AUC_ABI,functionName:'createAuction',args:[CONTRACTS.drill,BigInt(drlId),parseEther(sellPrice),parseEther('0.1'),BigInt(3*24*3600)]})})
      await pc.waitForTransactionReceipt({hash:h}); setMsg('✅ 成功！');setSellModal(null);setTimeout(()=>{setMsg('');load()},2000)
    }catch(e){setMsg('❌ '+(e.shortMessage||e.message))}
  }
  async function handleCancel(drlId){
    if(!wc)return; setMsg('撤销中...')
    try{
      const h=await wc.sendTransaction({to:NFT_AUCTION_ADDR,data:encodeFunctionData({abi:NFT_AUC_ABI,functionName:'cancelAuction',args:[CONTRACTS.drill,BigInt(drlId)]})})
      await pc.waitForTransactionReceipt({hash:h}); setMsg('✅ 已撤销');setTimeout(()=>{setMsg('');load()},2000)
    }catch(e){setMsg('❌ '+(e.shortMessage||e.message))}
  }
  async function handleBatchSell(){
    if(!wc)return; setBatchBusy(true); setMsg('批量挂单中...')
    try{
      const n=Number(batchCount)||5
      const isAppr=await pc.readContract({address:CONTRACTS.drill,abi:NFT_ABI,functionName:'isApprovedForAll',args:[address,NFT_AUCTION_ADDR]}).catch(()=>false)
      if(!isAppr){ const h=await wc.sendTransaction({to:CONTRACTS.drill,data:encodeFunctionData({abi:NFT_ABI,functionName:'setApprovalForAll',args:[NFT_AUCTION_ADDR,true]})}); await pc.waitForTransactionReceipt({hash:h}) }
      let done=0
      for(const d of drills){
        if(done>=n) break
        if(d.auction&&Number(d.auction.startedAt??0)>0) continue
        // 按星级倍增定价
        const mul=[0,1,2,4,8,16][d.tier]||1
        const sp=parseEther((parseFloat(batchSP)*mul).toFixed(2))
        const ep=parseEther((parseFloat(batchEP)*mul).toFixed(2))
        setMsg(`挂单 ${done+1}/${n} 钻头#${d.id} (${d.tier}★)...`)
        const h=await wc.sendTransaction({to:NFT_AUCTION_ADDR,data:encodeFunctionData({abi:NFT_AUC_ABI,functionName:'createAuction',args:[CONTRACTS.drill,BigInt(d.id),sp,ep,BigInt(3*24*3600)]})})
        await pc.waitForTransactionReceipt({hash:h})
        done++
      }
      setMsg(`✅ 批量挂单完成 ${done}个！`); setBatchModal(false); setTimeout(()=>{setMsg('');load()},2000)
    }catch(e){setMsg('❌ '+(e.shortMessage||e.message))}
    setBatchBusy(false)
  }

  if(!address)return <div className="as-empty">请先连接钱包</div>
  if(loading)return <div className="as-loading"><span className="as-spin"/>扫描钻头中...</div>
  return(
    <div>
      {msg&&<div className="as-msg">{msg}</div>}
      {drills.length>0&&<div style={{marginBottom:8,display:'flex',gap:8,alignItems:'center'}}>
        <button className="as-btn-sm as-btn-primary" onClick={()=>setBatchModal(true)}>📦 批量挂单</button>
        <span style={{fontSize:'.72rem',color:'#5040a0'}}>按星级自动倍增定价</span>
      </div>}
      {batchModal&&(
        <div className="as-sell-overlay" onClick={()=>setBatchModal(false)}>
          <div className="as-sell-modal" onClick={e=>e.stopPropagation()} style={{minWidth:280}}>
            <div style={{fontWeight:700,marginBottom:10,color:'#c090ff'}}>📦 批量挂钻头</div>
            {[['数量上限',batchCount,setBatchCount,'5'],['1★起拍(RING)',batchSP,setBatchSP,'1'],['1★底价(RING)',batchEP,setBatchEP,'0.2']].map(([l,v,s,p])=>(
              <div key={l} style={{marginBottom:8}}>
                <div style={{fontSize:'.72rem',color:'#7060a0',marginBottom:3}}>{l}</div>
                <input className="as-sell-input" type="number" value={v} onChange={e=>s(e.target.value)} placeholder={p}/>
              </div>
            ))}
            <div style={{fontSize:'.68rem',color:'#5040a0',marginBottom:10}}>1★×1 2★×2 3★×4 4★×8 5★×16 · 3天荷兰拍</div>
            <div style={{display:'flex',gap:8}}>
              <button className="as-btn-primary" style={{padding:'.4rem .8rem',borderRadius:8}} onClick={handleBatchSell} disabled={batchBusy}>{batchBusy?'挂单中...':'确认批量挂单'}</button>
              <button className="as-btn-secondary" onClick={()=>setBatchModal(false)}>取消</button>
            </div>
          </div>
        </div>
      )}
      {sellModal&&(
        <div className="as-sell-overlay" onClick={()=>setSellModal(null)}>
          <div className="as-sell-modal" onClick={e=>e.stopPropagation()}>
            <div style={{fontWeight:700,marginBottom:8}}>挂卖钻头 #{sellModal}</div>
            <input className="as-sell-input" type="number" value={sellPrice} onChange={e=>setSellPrice(e.target.value)} min="1"/>
            <div style={{display:'flex',gap:8,marginTop:12}}>
              <button className="as-btn-primary" style={{padding:'.4rem .8rem',borderRadius:8}} onClick={()=>handleSell(sellModal)}>确认</button>
              <button className="as-btn-secondary" onClick={()=>setSellModal(null)}>取消</button>
            </div>
          </div>
        </div>
      )}
      {transferId!=null&&(
        <TransferModal type="nft" title={`钻头 #${transferId}`} tokenContract={CONTRACTS.drill} tokenId={transferId}
          address={address} wc={wc} pc={pc} onClose={()=>setTransferId(null)} onDone={()=>{setTransferId(null);load()}}/>
      )}
      <div className="as-nft-grid">
        {drills.map(d=>{
          const inAuction=d.auction&&Number(d.auction.startedAt??d.auction[4]??0)>0
          return(
            <div key={d.id} className="as-nft-card">
              <div className="as-nft-img-wrap" style={{background:`linear-gradient(135deg,${ELEMS[d.elem].color}22,#0a0814)`}}>
                <img src={drillImgUrl(d.elem,d.tier)} alt="drill" className="as-nft-img" style={{objectFit:'contain'}}/>
              </div>
              <div className="as-nft-body">
                <div className="as-nft-title">钻头 #{d.id}</div>
                <div style={{fontSize:'.7rem',color:ELEMS[d.elem].color}}><ElemIcon i={d.elem} size={11}/>{ELEMS[d.elem].name}系 · {'★'.repeat(d.tier)}</div>
                {inAuction&&<div style={{fontSize:'.68rem',color:'#52c462'}}>🔖 拍卖中</div>}
                <div className="as-nft-actions">
                  {inAuction
                    ?<button className="as-btn-sm as-btn-danger" onClick={()=>handleCancel(d.id)}>撤销</button>
                    :<button className="as-btn-sm as-btn-primary" onClick={()=>setSellModal(d.id)}>挂卖</button>
                  }
                  {!inAuction&&<button className="as-btn-sm as-btn-secondary" onClick={()=>setTransferId(d.id)}>📤 转移</button>}
                </div>
              </div>
            </div>
          )
        })}
        {drills.length===0&&<div className="as-empty">暂无钻头<br/><span style={{fontSize:'.75rem',color:'#4030a0'}}>去盲盒 Tab 购买</span></div>}
      </div>
    </div>
  )
}

// ── Mining Tab ────────────────────────────────────────────────────────────
function MiningTab({pc,address,wc}){
  const [lands,setLands]=useState([])
  const [loading,setLoading]=useState(true)
  const [msg,setMsg]=useState('')

  const load=useCallback(async()=>{
    if(!address||!pc){setLoading(false);return}; setLoading(true)
    try{
      let allIds=[]
      try{const res=await fetch('/api/lands');if(res.ok){const d=await res.json();if(d.ok)allIds=d.lands.map(l=>l.id)}}catch{}
      if(!allIds.length){for(let x=0;x<=9;x++) for(let y=0;y<=4;y++) allIds.push(x*100+y+1)}
      const ownerRes=await pc.multicall({contracts:allIds.map(id=>({address:CONTRACTS.land,abi:[{type:'function',name:'ownerOf',inputs:[{name:'id',type:'uint256'}],outputs:[{type:'address'}],stateMutability:'view'}],functionName:'ownerOf',args:[BigInt(id)]})),allowFailure:true})
      const miningAddr=CONTRACTS.mining.toLowerCase()
      const relevantIds=allIds.filter((_,i)=>{const o=ownerRes[i]?.result?.toLowerCase();return o===address.toLowerCase()||o===miningAddr})
      if(!relevantIds.length){setLands([]);setLoading(false);return}
      const slotCounts=await pc.multicall({contracts:relevantIds.map(id=>({address:CONTRACTS.mining,abi:MINING_ABI,functionName:'slotCount',args:[BigInt(id)]})),allowFailure:true})
      // 也扫描：矿工在哪些地块上有使徒（通过 pendingMinerRewards 非零判断）
      const activeLandIds=[]
      for(let i=0;i<relevantIds.length;i++){
        if(Number(slotCounts[i]?.result??0n)>0) activeLandIds.push(relevantIds[i])
      }
      // 补充：扫描所有地块看是否有矿工待领取
      const allLandIds=[]
      for(let x=0;x<12;x++) for(let y=0;y<5;y++) allLandIds.push(x*100+y+1)
      const minerPendingCheck=await pc.multicall({contracts:allLandIds.map(id=>({address:CONTRACTS.mining,abi:MINING_ABI,functionName:'pendingMinerRewards',args:[address,BigInt(id)]})),allowFailure:true})
      allLandIds.forEach((id,i)=>{
        const r=minerPendingCheck[i]?.result
        if(r&&r.some(v=>v>0n)&&!activeLandIds.includes(id)) activeLandIds.push(id)
      })
      if(!activeLandIds.length){setLands([]);setLoading(false);return}
      const landData=[]
      for(const id of activeLandIds){
        const cnt=Number(await pc.readContract({address:CONTRACTS.mining,abi:MINING_ABI,functionName:'slotCount',args:[BigInt(id)]}))
        const landOwner=await pc.readContract({address:CONTRACTS.land,abi:[{type:'function',name:'ownerOf',inputs:[{name:'id',type:'uint256'}],outputs:[{type:'address'}],stateMutability:'view'}],functionName:'ownerOf',args:[BigInt(id)]}).catch(()=>null)
        const isLandOwner=landOwner?.toLowerCase()===address.toLowerCase()
        const [ownerRewards,minerRewards,slotsData]=await Promise.all([
          isLandOwner?pc.readContract({address:CONTRACTS.mining,abi:MINING_ABI,functionName:'pendingRewards',args:[BigInt(id)]}).catch(()=>null):Promise.resolve(null),
          pc.readContract({address:CONTRACTS.mining,abi:MINING_ABI,functionName:'pendingMinerRewards',args:[address,BigInt(id)]}).catch(()=>null),
          Promise.all(Array.from({length:cnt},(_,j)=>pc.readContract({address:CONTRACTS.mining,abi:MINING_ABI,functionName:'slots',args:[BigInt(id),BigInt(j)]}).catch(()=>null)))
        ])
        landData.push({id,slotCount:cnt,ownerRewards,minerRewards,slots:slotsData.filter(Boolean),isLandOwner})
      }
      setLands(landData)
    }catch(e){console.error(e)}; setLoading(false)
  },[address,pc])
  useEffect(()=>{load()},[load])

  async function handleClaim(landId, isLandOwner){
    if(!wc)return; setMsg('领取中...')
    try{
      const fn = isLandOwner ? 'claim' : 'claimMiner'
      const h=await wc.sendTransaction({to:CONTRACTS.mining,data:encodeFunctionData({abi:MINING_ABI,functionName:fn,args:[BigInt(landId)]})})
      await pc.waitForTransactionReceipt({hash:h}); setMsg('✅ 领取成功！');setTimeout(()=>{setMsg('');load()},2000)
    }catch(e){
      const m=e.shortMessage||e.message||''
      if(m.includes('internal')||m.includes('Internal')){
        setMsg('❌ 领取失败：奖励池余额不足，请联系管理员充值资源 token')
      } else {
        setMsg('❌ '+ m)
      }
    }
  }
  async function handleStop(landId,apostleId){
    if(!wc)return; setMsg('停止挖矿...')
    try{
      const h=await wc.sendTransaction({to:CONTRACTS.mining,data:encodeFunctionData({abi:MINING_ABI,functionName:'stopMining',args:[BigInt(landId),BigInt(apostleId)]})})
      await pc.waitForTransactionReceipt({hash:h}); setMsg('✅ 已停止');setTimeout(()=>{setMsg('');load()},2000)
    }catch(e){setMsg('❌ '+(e.shortMessage||e.message))}
  }

  if(!address)return <div className="as-empty">请先连接钱包</div>
  if(loading)return <div className="as-loading"><span className="as-spin"/>扫描挖矿中...</div>
  if(!lands.length)return <div className="as-empty">暂无挖矿中的地块</div>
  return(
    <div>
      {msg&&<div className="as-msg">{msg}</div>}
      <div style={{display:'flex',flexDirection:'column',gap:12}}>
        {lands.map(l=>{
          const hasOwnerReward=l.ownerRewards&&l.ownerRewards.some(v=>v>0n)
          const hasMinerReward=l.minerRewards&&l.minerRewards.some(v=>v>0n)
          return(
            <div key={l.id} className="as-mining-card">
              <div className="as-mining-head">
                <img src={landImgUrl(l.id)} alt="land" style={{width:52,height:52,borderRadius:8,objectFit:'cover'}}/>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,color:'#c090ff'}}>土地 #{l.id}</div>
                  <div style={{fontSize:'.72rem',color:'#5040a0'}}>{l.slotCount} 个使徒工作中</div>
                  {l.isLandOwner&&<div style={{fontSize:'.65rem',color:'#f0c040'}}>⭐ 你是地块持有者</div>}
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:4}}>
                  {l.isLandOwner&&(
                    <button className="as-btn-sm as-btn-primary" onClick={()=>handleClaim(l.id,true)} disabled={!hasOwnerReward}>💰 领取(地主)</button>
                  )}
                  {hasMinerReward&&(
                    <button className="as-btn-sm" style={{background:'#1a3a1a',border:'1px solid #2a6a2a',color:'#52c462',borderRadius:6,padding:'4px 8px',fontSize:'.72rem',cursor:'pointer'}} onClick={()=>handleClaim(l.id,false)}>⛏️ 领取(矿工)</button>
                  )}
                </div>
              </div>
              {l.isLandOwner&&l.ownerRewards&&(
                <div className="as-rewards-row">
                  <span style={{fontSize:'.68rem',color:'#f0c040',marginRight:6}}>地主待领（含手续费）：</span>
                  {ELEMS.map((el,i)=>(
                    <span key={i} style={{fontSize:'.72rem',color:el.color,marginRight:8}}><ElemIcon i={i} size={11}/>{fmtR(l.ownerRewards[i]||0n,2)}</span>
                  ))}
                </div>
              )}
              {l.minerRewards&&l.minerRewards.some(v=>v>0n)&&(
                <div className="as-rewards-row">
                  <span style={{fontSize:'.68rem',color:'#52c462',marginRight:6}}>矿工待领（扣10%手续费）：</span>
                  {ELEMS.map((el,i)=>(
                    <span key={i} style={{fontSize:'.72rem',color:el.color,marginRight:8}}><ElemIcon i={i} size={11}/>{fmtR(l.minerRewards[i]||0n,2)}</span>
                  ))}
                </div>
              )}
              <div className="as-slots-row">
                {l.slots.map((slot,j)=>(
                  <div key={j} className="as-slot-chip">
                    <img src={APO_EGG_GIF} style={{width:22,height:22}}/>
                    <span>#{slot.apostleId?.toString()}</span>
                    {slot.isOwnerSlot&&<span style={{fontSize:'.6rem',color:'#f0c040'}}>⭐</span>}
                    {slot.drillId>0n&&<><img src={drillImgUrl(0,1)} style={{width:22,height:22}}/><span>#{slot.drillId?.toString()}</span></>}
                    <button className="as-btn-xs as-btn-danger" onClick={()=>handleStop(l.id,slot.apostleId)}>停</button>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────
export default function AssetsPage({initialTab='token'}){
  const pc=usePublicClient(),{address}=useAccount(),{data:wc}=useWalletClient()
  const [tab,setTab]=useState(initialTab)
  useEffect(()=>{if(initialTab)setTab(initialTab)},[initialTab])
  return(
    <div className="as-root">
      <div className="as-header"><h1 className="as-title">💎 我的资产</h1></div>
      <div className="as-tabs">
        {TABS.map(t=><button key={t.k} className={`as-tab${tab===t.k?' on':''}`} onClick={()=>setTab(t.k)}>{t.label}</button>)}
      </div>
      <div className="as-content">
        {tab==='token'   &&<TokenTab   pc={pc} address={address} wc={wc}/>}
        {tab==='blindbox'&&<BlindBoxTab pc={pc} address={address} wc={wc}/>}
        {tab==='land'    &&<LandTab    pc={pc} address={address} wc={wc}/>}
        {tab==='apostle' &&<ApostleTab pc={pc} address={address} wc={wc}/>}
        {tab==='drill'   &&<DrillTab   pc={pc} address={address} wc={wc}/>}
        {tab==='mining'  &&<MiningTab  pc={pc} address={address} wc={wc}/>}
      </div>
    </div>
  )
}
