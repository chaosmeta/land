// api/lands.js — 土地数据索引（扫全部已铸造土地）
import { createPublicClient, http } from 'viem'
import { bscTestnet } from 'viem/chains'

const pc = createPublicClient({ chain: bscTestnet, transport: http('https://bsc-testnet-rpc.publicnode.com') })

const LAND   = '0x889DCe5b3934D56f3814f93793F8e1f8710249ea'
const MINING = '0x984337501c1cb1f891c3dae3dcd1e0e9c2b1d228'

const LAND_ABI = [
  { type:'function', name:'resourceAttr', inputs:[{name:'tokenId',type:'uint256'}], outputs:[{type:'uint80'}], stateMutability:'view' },
  { type:'function', name:'ownerOf',      inputs:[{name:'id',type:'uint256'}],      outputs:[{type:'address'}], stateMutability:'view' },
]
const MINING_ABI = [
  { type:'function', name:'slotCount', inputs:[{name:'landId',type:'uint256'}], outputs:[{type:'uint256'}], stateMutability:'view' },
]

// 动态扫描所有已铸造土地（x=0-39, y=0-9，覆盖所有已知铸造区域）
// 扫描范围比实际铸造范围大一些，ownerOf != 零地址的才算铸造
const SCAN_IDS = []
for (let x = 0; x < 40; x++) for (let y = 0; y < 10; y++) SCAN_IDS.push(x * 100 + y + 1)

let cache = null, cacheTime = 0
const TTL = 5 * 60 * 1000  // 5分钟

async function fetchLands() {
  const now = Date.now()
  if (cache && now - cacheTime < TTL) return cache

  const BATCH = 100
  const allOwners = [], allAttrs = [], allSlots = []

  // 分批 multicall
  for (let i = 0; i < SCAN_IDS.length; i += BATCH) {
    const batch = SCAN_IDS.slice(i, i + BATCH)
    const [ownerRes, raRes, slotRes] = await Promise.all([
      pc.multicall({ contracts: batch.map(id => ({ address: LAND, abi: LAND_ABI, functionName: 'ownerOf', args: [BigInt(id)] })), allowFailure: true }),
      pc.multicall({ contracts: batch.map(id => ({ address: LAND, abi: LAND_ABI, functionName: 'resourceAttr', args: [BigInt(id)] })), allowFailure: true }),
      pc.multicall({ contracts: batch.map(id => ({ address: MINING, abi: MINING_ABI, functionName: 'slotCount', args: [BigInt(id)] })), allowFailure: true }),
    ])
    allOwners.push(...ownerRes)
    allAttrs.push(...raRes)
    allSlots.push(...slotRes)
  }

  const lands = []
  SCAN_IDS.forEach((id, i) => {
    const owner = allOwners[i]?.result
    // 只有 ownerOf 返回非零地址才算已铸造
    if (!owner || owner === '0x0000000000000000000000000000000000000000') return
    const ra = allAttrs[i]?.result ?? 0n
    const sl = Number(allSlots[i]?.result ?? 0n)
    const b = BigInt(ra)
    const resources = [
      Number(b & 0xffffn),
      Number((b >> 16n) & 0xffffn),
      Number((b >> 32n) & 0xffffn),
      Number((b >> 48n) & 0xffffn),
      Number((b >> 64n) & 0xffffn),
    ]
    const col = (id - 1) % 100
    const row = Math.floor((id - 1) / 100)
    lands.push({ id, col, row, resources, miningSlots: sl, owner })
  })

  cache = { lands, total: lands.length, scannedAt: now }
  cacheTime = now
  return cache
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=120')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }
  try {
    const data = await fetchLands()
    res.status(200).json({ ok: true, ...data })
  } catch(e) {
    console.error('lands error:', e)
    res.status(500).json({ ok: false, error: e.message })
  }
}
