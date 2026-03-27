// api/listings.js — Vercel Serverless Function
// 只扫最近 3 天区块（BSC 每3秒一块，3天≈86400块）
// 活跃拍卖不可能在3天前挂上去还没成交，所以无需从创世块扫
import { createPublicClient, http, parseAbiItem } from 'viem'

const bscTestnet = {
  id: 97, name: 'BSC Testnet',
  nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  rpcUrls: { default: { http: ['https://bsc-testnet-rpc.publicnode.com'] } },
}
const pc = createPublicClient({ chain: bscTestnet, transport: http('https://bsc-testnet-rpc.publicnode.com') })

const NFT_AUC  = '0xe489Fd17B4aBF3b22482Bf0f09193f9902f1fd22'
const OLD_AUC  = '0xfACc3eaD5EA9Ec5F2fe56568918b21Fb3b899284'
const APOSTLE  = '0xbBce394d561E67bA9C0720d3aD56b25bC12Ee4f0'
const DRILL    = '0x782827AdA353d4f958964e1E10D5d940e4B38409'
const LAND     = '0x889DCe5b3934D56f3814f93793F8e1f8710249ea'

// 拍卖时长最长30天，但大部分3天内成交
// 扫7天确保覆盖所有活跃拍卖（7天 × 28800块/天 = 201600块，仍只需5个chunk）
const SCAN_BLOCKS = 201600n  // ~7天
const CHUNK = 45000n

const E_NFT_CREATED   = parseAbiItem('event AuctionCreated(address indexed nft,uint256 indexed id,address seller,uint128 start,uint128 end,uint64 dur)')
const E_NFT_WON       = parseAbiItem('event AuctionWon(address indexed nft,uint256 indexed id,address buyer,uint256 price)')
const E_NFT_CANCELLED = parseAbiItem('event AuctionCancelled(address indexed nft,uint256 indexed id)')
const E_OLD_CREATED   = parseAbiItem('event AuctionCreated(uint256 indexed id,address seller,uint128 start,uint128 end,uint64 duration)')
const E_OLD_WON       = parseAbiItem('event AuctionWon(uint256 indexed id,address buyer,uint256 price)')
const E_OLD_CANCELLED = parseAbiItem('event AuctionCancelled(uint256 indexed id)')

async function getLogsChunked(address, event, fromBlock, toBlock) {
  const logs = []
  for (let from = fromBlock; from <= toBlock; from += CHUNK) {
    const to = from + CHUNK - 1n > toBlock ? toBlock : from + CHUNK - 1n
    try {
      const chunk = await pc.getLogs({ address, event, fromBlock: from, toBlock: to })
      logs.push(...chunk)
    } catch(e) {
      console.error(`getLogs ${from}-${to}: ${e.message?.slice(0,60)}`)
    }
  }
  return logs
}

// 内存缓存（Serverless 实例存活期间有效）
let cache = null
let cacheTime = 0
const TTL = 3 * 60 * 1000  // 3分钟（短一点，让数据更新更及时）

async function fetchListings() {
  const now = Date.now()
  if (cache && now - cacheTime < TTL) return cache

  const latest = await pc.getBlockNumber()
  // 只扫最近7天，不从创世块扫
  const DEPLOY_BLOCK = 97519000n
  const fromBlock = latest > SCAN_BLOCKS ? latest - SCAN_BLOCKS : DEPLOY_BLOCK
  const actualFrom = fromBlock < DEPLOY_BLOCK ? DEPLOY_BLOCK : fromBlock

  const chunks = Math.ceil(Number(latest - actualFrom) / Number(CHUNK))
  console.log(`Scanning last ${Number(latest - actualFrom)} blocks (${chunks} chunks)`)

  const [nftCreated, nftWon, nftCancelled, oldCreated, oldWon, oldCancelled] = await Promise.all([
    getLogsChunked(NFT_AUC, E_NFT_CREATED,   actualFrom, latest),
    getLogsChunked(NFT_AUC, E_NFT_WON,       actualFrom, latest),
    getLogsChunked(NFT_AUC, E_NFT_CANCELLED, actualFrom, latest),
    getLogsChunked(OLD_AUC, E_OLD_CREATED,   actualFrom, latest),
    getLogsChunked(OLD_AUC, E_OLD_WON,       actualFrom, latest),
    getLogsChunked(OLD_AUC, E_OLD_CANCELLED, actualFrom, latest),
  ])

  // NFTAuction 活跃挂单
  const nftSold = new Set(nftWon.map(e => e.args.nft?.toLowerCase() + '_' + String(e.args.id)))
  const nftCxd  = new Set(nftCancelled.map(e => e.args.nft?.toLowerCase() + '_' + String(e.args.id)))
  const nftActive = nftCreated.filter(e => {
    const k = e.args.nft?.toLowerCase() + '_' + String(e.args.id)
    return !nftSold.has(k) && !nftCxd.has(k)
  })

  // 旧合约活跃挂单
  const oldSold = new Set(oldWon.map(e => String(e.args.id)))
  const oldCxd2 = new Set(oldCancelled.map(e => String(e.args.id)))
  const oldActive = oldCreated.filter(e => !oldSold.has(String(e.args.id)) && !oldCxd2.has(String(e.args.id)))

  const result = {
    apostleIds: nftActive.filter(e => e.args.nft?.toLowerCase() === APOSTLE.toLowerCase()).map(e => Number(e.args.id)),
    drillIds:   nftActive.filter(e => e.args.nft?.toLowerCase() === DRILL.toLowerCase()).map(e => Number(e.args.id)),
    landIds:    nftActive.filter(e => e.args.nft?.toLowerCase() === LAND.toLowerCase()).map(e => Number(e.args.id)),
    oldLandIds: oldActive.map(e => Number(e.args.id)),
    scannedAt:  now,
    fromBlock:  Number(actualFrom),
    toBlock:    Number(latest),
  }

  console.log(`Active: apostles=${result.apostleIds.length} drills=${result.drillIds.length} lands=${result.landIds.length + result.oldLandIds.length}`)

  cache = result
  cacheTime = now
  return result
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  // CDN 缓存3分钟，过期后最多等60秒的 stale 响应
  res.setHeader('Cache-Control', 's-maxage=180, stale-while-revalidate=60')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
  try {
    const data = await fetchListings()
    res.status(200).json({ ok: true, ...data })
  } catch(e) {
    console.error('listings error:', e)
    res.status(500).json({ ok: false, error: e.message })
  }
}
