import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPublicClient, createWalletClient, custom, defineChain, http, type Address, type Hash } from 'viem';
import './MonadMintPage.css';
import { gameArtUrl } from '../lib/artAssets';

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

declare global {
  interface Window { ethereum?: Eip1193Provider }
}

const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } },
  blockExplorers: { default: { name: 'MonadVision', url: 'https://testnet.monadvision.com' } },
  testnet: true,
});

const contractAddress = (import.meta.env.VITE_MONAD_TESTNET_CONTRACT_ADDRESS || '0x17bdc9D38BE086CDcEE39D524d33F484cCdD359a') as Address;
const contractAbi = [
  { type: 'function', name: 'mintHero', stateMutability: 'nonpayable', inputs: [{ name: 'name', type: 'string' }, { name: 'archetype', type: 'string' }, { name: 'imageURI', type: 'string' }, { name: 'battlePower', type: 'uint32' }], outputs: [{ name: 'tokenId', type: 'uint256' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'tokenOfOwnerByIndex', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'index', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'tokenURI', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ name: '', type: 'string' }] },
  { type: 'event', name: 'HeroMinted', anonymous: false, inputs: [{ name: 'owner', type: 'address', indexed: true }, { name: 'tokenId', type: 'uint256', indexed: true }, { name: 'name', type: 'string', indexed: false }, { name: 'imageURI', type: 'string', indexed: false }] },
] as const;

const archetypes = [
  { name: 'Basalt Sentinel', type: 'Sentinel', art: 'sentinel' },
  { name: 'Mirror Stalker', type: 'Stalker', art: 'archer' },
  { name: 'Mnemonic Oracle', type: 'Oracle', art: 'scribe' },
  { name: 'Nameless Weaver', type: 'Weaver', art: 'boss' },
] as const;

type MintedCard = { id: bigint; name: string; archetype: string; image: string; battlePower: number };
type TokenMetadata = { name?: string; image?: string; attributes?: { trait_type?: string; value?: string | number }[] };

function cardImageUri(role: string) {
  return gameArtUrl(new URL(`${import.meta.env.BASE_URL}art/void-labyrinth/${role}-v2.webp`, window.location.origin).href);
}

function resolveImage(uri: string) {
  return uri.startsWith('ipfs://') ? `https://ipfs.io/ipfs/${uri.slice(7)}` : gameArtUrl(uri);
}

function decodeMetadata(uri: string): TokenMetadata | null {
  try {
    const payload = uri.slice(uri.indexOf(',') + 1);
    const binary = atob(payload);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as TokenMetadata;
  } catch {
    return null;
  }
}

function shortAddress(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function MonadMintPage() {
  const [account, setAccount] = useState<Address | null>(null);
  const [selected, setSelected] = useState(0);
  const [heroName, setHeroName] = useState<string>(archetypes[0].name);
  const [imageURI, setImageURI] = useState(cardImageUri(archetypes[0].art));
  const [battlePower, setBattlePower] = useState('5000');
  const [cards, setCards] = useState<MintedCard[]>([]);
  const [transaction, setTransaction] = useState<Hash | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const publicClient = useMemo(() => createPublicClient({ chain: monadTestnet, transport: http() }), []);

  const refreshCards = useCallback(async (owner: Address) => {
    if (!contractAddress) return;
    const balance = await publicClient.readContract({ address: contractAddress, abi: contractAbi, functionName: 'balanceOf', args: [owner] });
    const count = Number(balance > 20n ? 20n : balance);
    const owned = await Promise.all(Array.from({ length: count }, async (_, index) => {
      const id = await publicClient.readContract({ address: contractAddress, abi: contractAbi, functionName: 'tokenOfOwnerByIndex', args: [owner, BigInt(index)] });
      const uri = await publicClient.readContract({ address: contractAddress, abi: contractAbi, functionName: 'tokenURI', args: [id] });
      const metadata = decodeMetadata(uri);
      const traits = metadata?.attributes ?? [];
      return {
        id,
        name: metadata?.name ?? `Hero #${id}`,
        archetype: String(traits.find((item) => item.trait_type === 'Archetype')?.value ?? 'Hero'),
        battlePower: Number(traits.find((item) => item.trait_type === 'Battle Power')?.value ?? 0),
        image: resolveImage(metadata?.image ?? ''),
      } satisfies MintedCard;
    }));
    setCards(owned.reverse());
  }, [publicClient]);

  useEffect(() => {
    if (!account || !contractAddress) return;
    void refreshCards(account).catch(() => setError('Could not read this wallet’s cards from Monad Testnet.'));
  }, [account, refreshCards]);

  useEffect(() => {
    const provider = window.ethereum;
    if (!provider) return;
    const handleAccountsChanged = (accounts: unknown) => {
      const next = Array.isArray(accounts) ? accounts[0] : null;
      setAccount(typeof next === 'string' ? next as Address : null);
    };
    const handleChainChanged = () => setAccount(null);
    provider.on?.('accountsChanged', handleAccountsChanged);
    provider.on?.('chainChanged', handleChainChanged);
    return () => {
      provider.removeListener?.('accountsChanged', handleAccountsChanged);
      provider.removeListener?.('chainChanged', handleChainChanged);
    };
  }, []);

  const chooseArchetype = (index: number) => {
    setSelected(index);
    setHeroName(archetypes[index].name);
    setImageURI(cardImageUri(archetypes[index].art));
  };

  const connectWallet = async () => {
    setError('');
    try {
      if (!window.ethereum) throw new Error('Install an EVM wallet such as MetaMask to continue.');
      const provider = window.ethereum;
      try {
        await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x279f' }] });
      } catch (switchError) {
        const code = (switchError as { code?: number }).code;
        if (code !== 4902) throw switchError;
        await provider.request({ method: 'wallet_addEthereumChain', params: [{
          chainId: '0x279f', chainName: 'Monad Testnet', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
          rpcUrls: ['https://testnet-rpc.monad.xyz'], blockExplorerUrls: ['https://testnet.monadvision.com'],
        }] });
      }
      const walletClient = createWalletClient({ chain: monadTestnet, transport: custom(provider as never) });
      const [address] = await walletClient.requestAddresses();
      if (!address) throw new Error('No wallet account was selected.');
      setAccount(address);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Wallet connection failed.');
    }
  };

  const mintCard = async () => {
    setError('');
    setTransaction(null);
    if (!window.ethereum || !account || !contractAddress) return;
    if (!/^0x[\da-fA-F]{40}$/.test(contractAddress)) {
      setError('Set VITE_MONAD_TESTNET_CONTRACT_ADDRESS to the deployed testnet contract first.');
      return;
    }
    if (!imageURI.startsWith('https://') && !imageURI.startsWith('ipfs://')) {
      setError('Use a permanent HTTPS or IPFS image URL so the NFT artwork remains available.');
      return;
    }
    setBusy(true);
    try {
      const walletClient = createWalletClient({ chain: monadTestnet, transport: custom(window.ethereum as never) });
      const hash = await walletClient.writeContract({
        address: contractAddress,
        abi: contractAbi,
        functionName: 'mintHero',
        args: [heroName.trim(), archetypes[selected].type, imageURI.trim(), Number(battlePower)],
        account,
      });
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      setTransaction(hash);
      await refreshCards(account);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Mint transaction failed.');
    } finally {
      setBusy(false);
    }
  };

  const previewImage = resolveImage(imageURI);
  const configured = /^0x[\da-fA-F]{40}$/.test(contractAddress);

  return (
    <main className="monad-page">
      <section className="monad-hero">
        <div className="monad-eyebrow">HeroForge · Monad Testnet</div>
        <h1>Give your hero an onchain home.</h1>
        <p>Mint a collectible hero card to your wallet. Each mint is a real Monad transaction; battles continue to use HeroForge’s existing game service.</p>
        <div className="monad-actions">
          <span className="monad-network"><i /> Monad Testnet · Chain 10143</span>
          <button className="monad-button monad-button--quiet" onClick={() => void connectWallet()}>{account ? shortAddress(account) : 'Connect wallet'}</button>
        </div>
      </section>

      <section className="monad-layout">
        <div className="monad-editor">
          <div className="monad-section-kicker">01 / Choose a hero</div>
          <div className="monad-archetypes">
            {archetypes.map((hero, index) => (
              <button className={`monad-archetype ${selected === index ? 'is-selected' : ''}`} key={hero.type} onClick={() => chooseArchetype(index)}>
                <img src={cardImageUri(hero.art)} alt="" />
                <span>{hero.name}</span>
              </button>
            ))}
          </div>
          <label className="monad-label">Card name<input maxLength={32} value={heroName} onChange={(event) => setHeroName(event.target.value)} /></label>
          <label className="monad-label">Image URL <span>(public HTTPS or IPFS)</span><input value={imageURI} onChange={(event) => setImageURI(event.target.value)} /></label>
          <label className="monad-label">Battle power<input type="number" min="1" max="100000" value={battlePower} onChange={(event) => setBattlePower(event.target.value)} /></label>
          <div className="monad-footnote">Testnet collectible only. This card is not yet used to authorize battle stats or transfer game ownership.</div>
        </div>

        <article className="monad-preview">
          <div className="monad-section-kicker">02 / Card preview</div>
          <div className="monad-card-frame">
            <img src={previewImage} alt={`${heroName} portrait preview`} onError={(event) => { event.currentTarget.src = cardImageUri(archetypes[selected].art); }} />
            <div className="monad-card-caption"><span>{archetypes[selected].type}</span><strong>{heroName || 'Unnamed Hero'}</strong><small>BP {Number(battlePower || 0).toLocaleString()}</small></div>
          </div>
          <button className="monad-button monad-button--mint" disabled={!configured || !account || busy || !heroName.trim() || Number(battlePower) < 1 || Number(battlePower) > 100000} onClick={() => void mintCard()}>
            {busy ? 'Waiting for Monad…' : configured ? 'Mint hero card' : 'Contract address required'}
          </button>
          {!configured && <div className="monad-config-hint">Deploy the contract, then set <code>VITE_MONAD_TESTNET_CONTRACT_ADDRESS</code>.</div>}
          {transaction && <a className="monad-tx-link" href={`https://testnet.monadvision.com/tx/${transaction}`} target="_blank" rel="noreferrer">View confirmed transaction ↗</a>}
          {error && <p className="monad-error" role="alert">{error}</p>}
        </article>
      </section>

      <section className="monad-gallery">
        <div className="monad-section-kicker">03 / Your onchain cards {account && <span>· {shortAddress(account)}</span>}</div>
        {!account ? <p className="monad-empty">Connect a wallet to read its cards directly from the Monad contract.</p> : cards.length === 0 ? <p className="monad-empty">No HeroForge cards in this wallet yet. Mint one above to begin.</p> : (
          <div className="monad-owned-grid">{cards.map((card) => <article className="monad-owned-card" key={card.id.toString()}><img src={card.image} alt={card.name} /><div><span>#{card.id.toString()} · {card.archetype}</span><strong>{card.name}</strong><small>BP {card.battlePower.toLocaleString()}</small></div></article>)}</div>
        )}
        {contractAddress && <a className="monad-contract-link" href={`https://testnet.monadvision.com/address/${contractAddress}`} target="_blank" rel="noreferrer">View collection contract ↗</a>}
      </section>
    </main>
  );
}
