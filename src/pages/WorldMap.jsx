import { useEffect, useRef, useState, useCallback } from 'react'
import { usePublicClient, useAccount, useWalletClient } from '../contexts/WalletContext.jsx'
import { encodeFunctionData, formatEther } from 'viem'
import { APO_EGG_GIF, drillImgUrl, ELEM_SVGS, ELEMS } from '../constants/images'
import { CONTRACTS } from '../constants/contracts'
import './WorldMap.css'

// ─── ABIs ───────────────────────────────────────────────────────────────────
const LAND_ABI = [
  { type:'function', name:'resourceAttr', inputs:[{name:'tokenId',type:'uint256'}], outputs:[{type:'uint80'}], stateMutability:'view' },
  { type:'function', name:'ownerOf', inputs:[{name:'tokenId',type:'uint256'}], outputs:[{type:'address'}], stateMutability:'view' },
]
const AUC_ABI = [
  { type:'function', name:'auctions', inputs:[{name:'id',type:'uint256'}],
    outputs:[{name:'seller',type:'address'},{name:'startPrice',type:'uint128'},{name:'endPrice',type:'uint128'},{name:'duration',type:'uint64'},{name:'startedAt',type:'uint64'}], stateMutability:'view' },
  { type:'function', name:'currentPrice', inputs:[{name:'id',type:'uint256'}], outputs:[{type:'uint256'}], stateMutability:'view' },
]
const MINING_ABI = [
  { type:'function', name:'slotCount', inputs:[{name:'landId',type:'uint256'}], outputs:[{type:'uint256'}], stateMutability:'view' },
  { type:'function', name:'slots', inputs:[{name:'landId',type:'uint256'},{name:'index',type:'uint256'}],
    outputs:[{name:'apostleId',type:'uint256'},{name:'drillId',type:'uint256'},{name:'startTime',type:'uint256'}], stateMutability:'view' },
  { type:'function', name:'pendingRewards', inputs:[{name:'landId',type:'uint256'}], outputs:[{type:'uint256[5]'}], stateMutability:'view' },
  { type:'function', name:'MAX_APOSTLES_PER_LAND', inputs:[], outputs:[{type:'uint256'}], stateMutability:'view' },
  { type:'function', name:'startMining', inputs:[{name:'landId',type:'uint256'},{name:'apostleId',type:'uint256'},{name:'drillId',type:'uint256'}], outputs:[], stateMutability:'nonpayable' },
  { type:'function', name:'stopMining', inputs:[{name:'landId',type:'uint256'},{name:'apostleId',type:'uint256'}], outputs:[], stateMutability:'nonpayable' },
  { type:'function', name:'claim', inputs:[{name:'landId',type:'uint256'}], outputs:[], stateMutability:'nonpayable' },
  { type:'function', name:'apostleOnLand', inputs:[{name:'apostleId',type:'uint256'}], outputs:[{type:'uint256'}], stateMutability:'view' },
]
const APO_ABI_WM=[
  {type:'function',name:'attrs',inputs:[{name:'id',type:'uint256'}],
    outputs:[{name:'strength',type:'uint8'},{name:'element',type:'uint8'},{name:'gender',type:'uint8'},
             {name:'gen',type:'uint16'},{name:'genes',type:'uint64'},{name:'birthTime',type:'uint64'},
             {name:'cooldown',type:'uint64'},{name:'motherId',type:'uint32'},{name:'fatherId',type:'uint32'}],
    stateMutability:'view'},
  {type:'function',name:'nextId',inputs:[],outputs:[{type:'uint256'}],stateMutability:'view'},
  {type:'function',name:'ownerOf',inputs:[{name:'id',type:'uint256'}],outputs:[{type:'address'}],stateMutability:'view'},
  {type:'function',name:'setApprovalForAll',inputs:[{name:'op',type:'address'},{name:'v',type:'bool'}],outputs:[],stateMutability:'nonpayable'},
  {type:'function',name:'isApprovedForAll',inputs:[{name:'owner',type:'address'},{name:'op',type:'address'}],outputs:[{type:'bool'}],stateMutability:'view'}
]
const DRL_ABI_WM=[{type:'function',name:'attrs',inputs:[{name:'id',type:'uint256'}],outputs:[{name:'tier',type:'uint8'},{name:'affinity',type:'uint8'}],stateMutability:'view'},{type:'function',name:'nextId',inputs:[],outputs:[{type:'uint256'}],stateMutability:'view'},{type:'function',name:'ownerOf',inputs:[{name:'id',type:'uint256'}],outputs:[{type:'address'}],stateMutability:'view'},{type:'function',name:'setApprovalForAll',inputs:[{name:'op',type:'address'},{name:'v',type:'bool'}],outputs:[],stateMutability:'nonpayable'}]
const NFT_ABI_WM=[{type:'function',name:'isApprovedForAll',inputs:[{name:'owner',type:'address'},{name:'op',type:'address'}],outputs:[{type:'bool'}],stateMutability:'view'}]

// ─── 白皮书颜色 — 每种状态5色调色板做像素纹理 ──────────────────────────────
// [底色, 亮色1, 暗色1, 亮色2, 暗色2]
const PAL = {
  MY:      ['#ff9900','#ffb830','#cc7700','#ffcc55','#aa5500'],  // 我的（橙）
  MY_AUC:  ['#ff3344','#ff6677','#cc1122','#ff5566','#990011'],  // 我的拍卖（红）
  GENESIS: ['#44aa33','#70d055','#228811','#60c045','#116600'],  // 首次售卖（绿）
  RESERVE: ['#11bbaa','#44ddd0','#009988','#33ccbb','#007766'],  // 保留地（青）
  OWNED:   ['#cc3344','#ee5566','#aa1122','#dd4455','#880011'],  // 有主（红）
  MINE:    ['#dd6611','#ff9944','#aa4400','#ee7722','#883300'],  // 挖矿中（深橙）
  ONSALE:  ['#117744','#33aa66','#005522','#22994d','#003311'],  // 拍卖中（深绿）
  MYSTIC:  ['#7722bb','#aa55ee','#551199','#9944cc','#330077'],  // 神秘（紫）
}
// 5元素调色板 — 金木水火土，用于地块着色（原版风格）
const EPALS = [
  ['#c8860a','#e8a020','#a06008','#d09018','#805008'], // 金 — 深黄
  ['#287a18','#40a828','#186810','#369020','#105808'], // 木 — 深绿
  ['#1848b8','#2868d8','#0e38a0','#2058c8','#0a2888'], // 水 — 深蓝
  ['#b82010','#d83020','#901808','#c82818','#700808'], // 火 — 深红
  ['#886020','#a87828','#685018','#987028','#504010'], // 土 — 深棕
]
// 未铸造颜色（比有主的暗一些，但保留元素色调）
const EPALS_UNOWNED = [
  ['#6a4008','#7a5010','#553008'],  // 金未铸造 — 暗黄棕
  ['#0e3a08','#185010','#0a2806'],  // 木未铸造 — 暗绿
  ['#081838','#0e2850','#060e28'],  // 水未铸造 — 暗蓝
  ['#380a08','#500e0a','#280606'],  // 火未铸造 — 暗红
  ['#302008','#402810','#201808'],  // 土未铸造 — 暗棕
]
const SEL_COLOR = '#ff0044'
const HOV_COLOR = 'rgba(255,255,255,0.14)'

const COLS=100, ROWS=100, CELL=8
// 预计算未铸造格子颜色 — 用 crypto random 保证无规律
// 简易2D Perlin-like噪声，产生自然地理感的地块底色
// 返回5元素区域 (0=gold,1=wood,2=water,3=fire,4=soil)
const _UNOWNED_MAP = (() => {
  // 多频率叠加，模拟地形
  function noise2(x, y, seed) {
    const h = (a,b,s) => {
      let v = (a*1619+b*31337+s*6791)^0xdeadbeef
      v = Math.imul(v^(v>>>16), 0x45d9f3b)|0
      v = Math.imul(v^(v>>>16), 0x45d9f3b)|0
      return ((v^(v>>>16))>>>0) / 0xffffffff
    }
    const xi=Math.floor(x), yi=Math.floor(y)
    const xf=x-xi, yf=y-yi
    const fade=t=>t*t*t*(t*(t*6-15)+10)
    const fx=fade(xf), fy=fade(yf)
    const a=h(xi,yi,seed), b=h(xi+1,yi,seed)
    const c=h(xi,yi+1,seed), d=h(xi+1,yi+1,seed)
    return a*(1-fx)*(1-fy)+b*fx*(1-fy)+c*(1-fx)*fy+d*fx*fy
  }
  const a = new Uint8Array(COLS * ROWS)
  const SEEDS = [42, 137, 271, 314, 511]
  for (let col=0; col<COLS; col++) {
    for (let row=0; row<ROWS; row++) {
      // 5个元素各自的强度叠加多频噪声
      const scores = SEEDS.map((s,i) =>
        noise2(col/20+i*3.7, row/20+i*2.3, s)*0.5 +
        noise2(col/8+i*1.3,  row/8+i*1.7,  s+100)*0.3 +
        noise2(col/4+i*0.7,  row/4+i*0.9,  s+200)*0.2
      )
      // 主元素 = 分数最高的
      let best=0
      for(let e=1;e<5;e++) if(scores[e]>scores[best]) best=e
      a[col*ROWS+row] = best
    }
  }
  return a
})()
const MIN_Z=0.3, MAX_Z=14
const CACHE_KEY='wm_v4'

// ─── 工具函数 ────────────────────────────────────────────────────────────────
function decodeAttr(a) {
  if(a==null) return [0,0,0,0,0]
  const b=typeof a==='bigint'?a:BigInt(a)
  return [Number(b&0xffffn),Number((b>>16n)&0xffffn),Number((b>>32n)&0xffffn),Number((b>>48n)&0xffffn),Number((b>>64n)&0xffffn)]
}
function fmtAddr(a) { return a?a.slice(0,8)+'…'+a.slice(-6):'' }
function fmtRing(w) { if(!w)return'0'; const n=Number(w)/1e18; return n<0.001?'<0.001':n.toFixed(3) }

// 伪随机（种子确定，颜色稳定）
function sr(seed) {
  let s=(seed^0xdeadbeef)>>>0
  s=Math.imul(s^(s>>>16),0x45d9f3b)>>>0
  s=Math.imul(s^(s>>>16),0x45d9f3b)>>>0
  return((s^(s>>>16))>>>0)/0xffffffff
}
// 主元素
function domElem(id,attrs) {
  if(!attrs[id]) return -1
  const v=decodeAttr(attrs[id]); let b=0
  for(let i=1;i<5;i++) if(v[i]>v[b]) b=i
  return b
}
// 原版颜色系统: 元素色决定色相，状态决定亮度
function getPal(id,owners,attrs,aucs,slots,address) {
  const own=owners[id]; if(!own) return null
  const isMe=address&&own.toLowerCase()===address.toLowerCase()
  const e=domElem(id,attrs)  // 主元素 0-4
  // 我的地块挂拍 → 红色高亮（最高优先级）
  if(isMe&&aucs[id]) return PAL.MY_AUC
  // 我的地块挖矿中 → 橙色叠元素
  if(isMe&&slots[id]?.length>0) {
    return e>=0?[PAL.MY[0],EPALS[e][0],PAL.MY[2],EPALS[e][1],PAL.MY[4]]:PAL.MY
  }
  // 我的地块 → 纯橙
  if(isMe) return e>=0?[PAL.MY[0],EPALS[e][0],PAL.MY[2],EPALS[e][1],PAL.MY[4]]:PAL.MY
  // 拍卖中 → 亮绿（荷兰拍卖标识，原版颜色）
  if(aucs[id]) return e>=0?[PAL.ONSALE[0],EPALS[e][0],PAL.ONSALE[2],EPALS[e][1],PAL.ONSALE[4]]:PAL.ONSALE
  // 挖矿中 → 纯元素色（最漂亮，原版如此）
  if(slots[id]?.length>0) return e>=0?EPALS[e]:PAL.MINE
  // 有主未挖 → 元素色（稍暗，用EPALS降亮度版）
  if(e>=0) return EPALS[e]
  return PAL.OWNED
}

export default function WorldMap() {
  const cvRef=useRef(null), wrapRef=useRef(null), focusedR=useRef(false)
  const pc=usePublicClient()
  const { address }=useAccount()
  const { data:wc }=useWalletClient()
  const [picker,setPicker]=useState(null)
  const [pickerItems,setPickerItems]=useState([])
  const [pickerMsg,setPickerMsg]=useState('')
  const [attrs,setAttrs]=useState({})
  const [owners,setOwners]=useState({})
  const [aucs,setAucs]=useState({})
  const [prices,setPrices]=useState({})
  const [slots,setSlots]=useState({})
  const [rewards,setRewards]=useState({})
  const [sel,setSel]=useState(null)
  const [hov,setHov]=useState(null) // 只用于 tooltip 显示，不触发 canvas 重绘
  const [hovPos,setHovPos]=useState({x:0,y:0})
  const [loading,setLoading]=useState(true)
  const [minted,setMinted]=useState(0)
  const [filter,setFilter]=useState('all')
  const [cvSize,setCvSize]=useState({w:900,h:600})
  const panR=useRef({dn:false,sx:0,sy:0,px:0,py:0,mv:false})

  // ── zoom/pan 用 ref 驱动 RAF 渲染（顺滑平移核心）─────────────────────────
  const initZoom = Math.max(0.5, Math.min((window.innerHeight-80)/(ROWS*CELL), (window.innerWidth)/(COLS*CELL)))
  const zoomRef=useRef(initZoom)
  const panRef=useRef({x:0,y:0})
  const [zoom,_setZoom]=useState(initZoom)
  const [pan,_setPan]=useState({x:0,y:0})
  const rafRef=useRef(null)
  const dirtyRef=useRef(true)

  // 所有渲染状态用 ref 镜像，RAF 读 ref，不读 state（避免闭包陈旧值）
  const attrsRef=useRef({})
  const ownersRef=useRef({})
  const aucsRef=useRef({})
  const slotsRef=useRef({})
  const selRef=useRef(null)
  const hovRef=useRef(null)  // hover 只用 ref，不触发 React re-render
  const filterRef=useRef('all')
  const addrRef=useRef(null)

  const setZoom=useCallback((v)=>{
    const nv=typeof v==='function'?v(zoomRef.current):v
    zoomRef.current=nv; dirtyRef.current=true; _setZoom(nv)
  },[])
  const setPan=useCallback((v)=>{
    const nv=typeof v==='function'?v(panRef.current):v
    panRef.current=nv; dirtyRef.current=true
    // pan 不需要 state 同步，只驱动 RAF
  },[])

  useEffect(()=>{attrsRef.current=attrs;dirtyRef.current=true},[attrs])
  useEffect(()=>{ownersRef.current=owners;dirtyRef.current=true},[owners])
  useEffect(()=>{aucsRef.current=aucs;dirtyRef.current=true},[aucs])
  useEffect(()=>{slotsRef.current=slots;dirtyRef.current=true},[slots])
  useEffect(()=>{selRef.current=sel;dirtyRef.current=true},[sel])
  useEffect(()=>{filterRef.current=filter;dirtyRef.current=true},[filter])
  useEffect(()=>{addrRef.current=address;dirtyRef.current=true},[address])

  // Resize
  useEffect(()=>{
    const el=wrapRef.current; if(!el) return
    const ro=new ResizeObserver(es=>{
      for(const e of es){const{width:w,height:h}=e.contentRect; setCvSize({w:Math.round(w),h:Math.round(h)})}
    })
    ro.observe(el); return()=>ro.disconnect()
  },[])

  const mapW=COLS*CELL, mapH=ROWS*CELL
  const cvSizeRef=useRef(cvSize)
  useEffect(()=>{cvSizeRef.current=cvSize;dirtyRef.current=true},[cvSize])
  const clamp=useCallback((p,z)=>({
    x:Math.max(0,Math.min(Math.max(0,mapW-cvSize.w/z),p.x)),
    y:Math.max(0,Math.min(Math.max(0,mapH-cvSize.h/z),p.y)),
  }),[mapW,mapH,cvSize])
  const clampRef=useCallback((p,z)=>{
    const{w,h}=cvSizeRef.current
    return{x:Math.max(0,Math.min(Math.max(0,mapW-w/z),p.x)),y:Math.max(0,Math.min(Math.max(0,mapH-h/z),p.y))}
  },[mapW,mapH])

  // 数据加载（后端API + sessionStorage缓存）
  useEffect(()=>{
    let dead=false
    async function load(){
      // 先读 sessionStorage 缓存立即渲染
      try{
        const raw=sessionStorage.getItem(CACHE_KEY)
        if(raw){
          const{a,o,u,p,m}=JSON.parse(raw)
          const ra={},ro2={},ru={},rp={}
          for(const[k,v] of Object.entries(a)) ra[k]=BigInt(v)
          for(const[k,v] of Object.entries(o)) ro2[k]=v
          for(const[k,v] of Object.entries(u)) ru[k]={...v,startPrice:BigInt(v.startPrice),endPrice:BigInt(v.endPrice),startedAt:BigInt(v.startedAt),duration:BigInt(v.duration)}
          for(const[k,v] of Object.entries(p)) rp[k]=BigInt(v)
          setAttrs(ra);setOwners(ro2);setAucs(ru);setPrices(rp);setMinted(m);setLoading(false)
        }
      }catch(e){}
      setLoading(true)
      try{
        const na={},no={},nauc={},np={}
        let cnt=0
        // 从后端 API 获取土地数据（快速，已索引）
        let apiOk = false
        try{
          const res = await fetch('/api/lands')
          if(res.ok){
            const data = await res.json()
            if(data.ok && data.lands?.length){
              data.lands.forEach(({id,resources,miningSlots})=>{
                const b = BigInt(resources[0])|(BigInt(resources[1])<<16n)|(BigInt(resources[2])<<32n)|(BigInt(resources[3])<<48n)|(BigInt(resources[4])<<64n)
                na[id]=b; cnt++
              })
              setAttrs({...na}); setMinted(cnt)
              apiOk = true
            }
          }
        }catch(e){ console.warn('lands API failed, fallback:', e.message) }
        // 无论 API 是否成功，都补充读取 owner 和拍卖信息（这些变化频繁，不缓存在后端）
        const ids = apiOk ? Object.keys(na).map(Number) : Array.from({length:300},(_,i)=>i+1)
        const BATCH=100
        for(let s=0;s<ids.length&&!dead;s+=BATCH){
          const batch=ids.slice(s,s+BATCH)
          const[or,aur]=await Promise.all([
            pc.multicall({contracts:batch.map(id=>({address:CONTRACTS.land,abi:LAND_ABI,functionName:'ownerOf',args:[BigInt(id)]})),allowFailure:true}),
            pc.multicall({contracts:batch.map(id=>({address:CONTRACTS.auction,abi:AUC_ABI,functionName:'auctions',args:[BigInt(id)]})),allowFailure:true}),
          ])
          batch.forEach((id,i)=>{
            const own=or[i]?.result
            if(own&&own!=='0x0000000000000000000000000000000000000000'){ no[id]=own; if(!na[id]){na[id]=0n;cnt++} }
            const auc=aur[i]?.result
            if(auc?.[4]>0n) nauc[id]={seller:auc[0],startPrice:auc[1],endPrice:auc[2],duration:auc[3],startedAt:auc[4]}
          })
          if(!dead){setOwners({...no});setAucs({...nauc});setMinted(Object.keys(no).length)}
        }
        if(dead)return
        setAttrs(na);setOwners(no);setAucs(nauc);setMinted(cnt)
        const aucIds=Object.keys(nauc).map(Number)
        if(aucIds.length>0){
          const pr=await pc.multicall({contracts:aucIds.map(id=>({address:CONTRACTS.auction,abi:AUC_ABI,functionName:'currentPrice',args:[BigInt(id)]})),allowFailure:true})
          aucIds.forEach((id,i)=>{if(pr[i]?.result)np[id]=pr[i].result})
          if(!dead)setPrices(np)
        }
        try{
          const sa={},so={},su={},sp={}
          for(const[k,v] of Object.entries(na)) sa[k]=v.toString()
          for(const[k,v] of Object.entries(no)) so[k]=v
          for(const[k,v] of Object.entries(nauc)) su[k]={...v,startPrice:v.startPrice.toString(),endPrice:v.endPrice.toString(),startedAt:v.startedAt.toString(),duration:v.duration.toString()}
          for(const[k,v] of Object.entries(np)) sp[k]=v.toString()
          sessionStorage.setItem(CACHE_KEY,JSON.stringify({a:sa,o:so,u:su,p:sp,m:cnt}))
        }catch(e){}
      }catch(e){console.error(e)}finally{if(!dead)setLoading(false)}
    }
    load(); return()=>{dead=true}
  },[pc])

  // 自动聚焦到已铸造区域（cvSize有效且有数据时触发）
  useEffect(()=>{
    const ownIds=Object.keys(owners)
    const W=cvSize.w, H=cvSize.h
    if(ownIds.length>0 && W>200 && H>200 && !focusedR.current){
      focusedR.current=true
      const ids=ownIds.map(Number)
      const cols=ids.map(id=>Math.floor((id-1)/ROWS))
      const rows=ids.map(id=>(id-1)%ROWS)
      const minC=Math.min(...cols),maxC=Math.max(...cols)
      const minR=Math.min(...rows),maxR=Math.max(...rows)
      const spanC=maxC-minC+1, spanR=Math.max(maxR-minR+1,1)
      const z=Math.max(3,Math.min(MAX_Z,Math.floor(Math.min(W*0.65/(spanC*CELL),H*0.65/(spanR*CELL)))))
      const cx=(minC+spanC/2)*CELL-W/z/2
      const cy=(minR+spanR/2)*CELL-(H-60)/z/2
      setZoom(z); setPan({x:Math.max(0,cx),y:Math.max(0,cy)})
    }
  },[owners, cvSize])

  // 选中地块 slots/rewards
  useEffect(()=>{
    if(!sel||!owners[sel])return
    let dead=false
    ;(async()=>{
      try{
        const cnt=await pc.readContract({address:CONTRACTS.mining,abi:MINING_ABI,functionName:'slotCount',args:[BigInt(sel)]})
        const arr=[]
        for(let i=0;i<Number(cnt);i++){
          const s=await pc.readContract({address:CONTRACTS.mining,abi:MINING_ABI,functionName:'slots',args:[BigInt(sel),BigInt(i)]})
          // 同时读取钻头的属性来获取 elem 和 tier
          let drillElem=0, drillTier=1
          if(s[1]>0n){
            try{
              const da=await pc.readContract({address:CONTRACTS.drill,abi:DRL_ABI_WM,functionName:'attrs',args:[s[1]]})
              drillTier=Number(da[0]); drillElem=Number(da[1])
            }catch{}
          }
          // 读取使徒的 strength 和 element
          let apoStrength=50, apoElem=0
          if(s[0]>0n){
            try{
              const aa=await pc.readContract({address:CONTRACTS.apostle,abi:APO_ABI_WM,functionName:'attrs',args:[s[0]]})
              apoStrength=Number(aa[0]); apoElem=Number(aa[1])
            }catch{}
          }
          arr.push({apostleId:s[0],drillId:s[1],startTime:s[2],drillTier,drillElem,apoStrength,apoElem})
        }
        const rw=await pc.readContract({address:CONTRACTS.mining,abi:MINING_ABI,functionName:'pendingRewards',args:[BigInt(sel)]})
        if(!dead){setSlots(p=>({...p,[sel]:arr}));setRewards(p=>({...p,[sel]:rw}))}
      }catch(e){console.error(e)}
    })(); return()=>{dead=true}
  },[sel,pc,owners])

  // ─── RAF 渲染循环（顺滑平移核心）────────────────────────────────────────────
  useEffect(()=>{
    function drawFrame(){
      const cv=cvRef.current; if(!cv){rafRef.current=requestAnimationFrame(drawFrame);return}
      if(!dirtyRef.current){rafRef.current=requestAnimationFrame(drawFrame);return}
      dirtyRef.current=false

      const ctx=cv.getContext('2d',{alpha:false})
      const{w:W,h:H}=cvSizeRef.current
      const zoom=zoomRef.current
      const rawP=panRef.current
      const p=clampRef(rawP,zoom)
      const attrs=attrsRef.current, owners=ownersRef.current
      const aucs=aucsRef.current, slots=slotsRef.current
      const sel=selRef.current, hov=hovRef.current
      const filter=filterRef.current, address=addrRef.current

      // 深色棋盘背景
      ctx.fillStyle='#0d0b14'; ctx.fillRect(0,0,W,H)
      const bgSz=20
      ctx.fillStyle='#111020'
      for(let bx=0;bx<W;bx+=bgSz*2){for(let by=0;by<H;by+=bgSz){
        const offset=(Math.floor(by/bgSz)%2)*bgSz
        ctx.fillRect(bx+offset,by,bgSz,bgSz)
      }}

      const sz=CELL*zoom
      const mapX0=Math.round(-p.x*zoom), mapY0=Math.round(-p.y*zoom)
      const mapPW=Math.round(COLS*sz), mapPH=Math.round(ROWS*sz)

      // 地图底色
      ctx.fillStyle='#1a1433'
      ctx.fillRect(mapX0,mapY0,mapPW,mapPH)

      const c0=Math.max(0,Math.floor(p.x/CELL))
      const r0=Math.max(0,Math.floor(p.y/CELL))
      const c1=Math.min(COLS-1,Math.ceil((p.x+W/zoom)/CELL))
      const r1=Math.min(ROWS-1,Math.ceil((p.y+H/zoom)/CELL))

      for(let col=c0;col<=c1;col++){
        for(let row=r0;row<=r1;row++){
          const id=col*ROWS+row+1
          const px=Math.round(col*sz-p.x*zoom)
          const py=Math.round(row*sz-p.y*zoom)
          const csz=Math.max(1,Math.ceil(sz))
          const own=owners[id]
          const inF=filter==='all'
            ||(filter==='auction'&&!!aucs[id])
            ||(filter==='mine'&&address&&own&&own.toLowerCase()===address.toLowerCase())
          const pal=getPal(id,owners,attrs,aucs,slots,address)

          if(!own){
            // 未铸造：Perlin噪声元素色（原版风格，彩色地形）
            const et=_UNOWNED_MAP[col*ROWS+row]
            const up=EPALS_UNOWNED[et]
            ctx.fillStyle=up[0]; ctx.fillRect(px,py,csz,csz)
            if(sz>=4){
              const rnd2=sr((col*97+row*131)*17)
              if(rnd2<0.2){ctx.fillStyle=up[1];ctx.fillRect(px,py,csz>>1,csz>>1)}
              else if(rnd2<0.38){ctx.fillStyle=up[2];ctx.fillRect(px+(csz>>1),py+(csz>>1),csz>>1,csz>>1)}
            }
          } else if(!inF){
            ctx.fillStyle='#1c1835'; ctx.fillRect(px,py,csz,csz)
          } else if(sz<=1.5){
            ctx.fillStyle=pal[0]; ctx.fillRect(px,py,csz,csz)
          } else {
            // 纹理渲染
            ctx.fillStyle=pal[0]; ctx.fillRect(px,py,csz,csz)
            if(sz>=5){
              const sub=Math.max(1,Math.round(sz/5))
              const nc=Math.ceil(csz/sub)
              for(let si=0;si<nc;si++){for(let sj=0;sj<nc;sj++){
                const rnd=sr((col*100+row)*961+(si*31+sj)*7)
                let ci=-1
                if(rnd<0.15)ci=1;else if(rnd<0.27)ci=3;else if(rnd<0.38)ci=2;else if(rnd<0.45)ci=4
                if(ci>=0){const spx=px+si*sub,spy=py+sj*sub,sw=Math.min(sub,csz-si*sub),sh=Math.min(sub,csz-sj*sub);if(sw>0&&sh>0){ctx.fillStyle=pal[ci];ctx.fillRect(spx,spy,sw,sh)}}
              }}
            }
            // 格子边框（原版特征）
            if(sz>=4){ctx.strokeStyle='rgba(0,0,0,0.5)';ctx.lineWidth=0.5;ctx.strokeRect(px+0.5,py+0.5,csz-1,csz-1)}
          }
          if(hov===id){ctx.fillStyle=HOV_COLOR;ctx.fillRect(px,py,csz,csz)}
          if(sel===id){
            ctx.strokeStyle=SEL_COLOR;ctx.lineWidth=Math.max(2,sz*0.08)
            ctx.strokeRect(px+1,py+1,csz-2,csz-2)
            ctx.fillStyle='rgba(255,0,68,0.15)';ctx.fillRect(px,py,csz,csz)
          }
        }
      }
      // 地图边框
      ctx.strokeStyle='rgba(140,100,220,0.7)'; ctx.lineWidth=2
      ctx.strokeRect(mapX0,mapY0,mapPW,mapPH)

      rafRef.current=requestAnimationFrame(drawFrame)
    }
    rafRef.current=requestAnimationFrame(drawFrame)
    return()=>{if(rafRef.current)cancelAnimationFrame(rafRef.current)}
  },[clampRef]) // 只在 mount 时启动一次，读 refs 不依赖 state

  // ─── 鼠标事件 ─────────────────────────────────────────────────────────────
  function s2c(cx,cy){
    const cv=cvRef.current; if(!cv)return null
    const r=cv.getBoundingClientRect()
    const zoom=zoomRef.current, p=clampRef(panRef.current,zoom)
    const{w:W,h:H}=cvSizeRef.current
    const wx=(cx-r.left)/r.width*W/zoom+p.x
    const wy=(cy-r.top)/r.height*H/zoom+p.y
    const col=Math.floor(wx/CELL),row=Math.floor(wy/CELL)
    if(col<0||col>=COLS||row<0||row>=ROWS)return null
    return{col,row,id:col*ROWS+row+1}
  }
  const onMD=e=>{ panR.current={dn:true,sx:e.clientX,sy:e.clientY,px:panRef.current.x,py:panRef.current.y,mv:false} }
  const onMM=e=>{
    const pr=panR.current
    if(pr.dn){
      const cv=cvRef.current; if(!cv)return
      const r=cv.getBoundingClientRect()
      const zoom=zoomRef.current
      const{w:W,h:H}=cvSizeRef.current
      const dx=(e.clientX-pr.sx)*W/r.width/zoom
      const dy=(e.clientY-pr.sy)*H/r.height/zoom
      if(Math.abs(dx)>2||Math.abs(dy)>2)pr.mv=true
      const np=clampRef({x:pr.px-dx,y:pr.py-dy},zoom)
      panRef.current=np; dirtyRef.current=true
    }
    const c=s2c(e.clientX,e.clientY)
    const newHov=c?.id??null
    if(hovRef.current!==newHov){
      hovRef.current=newHov; dirtyRef.current=true
      setHov(newHov)
    }
    if(c)setHovPos({x:e.clientX,y:e.clientY})
  }
  const onMU=e=>{ if(!panR.current.mv){const c=s2c(e.clientX,e.clientY);if(c)setSel(s=>s===c.id?null:c.id)}; panR.current.dn=false }
  const onML=()=>{ panR.current.dn=false; if(hovRef.current!==null){hovRef.current=null;dirtyRef.current=true;setHov(null)} }

  // ─── Touch 事件（手机/平板拖拽 + 双指缩放）────────────────────────────
  const touchR=useRef({lastDist:0})
  const onTouchStart=useCallback(e=>{
    e.preventDefault()
    const ts=e.touches
    if(ts.length===1){
      panR.current={dn:true,sx:ts[0].clientX,sy:ts[0].clientY,px:panRef.current.x,py:panRef.current.y,mv:false}
    } else if(ts.length===2){
      const dx=ts[0].clientX-ts[1].clientX,dy=ts[0].clientY-ts[1].clientY
      touchR.current.lastDist=Math.sqrt(dx*dx+dy*dy)
      panR.current.dn=false
    }
  },[])
  const onTouchMove=useCallback(e=>{
    e.preventDefault()
    const ts=e.touches
    if(ts.length===1){
      const pr=panR.current; if(!pr.dn)return
      const cv=cvRef.current; if(!cv)return
      const r=cv.getBoundingClientRect()
      const zoom=zoomRef.current
      const{w:W,h:H}=cvSizeRef.current
      const dx=(ts[0].clientX-pr.sx)*W/r.width/zoom
      const dy=(ts[0].clientY-pr.sy)*H/r.height/zoom
      if(Math.abs(dx)>2||Math.abs(dy)>2)pr.mv=true
      panRef.current=clampRef({x:pr.px-dx,y:pr.py-dy},zoom)
      dirtyRef.current=true
    } else if(ts.length===2){
      const dx=ts[0].clientX-ts[1].clientX,dy=ts[0].clientY-ts[1].clientY
      const dist=Math.sqrt(dx*dx+dy*dy)
      const last=touchR.current.lastDist
      if(last>0){
        const cv=cvRef.current; if(!cv)return
        const r=cv.getBoundingClientRect()
        const{w:W,h:H}=cvSizeRef.current
        const mx=(ts[0].clientX+ts[1].clientX)/2,my=(ts[0].clientY+ts[1].clientY)/2
        const bx=(mx-r.left)/r.width*W,by=(my-r.top)/r.height*H
        const zoom=zoomRef.current
        const p=clampRef(panRef.current,zoom)
        const wx=bx/zoom+p.x,wy=by/zoom+p.y
        const nz=Math.min(MAX_Z,Math.max(MIN_Z,zoom*(dist/last)))
        zoomRef.current=nz; _setZoom(nz)
        panRef.current=clampRef({x:wx-bx/nz,y:wy-by/nz},nz)
        dirtyRef.current=true
      }
      touchR.current.lastDist=dist
    }
  },[clampRef])
  const onTouchEnd=useCallback(e=>{
    e.preventDefault()
    if(e.touches.length===0&&!panR.current.mv){
      const ct=e.changedTouches[0]
      if(ct){const c=s2c(ct.clientX,ct.clientY);if(c)setSel(s=>s===c.id?null:c.id)}
    }
    if(e.touches.length===0){panR.current.dn=false;touchR.current.lastDist=0}
  },[])
  useEffect(()=>{
    const cv=cvRef.current; if(!cv)return
    cv.addEventListener('touchstart',onTouchStart,{passive:false})
    cv.addEventListener('touchmove',onTouchMove,{passive:false})
    cv.addEventListener('touchend',onTouchEnd,{passive:false})
    return()=>{
      cv.removeEventListener('touchstart',onTouchStart)
      cv.removeEventListener('touchmove',onTouchMove)
      cv.removeEventListener('touchend',onTouchEnd)
    }
  },[onTouchStart,onTouchMove,onTouchEnd])
  useEffect(()=>{
    const cv=cvRef.current; if(!cv)return
    const fn=e=>{
      e.preventDefault()
      const zoom=zoomRef.current
      const p=clampRef(panRef.current,zoom)
      const{w:W,h:H}=cvSizeRef.current
      const r=cv.getBoundingClientRect()
      const bx=(e.clientX-r.left)/r.width*W
      const by=(e.clientY-r.top)/r.height*H
      const wx=bx/zoom+p.x, wy=by/zoom+p.y
      const nz=Math.min(MAX_Z,Math.max(MIN_Z,zoom*(e.deltaY<0?1.18:1/1.18)))
      setZoom(nz)
      setPan(clampRef({x:wx-bx/nz,y:wy-by/nz},nz))
    }
    cv.addEventListener('wheel',fn,{passive:false})
    return()=>cv.removeEventListener('wheel',fn)
  },[clampRef])  // 不再依赖 zoom/pan state
  const zI=()=>setZoom(z=>Math.min(MAX_Z,z*1.3))
  const zO=()=>setZoom(z=>Math.max(MIN_Z,z/1.3))
  const zR=()=>{ focusedR.current=false; const z=Math.max(0.5,Math.min((window.innerHeight-80)/(ROWS*CELL),(window.innerWidth)/(COLS*CELL))); zoomRef.current=z; _setZoom(z); panRef.current={x:0,y:0}; dirtyRef.current=true }
  // ─── 详情面板数据 ──────────────────────────────────────────────────────────
  const selOwner=sel?owners[sel]:null
  const selAuc=sel?aucs[sel]:null
  const selPrice=sel?prices[sel]:null
  const selSlots=sel?slots[sel]??[]:[]
  const selRewards=sel?rewards[sel]??[]:[]
  const selVals=decodeAttr(sel?attrs[sel]:null)
  const selCol=sel!=null?Math.floor((sel-1)/ROWS):null
  const selRow=sel!=null?(sel-1)%ROWS:null
  const isMe=!!(address&&selOwner&&selOwner.toLowerCase()===address.toLowerCase())
  const maxV=Math.max(1,...selVals)
  const hovCell=hov?{col:Math.floor((hov-1)/ROWS),row:(hov-1)%ROWS,own:!!owners[hov],auc:!!aucs[hov],isMe:!!(address&&owners[hov]&&owners[hov].toLowerCase()===address?.toLowerCase())}:null
  const ELEMS=[{k:'GOLD',c:'#f0c040',i:'🪙'},{k:'WOOD',c:'#52c462',i:'🪵'},{k:'WATER',c:'#40a0f0',i:'💧'},{k:'FIRE',c:'#f05030',i:'🔥'},{k:'SOIL',c:'#c08040',i:'🪨'}]
  // 图例
  const LEGEND=[
    [PAL.MY[0],'我的地块'],[PAL.MY_AUC[0],'我的拍卖'],
    [PAL.ONSALE[0],'出售中'],[PAL.MINE[0],'挖矿中'],[PAL.OWNED[0],'已有主'],
    [PAL.GENESIS[0],'首拍'],[PAL.RESERVE[0],'保留'],[PAL.MYSTIC[0],'神秘'],
  ]

  // ── NFT扫描工具函数 ───────────────────────────────────────────────────────
  async function scanWalletNFTs(type) {
    const contract=type==='apostle'?CONTRACTS.apostle:CONTRACTS.drill
    const abi=type==='apostle'?APO_ABI_WM:DRL_ABI_WM
    const nextId=await pc.readContract({address:contract,abi,functionName:'nextId'})
    const total=Number(nextId)-1
    const BATCH=50,items=[]
    for(let s=1;s<=total;s+=BATCH){
      const ids=Array.from({length:Math.min(BATCH,total-s+1)},(_,i)=>s+i)
      const ownerRes=await pc.multicall({contracts:ids.map(id=>({address:contract,abi:[{type:'function',name:'ownerOf',inputs:[{name:'id',type:'uint256'}],outputs:[{type:'address'}],stateMutability:'view'}],functionName:'ownerOf',args:[BigInt(id)]})),allowFailure:true})
      const myIds=ids.filter((_,i)=>ownerRes[i]?.result?.toLowerCase()===address.toLowerCase())
      if(myIds.length>0){
        const attrRes=await pc.multicall({contracts:myIds.map(id=>({address:contract,abi,functionName:'attrs',args:[BigInt(id)]})),allowFailure:true})
        myIds.forEach((id,i)=>{
          const at=attrRes[i]?.result
          if(type==='apostle') items.push({id,strength:at?Number(at[0]):30,elem:at?Number(at[1]):0})
          else items.push({id,tier:at?Number(at[0]):1,elem:at?Number(at[1]):0})
        })
      }
    }
    items.sort((a,b)=>type==='apostle'?(b.strength-a.strength):(b.tier-a.tier))
    return items
  }

  // ── 放置选择器 ──────────────────────────────────────────────────────────
  // picker: null | 'apostle' | 'drill-optional'
  // 流程：点＋→扫使徒列表 → 选使徒 → 弹"是否带钻头?" → 选或跳过 → startMining
  async function openPicker(type) {
    if(!address||!pc){alert('请先连接钱包');return}
    window._selApo=null; window._selDrl=null
    setPicker(type); setPickerMsg('扫描中...'); setPickerItems([])
    try{
      const items=await scanWalletNFTs(type)
      setPickerItems(items)
      setPickerMsg(items.length>0?`找到 ${items.length} 个，点击选择`:`钱包中无可用${type==='apostle'?'使徒':'钻头'}`)
    }catch(e){setPickerMsg('加载失败: '+e.message)}
  }

  // ── 放置处理 ─────────────────────────────────────────────────────────────
  async function handlePlace(item) {
    if(!wc||!address){alert('请先连接钱包');return}
    const type=picker, landId=sel

    // 第一步：选了使徒 → 弹出"选择钻头（可选）"
    if(type==='apostle'){
      window._selApo=item
      setPicker('drill-optional')
      setPickerItems([]); setPickerMsg('扫描钻头...')
      try{
        const drills=await scanWalletNFTs('drill')
        setPickerItems(drills)
        setPickerMsg(drills.length>0
          ? `已选使徒#${item.id}，可选配钻头（或点"不带钻头"直接放置）`
          : `已选使徒#${item.id}，钱包无钻头，将直接放置`)
      }catch(e){setPickerMsg('已选使徒#'+item.id+'，将直接放置（无钻头）')}
      return
    }

    // 第二步a：选了钻头 → 带钻头放置
    if(type==='drill-optional'){
      window._selDrl=item
      await doStartMining(landId, window._selApo, item)
      return
    }
  }

  // "不带钻头"直接放置
  async function placeWithoutDrill() {
    if(!window._selApo){setPickerMsg('❌ 请先选择使徒');return}
    await doStartMining(sel, window._selApo, null)
  }

  // 核心放置函数
  async function doStartMining(landId, apo, drl) {
    if(!apo){setPickerMsg('❌ 未选择使徒');return}
    setPickerMsg('检查授权...')
    try{
      // 授权使徒
      if(!await pc.readContract({address:CONTRACTS.apostle,abi:NFT_ABI_WM,functionName:'isApprovedForAll',args:[address,CONTRACTS.mining]})){
        setPickerMsg('授权使徒合约...')
        const h=await wc.sendTransaction({to:CONTRACTS.apostle,data:encodeFunctionData({abi:APO_ABI_WM,functionName:'setApprovalForAll',args:[CONTRACTS.mining,true]})})
        await pc.waitForTransactionReceipt({hash:h})
      }
      // 如果带钻头，授权钻头
      if(drl){
        if(!await pc.readContract({address:CONTRACTS.drill,abi:NFT_ABI_WM,functionName:'isApprovedForAll',args:[address,CONTRACTS.mining]})){
          setPickerMsg('授权钻头合约...')
          const h=await wc.sendTransaction({to:CONTRACTS.drill,data:encodeFunctionData({abi:DRL_ABI_WM,functionName:'setApprovalForAll',args:[CONTRACTS.mining,true]})})
          await pc.waitForTransactionReceipt({hash:h})
        }
      }
      // 检查槽位是否满，满了则挤出最弱的
      const slotCnt=Number(await pc.readContract({address:CONTRACTS.mining,abi:MINING_ABI,functionName:'slotCount',args:[BigInt(landId)]}))
      const maxSlots=Number(await pc.readContract({address:CONTRACTS.mining,abi:MINING_ABI,functionName:'MAX_APOSTLES_PER_LAND'}).catch(()=>5n))
      if(slotCnt>=maxSlots){
        let weakestApoId=null, weakestStr=Infinity
        for(let i=0;i<slotCnt;i++){
          const slot=await pc.readContract({address:CONTRACTS.mining,abi:MINING_ABI,functionName:'slots',args:[BigInt(landId),BigInt(i)]})
          try{
            const at=await pc.readContract({address:CONTRACTS.apostle,abi:APO_ABI_WM,functionName:'attrs',args:[slot[0]]})
            const str=Number(at[0])
            if(str<weakestStr){weakestStr=str;weakestApoId=slot[0]}
          }catch{}
        }
        if(!weakestApoId||apo.strength<=weakestStr){
          setPickerMsg(`❌ 槽位已满，力量(${apo.strength})需高于最弱使徒(${weakestStr})`); return
        }
        setPickerMsg(`挤出力量${weakestStr}的使徒...`)
        const sh=await wc.sendTransaction({to:CONTRACTS.mining,data:encodeFunctionData({abi:MINING_ABI,functionName:'stopMining',args:[BigInt(landId),weakestApoId]})})
        await pc.waitForTransactionReceipt({hash:sh})
      }
      // startMining — drillId=0 表示不带钻头
      const drillId = drl ? BigInt(drl.id) : 0n
      setPickerMsg(drl?`放置使徒#${apo.id}+钻头#${drl.id}...`:`放置使徒#${apo.id}（无钻头）...`)
      const h=await wc.sendTransaction({to:CONTRACTS.mining,data:encodeFunctionData({abi:MINING_ABI,functionName:'startMining',args:[BigInt(landId),BigInt(apo.id),drillId]})})
      await pc.waitForTransactionReceipt({hash:h})
      setPickerMsg('✅ 放置成功！')
      window._selApo=null; window._selDrl=null
      setTimeout(()=>setPicker(null),1000)
      // 刷新槽位
      await refreshSlots(landId)
    }catch(e){setPickerMsg('❌ '+(e.shortMessage||e.message))}
  }

  // 刷新单个地块的槽位数据
  async function refreshSlots(landId) {
    const cnt=Number(await pc.readContract({address:CONTRACTS.mining,abi:MINING_ABI,functionName:'slotCount',args:[BigInt(landId)]}))
    const arr=[]
    for(let i=0;i<cnt;i++){
      const s=await pc.readContract({address:CONTRACTS.mining,abi:MINING_ABI,functionName:'slots',args:[BigInt(landId),BigInt(i)]})
      let drillElem=0,drillTier=1,apoStrength=50,apoElem=0
      if(s[1]>0n){try{const da=await pc.readContract({address:CONTRACTS.drill,abi:DRL_ABI_WM,functionName:'attrs',args:[s[1]]});drillTier=Number(da[0]);drillElem=Number(da[1])}catch{}}
      if(s[0]>0n){try{const aa=await pc.readContract({address:CONTRACTS.apostle,abi:APO_ABI_WM,functionName:'attrs',args:[s[0]]});apoStrength=Number(aa[0]);apoElem=Number(aa[1])}catch{}}
      arr.push({apostleId:s[0],drillId:s[1],startTime:s[2],drillTier,drillElem,apoStrength,apoElem})
    }
    const rw=await pc.readContract({address:CONTRACTS.mining,abi:MINING_ABI,functionName:'pendingRewards',args:[BigInt(landId)]}).catch(()=>[])
    setSlots(p=>({...p,[landId]:arr}))
    setRewards(p=>({...p,[landId]:rw}))
  }

  // ── 停止挖矿 ─────────────────────────────────────────────────────────────
  async function handleStopMining(landId, apostleId) {
    if(!wc)return
    try{
      const h=await wc.sendTransaction({to:CONTRACTS.mining,data:encodeFunctionData({abi:MINING_ABI,functionName:'stopMining',args:[BigInt(landId),apostleId]})})
      await pc.waitForTransactionReceipt({hash:h})
      await refreshSlots(landId)
    }catch(e){alert('停止失败: '+(e.shortMessage||e.message))}
  }

  // ── 领取资源 ─────────────────────────────────────────────────────────────
  async function handleClaim(landId) {
    if(!wc)return
    try{
      const h=await wc.sendTransaction({to:CONTRACTS.mining,data:encodeFunctionData({abi:MINING_ABI,functionName:'claim',args:[BigInt(landId)]})})
      await pc.waitForTransactionReceipt({hash:h})
      alert('领取成功！')
    }catch(e){alert('领取失败: '+(e.shortMessage||e.message))}
  }

  return (
    <div className="wm-root">
      <div className="wm-canvas-wrap" ref={wrapRef}>
        <canvas ref={cvRef} width={cvSize.w} height={cvSize.h}
          className="wm-canvas"
          style={{cursor:panR.current?.dn?'grabbing':'default'}}
          onMouseDown={onMD} onMouseMove={onMM} onMouseUp={onMU} onMouseLeave={onML}
        />
        {/* 顶部状态栏 */}
        <div className="wm-topbar">
          <div className="wm-topbar-l">
            <span className="wm-badge">🌐 BSC 大陆</span>
            <span className="wm-minted">已铸造 <b>{minted}</b> / 10,000</span>
            {loading&&<span className="wm-spin-wrap"><span className="wm-spinner"/>刷新中</span>}
          </div>
          <div className="wm-topbar-r">
            <div className="wm-filters">
              {[['all','全部'],['mine','我的'],['auction','拍卖中']].map(([v,l])=>(
                <button key={v} className={`wm-filter${filter===v?' on':''}`} onClick={()=>setFilter(v)}>{l}</button>
              ))}
            </div>
          </div>
        </div>
        {/* 缩放 */}
        <div className="wm-zoom-ctrl">
          <button className="wm-zoom-btn" onClick={zI}>＋</button>
          <button className="wm-zoom-btn" onClick={zO}>－</button>
          <button className="wm-zoom-btn" onClick={zR}>⊙</button>
        </div>
        {/* 图例 */}
        <div className="wm-legend">
          {LEGEND.map(([c,l])=>(
            <span key={l} className="wm-leg-item">
              <i className="wm-leg-dot" style={{background:c}}/>
              {l}
            </span>
          ))}
        </div>
        {/* Hover tooltip */}
        {hovCell&&(
          <div className="wm-tooltip" style={{left:hovPos.x+14,top:hovPos.y-36}}>
            ({hovCell.col},{hovCell.row})
            {hovCell.isMe?' ★ 我的':hovCell.auc?' 🔨拍卖':hovCell.own?' 已有主':' 未铸造'}
          </div>
        )}
      </div>

      {/* 右侧详情面板 */}
      {sel!=null&&(
        <aside className="wm-panel">
          <div className="wm-panel-head">
            <span className="wm-panel-id">土地 #{sel}</span>
            {selOwner&&<span className={`wm-panel-tag${isMe?' me':selAuc?' auc':''}`}>
              {isMe?'⭐ 我的':selAuc?'🔨 拍卖中':'已有主'}
            </span>}
            <button className="wm-panel-close" onClick={()=>setSel(null)}>✕</button>
          </div>
          <div className="wm-panel-body">
            <div className="wm-sec">
              <div className="wm-sec-title">属性 (ATTRIBUTES)</div>
              <div className="wm-kv"><span>类型</span><span>{selOwner?'普通地块':'未铸造'}</span></div>
              <div className="wm-kv"><span>坐标</span><span>({selCol}, {selRow})</span></div>
              <div className="wm-kv"><span>大陆</span><span>BSC 测试网</span></div>
              <div className="wm-kv"><span>所有者</span>
                {selOwner?<a className="wm-addr" href={`https://testnet.bscscan.com/address/${selOwner}`} target="_blank" rel="noreferrer">{fmtAddr(selOwner)}</a>:<span className="wm-dim">—</span>}
              </div>
            </div>
            {selAuc&&(
              <div className="wm-sec">
                <div className="wm-sec-title">拍卖 (AUCTION)</div>
                <div className="wm-kv"><span>起拍价</span><span>{fmtRing(selAuc.startPrice)} RING</span></div>
                <div className="wm-kv"><span>底价</span><span>{fmtRing(selAuc.endPrice)} RING</span></div>
                <div className="wm-kv"><span>当前价</span><span className="wm-price-val">{fmtRing(selPrice)} RING</span></div>
                {!isMe&&<button className="wm-btn-buy" onClick={()=>window.dispatchEvent(new CustomEvent('nav',{detail:{page:'market',tab:'land'}}))}>💰 购买</button>}
              </div>
            )}
            <div className="wm-sec">
              <div className="wm-sec-title">信息 (INFORMATION)</div>
              <div className="wm-kv-col">
                <span style={{color:'#5040a0',fontSize:'.7rem'}}>介绍</span>
                <span style={{color:'#9080b0',fontSize:'.72rem'}}>空空如也</span>
              </div>
            </div>
            <div className="wm-sec">
              <div className="wm-sec-title">资源 (RESOURCES) <span className="wm-hint">每日最大挖矿量</span></div>
              {selOwner
                ?ELEMS.map((el,i)=>(
                  <div key={el.k} className="wm-res">
                    <span className="wm-res-ico">{el.i}</span>
                    <span className="wm-res-k" style={{color:el.c}}>{el.k}</span>
                    <div className="wm-bar"><div style={{width:`${(selVals[i]/maxV*100).toFixed(0)}%`,background:el.c}}/></div>
                    <span className="wm-res-v">{selVals[i]}</span>
                  </div>
                ))
                :<div className="wm-dim" style={{fontSize:'.8rem'}}>铸造后显示属性</div>
              }
            </div>
            {selOwner&&selRewards.length>0&&(
              <div className="wm-sec">
                <div className="wm-sec-title">已挖资源 (MINED)</div>
                {ELEMS.map((el,i)=>(
                  <div key={el.k} className="wm-res">
                    <span className="wm-res-ico">{el.i}</span>
                    <span className="wm-res-k" style={{color:el.c}}>{el.k}</span>
                    <span className="wm-res-v" style={{marginLeft:'auto'}}>{fmtRing(selRewards[i])}</span>
                  </div>
                ))}
                {isMe&&<button className="wm-btn-claim" onClick={()=>handleClaim(sel)}>💰 领取资源 (Claim)</button>}
              </div>
            )}
            <div className="wm-sec">
              <div className="wm-sec-title">
                使徒工作区 (APOSTLE WORKSPACE)
                {isMe&&<button className="wm-btn-sm" onClick={()=>openPicker('apostle')}>＋ 放置</button>}
              </div>
              <div className="wm-slots">
                {[0,1,2,3,4].map(i=>{const s=selSlots[i];
                  // 每个槽位平均分配待领取的挖矿量（该使徒主元素对应资源）
                  const slotCnt = selSlots.length
                  const reward = (s && selRewards.length>0 && slotCnt>0)
                    ? (Number(selRewards[s.apoElem??0]) / slotCnt / 1e18).toFixed(2)
                    : null
                  return(
                  <div key={i} className={`wm-slot${s?' used':''}`} onClick={()=>(!s&&isMe)?openPicker('apostle'):null}>
                    {s?(
                      <div className="wm-slot-inner">
                        <img src={APO_EGG_GIF} style={{width:36,height:36,filter:s.apoElem!=null?`hue-rotate(${s.apoElem*72}deg) saturate(1.5)`:''}}/>
                        <div className="wm-slot-lbl">#{s.apostleId.toString()}</div>
                        {reward&&<div className="wm-slot-rate" style={{color:ELEMS[s.apoElem??0]?.c}}>
                          <span>{ELEMS[s.apoElem??0]?.i}</span>{reward}
                        </div>}
                        {isMe&&<button className="wm-slot-stop" onClick={e=>{e.stopPropagation();handleStopMining(sel,s.apostleId)}}>×</button>}
                      </div>
                    ):<div className="wm-slot-add">{isMe?'＋':'—'}</div>}
                  </div>
                )})}
              </div>
            </div>
            <div className="wm-sec">
              <div className="wm-sec-title">钻头工作区 (DRILLS WORKSPACE)</div>
              <div className="wm-slots">
                {[0,1,2,3,4].map(i=>{const s=selSlots[i];return(
                  <div key={i} className={`wm-slot${s?' used':''}`}>
                    {s&&s.drillId>0n?(
                      <div className="wm-slot-inner">
                        <img src={drillImgUrl(s.drillElem||0, s.drillTier||1)} style={{width:36,height:36,objectFit:'contain'}}/>
                        <div className="wm-slot-lbl">#{s.drillId.toString()}</div>
                        <div style={{fontSize:'.6rem',color:ELEMS[s.drillElem||0]?.c}}>{'★'.repeat(s.drillTier||1)}</div>
                      </div>
                    ):<div className="wm-slot-add" style={{opacity:.3}}>—</div>}
                  </div>
                )})}
              </div>
            </div>
            {isMe&&(
              <div className="wm-sec" style={{paddingBottom:'.5rem'}}>
                <button className="wm-btn-claim" onClick={()=>handleClaim(sel)}>💰 领取资源 (Claim)</button>
              </div>
            )}
            {/* 放置选择器弹窗 */}
            {picker&&(
              <div className="wm-picker-overlay" onClick={()=>{setPicker(null);window._selApo=null;window._selDrl=null}}>
                <div className="wm-picker" onClick={e=>e.stopPropagation()}>
                  <div className="wm-picker-head">
                    {picker==='apostle'&&'选择使徒（必选）'}
                    {picker==='drill-optional'&&`为使徒 #${window._selApo?.id} 选择钻头（可选）`}
                    <button onClick={()=>{setPicker(null);window._selApo=null;window._selDrl=null}}>✕</button>
                  </div>
                  {pickerMsg&&<div className="wm-picker-msg" style={{color:pickerMsg.startsWith('❌')?'#f06070':'#9070d0'}}>{pickerMsg}</div>}
                  {/* 钻头可选时显示"不带钻头"按钮 */}
                  {picker==='drill-optional'&&(
                    <div style={{padding:'.5rem 1rem .25rem',borderBottom:'1px solid #2a2040'}}>
                      <button style={{width:'100%',padding:'.4rem',background:'#2a1a40',border:'1px solid #5040a0',borderRadius:8,color:'#a080d0',fontSize:'.8rem',cursor:'pointer'}}
                        onClick={placeWithoutDrill}>
                        ⚡ 不带钻头，直接放置使徒
                      </button>
                    </div>
                  )}
                  {pickerItems.length===0&&!pickerMsg.includes('扫描')
                    ?<div style={{padding:'1rem',color:'#5040a0',textAlign:'center'}}>
                        {picker==='apostle'?'钱包中无可用使徒':'钱包中无可用钻头'}
                      </div>
                    :<div className="wm-picker-grid">
                      {pickerItems.map(item=>(
                        <div key={item.id} className="wm-picker-item" onClick={()=>handlePlace(item)}
                          style={{borderColor:item.elem!=null?ELEMS[item.elem||0].c+'33':undefined}}>
                          <img src={
                            picker==='apostle' ? APO_EGG_GIF : drillImgUrl(item.elem||0,item.tier||1)
                          } style={{width:40,height:40,objectFit:'contain',imageRendering:'pixelated',
                            filter:picker==='apostle'?`hue-rotate(${(item.elem||0)*72}deg) saturate(1.3)`:''}}/>
                          <div style={{fontSize:'.7rem',color:'#c090ff'}}>#{item.id}</div>
                          <div style={{fontSize:'.65rem',color:ELEMS[item.elem||0].c,display:'flex',alignItems:'center',gap:2}}>
                            <img src={ELEM_SVGS[item.elem||0]} style={{width:10,height:10}}/>{ELEMS[item.elem||0].k}
                            {item.strength!=null&&` 力${item.strength}`}
                            {item.tier!=null&&` ${'★'.repeat(item.tier)}`}
                          </div>
                        </div>
                      ))}
                    </div>
                  }
                </div>
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  )
}
