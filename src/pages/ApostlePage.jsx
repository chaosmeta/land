// src/pages/ApostlePage.jsx — 使徒+繁殖（中英双语+成体图片修复）
import { useState, useEffect, useCallback } from 'react'
import { usePublicClient, useAccount, useWalletClient } from '../contexts/WalletContext.jsx'
import { useLang } from '../contexts/LangContext.jsx'
import { formatEther, encodeFunctionData } from 'viem'
import { CONTRACTS } from '../constants/contracts'
import { APO_EGG_GIF, apostleImgUrl, ELEM_SVGS, ELEMS } from '../constants/images'
import './ApostlePage.css'

const APO_ABI = [
  {type:'function',name:'nextId',inputs:[],outputs:[{type:'uint256'}],stateMutability:'view'},
  {type:'function',name:'ownerOf',inputs:[{name:'id',type:'uint256'}],outputs:[{type:'address'}],stateMutability:'view'},
  {type:'function',name:'attrs',inputs:[{name:'id',type:'uint256'}],outputs:[{name:'strength',type:'uint8'},{name:'element',type:'uint8'},{name:'gender',type:'uint8'},{name:'gen',type:'uint16'},{name:'genes',type:'uint64'},{name:'birthTime',type:'uint64'},{name:'cooldown',type:'uint64'},{name:'motherId',type:'uint32'},{name:'fatherId',type:'uint32'}],stateMutability:'view'},
  {type:'function',name:'isAdult',inputs:[{name:'id',type:'uint256'}],outputs:[{type:'bool'}],stateMutability:'view'},
  {type:'function',name:'growthProgress',inputs:[{name:'id',type:'uint256'}],outputs:[{type:'uint8'}],stateMutability:'view'},
  {type:'function',name:'breed',inputs:[{name:'maleId',type:'uint256'},{name:'femaleId',type:'uint256'}],outputs:[{type:'uint256'}],stateMutability:'nonpayable'},
  {type:'function',name:'breedFee',inputs:[],outputs:[{type:'uint256'}],stateMutability:'view'},
  {type:'function',name:'isApprovedForAll',inputs:[{name:'owner',type:'address'},{name:'op',type:'address'}],outputs:[{type:'bool'}],stateMutability:'view'},
  {type:'function',name:'setApprovalForAll',inputs:[{name:'op',type:'address'},{name:'v',type:'bool'}],outputs:[],stateMutability:'nonpayable'},
]
const ERC20_ABI=[{type:'function',name:'approve',inputs:[{name:'s',type:'address'},{name:'a',type:'uint256'}],outputs:[{type:'bool'}],stateMutability:'nonpayable'}]
const GENDER_ICON=['♂️','♀️']
const GENDER_NAME={zh:['雄','雌'],en:['Male','Female']}
const GENDER_COLOR=['#60a0ff','#ff80c0']
function fmtAddr(a){return a?a.slice(0,6)+'…'+a.slice(-4):''}
function fmtTime(ts,lang){const t=Number(ts);if(t===0)return lang==='zh'?'无':'None';const d=new Date(t*1000);return lang==='zh'?d.toLocaleDateString('zh-CN')+' '+d.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}):d.toLocaleDateString('en-US')+' '+d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}
function timeLeft(ts){const left=Number(ts)*1000-Date.now();if(left<=0)return null;const h=Math.floor(left/3600000),m=Math.floor(left%3600000/60000);return h>0?`${h}h${m}m`:`${m}m`}
function ElemIcon({i,size=14}){return <img src={ELEM_SVGS[i]} alt={ELEMS[i].key} style={{width:size,height:size,verticalAlign:'middle'}}/>}

// ── 使徒图片组件 ──────────────────────────────────────────────────────────
// 孵化中 → egg.gif（半透明）
// 已成年 → DiceBear API 按 id+element+gender 生成唯一SVG头像，每个使徒外观不同
function ApostleImg({apo, size=80, style={}}){
  const [err, setErr] = useState(false)
  if (!apo.isAdult) {
    return (
      <img src={APO_EGG_GIF} alt="egg"
        style={{width:size, height:size, opacity:.75, ...style}}/>
    )
  }
  const src = err ? APO_EGG_GIF : apostleImgUrl(apo.id, apo.element, apo.gender)
  return (
    <img src={src} alt={`apostle-${apo.id}`}
      onError={()=>setErr(true)}
      style={{
        width:size, height:size,
        borderRadius: style.borderRadius ?? '50%',
        background: ELEMS[apo.element].color+'22',
        ...style
      }}/>
  )
}

function ApostleCard({apo,isMe,onBreed,onDetail,lang}){
  const adult=apo.isAdult,coolLeft=timeLeft(apo.cooldown),progress=apo.growth||0
  const gName=GENDER_NAME[lang][apo.gender],elemName=lang==='zh'?ELEMS[apo.element].name:ELEMS[apo.element].nameEn
  return(
    <div className="ap-card" onClick={()=>onDetail&&onDetail(apo)} style={{borderColor:isMe?(adult?GENDER_COLOR[apo.gender]+'88':'#7040c088'):'#2a1a40'}}>
      <div className="ap-card-img-wrap" style={{background:`linear-gradient(135deg,${ELEMS[apo.element].color}22,#0a0814)`}}>
        <ApostleImg apo={apo} size={72} style={{borderRadius:adult?'50%':8}}/>
        {!adult&&<div className="ap-growth-bar"><div style={{width:`${progress}%`,background:'#c090ff',height:'100%',borderRadius:2}}/></div>}
        <div className="ap-card-badge" style={{background:adult?GENDER_COLOR[apo.gender]+'cc':'#60408088'}}>{adult?`${GENDER_ICON[apo.gender]}${gName}`:`🥚 ${progress}%`}</div>
        {apo.inMining&&<div className="ap-card-mining">⛏️</div>}
      </div>
      <div className="ap-card-body">
        <div className="ap-card-id">#{apo.id} <span className="ap-card-gen">G{apo.gen}</span></div>
        <div style={{fontSize:'.7rem',color:ELEMS[apo.element].color}}><ElemIcon i={apo.element} size={11}/>{elemName} · {lang==='zh'?'力量':'STR'}{apo.strength}</div>
        {isMe?<div style={{fontSize:'.62rem',color:'#52c462',marginTop:2}}>⭐ {lang==='zh'?'我的':'Mine'}</div>:<div style={{fontSize:'.62rem',color:'#5040a0',marginTop:2,fontFamily:'monospace'}}>{fmtAddr(apo.owner)}</div>}
        {coolLeft&&<div style={{fontSize:'.65rem',color:'#f0a040'}}>⏳ {lang==='zh'?'冷却':'CD'} {coolLeft}</div>}
        {adult&&isMe&&!apo.inMining&&!coolLeft&&(<button className="ap-breed-btn" onClick={e=>{e.stopPropagation();onBreed(apo)}}>💕 {lang==='zh'?'繁殖':'Breed'}</button>)}
      </div>
    </div>
  )
}

function BreedModal({myApo,onClose,apostles,pc,address,wc,onDone,lang}){
  const [partner,setPartner]=useState(null),[msg,setMsg]=useState(''),[breedFee,setBreedFee]=useState(null)
  const isMale=myApo.gender===0,T=(zh,en)=>lang==='zh'?zh:en,pGender=T(isMale?'雌':'雄',isMale?'Female':'Male')
  const candidates=apostles.filter(a=>a.id!==myApo.id&&a.owner?.toLowerCase()===address?.toLowerCase()&&a.gender!==myApo.gender&&a.isAdult&&Number(a.cooldown)*1000<Date.now())
  useEffect(()=>{if(!pc)return;pc.readContract({address:CONTRACTS.apostle,abi:APO_ABI,functionName:'breedFee'}).then(f=>setBreedFee(f)).catch(()=>{})},[pc])
  async function doBreed(){
    if(!wc||!partner)return
    const maleId=isMale?myApo.id:partner.id,femaleId=isMale?partner.id:myApo.id
    setMsg(T('检查授权...','Checking approval...'))
    try{
      if(breedFee>0n){setMsg(`${T('授权','Approve')} ${formatEther(breedFee)} RING...`);const h=await wc.sendTransaction({to:CONTRACTS.ring,data:encodeFunctionData({abi:ERC20_ABI,functionName:'approve',args:[CONTRACTS.apostle,breedFee]})});await pc.waitForTransactionReceipt({hash:h})}
      setMsg(T('繁殖中...','Breeding...'))
      const h=await wc.sendTransaction({to:CONTRACTS.apostle,data:encodeFunctionData({abi:APO_ABI,functionName:'breed',args:[BigInt(maleId),BigInt(femaleId)]})})
      await pc.waitForTransactionReceipt({hash:h})
      setMsg(T('🎉 繁殖成功！新使徒正在孵化...','🎉 Breed success! New apostle hatching...'))
      setTimeout(()=>{onClose();onDone&&onDone()},2000)
    }catch(e){setMsg('❌ '+(e.shortMessage||e.message))}
  }
  return(
    <div className="ap-modal-bg" onClick={onClose}>
      <div className="ap-modal" onClick={e=>e.stopPropagation()}>
        <div className="ap-modal-head"><span>💕 {T('繁殖','Breed')} — {GENDER_ICON[myApo.gender]}{T(GENDER_NAME.zh[myApo.gender],GENDER_NAME.en[myApo.gender])} #{myApo.id}</span><button onClick={onClose}>✕</button></div>
        {msg&&<div className="ap-modal-msg">{msg}</div>}
        {!partner?(<>
          <div style={{padding:'.6rem 1rem .3rem',fontSize:'.78rem',color:'#9070d0'}}>{T(`选择我的${pGender}使徒配对（已成年、无冷却）：`,`Select my ${pGender} apostle (adult, no cooldown):`)}</div>
          {candidates.length===0
            ?<div style={{padding:'1.5rem',textAlign:'center',color:'#5040a0'}}>{T(`暂无可配对的${pGender}使徒`,`No available ${pGender} apostle`)}<br/><span style={{fontSize:'.72rem'}}>{T('需要已成年（孵化7天后）且无冷却期','Must be adult (7d after hatch) and no cooldown')}</span></div>
            :<div className="ap-modal-grid">{candidates.map(a=>(<div key={a.id} className="ap-modal-item" onClick={()=>setPartner(a)}><ApostleImg apo={a} size={38}/><div style={{fontSize:'.72rem',color:'#c090ff'}}>#{a.id} G{a.gen}</div><div style={{fontSize:'.65rem',color:ELEMS[a.element].color}}><ElemIcon i={a.element} size={11}/>{lang==='zh'?ELEMS[a.element].name:ELEMS[a.element].nameEn} {T('力','STR')}{a.strength}</div></div>))}</div>
          }
        </>):(<div style={{padding:'1rem'}}>
          <div style={{display:'flex',alignItems:'center',gap:'1.5rem',justifyContent:'center',marginBottom:'1rem'}}>
            <div style={{textAlign:'center'}}><ApostleImg apo={myApo} size={56}/><div style={{fontSize:'.75rem',color:'#c090ff'}}>#{myApo.id} {GENDER_ICON[myApo.gender]}</div><div style={{fontSize:'.68rem',color:ELEMS[myApo.element].color}}>{T('力','STR')}{myApo.strength} G{myApo.gen}</div></div>
            <div style={{fontSize:'1.5rem',color:'#c090ff'}}>💕</div>
            <div style={{textAlign:'center'}}><ApostleImg apo={partner} size={56}/><div style={{fontSize:'.75rem',color:'#c090ff'}}>#{partner.id} {GENDER_ICON[partner.gender]}</div><div style={{fontSize:'.68rem',color:ELEMS[partner.element].color}}>{T('力','STR')}{partner.strength} G{partner.gen}</div></div>
          </div>
          <div style={{background:'#16121e',borderRadius:10,padding:'.7rem',marginBottom:'1rem',fontSize:'.75rem',color:'#9080b0'}}>
            <div>{T('后代代数：','Offspring Gen:')}<b style={{color:'#c090ff'}}>G{Math.max(myApo.gen,partner.gen)+1}</b></div>
            <div>{T('预计力量：','Est. STR:')}<b style={{color:'#f0c040'}}>{Math.floor((myApo.strength+partner.strength)/2-15)} ~ {Math.min(Math.floor((myApo.strength+partner.strength)/2+15),100)}</b></div>
            <div>{T('元素：','Element:')}<b style={{color:ELEMS[myApo.element].color}}>{lang==='zh'?ELEMS[myApo.element].name:ELEMS[myApo.element].nameEn}</b>{T(' 或 ',' or ')}<b style={{color:ELEMS[partner.element].color}}>{lang==='zh'?ELEMS[partner.element].name:ELEMS[partner.element].nameEn}</b></div>
            <div>{T('繁殖费：','Breed Fee:')}<b style={{color:'#f0c040'}}>{breedFee?formatEther(breedFee):'1'} RING</b></div>
            <div style={{color:'#6050a0',marginTop:4}}>{T('孵化期：7天后成年','Hatch: adult after 7 days')}</div>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button className="ap-btn-primary" onClick={doBreed}>✅ {T('确认繁殖','Confirm Breed')}</button>
            <button className="ap-btn-secondary" onClick={()=>setPartner(null)}>← {T('重选','Reselect')}</button>
          </div>
        </div>)}
      </div>
    </div>
  )
}

export default function ApostlePage(){
  const pc=usePublicClient(),{address}=useAccount(),{data:wc}=useWalletClient()
  const {lang}=useLang(),T=(zh,en)=>lang==='zh'?zh:en
  const [apostles,setApostles]=useState([]),[loading,setLoading]=useState(true),[filter,setFilter]=useState('mine'),[breedApo,setBreedApo]=useState(null),[detailApo,setDetailApo]=useState(null)
  useEffect(()=>{setFilter(address?'mine':'all')},[address])
  const load=useCallback(async()=>{
    if(!pc){setLoading(false);return}
    setLoading(true)
    try{
      const nextId=await pc.readContract({address:CONTRACTS.apostle,abi:APO_ABI,functionName:'nextId'})
      const total=Number(nextId)-1
      if(total<=0){setApostles([]);setLoading(false);return}
      const BATCH=50,items=[]
      for(let s=1;s<=total;s+=BATCH){
        const ids=Array.from({length:Math.min(BATCH,total-s+1)},(_,i)=>s+i)
        const [attrRes,ownerRes,adultRes,growthRes]=await Promise.all([
          pc.multicall({contracts:ids.map(id=>({address:CONTRACTS.apostle,abi:APO_ABI,functionName:'attrs',args:[BigInt(id)]})),allowFailure:true}),
          pc.multicall({contracts:ids.map(id=>({address:CONTRACTS.apostle,abi:[{type:'function',name:'ownerOf',inputs:[{name:'id',type:'uint256'}],outputs:[{type:'address'}],stateMutability:'view'}],functionName:'ownerOf',args:[BigInt(id)]})),allowFailure:true}),
          pc.multicall({contracts:ids.map(id=>({address:CONTRACTS.apostle,abi:APO_ABI,functionName:'isAdult',args:[BigInt(id)]})),allowFailure:true}),
          pc.multicall({contracts:ids.map(id=>({address:CONTRACTS.apostle,abi:APO_ABI,functionName:'growthProgress',args:[BigInt(id)]})),allowFailure:true}),
        ])
        ids.forEach((id,i)=>{
          const a=attrRes[i]?.result;if(!a)return
          const owner=ownerRes[i]?.result,inMining=owner?.toLowerCase()===CONTRACTS.mining.toLowerCase()
          items.push({id,owner,strength:Number(a[0]),element:Number(a[1]),gender:Number(a[2]),gen:Number(a[3]),genes:a[4],birthTime:a[5],cooldown:a[6],motherId:Number(a[7]),fatherId:Number(a[8]),isAdult:adultRes[i]?.result??false,growth:Number(growthRes[i]?.result??0),inMining,landId:0n,isMe:owner?.toLowerCase()===address?.toLowerCase()||inMining})
        })
      }
      setApostles(items)
    }catch(e){console.error(e)}
    setLoading(false)
  },[pc,address])
  useEffect(()=>{load()},[load])
  const filtered=apostles.filter(a=>{
    if(filter==='mine') return a.owner?.toLowerCase()===address?.toLowerCase()||a.inMining
    if(filter==='male') return a.gender===0&&a.isAdult
    if(filter==='female') return a.gender===1&&a.isAdult
    if(filter==='egg') return !a.isAdult
    if(filter==='adult') return a.isAdult
    return true
  })
  const myCount=apostles.filter(a=>a.isMe).length
  const filterTabs=[['mine',T('⭐ 我的','⭐ Mine')],['all',T('全部','All')],['adult',T('已成体','Adult')],['egg',T('孵化中','Hatching')],['male','♂ '+T('雄','Male')],['female','♀ '+T('雌','Female')]]
  return(
    <div className="ap-root">
      <div className="ap-header">
        <h1 className="ap-title">🧙 {T('使徒','Apostle')}</h1>
        <div className="ap-stats">
          <span className="ap-stat-tag" style={{color:'#f0c040'}}>{T('总计','Total')}: {apostles.length}</span>
          {address&&<span className="ap-stat-tag" style={{color:'#52c462'}}>{T('我的','Mine')}: {myCount}</span>}
          <span className="ap-stat-tag" style={{color:'#52c462'}}>{T('成体','Adult')}: {apostles.filter(a=>a.isAdult).length}</span>
          <span className="ap-stat-tag" style={{color:'#c090ff'}}>{T('孵化中','Hatching')}: {apostles.filter(a=>!a.isAdult).length}</span>
        </div>
      </div>
      <div className="ap-info-card">
        <div className="ap-info-row">
          <span>🥚 {T('铸造后孵化','Mint→Hatch')}</span><span>→</span>
          <span>⏳ {T('7天成年','7 Days')}</span><span>→</span>
          <span>💕 {T('雄♂+雌♀繁殖','♂+♀ Breed')}</span><span>→</span>
          <span>🧬 {T('后代代数+1','Gen+1')}</span>
        </div>
        <div style={{fontSize:'.72rem',color:'#4030a0',marginTop:6,textAlign:'center'}}>{T('使徒大厅显示链上所有使徒 · 绿色「⭐ 我的」= 属于当前钱包','All on-chain apostles · Green ⭐ Mine = current wallet')}</div>
      </div>
      <div className="ap-filters">
        {filterTabs.map(([v,l])=>(<button key={v} className={`ap-filter-btn${filter===v?' on':''}`} onClick={()=>setFilter(v)}>{l}</button>))}
        <button className="ap-filter-btn" style={{marginLeft:'auto'}} onClick={load}>🔄</button>
      </div>
      {filter==='mine'&&!address&&<div style={{textAlign:'center',color:'#5040a0',padding:'2rem',fontSize:'.85rem'}}>{T('请先连接钱包查看你的使徒','Please connect wallet to view your apostles')}</div>}
      {loading?<div className="ap-loading"><span className="ap-spin"/>{T('加载中...','Loading...')}</div>
        :filtered.length===0?<div className="ap-empty">{filter==='mine'&&address?T('你还没有使徒，去盲盒页购买吧','No apostles yet, buy from BlindBox'):T('暂无使徒','No apostles found')}</div>
        :<div className="ap-grid">{filtered.map(a=>(<ApostleCard key={a.id} apo={a} isMe={a.isMe} lang={lang} onBreed={()=>setBreedApo(a)} onDetail={setDetailApo}/>))}</div>
      }
      {detailApo&&(
        <div className="ap-modal-bg" onClick={()=>setDetailApo(null)}>
          <div className="ap-modal" onClick={e=>e.stopPropagation()}>
            <div className="ap-modal-head"><span>{T('使徒','Apostle')} #{detailApo.id}</span><button onClick={()=>setDetailApo(null)}>✕</button></div>
            <div style={{padding:'1rem',display:'flex',gap:'1rem'}}>
              <ApostleImg apo={detailApo} size={90} style={{borderRadius:detailApo.isAdult?'50%':10}}/>
              <div style={{flex:1,display:'flex',flexDirection:'column',gap:6,fontSize:'.78rem',color:'#9080b0'}}>
                <div><b style={{color:'#c090ff'}}>#{detailApo.id}</b> — G{detailApo.gen}</div>
                <div>{GENDER_ICON[detailApo.gender]}{T(GENDER_NAME.zh[detailApo.gender],GENDER_NAME.en[detailApo.gender])} · <ElemIcon i={detailApo.element} size={12}/>{lang==='zh'?ELEMS[detailApo.element].name:ELEMS[detailApo.element].nameEn}{T('系 · 力量','· STR')}{detailApo.strength}</div>
                <div style={{color:detailApo.isAdult?'#52c462':'#c090ff'}}>{detailApo.isAdult?T('✅ 已成年','✅ Adult'):`🥚 ${T('孵化中','Hatching')} ${detailApo.growth}%`}</div>
                <div>{T('持有者：','Owner: ')}<span style={{fontFamily:'monospace',fontSize:'.72rem',color:detailApo.isMe?'#52c462':'#7060a0'}}>{detailApo.isMe?`⭐ ${T('我的','Mine')}`:fmtAddr(detailApo.owner)}</span></div>
                <div>{T('生日：','Birthday: ')}{fmtTime(detailApo.birthTime,lang)}</div>
                {Number(detailApo.cooldown)*1000>Date.now()&&<div style={{color:'#f0a040'}}>⏳ {T('繁殖冷却：','Breed CD: ')}{timeLeft(detailApo.cooldown)}</div>}
                {detailApo.motherId>0&&<div>{T('母亲：使徒','Mother: Apostle')} #{detailApo.motherId}</div>}
                {detailApo.fatherId>0&&<div>{T('父亲：使徒','Father: Apostle')} #{detailApo.fatherId}</div>}
                <div style={{color:'#4030a0',fontSize:'.65rem'}}>{T('基因：','Genes: ')}0x{BigInt(detailApo.genes).toString(16).padStart(16,'0')}</div>
              </div>
            </div>
            {detailApo.isAdult&&detailApo.isMe&&Number(detailApo.cooldown)*1000<Date.now()&&(
              <div style={{padding:'0 1rem 1rem'}}><button className="ap-btn-primary" style={{width:'100%'}} onClick={()=>{setDetailApo(null);setBreedApo(detailApo)}}>💕 {T('去繁殖','Go Breed')}</button></div>
            )}
          </div>
        </div>
      )}
      {breedApo&&<BreedModal myApo={breedApo} apostles={apostles} lang={lang} onClose={()=>setBreedApo(null)} pc={pc} address={address} wc={wc} onDone={load}/>}
    </div>
  )
}
