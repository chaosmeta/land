import React, { useEffect, useState } from 'react'
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
  erc20Bal:    [{ name:'balanceOf',         type:'function', stateMutability:'view',       inputs:[{name:'a',type:'address'}], outputs:[{type:'uint256'}] }],
  setApprAll:  [{ name:'setApprovalForAll', type:'function', stateMutability:'nonpayable', inputs:[{name:'operator',type:'address'},{name:'approved',type:'bool'}], outputs:[] }],
  isApprAll:   [{ name:'isApprovedForAll',  type:'function', stateMutability:'view',       inputs:[{name:'owner',type:'address'},{name:'operator',type:'address'}], outputs:[{type:'bool'}] }],
  setOperator: [{ name:'setOperator',       type:'function', stateMutability:'nonpayable', inputs:[{name:'a',type:'address'},{name:'v',type:'bool'}], outputs:[] }],
  operators:   [{ name:'operators',         type:'function', stateMutability:'view',       inputs:[{name:'a',type:'address'}], outputs:[{type:'bool'}] }],
  startMining: [{ name:'startMining',       type:'function', stateMutability:'nonpayable', inputs:[{name:'landId',type:'uint256'},{name:'apostleId',type:'uint256'},{name:'drillId',type:'uint256'}], outputs:[] }],
  nftAucCreate:[{ name:'createAuction',     type:'function', stateMutability:'nonpayable', inputs:[{name:'nft',type:'address'},{name:'id',type:'uint256'},{name:'sp',type:'uint128'},{name:'ep',type:'uint128'},{name:'dur',type:'uint64'}], outputs:[] }],
  getAuction:  [{ name:'getAuction',        type:'function', stateMutability:'view',       inputs:[{name:'nft',type:'address'},{name:'id',type:'uint256'}], outputs:[{components:[{name:'nftContract',type:'address'},{name:'seller',type:'address'},{name:'startPrice',type:'uint128'},{name:'endPrice',type:'uint128'},{name:'duration',type:'uint64'},{name:'startedAt',type:'uint64'}],type:'tuple'}] }],
  pendingRew:  [{ name:'pendingRewards',    type:'function', stateMutability:'view',       inputs:[{name:'l',type:'uint256'}], outputs:[{type:'uint256[5]'}] }],
  nextId:      [{ name:'nextId',            type:'function', stateMutability:'view',       inputs:[], outputs:[{type:'uint256'}] }],
  ownerOf:     [{ name:'ownerOf',           type:'function', stateMutability:'view',       inputs:[{name:'id',type:'uint256'}], outputs:[{type:'address'}] }],
  slotCount:   [{ name:'slotCount',         type:'function', stateMutability:'view',       inputs:[{name:'landId',type:'uint256'}], outputs:[{type:'uint256'}] }],
}

async function sendTx(wc, pc, to, abi, fn, args) {
  const data = encodeFunctionData({ abi, functionName: fn, args })
  for (let r = 0; r < 3; r++) {
    try {
      const gas = await pc.estimateGas({ account: wc.account, to, data }).catch(() => 500_000n)
      const hash = await wc.sendTransaction({ to, data, gas: gas * 130n / 100n })
      const receipt = await pc.waitForTransactionReceipt({ hash, timeout: 120_000 })
      if (receipt.status === 'reverted') throw new Error('reverted')
      await sleep(500)
      return hash
    } catch(e) {
      const m = (e.message || '').toLowerCase()
      if ((m.includes('rate') || m.includes('429') || m.includes('nonce')) && r < 2) {
        await sleep(3000 * (r + 1)); continue
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

  const isAdmin = address?.toLowerCase() === DEPLOYER.toLowerCase()

  function log(msg, type = 'info') {
    setLogs(p => [...p, { msg, type, t: new Date().toLocaleTimeString() }])
    setTimeout(() => { const el = document.getElementById('alog'); if (el) el.scrollTop = el.scrollHeight }, 40)
  }

  // ── 铸造使徒 ──────────────────────────────────────────────────────────
  async function mintApostles() {
    if (!wc) return
    setBusy(true); setLogs([])
    try {
      const n = Number(mintCount.apo)
      log(`🧙 铸造 ${n} 个使徒...`)
      const startId = Number(await pc.readContract({ address: CONTRACTS.apostle, abi: ABI.nextId, functionName: 'nextId' }))
      for (let i = 0; i < n; i++) {
        const str = 30 + (i % 14) * 5
        const elem = i % 5
        await sendTx(wc, pc, CONTRACTS.apostle, ABI.apostleMint, 'mint', [address, str, elem])
        log(`  ✅ 使徒 #${startId + i} 力量${str} ${'金木水火土'[elem]}`, 'success')
      }
      log('🎉 铸造完成！去「资产→使徒」查看', 'success')
    } catch(e) { log('❌ ' + (e.shortMessage || e.message), 'error') }
    setBusy(false)
  }

  // ── 铸造钻头 ──────────────────────────────────────────────────────────
  async function mintDrills() {
    if (!wc) return
    setBusy(true); setLogs([])
    try {
      const n = Number(mintCount.drl)
      log(`⛏️ 铸造 ${n} 个钻头...`)
      const startId = Number(await pc.readContract({ address: CONTRACTS.drill, abi: ABI.nextId, functionName: 'nextId' }))
      for (let i = 0; i < n; i++) {
        const tier = (i % 5) + 1
        const aff = i % 5
        await sendTx(wc, pc, CONTRACTS.drill, ABI.drillMint, 'mint', [address, tier, aff])
        log(`  ✅ 钻头 #${startId + i} ${'★'.repeat(tier)} ${'金木水火土'[aff]}`, 'success')
      }
      log('🎉 铸造完成！去「资产→钻头」查看', 'success')
    } catch(e) { log('❌ ' + (e.shortMessage || e.message), 'error') }
    setBusy(false)
  }

  // ── 批量挂市场（修复版：先读链上授权状态，只在需要时才发授权交易）──
  async function listToMarket() {
    if (!wc) return
    setBusy(true); setLogs([])
    try {
      log('🔍 检查授权状态...')

      // ① 检查 Apostle：operators[NFT_AUCTION_ADDR]
      const apoOp = await pc.readContract({
        address: CONTRACTS.apostle, abi: ABI.operators, functionName: 'operators', args: [NFT_AUCTION_ADDR]
      }).catch(() => false)
      if (!apoOp) {
        log('  授权 Apostle → NFTAuction ...')
        await sendTx(wc, pc, CONTRACTS.apostle, ABI.setOperator, 'setOperator', [NFT_AUCTION_ADDR, true])
        log('  ✅ Apostle 授权完成', 'success')
      } else {
        log('  ✅ Apostle 已授权，跳过', 'success')
      }

      // ② 检查 Drill：operators[NFT_AUCTION_ADDR]
      const drlOp = await pc.readContract({
        address: CONTRACTS.drill, abi: ABI.operators, functionName: 'operators', args: [NFT_AUCTION_ADDR]
      }).catch(() => false)
      if (!drlOp) {
        log('  授权 Drill → NFTAuction ...')
        await sendTx(wc, pc, CONTRACTS.drill, ABI.setOperator, 'setOperator', [NFT_AUCTION_ADDR, true])
        log('  ✅ Drill 授权完成', 'success')
      } else {
        log('  ✅ Drill 已授权，跳过', 'success')
      }

      // ③ 检查 Land：isApprovedForAll(address, NFT_AUCTION_ADDR)
      const landAppr = await pc.readContract({
        address: CONTRACTS.land, abi: ABI.isApprAll, functionName: 'isApprovedForAll', args: [address, NFT_AUCTION_ADDR]
      }).catch(() => false)
      if (!landAppr) {
        log('  授权 Land → NFTAuction ...')
        await sendTx(wc, pc, CONTRACTS.land, ABI.setApprAll, 'setApprovalForAll', [NFT_AUCTION_ADDR, true])
        log('  ✅ Land 授权完成', 'success')
      } else {
        log('  ✅ Land 已授权，跳过', 'success')
      }

      log('✅ 授权阶段完成，开始挂单...', 'success')

      // ④ 挂使徒（找持有且未挂单的，最多10个）
      const apoNext = Number(await pc.readContract({ address: CONTRACTS.apostle, abi: ABI.nextId, functionName: 'nextId' }))
      let apoListed = 0
      for (let id = 1; id < apoNext && apoListed < 10; id++) {
        const owner = await pc.readContract({ address: CONTRACTS.apostle, abi: ABI.ownerOf, functionName: 'ownerOf', args: [BigInt(id)] }).catch(() => null)
        if (!owner || owner.toLowerCase() !== address.toLowerCase()) continue
        // 检查是否已挂单
        const existing = await pc.readContract({ address: NFT_AUCTION_ADDR, abi: ABI.getAuction, functionName: 'getAuction', args: [CONTRACTS.apostle, BigInt(id)] }).catch(() => null)
        if (existing?.startedAt > 0n) { log(`  ⏭ 使徒 #${id} 已在挂单中，跳过`); continue }
        const sp = parseEther(String((1 + (id % 8) * 0.5).toFixed(1)))
        const ep = parseEther('0.3')
        log(`  挂单使徒 #${id} 起拍 ${Number(sp) / 1e18} RING...`)
        await sendTx(wc, pc, NFT_AUCTION_ADDR, ABI.nftAucCreate, 'createAuction', [CONTRACTS.apostle, BigInt(id), sp, ep, BigInt(3 * 24 * 3600)])
        log(`  ✅ 使徒 #${id} 挂单成功`, 'success')
        apoListed++
      }

      // ⑤ 挂钻头（找持有且未挂单的，最多10个）
      const drlNext = Number(await pc.readContract({ address: CONTRACTS.drill, abi: ABI.nextId, functionName: 'nextId' }))
      let drlListed = 0
      for (let id = 1; id < drlNext && drlListed < 10; id++) {
        const owner = await pc.readContract({ address: CONTRACTS.drill, abi: ABI.ownerOf, functionName: 'ownerOf', args: [BigInt(id)] }).catch(() => null)
        if (!owner || owner.toLowerCase() !== address.toLowerCase()) continue
        const existing = await pc.readContract({ address: NFT_AUCTION_ADDR, abi: ABI.getAuction, functionName: 'getAuction', args: [CONTRACTS.drill, BigInt(id)] }).catch(() => null)
        if (existing?.startedAt > 0n) { log(`  ⏭ 钻头 #${id} 已在挂单中，跳过`); continue }
        const sp = parseEther(String((0.5 + (id % 5) * 0.3).toFixed(1)))
        const ep = parseEther('0.1')
        log(`  挂单钻头 #${id} 起拍 ${Number(sp) / 1e18} RING...`)
        await sendTx(wc, pc, NFT_AUCTION_ADDR, ABI.nftAucCreate, 'createAuction', [CONTRACTS.drill, BigInt(id), sp, ep, BigInt(3 * 24 * 3600)])
        log(`  ✅ 钻头 #${id} 挂单成功`, 'success')
        drlListed++
      }

      // ⑥ 挂土地（找未在挖矿且未挂单的，最多10块）
      let landListed = 0
      for (let x = 0; x < 12 && landListed < 10; x++) {
        for (let y = 0; y < 5 && landListed < 10; y++) {
          const id = x * 100 + y + 1
          const owner = await pc.readContract({ address: CONTRACTS.land, abi: ABI.ownerOf, functionName: 'ownerOf', args: [BigInt(id)] }).catch(() => null)
          if (!owner || owner.toLowerCase() !== address.toLowerCase()) continue
          const slots = Number(await pc.readContract({ address: CONTRACTS.mining, abi: ABI.slotCount, functionName: 'slotCount', args: [BigInt(id)] }).catch(() => 0n))
          if (slots > 0) { log(`  ⏭ 土地 #${id} 挖矿中，跳过`); continue }
          const existing = await pc.readContract({ address: NFT_AUCTION_ADDR, abi: ABI.getAuction, functionName: 'getAuction', args: [CONTRACTS.land, BigInt(id)] }).catch(() => null)
          if (existing?.startedAt > 0n) { log(`  ⏭ 土地 #${id} 已在挂单中，跳过`); continue }
          const sp = parseEther(String(3 + (id % 10)))
          const ep = parseEther('1')
          log(`  挂单土地 #${id} 起拍 ${Number(sp) / 1e18} RING...`)
          await sendTx(wc, pc, NFT_AUCTION_ADDR, ABI.nftAucCreate, 'createAuction', [CONTRACTS.land, BigInt(id), sp, ep, BigInt(3 * 24 * 3600)])
          log(`  ✅ 土地 #${id} 挂单成功`, 'success')
          landListed++
        }
      }

      log(`🎉 完成！使徒${apoListed}个 钻头${drlListed}个 土地${landListed}块 已上市场`, 'success')
    } catch(e) { log('❌ ' + (e.shortMessage || e.message), 'error') }
    setBusy(false)
  }

  // ── 批量开挖矿 ────────────────────────────────────────────────────────
  async function startMining() {
    if (!wc) return
    setBusy(true); setLogs([])
    try {
      log('⚒️ 批量开启挖矿...')
      // 先检查授权，只在需要时才发
      const apoAppr = await pc.readContract({ address: CONTRACTS.apostle, abi: ABI.isApprAll, functionName: 'isApprovedForAll', args: [address, CONTRACTS.mining] }).catch(() => false)
      if (!apoAppr) {
        log('  授权 Apostle → Mining...')
        await sendTx(wc, pc, CONTRACTS.apostle, ABI.setApprAll, 'setApprovalForAll', [CONTRACTS.mining, true])
        log('  ✅ Apostle 授权完成', 'success')
      } else { log('  ✅ Apostle 已授权', 'success') }

      const drlAppr = await pc.readContract({ address: CONTRACTS.drill, abi: ABI.isApprAll, functionName: 'isApprovedForAll', args: [address, CONTRACTS.mining] }).catch(() => false)
      if (!drlAppr) {
        log('  授权 Drill → Mining...')
        await sendTx(wc, pc, CONTRACTS.drill, ABI.setApprAll, 'setApprovalForAll', [CONTRACTS.mining, true])
        log('  ✅ Drill 授权完成', 'success')
      } else { log('  ✅ Drill 已授权', 'success') }

      const apoNext = Number(await pc.readContract({ address: CONTRACTS.apostle, abi: ABI.nextId, functionName: 'nextId' }))
      const drlNext = Number(await pc.readContract({ address: CONTRACTS.drill, abi: ABI.nextId, functionName: 'nextId' }))
      const myApos = [], myDrls = []
      for (let id = 1; id < apoNext; id++) {
        const owner = await pc.readContract({ address: CONTRACTS.apostle, abi: ABI.ownerOf, functionName: 'ownerOf', args: [BigInt(id)] }).catch(() => null)
        if (owner?.toLowerCase() === address.toLowerCase()) myApos.push(id)
        if (myApos.length >= 25) break
      }
      for (let id = 1; id < drlNext; id++) {
        const owner = await pc.readContract({ address: CONTRACTS.drill, abi: ABI.ownerOf, functionName: 'ownerOf', args: [BigInt(id)] }).catch(() => null)
        if (owner?.toLowerCase() === address.toLowerCase()) myDrls.push(id)
        if (myDrls.length >= 25) break
      }
      let slotIdx = 0, mined = 0
      for (let x = 0; x < 12 && slotIdx < myApos.length; x++) {
        for (let y = 0; y < 5 && slotIdx < myApos.length; y++) {
          const id = x * 100 + y + 1
          const owner = await pc.readContract({ address: CONTRACTS.land, abi: ABI.ownerOf, functionName: 'ownerOf', args: [BigInt(id)] }).catch(() => null)
          if (!owner || owner.toLowerCase() !== address.toLowerCase()) continue
          const slots = Number(await pc.readContract({ address: CONTRACTS.mining, abi: ABI.slotCount, functionName: 'slotCount', args: [BigInt(id)] }).catch(() => 0n))
          if (slots >= 5) continue
          const apoId = myApos[slotIdx], drlId = myDrls[slotIdx] ?? 0
          await sendTx(wc, pc, CONTRACTS.mining, ABI.startMining, 'startMining', [BigInt(id), BigInt(apoId), BigInt(drlId)])
          log(`  ✅ 地块#${id} 使徒#${apoId} 钻头#${drlId || '无'}`, 'success')
          slotIdx++; mined++
        }
      }
      log(`🎉 完成！开启 ${mined} 个挖矿槽位`, 'success')
    } catch(e) { log('❌ ' + (e.shortMessage || e.message), 'error') }
    setBusy(false)
  }

  // ── 充值挖矿奖励池 ────────────────────────────────────────────────────
  async function fundRewardPool() {
    if (!wc) return
    setBusy(true); setLogs([])
    try {
      log('💰 检查挖矿奖励池...')
      const resourceTokens = [
        { sym: 'GOLD', addr: CONTRACTS.gold },
        { sym: 'WOOD', addr: CONTRACTS.wood },
        { sym: 'HHO',  addr: CONTRACTS.water },
        { sym: 'FIRE', addr: CONTRACTS.fire },
        { sym: 'SIOO', addr: CONTRACTS.soil },
      ]
      const landIds = []
      for (let x = 0; x < 12; x++) for (let y = 0; y < 5; y++) landIds.push(x * 100 + y + 1)
      const totals = [0n, 0n, 0n, 0n, 0n]
      log('📊 计算待发奖励总量...')
      for (const id of landIds) {
        try {
          const r = await pc.readContract({ address: CONTRACTS.mining, abi: ABI.pendingRew, functionName: 'pendingRewards', args: [BigInt(id)] })
          r.forEach((v, i) => { totals[i] += v })
        } catch {}
      }
      log(`📊 总待领: ${resourceTokens.map((t, i) => `${t.sym}:${(Number(totals[i]) / 1e18).toFixed(0)}`).join(', ')}`)
      const MIN_FUND = parseEther('50000')
      for (let i = 0; i < 5; i++) {
        const needed = totals[i] * 2n + MIN_FUND
        const curBal = await pc.readContract({ address: resourceTokens[i].addr, abi: ABI.erc20Bal, functionName: 'balanceOf', args: [CONTRACTS.mining] }).catch(() => 0n)
        if (curBal >= needed) { log(`  ✅ ${resourceTokens[i].sym} 充足 (${(Number(curBal) / 1e18).toFixed(0)})`, 'success'); continue }
        const mintAmt = needed - curBal
        log(`  🪙 Mint ${(Number(mintAmt) / 1e18).toFixed(0)} ${resourceTokens[i].sym}...`)
        await sendTx(wc, pc, resourceTokens[i].addr, ABI.erc20Mint, 'mint', [CONTRACTS.mining, mintAmt])
        log(`  ✅ ${resourceTokens[i].sym} 充值完成`, 'success')
      }
      log('🎉 奖励池充值完成！', 'success')
    } catch(e) { log('❌ ' + (e.shortMessage || e.message), 'error') }
    setBusy(false)
  }

  if (!address) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', flexDirection:'column', gap:12, color:'var(--text-dim)' }}>
      <div style={{ fontSize:48, opacity:.3 }}>🛠</div>
      <p>请先连接钱包</p>
    </div>
  )

  if (!isAdmin) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', flexDirection:'column', gap:12 }}>
      <div style={{ fontSize:48, opacity:.3 }}>🔒</div>
      <p style={{ color:'var(--text-dim)' }}>仅管理员可访问</p>
      <p style={{ fontSize:12, color:'var(--text-dim)', fontFamily:'monospace' }}>{address?.slice(0, 20)}...</p>
    </div>
  )

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h1>🛠 管理员工具</h1>
        <p style={{ fontSize:'.75rem', color:'#52c462' }}>✅ 已验证：{address?.slice(0, 10)}…</p>
      </div>

      <div className="admin-section">
        <div className="admin-section-title">🎁 铸造 NFT</div>
        <div className="admin-grid">
          <div className="admin-card">
            <div className="ac-title">🧙 使徒</div>
            <div className="ac-desc">铸造使徒 NFT 到当前钱包<br/>力量30-95，5种元素循环</div>
            <div className="ac-row">
              <label>数量</label>
              <input type="number" min="1" max="50" value={mintCount.apo}
                onChange={e => setMintCount(p => ({ ...p, apo: e.target.value }))}
                style={{ width:60, textAlign:'center' }} />
            </div>
            <button className="admin-btn-sm" onClick={mintApostles} disabled={busy}>铸造使徒</button>
          </div>
          <div className="admin-card">
            <div className="ac-title">⛏️ 钻头</div>
            <div className="ac-desc">铸造钻头 NFT 到当前钱包<br/>1-5星，5种元素亲和循环</div>
            <div className="ac-row">
              <label>数量</label>
              <input type="number" min="1" max="50" value={mintCount.drl}
                onChange={e => setMintCount(p => ({ ...p, drl: e.target.value }))}
                style={{ width:60, textAlign:'center' }} />
            </div>
            <button className="admin-btn-sm" onClick={mintDrills} disabled={busy}>铸造钻头</button>
          </div>
        </div>
      </div>

      <div className="admin-section">
        <div className="admin-section-title">⚡ 快速操作</div>
        <div className="admin-grid">
          <div className="admin-card">
            <div className="ac-title">🏛 批量挂市场</div>
            <div className="ac-desc">自动检查授权状态（已授权不重复发交易）<br/>使徒/钻头/土地各挂最多10个</div>
            <button className="admin-btn-sm" onClick={listToMarket} disabled={busy}>批量挂单</button>
          </div>
          <div className="admin-card">
            <div className="ac-title">⚒️ 批量开挖矿</div>
            <div className="ac-desc">自动检查授权，将持有的使徒+钻头<br/>放到持有土地上挖矿</div>
            <button className="admin-btn-sm" onClick={startMining} disabled={busy}>开始挖矿</button>
          </div>
          <div className="admin-card" style={{ border:'1px solid #f0a04044' }}>
            <div className="ac-title" style={{ color:'#f0c040' }}>💰 充值奖励池</div>
            <div className="ac-desc">Mint 资源 token 到 Mining 合约<br/>用户才能正常领取挖矿收益</div>
            <button className="admin-btn-sm" style={{ background:'linear-gradient(135deg,#806010,#404000)' }}
              onClick={fundRewardPool} disabled={busy}>充值奖励池</button>
          </div>
        </div>
      </div>

      {logs.length > 0 && (
        <div className="admin-log" id="alog">
          <div className="log-title">操作日志 ({logs.length})</div>
          {logs.map((l, i) => (
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
