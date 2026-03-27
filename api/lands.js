// api/lands.js — 土地数据索引（快速版）
// 直接 multicall 读60块已知土地的属性，不扫 Transfer 事件
// 土地不会增减（固定60块），只需读属性即可
import { createPublicClient, http } from 'viem'

const bscTestnet = {
  id: 97, name: 'BSC Testnet',
  nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  rpcUrls: { default: { http: ['https://bsc-testnet-rpc.publicnode.com'] } },
}
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

// 已知的60块土地ID（x=0-11, y=0-4，即id=x*100+y+1）
const LAND_IDS = []
for (let x = 0; x < 12; x++) for (let y = 0; y < 5; y++) LAND_IDS.push(x * 100 + y + 1)

let cache = null, cacheTime = 0
const TTL = 5 * 60 * 1000  // 5分钟

async function fetchLands() {
  const now = Date.now()
  if (cache && now - cacheTime < TTL) return cache

  // 一次 multicall 读所有土地属性（60个）
  const [raRes, ownerRes, slotRes] = await Promise.all([
    pc.multicall({
      contracts: LAND_IDS.map(id => ({ address: LAND, abi: LAND_ABI, functionName: 'resourceAttr', args: [BigInt(id)] })),
      allowFailure: true
    }),
    pc.multicall({
      contracts: LAND_IDS.map(id => ({ address: LAND, abi: LAND_ABI, functionName: 'ownerOf', args: [BigInt(id)] })),
      allowFailure: true
    }),
    pc.multicall({
      contracts: LAND_IDS.map(id => ({ address: MINING, abi: MINING_ABI, functionName: 'slotCount', args: [BigInt(id)] })),
      allowFailure: true
    }),
  ])

  const lands = []
  LAND_IDS.forEach((id, i) => {
    const owner = ownerRes[i]?.result
    if (!owner || owner === '0x0000000000000000000000000000000000000000') return
    const ra = raRes[i]?.result ?? 0n
    const sl = Number(slotRes[i]?.result ?? 0n)
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
  // CDN 缓存5分钟，stale-while-revalidate 后台刷新
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
