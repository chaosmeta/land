# 项目完整上下文 SKILL

## ⚡ 新对话启动指令

**第一步必做：** `node deploy_v3.mjs` — 检查部署是否完成（如果contracts.js已更新则跳过）

***

## 项目基础

**前端路径**: `C:\Users\1\Downloads\evo-land-frontend-main\evo-land-frontend-main\` **技术栈**: React 18 + Vite 5 + RainbowKit v2 + wagmi v2 + viem + BSC Testnet (ChainId 97) **前端地址**: http://localhost:5175

## 私钥 / 部署者

**Deployer**: `0xe149fd4EFc7485ffae69f844bc93EA87a6a2e5b2`  **RPC 可用**: `https://api.zan.top/bsc-testnet`（首选）

***

## 🆕 最新部署合约地址（deploy\_v3.mjs 本次产生）

```js
ring:        '0x499CD63c58f4144209048B134Cae6bAeED306550'
gold:        '0x9Ae31caeF79c2A0A853296cE04032Ab048263E6e'
wood:        '0x6ABcB23B768353506946a7e9D61A897f2BE18d1c'
water:       '0x17a864896190D3640bADCD4886195AEF08186317'
fire:        '0xb8f71106b33F666F0c19Ff03B4021c272670373C'
soil:        '0xc154a66d3b1A4CCcdD92614529aD64D8C3044284'
land:        '0x1C3A774499D7a1FD7317FEc4145E3a9429741C34'
drill:       '0xbbf84ED4CA280e24D8fb9f2d0cfc628C4D441C7E'
apostle:     '0x6C4904bb5D64bBDAe21bBfF470F678A390CCFf39'
mining:      '0x742D07346F43EC9A3199dBb0cd55882206267684'  ✅ 修复PRECISION
auction:     '0xB4D367275a86CA257CD7A7F099583303bb2E895B'
initializer: '0x7FfDccDe9666dDAd22B82d1310a83C2E4F18bb04'
blindbox:    '0x5fBaB45fc80E6c45781fd75548463b92170c52FF'
referral:    '0x3aa13c3Cb1A94475123A305297Bb03d9ECb8e141'
```

**合约文件**: `contracts/EvoLandV2.sol`（全套修复版）

***

## ⚠️ 当前状态

`deploy_v3.mjs` 正在执行中，卡在 **\[2/5] 授权配置** 阶段（链上交易确认慢）。

**新对话需要做的事情（按顺序）：**

### 1. 检查 deploy\_v3.mjs 是否完成

```powershell
# 检查 contracts.js 是否已更新为新地址
node -e "const c=require('./src/constants/contracts.js');console.log(c.CONTRACTS?.ring||'旧地址')"
```

* 如果显示 `0x499CD6...` → 部署完成，跳到步骤3
* 如果显示旧地址 → 重新运行 `node deploy_v3.mjs`

### 2. 如果需要重新运行部署

```powershell
Set-Location "C:\Users\1\Downloads\evo-land-frontend-main\evo-land-frontend-main"
node deploy_v3.mjs
```

等待输出 `✅ src/constants/contracts.js 已更新！`

### 3. 验证链上数据

```powershell
node audit.mjs
```

检查：使徒数量、钻头数量、挖矿槽位、待领取产出是否正常

### 4. 前端测试（连接钱包后逐页测试）

* [ ] 地图：地块显示、颜色、点击、工作区
* [ ] 市场：地块/使徒/钻头扫描、筛选、购买
* [ ] 使徒页：列表、孵化进度、繁殖功能
* [ ] 资产页：代币余额、盲盒购买、挖矿Tab
* [ ] 盲盒：购买使徒盒/钻头盒

### 5. 优化待做清单

* 地图平移顺滑度（RAF架构已做，验证效果）
* 市场卡片样式对齐原版
* 工作区使徒+钻头放置流程测试

***

## 挖矿产出公式（✅ 已修复）

```
output = rate * 1e18 * strength * boost * elapsed / (50 * 100 * 86400)
rate=50, strength=50 → 50 tokens/天
```

旧合约 PRECISION=1e12 导致产出为零，已在新合约修复。

***

## 前端架构摘要

### WorldMap.jsx（\~900行）

* Canvas + RAF 渲染（pan/zoom 全用 ref，不触发 React re-render）
* 放置流程：点＋→选使徒→选钻头（可选）→startMining(landId, apoId, drillId)
* 最多5个槽位，可挤出最弱使徒

### 关键常量

```js
CONTRACTS.mining  // MiningSystem（修复版）
CONTRACTS.auction // LandAuction（荷兰拍，7天，4%手续费）
CONTRACTS.blindbox // BlindBox（使徒1 RING，钻头0.5 RING）
```

### 全局跳转

```js
window.dispatchEvent(new CustomEvent('nav', {detail:{page:'assets',tab:'mining'}}))
```

***

## 常用命令

```powershell
# 语法检查
node -e "require('./node_modules/@babel/parser').parse(require('fs').readFileSync('src/pages/WorldMap.jsx','utf8'),{sourceType:'module',plugins:['jsx']});console.log('OK')"

# 链上审查
node audit.mjs

# 重新部署（如需）
node deploy_v3.mjs

# 检查RPC
node -e "const{ethers}=require('ethers');new ethers.JsonRpcProvider('https://api.zan.top/bsc-testnet').getBlockNumber().then(n=>console.log('OK#'+n)).catch(e=>console.log('FAIL'))"
```
