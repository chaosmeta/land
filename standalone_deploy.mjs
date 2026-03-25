// standalone_deploy.mjs — 独立 viem 部署，不 require hardhat
import { createWalletClient, createPublicClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { readFileSync, writeFileSync } from 'fs'

const RPC = 'https://bsc-testnet-rpc.publicnode.com'
const bscTestnet = {
  id: 97,
  name: 'BSC Testnet',
  nativeCurrency: { name:'BNB', symbol:'BNB', decimals:18 },
  rpcUrls: { default: { http: [RPC] } }
}

const PK = process.env.PRIVATE_KEY
if (!PK) { console.error('Set PRIVATE_KEY env var'); process.exit(1) }

const account = privateKeyToAccount(PK.startsWith('0x') ? PK : '0x'+PK)
const wc = createWalletClient({ account, chain: bscTestnet, transport: http(RPC) })
const pc = createPublicClient({ chain: bscTestnet, transport: http(RPC) })

const CONTRACTS = {
  ring:'0x3fa38920EED345672dF7FF916b5EbE4f095822aE',
  gold:'0x5E4b633ae293ec4e000B5934D68997E45D8Bc0B9',
  wood:'0xD91824b6130DdEf7ffd6b07C1AeFD1ebA60A3b37',
  water:'0x2FFac338404fadd6c551AcED8197E781Ffa6205C',
  fire:'0xc2d43F4655320227DaeaA0475E3254C83892D487',
  soil:'0x865607c7d948655a32da9bE40c70A16Ecae35572',
  land:'0x889DCe5b3934D56f3814f93793F8e1f8710249ea',
  drill:'0x782827AdA353d4f958964e1E10D5d940e4B38409',
  apostle:'0xbBce394d561E67bA9C0720d3aD56b25bC12Ee4f0',
}

async function main() {
  console.log('Deployer:', account.address)
  const bal = await pc.getBalance({ address: account.address })
  console.log('BNB balance:', Number(bal) / 1e18)

  const upgradeArt = JSON.parse(readFileSync('./artifacts/contracts/UpgradeSystem.sol/UpgradeSystem.json','utf8'))
  const rentalArt  = JSON.parse(readFileSync('./artifacts/contracts/LandRental.sol/LandRental.json','utf8'))
  const elements   = [CONTRACTS.gold, CONTRACTS.wood, CONTRACTS.water, CONTRACTS.fire, CONTRACTS.soil]

  // 1. Deploy UpgradeSystem
  console.log('\n[1/5] Deploying UpgradeSystem...')
  const h1 = await wc.deployContract({
    abi: upgradeArt.abi,
    bytecode: upgradeArt.bytecode,
    args: [elements, CONTRACTS.apostle, CONTRACTS.drill, CONTRACTS.land]
  })
  console.log('  tx:', h1)
  const r1 = await pc.waitForTransactionReceipt({ hash: h1, timeout: 120000 })
  const upgradeAddr = r1.contractAddress
  console.log('  ✅ UpgradeSystem:', upgradeAddr)

  // 2. Deploy LandRental
  console.log('\n[2/5] Deploying LandRental...')
  const h2 = await wc.deployContract({
    abi: rentalArt.abi,
    bytecode: rentalArt.bytecode,
    args: [CONTRACTS.land, CONTRACTS.ring]
  })
  console.log('  tx:', h2)
  const r2 = await pc.waitForTransactionReceipt({ hash: h2, timeout: 120000 })
  const rentalAddr = r2.contractAddress
  console.log('  ✅ LandRental:', rentalAddr)

  // 3-5. setOperator on Apostle, Drill, Land
  const setOpABI = [{ type:'function', name:'setOperator', inputs:[{name:'a',type:'address'},{name:'v',type:'bool'}], outputs:[] }]
  for (const [name, addr] of [['Apostle',CONTRACTS.apostle],['Drill',CONTRACTS.drill],['Land',CONTRACTS.land]]) {
    console.log(`\n[*] setOperator(${name}, UpgradeSystem)...`)
    const h = await wc.writeContract({ address: addr, abi: setOpABI, functionName: 'setOperator', args: [upgradeAddr, true] })
    await pc.waitForTransactionReceipt({ hash: h, timeout: 60000 })
    console.log('  ✅', name, 'authorized')
  }

  console.log('\n=============================')
  console.log('UPGRADE_ADDR:', upgradeAddr)
  console.log('RENTAL_ADDR: ', rentalAddr)
  console.log('=============================')

  // 写入结果文件
  writeFileSync('./deployed_new_contracts.json', JSON.stringify({ upgradeAddr, rentalAddr }, null, 2))
  console.log('\n结果已保存到 deployed_new_contracts.json')
}

main().catch(e => { console.error(e.message || e); process.exit(1) })
