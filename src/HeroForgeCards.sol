// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @notice Permissionless, no-fee collectible hero cards for the Monad testnet demo.
/// @dev Hero stats and art are snapshots; this contract does not resolve game combat.
contract HeroForgeCards is ERC721Enumerable {
    using Strings for uint256;

    uint256 public constant MAX_SUPPLY = 10_000;
    uint256 public nextTokenId = 1;

    struct Card {
        string name;
        string archetype;
        string imageURI;
        uint32 battlePower;
    }

    mapping(uint256 tokenId => Card card) private _cards;

    event HeroMinted(address indexed owner, uint256 indexed tokenId, string name, string imageURI);

    error SoldOut();
    error InvalidText();
    error InvalidImageURI();
    error InvalidBattlePower();

    constructor() ERC721("HeroForge Heroes", "HERO") {}

    function mintHero(
        string calldata name,
        string calldata archetype,
        string calldata imageURI,
        uint32 battlePower
    ) external returns (uint256 tokenId) {
        if (nextTokenId > MAX_SUPPLY) revert SoldOut();
        if (!_validText(name, 32) || !_validText(archetype, 32)) revert InvalidText();
        if (!_validImageURI(imageURI)) revert InvalidImageURI();
        if (battlePower == 0 || battlePower > 100_000) revert InvalidBattlePower();

        tokenId = nextTokenId++;
        _cards[tokenId] = Card(name, archetype, imageURI, battlePower);
        _safeMint(msg.sender, tokenId);
        emit HeroMinted(msg.sender, tokenId, name, imageURI);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        Card storage card = _cards[tokenId];
        string memory attributes = string.concat(
            '[{"trait_type":"Archetype","value":"', card.archetype,
            '"},{"trait_type":"Battle Power","value":', uint256(card.battlePower).toString(), '}]'
        );
        string memory json = string.concat(
            '{"name":"', card.name,
            '","description":"A HeroForge hero minted on Monad.","image":"', card.imageURI,
            '","attributes":', attributes, '}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function cardData(uint256 tokenId) external view returns (Card memory) {
        _requireOwned(tokenId);
        return _cards[tokenId];
    }

    function _validText(string calldata value, uint256 maxLength) private pure returns (bool) {
        bytes calldata raw = bytes(value);
        if (raw.length == 0 || raw.length > maxLength) return false;
        for (uint256 i; i < raw.length; ++i) {
            uint8 c = uint8(raw[i]);
            if (c < 32 || c > 126 || c == 34 || c == 92) return false;
        }
        return true;
    }

    function _validImageURI(string calldata value) private pure returns (bool) {
        bytes calldata raw = bytes(value);
        if (raw.length == 0 || raw.length > 256) return false;
        if (!_startsWith(raw, "https://") && !_startsWith(raw, "ipfs://")) return false;
        for (uint256 i; i < raw.length; ++i) {
            uint8 c = uint8(raw[i]);
            if (c < 33 || c > 126 || c == 34 || c == 92) return false;
        }
        return true;
    }

    function _startsWith(bytes calldata value, string memory prefix) private pure returns (bool) {
        bytes memory expected = bytes(prefix);
        if (value.length < expected.length) return false;
        for (uint256 i; i < expected.length; ++i) {
            if (value[i] != expected[i]) return false;
        }
        return true;
    }

    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721Enumerable)
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value)
        internal
        override(ERC721Enumerable)
    {
        super._increaseBalance(account, value);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Enumerable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
