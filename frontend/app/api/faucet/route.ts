import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http, isAddress, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { skaleBaseSepolia } from "../../../lib/chain";
import { ADDRESSES, ERC20_ABI } from "../../../lib/contracts";

const FAUCET_AMOUNT_USDC = "5";
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

const lastClaim = new Map<string, number>();

export const runtime = "nodejs";

export async function POST(req: Request) {
  const pkRaw = process.env.FAUCET_PRIVATE_KEY ?? process.env.DEPLOYER_PRIVATE_KEY;
  if (!pkRaw) {
    return NextResponse.json(
      { error: "Faucet not configured. Set FAUCET_PRIVATE_KEY in env." },
      { status: 503 },
    );
  }
  const pk = (pkRaw.startsWith("0x") ? pkRaw : `0x${pkRaw}`) as `0x${string}`;

  let body: { address?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const to = body.address;
  if (!to || !isAddress(to)) {
    return NextResponse.json({ error: "Provide a valid EVM address." }, { status: 400 });
  }

  const key = to.toLowerCase();
  const now = Date.now();
  const last = lastClaim.get(key) ?? 0;
  const remaining = last + COOLDOWN_MS - now;
  if (remaining > 0) {
    const hrs = Math.ceil(remaining / (60 * 60 * 1000));
    return NextResponse.json(
      { error: `Already claimed. Try again in ~${hrs}h.` },
      { status: 429 },
    );
  }

  try {
    const account = privateKeyToAccount(pk);
    const wallet = createWalletClient({
      account,
      chain: skaleBaseSepolia,
      transport: http(),
    });
    const publicClient = createPublicClient({
      chain: skaleBaseSepolia,
      transport: http(),
    });

    const balance = (await publicClient.readContract({
      address: ADDRESSES.USDC_e,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [account.address],
    })) as bigint;

    const amount = parseUnits(FAUCET_AMOUNT_USDC, 6);
    if (balance < amount) {
      return NextResponse.json(
        {
          error: `Faucet wallet is dry. Has ${balance.toString()} micro-USDC, needs ${amount.toString()}.`,
          faucetWallet: account.address,
        },
        { status: 503 },
      );
    }

    const hash = await wallet.writeContract({
      address: ADDRESSES.USDC_e,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [to as `0x${string}`, amount],
    });

    lastClaim.set(key, now);

    return NextResponse.json({
      txHash: hash,
      amount: FAUCET_AMOUNT_USDC,
      symbol: "USDC.e",
      explorer: `${skaleBaseSepolia.blockExplorers.default.url}/tx/${hash}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
