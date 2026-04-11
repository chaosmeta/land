import React from 'react'
import { useWallet } from '../contexts/WalletContext.jsx'
import { useLang } from '../contexts/LangContext.jsx'
import './TopNav.css'

function WalletBtn({ lang }) {
  const { address, isConnected, isCorrectChain, isPending, connectWallet, disconnectWallet } = useWallet()
  const short = a => a ? a.slice(0,6)+'…'+a.slice(-4) : ''

  async function handleSwitchChain() {
    try {
      await window.ethereum?.request({ method:'wallet_switchEthereumChain', params:[{chainId:'0x61'}] })
    } catch(e) {
      if (e.code === 4902) {
        await window.ethereum?.request({ method:'wallet_addEthereumChain', params:[{
          chainId:'0x61', chainName:'BSC Testnet',
          nativeCurrency:{name:'BNB',symbol:'BNB',decimals:18},
          rpcUrls:['https://bsc-testnet-rpc.publicnode.com'],
          blockExplorerUrls:['https://testnet.bscscan.com'],
        }]})
      }
    }
  }

  if (!isConnected) return (
    <button className="nav-connect-btn" onClick={connectWallet} disabled={isPending}>
      {isPending ? (lang==='zh'?'连接中...':'Connecting...') : (lang==='zh'?'连接钱包':'Connect Wallet')}
    </button>
  )
  if (!isCorrectChain) return (
    <button className="nav-connect-btn warn" onClick={handleSwitchChain}>
      ⚠ {lang==='zh'?'切换BSC':'Switch BSC'}
    </button>
  )
  return (
    <button className="nav-connect-btn connected" onClick={disconnectWallet} title={lang==='zh'?'点击断开':'Click to disconnect'}>
      {short(address)}
    </button>
  )
}

export default function TopNav({ pages, current, onChange }) {
  const { lang, toggle } = useLang()
  return (
    <nav className="top-nav">
      <div className="nav-logo">
        <div className="nav-logo-icon">🌐</div>
        <div className="nav-logo-text">
          <span className="nav-logo-main">哥伦布大陆</span>
          <span className="nav-logo-sub">COLUMBUS LAND</span>
        </div>
      </div>
      <div className="nav-links">
        {pages.map(p => (
          <button key={p.id} className={`nav-link${current===p.id?' active':''}`} onClick={()=>onChange(p.id)}>
            <span className="nl-icon">{p.icon}</span>
            <span className="nl-label">{lang==='zh' ? p.zh : p.en}</span>
          </button>
        ))}
      </div>
      <div className="nav-right" style={{display:'flex',alignItems:'center',gap:8}}>
        <button
          onClick={toggle}
          title={lang==='zh'?'Switch to English':'切换为中文'}
          style={{
            padding:'4px 10px', borderRadius:4, border:'1px solid var(--border)',
            background:'none', color:'var(--text2)', fontFamily:'var(--font-mono)',
            fontSize:11, cursor:'pointer', letterSpacing:'0.05em',
            transition:'all 0.15s',
          }}
          onMouseEnter={e=>{e.target.style.borderColor='var(--primary)';e.target.style.color='var(--primary)'}}
          onMouseLeave={e=>{e.target.style.borderColor='var(--border)';e.target.style.color='var(--text2)'}}
        >
          {lang==='zh' ? 'EN' : '中'}
        </button>
        <WalletBtn lang={lang} />
      </div>
    </nav>
  )
}
