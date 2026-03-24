import { useState, useEffect, useCallback } from 'react'
import { usePublicClient, useAccount, useWalletClient } from '../contexts/WalletContext.jsx'

import { formatEther, encodeFunctionData, parseEther } from 'viem'
import { CONTRACTS, NFT_AUCTION_ADDR } from '../constants/contracts'
import { APO_EGG_GIF, drillImgUrl, landImgUrl, ELEM_SVGS, ELEMS, RING_SVG } from '../constants/images'
import './AssetsPage.css'

const ERC20_ABI=[
  {type:'function',name:'balanceOf',inputs:[{name:'a',type:'address'}],outputs:[{type:'uint256'}],stateMutability:'view'},
  {type:'function',name:'approve',inputs:[{name:'s',type:'address'},{name:'a',type:'uint256'}],outputs:[{type:'bool'}],stateMutability:'nonpayable'},
]
const NFT_ABI=[
  {type:'function',name:'balanceOf',inputs:[{name:'o',type:'address'}],outputs:[{type:'uint256'}],stateMutability:'view'},
  {type:'function',name:'tokenOfOwnerByIndex',inputs:[{name:'o',type:'address'},{name:'i',type:'uint256'}],outputs:[{type:'uint256'}],stateMutability:'view'},
  {type:'function',name:'setApprovalForAll',inputs:[{name:'op',type:'address'},{name:'v',type:'bool'}],outputs:[],stateMutability:'nonpayable'},
  {type:'function',name:'isApprovedForAll',inputs:[{name:'owner',type:'address'},{name:'op',type:'address'}],outputs:[{type:'bool'}],stateMutability:'view'},
]
const APO_ABI=[{type:'function',name:'attrs',inputs:[{name:'id',type:'uint256'}],outputs:[{name:'strength',type:'uint8'},{name:'element',type:'uint8'}],stateMutability:'view'}]
const DRL_ABI=[{type:'function',name:'attrs',inputs:[{name:'id',type:'uint256'}],outputs:[{name:'tier',type:'uint8'},{name:'affinity',type:'uint8'}],stateMutability:'view'}]
const LAND_ABI=[{type:'function',name:'resourceAttr',inputs:[{name:'id',type:'uint256'}],outputs:[{type:'uint80'}],stateMutability:'view'}]
const MINING_ABI=[
  {type:'function',name:'slotCount',inputs:[{name:'l',type:'uint256'}],outputs:[{type:'uint256'}],stateMutability:'view'},
  {type:'function',name:'slots',inputs:[{name:'l',type:'uint256'},{name:'i',type:'uint256'}],outputs:[{name:'apostleId',type:'uint256'},{name:'drillId',type:'uint256'},{name:'startTime',type:'uint256'}],stateMutability:'view'},
  {type:'function',name:'pendingRewards',inputs:[{name:'l',type:'uint256'}],outputs:[{type:'uint256[5]'}],stateMutability:'view'},
  {type:'function',name:'claimLandReward',inputs:[{name:'l',type:'uint256'}],outputs:[],stateMutability:'nonpayable'},
  {type:'function',name:'startMining',inputs:[{name:'l',type:'uint256'},{name:'a',type:'uint256'},{name:'d',type:'uint256'}],outputs:[],stateMutability:'nonpayable'},
  {type:'function',name:'stopMining',inputs:[{name:'l',type:'uint256'},{name:'slot',type:'uint256'}],outputs:[],stateMutability:'nonpayable'},
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
  {type:'function',name:'buyApostleBoxBatch',inputs:[{name:'count',type:'uint256'}],outputs:[],stateMutability:'nonpayable'},
  {type:'function',name:'buyDrillBoxBatch',inputs:[{name:'count',type:'uint256'}],outputs:[],stateMutability:'nonpayable'},
]

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

// ── BlindBox Tab ── 买盲盒 + 显示结果 ────────────────────────────────────
function BlindBoxTab({pc, address, wc}){
  const [apoPx, setApoPx] = useState(null)
  const [drlPx, setDrlPx]  = useState(null)
  const [buying, setBuying] = useState(null)
  const [msg, setMsg]       = useState('')
  const [results, setResults] = useState([])  // 购买记录
  const [count, setCount]   = useState(1)

  useEffect(()=>{
    if(!pc) return
    Promise.all([
      pc.readContract({address:CONTRACTS.blindbox,abi:BB_ABI,functionName:'apostleBoxPrice'}).catch(()=>null),
      pc.readContract({address:CONTRACTS.blindbox,abi:BB_ABI,functionName:'drillBoxPrice'}).catch(()=>null),
    ]).then(([a,d])=>{ setApoPx(a); setDrlPx(d) })
  },[pc])

  async function buy(type){
    if(!wc||!address){ setMsg('请先连接钱包'); return }
    const price = type==='apostle' ? apoPx : drlPx
    if(!price) return
    const total = price * BigInt(count)
    setBuying(type); setMsg(`授权 ${fmtR(total)} RING...`)
    try{
      // approve
      const appData = encodeFunctionData({abi:ERC20_ABI,functionName:'approve',args:[CONTRACTS.blindbox, total]})
      const h1 = await wc.sendTransaction({to:CONTRACTS.ring, data:appData})
      await pc.waitForTransactionReceipt({hash:h1})
      setMsg(`开启 ${count} 个${type==='apostle'?'使徒':'钻头'}盲盒...`)
      // buy
      const fn = count>1 ? (type==='apostle'?'buyApostleBoxBatch':'buyDrillBoxBatch') : (type==='apostle'?'buyApostleBox':'buyDrillBox')
      const args = count>1 ? [BigInt(count)] : []
      const buyData = encodeFunctionData({abi:BB_ABI, functionName:fn, args})
      const h2 = await wc.sendTransaction({to:CONTRACTS.blindbox, data:buyData})
      const receipt = await pc.waitForTransactionReceipt({hash:h2})
      // 解析事件 — 从 logs 找 Transfer 拿 tokenId
      const newIds = receipt.logs
        .filter(l => l.address.toLowerCase() === (type==='apostle'?CONTRACTS.apostle:CONTRACTS.drill).toLowerCase())
        .map(l => { try{ return Number(BigInt(l.topics[3])) }catch{ return null } })
        .filter(Boolean)
      if(newIds.length>0){
        // 读取 attrs
        const attrRes = await pc.multicall({contracts:newIds.map(id=>({address:type==='apostle'?CONTRACTS.apostle:CONTRACTS.drill,abi:type==='apostle'?APO_ABI:DRL_ABI,functionName:'attrs',args:[BigInt(id)]})),allowFailure:true})
        const newResults = newIds.map((id,i)=>{
          const at = attrRes[i]?.result
          return type==='apostle'
            ? {type,id,strength:at?Number(at[0]):30, elem:at?Number(at[1]):0}
            : {type,id,tier:at?Number(at[0]):1, elem:at?Number(at[1]):0}
        })
        setResults(r=>[...newResults,...r].slice(0,20))
        setMsg(`🎉 获得 ${newIds.length} 个${type==='apostle'?'使徒':'钻头'}！`)
      } else {
        setMsg('✅ 购买成功！去使徒/钻头 Tab 查看')
      }
    }catch(e){ setMsg('❌ '+(e.shortMessage||e.message)) }
    finally { setBuying(null) }
  }

  const GH='https://raw.githubusercontent.com/evolutionlandorg/evo-frontend/main/public/images'

  return(
    <div>
      {msg && <div className="as-msg">{msg}</div>}
      {!address && <div className="as-empty">请先连接钱包</div>}

      {/* 购买区域 */}
      <div className="bb-asset-cards">
        {/* 数量选择 */}
        <div className="bb-count-row">
          <span style={{color:'#9080b0',fontSize:'.8rem'}}>购买数量：</span>
          {[1,5,10].map(n=>(
            <button key={n} className={`bb-count-btn${count===n?' on':''}`} onClick={()=>setCount(n)}>{n}个</button>
          ))}
        </div>

        {/* 使徒盲盒 */}
        <div className="bb-asset-card apostle">
          <div className="bb-asset-img-wrap">
            <img src={`${GH}/apostle/egg.gif`} alt="apostle box" className="bb-asset-img"/>
          </div>
          <div className="bb-asset-info">
            <div className="bb-asset-name">🧙 使徒盲盒</div>
            <div className="bb-asset-desc">随机元素 · 力量1-100 · 当场铸造</div>
            <div className="bb-asset-price">
              {apoPx ? <><span style={{color:'#f0c040',fontWeight:800,fontSize:'1.1rem'}}>{fmtR(apoPx*BigInt(count))}</span> RING × {count}</> : '加载中...'}
            </div>
          </div>
          <button className="as-btn-primary" style={{padding:'.45rem 1rem',borderRadius:10,fontSize:'.85rem'}}
            onClick={()=>buy('apostle')} disabled={!address||buying==='apostle'||!apoPx}>
            {buying==='apostle'?'开启中...':'🎁 开盲盒'}
          </button>
        </div>

        {/* 钻头盲盒 */}
        <div className="bb-asset-card drill">
          <div className="bb-asset-img-wrap">
            <img src={drillImgUrl(2,3)} alt="drill box" className="bb-asset-img"/>
          </div>
          <div className="bb-asset-info">
            <div className="bb-asset-name">⛏️ 钻头盲盒</div>
            <div className="bb-asset-desc">随机亲和 · 1-5星 · 当场铸造</div>
            <div className="bb-asset-price">
              {drlPx ? <><span style={{color:'#f0c040',fontWeight:800,fontSize:'1.1rem'}}>{fmtR(drlPx*BigInt(count))}</span> RING × {count}</> : '加载中...'}
            </div>
          </div>
          <button className="as-btn-primary" style={{padding:'.45rem 1rem',borderRadius:10,fontSize:'.85rem'}}
            onClick={()=>buy('drill')} disabled={!address||buying==='drill'||!drlPx}>
            {buying==='drill'?'开启中...':'🎁 开盲盒'}
          </button>
        </div>
      </div>

      {/* 开启记录 */}
      {results.length>0 && (
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
                  <div style={{fontSize:'.7rem',color:ELEMS[r.elem].color}}>
                    <ElemIcon i={r.elem} size={11}/>{ELEMS[r.elem].name}系
                    {r.type==='apostle'?` · 力量${r.strength}`:` · ${'★'.repeat(r.tier)}`}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={{fontSize:'.72rem',color:'#5040a0',marginTop:'.6rem',textAlign:'center'}}>
            💡 切换到「🧙 使徒」或「⛏️ 钻头」Tab 查看全部
          </div>
        </div>
      )}
    </div>
  )
}

// ── Token Tab ─────────────────────────────────────────────────────────────
function TokenTab({pc,address}){
  const [bals,setBals]=useState({})
  const [loading,setLoading]=useState(true)
  const tokens=[
    {sym:'RING',addr:CONTRACTS.ring,icon:RING_SVG,color:'#c090ff'},
    {sym:'GOLD',addr:CONTRACTS.gold,icon:ELEM_SVGS[0],color:ELEMS[0].color},
    {sym:'WOOD',addr:CONTRACTS.wood,icon:ELEM_SVGS[1],color:ELEMS[1].color},
    {sym:'HHO', addr:CONTRACTS.water,icon:ELEM_SVGS[2],color:ELEMS[2].color},
    {sym:'FIRE',addr:CONTRACTS.fire,icon:ELEM_SVGS[3],color:ELEMS[3].color},
    {sym:'SIOO',addr:CONTRACTS.soil,icon:ELEM_SVGS[4],color:ELEMS[4].color},
  ]
  useEffect(()=>{
    if(!address||!pc){setLoading(false);return}
    pc.multicall({contracts:tokens.map(t=>({address:t.addr,abi:ERC20_ABI,functionName:'balanceOf',args:[address]})),allowFailure:true})
      .then(res=>{const b={};tokens.forEach((t,i)=>{b[t.sym]=res[i]?.result??0n});setBals(b)}).finally(()=>setLoading(false))
  },[address,pc])
  if(!address)return <div className="as-empty">请先连接钱包</div>
  if(loading)return <div className="as-loading"><span className="as-spin"/>加载中...</div>
  return(
    <div className="as-token-grid">
      {tokens.map(t=>(
        <div key={t.sym} className="as-token-card">
          <img src={t.icon} alt={t.sym} style={{width:36,height:36}}/>
          <div className="as-token-sym" style={{color:t.color}}>{t.sym}</div>
          <div className="as-token-bal">{fmtR(bals[t.sym]||0n)}</div>
        </div>
      ))}
    </div>
  )
}

// ── Land Tab ──────────────────────────────────────────────────────────────
function LandTab({pc,address,wc}){
  const [lands,setLands]=useState([])
  const [loading,setLoading]=useState(true)
  const [msg,setMsg]=useState('')
  const [sellModal,setSellModal]=useState(null)
  const [sellPrice,setSellPrice]=useState('5')

  const load=useCallback(async()=>{
    if(!address||!pc){setLoading(false);return}
    setLoading(true)
    try{
      // 1. 优先从后端 API 获取所有铸造的土地 ID（快速）
      let allIds=[]
      try{
        const res=await fetch('/api/lands')
        if(res.ok){const d=await res.json();if(d.ok)allIds=d.lands.map(l=>l.id)}
      }catch{}
      // 兜底：扫描固定范围
      if(allIds.length===0){
        for(let x=0;x<12;x++) for(let y=0;y<5;y++) allIds.push(x*100+y+1)
      }
      // 2. 批量查 ownerOf 找属于自己的土地
      const BATCH=100
      const myIds=[]
      for(let i=0;i<allIds.length;i+=BATCH){
        const batch=allIds.slice(i,i+BATCH)
        const ownerRes=await pc.multicall({contracts:batch.map(id=>({address:CONTRACTS.land,abi:[{type:'function',name:'ownerOf',inputs:[{name:'id',type:'uint256'}],outputs:[{type:'address'}],stateMutability:'view'}],functionName:'ownerOf',args:[BigInt(id)]})),allowFailure:true})
        batch.forEach((id,j)=>{if(ownerRes[j]?.result?.toLowerCase()===address.toLowerCase())myIds.push(id)})
      }
      if(myIds.length===0){setLands([]);setLoading(false);return}
      // 3. 读资源属性、挖矿槽、两个拍卖合约
      const NFT_AUC_ABI_MIN=[{type:'function',name:'getAuction',inputs:[{name:'nft',type:'address'},{name:'id',type:'uint256'}],outputs:[{components:[{name:'nftContract',type:'address'},{name:'seller',type:'address'},{name:'startPrice',type:'uint128'},{name:'endPrice',type:'uint128'},{name:'duration',type:'uint64'},{name:'startedAt',type:'uint64'}],type:'tuple'}],stateMutability:'view'}]
      const [attrs,slots,oldAucs,newAucs]=await Promise.all([
        pc.multicall({contracts:myIds.map(id=>({address:CONTRACTS.land,abi:LAND_ABI,functionName:'resourceAttr',args:[BigInt(id)]})),allowFailure:true}),
        pc.multicall({contracts:myIds.map(id=>({address:CONTRACTS.mining,abi:MINING_ABI,functionName:'slotCount',args:[BigInt(id)]})),allowFailure:true}),
        pc.multicall({contracts:myIds.map(id=>({address:CONTRACTS.auction,abi:AUC_ABI,functionName:'auctions',args:[BigInt(id)]})),allowFailure:true}),
        pc.multicall({contracts:myIds.map(id=>({address:NFT_AUCTION_ADDR,abi:NFT_AUC_ABI_MIN,functionName:'getAuction',args:[CONTRACTS.land,BigInt(id)]})),allowFailure:true}),
      ])
      setLands(myIds.map((id,i)=>{
        const oldA=oldAucs[i]?.result
        const newA=newAucs[i]?.result
        const inOldAuc=oldA&&oldA[4]>0n
        const inNewAuc=newA&&newA.startedAt>0n
        return{id,resourceAttr:attrs[i]?.result??0n,slots:Number(slots[i]?.result??0n),inAuction:inOldAuc||inNewAuc,auctionType:inNewAuc?'new':inOldAuc?'old':'none'}
      }))
    }catch(e){console.error(e)}
    setLoading(false)
  },[address,pc])
  useEffect(()=>{load()},[load])

  async function handleSell(landId){
    if(!wc){alert('请先连接钱包');return}
    setMsg('授权中...')
    try{
      // 使用新的 NFTAuction 合约挂土地
      const NFT_AUC_ABI_MIN=[
        {type:'function',name:'createAuction',inputs:[{name:'nft',type:'address'},{name:'id',type:'uint256'},{name:'sp',type:'uint128'},{name:'ep',type:'uint128'},{name:'dur',type:'uint64'}],outputs:[],stateMutability:'nonpayable'},
      ]
      const isAppr=await pc.readContract({address:CONTRACTS.land,abi:NFT_ABI,functionName:'isApprovedForAll',args:[address,NFT_AUCTION_ADDR]}).catch(()=>false)
      if(!isAppr){
        const h=await wc.sendTransaction({to:CONTRACTS.land,data:encodeFunctionData({abi:NFT_ABI,functionName:'setApprovalForAll',args:[NFT_AUCTION_ADDR,true]})})
        await pc.waitForTransactionReceipt({hash:h})
      }
      setMsg('挂单中...')
      const h=await wc.sendTransaction({to:NFT_AUCTION_ADDR,data:encodeFunctionData({abi:NFT_AUC_ABI_MIN,functionName:'createAuction',args:[CONTRACTS.land,BigInt(landId),parseEther(sellPrice),parseEther('1'),BigInt(3*24*3600)]})})
      await pc.waitForTransactionReceipt({hash:h})
      setMsg('✅ 挂单成功！去市场→土地查看');setSellModal(null);setTimeout(()=>{setMsg('');load()},3000)
    }catch(e){setMsg('❌ '+(e.shortMessage||e.message))}
  }
  async function handleCancel(landId, auctionType){
    if(!wc)return; setMsg('撤销中...')
    try{
      let h
      if(auctionType==='old'){
        h=await wc.sendTransaction({to:CONTRACTS.auction,data:encodeFunctionData({abi:AUC_ABI,functionName:'cancelAuction',args:[BigInt(landId)]})})
      } else {
        const NFT_AUC_CANCEL=[{type:'function',name:'cancelAuction',inputs:[{name:'nft',type:'address'},{name:'id',type:'uint256'}],outputs:[],stateMutability:'nonpayable'}]
        h=await wc.sendTransaction({to:NFT_AUCTION_ADDR,data:encodeFunctionData({abi:NFT_AUC_CANCEL,functionName:'cancelAuction',args:[CONTRACTS.land,BigInt(landId)]})})
      }
      await pc.waitForTransactionReceipt({hash:h})
      setMsg('✅ 已撤销');setTimeout(()=>{setMsg('');load()},2000)
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
      <div className="as-nft-grid">
        {lands.map(l=>{
          const vals=decodeAttr(l.resourceAttr),maxV=Math.max(1,...vals)
          const inAuction=l.inAuction
          return(
            <div key={l.id} className="as-nft-card">
              <div className="as-nft-img-wrap"><img src={landImgUrl(l.id)} alt="land" className="as-nft-img"/></div>
              <div className="as-nft-body">
                <div className="as-nft-title">土地 #{l.id} <span style={{fontSize:'.6rem',color:'#4030a0'}}>({(l.id-1)%100},{Math.floor((l.id-1)/100)})</span></div>
                {l.slots>0&&<div style={{fontSize:'.68rem',color:'#f0c040'}}>⛏️ {l.slots}槽挖矿中</div>}
                {inAuction&&<div style={{fontSize:'.68rem',color:'#52c462'}}>🔖 拍卖中</div>}
                <div className="as-res-bars">{vals.map((v,i)=><div key={i} className="as-res-bar-row"><ElemIcon i={i} size={11}/><div className="as-res-bar-bg"><div style={{width:`${(v/maxV*100).toFixed(0)}%`,height:'100%',background:ELEMS[i].color,borderRadius:2}}/></div><span style={{color:ELEMS[i].color,fontSize:'.62rem',minWidth:22}}>{v}</span></div>)}</div>
                <div className="as-nft-actions">
                  {inAuction
                    ?<button className="as-btn-sm as-btn-danger" onClick={()=>handleCancel(l.id,l.auctionType)}>撤销挂单</button>
                    :<button className="as-btn-sm as-btn-primary" onClick={()=>setSellModal(l.id)}>挂卖到市场</button>
                  }
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

// ── Apostle Tab ───────────────────────────────────────────────────────────
function ApostleTab({pc,address,wc}){
  const [apos,setApos]=useState([])
  const [loading,setLoading]=useState(true)
  const [msg,setMsg]=useState('')
  const [sellModal,setSellModal]=useState(null)
  const [sellPrice,setSellPrice]=useState('3')

  const load=useCallback(async()=>{
    if(!address||!pc){setLoading(false);return}
    setLoading(true)
    try{
      // ownerOf scan 1..nextId
      const nextId=await pc.readContract({address:CONTRACTS.apostle,abi:[{type:'function',name:'nextId',inputs:[],outputs:[{type:'uint256'}],stateMutability:'view'}],functionName:'nextId'})
      const total=Number(nextId)-1
      if(total<=0){setApos([]);setLoading(false);return}
      const BATCH=50; const myIds=[]
      for(let s=1;s<=total;s+=BATCH){
        const ids=Array.from({length:Math.min(BATCH,total-s+1)},(_,i)=>s+i)
        const res=await pc.multicall({contracts:ids.map(id=>({address:CONTRACTS.apostle,abi:[{type:'function',name:'ownerOf',inputs:[{name:'id',type:'uint256'}],outputs:[{type:'address'}],stateMutability:'view'}],functionName:'ownerOf',args:[BigInt(id)]})),allowFailure:true})
        ids.forEach((id,i)=>{ if(res[i]?.result?.toLowerCase()===address.toLowerCase()) myIds.push(id) })
      }
      if(myIds.length===0){setApos([]);setLoading(false);return}
      const [attrRes,aucRes]=await Promise.all([
        pc.multicall({contracts:myIds.map(id=>({address:CONTRACTS.apostle,abi:APO_ABI,functionName:'attrs',args:[BigInt(id)]})),allowFailure:true}),
        pc.multicall({contracts:myIds.map(id=>({address:NFT_AUCTION_ADDR,abi:NFT_AUC_ABI,functionName:'getAuction',args:[CONTRACTS.apostle,BigInt(id)]})),allowFailure:true}),
      ])
      setApos(myIds.map((id,i)=>({id,strength:attrRes[i]?.result?Number(attrRes[i].result[0]):30,elem:attrRes[i]?.result?Number(attrRes[i].result[1]):0,auction:aucRes[i]?.result})))
    }catch(e){console.error(e)}
    setLoading(false)
  },[address,pc])
  useEffect(()=>{load()},[load])

  async function handleSell(apoId){
    if(!wc)return; setMsg('授权中...')
    try{
      // 使徒用 NFTAuction，需要 setOperator 或 setApprovalForAll
      const isAppr=await pc.readContract({address:CONTRACTS.apostle,abi:NFT_ABI,functionName:'isApprovedForAll',args:[address,NFT_AUCTION_ADDR]}).catch(()=>false)
      if(!isAppr){
        const h=await wc.sendTransaction({to:CONTRACTS.apostle,data:encodeFunctionData({abi:NFT_ABI,functionName:'setApprovalForAll',args:[NFT_AUCTION_ADDR,true]})})
        await pc.waitForTransactionReceipt({hash:h})
      }
      setMsg('挂单中...')
      const h=await wc.sendTransaction({to:NFT_AUCTION_ADDR,data:encodeFunctionData({abi:NFT_AUC_ABI,functionName:'createAuction',args:[CONTRACTS.apostle,BigInt(apoId),parseEther(sellPrice),parseEther('0.5'),BigInt(3*24*3600)]})})
      await pc.waitForTransactionReceipt({hash:h})
      setMsg('✅ 成功！');setSellModal(null);setTimeout(()=>{setMsg('');load()},2000)
    }catch(e){setMsg('❌ '+(e.shortMessage||e.message))}
  }
  async function handleCancel(apoId){
    if(!wc)return; setMsg('撤销中...')
    try{
      const h=await wc.sendTransaction({to:NFT_AUCTION_ADDR,data:encodeFunctionData({abi:NFT_AUC_ABI,functionName:'cancelAuction',args:[CONTRACTS.apostle,BigInt(apoId)]})})
      await pc.waitForTransactionReceipt({hash:h}); setMsg('✅ 已撤销');setTimeout(()=>{setMsg('');load()},2000)
    }catch(e){setMsg('❌ '+(e.shortMessage||e.message))}
  }

  if(!address)return <div className="as-empty">请先连接钱包</div>
  if(loading)return <div className="as-loading"><span className="as-spin"/>扫描使徒中...</div>
  return(
    <div>
      {msg&&<div className="as-msg">{msg}</div>}
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

// ── Drill Tab ─────────────────────────────────────────────────────────────
function DrillTab({pc,address,wc}){
  const [drills,setDrills]=useState([])
  const [loading,setLoading]=useState(true)
  const [msg,setMsg]=useState('')
  const [sellModal,setSellModal]=useState(null)
  const [sellPrice,setSellPrice]=useState('3')

  const load=useCallback(async()=>{
    if(!address||!pc){setLoading(false);return}
    setLoading(true)
    try{
      const nextId=await pc.readContract({address:CONTRACTS.drill,abi:[{type:'function',name:'nextId',inputs:[],outputs:[{type:'uint256'}],stateMutability:'view'}],functionName:'nextId'})
      const total=Number(nextId)-1
      if(total<=0){setDrills([]);setLoading(false);return}
      const BATCH=50; const myIds=[]
      for(let s=1;s<=total;s+=BATCH){
        const ids=Array.from({length:Math.min(BATCH,total-s+1)},(_,i)=>s+i)
        const res=await pc.multicall({contracts:ids.map(id=>({address:CONTRACTS.drill,abi:[{type:'function',name:'ownerOf',inputs:[{name:'id',type:'uint256'}],outputs:[{type:'address'}],stateMutability:'view'}],functionName:'ownerOf',args:[BigInt(id)]})),allowFailure:true})
        ids.forEach((id,i)=>{ if(res[i]?.result?.toLowerCase()===address.toLowerCase()) myIds.push(id) })
      }
      if(myIds.length===0){setDrills([]);setLoading(false);return}
      const [attrRes,aucRes]=await Promise.all([
        pc.multicall({contracts:myIds.map(id=>({address:CONTRACTS.drill,abi:DRL_ABI,functionName:'attrs',args:[BigInt(id)]})),allowFailure:true}),
        pc.multicall({contracts:myIds.map(id=>({address:NFT_AUCTION_ADDR,abi:NFT_AUC_ABI,functionName:'getAuction',args:[CONTRACTS.drill,BigInt(id)]})),allowFailure:true}),
      ])
      setDrills(myIds.map((id,i)=>({id,tier:attrRes[i]?.result?Number(attrRes[i].result[0]):1,elem:attrRes[i]?.result?Number(attrRes[i].result[1]):0,auction:aucRes[i]?.result})))
    }catch(e){console.error(e)}
    setLoading(false)
  },[address,pc])
  useEffect(()=>{load()},[load])

  async function handleSell(drlId){
    if(!wc)return; setMsg('授权中...')
    try{
      const isAppr=await pc.readContract({address:CONTRACTS.drill,abi:NFT_ABI,functionName:'isApprovedForAll',args:[address,NFT_AUCTION_ADDR]}).catch(()=>false)
      if(!isAppr){
        const h=await wc.sendTransaction({to:CONTRACTS.drill,data:encodeFunctionData({abi:NFT_ABI,functionName:'setApprovalForAll',args:[NFT_AUCTION_ADDR,true]})})
        await pc.waitForTransactionReceipt({hash:h})
      }
      setMsg('挂单中...')
      const h=await wc.sendTransaction({to:NFT_AUCTION_ADDR,data:encodeFunctionData({abi:NFT_AUC_ABI,functionName:'createAuction',args:[CONTRACTS.drill,BigInt(drlId),parseEther(sellPrice),parseEther('0.1'),BigInt(3*24*3600)]})})
      await pc.waitForTransactionReceipt({hash:h})
      setMsg('✅ 成功！');setSellModal(null);setTimeout(()=>{setMsg('');load()},2000)
    }catch(e){setMsg('❌ '+(e.shortMessage||e.message))}
  }
  async function handleCancel(drlId){
    if(!wc)return; setMsg('撤销中...')
    try{
      const h=await wc.sendTransaction({to:NFT_AUCTION_ADDR,data:encodeFunctionData({abi:NFT_AUC_ABI,functionName:'cancelAuction',args:[CONTRACTS.drill,BigInt(drlId)]})})
      await pc.waitForTransactionReceipt({hash:h}); setMsg('✅ 已撤销');setTimeout(()=>{setMsg('');load()},2000)
    }catch(e){setMsg('❌ '+(e.shortMessage||e.message))}
  }

  if(!address)return <div className="as-empty">请先连接钱包</div>
  if(loading)return <div className="as-loading"><span className="as-spin"/>扫描钻头中...</div>
  return(
    <div>
      {msg&&<div className="as-msg">{msg}</div>}
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
    if(!address||!pc){setLoading(false);return}
    setLoading(true)
    try{
      const LAND_IDS=[]
      for(let x=0;x<=9;x++) for(let y=0;y<=4;y++) LAND_IDS.push(x*100+y+1)
      // 找我的土地
      const ownerRes=await pc.multicall({contracts:LAND_IDS.map(id=>({address:CONTRACTS.land,abi:[{type:'function',name:'ownerOf',inputs:[{name:'id',type:'uint256'}],outputs:[{type:'address'}],stateMutability:'view'}],functionName:'ownerOf',args:[BigInt(id)]})),allowFailure:true})
      const myLandIds=LAND_IDS.filter((_,i)=>ownerRes[i]?.result?.toLowerCase()===address.toLowerCase())
      // 还包括挖矿中的地块（owner是mining合约）
      const miningAddr=CONTRACTS.mining.toLowerCase()
      const miningLandIds=LAND_IDS.filter((_,i)=>ownerRes[i]?.result?.toLowerCase()===miningAddr)
      const allIds=[...new Set([...myLandIds,...miningLandIds])]
      if(allIds.length===0){setLands([]);setLoading(false);return}
      const slotCounts=await pc.multicall({contracts:allIds.map(id=>({address:CONTRACTS.mining,abi:MINING_ABI,functionName:'slotCount',args:[BigInt(id)]})),allowFailure:true})
      const activeLandIds=allIds.filter((_,i)=>Number(slotCounts[i]?.result??0n)>0)
      if(activeLandIds.length===0){setLands([]);setLoading(false);return}
      const landData=[]
      for(const id of activeLandIds){
        const cnt=Number(await pc.readContract({address:CONTRACTS.mining,abi:MINING_ABI,functionName:'slotCount',args:[BigInt(id)]}))
        const [rewards,slotsData]=await Promise.all([
          pc.readContract({address:CONTRACTS.mining,abi:MINING_ABI,functionName:'pendingRewards',args:[BigInt(id)]}).catch(()=>null),
          Promise.all(Array.from({length:cnt},(_,j)=>pc.readContract({address:CONTRACTS.mining,abi:MINING_ABI,functionName:'slots',args:[BigInt(id),BigInt(j)]}).catch(()=>null)))
        ])
        landData.push({id,slotCount:cnt,rewards,slots:slotsData.filter(Boolean)})
      }
      setLands(landData)
    }catch(e){console.error(e)}
    setLoading(false)
  },[address,pc])
  useEffect(()=>{load()},[load])

  async function handleClaim(landId){
    if(!wc)return; setMsg('领取中...')
    try{
      const h=await wc.sendTransaction({to:CONTRACTS.mining,data:encodeFunctionData({abi:MINING_ABI,functionName:'claimLandReward',args:[BigInt(landId)]})})
      await pc.waitForTransactionReceipt({hash:h}); setMsg('✅ 领取成功！');setTimeout(()=>{setMsg('');load()},2000)
    }catch(e){setMsg('❌ '+(e.shortMessage||e.message))}
  }
  async function handleStop(landId,slotIdx){
    if(!wc)return; setMsg('停止挖矿...')
    try{
      const h=await wc.sendTransaction({to:CONTRACTS.mining,data:encodeFunctionData({abi:MINING_ABI,functionName:'stopMining',args:[BigInt(landId),BigInt(slotIdx)]})})
      await pc.waitForTransactionReceipt({hash:h}); setMsg('✅ 已停止');setTimeout(()=>{setMsg('');load()},2000)
    }catch(e){setMsg('❌ '+(e.shortMessage||e.message))}
  }

  if(!address)return <div className="as-empty">请先连接钱包</div>
  if(loading)return <div className="as-loading"><span className="as-spin"/>扫描挖矿中...</div>
  if(lands.length===0)return <div className="as-empty">暂无挖矿中的地块</div>
  return(
    <div>
      {msg&&<div className="as-msg">{msg}</div>}
      <div style={{display:'flex',flexDirection:'column',gap:12}}>
        {lands.map(l=>(
          <div key={l.id} className="as-mining-card">
            <div className="as-mining-head">
              <img src={landImgUrl(l.id)} alt="land" style={{width:52,height:52,borderRadius:8,objectFit:'cover'}}/>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,color:'#c090ff'}}>土地 #{l.id}</div>
                <div style={{fontSize:'.72rem',color:'#5040a0'}}>{l.slotCount} 个使徒工作中</div>
              </div>
              <button className="as-btn-sm as-btn-primary" onClick={()=>handleClaim(l.id)}>💰 领取</button>
            </div>
            {l.rewards&&(
              <div className="as-rewards-row">
                <span style={{fontSize:'.68rem',color:'#5040a0',marginRight:6}}>待领：</span>
                {ELEMS.map((el,i)=>(
                  <span key={i} style={{fontSize:'.72rem',color:el.color,marginRight:8}}>
                    <ElemIcon i={i} size={11}/>{fmtR(l.rewards[i]||0n,2)}
                  </span>
                ))}
              </div>
            )}
            <div className="as-slots-row">
              {l.slots.map((slot,j)=>(
                <div key={j} className="as-slot-chip">
                  <img src={APO_EGG_GIF} style={{width:22,height:22}}/>
                  <span>#{slot.apostleId?.toString()}</span>
                  <img src={drillImgUrl(0,1)} style={{width:22,height:22}}/>
                  <span>#{slot.drillId?.toString()}</span>
                  <button className="as-btn-xs as-btn-danger" onClick={()=>handleStop(l.id,j)}>停</button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────
export default function AssetsPage({initialTab='token'}){
  const pc=usePublicClient(),{address}=useAccount(),{data:wc}=useWalletClient()
  const [tab,setTab]=useState(initialTab)

  // 响应外部跳转
  useEffect(()=>{ if(initialTab) setTab(initialTab) },[initialTab])

  return(
    <div className="as-root">
      <div className="as-header"><h1 className="as-title">💎 我的资产</h1></div>
      <div className="as-tabs">
        {TABS.map(t=><button key={t.k} className={`as-tab${tab===t.k?' on':''}`} onClick={()=>setTab(t.k)}>{t.label}</button>)}
      </div>
      <div className="as-content">
        {tab==='token'   &&<TokenTab   pc={pc} address={address}/>}
        {tab==='blindbox'&&<BlindBoxTab pc={pc} address={address} wc={wc}/>}
        {tab==='land'    &&<LandTab    pc={pc} address={address} wc={wc}/>}
        {tab==='apostle' &&<ApostleTab pc={pc} address={address} wc={wc}/>}
        {tab==='drill'   &&<DrillTab   pc={pc} address={address} wc={wc}/>}
        {tab==='mining'  &&<MiningTab  pc={pc} address={address} wc={wc}/>}
      </div>
    </div>
  )
}
