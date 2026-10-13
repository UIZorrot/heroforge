# HeroForge Monad testnet collectible MVP

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

The page is under the existing **Monad** navigation item and does not require the email login. The contract address is intentionally blank until deployment. Set it in `frontend/.env.local`, then restart Vite:

```dotenv
VITE_APP_MODE=mock
VITE_MONAD_TESTNET_CONTRACT_ADDRESS=0xYourDeployedContractAddress
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

4. Set `VITE_MONAD_TESTNET_CONTRACT_ADDRESS` in the frontend deployment environment and redeploy the static frontend. For a fast public preview, `VITE_APP_MODE=mock` leaves the rest of the UI self-contained while the Monad page still uses the live Testnet contract.

5. Open the deployed URL with an injected EVM wallet. Connect, mint a card, wait for one confirmation, inspect the linked transaction on [MonadVision Testnet](https://testnet.monadvision.com/), and reload to confirm the contract-backed card gallery still displays it.

## Acceptance checklist

- Wallet adds/switches to chain ID 10143 and connects without a HeroForge email session.
- Minting sends `mintHero` from the connected wallet and waits for the receipt.
- The transaction link opens the real MonadVision Testnet transaction.
- Refreshing the page reads the owner's card IDs, onchain `tokenURI`, image, archetype, and battle power from the configured contract.
- Invalid text, unsupported image URI schemes, and out-of-range battle power revert onchain.
- Contract source is verified; contract address and transaction hash are included in the submission and demo video.

## Current implementation status

Contract, frontend, local deployment instructions, and acceptance criteria are in the repository. **No contract has been deployed, no contract address has been configured, and no public application URL or wallet transaction exists yet.** Deployment requires the project owner's local testnet wallet signing and funded testnet account. Public hosting also requires the team's deployment account.
