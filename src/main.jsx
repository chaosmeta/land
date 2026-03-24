import React from 'react'
import ReactDOM from 'react-dom/client'
import { WalletProvider } from './contexts/WalletContext.jsx'
import App from './App.jsx'
import './index.css'

class EB extends React.Component {
  constructor(p) { super(p); this.state = { err: null } }
  static getDerivedStateFromError(e) { return { err: e } }
  render() {
    if (this.state.err) return (
      <div style={{padding:20,color:'#f66',fontFamily:'monospace',background:'#0a0a0a',minHeight:'100vh'}}>
        <h2>Error: {this.state.err.message}</h2>
        <pre style={{fontSize:11,color:'#888',whiteSpace:'pre-wrap'}}>{this.state.err.stack}</pre>
      </div>
    )
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <EB>
    <WalletProvider>
      <EB><App /></EB>
    </WalletProvider>
  </EB>
)
