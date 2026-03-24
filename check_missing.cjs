const fs=require('fs'),path=require('path')
function walk(d){return fs.readdirSync(d).flatMap(f=>{const p=path.join(d,f);return fs.statSync(p).isDirectory()&&!['node_modules','dist','.git'].includes(f)?walk(p):[p]})}
const hooks=['useAccount','useWalletClient','usePublicClient']
walk('src').filter(f=>f.endsWith('.jsx')||f.endsWith('.js')&&!f.includes('WalletContext')).forEach(f=>{
  const c=fs.readFileSync(f,'utf8')
  hooks.forEach(h=>{
    // 检查使用但没有正确import的
    const used=c.includes(h+'(')
    const imported=c.includes("from '../contexts/WalletContext") || c.includes("from './contexts/WalletContext") || c.includes('WalletContext')
    if(used&&!imported) console.log('MISSING IMPORT: '+path.relative('.',f)+' uses '+h)
  })
})
