import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import type { Bet, TransactionReceipt } from "./types";
import {
  estimateWriteFeePreset,
  feePresetToTransactionFees,
  type FeePresetEstimate,
  type FeePresetLevel,
} from "../genlayer/fees";

/**
 * P2PGambling contract class for interacting with the GenLayer
 * head-to-head betting contract (escrow + AI/web-verified resolution).
 */
class P2PGambling {
  private contractAddress: `0x${string}`;
  private client: any;
  private studioUrl?: string;

  constructor(
    contractAddress: string,
    address?: string | null,
    studioUrl?: string
  ) {
    this.contractAddress = contractAddress as `0x${string}`;
    this.studioUrl = studioUrl;

    const config: any = {
      chain: studionet,
    };

    if (address) {
      config.account = address as `0x${string}`;
    }

    if (studioUrl) {
      config.endpoint = studioUrl;
    }

    this.client = createClient(config);
  }

  /**
   * Update the address used for transactions
   */
  updateAccount(address: string): void {
    const config: any = {
      chain: studionet,
      account: address as `0x${string}`,
    };

    if (this.studioUrl) {
      config.endpoint = this.studioUrl;
    }

    this.client = createClient(config);
  }

  private async read(functionName: string, args: unknown[] = []): Promise<any> {
    return this.client.readContract({
      address: this.contractAddress,
      functionName,
      args,
    });
  }

  private async write(
    functionName: string,
    args: unknown[],
    value: bigint,
    feePreset?: FeePresetEstimate
  ): Promise<TransactionReceipt> {
    const fees = feePresetToTransactionFees(feePreset);
    const txHash = await this.client.writeContract({
      address: this.contractAddress,
      functionName,
      args,
      value,
      ...(fees ? { fees } : {}),
    });

    const receipt = await this.client.waitForTransactionReceipt({
      hash: txHash,
      status: "ACCEPTED" as any,
      retries: 24,
      interval: 5000,
    });

    this.assertSuccess(receipt, functionName);

    return receipt as TransactionReceipt;
  }

  /**
   * A transaction can be ACCEPTED/FINALIZED yet still have reverted inside the
   * contract (e.g. insufficient balance, bad side, already settled). Treat that
   * as a failure so the UI never shows a success toast for a reverted tx.
   */
  private assertSuccess(receipt: any, fn: string): void {
    const execName = receipt?.txExecutionResultName;
    if (execName === "FINISHED_WITH_ERROR") {
      throw new Error(`Transaction reverted: ${fn}`);
    }
    const leader = receipt?.consensus_data?.leader_receipt?.[0];
    if (leader?.execution_result && leader.execution_result !== "SUCCESS") {
      throw new Error(`Transaction failed (${leader.execution_result}): ${fn}`);
    }
    if (receipt?.statusName && !["ACCEPTED", "FINALIZED"].includes(receipt.statusName)) {
      throw new Error(`Transaction not accepted (${receipt.statusName}): ${fn}`);
    }
  }

  private normalizeBetEntry(id: string, raw: any): Bet {
    const betObj =
      raw instanceof Map
        ? Array.from(raw.entries()).reduce(
            (obj: any, [key, value]: any) => {
              obj[key] = value;
              return obj;
            },
            {} as Record<string, any>
          )
        : raw;

    return {
      id,
      creator: betObj.creator ?? "",
      opponent: betObj.opponent ?? "",
      game_date: betObj.game_date ?? "",
      resolution_url: betObj.resolution_url,
      team1: betObj.team1 ?? "",
      team2: betObj.team2 ?? "",
      creator_side: betObj.creator_side ?? "",
      opponent_side: betObj.opponent_side ?? "",
      amount: Number(betObj.amount) || 0,
      status: betObj.status ?? "",
      real_winner: betObj.real_winner ?? "",
      real_score: betObj.real_score ?? "",
      winner: betObj.winner ?? "",
    };
  }

  /**
   * Get all bets from the contract.
   */
  async getBets(): Promise<Bet[]> {
    try {
      const bets = await this.read("get_bets");

      if (bets instanceof Map) {
        return Array.from(bets.entries()).map(([id, data]: any) =>
          this.normalizeBetEntry(id, data)
        );
      }

      if (bets && typeof bets === "object") {
        return Object.entries(bets).map(([id, data]: any) =>
          this.normalizeBetEntry(id, data)
        );
      }

      return [];
    } catch (error) {
      console.error("Error fetching bets:", error);
      throw new Error("Failed to fetch bets from contract");
    }
  }

  /**
   * Get a single bet.
   */
  async getBet(betId: string): Promise<Bet | null> {
    try {
      const raw = await this.read("get_bet", [betId]);
      return this.normalizeBetEntry(betId, raw);
    } catch (error) {
      console.error("Error fetching bet:", error);
      return null;
    }
  }

  /**
   * Total value locked in escrow across all active bets (wei).
   */
  async getTotalEscrow(): Promise<number> {
    try {
      const escrow = await this.read("get_total_escrow");
      return Number(escrow) || 0;
    } catch (error) {
      console.error("Error fetching escrow:", error);
      return 0;
    }
  }

  /**
   * Contract owner address.
   */
  async getOwner(): Promise<string | null> {
    try {
      return (await this.read("get_owner")) || null;
    } catch (error) {
      console.error("Error fetching owner:", error);
      return null;
    }
  }

  async estimateCreateBetFees(
    gameDate: string,
    team1: string,
    team2: string,
    side: string,
    resolutionUrl: string,
    amount: bigint,
    level: FeePresetLevel = "standard"
  ): Promise<FeePresetEstimate | undefined> {
    return estimateWriteFeePreset(
      this.client,
      {
        address: this.contractAddress,
        functionName: "create_bet",
        args: [gameDate, team1, team2, side, resolutionUrl, amount],
        value: BigInt(0),
      },
      level
    );
  }

  async estimateJoinBetFees(
    betId: string,
    side: string,
    level: FeePresetLevel = "standard"
  ): Promise<FeePresetEstimate | undefined> {
    return estimateWriteFeePreset(
      this.client,
      {
        address: this.contractAddress,
        functionName: "join_bet",
        args: [betId, side],
        value: BigInt(0),
      },
      level
    );
  }

  async estimateResolveBetFees(
    betId: string,
    level: FeePresetLevel = "standard"
  ): Promise<FeePresetEstimate | undefined> {
    return estimateWriteFeePreset(
      this.client,
      {
        address: this.contractAddress,
        functionName: "resolve_bet",
        args: [betId],
      },
      level
    );
  }

  /**
   * Deposit value into the caller's on-chain balance.
   */
  async deposit(amountWei: bigint): Promise<TransactionReceipt> {
    try {
      return await this.write("deposit", [], amountWei);
    } catch (error) {
      console.error("Error depositing:", error);
      throw new Error("Failed to deposit");
    }
  }

  /**
   * Withdraw value from the caller's own balance back to their wallet.
   */
  async withdraw(amountWei: bigint): Promise<TransactionReceipt> {
    try {
      return await this.write("withdraw", [amountWei], BigInt(0));
    } catch (error) {
      console.error("Error withdrawing:", error);
      throw new Error("Failed to withdraw");
    }
  }

  /**
   * On-chain contract balance for an address (wei).
   */
  async getBalance(address: string): Promise<number> {
    try {
      const bal = await this.read("get_balance", [address]);
      return Number(bal) || 0;
    } catch (error) {
      console.error("Error fetching balance:", error);
      return 0;
    }
  }

  /**
   * Accumulated platform fees held for the owner (wei).
   */
  async getOwnerFees(): Promise<number> {
    try {
      const fees = await this.read("get_owner_fees");
      return Number(fees) || 0;
    } catch (error) {
      console.error("Error fetching owner fees:", error);
      return 0;
    }
  }

  /**
   * Create a new bet, funded from the caller's on-chain balance.
   * `resolutionUrl` is the trusted source the creator commits to.
   */
  async createBet(
    gameDate: string,
    team1: string,
    team2: string,
    side: string,
    resolutionUrl: string,
    amountWei: bigint,
    feePreset?: FeePresetEstimate
  ): Promise<TransactionReceipt> {
    try {
      return await this.write(
        "create_bet",
        [gameDate, team1, team2, side, resolutionUrl, amountWei],
        BigInt(0),
        feePreset
      );
    } catch (error) {
      console.error("Error creating bet:", error);
      throw new Error("Failed to create bet");
    }
  }

  /**
   * Join an open bet — funded from the caller's on-chain balance.
   */
  async joinBet(
    betId: string,
    side: string,
    feePreset?: FeePresetEstimate
  ): Promise<TransactionReceipt> {
    try {
      return await this.write("join_bet", [betId, side], BigInt(0), feePreset);
    } catch (error) {
      console.error("Error joining bet:", error);
      throw new Error("Failed to join bet");
    }
  }

  /**
   * Resolve a bet — AI/web verified result determines the payout.
   */
  async resolveBet(betId: string): Promise<TransactionReceipt> {
    try {
      const feePreset = await this.estimateResolveBetFees(betId);
      return await this.write("resolve_bet", [betId], BigInt(0), feePreset);
    } catch (error) {
      console.error("Error resolving bet:", error);
      throw new Error("Failed to resolve bet");
    }
  }

  /**
   * Cancel an open bet (creator gets their stake back).
   */
  async cancelBet(betId: string): Promise<TransactionReceipt> {
    try {
      return await this.write("cancel_bet", [betId], BigInt(0));
    } catch (error) {
      console.error("Error canceling bet:", error);
      throw new Error("Failed to cancel bet");
    }
  }

  /**
   * Owner-only: recover value stuck in the contract (dust / fees).
   */
  async withdrawFees(): Promise<TransactionReceipt> {
    try {
      return await this.write("withdraw_fees", [], BigInt(0));
    } catch (error) {
      console.error("Error withdrawing fees:", error);
      throw new Error("Failed to withdraw fees");
    }
  }

  /**
   * Deterministic escape hatch: after the settlement deadline, refund both
   * players. No web/LLM involved, so it can never get stuck undetermined.
   */
  async refundExpired(betId: string): Promise<TransactionReceipt> {
    try {
      return await this.write("refund_expired", [betId], BigInt(0));
    } catch (error) {
      console.error("Error refunding expired bet:", error);
      throw new Error("Failed to refund expired bet");
    }
  }
}

export default P2PGambling;
