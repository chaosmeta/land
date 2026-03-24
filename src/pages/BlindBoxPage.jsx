import { useState, useEffect } from 'react'
import { usePublicClient, useAccount, useWalletClient } from '../contexts/WalletContext.jsx'
import { formatEther, encodeFunctionData } from 'viem'
import { CONTRACTS } from '../constants/contracts'
import { APO_EGG_GIF, drillImgUrl, ELEM_SVGS, ELEMS } from '../constants/images'
import './BlindBoxPage.css'

const BB_ABI=[
  {type:'function',name:'apostleBoxPrice',inputs:[],outputs:[{type:'uint256'}],stateMutability:'view'},
  {type:'function',name:'drillBoxPrice',inputs:[],outputs:[{type:'uint256'}],stateMutability:'view'},
  {type:'function',name:'buyApostleBox',inputs:[],outputs:[{type:'uint256'}],stateMutability:'nonpayable'},
  {type:'function',name:'buyDrillBox',inputs:[],outputs:[{type:'uint256'}],stateMutability:'nonpayable'},
  {type:'function',name:'buyApostleBoxBatch',inputs:[{name:'count',type:'uint256'}],outputs:[],stateMutability:'nonpayable'},
  {type:'function',name:'buyDrillBoxBatch',inputs:[{name:'count',type:'uint256'}],outputs:[],stateMutability:'nonpayable'},
]
const ERC20_ABI=[
  {type:'function',name:'approve',inputs:[{name:'s',type:'address'},{name:'a',type:'uint256'}],outputs:[{type:'bool'}],stateMutability:'nonpayable'},
]
const APO_ABI=[{type:'function',name:'attrs',inputs:[{name:'id',type:'uint256'}],outputs:[{name:'strength',type:'uint8'},{name:'element',type:'uint8'}],stateMutability:'view'}]
const DRL_ABI=[{type:'function',name:'attrs',inputs:[{name:'id',type:'uint256'}],outputs:[{name:'tier',type:'uint8'},{name:'affinity',type:'uint8'}],stateMutability:'view'}]

function ElemIcon({i,size=14}){return <img src={ELEM_SVGS[i]} alt={ELEMS[i].name} style={{width:size,height:size,verticalAlign:'middle',marginRight:2}}/>}
function fmtR(w){return w?Number(formatEther(w)).toFixed(2):'…'}

export default function BlindBoxPage(){
  const pc=usePublicClient(),{address}=useAccount(),{data:wc}=useWalletClient()
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
    if(!wc||!address){alert('请先连接钱包');return}
    const price=type==='apostle'?apoPx:drlPx
    if(!price)return
    const total=price*BigInt(count)
    setBuying(type);setMsg(`授权 ${fmtR(total)} RING...`)
    try{
      const h1=await wc.sendTransaction({to:CONTRACTS.ring,data:encodeFunctionData({abi:ERC20_ABI,functionName:'approve',args:[CONTRACTS.blindbox,total]})})
      await pc.waitForTransactionReceipt({hash:h1})
      setMsg(`开启 ${count} 个${type==='apostle'?'使徒':'钻头'}盲盒...`)
      const fn=count>1?(type==='apostle'?'buyApostleBoxBatch':'buyDrillBoxBatch'):(type==='apostle'?'buyApostleBox':'buyDrillBox')
      const args=count>1?[BigInt(count)]:[]
      const h2=await wc.sendTransaction({to:CONTRACTS.blindbox,data:encodeFunctionData({abi:BB_ABI,functionName:fn,args})})
      const receipt=await pc.waitForTransactionReceipt({hash:h2})
      // 从 Transfer 事件解析 tokenId
      const nftAddr=(type==='apostle'?CONTRACTS.apostle:CONTRACTS.drill).toLowerCase()
      const newIds=receipt.logs
        .filter(l=>l.address.toLowerCase()===nftAddr)
        .map(l=>{try{return Number(BigInt(l.topics[3]))}catch{return null}})
        .filter(Boolean)
      if(newIds.length>0){
        const attrRes=await pc.multicall({contracts:newIds.map(id=>({address:type==='apostle'?CONTRACTS.apostle:CONTRACTS.drill,abi:type==='apostle'?APO_ABI:DRL_ABI,functionName:'attrs',args:[BigInt(id)]})),allowFailure:true})
        const newResults=newIds.map((id,i)=>{
          const at=attrRes[i]?.result
          return type==='apostle'
            ? {type,id,strength:at?Number(at[0]):30,elem:at?Number(at[1]):0}
            : {type,id,tier:at?Number(at[0]):1,elem:at?Number(at[1]):0}
        })
        setResults(r=>[...newResults,...r].slice(0,20))
        setMsg(`🎉 获得 ${newIds.length} 个${type==='apostle'?'使徒':'钻头'}！`)
      } else {
        setMsg('✅ 购买成功！去资产页查看')
      }
    }catch(e){setMsg('❌ '+(e.shortMessage||e.message))}
    finally{setBuying(null)}
  }

  return(
    <div className="bb-root">
      <div className="bb-header">
        <h1 className="bb-title">🎁 神秘盲盒</h1>
        <p className="bb-subtitle">随机获得使徒或钻头 NFT · 直接铸造到钱包</p>
      </div>
      {!address&&<div className="bb-warn">⚠️ 请先连接钱包</div>}
      {msg&&<div className="bb-msg">{msg}</div>}

      {/* 数量选择 */}
      <div style={{display:'flex',gap:8,justifyContent:'center',marginBottom:'1rem'}}>
        <span style={{color:'#9080b0',fontSize:'.8rem',alignSelf:'center'}}>数量：</span>
        {[1,5,10].map(n=>(
          <button key={n} onClick={()=>setCount(n)}
            style={{padding:'4px 12px',borderRadius:8,border:`1px solid ${count===n?'var(--primary)':'#3a2860'}`,background:count===n?'var(--primary)22':'none',color:count===n?'var(--primary)':'#9080b0',cursor:'pointer',fontFamily:'inherit',fontSize:'.82rem'}}>
            {n}个
          </button>
        ))}
      </div>

      <div className="bb-cards">
        {/* 使徒盲盒 */}
        <div className="bb-card apostle">
          <div className="bb-card-glow"/>
          <div className="bb-img-wrap">
            <img src={APO_EGG_GIF} alt="apostle" className="bb-img"/>
          </div>
          <div className="bb-name">🧙 使徒盲盒</div>
          <div className="bb-desc">随机元素 · 力量1-100 · 当场铸造</div>
          <div className="bb-price-row">
            <span className="bb-price-label">价格</span>
            <span className="bb-price-val">{apoPx?fmtR(apoPx*BigInt(count)):'…'} RING × {count}</span>
          </div>
          <button className="bb-buy-btn" onClick={()=>buyBox('apostle')} disabled={!address||buying==='apostle'||!apoPx}>
            {buying==='apostle'?'开启中...':'🎁 开盲盒'}
          </button>
        </div>
        {/* 钻头盲盒 */}
        <div className="bb-card drill">
          <div className="bb-card-glow"/>
          <div className="bb-img-wrap">
            <img src={drillImgUrl(2,3)} alt="drill" className="bb-img"/>
          </div>
          <div className="bb-name">⛏️ 钻头盲盒</div>
          <div className="bb-desc">随机亲和 · 1-5星 · 当场铸造</div>
          <div className="bb-price-row">
            <span className="bb-price-label">价格</span>
            <span className="bb-price-val">{drlPx?fmtR(drlPx*BigInt(count)):'…'} RING × {count}</span>
          </div>
          <button className="bb-buy-btn" onClick={()=>buyBox('drill')} disabled={!address||buying==='drill'||!drlPx}>
            {buying==='drill'?'开启中...':'🎁 开盲盒'}
          </button>
        </div>
      </div>

      {/* 开出来的NFT */}
      {results.length>0&&(
        <div style={{marginTop:'1.5rem'}}>
          <div style={{fontSize:'.8rem',color:'#c090ff',fontWeight:700,marginBottom:'.6rem',textAlign:'center'}}>🎉 本次获得</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:10,justifyContent:'center'}}>
            {results.map((r,i)=>(
              <div key={i} style={{background:`linear-gradient(135deg,${ELEMS[r.elem].color}22,#0a0814)`,border:`1px solid ${ELEMS[r.elem].color}44`,borderRadius:10,padding:'10px 12px',textAlign:'center',minWidth:90}}>
                <img src={r.type==='apostle'?APO_EGG_GIF:drillImgUrl(r.elem,r.tier||1)} style={{width:44,height:44,objectFit:'contain',filter:r.type==='apostle'?`hue-rotate(${r.elem*72}deg) saturate(1.3)`:''}}/>
                <div style={{fontSize:'.72rem',color:'#c090ff',marginTop:4}}>#{r.id}</div>
                <div style={{fontSize:'.65rem',color:ELEMS[r.elem].color}}>
                  {ELEMS[r.elem].name}{r.type==='apostle'?` 力${r.strength}`:` ${'★'.repeat(r.tier||1)}`}
                </div>
              </div>
            ))}
          </div>
          <div style={{textAlign:'center',marginTop:'.8rem'}}>
            <button onClick={()=>window.dispatchEvent(new CustomEvent('nav',{detail:{page:'assets',tab:results[0]?.type==='apostle'?'apostle':'drill'}}))}
              style={{padding:'6px 16px',borderRadius:8,border:'1px solid var(--primary)',background:'var(--primary)22',color:'var(--primary)',cursor:'pointer',fontFamily:'inherit',fontSize:'.8rem'}}>
              去资产页查看全部 →
            </button>
          </div>
        </div>
      )}

      <div className="bb-odds">
        <div className="bb-odds-title">📊 概率说明</div>
        <div className="bb-odds-grid">
          {ELEMS.map((el,i)=>(
            <div key={i} className="bb-odds-item">
              <ElemIcon i={i} size={16}/><span style={{color:el.color}}>{el.name}系</span><span>20%</span>
            </div>
          ))}
        </div>
        <div style={{fontSize:'.72rem',color:'#4030a0',marginTop:.6+'rem'}}>
          使徒力量 1-100 均匀分布 · 钻头 1-5星 各20%
        </div>
      </div>
    </div>
  )
}
