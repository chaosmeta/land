// recall_all_lands.mjs — 把所有拍卖中的土地撤回到部署者钱包
import { createWalletClient, createPublicClient, http, encodeFunctionData } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const PK = '0x7f9b1b073f152dc2323951c1646dc39de761ac10bd14b3eda9d37bbc6a8813cf'
const bscTestnet = {
  id: 97, name: 'BSC Testnet',
  nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  rpcUrls: { default: { http: ['https://bsc-testnet-rpc.publicnode.com'] } }
}
const account = privateKeyToAccount(PK)
const wc = createWalletClient({ account, chain: bscTestnet, transport: http('https://bsc-testnet-rpc.publicnode.com') })
const pc = createPublicClient({ chain: bscTestnet, transport: http('https://bsc-testnet-rpc.publicnode.com') })

const DEPLOYER = '0xe149fd4EFc7485ffae69f844bc93EA87a6a2e5b2'
const LAND     = '0x889DCe5b3934D56f3814f93793F8e1f8710249ea'
const OLD_AUC  = '0xfACc3eaD5EA9Ec5F2fe56568918b21Fb3b899284'
const NFT_AUC  = '0xe489Fd17B4aBF3b22482Bf0f09193f9902f1fd22'

const OWN_ABI = [{ type:'function', name:'ownerOf', inputs:[{name:'id',type:'uint256'}], outputs:[{type:'address'}], stateMutability:'view' }]

// 旧拍卖：cancelAuction(uint256 id)
const OLD_CANCEL_ABI = [{ type:'function', name:'cancelAuction', inputs:[{name:'id',type:'uint256'}], outputs:[], stateMutability:'nonpayable' }]
const OLD_AUC_ABI    = [{ type:'function', name:'auctions', inputs:[{name:'id',type:'uint256'}], outputs:[{name:'seller',type:'address'},{name:'startPrice',type:'uint128'},{name:'endPrice',type:'uint128'},{name:'duration',type:'uint64'},{name:'startedAt',type:'uint64'}], stateMutability:'view' }]

// 新拍卖：cancelAuction(address nft, uint256 id)
const NFT_CANCEL_ABI = [{ type:'function', name:'cancelAuction', inputs:[{name:'nft',type:'address'},{name:'id',type:'uint256'}], outputs:[], stateMutability:'nonpayable' }]
const NFT_AUC_ABI    = [{ type:'function', name:'getAuction', inputs:[{name:'nft',type:'address'},{name:'id',type:'uint256'}], outputs:[{components:[{name:'nftContract',type:'address'},{name:'seller',type:'address'},{name:'startPrice',type:'uint128'},{name:'endPrice',type:'uint128'},{name:'duration',type:'uint64'},{name:'startedAt',type:'uint64'}],type:'tuple'}], stateMutability:'view' }]

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function sendTx(to, abi, fn, args) {
  const data = encodeFunctionData({ abi, functionName: fn, args })
  for (let r = 0; r < 3; r++) {
    try {
      const gas = await pc.estimateGas({ account: account.address, to, data }).catch(() => 300_000n)
      const hash = await wc.sendTransaction({ to, data, gas: gas * 130n / 100n })
      const receipt = await pc.waitForTransactionReceipt({ hash, timeout: 120000 })
      if (receipt.status === 'reverted') throw new Error('reverted')
      await sleep(600)
      return hash
    } catch(e) {
      const m = (e.message||'').toLowerCase()
      if ((m.includes('rate')||m.includes('429')||m.includes('nonce')) && r < 2) { await sleep(3000*(r+1)); continue }
      throw e
    }
  }
}

async function main() {
  console.log('Deployer:', account.address)
  const bal = await pc.getBalance({ address: account.address })
  console.log('BNB:', Number(bal)/1e18)

  // 扫描所有60块地
  let recalledOld = 0, recalledNew = 0
  for (let x = 0; x < 12; x++) {
    for (let y = 0; y < 5; y++) {
      const id = x * 100 + y + 1

      const owner = await pc.readContract({ address: LAND, abi: OWN_ABI, functionName: 'ownerOf', args: [BigInt(id)] }).catch(() => null)
      if (!owner) continue
      const o = owner.toLowerCase()

      // 旧拍卖合约
      if (o === OLD_AUC.toLowerCase()) {
        const auc = await pc.readContract({ address: OLD_AUC, abi: OLD_AUC_ABI, functionName: 'auctions', args: [BigInt(id)] }).catch(() => null)
        if (auc && auc[4] > 0n) {
          process.stdout.write(`  取消旧拍卖 土地 #${id}...`)
          try {
            await sendTx(OLD_AUC, OLD_CANCEL_ABI, 'cancelAuction', [BigInt(id)])
            console.log(' ✅')
            recalledOld++
          } catch(e) { console.log(' ❌', e.message.slice(0, 60)) }
        }
        continue
      }

      // 新NFT拍卖合约
      if (o === NFT_AUC.toLowerCase()) {
        const auc = await pc.readContract({ address: NFT_AUC, abi: NFT_AUC_ABI, functionName: 'getAuction', args: [LAND, BigInt(id)] }).catch(() => null)
        if (auc && auc.startedAt > 0n) {
          process.stdout.write(`  取消新拍卖 土地 #${id}...`)
          try {
            await sendTx(NFT_AUC, NFT_CANCEL_ABI, 'cancelAuction', [LAND, BigInt(id)])
            console.log(' ✅')
            recalledNew++
          } catch(e) { console.log(' ❌', e.message.slice(0, 60)) }
        }
        continue
      }
    }
  }

  console.log(`\n完成！取回旧拍卖: ${recalledOld}块，新拍卖: ${recalledNew}块`)

  // 验证最终状态
  let inWallet = 0
  for (let x = 0; x < 12; x++) for (let y = 0; y < 5; y++) {
    const id = x * 100 + y + 1
    const owner = await pc.readContract({ address: LAND, abi: OWN_ABI, functionName: 'ownerOf', args: [BigInt(id)] }).catch(() => null)
    if (owner?.toLowerCase() === DEPLOYER.toLowerCase()) inWallet++
  }
  console.log(`钱包里的土地: ${inWallet} / 60`)
}

main().catch(e => { console.error(e.message); process.exit(1) })
