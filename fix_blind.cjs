const fs = require('fs')
let c = fs.readFileSync('src/pages/BlindBoxPage.jsx', 'utf8')
// 在第一行 import 后插入 WalletContext import
if (!c.includes('WalletContext')) {
  c = c.replace(
    "import { useState, useEffect } from 'react'",
    "import { useState, useEffect } from 'react'\nimport { usePublicClient, useAccount, useWalletClient } from '../contexts/WalletContext.jsx'"
  )
  fs.writeFileSync('src/pages/BlindBoxPage.jsx', c)
  console.log('BlindBoxPage fixed')
} else {
  console.log('already ok')
}
