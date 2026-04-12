import { useState, useEffect } from 'react'
import { usePublicClient, useAccount, useWalletClient } from '../contexts/WalletContext.jsx'
import { useLang } from '../contexts/LangContext.jsx'
import { formatEther, encodeFunctionData } from 'viem'
import { CONTRACTS } from '../constants/contracts'
import { APO_EGG_GIF, drillImgUrl, ELEM_SVGS, ELEMS } from '../constants/images'
import './BlindBoxPage.css'

const BB_ABI=[
  {type:'function',name:'apostleBoxPrice',inputs:[],outputs:[{type:'uint256'}],stateMutability:'view'},
  {type:'function',name:'drillBoxPrice',inputs:[],outputs:[{type:'uint256'}],stateMutability:'view'},
  {type:'function',name:'buyApostleBox',inputs:[],outputs:[{type:'uint256'}],stateMutability:'nonpayable'},
  {type:'function',name:'buyDrillBox',inputs:[],outputs:[{type:'uint256'}],stateMutability:'nonpayable'},
]
const ERC20_ABI=[{type:'function',name:'approve',inputs:[{name:'s',type:'address'},{name:'a',type:'uint256'}],outputs:[{type:'bool'}],stateMutability:'nonpayable'}]
const APO_ABI=[{type:'function',name:'attrs',inputs:[{name:'id',type:'uint256'}],outputs:[{name:'strength',type:'uint8'},{name:'element',type:'uint8'}],stateMutability:'view'}]
const DRL_ABI=[{type:'function',name:'attrs',inputs:[{name:'id',type:'uint256'}],outputs:[{name:'tier',type:'uint8'},{name:'affinity',type:'uint8'}],stateMutability:'view'}]

function fmtR(w){return w?Number(formatEther(w)).toFixed(2):'…'}

export default function BlindBoxPage(){
  const pc=usePublicClient(),{address}=useAccount(),{data:wc}=useWalletClient()
  const {t,lang}=useLang()
  const [apoPx,setApoPx]=useState(null)
  const [drlPx,setDrlPx]=useState(null)
  const [buying,setBuying]=useState(null)
  const [msg,setMsg]=useState('')
  const [count,setCount]=useState(1)
  const [results,setResults]=useState([])

  useEffect(()=>{
    if(!pc)return
    Promise.all([
      pc.readContract({address:CONTRACTS.blindbox,abi:BB_ABI,functionName:'apostleBoxPrice'}).catch(()=>null),
      pc.readContract({address:CONTRACTS.blindbox,abi:BB_ABI,functionName:'drillBoxPrice'}).catch(()=>null),
    ]).then(([a,d])=>{setApoPx(a);setDrlPx(d)})
  },[pc])

  async function buyBox(type){
    if(!wc||!address){alert(t('请先连接钱包','Please connect wallet'));return}
    const price=type==='apostle'?apoPx:drlPx
    if(!price)return
    const total=price*BigInt(count)
    setBuying(type);setMsg(t(`授权 ${fmtR(total)} RING...`,`Approving ${fmtR(total)} RING...`))
    try{
      const h1=await wc.sendTransaction({to:CONTRACTS.ring,data:encodeFunctionData({abi:ERC20_ABI,functionName:'approve',args:[CONTRACTS.blindbox,total]})})
      await pc.waitForTransactionReceipt({hash:h1})
      const buyFn=type==='apostle'?'buyApostleBox':'buyDrillBox'
      const nftAddr=(type==='apostle'?CONTRACTS.apostle:CONTRACTS.drill).toLowerCase()
      const allNewIds=[]
      for(let i=0;i<count;i++){
        const typeName=t(type==='apostle'?'使徒':'钻头',type)
        setMsg(t(`开启第 ${i+1}/${count} 个${typeName}盲盒...`,`Opening ${i+1}/${count} ${type} box...`))
        const h=await wc.sendTransaction({to:CONTRACTS.blindbox,data:encodeFunctionData({abi:BB_ABI,functionName:buyFn,args:[]})})
        const receipt=await pc.waitForTransactionReceipt({hash:h})
        const ids=receipt.logs.filter(l=>l.address.toLowerCase()===nftAddr).map(l=>{try{return Number(BigInt(l.topics[3]))}catch{return null}}).filter(Boolean)
        allNewIds.push(...ids)
      }
      if(allNewIds.length>0){
        const attrRes=await pc.multicall({contracts:allNewIds.map(id=>({address:type==='apostle'?CONTRACTS.apostle:CONTRACTS.drill,abi:type==='apostle'?APO_ABI:DRL_ABI,functionName:'attrs',args:[BigInt(id)]})),allowFailure:true})
        const newResults=allNewIds.map((id,i)=>{const at=attrRes[i]?.result;return type==='apostle'?{type,id,strength:at?Number(at[0]):30,elem:at?Number(at[1]):0}:{type,id,tier:at?Number(at[0]):1,elem:at?Number(at[1]):0}})
        setResults(r=>[...newResults,...r].slice(0,20))
        const typeName=t(type==='apostle'?'使徒':'钻头',type==='apostle'?'apostle(s)':'drill(s)')
        setMsg(t(`🎉 获得 ${allNewIds.length} 个${typeName}！`,`🎉 Got ${allNewIds.length} ${typeName}!`))
      }else{
        setMsg(t('✅ 购买成功！去资产页查看','✅ Success! Check Assets page'))
      }
    }catch(e){setMsg('❌ '+(e.shortMessage||e.message))}
    finally{setBuying(null)}
  }

  const RARITY_APO=[
    [t('新手','Common'),  t('1-30力量','STR 1-30'),  '30%','#888899'],
    [t('普通','Rare'),    t('31-60力量','STR 31-60'), '55%','#cc99ff'],
    [t('精英','Epic'),    t('61-84力量','STR 61-84'), '13%','#55aaff'],
    [t('传奇','Legend'),  t('85-100力量','STR 85-100'),'2%','#ffcc44'],
  ]
  const RARITY_DRL=[
    ['1'+t('星','★'),'⭐','35%'],['2'+t('星','★'),'⭐⭐','30%'],
    ['3'+t('星','★'),'⭐⭐⭐','20%'],['4'+t('星','★'),'⭐⭐⭐⭐','10%'],
    ['5'+t('星','★'),'⭐⭐⭐⭐⭐','5%'],
  ]

  return(
    <div className="bb-root">
      <div className="bb-header">
        <h1 className="bb-title">{t('🎁 神秘盲盒','🎁 Mystery Box')}</h1>
        <p className="bb-subtitle">{t('随机获得使徒或钻头 NFT · 直接铸造到钱包','Randomly get Apostle or Drill NFT · Minted to wallet')}</p>
      </div>
      {!address&&<div className="bb-warn">{t('⚠️ 请先连接钱包','⚠️ Please connect wallet')}</div>}
      {msg&&<div className="bb-msg">{msg}</div>}

      <div style={{display:'flex',gap:8,justifyContent:'center',marginBottom:'1rem'}}>
        <span style={{color:'#9080b0',fontSize:'.8rem',alignSelf:'center'}}>{t('数量：','Qty:')}</span>
        {[1,5,10].map(n=>(
          <button key={n} onClick={()=>setCount(n)}
            style={{padding:'4px 12px',borderRadius:8,border:`1px solid ${count===n?'var(--primary)':'#3a2860'}`,background:count===n?'var(--primary)22':'none',color:count===n?'var(--primary)':'#9080b0',cursor:'pointer',fontFamily:'inherit',fontSize:'.82rem'}}>
            {n}{t('个','')}
          </button>
        ))}
      </div>

      <div className="bb-cards">
        <div className="bb-card apostle">
          <div className="bb-card-glow"/>
          <div className="bb-img-wrap"><img src={APO_EGG_GIF} alt="apostle" className="bb-img"/></div>
          <div className="bb-name">{t('🧙 使徒盲盒','🧙 Apostle Box')}</div>
          <div className="bb-desc">{t('随机元素 · 力量1-100 · 当场铸造','Random element · STR 1-100 · Instant mint')}</div>
          <div className="bb-price-row">
            <span className="bb-price-label">{t('价格','Price')}</span>
            <span className="bb-price-val">{apoPx?fmtR(apoPx*BigInt(count)):'…'} RING × {count}</span>
          </div>
          <button className="bb-buy-btn" onClick={()=>buyBox('apostle')} disabled={!address||buying==='apostle'||!apoPx}>
            {buying==='apostle'?t('开启中...','Opening...'):'🎁 '+t('开盲盒','Open Box')}
          </button>
        </div>
        <div className="bb-card drill">
          <div className="bb-card-glow"/>
          <div className="bb-img-wrap"><img src={drillImgUrl(2,3)} alt="drill" className="bb-img"/></div>
          <div className="bb-name">{t('⛏️ 钻头盲盒','⛏️ Drill Box')}</div>
          <div className="bb-desc">{t('随机亲和 · 1-5星 · 当场铸造','Random affinity · 1-5 star · Instant mint')}</div>
          <div className="bb-price-row">
            <span className="bb-price-label">{t('价格','Price')}</span>
            <span className="bb-price-val">{drlPx?fmtR(drlPx*BigInt(count)):'…'} RING × {count}</span>
          </div>
          <button className="bb-buy-btn" onClick={()=>buyBox('drill')} disabled={!address||buying==='drill'||!drlPx}>
            {buying==='drill'?t('开启中...','Opening...'):'🎁 '+t('开盲盒','Open Box')}
          </button>
        </div>
      </div>

      {results.length>0&&(
        <div style={{marginTop:'1.5rem'}}>
          <div style={{fontSize:'.8rem',color:'#c090ff',fontWeight:700,marginBottom:'.6rem',textAlign:'center'}}>🎉 {t('本次获得','You got')}</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:10,justifyContent:'center'}}>
            {results.map((r,i)=>(
              <div key={i} style={{background:`linear-gradient(135deg,${ELEMS[r.elem].color}22,#0a0814)`,border:`1px solid ${ELEMS[r.elem].color}44`,borderRadius:10,padding:'10px 12px',textAlign:'center',minWidth:90}}>
                <img src={r.type==='apostle'?APO_EGG_GIF:drillImgUrl(r.elem,r.tier||1)} style={{width:44,height:44,objectFit:'contain',filter:r.type==='apostle'?`hue-rotate(${r.elem*72}deg) saturate(1.3)`:''}} alt="nft"/>
                <div style={{fontSize:'.72rem',color:'#c090ff',marginTop:4}}>#{r.id}</div>
                <div style={{fontSize:'.65rem',color:ELEMS[r.elem].color}}>
                  {lang==='zh'?ELEMS[r.elem].name:ELEMS[r.elem].nameEn}
                  {r.type==='apostle'?` ${t('力','STR')}${r.strength}`:` ${'★'.repeat(r.tier||1)}`}
                </div>
              </div>
            ))}
          </div>
          <div style={{textAlign:'center',marginTop:'.8rem'}}>
            <button onClick={()=>window.dispatchEvent(new CustomEvent('nav',{detail:{page:'assets',tab:results[0]?.type==='apostle'?'apostle':'drill'}}))}
              style={{padding:'6px 16px',borderRadius:8,border:'1px solid var(--primary)',background:'var(--primary)22',color:'var(--primary)',cursor:'pointer',fontFamily:'inherit',fontSize:'.8rem'}}>
              {t('去资产页查看全部 →','View all in Assets →')}
            </button>
          </div>
        </div>
      )}

      <div className="bb-odds">
        <div className="bb-odds-title">{t('📊 概率说明','📊 Drop Rates')}</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.6rem 1.5rem',margin:'.5rem 0'}}>
          <div>
            <div style={{fontSize:'.72rem',color:'#a080ee',fontWeight:700,marginBottom:4}}>🧙 {t('使徒稀有度','Apostle Rarity')}</div>
            {RARITY_APO.map(([name,range,prob,color])=>(
              <div key={name} style={{display:'flex',justifyContent:'space-between',fontSize:'.7rem',padding:'2px 0',borderBottom:'1px solid #1a1040'}}>
                <span style={{color}}>{name} <span style={{color:'#5040a0'}}>{range}</span></span>
                <span style={{color,fontWeight:700}}>{prob}</span>
              </div>
            ))}
          </div>
          <div>
            <div style={{fontSize:'.72rem',color:'#a080ee',fontWeight:700,marginBottom:4}}>⛏️ {t('钻头星级','Drill Grade')}</div>
            {RARITY_DRL.map(([name,stars,prob])=>(
              <div key={name} style={{display:'flex',justifyContent:'space-between',fontSize:'.7rem',padding:'2px 0',borderBottom:'1px solid #1a1040'}}>
                <span style={{color:'#c090ff'}}>{name} <span style={{color:'#f0c040',fontSize:'.65rem'}}>{stars}</span></span>
                <span style={{color:'#c090ff',fontWeight:700}}>{prob}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{fontSize:'.68rem',color:'#3a2860',marginTop:'.5rem',textAlign:'center'}}>
          {t('五种元素各占 20% · 高稀有度不保底','5 elements each 20% · No pity system')}
        </div>
      </div>
    </div>
  )
}
