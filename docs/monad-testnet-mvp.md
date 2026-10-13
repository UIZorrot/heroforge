# HeroForge Monad testnet collectible MVP

## 当前状态（中文）

测试入口已上线：[打开 HeroForge 测试网铸造页](https://hf.txzy.net/monad/)。合约部署、真实卡牌铸造和源码验证已经完成。无需项目负责人导入自己的钱包，也无需执行下面的部署命令。下方命令保留用于以后重新部署；本次真实链上记录在本文末尾和 [部署记录](../contracts/deployments/monad-testnet.json) 中。

## Product boundary

This prototype mints collectible ERC-721 snapshots to a connected wallet on Monad Testnet. The contract records the card name, archetype, battle power, and a public HTTPS/IPFS art URI; `tokenURI` returns an onchain Base64 JSON document. The card gallery reads ERC-721 ownership and metadata from the contract. Current game battles, card progression, and account ownership remain in HeroForge's existing backend. No gameplay result or game-account card is currently authorized by owning this NFT.

The page uses bundled Void Labyrinth card art by default. A different portrait can be minted by supplying a publicly reachable HTTPS or IPFS image URI. Direct file upload and IPFS pinning are not implemented because the repository has no image-pinning service credentials; do not promise permanent hosting for ordinary mutable HTTPS URLs.

## Local setup

```powershell
npm install --prefix contracts
forge build
cd frontend
npm install
npm run dev
```

The page is under the existing **Monad** navigation item and does not require the email login. `/monad/` or `#monad` opens it directly. The deployed testnet contract is configured by default; override it in `frontend/.env.local` only when using another deployment, then restart Vite:

```dotenv
VITE_APP_MODE=mock
VITE_MONAD_TESTNET_CONTRACT_ADDRESS=0x17bdc9D38BE086CDcEE39D524d33F484cCdD359a
```

Mock mode only supplies the rest of the game's preview UI. Wallet connection, mint transactions, token reads, and explorer links on this page use Monad Testnet and the deployed contract.

## Deploy to Monad Testnet

Monad Testnet uses chain ID `10143`, RPC `https://testnet-rpc.monad.xyz`, and test MON. Monad Mainnet uses chain ID `143`; this MVP is configured for Testnet. Check current network data in the [Monad developers network resources](https://github.com/monad-developers/) and use the [Monad faucet](https://faucet.monad.xyz/) for test MON.

1. Import the deployer's key into Foundry's encrypted keystore locally. Never paste a private key into chat, commit it, or put it in a frontend environment variable.

   ```powershell
   cast wallet import heroforge-testnet-deployer --interactive
   cast wallet address --account heroforge-testnet-deployer
   ```

2. Fund that address with test MON and deploy:

   ```powershell
   forge build
   forge create src/HeroForgeCards.sol:HeroForgeCards --rpc-url monad_testnet --account heroforge-testnet-deployer --broadcast
   ```

3. Verify the source on Monad's Sourcify endpoint:

   ```powershell
   forge verify-contract 0xYourDeployedContractAddress src/HeroForgeCards.sol:HeroForgeCards --chain 10143 --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org
   ```

4. Set `VITE_MONAD_TESTNET_CONTRACT_ADDRESS` only to override the deployed default. Run `npm run build:monad` from `frontend` and publish `_local/monad-standalone/dist` under `/monad/` on the existing game server. This independent mint page does not load simulated game state or require game-backend credentials.

5. Open the deployed URL with an injected EVM wallet. Connect, mint a card, wait for one confirmation, inspect the linked transaction on [MonadVision Testnet](https://testnet.monadvision.com/), and reload to confirm the contract-backed card gallery still displays it.

## Acceptance checklist

- Wallet adds/switches to chain ID 10143 and connects without a HeroForge email session.
- Minting sends `mintHero` from the connected wallet and waits for the receipt.
- The transaction link opens the real MonadVision Testnet transaction.
- Refreshing the page reads the owner's card IDs, onchain `tokenURI`, image, archetype, and battle power from the configured contract.
- Invalid text, unsupported image URI schemes, and out-of-range battle power revert onchain.
- Contract source is verified; contract address and transaction hash are included in the submission and demo video.

## Current implementation status

已由专用测试钱包完成部署，项目负责人无需导入自己的钱包或手动执行部署命令。钱包的加密文件与密码仅保存在被 Git 忽略的 `_local/monad-testnet-wallet/`，不进入仓库或网页。

- 网络：Monad 测试网，链编号 10143。
- 合约地址：`0x17bdc9D38BE086CDcEE39D524d33F484cCdD359a`。
- [部署交易](https://testnet.monadvision.com/tx/0x2c3f84a654d7495d52e663a0c87b5bb6f58e7beb15d95a6cf4a29e9f14fb1df8)。
- [第一张卡的铸造交易](https://testnet.monadvision.com/tx/0x62b0ee1c0e216adfa5e400dfb7c987b5fb19e9bb80c5f3ff81707dfd048449de)。
- 已从链上读回卡牌编号 1 的所有者、持有数量和卡牌元数据。
- 源码验证已完成，链上运行代码与提交的源码完全匹配（`exact_match`），任务编号 `8154b5b7-d8ae-4877-abf0-64139da883f3`。
- [使用公开页面同一路径卡图的铸造交易](https://testnet.monadvision.com/tx/0x385befdbcff3a4b560ee3bbb73de43275d587d549b1a5b1f1e4d27e86535f319)：卡牌编号 2，图像来自 `https://hf.txzy.net/monad/art/void-labyrinth/archer-v2.webp`。
- 测试入口已发布，页面、JS/CSS 与四张默认卡图已验证可访问。正式游戏仍使用原来的网页文件，后端健康检查正常。
- 本地浏览器已验收直达入口、四图加载、卡牌切换和未安装钱包时的提示；链上真实签名与铸造通过本地加密钱包完成，浏览器钱包签名尚未验收。
- 验收卡牌编号 1 的旧根图片地址曾被 CDN 缓存为首页 HTML。源站已补齐正确图片，最后一次公开 GET 已返回 `image/webp` 和正确文件头；其他先前缓存的区域或浏览器可能仍等待原约四小时的缓存失效。现有凭据没有定向清缓存权限，未修改全站缓存或授权。第二张验收卡及公开页面的新卡都使用已正常工作的 `/monad/art/` 路径。

服务器实际提供正式游戏页面的目录是 `/home/heroforge/frontend/dist`，网址为 `https://hf.txzy.net/`。正式代码较旧，测试入口已放在同域名的 `/monad/` 子目录，使用独立构建和 `/monad/` 资源前缀。测试入口中的铸造、交易和持有卡牌读取全部访问真实测试网，不加载模拟游戏状态；页眉提供返回正式游戏的链接。发布仅更新静态文件并保留回退副本，不覆盖服务器仓库、后端、环境变量或锁文件。

独立入口的构建命令：在 `frontend` 目录运行 `npm run build:monad`，输出位于 `_local/monad-standalone/dist`。它复用游戏内的同一个铸造组件，仅打包需要的四张卡图和标志，不复制整套战斗特效和游戏场景资源。

服务器发布备份及记录位于 `/home/heroforge/backup/monad-release-20261013T165041Z`（目录名采用 UTC）。保留了轻量发布包、原首页及 `release.json`。如需撤回，将新建的 `dist/monad` 和新增根图片分别移到该备份目录中未占用的 `withdrawn` 路径；无需删除文件、恢复原游戏或重启服务。
