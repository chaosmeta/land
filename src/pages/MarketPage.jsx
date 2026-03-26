import { useState, useEffect, useCallback, useRef } from 'react'
import { usePublicClient, useAccount, useWalletClient } from '../contexts/WalletContext.jsx'

import { formatEther, encodeFunctionData, parseEther } from 'viem'
import { CONTRACTS, NFT_AUCTION_ADDR, DEPLOY_BLOCK } from '../constants/contracts'
import { APO_EGG_GIF, drillImgUrl, landImgUrl, ELEM_SVGS, ELEMS } from '../constants/images'
import './MarketPage.css'

const AUC_ABI=[
  {type:'function',name:'auctions',inputs:[{name:'id',type:'uint256'}],outputs:[{name:'seller',type:'address'},{name:'startPrice',type:'uint128'},{name:'endPrice',type:'uint128'},{name:'duration',type:'uint64'},{name:'startedAt',type:'uint64'}],stateMutability:'view'},
  {type:'function',name:'currentPrice',inputs:[{name:'id',type:'uint256'}],outputs:[{type:'uint256'}],stateMutability:'view'},
  {type:'function',name:'bid',inputs:[{name:'id',type:'uint256'},{name:'price',type:'uint256'}],stateMutability:'nonpayable',outputs:[]},
  {type:'function',name:'cancelAuction',inputs:[{name:'id',type:'uint256'}],stateMutability:'nonpayable',outputs:[]},
]
const NFT_AUC_ABI=[
  {type:'function',name:'getAuction',inputs:[{name:'nft',type:'address'},{name:'id',type:'uint256'}],outputs:[{components:[{name:'nftContract',type:'address'},{name:'seller',type:'address'},{name:'startPrice',type:'uint128'},{name:'endPrice',type:'uint128'},{name:'duration',type:'uint64'},{name:'startedAt',type:'uint64'}],type:'tuple'}],stateMutability:'view'},
  {type:'function',name:'currentPrice',inputs:[{name:'nft',type:'address'},{name:'id',type:'uint256'}],outputs:[{type:'uint256'}],stateMutability:'view'},
  {type:'function',name:'bid',inputs:[{name:'nft',type:'address'},{name:'id',type:'uint256'},{name:'maxPay',type:'uint256'}],stateMutability:'nonpayable',outputs:[]},
  {type:'function',name:'cancelAuction',inputs:[{name:'nft',type:'address'},{name:'id',type:'uint256'}],stateMutability:'nonpayable',outputs:[]},
  {type:'function',name:'createAuction',inputs:[{name:'nft',type:'address'},{name:'id',type:'uint256'},{name:'sp',type:'uint128'},{name:'ep',type:'uint128'},{name:'dur',type:'uint64'}],stateMutability:'nonpayable',outputs:[]},
  // 事件
  {type:'event',name:'AuctionCreated',inputs:[{indexed:true,name:'nft',type:'address'},{indexed:true,name:'id',type:'uint256'},{name:'seller',type:'address'},{name:'start',type:'uint128'},{name:'end',type:'uint128'},{name:'dur',type:'uint64'}]},
  {type:'event',name:'AuctionWon',inputs:[{indexed:true,name:'nft',type:'address'},{indexed:true,name:'id',type:'uint256'},{name:'buyer',type:'address'},{name:'price',type:'uint256'}]},
  {type:'event',name:'AuctionCancelled',inputs:[{indexed:true,name:'nft',type:'address'},{indexed:true,name:'id',type:'uint256'}]},
]
const OLD_AUC_EVENTS=[
  {type:'event',name:'AuctionCreated',inputs:[{indexed:true,name:'id',type:'uint256'},{name:'seller',type:'address'},{name:'start',type:'uint128'},{name:'end',type:'uint128'},{name:'duration',type:'uint64'}]},
  {type:'event',name:'AuctionWon',inputs:[{indexed:true,name:'id',type:'uint256'},{name:'buyer',type:'address'},{name:'price',type:'uint256'}]},
  {type:'event',name:'AuctionCancelled',inputs:[{indexed:true,name:'id',type:'uint256'}]},
]
const ERC20_ABI=[{type:'function',name:'approve',inputs:[{name:'spender',type:'address'},{name:'amount',type:'uint256'}],outputs:[{type:'bool'}],stateMutability:'nonpayable'},{type:'function',name:'balanceOf',inputs:[{name:'account',type:'address'}],outputs:[{type:'uint256'}],stateMutability:'view'}]
const APO_ABI=[{type:'function',name:'attrs',inputs:[{name:'id',type:'uint256'}],outputs:[{name:'strength',type:'uint8'},{name:'element',type:'uint8'},{name:'gender',type:'uint8'},{name:'gen',type:'uint16'},{name:'genes',type:'uint64'},{name:'birthTime',type:'uint64'},{name:'cooldown',type:'uint64'},{name:'motherId',type:'uint32'},{name:'fatherId',type:'uint32'}],stateMutability:'view'}]
const DRL_ABI=[{type:'function',name:'attrs',inputs:[{name:'id',type:'uint256'}],outputs:[{name:'tier',type:'uint8'},{name:'affinity',type:'uint8'}],stateMutability:'view'}]
const LAND_ABI=[{type:'function',name:'resourceAttr',inputs:[{name:'tokenId',type:'uint256'}],outputs:[{type:'uint80'}],stateMutability:'view'},{type:'function',name:'slotCount',inputs:[{name:'landId',type:'uint256'}],outputs:[{type:'uint256'}],stateMutability:'view'}]

// ── IndexedDB 缓存 ── 持久化，支持大数据量 ─────────────────────────────
const DB_NAME = 'evomarket', DB_VER = 4, STORE = 'market'
async function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VER)
    req.onupgradeneeded = e => { const db = e.target.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE) }
    req.onsuccess = e => res(e.target.result)
    req.onerror = e => rej(e.target.error)
  })
}
async function dbGet(key) {
  try { const db = await openDB(); return new Promise((res,rej)=>{const r=db.transaction(STORE,'readonly').objectStore(STORE).get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}) } catch { return null }
}
async function dbSet(key, val) {
  try { const db = await openDB(); return new Promise((res,rej)=>{const r=db.transaction(STORE,'readwrite').objectStore(STORE).put(val,key);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)}) } catch {}
}

const CACHE_TTL = 5 * 60 * 1000  // 5分钟内直接用缓存，后台刷新
const STALE_TTL = 30 * 60 * 1000 // 30分钟强制刷新

function bigintReplacer(_, v) { return typeof v === 'bigint' ? v.toString() + 'n' : v }
function bigintReviver(_, v) { return typeof v === 'string' && v.endsWith('n') && /^\d+n$/.test(v) ? BigInt(v.slice(0,-1)) : v }
function serialize(data) { return JSON.stringify(data, bigintReplacer) }
function deserialize(str) { return JSON.parse(str, bigintReviver) }

async function saveMarketCache(data) {
  await dbSet('market_data', serialize({ ts: Date.now(), data }))
}
async function loadMarketCache() {
  try {
    const raw = await dbGet('market_data')
    if (!raw) return null
    const { ts, data } = deserialize(raw)
    return { data, age: Date.now() - ts, fresh: Date.now() - ts < CACHE_TTL }
  } catch { return null }
}

// ── 事件日志扫描（通过后端API索引，解决RPC块限制问题） ─────────────────
const API_BASE = import.meta.env.VITE_API_BASE || '/api'

async function fetchActiveListings() {
  // 优先调用后端索引 API
  try {
    const res = await fetch(`${API_BASE}/listings`)
    if (!res.ok) throw new Error(`API ${res.status}`)
    const data = await res.json()
    if (data.ok) {
      return {
        apoIds:     data.apostleIds  || [],
        drlIds:     data.drillIds    || [],
        landIds:    data.landIds     || [],
        oldLandIds: data.oldLandIds  || [],
      }
    }
    throw new Error(data.error || 'API error')
  } catch(apiErr) {
    console.warn('API fallback to direct scan:', apiErr.message)
    // 回退到直接链上扫描（仅扫最近50000块）
    return await fetchActiveListingsFallback(window._publicClient)
  }
}

async function fetchActiveListingsFallback(pc) {
  if (!pc) return { apoIds:[], drlIds:[], landIds:[], oldLandIds:[] }
  const latest = await pc.getBlockNumber().catch(()=>0n)
  if (!latest) return { apoIds:[], drlIds:[], landIds:[], oldLandIds:[] }
  // 只扫最近 44000 块（安全范围内）
  const FROM = latest > 44000n ? latest - 44000n : 0n

  const [created, won, cancelled, oldCreated, oldWon, oldCxd] = await Promise.all([
    pc.getLogs({ address: NFT_AUCTION_ADDR, event: NFT_AUC_ABI[4], fromBlock: FROM, toBlock: 'latest' }).catch(()=>[]),
    pc.getLogs({ address: NFT_AUCTION_ADDR, event: NFT_AUC_ABI[5], fromBlock: FROM, toBlock: 'latest' }).catch(()=>[]),
    pc.getLogs({ address: NFT_AUCTION_ADDR, event: NFT_AUC_ABI[6], fromBlock: FROM, toBlock: 'latest' }).catch(()=>[]),
    pc.getLogs({ address: CONTRACTS.auction, event: OLD_AUC_EVENTS[0], fromBlock: FROM, toBlock: 'latest' }).catch(()=>[]),
    pc.getLogs({ address: CONTRACTS.auction, event: OLD_AUC_EVENTS[1], fromBlock: FROM, toBlock: 'latest' }).catch(()=>[]),
    pc.getLogs({ address: CONTRACTS.auction, event: OLD_AUC_EVENTS[2], fromBlock: FROM, toBlock: 'latest' }).catch(()=>[]),
  ])
  const sold = new Set(won.map(e=>e.args.nft?.toLowerCase()+'_'+e.args.id?.toString()))
  const cxd  = new Set(cancelled.map(e=>e.args.nft?.toLowerCase()+'_'+e.args.id?.toString()))
  const active = created.filter(e=>{ const k=e.args.nft?.toLowerCase()+'_'+e.args.id?.toString(); return !sold.has(k)&&!cxd.has(k) })
  const oldSold = new Set(oldWon.map(e=>e.args.id?.toString()))
  const oldCxd2 = new Set(oldCxd.map(e=>e.args.id?.toString()))
  const oldActive = oldCreated.filter(e=>!oldSold.has(e.args.id?.toString())&&!oldCxd2.has(e.args.id?.toString()))
  return {
    apoIds:    active.filter(e=>e.args.nft?.toLowerCase()===CONTRACTS.apostle.toLowerCase()).map(e=>Number(e.args.id)),
    drlIds:    active.filter(e=>e.args.nft?.toLowerCase()===CONTRACTS.drill.toLowerCase()).map(e=>Number(e.args.id)),
    landIds:   active.filter(e=>e.args.nft?.toLowerCase()===CONTRACTS.land.toLowerCase()).map(e=>Number(e.args.id)),
    oldLandIds:oldActive.map(e=>Number(e.args.id)),
  }
}

// ── 批量读取属性和价格 ─────────────────────────────────────────────────
async function enrichApostles(pc, ids) {
  if (!ids.length) return []
  const BATCH = 100
  const result = []
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i+BATCH)
    const [aucR, prR, atR] = await Promise.all([
      pc.multicall({contracts:batch.map(id=>({address:NFT_AUCTION_ADDR,abi:NFT_AUC_ABI,functionName:'getAuction',args:[CONTRACTS.apostle,BigInt(id)]})),allowFailure:true}),
      pc.multicall({contracts:batch.map(id=>({address:NFT_AUCTION_ADDR,abi:NFT_AUC_ABI,functionName:'currentPrice',args:[CONTRACTS.apostle,BigInt(id)]})),allowFailure:true}),
      pc.multicall({contracts:batch.map(id=>({address:CONTRACTS.apostle,abi:APO_ABI,functionName:'attrs',args:[BigInt(id)]})),allowFailure:true}),
    ])
    batch.forEach((id,j) => {
      const a=aucR[j]?.result; if(!a||!a.startedAt||a.startedAt===0n) return
      const at=atR[j]?.result, cp=prR[j]?.result??0n
      result.push({id,seller:a.seller,startPrice:a.startPrice,endPrice:a.endPrice,duration:a.duration,startedAt:a.startedAt,currentPrice:cp,endsAt:Number(a.startedAt)+Number(a.duration),strength:at?Number(at[0]):30,elem:at?Number(at[1]):0})
    })
  }
  return result
}

async function enrichDrills(pc, ids) {
  if (!ids.length) return []
  const BATCH = 100
  const result = []
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i+BATCH)
    const [aucR, prR, atR] = await Promise.all([
      pc.multicall({contracts:batch.map(id=>({address:NFT_AUCTION_ADDR,abi:NFT_AUC_ABI,functionName:'getAuction',args:[CONTRACTS.drill,BigInt(id)]})),allowFailure:true}),
      pc.multicall({contracts:batch.map(id=>({address:NFT_AUCTION_ADDR,abi:NFT_AUC_ABI,functionName:'currentPrice',args:[CONTRACTS.drill,BigInt(id)]})),allowFailure:true}),
      pc.multicall({contracts:batch.map(id=>({address:CONTRACTS.drill,abi:DRL_ABI,functionName:'attrs',args:[BigInt(id)]})),allowFailure:true}),
    ])
    batch.forEach((id,j) => {
      const a=aucR[j]?.result; if(!a||!a.startedAt||a.startedAt===0n) return
      const at=atR[j]?.result, cp=prR[j]?.result??0n
      result.push({id,seller:a.seller,startPrice:a.startPrice,endPrice:a.endPrice,duration:a.duration,startedAt:a.startedAt,currentPrice:cp,endsAt:Number(a.startedAt)+Number(a.duration),tier:at?Number(at[0]):1,elem:at?Number(at[1]):0})
    })
  }
  return result
}

async function enrichLands(pc, ids, oldIds) {
  if (!ids.length && !oldIds.length) return []
  const allIds = [...new Set([...ids, ...oldIds])]
  const BATCH = 100
  const result = []
  for (let i = 0; i < allIds.length; i += BATCH) {
    const batch = allIds.slice(i, i+BATCH)
    const isNew = id => ids.includes(id)
    const aucContract = id => isNew(id) ? NFT_AUCTION_ADDR : CONTRACTS.auction
    const aucAbi = id => isNew(id) ? NFT_AUC_ABI : AUC_ABI
    const [aucR, prR, raR, slR] = await Promise.all([
      pc.multicall({contracts:batch.map(id=>isNew(id)?{address:NFT_AUCTION_ADDR,abi:NFT_AUC_ABI,functionName:'getAuction',args:[CONTRACTS.land,BigInt(id)]}:{address:CONTRACTS.auction,abi:AUC_ABI,functionName:'auctions',args:[BigInt(id)]}),allowFailure:true}),
      pc.multicall({contracts:batch.map(id=>isNew(id)?{address:NFT_AUCTION_ADDR,abi:NFT_AUC_ABI,functionName:'currentPrice',args:[CONTRACTS.land,BigInt(id)]}:{address:CONTRACTS.auction,abi:AUC_ABI,functionName:'currentPrice',args:[BigInt(id)]}),allowFailure:true}),
      pc.multicall({contracts:batch.map(id=>({address:CONTRACTS.land,abi:LAND_ABI,functionName:'resourceAttr',args:[BigInt(id)]})),allowFailure:true}),
      pc.multicall({contracts:batch.map(id=>({address:CONTRACTS.land,abi:LAND_ABI,functionName:'slotCount',args:[BigInt(id)]})),allowFailure:true}),
    ])
    batch.forEach((id,j) => {
      const raw=aucR[j]?.result; if(!raw) return
      const a=isNew(id)?raw:{seller:raw[0],startPrice:raw[1],endPrice:raw[2],duration:raw[3],startedAt:raw[4]}
      if(!a.startedAt||a.startedAt===0n) return
      const cp=prR[j]?.result??0n
      result.push({id,seller:a.seller,startPrice:a.startPrice,endPrice:a.endPrice,duration:a.duration,startedAt:a.startedAt,currentPrice:cp,endsAt:Number(a.startedAt)+Number(a.duration),resourceAttr:raR[j]?.result??0n,miningSlots:Number(slR[j]?.result??0n),_isOld:!isNew(id)})
    })
  }
  return result
}

// ── 工具函数 ──────────────────────────────────────────────────────────────
function fmtR(w,dp=3){return w?Number(formatEther(w)).toFixed(dp):'0'}
function fmtAddr(a){return a?a.slice(0,8)+'…'+a.slice(-6):''}
function sr(seed){let s=(seed^0xdeadbeef)>>>0;s=Math.imul(s^(s>>>16),0x45d9f3b)>>>0;s=Math.imul(s^(s>>>16),0x45d9f3b)>>>0;return((s^(s>>>16))>>>0)/0xffffffff}
function decodeAttr(a){if(!a)return[0,0,0,0,0];const b=BigInt(a);return[Number(b&0xffffn),Number((b>>16n)&0xffffn),Number((b>>32n)&0xffffn),Number((b>>48n)&0xffffn),Number((b>>64n)&0xffffn)]}
function ElemIcon({i,size=16}){return <img src={ELEM_SVGS[i]} alt={ELEMS[i].name} style={{width:size,height:size,verticalAlign:'middle',marginRight:3}}/>}
function getApoStats(id,str,el){const s=id*137+str;return{mining:(0.5+sr(s+1)*3).toFixed(2),attack:(1+sr(s+2)*4).toFixed(2),hp:(20+sr(s+3)*80).toFixed(1),defense:(0.1+sr(s+4)*1.5).toFixed(2),crit:(1+sr(s+5)*8).toFixed(2)+'%',life:Math.floor(20+sr(s+6)*80),mood:Math.floor(1+sr(s+7)*10),power:Math.floor(5+sr(s+8)*50),agility:Math.floor(10+sr(s+9)*60),finesse:Math.floor(5+sr(s+10)*30),vitality:Math.floor(20+sr(s+11)*80),wisdom:Math.floor(1+sr(s+12)*15),luck:Math.floor(20+sr(s+13)*80),potential:Math.floor(30+sr(s+14)*70),charm:Math.floor(5+sr(s+15)*25)}}
function getDrlStats(id,tier){const s=id*97+tier;return{efficiency:(0.5+sr(s+1)*tier*0.8).toFixed(2),durability:Math.floor(50+sr(s+2)*tier*20),capacity:Math.floor(10+sr(s+3)*tier*15),speed:(0.5+sr(s+4)*2).toFixed(2)}}

// ── 详情弹窗（复用原版） ────────────────────────────────────────────────
function ApostleDetail({item,onClose,onBuy,address}){
  if(!item)return null
  const e=item.elem||0,st=getApoStats(item.id,item.strength||30,e)
  const isMe=address&&item.seller?.toLowerCase()===address.toLowerCase()
  return(
    <div className="mk-modal-bg" onClick={onClose}>
      <div className="mk-modal" onClick={ev=>ev.stopPropagation()}>
        <div className="mk-modal-head" style={{background:`linear-gradient(135deg,${ELEMS[e].color}22,#1a1428)`}}>
          <div className="mk-apo-avatar" style={{border:`1px solid ${ELEMS[e].color}44`}}>
            <img src={APO_EGG_GIF} alt="apostle" className="mk-apo-img"/>
            <div className="mk-apo-badge">No.{String(item.id).padStart(5,'0')}</div>
          </div>
          <div className="mk-apo-info">
            <div className="mk-apo-name">{['精灵之子','战魂斗士','自然守护','烈焰战神','大地守卫'][e]}_{item.id}</div>
            <div className="mk-apo-addr" style={{color:isMe?'#52c462':'#7060a0'}}>{isMe?'⭐ 我的':fmtAddr(item.seller)}</div>
            <div className="mk-apo-desc">力量 <b style={{color:ELEMS[e].color}}>{item.strength||30}</b> · <ElemIcon i={e} size={14}/>{ELEMS[e].name}系</div>
          </div>
          <button className="mk-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="mk-modal-body">
          <div className="mk-modal-sec"><div className="mk-modal-sec-title">⚔️ ABILITY</div>
            <div className="mk-ability-row">{[['挖矿力',st.mining],['攻击力',st.attack],['血量',st.hp],['防御力',st.defense],['暴击',st.crit]].map(([k,v])=><div key={k} className="mk-ability-item"><div className="mk-ab-k">{k}</div><div className="mk-ab-v">{v}</div></div>)}</div></div>
          <div className="mk-modal-sec"><div className="mk-modal-sec-title">✨ 天赋</div>
            <div className="mk-talent-grid">{[['画命',st.life],['心情',st.mood],['力量',st.power],['敏捷',st.agility],['灵巧',st.finesse],['生命',st.vitality],['智力',st.wisdom],['幸运',st.luck],['潜力',st.potential],['魅力',st.charm]].map(([k,v])=><div key={k} className="mk-talent-item"><span className="mk-tal-k">{k}</span><span className="mk-tal-v">{v}</span></div>)}</div></div>
          <div className="mk-modal-buy">
            <div className="mk-modal-price"><span>{fmtR(item.currentPrice)}</span> RING</div>
            {isMe
              ?<button className="mk-buy-btn-lg" style={{background:'linear-gradient(135deg,#a02020,#600808)'}} onClick={()=>onBuy(item.id,null,item.seller)}>❌ 撤销挂单</button>
              :<button className="mk-buy-btn-lg" onClick={()=>onBuy(item.id,item.currentPrice,item.seller)}>💰 立即购买</button>
            }
          </div>
        </div>
      </div>
    </div>
  )
}
function DrillDetail({item,onClose,onBuy,address}){
  if(!item)return null
  const a=item.elem||0,t=item.tier||1,st=getDrlStats(item.id,t)
  const isMe=address&&item.seller?.toLowerCase()===address.toLowerCase()
  return(
    <div className="mk-modal-bg" onClick={onClose}>
      <div className="mk-modal" onClick={ev=>ev.stopPropagation()}>
        <div className="mk-modal-head" style={{background:`linear-gradient(135deg,${ELEMS[a].color}22,#1a1428)`}}>
          <div className="mk-apo-avatar"><img src={drillImgUrl(a,t)} alt="drill" className="mk-apo-img"/></div>
          <div className="mk-apo-info">
            <div className="mk-apo-name">{['精金钻','翠木钻','碧水钻','烈火钻','厚土钻'][a]} #{item.id}</div>
            <div className="mk-apo-addr" style={{color:isMe?'#52c462':'#7060a0'}}>{isMe?'⭐ 我的':fmtAddr(item.seller)}</div>
            <div className="mk-apo-desc"><ElemIcon i={a} size={14}/>{ELEMS[a].name}系 · {'★'.repeat(t)} 品质</div>
          </div>
          <button className="mk-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="mk-modal-body">
          <div className="mk-modal-sec"><div className="mk-modal-sec-title">⛏️ 属性</div>
            <div className="mk-ability-row">{[['效率',st.efficiency],['耐久',st.durability],['容量',st.capacity],['速度',st.speed+'x']].map(([k,v])=><div key={k} className="mk-ability-item"><div className="mk-ab-k">{k}</div><div className="mk-ab-v">{v}</div></div>)}</div></div>
          <div className="mk-modal-buy">
            <div className="mk-modal-price"><span>{fmtR(item.currentPrice)}</span> RING</div>
            {isMe
              ?<button className="mk-buy-btn-lg" style={{background:'linear-gradient(135deg,#a02020,#600808)'}} onClick={()=>onBuy(item.id,null,item.seller)}>❌ 撤销挂单</button>
              :<button className="mk-buy-btn-lg" onClick={()=>onBuy(item.id,item.currentPrice,item.seller)}>💰 立即购买</button>
            }
          </div>
        </div>
      </div>
    </div>
  )
}
function LandDetail({item,onClose,onBuy,address}){
  if(!item)return null
  const vals=decodeAttr(item.resourceAttr),maxV=Math.max(1,...vals)
  const col=(item.id-1)%100,row=Math.floor((item.id-1)/100)
  const isMe=address&&item.seller?.toLowerCase()===address.toLowerCase()
  return(
    <div className="mk-modal-bg" onClick={onClose}>
      <div className="mk-modal" onClick={ev=>ev.stopPropagation()}>
        <div className="mk-modal-head" style={{background:'linear-gradient(135deg,#0a1e0a,#1a1428)'}}>
          <div className="mk-apo-avatar"><img src={landImgUrl(item.id)} alt="land" style={{width:'100%',height:'100%',objectFit:'cover'}}/></div>
          <div className="mk-apo-info">
            <div className="mk-apo-name">土地 #{item.id}</div>
            <div className="mk-apo-addr">{fmtAddr(item.seller)}</div>
            <div className="mk-apo-desc">坐标 ({col},{row}) · BSC 大陆</div>
          </div>
          <button className="mk-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="mk-modal-body">
          <div className="mk-modal-sec"><div className="mk-modal-sec-title">🌍 资源属性</div>
            {ELEMS.map((el,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:8,marginBottom:5}}><ElemIcon i={i} size={14}/><span style={{color:el.color,width:28,fontSize:'.73rem'}}>{el.name}</span><div style={{flex:1,height:6,background:'#1a1428',borderRadius:3,overflow:'hidden'}}><div style={{width:`${(vals[i]/maxV*100).toFixed(0)}%`,height:'100%',background:el.color,borderRadius:3}}/></div><span style={{color:el.color,minWidth:28,textAlign:'right',fontSize:'.8rem',fontWeight:700}}>{vals[i]}</span></div>)}</div>
          <div className="mk-modal-buy">
            <div className="mk-modal-price"><span>{fmtR(item.currentPrice)}</span> RING</div>
            {isMe?<button className="mk-buy-btn-lg" style={{background:'linear-gradient(135deg,#a02020,#600808)'}} onClick={()=>onBuy(item.id,null,item.seller)}>❌ 撤销拍卖</button>
              :<button className="mk-buy-btn-lg" onClick={()=>onBuy(item.id,item.currentPrice,item.seller)}>💰 立即购买</button>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 卡片组件 ─────────────────────────────────────────────────────────────
function Card({item,type,onDetail,address}){
  const e=item.elem??0,t=item.tier||1
  const left=Math.max(0,item.endsAt-Math.floor(Date.now()/1000))
  const h=Math.floor(left/3600),m=Math.floor(left%3600/60)
  const imgSrc=type==='drill'?drillImgUrl(e,t):type==='apostle'?APO_EGG_GIF:landImgUrl(item.id)
  const isMe=address&&item.seller?.toLowerCase()===address.toLowerCase()
  return(
    <div className="mk-card" onClick={()=>onDetail(item)} style={isMe?{border:'1px solid #52c46244',boxShadow:'0 0 8px #52c46222'}:{}}>
      {isMe&&<div style={{position:'absolute',top:6,right:6,zIndex:2,background:'#52c46299',color:'#fff',fontSize:'.6rem',fontWeight:700,padding:'2px 6px',borderRadius:10}}>⭐ 我的</div>}
      {type==='apostle'&&<div className="mk-card-no-bar"><span className="mk-card-no">No. {String(item.id).padStart(4,'0')}</span></div>}
      <div className="mk-card-top" style={{background:type==='land'?'linear-gradient(135deg,#0a1a0a,#0a0814)':`linear-gradient(135deg,${ELEMS[e].color}22,#0a0814)`}}>
        <img src={imgSrc} alt={type} className="mk-card-img" style={type==='land'?{objectFit:'cover',width:'100%',height:'100%'}:{objectFit:'contain',filter:type==='apostle'?`hue-rotate(${e*72}deg) saturate(1.3)`:''}}/>
        {type!=='land'&&<div className="mk-card-elem-badge" style={{background:ELEMS[e].color+'cc'}}><ElemIcon i={e} size={12}/></div>}
        {type==='drill'&&<div className="mk-card-star">{'★'.repeat(t)}</div>}
        {type==='land'&&item.miningSlots>0&&<div className="mk-card-star" style={{color:'#f0c040'}}>⛏️{item.miningSlots}</div>}
      </div>
      <div className="mk-card-body">
        <div className="mk-card-id">{type==='land'?'土地':type==='apostle'?'使徒':'钻头'} #{item.id}</div>
        {type==='apostle'&&<div className="mk-card-sub" style={{color:ELEMS[e].color}}><ElemIcon i={e} size={10}/>{ELEMS[e].name} · 力量{item.strength||30}</div>}
        {type==='drill'&&<div className="mk-card-sub" style={{color:ELEMS[e].color}}><ElemIcon i={e} size={10}/>{ELEMS[e].name} · {t}星</div>}
        {type==='land'&&<div className="mk-card-sub" style={{color:'#70a070'}}>({(item.id-1)%100},{Math.floor((item.id-1)/100)})</div>}
        <div className="mk-card-price">{fmtR(item.currentPrice)} <span>RING</span></div>
        <div className="mk-card-footer"><span className="mk-card-time">{h>0?h+'h ':''}{m}m</span><span className="mk-card-seller" style={isMe?{color:'#52c462'}:{}}>{isMe?'⭐ 我的':fmtAddr(item.seller)}</span></div>
      </div>
    </div>
  )
}

// ── 主组件 ─────────────────────────────────────────────────────────────
export default function MarketPage(){
  const pc=usePublicClient(),{address}=useAccount(),{data:wc}=useWalletClient()
  const [tab,setTab]=useState('land')
  const [filterElem,setFilterElem]=useState(-1)
  const [sortDir,setSortDir]=useState('asc')
  const [lands,setLands]=useState([])
  const [apostles,setApostles]=useState([])
  const [drills,setDrills]=useState([])
  const [status,setStatus]=useState('idle') // idle | cache | loading | done
  const [detail,setDetail]=useState(null)
  const [msg,setMsg]=useState('')
  const [ringBal,setRingBal]=useState(null)
  const loadingRef=useRef(false)

  useEffect(()=>{
    if(!address||!pc)return
    pc.readContract({address:CONTRACTS.ring,abi:ERC20_ABI,functionName:'balanceOf',args:[address]}).then(b=>setRingBal(b)).catch(()=>{})
  },[address,pc,msg])

  const load = useCallback(async (force=false) => {
    if(!pc||loadingRef.current) return
    // 1. 先从 IndexedDB 读缓存立即渲染（仅非强制刷新时）
    if(!force) {
      const cached = await loadMarketCache()
      if(cached) {
        const {data} = cached
        // 只要缓存有数据就先显示
        if((data.lands?.length||0)+(data.apostles?.length||0)+(data.drills?.length||0) > 0) {
          setLands(data.lands||[]); setApostles(data.apostles||[]); setDrills(data.drills||[])
          setStatus('cache')
        }
        // fresh缓存（5分钟内）且有数据 → 直接返回
        if(cached.fresh && (data.lands?.length||0)+(data.apostles?.length||0)+(data.drills?.length||0) > 0) {
          setStatus('done'); return
        }
      }
    }
    // 2. 从链上事件索引拿活跃拍卖ID（速度快，仅1次getLogs）
    loadingRef.current = true
    setStatus('loading')
    try {
      window._publicClient = pc  // 供 fallback 使用
      setMsg('正在从索引服务加载...')
      const { apoIds, drlIds, landIds, oldLandIds } = await fetchActiveListings()
      setMsg(`发现 ${apoIds.length} 使徒 / ${drlIds.length} 钻头 / ${landIds.length+oldLandIds.length} 土地，读取详情...`)
      // 3. 并行 multicall 读属性和价格
      const [apos, drls, lnds] = await Promise.all([
        enrichApostles(pc, apoIds),
        enrichDrills(pc, drlIds),
        enrichLands(pc, landIds, oldLandIds),
      ])
      setApostles(apos); setDrills(drls); setLands(lnds)
      setMsg('')
      setStatus('done')
      await saveMarketCache({lands:lnds,apostles:apos,drills:drls})
    } catch(e) {
      console.error(e)
      setMsg('加载失败: '+e.message?.slice(0,60))
      setStatus('done')
    } finally {
      loadingRef.current = false
    }
  }, [pc])

  useEffect(() => { load() }, [load])

  async function handleBuy(id, price, seller, type) {
    if(!wc||!address){alert('请先连接钱包');return}
    const isMe = address&&seller?.toLowerCase()===address.toLowerCase()
    const nftContract = type==='apostle'?CONTRACTS.apostle:type==='drill'?CONTRACTS.drill:CONTRACTS.land
    // 判断是新合约还是旧合约（土地有两个合约）
    const isOldLand = type==='land' && lands.find(l=>l.id===id&&l._isOld)
    const useOldContract = isOldLand
    if(isMe&&!price){
      setMsg('撤销中...')
      try{
        let h
        if(useOldContract){
          h=await wc.sendTransaction({to:CONTRACTS.auction,data:encodeFunctionData({abi:AUC_ABI,functionName:'cancelAuction',args:[BigInt(id)]})})
        } else {
          h=await wc.sendTransaction({to:NFT_AUCTION_ADDR,data:encodeFunctionData({abi:NFT_AUC_ABI,functionName:'cancelAuction',args:[nftContract,BigInt(id)]})})
        }
        await pc.waitForTransactionReceipt({hash:h})
        setMsg('✅ 已撤销');setDetail(null);setTimeout(()=>{setMsg('');load(true)},1500)
      }catch(e){setMsg('❌ '+(e.shortMessage||e.message))}
      return
    }
    setMsg('授权 RING...')
    try{
      const aucAddr = useOldContract ? CONTRACTS.auction : NFT_AUCTION_ADDR
      const h1=await wc.sendTransaction({to:CONTRACTS.ring,data:encodeFunctionData({abi:ERC20_ABI,functionName:'approve',args:[aucAddr,price]})})
      await pc.waitForTransactionReceipt({hash:h1})
      setMsg('购买中...')
      let h2
      if(useOldContract){
        h2=await wc.sendTransaction({to:CONTRACTS.auction,data:encodeFunctionData({abi:AUC_ABI,functionName:'bid',args:[BigInt(id),price]})})
      } else {
        h2=await wc.sendTransaction({to:NFT_AUCTION_ADDR,data:encodeFunctionData({abi:NFT_AUC_ABI,functionName:'bid',args:[nftContract,BigInt(id),price]})})
      }
      await pc.waitForTransactionReceipt({hash:h2})
      setMsg('🎉 购买成功！');setDetail(null)
      setTimeout(()=>{setMsg('');load(true)},1500)
    }catch(e){setMsg('❌ '+(e.shortMessage||e.message))}
  }

  let cur = tab==='land'?lands:tab==='apostle'?apostles:drills
  if(filterElem>=0) cur=cur.filter(i=>i.elem===filterElem)
  cur=[...cur].sort((a,b)=>sortDir==='asc'?Number(a.currentPrice-b.currentPrice):Number(b.currentPrice-a.currentPrice))
  const isLoading = status==='loading'&&cur.length===0

  return(
    <div className="mk-root">
      <div className="mk-header">
        <div><h1 className="mk-title">🏛 交易市场</h1><span className="mk-subtitle">荷兰式拍卖 · 价格随时间递减</span></div>
        <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4}}>
          {ringBal!=null&&<span style={{fontSize:'.72rem',color:'#f0c040'}}>💰 {Number(formatEther(ringBal)).toFixed(2)} RING</span>}
          {status==='cache'&&<span style={{fontSize:'.65rem',color:'#5040a0'}}>⚡ 缓存中，后台更新...</span>}
          {status==='loading'&&cur.length>0&&<span style={{fontSize:'.65rem',color:'#5040a0'}}>🔄 索引更新中...</span>}
          <button className="mk-refresh" onClick={()=>load(true)} disabled={status==='loading'}>
            {status==='loading'?<><span className="mk-spin"/>加载中</>:'🔄 刷新'}
          </button>
        </div>
      </div>
      <div className="mk-tabs">
        {[['land','🏡 土地',lands.length],['apostle','🧙 使徒',apostles.length],['drill','⛏️ 钻头',drills.length]].map(([v,l,n])=>(
          <button key={v} className={`mk-tab${tab===v?' on':''}`} onClick={()=>{setTab(v);setFilterElem(-1)}}>{l}<span className="mk-count">{n}</span></button>
        ))}
        <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:6}}>
          <button className={`mk-sort-btn${sortDir==='asc'?' on':''}`} onClick={()=>setSortDir('asc')}>↑ 低价</button>
          <button className={`mk-sort-btn${sortDir==='desc'?' on':''}`} onClick={()=>setSortDir('desc')}>↓ 高价</button>
        </div>
      </div>
      {(tab==='apostle'||tab==='drill')&&(
        <div className="mk-filter-bar">
          <span style={{fontSize:'.72rem',color:'#5040a0',marginRight:4}}>元素：</span>
          <button className={`mk-filter-btn${filterElem===-1?' on':''}`} onClick={()=>setFilterElem(-1)}>全部</button>
          {ELEMS.map((el,i)=>(
            <button key={i} className={`mk-filter-btn${filterElem===i?' on':''}`} onClick={()=>setFilterElem(i)}
              style={filterElem===i?{borderColor:el.color,color:el.color,background:el.color+'22'}:{}}>
              <ElemIcon i={i} size={11}/>{el.name}
            </button>
          ))}
        </div>
      )}
      {msg&&<div className="mk-msg">{msg}</div>}
      {isLoading
        ?<div className="mk-loading"><span className="mk-spin"/>从链上事件索引扫描...</div>
        :cur.length===0&&status==='done'
          ?<div className="mk-empty"><div style={{fontSize:'3rem',opacity:.3}}>{tab==='land'?'🏡':tab==='apostle'?'🧙':'⛏️'}</div><div>暂无在售商品</div></div>
          :<div className="mk-grid">{cur.map(item=><Card key={item.id} item={item} type={tab} onDetail={setDetail} address={address}/>)}</div>
      }
      <div className="mk-footer">
        共<b>{cur.length}</b>件 · 土地<b>{lands.length}</b> · 使徒<b>{apostles.length}</b> · 钻头<b>{drills.length}</b>
        {status==='loading'&&cur.length>0&&<span style={{color:'#5040a0',marginLeft:8}}><span className="mk-spin" style={{width:10,height:10}}/> 更新中</span>}
      </div>
      {detail&&tab==='land'&&<LandDetail item={detail} onClose={()=>setDetail(null)} onBuy={(id,p,s)=>handleBuy(id,p,s,'land')} address={address}/>}
      {detail&&tab==='apostle'&&<ApostleDetail item={detail} onClose={()=>setDetail(null)} onBuy={(id,p,s)=>handleBuy(id,p,s,'apostle')} address={address}/>}
      {detail&&tab==='drill'&&<DrillDetail item={detail} onClose={()=>setDetail(null)} onBuy={(id,p,s)=>handleBuy(id,p,s,'drill')} address={address}/>}
    </div>
  )
}
