const fs=require('fs'),path=require('path')

// 1. BlindBoxPage — 只能买1个，没有批量购买，且买完跳资产页但资产页没有立刻显示NFT
// 已经在AssetsPage的BlindBoxTab里有批量购买了，BlindBoxPage是独立入口，保留但升级

// 2. WorldMap — ELEMS 用的是局部定义 (c,i格式)，而 drillImgUrl 里 color 字段叫 color 不是 c
// 检查 WorldMap 里 ELEMS 定义
const wm = fs.readFileSync('src/pages/WorldMap.jsx','utf8')
const elemsMatch = wm.match(/const ELEMS=\[.*?\]/s)
console.log('WorldMap ELEMS:', elemsMatch?.[0]?.slice(0,200))

// 3. 检查 ELEMS[x].color vs ELEMS[x].c
const colorRefs = wm.match(/ELEMS\[.+?\]\.(color|c)\b/g)||[]
console.log('\nELEMS color refs:', [...new Set(colorRefs)])

// 4. 检查 AssetsPage BlindBoxTab 和 BlindBoxPage 的功能重叠
const as = fs.readFileSync('src/pages/AssetsPage.jsx','utf8')
const hasBatchBuy = as.includes('buyApostleBoxBatch')
console.log('\nAssetsPage has batch buy:', hasBatchBuy)

// 5. 检查 MiningTab 里 stopMining 参数是否正确
const miningStop = as.match(/stopMining.*args.*/g)||[]
console.log('\nMining stop calls:', miningStop)

// 6. 检查 WorldMap 的 CONTRACTS.apostle / CONTRACTS.drill — 这些在 CONTRACTS 里但 WorldMap 直接写了
const hasContracts = wm.match(/CONTRACTS\.(apostle|drill)/g)||[]
console.log('\nWorldMap CONTRACTS refs:', [...new Set(hasContracts)])
