export const CONTRACTS = {
  ring:        '0x3fa38920EED345672dF7FF916b5EbE4f095822aE',
  gold:        '0x5E4b633ae293ec4e000B5934D68997E45D8Bc0B9',
  wood:        '0xD91824b6130DdEf7ffd6b07C1AeFD1ebA60A3b37',
  water:       '0x2FFac338404fadd6c551AcED8197E781Ffa6205C',
  fire:        '0xc2d43F4655320227DaeaA0475E3254C83892D487',
  soil:        '0x865607c7d948655a32da9bE40c70A16Ecae35572',
  land:        '0x889DCe5b3934D56f3814f93793F8e1f8710249ea',
  drill:       '0x782827AdA353d4f958964e1E10D5d940e4B38409',
  apostle:     '0xbBce394d561E67bA9C0720d3aD56b25bC12Ee4f0',
  mining:      '0x5A9963394e9EeA042b9eCBB0389B0cC587cbcBB4',
  auction:     '0xfACc3eaD5EA9Ec5F2fe56568918b21Fb3b899284',
  initializer: '0x43Fb229f526CB3F55727F5ff881B37B69A6af0B8',
  referral:    '0xe5Ce03D51DDc7598646054480b4D37aEb21B0962',
  blindbox:    '0xF65669cd9D26BDCb57517586Aa0D252d3A13dE80',
  upgrade:     '0xd8083a57b479bb920d52f0db2257936023b49ea7',
  rental:      '0x7fb3cdf115552721b3f19f06592c07c83f6c7858',
}

export const NFT_AUCTION_ADDR = '0xe489Fd17B4aBF3b22482Bf0f09193f9902f1fd22'
// 合约部署起始区块（BSC RPC getLogs 限制50000块，分段扫描用）
export const DEPLOY_BLOCK = 97519000n
export const DEPLOYER = '0xe149fd4EFc7485ffae69f844bc93EA87a6a2e5b2'
export const PANCAKE_ROUTER = '0xD99D1c33F9fC3444f8101754aBC46c52416550d1'
export const WBNB = '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd'

// 检查合约是否已部署（ring 地址不是零地址）
export const isDeployed = CONTRACTS.ring !== '0x0000000000000000000000000000000000000000'

// 5种资源名称（英文）
export const RESOURCE_NAMES = ['Gold', 'Wood', 'Water', 'Fire', 'Soil']

// 5种资源名称（中文）
export const RES_NAMES_ZH = ['金矿', '木材', '水源', '火焰', '土地']

// 5种资源 emoji 图标
export const RESOURCE_ICONS = ['🪙', '🌲', '💧', '🔥', '⛰']
export const RES_EMOJIS = RESOURCE_ICONS

// 5种资源 key（对应 CONTRACTS 里的字段名）
export const RESOURCE_KEYS = ['gold', 'wood', 'water', 'fire', 'soil']
export const RES_KEYS = RESOURCE_KEYS

// 5种资源颜色
export const RESOURCE_COLORS = ['#f59e0b', '#22c55e', '#3b82f6', '#ef4444', '#a78bfa']
export const RES_COLORS = RESOURCE_COLORS
export const LAND_COLORS = RESOURCE_COLORS

// 5种资源代币合约地址数组（按顺序：gold/wood/water/fire/soil）
export const RESOURCE_TOKENS = [
  CONTRACTS.gold,
  CONTRACTS.wood,
  CONTRACTS.water,
  CONTRACTS.fire,
  CONTRACTS.soil,
]
