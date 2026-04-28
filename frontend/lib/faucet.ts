"use client";

import { useState, useCallback } from "react";

type Status = "idle" | "pending" | "ok" | "error";

export function useFaucet() {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const claim = useCallback(async (address: string) => {
    setStatus("pending");
    setMessage("Sending 5 USDC.e from the dev faucet…");
    setTxHash(null);
    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? `Faucet returned ${res.status}`);
      }
      setStatus("ok");
      setMessage(`Sent ${data.amount} ${data.symbol} → ${address.slice(0, 6)}…${address.slice(-4)}`);
      setTxHash(data.txHash);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Faucet failed";
      setStatus("error");
      setMessage(msg);
    }
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setMessage(null);
    setTxHash(null);
  }, []);

  return { claim, reset, status, message, txHash };
}
