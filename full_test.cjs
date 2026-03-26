const {createPublicClient,http,toFunctionSelector} = require('viem')
const bscTestnet={id:97,nativeCurrency:{name:'BNB',symbol:'BNB',decimals:18},rpcUrls:{default:{http:['https://bsc-testnet-rpc.publicnode.com']}},contracts:{multicall3:{address:'0xcA11bde05977b3631167028862bE2a173976CA11'}}}
const pc=createPublicClient({chain:bscTestnet,transport:http('https://bsc-testnet-rpc.publicnode.com')})

const NFT_AUC='0xe489Fd17B4aBF3b22482Bf0f09193f9902f1fd22'
const APOSTLE='0xbBce394d561E67bA9C0720d3aD56b25bC12Ee4f0'
const DRILL='0x782827AdA353d4f958964e1E10D5d940e4B38409'
const LAND='0x889DCe5b3934D56f3814f93793F8e1f8710249ea'
const BB='0xfa15ce0b6021f84f93e355e6ab22346f7534f049'
const UPGRADE='0xd8083a57b479bb920d52f0db2257936023b49ea7'

const AUC_ABI=[{type:'function',name:'getAuction',inputs:[{name:'nft',type:'address'},{name:'id',type:'uint256'}],outputs:[{components:[{name:'nftContract',type:'address'},{name:'seller',type:'address'},{name:'startPrice',type:'uint128'},{name:'endPrice',type:'uint128'},{name:'duration',type:'uint64'},{name:'startedAt',type:'uint64'}],type:'tuple'}],stateMutability:'view'}]
const APO_ABI=[{type:'function',name:'breedFee',inputs:[],outputs:[{type:'uint256'}],stateMutability:'view'},{type:'function',name:'nextId',inputs:[],outputs:[{type:'uint256'}],stateMutability:'view'}]
const BB_ABI=[{type:'function',name:'apostleBoxPrice',inputs:[],outputs:[{type:'uint256'}],stateMutability:'view'},{type:'function',name:'drillBoxPrice',inputs:[],outputs:[{type:'uint256'}],stateMutability:'view'}]
const UP_ABI=[{type:'function',name:'apostleUpgradeCost',inputs:[{name:'',type:'uint256'}],outputs:[{type:'uint256'}],stateMutability:'view'},{type:'function',name:'drillMergeCost',inputs:[{name:'',type:'uint256'}],outputs:[{type:'uint256'}],stateMutability:'view'},{type:'function',name:'landChargeCost',inputs:[{name:'',type:'uint256'}],outputs:[{type:'uint256'}],stateMutability:'view'}]

async function main(){
  console.log('=== 7. NFT市场活跃度 ===')
  let apoAuctions=0, drlAuctions=0, landAuctions=0
  for(let id=1;id<=50;id++){
    const [apoA,drlA] = await Promise.all([
      pc.readContract({address:NFT_AUC,abi:AUC_ABI,functionName:'getAuction',args:[APOSTLE,BigInt(id)]}).catch(()=>null),
      pc.readContract({address:NFT_AUC,abi:AUC_ABI,functionName:'getAuction',args:[DRILL,BigInt(id)]}).catch(()=>null),
    ])
    if(apoA&&apoA.startedAt>0n) apoAuctions++
    if(drlA&&drlA.startedAt>0n) drlAuctions++
  }
  for(let x=0;x<12;x++) for(let y=0;y<5;y++){
    const id=x*100+y+1
    const a=await pc.readContract({address:NFT_AUC,abi:AUC_ABI,functionName:'getAuction',args:[LAND,BigInt(id)]}).catch(()=>null)
    if(a&&a.startedAt>0n) landAuctions++
  }
  console.log('  使徒拍卖:', apoAuctions, '个活跃')
  console.log('  钻头拍卖:', drlAuctions, '个活跃')
  console.log('  土地拍卖:', landAuctions, '个活跃')

  console.log('\n=== 8. Apostle 繁殖配置 ===')
  const [fee,nextApo] = await Promise.all([
    pc.readContract({address:APOSTLE,abi:APO_ABI,functionName:'breedFee'}).catch(()=>0n),
    pc.readContract({address:APOSTLE,abi:APO_ABI,functionName:'nextId'}).catch(()=>0n),
  ])
  console.log('  繁殖费:', Number(fee)/1e18, 'RING')
  console.log('  使徒总数:', Number(nextApo)-1)

  console.log('\n=== 9. BlindBox 验证 ===')
  const [apoPx,drlPx]=await Promise.all([
    pc.readContract({address:BB,abi:BB_ABI,functionName:'apostleBoxPrice'}).catch(()=>null),
    pc.readContract({address:BB,abi:BB_ABI,functionName:'drillBoxPrice'}).catch(()=>null),
  ])
  console.log('  使徒盲盒价格:', apoPx?Number(apoPx)/1e18+'RING':'null')
  console.log('  钻头盲盒价格:', drlPx?Number(drlPx)/1e18+'RING':'null')

  console.log('\n=== 10. UpgradeSystem 费用 ===')
  const apoC=[],drlC=[],landC=[]
  for(let i=1;i<=4;i++) apoC.push(await pc.readContract({address:UPGRADE,abi:UP_ABI,functionName:'apostleUpgradeCost',args:[BigInt(i)]}).catch(()=>0n))
  for(let i=1;i<=4;i++) drlC.push(await pc.readContract({address:UPGRADE,abi:UP_ABI,functionName:'drillMergeCost',args:[BigInt(i)]}).catch(()=>0n))
  for(let i=0;i<=2;i++) landC.push(await pc.readContract({address:UPGRADE,abi:UP_ABI,functionName:'landChargeCost',args:[BigInt(i)]}).catch(()=>0n))
  console.log('  使徒升星:', apoC.map((v,i)=>((i+1)+'->'+Number(v)/1e18)).join(' '))
  console.log('  钻头合成:', drlC.map((v,i)=>((i+1)+'->'+Number(v)/1e18)).join(' '))
  console.log('  地块充能:', landC.map((v,i)=>(i+'->'+Number(v)/1e18)).join(' '))
}
main().catch(e=>console.error(e.message))
