import React, {useEffect,  useState } from 'react'
import { useAccount, useWalletClient, usePublicClient } from '../contexts/WalletContext.jsx'

import { parseEther, encodeFunctionData } from 'viem'
import { CONTRACTS, NFT_AUCTION_ADDR, DEPLOYER } from '../constants/contracts'
import './AdminPage.css'

const sleep = ms => new Promise(r => setTimeout(r, ms))

const ABI = {
  batchMint:   [{ name:'batchMint',         type:'function', stateMutability:'nonpayable', inputs:[{name:'xs',type:'int16[]'},{name:'ys',type:'int16[]'},{name:'attrs',type:'uint80[]'},{name:'to',type:'address'}], outputs:[] }],
  apostleMint: [{ name:'mint',              type:'function', stateMutability:'nonpayable', inputs:[{name:'to',type:'address'},{name:'strength',type:'uint8'},{name:'element',type:'uint8'}], outputs:[{type:'uint256'}] }],
  drillMint:   [{ name:'mint',              type:'function', stateMutability:'nonpayable', inputs:[{name:'to',type:'address'},{name:'tier',type:'uint8'},{name:'affinity',type:'uint8'}], outputs:[{type:'uint256'}] }],
  erc20Mint:   [{ name:'mint',              type:'function', stateMutability:'nonpayable', inputs:[{name:'to',type:'address'},{name:'amount',type:'uint256'}], outputs:[] }],
  erc20Transfer:[{ name:'transfer',         type:'function', stateMutability:'nonpayable', inputs:[{name:'to',type:'address'},{name:'amount',type:'uint256'}], outputs:[{type:'bool'}] }],
  erc20Bal:    [{ name:'balanceOf',         type:'function', stateMutability:'view',       inputs:[{name:'a',type:'address'}], outputs:[{type:'uint256'}] }],
  setApprAll:  [{ name:'setApprovalForAll', type:'function', stateMutability:'nonpayable', inputs:[{name:'operator',type:'address'},{name:'approved',type:'bool'}], outputs:[] }],
  setOperator: [{ name:'setOperator',       type:'function', stateMutability:'nonpayable', inputs:[{name:'a',type:'address'},{name:'v',type:'bool'}], outputs:[] }],
  startMining: [{ name:'startMining',       type:'function', stateMutability:'nonpayable', inputs:[{name:'landId',type:'uint256'},{name:'apostleId',type:'uint256'},{name:'drillId',type:'uint256'}], outputs:[] }],
  oldAucCreate:[{ name:'createAuction',     type:'function', stateMutability:'nonpayable', inputs:[{name:'id',type:'uint256'},{name:'startPrice',type:'uint128'},{name:'endPrice',type:'uint128'},{name:'duration',type:'uint64'}], outputs:[] }],
  nftAucCreate:[{ name:'createAuction',     type:'function', stateMutability:'nonpayable', inputs:[{name:'nft',type:'address'},{name:'id',type:'uint256'},{name:'sp',type:'uint128'},{name:'ep',type:'uint128'},{name:'dur',type:'uint64'}], outputs:[] }],
  pendingRew:  [{ name:'pendingRewards',    type:'function', stateMutability:'view',       inputs:[{name:'l',type:'uint256'}], outputs:[{type:'uint256[5]'}] }],
  approve:     [{ name:'approve',           type:'function', stateMutability:'nonpayable', inputs:[{name:'spender',type:'address'},{name:'amount',type:'uint256'}], outputs:[{type:'bool'}] }],
  nextId:      [{ name:'nextId',            type:'function', stateMutability:'view',       inputs:[], outputs:[{type:'uint256'}] }],
  ownerOf:     [{ name:'ownerOf',           type:'function', stateMutability:'view',       inputs:[{name:'id',type:'uint256'}], outputs:[{type:'address'}] }],
  slotCount:   [{ name:'slotCount',         type:'function', stateMutability:'view',       inputs:[{name:'landId',type:'uint256'}], outputs:[{type:'uint256'}] }],
}

function encodeAttr(g,w,wa,f,s){return BigInt(g)|(BigInt(w)<<16n)|(BigInt(wa)<<32n)|(BigInt(f)<<48n)|(BigInt(s)<<64n)}

async function sendTx(wc, pc, to, abi, fn, args, value) {
  const data = encodeFunctionData({ abi, functionName: fn, args })
  for (let r = 0; r < 3; r++) {
    try {
      // 先估算 gas，避免 MetaMask 低估
      const gas = await pc.estimateGas({ account: wc.account, to, data, ...(value?{value}:{}) }).catch(() => 500_000n)
      const gasLimit = gas * 130n / 100n  // 加30%安全边际
      const hash = await wc.sendTransaction({ to, data, gas: gasLimit, ...(value?{value}:{}) })
      // 等待上链确认后再继续，避免 nonce 堆积
      const receipt = await pc.waitForTransactionReceipt({ hash, timeout: 120_000 })
      if (receipt.status === 'reverted') throw new Error('Transaction reverted')
      await sleep(500)
      return hash
    } catch(e) {
      const m = (e.message || '').toLowerCase()
      if ((m.includes('rate') || m.includes('429') || m.includes('nonce')) && r < 2) {
        await sleep(3000 * (r + 1))
        continue
      }
      throw e
    }
  }
}

export default function AdminPage() {
  const { address } = useAccount()
  const { data: wc } = useWalletClient()
  const pc = usePublicClient()
  const [logs, setLogs] = useState([])
  const [busy, setBusy] = useState(false)
  const [mintCount, setMintCount] = useState({ apo: 5, drl: 5 })
  const [listMode, setListMode] = useState('market') // market | mine

  // 只有管理员钱包才显示
  const isAdmin = address?.toLowerCase() === DEPLOYER.toLowerCase()

  function log(msg, type='info') {
    setLogs(p => [...p, { msg, type, t: new Date().toLocaleTimeString() }])
    setTimeout(() => { const el=document.getElementById('alog'); if(el) el.scrollTop=el.scrollHeight }, 40)
  }

  // ── 铸造使徒 ───────────────────────────────────────────────────────────
  async function mintApostles() {
    if (!wc) return
    setBusy(true); setLogs([])
    try {
      const n = Number(mintCount.apo)
      log(`🧙 铸造 ${n} 个使徒...`)
      const startId = Number(await pc.readContract({ address:CONTRACTS.apostle, abi:ABI.nextId, functionName:'nextId' }))
      for (let i = 0; i < n; i++) {
        const str = 30 + (i % 14) * 5
        const elem = i % 5
        await sendTx(wc, pc, CONTRACTS.apostle, ABI.apostleMint, 'mint', [address, str, elem])
        log(`  ✅ 使徒 #${startId+i} 力量${str} ${'金木水火土'[elem]}`, 'success')
      }
      log(`🎉 铸造完成！去「资产→使徒」查看`, 'success')
    } catch(e) { log('❌ '+( e.shortMessage||e.message), 'error') }
    setBusy(false)
  }

  // ── 铸造钻头 ───────────────────────────────────────────────────────────
  async function mintDrills() {
    if (!wc) return
    setBusy(true); setLogs([])
    try {
      const n = Number(mintCount.drl)
      log(`⛏️ 铸造 ${n} 个钻头...`)
      const startId = Number(await pc.readContract({ address:CONTRACTS.drill, abi:ABI.nextId, functionName:'nextId' }))
      for (let i = 0; i < n; i++) {
        const tier = (i % 5) + 1
        const aff = i % 5
        await sendTx(wc, pc, CONTRACTS.drill, ABI.drillMint, 'mint', [address, tier, aff])
        log(`  ✅ 钻头 #${startId+i} ${'★'.repeat(tier)} ${'金木水火土'[aff]}`, 'success')
      }
      log(`🎉 铸造完成！去「资产→钻头」查看`, 'success')
    } catch(e) { log('❌ '+(e.shortMessage||e.message), 'error') }
    setBusy(false)
  }

  // ── 批量挂市场 ─────────────────────────────────────────────────────────
  async function listToMarket() {
    if (!wc) return
    setBusy(true); setLogs([])
    try {
      log('🏛 批量挂市场...')
      // 授权
      await sendTx(wc, pc, CONTRACTS.apostle, ABI.setOperator, 'setOperator', [NFT_AUCTION_ADDR, true])
      await sendTx(wc, pc, CONTRACTS.drill, ABI.setOperator, 'setOperator', [NFT_AUCTION_ADDR, true])
      await sendTx(wc, pc, CONTRACTS.land, ABI.setApprAll, 'setApprovalForAll', [NFT_AUCTION_ADDR, true])
      log('  ✅ 授权完成', 'success')

      // 使徒 — 找持有且未挂单的
      const apoNext = Number(await pc.readContract({ address:CONTRACTS.apostle, abi:ABI.nextId, functionName:'nextId' }))
      let apoListed = 0
      for (let id = 1; id < apoNext && apoListed < 10; id++) {
        const owner = await pc.readContract({ address:CONTRACTS.apostle, abi:ABI.ownerOf, functionName:'ownerOf', args:[BigInt(id)] }).catch(()=>null)
        if (!owner || owner.toLowerCase() !== address.toLowerCase()) continue
        const sp = parseEther(String((1 + (id%8)*0.5).toFixed(1)))
        const ep = parseEther('0.3')
        await sendTx(wc, pc, NFT_AUCTION_ADDR, ABI.nftAucCreate, 'createAuction', [CONTRACTS.apostle, BigInt(id), sp, ep, BigInt(3*24*3600)])
        log(`  ✅ 使徒 #${id} 起拍 ${parseFloat(sp)/1e18} RING`, 'success')
        apoListed++
      }

      // 钻头
      const drlNext = Number(await pc.readContract({ address:CONTRACTS.drill, abi:ABI.nextId, functionName:'nextId' }))
      let drlListed = 0
      for (let id = 1; id < drlNext && drlListed < 10; id++) {
        const owner = await pc.readContract({ address:CONTRACTS.drill, abi:ABI.ownerOf, functionName:'ownerOf', args:[BigInt(id)] }).catch(()=>null)
        if (!owner || owner.toLowerCase() !== address.toLowerCase()) continue
        const sp = parseEther(String((0.5 + (id%5)*0.3).toFixed(1)))
        const ep = parseEther('0.1')
        await sendTx(wc, pc, NFT_AUCTION_ADDR, ABI.nftAucCreate, 'createAuction', [CONTRACTS.drill, BigInt(id), sp, ep, BigInt(3*24*3600)])
        log(`  ✅ 钻头 #${id} 起拍 ${parseFloat(sp)/1e18} RING`, 'success')
        drlListed++
      }

      // 土地（找没在挖矿的）
      let landListed = 0
      for (let x = 0; x < 12 && landListed < 10; x++) {
        for (let y = 0; y < 5 && landListed < 10; y++) {
          const id = x*100+y+1
          const owner = await pc.readContract({ address:CONTRACTS.land, abi:ABI.ownerOf, functionName:'ownerOf', args:[BigInt(id)] }).catch(()=>null)
          if (!owner || owner.toLowerCase() !== address.toLowerCase()) continue
          const slots = Number(await pc.readContract({ address:CONTRACTS.mining, abi:ABI.slotCount, functionName:'slotCount', args:[BigInt(id)] }).catch(()=>0n))
          if (slots > 0) continue
          const sp = parseEther(String(3 + (id%10)))
          const ep = parseEther('1')
          await sendTx(wc, pc, NFT_AUCTION_ADDR, ABI.nftAucCreate, 'createAuction', [CONTRACTS.land, BigInt(id), sp, ep, BigInt(3*24*3600)])
          log(`  ✅ 土地 #${id} 起拍 ${parseFloat(sp)/1e18} RING`, 'success')
          landListed++
        }
      }
      log(`🎉 完成！使徒${apoListed} 钻头${drlListed} 土地${landListed} 已挂市场`, 'success')
    } catch(e) { log('❌ '+(e.shortMessage||e.message), 'error') }
    setBusy(false)
  }

  // ── 批量开挖矿 ─────────────────────────────────────────────────────────
  async function startMining() {
    if (!wc) return
    setBusy(true); setLogs([])
    try {
      log('⚒️ 批量开启挖矿...')
      await sendTx(wc, pc, CONTRACTS.apostle, ABI.setApprAll, 'setApprovalForAll', [CONTRACTS.mining, true])
      await sendTx(wc, pc, CONTRACTS.drill, ABI.setApprAll, 'setApprovalForAll', [CONTRACTS.mining, true])
      log('  ✅ 授权完成', 'success')
      // 找持有的使徒和钻头
      const apoNext = Number(await pc.readContract({ address:CONTRACTS.apostle, abi:ABI.nextId, functionName:'nextId' }))
      const drlNext = Number(await pc.readContract({ address:CONTRACTS.drill, abi:ABI.nextId, functionName:'nextId' }))
      const myApos = [], myDrls = []
      for (let id = 1; id < apoNext; id++) {
        const owner = await pc.readContract({ address:CONTRACTS.apostle, abi:ABI.ownerOf, functionName:'ownerOf', args:[BigInt(id)] }).catch(()=>null)
        if (owner?.toLowerCase() === address.toLowerCase()) myApos.push(id)
        if (myApos.length >= 25) break
      }
      for (let id = 1; id < drlNext; id++) {
        const owner = await pc.readContract({ address:CONTRACTS.drill, abi:ABI.ownerOf, functionName:'ownerOf', args:[BigInt(id)] }).catch(()=>null)
        if (owner?.toLowerCase() === address.toLowerCase()) myDrls.push(id)
        if (myDrls.length >= 25) break
      }
      // 找持有的土地，开挖矿
      let slotIdx = 0, mined = 0
      for (let x = 0; x < 12 && slotIdx < myApos.length; x++) {
        for (let y = 0; y < 5 && slotIdx < myApos.length; y++) {
          const id = x*100+y+1
          const owner = await pc.readContract({ address:CONTRACTS.land, abi:ABI.ownerOf, functionName:'ownerOf', args:[BigInt(id)] }).catch(()=>null)
          if (!owner || owner.toLowerCase() !== address.toLowerCase()) continue
          const slots = Number(await pc.readContract({ address:CONTRACTS.mining, abi:ABI.slotCount, functionName:'slotCount', args:[BigInt(id)] }).catch(()=>0n))
          if (slots >= 5) continue
          const apoId = myApos[slotIdx]
          const drlId = myDrls[slotIdx] ?? 0
          await sendTx(wc, pc, CONTRACTS.mining, ABI.startMining, 'startMining', [BigInt(id), BigInt(apoId), BigInt(drlId)])
          log(`  ✅ 地块#${id} 使徒#${apoId} 钻头#${drlId||'无'}`, 'success')
          slotIdx++; mined++
        }
      }
      log(`🎉 完成！开启 ${mined} 个挖矿槽位`, 'success')
    } catch(e) { log('❌ '+(e.shortMessage||e.message), 'error') }
    setBusy(false)
  }

  // ── 充值挖矿奖励池 ─────────────────────────────────────────────────────
  async function fundRewardPool() {
    if (!wc) return
    setBusy(true); setLogs([])
    try {
      log('💰 检查挖矿奖励池...')

      // 5种资源 token 合约
      const resourceTokens = [
        { sym:'GOLD', addr:CONTRACTS.gold  },
        { sym:'WOOD', addr:CONTRACTS.wood  },
        { sym:'HHO',  addr:CONTRACTS.water },
        { sym:'FIRE', addr:CONTRACTS.fire  },
        { sym:'SIOO', addr:CONTRACTS.soil  },
      ]

      // 计算所有土地的待领奖励总量（确定需要充值多少）
      const landIds = []
      for(let x=0;x<12;x++) for(let y=0;y<5;y++) landIds.push(x*100+y+1)
      const totals = [0n,0n,0n,0n,0n]
      log('📊 计算待发奖励总量...')
      for(const id of landIds){
        try{
          const r = await pc.readContract({address:CONTRACTS.mining,abi:ABI.pendingRew,functionName:'pendingRewards',args:[BigInt(id)]})
          r.forEach((v,i)=>{totals[i]+=v})
        }catch{}
      }
      log(`📊 总待领奖励: ${resourceTokens.map((t,i)=>`${t.sym}:${(Number(totals[i])/1e18).toFixed(0)}`).join(', ')}`)

      // 给 Mining 合约充值 2x 安全边际，最低 50000
      const SAFETY = 2n
      const MIN_FUND = parseEther('50000')
      for(let i=0;i<5;i++){
        const needed = totals[i] * SAFETY + MIN_FUND
        const curBal = await pc.readContract({address:resourceTokens[i].addr,abi:ABI.erc20Bal,functionName:'balanceOf',args:[CONTRACTS.mining]}).catch(()=>0n)
        if(curBal >= needed){
          log(`  ✅ ${resourceTokens[i].sym} 余额充足 (${(Number(curBal)/1e18).toFixed(0)})`, 'success')
          continue
        }
        const mintAmt = needed - curBal
        log(`  🪙 Mint ${(Number(mintAmt)/1e18).toFixed(0)} ${resourceTokens[i].sym} → Mining 合约...`)
        await sendTx(wc, pc, resourceTokens[i].addr, ABI.erc20Mint, 'mint', [CONTRACTS.mining, mintAmt])
        const newBal = await pc.readContract({address:resourceTokens[i].addr,abi:ABI.erc20Bal,functionName:'balanceOf',args:[CONTRACTS.mining]}).catch(()=>0n)
        log(`  ✅ ${resourceTokens[i].sym} Mining余额: ${(Number(newBal)/1e18).toFixed(0)}`, 'success')
      }
      log('🎉 奖励池充值完成！用户现在可以正常领取资源了', 'success')
    } catch(e) { log('❌ '+(e.shortMessage||e.message), 'error') }
    setBusy(false)
  }
  if (!address) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh',flexDirection:'column',gap:12,color:'var(--text-dim)'}}>
      <div style={{fontSize:48,opacity:.3}}>🛠</div>
      <p>请先连接钱包</p>
    </div>
  )

  if (!isAdmin) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh',flexDirection:'column',gap:12}}>
      <div style={{fontSize:48,opacity:.3}}>🔒</div>
      <p style={{color:'var(--text-dim)'}}>仅管理员可访问</p>
      <p style={{fontSize:12,color:'var(--text-dim)',fontFamily:'monospace'}}>{address?.slice(0,20)}...</p>
    </div>
  )

  // ── 管理员界面 ─────────────────────────────────────────────────────────
  return (
    <div className="admin-page">
      <div className="admin-header">
        <h1>🛠 管理员工具</h1>
        <p style={{fontSize:'.75rem',color:'#52c462'}}>✅ 已验证：{address?.slice(0,10)}…</p>
      </div>

      {/* 铸造工具 */}
      <div className="admin-section">
        <div className="admin-section-title">🎁 铸造 NFT</div>
        <div className="admin-grid">
          <div className="admin-card">
            <div className="ac-title">🧙 使徒</div>
            <div className="ac-desc">铸造使徒 NFT 到当前钱包<br/>力量30-95，5种元素随机循环</div>
            <div className="ac-row">
              <label>数量</label>
              <input type="number" min="1" max="50" value={mintCount.apo}
                onChange={e=>setMintCount(p=>({...p,apo:e.target.value}))}
                style={{width:60,textAlign:'center'}}/>
            </div>
            <button className="admin-btn-sm" onClick={mintApostles} disabled={busy}>铸造使徒</button>
          </div>
          <div className="admin-card">
            <div className="ac-title">⛏️ 钻头</div>
            <div className="ac-desc">铸造钻头 NFT 到当前钱包<br/>1-5星，5种元素亲和循环</div>
            <div className="ac-row">
              <label>数量</label>
              <input type="number" min="1" max="50" value={mintCount.drl}
                onChange={e=>setMintCount(p=>({...p,drl:e.target.value}))}
                style={{width:60,textAlign:'center'}}/>
            </div>
            <button className="admin-btn-sm" onClick={mintDrills} disabled={busy}>铸造钻头</button>
          </div>
        </div>
      </div>

      {/* 操作工具 */}
      <div className="admin-section">
        <div className="admin-section-title">⚡ 快速操作</div>
        <div className="admin-grid">
          <div className="admin-card">
            <div className="ac-title">🏛 批量挂市场</div>
            <div className="ac-desc">将持有的使徒/钻头/土地<br/>各挂10个到市场拍卖</div>
            <button className="admin-btn-sm" onClick={listToMarket} disabled={busy}>批量挂单</button>
          </div>
          <div className="admin-card">
            <div className="ac-title">⚒️ 批量开挖矿</div>
            <div className="ac-desc">将持有的使徒+钻头<br/>放置到持有土地上挖矿</div>
            <button className="admin-btn-sm" onClick={startMining} disabled={busy}>开始挖矿</button>
          </div>
          <div className="admin-card" style={{border:'1px solid #f0a04044'}}>
            <div className="ac-title" style={{color:'#f0c040'}}>💰 充值奖励池</div>
            <div className="ac-desc">Mint 资源 token 到 Mining 合约<br/>用户才能正常领取挖矿收益</div>
            <button className="admin-btn-sm" style={{background:'linear-gradient(135deg,#806010,#404000)'}} onClick={fundRewardPool} disabled={busy}>充值奖励池</button>
          </div>
        </div>
      </div>

      {/* 日志 */}
      {logs.length > 0 && (
        <div className="admin-log" id="alog">
          <div className="log-title">操作日志 ({logs.length})</div>
          {logs.map((l,i) => (
            <div key={i} className={`log-line log-${l.type}`}>
              <span className="log-t">{l.t}</span>
              <span>{l.msg}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
