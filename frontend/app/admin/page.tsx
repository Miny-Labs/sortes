"use client";

import { useState } from "react";
import { useWriteContract, useReadContract, useAccount } from "wagmi";

import { ADDRESSES, SEALED_POOL_ABI } from "../../lib/contracts";

export default function AdminPage() {
  const { address } = useAccount();
  const [question, setQuestion] = useState("");
  const [outcomeCount, setOutcomeCount] = useState(2);
  const [deadlineMinutes, setDeadlineMinutes] = useState(60);
  const [resolutionMinutes, setResolutionMinutes] = useState(75);
  const [error, setError] = useState<string | null>(null);

  const { data: owner } = useReadContract({
    address: ADDRESSES.SealedPool,
    abi: SEALED_POOL_ABI,
    functionName: "owner",
  });

  const isOwner = address && owner && (owner as string).toLowerCase() === address.toLowerCase();

  const { writeContractAsync, isPending } = useWriteContract();

  const handleCreate = async () => {
    setError(null);
    if (!question.trim()) {
      setError("Question is required.");
      return;
    }
    const now = Math.floor(Date.now() / 1000);
    const deadline = BigInt(now + deadlineMinutes * 60);
    const resolution = BigInt(now + resolutionMinutes * 60);
    try {
      await writeContractAsync({
        address: ADDRESSES.SealedPool,
        abi: SEALED_POOL_ABI,
        functionName: "createMarket",
        args: [question, BigInt(outcomeCount), deadline, resolution, ADDRESSES.USDC_e],
      });
      setQuestion("");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="max-w-xl">
      <h1 className="text-3xl font-semibold mb-2">Admin</h1>
      <p className="text-muted mb-8">
        Create new markets. Admin only. The current owner is{" "}
        <span className="font-mono text-xs">{owner ? `${(owner as string).slice(0, 10)}...` : "loading"}</span>.
      </p>

      {!isOwner && address && (
        <div className="card border-danger mb-6">
          <p className="text-sm">You are not the SealedPool owner. Market creation will fail.</p>
        </div>
      )}

      <div className="card space-y-4">
        <div>
          <label className="block text-xs text-muted mb-1">Question</label>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. Will GPT-5 ship before July 1, 2026?"
            className="input w-full"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-muted mb-1">Outcomes</label>
            <input
              type="number"
              min="2"
              max="20"
              value={outcomeCount}
              onChange={(e) => setOutcomeCount(parseInt(e.target.value || "2"))}
              className="input w-full"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Deadline (min)</label>
            <input
              type="number"
              min="1"
              value={deadlineMinutes}
              onChange={(e) => setDeadlineMinutes(parseInt(e.target.value || "60"))}
              className="input w-full"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Resolution (min)</label>
            <input
              type="number"
              min="2"
              value={resolutionMinutes}
              onChange={(e) => setResolutionMinutes(parseInt(e.target.value || "75"))}
              className="input w-full"
            />
          </div>
        </div>

        <button onClick={handleCreate} disabled={isPending} className="btn-primary w-full">
          {isPending ? "Creating..." : "Create market"}
        </button>

        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    </div>
  );
}
