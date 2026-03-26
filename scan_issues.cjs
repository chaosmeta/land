const fs = require('fs')
const path = require('path')

const issues = []

function scan(file, content) {
  if (content.includes('0xF65669cd9D26BDCb57517586Aa0D252d3A13dE80'))
    issues.push({ file, issue: '旧BlindBox地址残留' })
  if ((content.includes('useWriteContract') || content.includes('useWaitForTransactionReceipt')) && !file.includes('WalletContext'))
    issues.push({ file, issue: 'wagmi shim 残留' })
  if (content.includes("UPGRADE_ADDR = ''") || content.includes("RENTAL_ADDR = ''"))
    issues.push({ file, issue: 'TODO 空地址未填' })
  if (content.includes('3_000_000n'))
    issues.push({ file, issue: '固定高gas 3_000_000n' })
  if (content.includes('migrate to wc.writeContract'))
    issues.push({ file, issue: 'shim throw残留' })
}

function walk(dir) {
  fs.readdirSync(dir).forEach(item => {
    const full = path.join(dir, item)
    const stat = fs.statSync(full)
    if (stat.isDirectory() && !['node_modules', '.git', 'dist', 'artifacts'].includes(item))
      walk(full)
    else if (stat.isFile() && /\.(jsx?|ts)$/.test(full)) {
      scan(full.replace(process.cwd(), '').replace(/\\/g, '/'), fs.readFileSync(full, 'utf8'))
    }
  })
}

walk(process.cwd())
if (issues.length === 0) console.log('✅ 代码扫描无问题')
else issues.forEach(i => console.log('⚠️', i.file, '->', i.issue))
