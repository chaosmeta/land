import { useState, useEffect, useCallback, useRef } from 'react'
import { usePublicClient, useAccount, useWalletClient } from '../contexts/WalletContext.jsx'
import { useLang } from '../contexts/LangContext.jsx'
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

// ── IndexedDB 缓存 ────────────────────────────────────────────
const DB_NAME='evomarket',DB_VER=4,STORE='market'
async function openDB(){return new Promise((res,rej)=>{const req=indexedDB.open(DB_NAME,DB_VER);req.onupgradeneeded=e=>{const db=e.target.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE)};req.onsuccess=e=>res(e.target.result);req.onerror=e=>rej(e.target.error)})}
async function dbGet(key){try{const db=await openDB();return new Promise((res,rej)=>{const r=db.transaction(STORE,'readonly').objectStore(STORE).get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}catch{return null}}
async function dbSet(key,val){try{const db=await openDB();return new Promise((res,rej)=>{const r=db.transaction(STORE,'readwrite').objectStore(STORE).put(val,key);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}catch{}}
const CACHE_TTL=5*60*1000,STALE_TTL=30*60*1000
function bigintReplacer(_,v){return typeof v==='bigint'?v.toString()+'n':v}
function bigintReviver(_,v){return typeof v==='string'&&v.endsWith('n')&&/^\d+n$/.test(v)?BigInt(v.slice(0,-1)):v}
function serialize(data){return JSON.stringify(data,bigintReplacer)}
function deserialize(str){return JSON.parse(str,bigintReviver)}
async function saveMarketCache(data){await dbSet('market_data',serialize({ts:Date.now(),data}))}
async function loadMarketCache(){try{const raw=await dbGet('market_data');if(!raw)return null;const{ts,data}=deserialize(raw);return{data,age:Date.now()-ts,fresh:Date.now()-ts<CACHE_TTL}}catch{return null}}

const API_BASE=import.meta.env.VITE_API_BASE||'/api'
async function fetchActiveListings(){
  try{const res=await fetch(`${API_BASE}/listings`);if(!res.ok)throw new Error(`API ${res.status}`);const data=await res.json();if(data.ok)return{apoIds:data.apostleIds||[],drlIds:data.drillIds||[],landIds:data.landIds||[],oldLandIds:data.oldLandIds||[]};throw new Error(data.error||'API error')}
  catch(apiErr){console.warn('API fallback:',apiErr.message);return await fetchActiveListingsFallback(window._publicClient)}
}
async function fetchActiveListingsFallback(pc){
  if(!pc)return{apoIds:[],drlIds:[],landIds:[],oldLandIds:[]}
  const latest=await pc.getBlockNumber().catch(()=>0n);if(!latest)return{apoIds:[],drlIds:[],landIds:[],oldLandIds:[]}
  const FROM=latest>44000n?latest-44000n:0n
  const[created,won,cancelled,oldCreated,oldWon,oldCxd]=await Promise.all([
    pc.getLogs({address:NFT_AUCTION_ADDR,event:NFT_AUC_ABI[4],fromBlock:FROM,toBlock:'latest'}).catch(()=>[]),
    pc.getLogs({address:NFT_AUCTION_ADDR,event:NFT_AUC_ABI[5],fromBlock:FROM,toBlock:'latest'}).catch(()=>[]),
    pc.getLogs({address:NFT_AUCTION_ADDR,event:NFT_AUC_ABI[6],fromBlock:FROM,toBlock:'latest'}).catch(()=>[]),
    pc.getLogs({address:CONTRACTS.auction,event:OLD_AUC_EVENTS[0],fromBlock:FROM,toBlock:'latest'}).catch(()=>[]),
    pc.getLogs({address:CONTRACTS.auction,event:OLD_AUC_EVENTS[1],fromBlock:FROM,toBlock:'latest'}).catch(()=>[]),
    pc.getLogs({address:CONTRACTS.auction,event:OLD_AUC_EVENTS[2],fromBlock:FROM,toBlock:'latest'}).catch(()=>[]),
  ])
  const sold=new Set(won.map(e=>e.args.nft?.toLowerCase()+'_'+e.args.id?.toString()))
  const cxd=new Set(cancelled.map(e=>e.args.nft?.toLowerCase()+'_'+e.args.id?.toString()))
  const active=created.filter(e=>{const k=e.args.nft?.toLowerCase()+'_'+e.args.id?.toString();return !sold.has(k)&&!cxd.has(k)})
  const oldSold=new Set(oldWon.map(e=>e.args.id?.toString()))
  const oldCxd2=new Set(oldCxd.map(e=>e.args.id?.toString()))
  const oldActive=oldCreated.filter(e=>!oldSold.has(e.args.id?.toString())&&!oldCxd2.has(e.args.id?.toString()))
  return{apoIds:active.filter(e=>e.args.nft?.toLowerCase()===CONTRACTS.apostle.toLowerCase()).map(e=>Number(e.args.id)),drlIds:active.filter(e=>e.args.nft?.toLowerCase()===CONTRACTS.drill.toLowerCase()).map(e=>Number(e.args.id)),landIds:active.filter(e=>e.args.nft?.toLowerCase()===CONTRACTS.land.toLowerCase()).map(e=>Number(e.args.id)),oldLandIds:oldActive.map(e=>Number(e.args.id))}
}

async function enrichApostles(pc,ids){if(!ids.length)return[];const BATCH=100,result=[];for(let i=0;i<ids.length;i+=BATCH){const batch=ids.slice(i,i+BATCH);const[aucR,prR,atR]=await Promise.all([pc.multicall({contracts:batch.map(id=>({address:NFT_AUCTION_ADDR,abi:NFT_AUC_ABI,functionName:'getAuction',args:[CONTRACTS.apostle,BigInt(id)]})),allowFailure:true}),pc.multicall({contracts:batch.map(id=>({address:NFT_AUCTION_ADDR,abi:NFT_AUC_ABI,functionName:'currentPrice',args:[CONTRACTS.apostle,BigInt(id)]})),allowFailure:true}),pc.multicall({contracts:batch.map(id=>({address:CONTRACTS.apostle,abi:APO_ABI,functionName:'attrs',args:[BigInt(id)]})),allowFailure:true})]);batch.forEach((id,j)=>{const a=aucR[j]?.result;if(!a||!a.startedAt||a.startedAt===0n)return;const at=atR[j]?.result,cp=prR[j]?.result??0n;result.push({id,seller:a.seller,startPrice:a.startPrice,endPrice:a.endPrice,duration:a.duration,startedAt:a.startedAt,currentPrice:cp,endsAt:Number(a.startedAt)+Number(a.duration),strength:at?Number(at[0]):30,elem:at?Number(at[1]):0})})}return result}
async function enrichDrills(pc,ids){if(!ids.length)return[];const BATCH=100,result=[];for(let i=0;i<ids.length;i+=BATCH){const batch=ids.slice(i,i+BATCH);const[aucR,prR,atR]=await Promise.all([pc.multicall({contracts:batch.map(id=>({address:NFT_AUCTION_ADDR,abi:NFT_AUC_ABI,functionName:'getAuction',args:[CONTRACTS.drill,BigInt(id)]})),allowFailure:true}),pc.multicall({contracts:batch.map(id=>({address:NFT_AUCTION_ADDR,abi:NFT_AUC_ABI,functionName:'currentPrice',args:[CONTRACTS.drill,BigInt(id)]})),allowFailure:true}),pc.multicall({contracts:batch.map(id=>({address:CONTRACTS.drill,abi:DRL_ABI,functionName:'attrs',args:[BigInt(id)]})),allowFailure:true})]);batch.forEach((id,j)=>{const a=aucR[j]?.result;if(!a||!a.startedAt||a.startedAt===0n)return;const at=atR[j]?.result,cp=prR[j]?.result??0n;result.push({id,seller:a.seller,startPrice:a.startPrice,endPrice:a.endPrice,duration:a.duration,startedAt:a.startedAt,currentPrice:cp,endsAt:Number(a.startedAt)+Number(a.duration),tier:at?Number(at[0]):1,elem:at?Number(at[1]):0})})}return result}
async function enrichLands(pc,ids,oldIds){if(!ids.length&&!oldIds.length)return[];const allIds=[...new Set([...ids,...oldIds])],BATCH=100,result=[];for(let i=0;i<allIds.length;i+=BATCH){const batch=allIds.slice(i,i+BATCH);const isNew=id=>ids.includes(id);const[aucR,prR,raR,slR]=await Promise.all([pc.multicall({contracts:batch.map(id=>isNew(id)?{address:NFT_AUCTION_ADDR,abi:NFT_AUC_ABI,functionName:'getAuction',args:[CONTRACTS.land,BigInt(id)]}:{address:CONTRACTS.auction,abi:AUC_ABI,functionName:'auctions',args:[BigInt(id)]}),allowFailure:true}),pc.multicall({contracts:batch.map(id=>isNew(id)?{address:NFT_AUCTION_ADDR,abi:NFT_AUC_ABI,functionName:'currentPrice',args:[CONTRACTS.land,BigInt(id)]}:{address:CONTRACTS.auction,abi:AUC_ABI,functionName:'currentPrice',args:[BigInt(id)]}),allowFailure:true}),pc.multicall({contracts:batch.map(id=>({address:CONTRACTS.land,abi:LAND_ABI,functionName:'resourceAttr',args:[BigInt(id)]})),allowFailure:true}),pc.multicall({contracts:batch.map(id=>({address:CONTRACTS.land,abi:LAND_ABI,functionName:'slotCount',args:[BigInt(id)]})),allowFailure:true})]);batch.forEach((id,j)=>{const raw=aucR[j]?.result;if(!raw)return;const a=isNew(id)?raw:{seller:raw[0],startPrice:raw[1],endPrice:raw[2],duration:raw[3],startedAt:raw[4]};if(!a.startedAt||a.startedAt===0n)return;const cp=prR[j]?.result??0n;result.push({id,seller:a.seller,startPrice:a.startPrice,endPrice:a.endPrice,duration:a.duration,startedAt:a.startedAt,currentPrice:cp,endsAt:Number(a.startedAt)+Number(a.duration),resourceAttr:raR[j]?.result??0n,miningSlots:Number(slR[j]?.result??0n),_isOld:!isNew(id)})})}return result}

function fmtR(w,dp=3){return w?Number(formatEther(w)).toFixed(dp):'0'}
function fmtAddr(a){return a?a.slice(0,8)+'…'+a.slice(-6):''}
function sr(seed){let s=(seed^0xdeadbeef)>>>0;s=Math.imul(s^(s>>>16),0x45d9f3b)>>>0;s=Math.imul(s^(s>>>16),0x45d9f3b)>>>0;return((s^(s>>>16))>>>0)/0xffffffff}
function decodeAttr(a){if(!a)return[0,0,0,0,0];const b=BigInt(a);return[Number(b&0xffffn),Number((b>>16n)&0xffffn),Number((b>>32n)&0xffffn),Number((b>>48n)&0xffffn),Number((b>>64n)&0xffffn)]}
function ElemIcon({i,size=16}){return <img src={ELEM_SVGS[i]} alt={ELEMS[i].name} style={{width:size,height:size,verticalAlign:'middle',marginRight:3}}/>}
function getApoStats(id,str){const s=id*137+str;return{mining:(0.5+sr(s+1)*3).toFixed(2),attack:(1+sr(s+2)*4).toFixed(2),hp:(20+sr(s+3)*80).toFixed(1),defense:(0.1+sr(s+4)*1.5).toFixed(2),crit:(1+sr(s+5)*8).toFixed(2)+'%',life:Math.floor(20+sr(s+6)*80),mood:Math.floor(1+sr(s+7)*10),power:Math.floor(5+sr(s+8)*50),agility:Math.floor(10+sr(s+9)*60),finesse:Math.floor(5+sr(s+10)*30),vitality:Math.floor(20+sr(s+11)*80),wisdom:Math.floor(1+sr(s+12)*15),luck:Math.floor(20+sr(s+13)*80),potential:Math.floor(30+sr(s+14)*70),charm:Math.floor(5+sr(s+15)*25)}}
function getDrlStats(id,tier){const s=id*97+tier;return{efficiency:(0.5+sr(s+1)*tier*0.8).toFixed(2),durability:Math.floor(50+sr(s+2)*tier*20),capacity:Math.floor(10+sr(s+3)*tier*15),speed:(0.5+sr(s+4)*2).toFixed(2)}}

function ApostleDetail({item,onClose,onBuy,address,t,lang}){
  if(!item)return null
  const e=item.elem||0,st=getApoStats(item.id,item.strength||30)
  const isMe=address&&item.seller?.toLowerCase()===address.toLowerCase()
  const APO_NAMES_ZH=['精灵之子','战魂斗士','自然守护','烈焰战神','大地守卫']
  const APO_NAMES_EN=['Elf Child','Soul Warrior','Nature Guard','Flame God','Earth Guard']
  const apoName=lang==='zh'?APO_NAMES_ZH[e]:APO_NAMES_EN[e]
  const TALENT_KEYS=[
    [t('画命','Life'),st.life],[t('心情','Mood'),st.mood],[t('力量','Power'),st.power],
    [t('敏捷','Agility'),st.agility],[t('灵巧','Finesse'),st.finesse],[t('生命','Vitality'),st.vitality],
    [t('智力','Wisdom'),st.wisdom],[t('幸运','Luck'),st.luck],[t('潜力','Potential'),st.potential],[t('魅力','Charm'),st.charm]
  ]
  return(
    <div className="mk-modal-bg" onClick={onClose}>
      <div className="mk-modal" onClick={ev=>ev.stopPropagation()}>
        <div className="mk-modal-head" style={{background:`linear-gradient(135deg,${ELEMS[e].color}22,#1a1428)`}}>
          <div className="mk-apo-avatar" style={{border:`1px solid ${ELEMS[e].color}44`}}>
            <img src={APO_EGG_GIF} alt="apostle" className="mk-apo-img"/>
            <div className="mk-apo-badge">No.{String(item.id).padStart(5,'0')}</div>
          </div>
          <div className="mk-apo-info">
            <div className="mk-apo-name">{apoName}_{item.id}</div>
            <div className="mk-apo-addr" style={{color:isMe?'#52c462':'#7060a0'}}>{isMe?`⭐ ${t('我的','Mine')}`:fmtAddr(item.seller)}</div>
            <div className="mk-apo-desc">{t('力量','STR')} <b style={{color:ELEMS[e].color}}>{item.strength||30}</b> · <ElemIcon i={e} size={14}/>{lang==='zh'?ELEMS[e].name:ELEMS[e].nameEn}{t('系','')}</div>
          </div>
          <button className="mk-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="mk-modal-body">
          <div className="mk-modal-sec"><div className="mk-modal-sec-title">⚔️ {t('能力','Ability')}</div>
            <div className="mk-ability-row">{[[t('挖矿力','Mining'),st.mining],[t('攻击力','Attack'),st.attack],[t('血量','HP'),st.hp],[t('防御力','Defense'),st.defense],[t('暴击','Crit'),st.crit]].map(([k,v])=><div key={k} className="mk-ability-item"><div className="mk-ab-k">{k}</div><div className="mk-ab-v">{v}</div></div>)}</div></div>
          <div className="mk-modal-sec"><div className="mk-modal-sec-title">✨ {t('天赋','Talents')}</div>
            <div className="mk-talent-grid">{TALENT_KEYS.map(([k,v])=><div key={k} className="mk-talent-item"><span className="mk-tal-k">{k}</span><span className="mk-tal-v">{v}</span></div>)}</div></div>
          <div className="mk-modal-buy">
            <div className="mk-modal-price"><span>{fmtR(item.currentPrice)}</span> RING</div>
            {isMe
              ?<button className="mk-buy-btn-lg" style={{background:'linear-gradient(135deg,#a02020,#600808)'}} onClick={()=>onBuy(item.id,null,item.seller)}>❌ {t('撤销挂单','Cancel Listing')}</button>
              :<button className="mk-buy-btn-lg" onClick={()=>onBuy(item.id,item.currentPrice,item.seller)}>💰 {t('立即购买','Buy Now')}</button>
            }
          </div>
        </div>
      </div>
    </div>
  )
}

function DrillDetail({item,onClose,onBuy,address,t,lang}){
  if(!item)return null
  const a=item.elem||0,ti=item.tier||1,st=getDrlStats(item.id,ti)
  const isMe=address&&item.seller?.toLowerCase()===address.toLowerCase()
  const DRL_NAMES_ZH=['精金钻','翠木钻','碧水钻','烈火钻','厚土钻']
  const DRL_NAMES_EN=['Gold Drill','Wood Drill','Water Drill','Fire Drill','Soil Drill']
  return(
    <div className="mk-modal-bg" onClick={onClose}>
      <div className="mk-modal" onClick={ev=>ev.stopPropagation()}>
        <div className="mk-modal-head" style={{background:`linear-gradient(135deg,${ELEMS[a].color}22,#1a1428)`}}>
          <div className="mk-apo-avatar"><img src={drillImgUrl(a,ti)} alt="drill" className="mk-apo-img"/></div>
          <div className="mk-apo-info">
            <div className="mk-apo-name">{lang==='zh'?DRL_NAMES_ZH[a]:DRL_NAMES_EN[a]} #{item.id}</div>
            <div className="mk-apo-addr" style={{color:isMe?'#52c462':'#7060a0'}}>{isMe?`⭐ ${t('我的','Mine')}`:fmtAddr(item.seller)}</div>
            <div className="mk-apo-desc"><ElemIcon i={a} size={14}/>{lang==='zh'?ELEMS[a].name:ELEMS[a].nameEn} · {'★'.repeat(ti)} {t('品质','Quality')}</div>
          </div>
          <button className="mk-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="mk-modal-body">
          <div className="mk-modal-sec"><div className="mk-modal-sec-title">⛏️ {t('属性','Attributes')}</div>
            <div className="mk-ability-row">{[[t('效率','Efficiency'),st.efficiency],[t('耐久','Durability'),st.durability],[t('容量','Capacity'),st.capacity],[t('速度','Speed'),st.speed+'x']].map(([k,v])=><div key={k} className="mk-ability-item"><div className="mk-ab-k">{k}</div><div className="mk-ab-v">{v}</div></div>)}</div></div>
          <div className="mk-modal-buy">
            <div className="mk-modal-price"><span>{fmtR(item.currentPrice)}</span> RING</div>
            {isMe
              ?<button className="mk-buy-btn-lg" style={{background:'linear-gradient(135deg,#a02020,#600808)'}} onClick={()=>onBuy(item.id,null,item.seller)}>❌ {t('撤销挂单','Cancel Listing')}</button>
              :<button className="mk-buy-btn-lg" onClick={()=>onBuy(item.id,item.currentPrice,item.seller)}>💰 {t('立即购买','Buy Now')}</button>
            }
          </div>
        </div>
      </div>
    </div>
  )
}

function LandDetail({item,onClose,onBuy,address,t,lang}){
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
            <div className="mk-apo-name">{t('土地','Land')} #{item.id}</div>
            <div className="mk-apo-addr">{fmtAddr(item.seller)}</div>
            <div className="mk-apo-desc">{t('坐标','Coord')} ({col},{row}) · {t('哥伦布大陆','Columbus')}</div>
          </div>
          <button className="mk-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="mk-modal-body">
          <div className="mk-modal-sec"><div className="mk-modal-sec-title">🌍 {t('资源属性','Resources')}</div>
            {ELEMS.map((el,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:8,marginBottom:5}}><ElemIcon i={i} size={14}/><span style={{color:el.color,width:28,fontSize:'.73rem'}}>{lang==='zh'?el.name:el.nameEn}</span><div style={{flex:1,height:6,background:'#1a1428',borderRadius:3,overflow:'hidden'}}><div style={{width:`${(vals[i]/maxV*100).toFixed(0)}%`,height:'100%',background:el.color,borderRadius:3}}/></div><span style={{color:el.color,minWidth:28,textAlign:'right',fontSize:'.8rem',fontWeight:700}}>{vals[i]}</span></div>)}</div>
          <div className="mk-modal-buy">
            <div className="mk-modal-price"><span>{fmtR(item.currentPrice)}</span> RING</div>
            {isMe?<button className="mk-buy-btn-lg" style={{background:'linear-gradient(135deg,#a02020,#600808)'}} onClick={()=>onBuy(item.id,null,item.seller)}>❌ {t('撤销拍卖','Cancel Auction')}</button>
              :<button className="mk-buy-btn-lg" onClick={()=>onBuy(item.id,item.currentPrice,item.seller)}>💰 {t('立即购买','Buy Now')}</button>}
          </div>
        </div>
      </div>
    </div>
  )
}

function Card({item,type,onDetail,address,t,lang}){
  const e=item.elem??0,ti=item.tier||1
  const left=Math.max(0,item.endsAt-Math.floor(Date.now()/1000))
  const h=Math.floor(left/3600),m=Math.floor(left%3600/60)
  const imgSrc=type==='drill'?drillImgUrl(e,ti):type==='apostle'?APO_EGG_GIF:landImgUrl(item.id)
  const isMe=address&&item.seller?.toLowerCase()===address.toLowerCase()
  const typeLbl=type==='land'?t('土地','Land'):type==='apostle'?t('使徒','Apostle'):t('钻头','Drill')
  return(
    <div className="mk-card" onClick={()=>onDetail(item)} style={isMe?{border:'1px solid #52c46244',boxShadow:'0 0 8px #52c46222'}:{}}>
      {isMe&&<div style={{position:'absolute',top:6,right:6,zIndex:2,background:'#52c46299',color:'#fff',fontSize:'.6rem',fontWeight:700,padding:'2px 6px',borderRadius:10}}>⭐ {t('我的','Mine')}</div>}
      {type==='apostle'&&<div className="mk-card-no-bar"><span className="mk-card-no">No. {String(item.id).padStart(4,'0')}</span></div>}
      <div className="mk-card-top" style={{background:type==='land'?'linear-gradient(135deg,#0a1a0a,#0a0814)':`linear-gradient(135deg,${ELEMS[e].color}22,#0a0814)`}}>
        <img src={imgSrc} alt={type} className="mk-card-img" style={type==='land'?{objectFit:'cover',width:'100%',height:'100%'}:{objectFit:'contain',filter:type==='apostle'?`hue-rotate(${e*72}deg) saturate(1.3)`:''}}/>
        {type!=='land'&&<div className="mk-card-elem-badge" style={{background:ELEMS[e].color+'cc'}}><ElemIcon i={e} size={12}/></div>}
        {type==='drill'&&<div className="mk-card-star">{'★'.repeat(ti)}</div>}
        {type==='land'&&item.miningSlots>0&&<div className="mk-card-star" style={{color:'#f0c040'}}>⛏️{item.miningSlots}</div>}
      </div>
      <div className="mk-card-body">
        <div className="mk-card-id">{typeLbl} #{item.id}</div>
        {type==='apostle'&&<div className="mk-card-sub" style={{color:ELEMS[e].color}}><ElemIcon i={e} size={10}/>{lang==='zh'?ELEMS[e].name:ELEMS[e].nameEn} · {t('力量','STR')}{item.strength||30}</div>}
        {type==='drill'&&<div className="mk-card-sub" style={{color:ELEMS[e].color}}><ElemIcon i={e} size={10}/>{lang==='zh'?ELEMS[e].name:ELEMS[e].nameEn} · {ti}{t('星','★')}</div>}
        {type==='land'&&<div className="mk-card-sub" style={{color:'#70a070'}}>({(item.id-1)%100},{Math.floor((item.id-1)/100)})</div>}
        <div className="mk-card-price">{fmtR(item.currentPrice)} <span>RING</span></div>
        <div className="mk-card-footer"><span className="mk-card-time">{h>0?h+'h ':''}{m}m</span><span className="mk-card-seller" style={isMe?{color:'#52c462'}:{}}>{isMe?`⭐ ${t('我的','Mine')}`:fmtAddr(item.seller)}</span></div>
      </div>
    </div>
  )
}

export default function MarketPage(){
  const pc=usePublicClient(),{address}=useAccount(),{data:wc}=useWalletClient()
  const {t,lang}=useLang()
  const [tab,setTab]=useState('land')
  const [filterElem,setFilterElem]=useState(-1)
  const [sortDir,setSortDir]=useState('asc')
  const [lands,setLands]=useState([])
  const [apostles,setApostles]=useState([])
  const [drills,setDrills]=useState([])
  const [status,setStatus]=useState('idle')
  const [detail,setDetail]=useState(null)
  const [msg,setMsg]=useState('')
  const [ringBal,setRingBal]=useState(null)
  const loadingRef=useRef(false)

  useEffect(()=>{
    if(!address||!pc)return
    pc.readContract({address:CONTRACTS.ring,abi:ERC20_ABI,functionName:'balanceOf',args:[address]}).then(b=>setRingBal(b)).catch(()=>{})
  },[address,pc,msg])

  const load=useCallback(async(force=false)=>{
    if(!pc||loadingRef.current)return
    if(!force){
      const cached=await loadMarketCache()
      if(cached){
        const{data}=cached
        if((data.lands?.length||0)+(data.apostles?.length||0)+(data.drills?.length||0)>0){setLands(data.lands||[]);setApostles(data.apostles||[]);setDrills(data.drills||[]);setStatus('cache')}
        if(cached.fresh&&(data.lands?.length||0)+(data.apostles?.length||0)+(data.drills?.length||0)>0){setStatus('done');return}
      }
    }
    loadingRef.current=true;setStatus('loading')
    try{
      window._publicClient=pc
      setMsg(t('正在从索引服务加载...','Loading from index service...'))
      const{apoIds,drlIds,landIds,oldLandIds}=await fetchActiveListings()
      setMsg(t(`发现 ${apoIds.length} 使徒 / ${drlIds.length} 钻头 / ${landIds.length+oldLandIds.length} 土地，读取详情...`,
               `Found ${apoIds.length} apostles / ${drlIds.length} drills / ${landIds.length+oldLandIds.length} lands...`))
      const[apos,drls,lnds]=await Promise.all([enrichApostles(pc,apoIds),enrichDrills(pc,drlIds),enrichLands(pc,landIds,oldLandIds)])
      setApostles(apos);setDrills(drls);setLands(lnds);setMsg('');setStatus('done')
      await saveMarketCache({lands:lnds,apostles:apos,drills:drls})
    }catch(e){
      console.error(e);setMsg(t('加载失败: ','Load failed: ')+e.message?.slice(0,60));setStatus('done')
    }finally{loadingRef.current=false}
  },[pc,t])
  useEffect(()=>{load()},[load])

  async function handleBuy(id,price,seller,type){
    if(!wc||!address){alert(t('请先连接钱包','Please connect wallet'));return}
    const isMe=address&&seller?.toLowerCase()===address.toLowerCase()
    const nftContract=type==='apostle'?CONTRACTS.apostle:type==='drill'?CONTRACTS.drill:CONTRACTS.land
    const isOldLand=type==='land'&&lands.find(l=>l.id===id&&l._isOld)
    if(isMe&&!price){
      setMsg(t('撤销中...','Cancelling...'))
      try{
        let h
        if(isOldLand)h=await wc.sendTransaction({to:CONTRACTS.auction,data:encodeFunctionData({abi:AUC_ABI,functionName:'cancelAuction',args:[BigInt(id)]})})
        else h=await wc.sendTransaction({to:NFT_AUCTION_ADDR,data:encodeFunctionData({abi:NFT_AUC_ABI,functionName:'cancelAuction',args:[nftContract,BigInt(id)]})})
        await pc.waitForTransactionReceipt({hash:h})
        setMsg(t('✅ 已撤销','✅ Cancelled'));setDetail(null);setTimeout(()=>{setMsg('');load(true)},1500)
      }catch(e){setMsg('❌ '+(e.shortMessage||e.message))}
      return
    }
    setMsg(t('授权 RING...','Approving RING...'))
    try{
      const aucAddr=isOldLand?CONTRACTS.auction:NFT_AUCTION_ADDR
      const h1=await wc.sendTransaction({to:CONTRACTS.ring,data:encodeFunctionData({abi:ERC20_ABI,functionName:'approve',args:[aucAddr,price]})})
      await pc.waitForTransactionReceipt({hash:h1})
      setMsg(t('购买中...','Buying...'))
      let h2
      if(isOldLand)h2=await wc.sendTransaction({to:CONTRACTS.auction,data:encodeFunctionData({abi:AUC_ABI,functionName:'bid',args:[BigInt(id),price]})})
      else h2=await wc.sendTransaction({to:NFT_AUCTION_ADDR,data:encodeFunctionData({abi:NFT_AUC_ABI,functionName:'bid',args:[nftContract,BigInt(id),price]})})
      await pc.waitForTransactionReceipt({hash:h2})
      setMsg(t('🎉 购买成功！','🎉 Purchase success!'));setDetail(null)
      setTimeout(()=>{setMsg('');load(true)},1500)
    }catch(e){setMsg('❌ '+(e.shortMessage||e.message))}
  }

  let cur=tab==='land'?lands:tab==='apostle'?apostles:drills
  if(filterElem>=0)cur=cur.filter(i=>i.elem===filterElem)
  cur=[...cur].sort((a,b)=>sortDir==='asc'?Number(a.currentPrice-b.currentPrice):Number(b.currentPrice-a.currentPrice))
  const isLoading=status==='loading'&&cur.length===0

  return(
    <div className="mk-root">
      <div className="mk-header">
        <div><h1 className="mk-title">🏛 {t('交易市场','Market')}</h1><span className="mk-subtitle">{t('荷兰式拍卖 · 价格随时间递减','Dutch Auction · Price decreases over time')}</span></div>
        <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4}}>
          {ringBal!=null&&<span style={{fontSize:'.72rem',color:'#f0c040'}}>💰 {Number(formatEther(ringBal)).toFixed(2)} RING</span>}
          {status==='cache'&&<span style={{fontSize:'.65rem',color:'#5040a0'}}>⚡ {t('缓存中，后台更新...','Cached, updating...')}</span>}
          {status==='loading'&&cur.length>0&&<span style={{fontSize:'.65rem',color:'#5040a0'}}>🔄 {t('索引更新中...','Updating...')}</span>}
          <button className="mk-refresh" onClick={()=>load(true)} disabled={status==='loading'}>
            {status==='loading'?<><span className="mk-spin"/>{t('加载中','Loading')}</>:`🔄 ${t('刷新','Refresh')}`}
          </button>
        </div>
      </div>
      <div className="mk-tabs">
        {[['land',`🏡 ${t('土地','Land')}`,lands.length],['apostle',`🧙 ${t('使徒','Apostle')}`,apostles.length],['drill',`⛏️ ${t('钻头','Drill')}`,drills.length]].map(([v,l,n])=>(
          <button key={v} className={`mk-tab${tab===v?' on':''}`} onClick={()=>{setTab(v);setFilterElem(-1)}}>{l}<span className="mk-count">{n}</span></button>
        ))}
        <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:6}}>
          <button className={`mk-sort-btn${sortDir==='asc'?' on':''}`} onClick={()=>setSortDir('asc')}>↑ {t('低价','Low')}</button>
          <button className={`mk-sort-btn${sortDir==='desc'?' on':''}`} onClick={()=>setSortDir('desc')}>↓ {t('高价','High')}</button>
        </div>
      </div>
      {(tab==='apostle'||tab==='drill')&&(
        <div className="mk-filter-bar">
          <span style={{fontSize:'.72rem',color:'#5040a0',marginRight:4}}>{t('元素：','Element:')}</span>
          <button className={`mk-filter-btn${filterElem===-1?' on':''}`} onClick={()=>setFilterElem(-1)}>{t('全部','All')}</button>
          {ELEMS.map((el,i)=>(
            <button key={i} className={`mk-filter-btn${filterElem===i?' on':''}`} onClick={()=>setFilterElem(i)}
              style={filterElem===i?{borderColor:el.color,color:el.color,background:el.color+'22'}:{}}>
              <ElemIcon i={i} size={11}/>{lang==='zh'?el.name:el.nameEn}
            </button>
          ))}
        </div>
      )}
      {msg&&<div className="mk-msg">{msg}</div>}
      {isLoading
        ?<div className="mk-loading"><span className="mk-spin"/>{t('从链上事件索引扫描...','Scanning on-chain events...')}</div>
        :cur.length===0&&status==='done'
          ?<div className="mk-empty"><div style={{fontSize:'3rem',opacity:.3}}>{tab==='land'?'🏡':tab==='apostle'?'🧙':'⛏️'}</div><div>{t('暂无在售商品','No items listed')}</div></div>
          :<div className="mk-grid">{cur.map(item=><Card key={item.id} item={item} type={tab} onDetail={setDetail} address={address} t={t} lang={lang}/>)}</div>
      }
      <div className="mk-footer">
        {t('共','Total')} <b>{cur.length}</b> · {t('土地','Land')} <b>{lands.length}</b> · {t('使徒','Apostle')} <b>{apostles.length}</b> · {t('钻头','Drill')} <b>{drills.length}</b>
        {status==='loading'&&cur.length>0&&<span style={{color:'#5040a0',marginLeft:8}}><span className="mk-spin" style={{width:10,height:10}}/> {t('更新中','Updating')}</span>}
      </div>
      {detail&&tab==='land'&&<LandDetail item={detail} onClose={()=>setDetail(null)} onBuy={(id,p,s)=>handleBuy(id,p,s,'land')} address={address} t={t} lang={lang}/>}
      {detail&&tab==='apostle'&&<ApostleDetail item={detail} onClose={()=>setDetail(null)} onBuy={(id,p,s)=>handleBuy(id,p,s,'apostle')} address={address} t={t} lang={lang}/>}
      {detail&&tab==='drill'&&<DrillDetail item={detail} onClose={()=>setDetail(null)} onBuy={(id,p,s)=>handleBuy(id,p,s,'drill')} address={address} t={t} lang={lang}/>}
    </div>
  )
}
