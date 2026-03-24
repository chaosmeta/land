const fs=require('fs'),path=require('path')
function walk(d){return fs.readdirSync(d).flatMap(f=>{const p=path.join(d,f);return fs.statSync(p).isDirectory()&&!['node_modules','dist','.git'].includes(f)?walk(p):[p]})}

const WAGMI_HOOKS=[
  'useReadContract','useReadContracts','useWriteContract','useWaitForTransactionReceipt',
  'useBalance','useConnect','useDisconnect','useSwitchChain','useContractRead',
  'useContractWrite','usePrepareContractWrite','useToken','useNetwork','useFeeData',
  'useBlockNumber','useEnsName','useEnsAddress','useSignMessage','useSignTypedData',
]

walk('src').filter(f=>f.endsWith('.jsx')||f.endsWith('.js')).forEach(f=>{
  const c=fs.readFileSync(f,'utf8')
  const found=[]
  WAGMI_HOOKS.forEach(h=>{
    // 被调用但没被import（从 wagmi 或 WalletContext 都没有）
    if(c.includes(h+'(')&&!c.includes(`import.*${h}`)){
      found.push(h)
    }
  })
  if(found.length) console.log(path.relative('.',f)+': CALLED BUT NOT IMPORTED: '+found.join(', '))
})
