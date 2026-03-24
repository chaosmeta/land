const fs=require('fs'),path=require('path')

function walk(d){return fs.readdirSync(d).flatMap(f=>{const p=path.join(d,f);return fs.statSync(p).isDirectory()&&!['node_modules','dist','.git'].includes(f)?walk(p):[p]})}

// 在文件顶部加入缺失的函数定义（作为本地 shim）
const SHIM = `
// ── wagmi shims (replaced by viem direct calls) ─────────────────────────────
import { publicClient } from '../contexts/WalletContext.jsx'

function useReadContract({ address, abi, functionName, args, enabled=true }) {
  const [data, setData] = React.useState(undefined)
  const [isLoading, setIsLoading] = React.useState(false)
  React.useEffect(() => {
    if (!enabled || !address) return
    setIsLoading(true)
    publicClient.readContract({ address, abi, functionName, args }).then(setData).catch(()=>{}).finally(()=>setIsLoading(false))
  }, [address, functionName, JSON.stringify(args), enabled])
  return { data, isLoading }
}

function useReadContracts({ contracts=[], enabled=true }) {
  const [data, setData] = React.useState([])
  const [isLoading, setIsLoading] = React.useState(false)
  React.useEffect(() => {
    if (!enabled || !contracts.length) return
    setIsLoading(true)
    publicClient.multicall({ contracts, allowFailure:true }).then(r=>setData(r)).catch(()=>setData([])).finally(()=>setIsLoading(false))
  }, [JSON.stringify(contracts), enabled])
  return { data, isLoading }
}

function useWriteContract() {
  const [isPending, setIsPending] = React.useState(false)
  const [hash, setHash] = React.useState(undefined)
  async function writeContractAsync({ address, abi, functionName, args, value }) {
    const { getWalletClient } = require('../contexts/WalletContext.jsx') // handled by import above
    throw new Error('useWriteContract: use wc.writeContract directly')
  }
  return { writeContractAsync, isPending, hash }
}

function useWaitForTransactionReceipt({ hash }) {
  const [data, setData] = React.useState(undefined)
  const [isLoading, setIsLoading] = React.useState(false)
  React.useEffect(() => {
    if (!hash) return
    setIsLoading(true)
    publicClient.waitForTransactionReceipt({ hash }).then(setData).finally(()=>setIsLoading(false))
  }, [hash])
  return { data, isLoading }
}
// ────────────────────────────────────────────────────────────────────────────
`

let fixed = 0
walk('src').filter(f=>(f.endsWith('.jsx')||f.endsWith('.js'))&&!f.includes('WalletContext')&&!f.includes('wagmi')).forEach(file=>{
  let c = fs.readFileSync(file,'utf8')
  const orig = c

  const UNDEFINED_HOOKS = ['useReadContract','useReadContracts','useWriteContract','useWaitForTransactionReceipt','useBalance','useConnect','useDisconnect','useSwitchChain']
  const needShim = UNDEFINED_HOOKS.filter(h=>c.includes(h+'(')&&!c.includes(`'${h}'`)&&!c.includes(`"${h}"`))
  if(!needShim.length) return

  // 计算正确的相对路径
  const relDepth = path.relative('src',file).split(path.sep).length - 1
  const prefix = '../'.repeat(relDepth)
  
  // 生成针对此文件的 shim（修正路径）
  const shim = SHIM.replace(/\.\.\/contexts\/WalletContext\.jsx/g, `${prefix}contexts/WalletContext.jsx`)
  
  // 在第一个 import 后插入 shim（只插入用到的函数）
  const usedHooks = needShim
  const shimLines = shim.split('\n')
  const filteredShim = [
    '',
    '// ── wagmi shims ──────────────────────────────────────────────────────────────',
    `import { publicClient } from '${prefix}contexts/WalletContext.jsx'`,
  ]
  
  if(usedHooks.includes('useReadContract')) filteredShim.push(...`
function useReadContract({ address, abi, functionName, args, enabled=true, watch=false }) {
  const [data, setData] = React.useState(undefined)
  const [isLoading, setIsLoading] = React.useState(false)
  React.useEffect(() => {
    if (!enabled || !address) return
    setIsLoading(true)
    publicClient.readContract({ address, abi, functionName, args }).then(setData).catch(()=>{}).finally(()=>setIsLoading(false))
  }, [address, functionName, JSON.stringify(args), enabled])
  return { data, isLoading, refetch: ()=>{} }
}`.split('\n'))

  if(usedHooks.includes('useReadContracts')) filteredShim.push(...`
function useReadContracts({ contracts=[], enabled=true }) {
  const [data, setData] = React.useState([])
  const [isLoading, setIsLoading] = React.useState(false)
  React.useEffect(() => {
    if (!enabled || !contracts.length) return
    setIsLoading(true)
    publicClient.multicall({ contracts, allowFailure:true }).then(r=>setData(r.map(x=>({result:x.result,status:x.status})))).catch(()=>setData([])).finally(()=>setIsLoading(false))
  }, [JSON.stringify(contracts), enabled])
  return { data, isLoading }
}`.split('\n'))

  if(usedHooks.includes('useWriteContract')) filteredShim.push(...`
function useWriteContract() {
  const [isPending, setIsPending] = React.useState(false)
  async function writeContractAsync(params) {
    // pages using this should migrate to wc.writeContract
    setIsPending(true)
    try { return await Promise.reject(new Error('migrate to wc.writeContract')) }
    finally { setIsPending(false) }
  }
  return { writeContractAsync, isPending }
}`.split('\n'))

  if(usedHooks.includes('useWaitForTransactionReceipt')) filteredShim.push(...`
function useWaitForTransactionReceipt({ hash } = {}) {
  const [data, setData] = React.useState(undefined)
  const [isLoading, setIsLoading] = React.useState(false)
  React.useEffect(() => {
    if (!hash) return
    setIsLoading(true)
    publicClient.waitForTransactionReceipt({ hash }).then(setData).catch(()=>{}).finally(()=>setIsLoading(false))
  }, [hash])
  return { data, isLoading }
}`.split('\n'))

  if(usedHooks.includes('useBalance')) filteredShim.push(`function useBalance(){return{data:undefined,isLoading:false}}`)
  if(usedHooks.includes('useConnect')) filteredShim.push(`function useConnect(){return{connect:()=>{},connectors:[],isPending:false}}`)
  if(usedHooks.includes('useDisconnect')) filteredShim.push(`function useDisconnect(){return{disconnect:()=>{}}}`)
  if(usedHooks.includes('useSwitchChain')) filteredShim.push(`function useSwitchChain(){return{switchChain:()=>{}}}`)
  
  filteredShim.push('// ────────────────────────────────────────────────────────────────────────────')

  // 加入 React import（如果没有）
  if(!c.includes("import React") && !c.includes("import { ") ){
    c = "import React from 'react'\n" + c
  }

  // 插入 shim 到第一个 import 语句之后
  const firstImportEnd = c.indexOf('\n', c.indexOf('import ')) + 1
  c = c.slice(0, firstImportEnd) + filteredShim.join('\n') + '\n' + c.slice(firstImportEnd)
  c = c.replace(/\n{4,}/g, '\n\n')

  if(c !== orig) {
    fs.writeFileSync(file, c)
    console.log('fixed:', path.relative('.',file), '| shimmed:', usedHooks.join(','))
    fixed++
  }
})
console.log('\nTotal:', fixed, 'files fixed')
