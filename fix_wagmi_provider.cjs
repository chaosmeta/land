const fs = require('fs'), path = require('path')

function walk(d) {
  return fs.readdirSync(d).flatMap(f => {
    const p = path.join(d, f)
    return fs.statSync(p).isDirectory() && !['node_modules','dist','.git'].includes(f) ? walk(p) : [p]
  })
}

let fixed = 0
walk('src').filter(f => f.endsWith('.jsx') || f.endsWith('.js')).forEach(file => {
  let c = fs.readFileSync(file, 'utf8')
  const orig = c
  // 删除 wagmi 的 WagmiProvider / QueryClient / QueryClientProvider imports
  c = c.replace(/import\s*\{[^}]*(?:WagmiProvider|QueryClient|QueryClientProvider)[^}]*\}\s*from\s*['"][^'"]+['"]\n?/g, '')
  // 删除 @tanstack/react-query imports
  c = c.replace(/import\s*\{[^}]+\}\s*from\s*['"]@tanstack\/react-query['"]\n?/g, '')
  // 删除 wagmiConfig imports
  c = c.replace(/import\s*\{[^}]*wagmiConfig[^}]*\}\s*from\s*['"][^'"]+['"]\n?/g, '')
  c = c.replace(/\n{3,}/g, '\n\n')
  if (c !== orig) { fs.writeFileSync(file, c); console.log('fixed:', file); fixed++ }
})
console.log('Total fixed:', fixed)
