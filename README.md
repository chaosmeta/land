# 哥伦布大陆 BSC 单链版

&#x20;**BSC Single-Chain Edition** — 中英双语区块链游戏前端

## 技术栈

| 层    | 技术                              |
| ---- | ------------------------------- |
| 框架   | React 18 + Vite 5               |
| 钱包连接 | RainbowKit v2 + wagmi v2 + viem |
| 目标链  | BSC 测试网 (ChainID 97)            |
| 风格   | 原版暗色风格                          |

## 快速开始

```bash
# 1. 克隆仓库
git clone https://github.com/kayusol/evo-land-frontend
cd evo-land-frontend

# 2. 安装依赖
npm install

# 3. 开发模式
npm run dev
# 默认访问 http://localhost:5173
```

## 部署合约后配置

1. 运行合约仓库的 GitHub Actions等待合约地址
2. 将地址填入 `src/constants/contracts.js`：

```js
export const CONTRACTS = {
  ring:    '0x....',  // RING 代币
  gold:    '0x....',  // 黄金资源
  wood:    '0x....',  // 木材资源
  water:   '0x....',  // 水源资源
  fire:    '0x....',  // 火焰资源
  soil:    '0x....',  // 土地资源
  land:    '0x....',  // 土地 NFT
  drill:   '0x....',  // 钻头 NFT
  apostle: '0x....',  // 使徒 NFT
  mining:  '0x....',  // 挖矿合约
  auction: '0x....',  // 拍卖合约
}
```

## 功能页面

| 页面      | 功能                        |
| ------- | ------------------------- |
| 🌍 地图   | 交互式 100×100 世界地图，点击地块查看详情 |
| 🏔 我的地块 | 查看持有地块，上架荷兰拍卖             |
| ⛏ 挖矿    | 派遣使徒+钻头挖矿，领取资源            |
| 🏛 拍卖   | 浏览所有拍卖中的地块，实时价格           |
| 💎 资产   | 查看 RING / 资源代币 / 使徒 / 钻头  |

## WalletConnect 配置（可选）

第三方钱包（MetaMask 第一次连接无需）需要 projectId：

1. 访问 [cloud.walletconnect.com](https://cloud.walletconnect.com) 获取免费 projectId
2. 替换 `src/config/wagmi.js` 中的 `evo-land-bsc-demo`

## 地块系统

* 地块总数：10,000 块 (100×100)
* Token ID = x × 100 + y + 1
* 资源属性： uint80 打包，每 16bit 一种资源
* 採矿公式： output = landRate × apostleStrength/50 × drillBoost × 1e18 × elapsed / 86400

## 合约仓库

https://github.com/kayusol/evo-land-bsc
