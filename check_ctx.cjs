const fs=require('fs'),path=require('path')
function walk(d){return fs.readdirSync(d).flatMap(f=>{const p=path.join(d,f);return fs.statSync(p).isDirectory()&&!['node_modules','dist','.git'].includes(f)?walk(p):[p]})}
walk('src').filter(f=>f.endsWith('.jsx')||f.endsWith('.js')).forEach(f=>{
  const c=fs.readFileSync(f,'utf8')
  const lines=c.split('\n').filter(l=>l.includes('WalletContext'))
  if(lines.length) console.log(path.relative('.',f)+': '+lines[0].trim())
})
