import { useState, useEffect } from 'react'
import { usePublicClient, useAccount, useWalletClient } from '../contexts/WalletContext.jsx'

import { formatEther, encodeFunctionData } from 'viem'
import { CONTRACTS } from '../constants/contracts'
import { APO_EGG_GIF, drillImgUrl, ELEM_SVGS, ELEMS } from '../constants/images'
import './BlindBoxPage.css'

const BB_ABI=[
  {type:'function',name:'apostleBoxPrice',inputs:[],outputs:[{type:'uint256'}],stateMutability:'view'},
  {type:'function',name:'drillBoxPrice',inputs:[],outputs:[{type:'uint256'}],stateMutability:'view'},
  {type:'function',name:'buyApostleBox',inputs:[],outputs:[],stateMutability:'nonpayable'},
  {type:'function',name:'buyDrillBox',inputs:[],outputs:[],stateMutability:'nonpayable'},
  {type:'event',name:'ApostleBorn',inputs:[{indexed:true,name:'tokenId',type:'uint256'},{name:'strength',type:'uint8'},{name:'element',type:'uint8'}]},
  {type:'event',name:'DrillForged',inputs:[{indexed:true,name:'tokenId',type:'uint256'},{name:'tier',type:'uint8'},{name:'affinity',type:'uint8'}]},
]
const ERC20_ABI=[
  {type:'function',name:'approve',inputs:[{name:'s',type:'address'},{name:'a',type:'uint256'}],outputs:[{type:'bool'}],stateMutability:'nonpayable'},
  {type:'function',name:'balanceOf',inputs:[{name:'a',type:'address'}],outputs:[{type:'uint256'}],stateMutability:'view'},
]

function ElemIcon({i,size=14}){return <img src={ELEM_SVGS[i]} alt={ELEMS[i].name} style={{width:size,height:size,verticalAlign:'middle',marginRight:2}}/>}

function BoxCard({type,price,loading,onBuy}){
  const isApo=type==='apostle'
  const imgSrc=isApo?APO_EGG_GIF:drillImgUrl(2,3)
  return(
    <div className={`bb-card ${type}`}>
      <div className="bb-card-glow"/>
      <div className="bb-img-wrap">
        <img src={imgSrc} alt={type} className="bb-img"/>
        <div style={{position:'absolute',top:8,right:8,background:'rgba(0,0,0,.6)',borderRadius:6,padding:'2px 7px',fontSize:'.65rem',color:'#c090ff'}}>🔒 盲盒</div>
      </div>
      <div className="bb-name">{isApo?'🧙 使徒盲盒':'⛏️ 钻头盲盒'}</div>
      <div className="bb-desc">{isApo?'购买后存入钱包\n去「资产→使徒」查看并开启':'购买后存入钱包\n去「资产→钻头」查看并开启'}</div>
      <div className="bb-price-row">
        <span className="bb-price-label">价格</span>
        <span className="bb-price-val">{price?Number(formatEther(price)).toFixed(2):'…'} RING</span>
      </div>
      <button className="bb-buy-btn" onClick={onBuy} disabled={loading||!price}>
        {loading?'购买中...':'🎁 购买盲盒'}
      </button>
      <div style={{fontSize:'.65rem',color:'#4030a0',textAlign:'center',marginTop:6}}>
        购买后 NFT 直接到你的钱包，去资产页查看
      </div>
    </div>
  )
}

export default function BlindBoxPage(){
  const pc=usePublicClient(),{address}=useAccount(),{data:wc}=useWalletClient()
  const [apoPx,setApoPx]=useState(null)
  const [drlPx,setDrlPx]=useState(null)
  const [buying,setBuying]=useState(null)
  const [msg,setMsg]=useState('')

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
    setBuying(type);setMsg('授权 RING...')
    try{
      // 1. approve
      const appData=encodeFunctionData({abi:ERC20_ABI,functionName:'approve',args:[CONTRACTS.blindbox,price]})
      const h1=await wc.sendTransaction({to:CONTRACTS.ring,data:appData})
      await pc.waitForTransactionReceipt({hash:h1})
      setMsg('购买中...')
      // 2. buy — NFT 铸造到钱包，不在这里解析结果
      const buyFn=type==='apostle'?'buyApostleBox':'buyDrillBox'
      const buyData=encodeFunctionData({abi:BB_ABI,functionName:buyFn,args:[]})
      const h2=await wc.sendTransaction({to:CONTRACTS.blindbox,data:buyData})
      await pc.waitForTransactionReceipt({hash:h2})
      setMsg('✅ 购买成功！NFT 已存入钱包，3秒后跳转资产页...')
      setTimeout(()=>{
        window.dispatchEvent(new CustomEvent('nav',{detail:{page:'assets',tab:type==='apostle'?'apostle':'drill'}}))
        setMsg('')
      },3000)
    }catch(e){setMsg('❌ '+(e.shortMessage||e.message))}
    finally{setBuying(null)}
  }

  return(
    <div className="bb-root">
      <div className="bb-header">
        <h1 className="bb-title">🎁 神秘盲盒</h1>
        <p className="bb-subtitle">购买后 NFT 直接铸造到你的钱包 · 去「资产」页查看和挂卖</p>
      </div>
      {!address&&<div className="bb-warn">⚠️ 请先连接钱包</div>}
      {msg&&<div className="bb-msg">{msg}</div>}
      <div className="bb-cards">
        <BoxCard type="apostle" price={apoPx} loading={buying==='apostle'} onBuy={()=>buyBox('apostle')}/>
        <BoxCard type="drill"   price={drlPx} loading={buying==='drill'}   onBuy={()=>buyBox('drill')}/>
      </div>
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
