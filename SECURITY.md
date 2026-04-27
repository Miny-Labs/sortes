# Security policy

## Reporting a vulnerability

If you discover a security vulnerability in Sortes, please **do not open a public issue**. Instead, email the maintainers privately:

- Akash Mondal — akash@minylabs.xyz
- Hitakshi Arora — hitakshiarora005@gmail.com

We will acknowledge receipt within 72 hours and provide a remediation timeline within 7 days. Critical vulnerabilities may be fast-tracked.

## Scope

In scope:
- Sortes-specific contracts under `src/` (`ConfidentialCollateralWrapper`, `SealedPool`, `SortesMarketFactory`, oracle bridge contracts).
- Sortes-specific deployment scripts under `script/`.

Out of scope (report to upstream maintainers):
- Vulnerabilities in `lib/conditional-tokens-contracts/` → [gnosis/conditional-tokens-contracts](https://github.com/gnosis/conditional-tokens-contracts/issues) or [Polymarket/conditional-tokens-contracts](https://github.com/Polymarket/conditional-tokens-contracts/issues).
- Vulnerabilities in `lib/ctf-exchange/` → [Polymarket/ctf-exchange](https://github.com/Polymarket/ctf-exchange/issues).
- Vulnerabilities in `lib/uma-ctf-adapter/` → [Polymarket/uma-ctf-adapter](https://github.com/Polymarket/uma-ctf-adapter/issues).
- Vulnerabilities in `lib/confidential-token/` → [skalenetwork/confidential-token](https://github.com/skalenetwork/confidential-token/issues) and the SKALE Labs security process at https://blog.skale.space/security.
- Vulnerabilities in BITE consensus or SKALE precompiles → SKALE Labs.

## Audit history

Sortes is pre-audit. The novel contracts (`ConfidentialCollateralWrapper`, `SealedPool`) are intended for ChainSecurity or Trail of Bits review prior to mainnet launch. Audited upstream components retain their original audit perimeter:

- [ChainSecurity, Polymarket Exchange, Nov 2022](https://reports.chainsecurity.com/Polymarket/ChainSecurity_Polymarket_Exchange_Audit.pdf)
- [ChainSecurity, Polymarket NegRiskAdapter, Apr 2024](https://old.chainsecurity.com/wp-content/uploads/2024/04/ChainSecurity_Polymarket_NegRiskAdapter_audit.pdf)
- [ChainSecurity, Polymarket Conditional Tokens, Apr 2024](https://old.chainsecurity.com/wp-content/uploads/2024/04/ChainSecurity_Polymarket_Conditional_Tokens_audit.pdf)
- OpenZeppelin, Polymarket UMA CTF Adapter (PDF in upstream repo).

## Bug bounty

A formal bug bounty will be opened post-mainnet launch. Pre-launch disclosures are credited in the security acknowledgments section of the README and may be eligible for retroactive rewards from the protocol treasury.
