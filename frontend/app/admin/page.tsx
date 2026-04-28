"use client";

import { useMemo, useState } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { ShieldCheck, Plus, Warning } from "@phosphor-icons/react";

import { ADDRESSES, EXPLORER_URL, SEALED_POOL_ABI } from "../../lib/contracts";

export default function AdminPage() {
  const { address } = useAccount();
  const [question, setQuestion] = useState("");
  const [outcomeCount, setOutcomeCount] = useState(2);
  const [deadlineMinutes, setDeadlineMinutes] = useState(60);
  const [resolutionMinutes, setResolutionMinutes] = useState(75);
  const [error, setError] = useState<string | null>(null);
  const [tx, setTx] = useState<string | null>(null);

  const { data: owner } = useReadContract({
    address: ADDRESSES.SealedPool,
    abi: SEALED_POOL_ABI,
    functionName: "owner",
  });

  const isOwner =
    !!address && !!owner && (owner as string).toLowerCase() === address.toLowerCase();

  const { writeContractAsync, isPending } = useWriteContract();

  const handleCreate = async () => {
    setError(null);
    setTx(null);
    if (!question.trim()) {
      setError("Question is required.");
      return;
    }
    const now = Math.floor(Date.now() / 1000);
    const deadline = BigInt(now + deadlineMinutes * 60);
    const resolution = BigInt(now + resolutionMinutes * 60);
    try {
      const hash = await writeContractAsync({
        address: ADDRESSES.SealedPool,
        abi: SEALED_POOL_ABI,
        functionName: "createMarket",
        args: [question, BigInt(outcomeCount), deadline, resolution, ADDRESSES.USDC_e],
      });
      setTx(hash);
      setQuestion("");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const ownerShort = useMemo(() => {
    const v = owner as string | undefined;
    if (!v) return "—";
    return `${v.slice(0, 6)}…${v.slice(-4)}`;
  }, [owner]);

  return (
    <div className="mx-auto max-w-[640px] px-6 py-16">
      <div className="label-eyebrow">Operator</div>
      <h1 className="mt-2 text-balance text-[36px] tracking-tightest text-ink-100">
        Open a new market
      </h1>
      <p className="mt-4 max-w-[52ch] text-[13px] leading-relaxed text-ink-400">
        Markets are owner-only at the contract level. The same wallet that deployed SealedPool
        controls market creation. Anyone else hitting this form will see the call revert.
      </p>

      <div className="mt-6 flex items-center gap-2 text-[12px] text-ink-500">
        <ShieldCheck weight="duotone" className="h-3.5 w-3.5 text-signal" />
        SealedPool owner: <span className="num text-ink-300">{ownerShort}</span>
      </div>

      {address && !isOwner && (
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-warn/20 bg-warn/[0.04] p-4 text-[12px] text-warn">
          <Warning weight="fill" className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            Connected wallet is not the owner. Submitting will revert. This page exists for the
            deployer.
          </div>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleCreate();
        }}
        className="mt-10 space-y-6"
      >
        <Field label="Question" hint="Phrase as a yes/no claim or numbered set of outcomes.">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. Will the SKALE confidential token audit clear before Q4?"
            className="input"
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Outcomes">
            <input
              type="number"
              min={2}
              max={20}
              value={outcomeCount}
              onChange={(e) => setOutcomeCount(parseInt(e.target.value || "2"))}
              className="input-mono"
            />
          </Field>
          <Field label="Submissions close (min)">
            <input
              type="number"
              min={1}
              value={deadlineMinutes}
              onChange={(e) => setDeadlineMinutes(parseInt(e.target.value || "60"))}
              className="input-mono"
            />
          </Field>
          <Field label="Resolution earliest (min)">
            <input
              type="number"
              min={2}
              value={resolutionMinutes}
              onChange={(e) => setResolutionMinutes(parseInt(e.target.value || "75"))}
              className="input-mono"
            />
          </Field>
        </div>

        <button
          type="submit"
          disabled={isPending || !question.trim()}
          className="btn-primary text-xs"
        >
          <Plus weight="bold" className="h-3.5 w-3.5" />
          {isPending ? "Creating…" : "Create market"}
        </button>
      </form>

      {tx && (
        <div className="mt-6 rounded-xl border border-signal/20 bg-signal/[0.04] p-4 text-[12px]">
          <div className="text-signal">Market created.</div>
          <a
            href={`${EXPLORER_URL}/tx/${tx}`}
            target="_blank"
            rel="noreferrer"
            className="num mt-1 inline-flex items-center gap-1 text-ink-300 underline-offset-2 hover:underline"
          >
            {tx}
          </a>
        </div>
      )}
      {error && (
        <div className="mt-6 break-words rounded-xl border border-warn/20 bg-warn/[0.04] p-4 text-[12px] text-warn">
          {error}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="label-eyebrow">{label}</div>
      <div className="mt-2">{children}</div>
      {hint && <div className="mt-1 text-[11px] text-ink-500">{hint}</div>}
    </label>
  );
}
