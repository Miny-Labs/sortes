# Contributing to Sortes

Thanks for your interest. Sortes is an open-source, privacy-first prediction market built on SKALE Base using the BITE Phase 2 threshold encryption primitive and SKALE Confidential Tokens.

## Ground rules

1. The repo is licensed [AGPL-3.0-only](LICENSE). Any contribution is accepted under the same license. By submitting a pull request, you agree your contribution may be redistributed under AGPL-3.0.
2. We do not modify audited upstream contracts. Forks of `Polymarket/conditional-tokens-contracts`, `Polymarket/ctf-exchange`, `Polymarket/uma-ctf-adapter`, `gnosis/conditional-tokens-market-makers`, and `skalenetwork/confidential-token` live as git submodules in `lib/`. Anything Sortes-specific lives in `src/`.
3. Every PR ships with tests. New contracts get unit tests and at least one integration test against the real SKALE Base Sepolia testnet deployment when possible.
4. Every PR updates `README.md` to reflect new deployments, architecture changes, or breaking interface changes.

## Local setup

Prerequisites: Foundry (`forge`, `cast`, `anvil`), Node 20+, Yarn, Git.

```bash
git clone --recurse-submodules https://github.com/Miny-Labs/sortes.git
cd sortes
cp .env.example .env
# Edit .env with your testnet deployer key
forge install
forge build
forge test
```

## Branch and commit conventions

We use Conventional Commits. Common types: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`, `build:`, `ci:`.

Branch off `main` for short-lived feature branches. Open a PR. CI runs `forge test`, `forge fmt --check`, and Slither.

## Reporting security issues

See [SECURITY.md](SECURITY.md). Do not open public issues for security vulnerabilities.

## Code of conduct

Be excellent to each other. Disagree on technical merit. Do not attack contributors.

## License attribution

Sortes integrates the following audited upstreams. Their licenses propagate through to the combined work under AGPL-3.0:

- [Polymarket CTF Exchange](https://github.com/Polymarket/ctf-exchange) — MIT
- [Polymarket UMA CTF Adapter](https://github.com/Polymarket/uma-ctf-adapter) — MIT
- [Polymarket Negative Risk CTF Adapter](https://github.com/Polymarket/neg-risk-ctf-adapter) — MIT
- [Polymarket Conditional Tokens Contracts](https://github.com/Polymarket/conditional-tokens-contracts) — LGPL-3.0
- [Gnosis Conditional Tokens Market Makers](https://github.com/gnosis/conditional-tokens-market-makers) — LGPL-3.0
- [SKALE Confidential Token](https://github.com/skalenetwork/confidential-token) — AGPL-3.0
- [OpenZeppelin Contracts](https://github.com/OpenZeppelin/openzeppelin-contracts) — MIT

We thank the authors of all of the above. Any bug or design flaw in Sortes is ours, not theirs.
