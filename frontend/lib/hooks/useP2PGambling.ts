"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import P2PGambling from "../contracts/P2PGambling";
import { getContractAddress, getStudioUrl } from "../genlayer/client";
import type { FeePresetLevel } from "../genlayer/fees";
import { useWallet } from "../genlayer/wallet";
import { success, error, configError } from "../utils/toast";
import type { Bet } from "../contracts/types";

/** Block write actions when the wallet is on the wrong chain — prevents funds
 * from being sent to a contract address that does not exist (or is wrong) on
 * the connected network. */
function requireCorrectNetwork(isOnCorrectNetwork?: boolean): void {
  if (!isOnCorrectNetwork) {
    throw new Error(
      "Wrong network. Please switch your wallet to the GenLayer Studio network."
    );
  }
}

/**
 * Hook to get the P2PGambling contract instance.
 *
 * Returns null if the contract address is not configured.
 * The instance is recreated whenever the wallet address changes.
 */
export function useP2PGamblingContract(): P2PGambling | null {
  const { address, isOnCorrectNetwork } = useWallet();
  const contractAddress = getContractAddress();
  const studioUrl = getStudioUrl();

  const contract = useMemo(() => {
    if (!contractAddress) {
      configError(
        "Setup Required",
        "Contract address not configured. Please set NEXT_PUBLIC_CONTRACT_ADDRESS in your .env file.",
        {
          label: "Setup Guide",
          onClick: () => window.open("/docs/setup", "_blank"),
        }
      );
      return null;
    }

    return new P2PGambling(contractAddress, address, studioUrl);
  }, [contractAddress, address, studioUrl]);

  return contract;
}

/**
 * Hook to fetch all bets.
 */
export function useBets() {
  const contract = useP2PGamblingContract();

  return useQuery<Bet[], Error>({
    queryKey: ["bets"],
    queryFn: () => {
      if (!contract) {
        return Promise.resolve([]);
      }
      return contract.getBets();
    },
    refetchOnWindowFocus: true,
    staleTime: 2000,
    enabled: !!contract,
  });
}

/**
 * Hook to fetch a single bet by its ID (e.g. "2026-08-30_spain_italy").
 * Returns null when the bet does not exist or the id is empty.
 */
export function useBetById(betId: string | null) {
  const contract = useP2PGamblingContract();

  return useQuery<Bet | null, Error>({
    queryKey: ["bet", betId],
    queryFn: () => {
      if (!contract || !betId) {
        return Promise.resolve(null);
      }
      return contract.getBet(betId);
    },
    retry: false,
    staleTime: 5000,
    enabled: !!contract && !!betId,
  });
}

/**
 * Hook to fetch the total value locked in escrow (wei).
 */
export function useTotalEscrow() {
  const contract = useP2PGamblingContract();

  return useQuery<number, Error>({
    queryKey: ["totalEscrow"],
    queryFn: () => {
      if (!contract) {
        return Promise.resolve(0);
      }
      return contract.getTotalEscrow();
    },
    refetchOnWindowFocus: true,
    staleTime: 2000,
    enabled: !!contract,
  });
}

/**
 * Hook to fetch the contract owner address.
 */
export function useOwner() {
  const contract = useP2PGamblingContract();

  return useQuery<string | null, Error>({
    queryKey: ["owner"],
    queryFn: () => {
      if (!contract) {
        return Promise.resolve(null);
      }
      return contract.getOwner();
    },
    staleTime: 60_000,
    enabled: !!contract,
  });
}

/**
 * Hook to fetch a user's on-chain contract balance (wei).
 */
export function useBalance(address: string | null) {
  const contract = useP2PGamblingContract();

  return useQuery<number, Error>({
    queryKey: ["balance", address],
    queryFn: () => {
      if (!contract || !address) {
        return Promise.resolve(0);
      }
      return contract.getBalance(address);
    },
    refetchOnWindowFocus: true,
    staleTime: 2000,
    enabled: !!address && !!contract,
  });
}

/**
 * Hook to fetch the owner's accumulated platform fees (wei).
 */
export function useOwnerFees() {
  const contract = useP2PGamblingContract();

  return useQuery<number, Error>({
    queryKey: ["ownerFees"],
    queryFn: () => {
      if (!contract) {
        return Promise.resolve(0);
      }
      return contract.getOwnerFees();
    },
    refetchOnWindowFocus: true,
    staleTime: 2000,
    enabled: !!contract,
  });
}

/**
 * Hook to deposit value into the caller's on-chain balance.
 */
export function useDeposit() {
  const contract = useP2PGamblingContract();
  const { address, isOnCorrectNetwork } = useWallet();
  const queryClient = useQueryClient();
  const [isDepositing, setIsDepositing] = useState(false);

  const mutation = useMutation({
    mutationFn: async (amountWei: bigint) => {
      if (!contract) {
        throw new Error(
          "Contract not configured. Please set NEXT_PUBLIC_CONTRACT_ADDRESS in your .env file."
        );
      }
      if (!address) {
        throw new Error(
          "Wallet not connected. Please connect your wallet to deposit."
        );
      }
      requireCorrectNetwork(isOnCorrectNetwork);
      setIsDepositing(true);
      return contract.deposit(amountWei);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      setIsDepositing(false);
      success("Deposit complete", {
        description: "Value added to your on-chain balance.",
      });
    },
    onError: (err: any) => {
      console.error("Error depositing:", err);
      setIsDepositing(false);
      error("Failed to deposit", {
        description: err?.message || "Please try again.",
      });
    },
  });

  return {
    ...mutation,
    isDepositing,
    deposit: mutation.mutate,
    depositAsync: mutation.mutateAsync,
  };
}

/**
 * Hook to withdraw value from the caller's on-chain balance.
 */
export function useWithdraw() {
  const contract = useP2PGamblingContract();
  const { address, isOnCorrectNetwork } = useWallet();
  const queryClient = useQueryClient();
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const mutation = useMutation({
    mutationFn: async (amountWei: bigint) => {
      if (!contract) {
        throw new Error(
          "Contract not configured. Please set NEXT_PUBLIC_CONTRACT_ADDRESS in your .env file."
        );
      }
      if (!address) {
        throw new Error(
          "Wallet not connected. Please connect your wallet to withdraw."
        );
      }
      requireCorrectNetwork(isOnCorrectNetwork);
      setIsWithdrawing(true);
      return contract.withdraw(amountWei);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      setIsWithdrawing(false);
      success("Withdrawal complete", {
        description: "Funds sent to your wallet.",
      });
    },
    onError: (err: any) => {
      console.error("Error withdrawing:", err);
      setIsWithdrawing(false);
      error("Failed to withdraw", {
        description: err?.message || "Please try again.",
      });
    },
  });

  return {
    ...mutation,
    isWithdrawing,
    withdraw: mutation.mutate,
    withdrawAsync: mutation.mutateAsync,
  };
}

/**
 * Hook to create a new bet (payable, locks escrow).
 */
export function useCreateBet() {
  const contract = useP2PGamblingContract();
  const { address, isOnCorrectNetwork } = useWallet();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);

  const mutation = useMutation({
    mutationFn: async ({
      gameDate,
      team1,
      team2,
      side,
      resolutionUrl,
      amountWei,
      handicapHalves,
      feePresetLevel,
    }: {
      gameDate: string;
      team1: string;
      team2: string;
      side: string;
      resolutionUrl: string;
      amountWei: bigint;
      handicapHalves?: number;
      feePresetLevel?: FeePresetLevel;
    }) => {
      if (!contract) {
        throw new Error(
          "Contract not configured. Please set NEXT_PUBLIC_CONTRACT_ADDRESS in your .env file."
        );
      }
      if (!address) {
        throw new Error(
          "Wallet not connected. Please connect your wallet to create a bet."
        );
      }
      requireCorrectNetwork(isOnCorrectNetwork);
      setIsCreating(true);
      const feePreset = await contract.estimateCreateBetFees(
        gameDate,
        team1,
        team2,
        side,
        resolutionUrl,
        amountWei,
        handicapHalves ?? 0,
        feePresetLevel ?? "standard"
      );
      return contract.createBet(
        gameDate,
        team1,
        team2,
        side,
        resolutionUrl,
        amountWei,
        handicapHalves ?? 0,
        feePreset
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bets"] });
      queryClient.invalidateQueries({ queryKey: ["totalEscrow"] });
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      setIsCreating(false);
      success("Bet created successfully!", {
        description: "Your stake is now locked in escrow.",
      });
    },
    onError: (err: any) => {
      console.error("Error creating bet:", err);
      setIsCreating(false);
      error("Failed to create bet", {
        description: err?.message || "Please try again.",
      });
    },
  });

  return {
    ...mutation,
    isCreating,
    createBet: mutation.mutate,
    createBetAsync: mutation.mutateAsync,
  };
}

/**
 * Hook to join an open bet (funded from the caller's on-chain balance).
 */
export function useJoinBet() {
  const contract = useP2PGamblingContract();
  const { address, isOnCorrectNetwork } = useWallet();
  const queryClient = useQueryClient();
  const [isJoining, setIsJoining] = useState(false);
  const [joiningBetId, setJoiningBetId] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async ({
      betId,
      side,
      feePresetLevel,
    }: {
      betId: string;
      side: string;
      feePresetLevel?: FeePresetLevel;
    }) => {
      if (!contract) {
        throw new Error(
          "Contract not configured. Please set NEXT_PUBLIC_CONTRACT_ADDRESS in your .env file."
        );
      }
      if (!address) {
        throw new Error(
          "Wallet not connected. Please connect your wallet to join a bet."
        );
      }
      requireCorrectNetwork(isOnCorrectNetwork);
      setIsJoining(true);
      setJoiningBetId(betId);
      const feePreset = await contract.estimateJoinBetFees(
        betId,
        side,
        feePresetLevel ?? "standard"
      );
      return contract.joinBet(betId, side, feePreset);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bets"] });
      queryClient.invalidateQueries({ queryKey: ["totalEscrow"] });
      setIsJoining(false);
      setJoiningBetId(null);
      success("Bet joined successfully!", {
        description: "Both stakes are now locked. Awaiting match resolution.",
      });
    },
    onError: (err: any) => {
      console.error("Error joining bet:", err);
      setIsJoining(false);
      setJoiningBetId(null);
      error("Failed to join bet", {
        description: err?.message || "Please try again.",
      });
    },
  });

  return {
    ...mutation,
    isJoining,
    joiningBetId,
    joinBet: mutation.mutate,
    joinBetAsync: mutation.mutateAsync,
  };
}

/**
 * Hook to resolve a bet (AI/web verifies the real-world outcome).
 */
export function useResolveBet() {
  const contract = useP2PGamblingContract();
  const { address, isOnCorrectNetwork } = useWallet();
  const queryClient = useQueryClient();
  const [isResolving, setIsResolving] = useState(false);
  const [resolvingBetId, setResolvingBetId] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (betId: string) => {
      if (!contract) {
        throw new Error(
          "Contract not configured. Please set NEXT_PUBLIC_CONTRACT_ADDRESS in your .env file."
        );
      }
      if (!address) {
        throw new Error(
          "Wallet not connected. Please connect your wallet to resolve a bet."
        );
      }
      requireCorrectNetwork(isOnCorrectNetwork);
      setIsResolving(true);
      setResolvingBetId(betId);
      return contract.resolveBet(betId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bets"] });
      queryClient.invalidateQueries({ queryKey: ["totalEscrow"] });
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      queryClient.invalidateQueries({ queryKey: ["ownerFees"] });
      setIsResolving(false);
      setResolvingBetId(null);
      success("Bet resolved!", {
        description: "The winner has been paid from the escrow.",
      });
    },
    onError: (err: any) => {
      console.error("Error resolving bet:", err);
      setIsResolving(false);
      setResolvingBetId(null);
      error("Failed to resolve bet", {
        description: err?.message || "Please try again.",
      });
    },
  });

  return {
    ...mutation,
    isResolving,
    resolvingBetId,
    resolveBet: mutation.mutate,
    resolveBetAsync: mutation.mutateAsync,
  };
}

/**
 * Hook to cancel an open bet (creator withdraws their stake).
 */
export function useCancelBet() {
  const contract = useP2PGamblingContract();
  const { address, isOnCorrectNetwork } = useWallet();
  const queryClient = useQueryClient();
  const [isCanceling, setIsCanceling] = useState(false);
  const [cancelingBetId, setCancelingBetId] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (betId: string) => {
      if (!contract) {
        throw new Error(
          "Contract not configured. Please set NEXT_PUBLIC_CONTRACT_ADDRESS in your .env file."
        );
      }
      if (!address) {
        throw new Error(
          "Wallet not connected. Please connect your wallet to cancel a bet."
        );
      }
      requireCorrectNetwork(isOnCorrectNetwork);
      setIsCanceling(true);
      setCancelingBetId(betId);
      return contract.cancelBet(betId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bets"] });
      queryClient.invalidateQueries({ queryKey: ["totalEscrow"] });
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      setIsCanceling(false);
      setCancelingBetId(null);
      success("Bet canceled", {
        description: "Your stake has been returned.",
      });
    },
    onError: (err: any) => {
      console.error("Error canceling bet:", err);
      setIsCanceling(false);
      setCancelingBetId(null);
      error("Failed to cancel bet", {
        description: err?.message || "Please try again.",
      });
    },
  });

  return {
    ...mutation,
    isCanceling,
    cancelingBetId,
    cancelBet: mutation.mutate,
    cancelBetAsync: mutation.mutateAsync,
  };
}

/**
 * Hook to withdraw owner-only accumulated platform fees.
 */
export function useWithdrawFees() {
  const contract = useP2PGamblingContract();
  const { address, isOnCorrectNetwork } = useWallet();
  const queryClient = useQueryClient();
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!contract) {
        throw new Error(
          "Contract not configured. Please set NEXT_PUBLIC_CONTRACT_ADDRESS in your .env file."
        );
      }
      if (!address) {
        throw new Error(
          "Wallet not connected. Please connect your wallet to withdraw."
        );
      }
      requireCorrectNetwork(isOnCorrectNetwork);
      setIsWithdrawing(true);
      return contract.withdrawFees();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ownerFees"] });
      setIsWithdrawing(false);
      success("Fees withdrawn", {
        description: "Accumulated platform fees sent to the owner.",
      });
    },
    onError: (err: any) => {
      console.error("Error withdrawing fees:", err);
      setIsWithdrawing(false);
      error("Failed to withdraw", {
        description: err?.message || "Please try again.",
      });
    },
  });

  return {
    ...mutation,
    isWithdrawing,
    withdrawFees: mutation.mutate,
    withdrawFeesAsync: mutation.mutateAsync,
  };
}

/**
 * Hook to refund an expired bet (deterministic escape hatch).
 */
export function useRefundExpired() {
  const contract = useP2PGamblingContract();
  const { address, isOnCorrectNetwork } = useWallet();
  const queryClient = useQueryClient();
  const [isRefunding, setIsRefunding] = useState(false);
  const [refundingBetId, setRefundingBetId] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (betId: string) => {
      if (!contract) {
        throw new Error(
          "Contract not configured. Please set NEXT_PUBLIC_CONTRACT_ADDRESS in your .env file."
        );
      }
      if (!address) {
        throw new Error(
          "Wallet not connected. Please connect your wallet to refund."
        );
      }
      requireCorrectNetwork(isOnCorrectNetwork);
      setIsRefunding(true);
      setRefundingBetId(betId);
      return contract.refundExpired(betId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bets"] });
      queryClient.invalidateQueries({ queryKey: ["totalEscrow"] });
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      setIsRefunding(false);
      setRefundingBetId(null);
      success("Bet refunded", {
        description: "Both stakes were returned — the settlement window passed.",
      });
    },
    onError: (err: any) => {
      console.error("Error refunding expired bet:", err);
      setIsRefunding(false);
      setRefundingBetId(null);
      error("Failed to refund bet", {
        description: err?.message || "Please try again.",
      });
    },
  });

  return {
    ...mutation,
    isRefunding,
    refundingBetId,
    refundExpired: mutation.mutate,
    refundExpiredAsync: mutation.mutateAsync,
  };
}
