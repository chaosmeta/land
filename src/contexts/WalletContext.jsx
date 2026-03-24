// src/contexts/WalletContext.jsx
// 完全基于 window.ethereum，支持 MetaMask / OKX / TokenPocket
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { createWalletClient, custom, createPublicClient, http } from 'viem'

export const bscTestnet = {
  id: 97,
  name: 'BSC Testnet',
  nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  rpcUrls: { default: { http: ['https://bsc-testnet-rpc.publicnode.com'] } },
  blockExplorers: { default: { name: 'BscScan', url: 'https://testnet.bscscan.com' } },
  contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11', blockCreated: 17422483 } },
  testnet: true,
}

const BSC_CHAIN_PARAMS = {
  chainId: '0x61',
  chainName: 'BSC Testnet',
  nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  rpcUrls: ['https://bsc-testnet-rpc.publicnode.com'],
  blockExplorerUrls: ['https://testnet.bscscan.com'],
}

// 全局读链客户端
export const publicClient = createPublicClient({
  chain: bscTestnet,
  transport: http('https://bsc-testnet-rpc.publicnode.com'),
})

// 检测当前环境有哪些钱包
function detectWallets() {
  const wallets = []
  const eth = window.ethereum
  if (!eth) return wallets
  // 多钱包环境（EIP-6963 / window.ethereum.providers）
  const providers = eth.providers || (eth._isMM || eth.isMetaMask ? [eth] : [eth])
  const list = Array.isArray(providers) ? providers : [eth]
  list.forEach(p => {
    if (p.isMetaMask && !p.isOKExWallet) wallets.push({ name: 'MetaMask', icon: '🦊', provider: p })
    else if (p.isOKExWallet || p.isOKX)  wallets.push({ name: 'OKX',      icon: '⭕', provider: p })
    else if (p.isTokenPocket)             wallets.push({ name: 'TP钱包',   icon: '🎒', provider: p })
    else if (!wallets.length)             wallets.push({ name: '钱包',     icon: '👛', provider: p })
  })
  // 去重
  return wallets.filter((w, i, arr) => arr.findIndex(x => x.provider === w.provider) === i)
}

const WalletCtx = createContext(null)

export function WalletProvider({ children }) {
  const [address, setAddress]   = useState('')
  const [chainId, setChainId]   = useState(0)
  const [pending, setPending]   = useState(false)
  const [wallets, setWallets]   = useState([])
  const [showPicker, setShowPicker] = useState(false)
  const providerRef = useRef(null)
  const wcRef       = useRef(null)

  function buildWalletClient(provider) {
    if (!provider) return null
    providerRef.current = provider
    wcRef.current = createWalletClient({ chain: bscTestnet, transport: custom(provider) })
    return wcRef.current
  }

  async function switchToBSC(provider) {
    try {
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x61' }] })
    } catch (e) {
      if (e.code === 4902 || e.code === -32603) {
        await provider.request({ method: 'wallet_addEthereumChain', params: [BSC_CHAIN_PARAMS] })
      }
    }
  }

  // 页面加载时恢复已连接状态
  useEffect(() => {
    const eth = window.ethereum
    if (!eth) return
    eth.request({ method: 'eth_accounts' }).then(accs => {
      if (accs[0]) { setAddress(accs[0]); buildWalletClient(eth) }
    }).catch(() => {})
    eth.request({ method: 'eth_chainId' }).then(id => setChainId(parseInt(id, 16))).catch(() => {})
    const onAcc   = accs => { setAddress(accs[0] || ''); if (accs[0]) buildWalletClient(eth) }
    const onChain = id   => setChainId(parseInt(id, 16))
    eth.on('accountsChanged', onAcc)
    eth.on('chainChanged', onChain)
    return () => { eth.removeListener?.('accountsChanged', onAcc); eth.removeListener?.('chainChanged', onChain) }
  }, [])

  // 用指定 provider 连接
  async function connectWith(provider) {
    setPending(true)
    setShowPicker(false)
    try {
      const accs = await provider.request({ method: 'eth_requestAccounts' })
      if (!accs?.[0]) throw new Error('No accounts')
      setAddress(accs[0])
      buildWalletClient(provider)
      await switchToBSC(provider)
      const id = await provider.request({ method: 'eth_chainId' })
      setChainId(parseInt(id, 16))
    } catch (e) {
      if (e.code !== 4001) console.error('connect error:', e)
    } finally { setPending(false) }
  }

  const connectWallet = useCallback(() => {
    if (typeof window === 'undefined' || !window.ethereum) {
      alert('请安装 MetaMask、OKX 或 TokenPocket 钱包')
      return
    }
    const detected = detectWallets()
    setWallets(detected)
    if (detected.length === 1) {
      connectWith(detected[0].provider)
    } else if (detected.length > 1) {
      setShowPicker(true)
    } else {
      connectWith(window.ethereum)
    }
  }, [])

  const disconnectWallet = useCallback(() => {
    setAddress(''); wcRef.current = null; providerRef.current = null
  }, [])

  const value = {
    address, chainId,
    isConnected:    !!address,
    isCorrectChain: chainId === 97,
    isPending:      pending,
    showPicker,
    wallets,
    connectWallet,
    connectWith,
    disconnectWallet,
    setShowPicker,
    getWalletClient: () => wcRef.current || (providerRef.current ? buildWalletClient(providerRef.current) : null),
    publicClient,
  }

  return (
    <WalletCtx.Provider value={value}>
      {children}
      {showPicker && <WalletPicker wallets={wallets} onSelect={connectWith} onClose={() => setShowPicker(false)} />}
    </WalletCtx.Provider>
  )
}

// 钱包选择弹窗
function WalletPicker({ wallets, onSelect, onClose }) {
  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.7)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'#1a1428',border:'1px solid #3a2a5a',borderRadius:16,padding:24,minWidth:260,boxShadow:'0 8px 32px rgba(0,0,0,.6)'}}>
        <div style={{fontFamily:'monospace',fontSize:'.85rem',color:'#c090ff',marginBottom:16,textAlign:'center',letterSpacing:'.1em'}}>选择钱包</div>
        {wallets.map((w, i) => (
          <button key={i} onClick={() => onSelect(w.provider)} style={{
            display:'flex',alignItems:'center',gap:12,width:'100%',padding:'12px 16px',
            background:'#0d0a1a',border:'1px solid #2a1a4a',borderRadius:10,cursor:'pointer',
            color:'#e0d0ff',fontFamily:'monospace',fontSize:'.9rem',marginBottom:8,transition:'all .15s',
          }}
          onMouseEnter={e=>e.target.style.borderColor='#7a40cc'}
          onMouseLeave={e=>e.target.style.borderColor='#2a1a4a'}>
            <span style={{fontSize:'1.4rem'}}>{w.icon}</span>
            <span>{w.name}</span>
          </button>
        ))}
        <button onClick={onClose} style={{width:'100%',padding:'8px',background:'none',border:'none',color:'#5040a0',cursor:'pointer',fontFamily:'monospace',fontSize:'.75rem',marginTop:4}}>取消</button>
      </div>
    </div>
  )
}

export function useWallet() {
  const ctx = useContext(WalletCtx)
  if (!ctx) throw new Error('useWallet must be inside WalletProvider')
  return ctx
}

// ── 兼容层（替换 wagmi hooks）────────────────────────────────────────────
export function useAccount() {
  const { address, isConnected, chainId } = useWallet()
  return { address, isConnected, chainId, chain: isConnected ? bscTestnet : undefined }
}

export function useWalletClient() {
  const { getWalletClient, isConnected } = useWallet()
  return { data: isConnected ? getWalletClient() : null }
}

export function usePublicClient() {
  return publicClient
}
