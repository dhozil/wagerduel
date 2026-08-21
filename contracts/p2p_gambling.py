# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from genlayer import *


SIDE_TEAM1 = "1"
SIDE_TEAM2 = "2"
SIDE_DRAW = "0"

STATUS_OPEN = "OPEN"
STATUS_JOINED = "JOINED"
STATUS_RESOLVED = "RESOLVED"
STATUS_CANCELED = "CANCELED"

# After this many days past the match date, either party (or anyone) can
# trigger the deterministic expiry refund. This guarantees escrow can never
# be locked forever if the result stays unavailable or consensus fails.
SETTLEMENT_WINDOW_DAYS = 14

# Platform fee charged on each settled pot, in basis points (200 = 2%).
# Accumulated in owner_fees and withdrawable only by the owner.
FEE_BPS = 200

# Maximum handicap given to either team, in half-goals (4 halves = 2 goals).
# Positive handicaps are given to Team 2, negative to Team 1.
HANDICAP_MAX_HALVES = 4

# Only these authoritative football hosts may be used as the match resolution
# source. The list is hardcoded so any user can audit it on-chain - no oracle,
# no owner-controlled source selection.
TRUSTED_SOURCE_HOSTS = {
    "bbc.com",
    "www.bbc.com",
    "bbc.co.uk",
    "www.bbc.co.uk",
    "espn.com",
    "www.espn.com",
    "skysports.com",
    "www.skysports.com",
    "fotmob.com",
    "www.fotmob.com",
    "goal.com",
    "www.goal.com",
    "theguardian.com",
    "www.theguardian.com",
    "uefa.com",
    "www.uefa.com",
    "premierleague.com",
    "www.premierleague.com",
}


def _trusted_host_of(url: str) -> str:
    """Extract the lowercase host from a URL without urllib.

    Keeps URL validation portable across GenVM runtimes (no stdlib reliance).
    """
    rest = url.split("://", 1)[1] if "://" in url else url
    host = rest.split("/", 1)[0].split(":", 1)[0].strip().lower()
    return host


@gl.evm.contract_interface
class _EOARecipient:
    """EVM-layer interface used to send native value to an EOA.

    EOAs live on the chain layer, so transfers to them are external messages
    that go through the contract's ghost contract and always settle on
    finalization - this is NOT the same as gl.get_contract_at(...).emit_transfer
    which targets intelligent contracts (triggers __receive__).
    """

    class View:
        pass

    class Write:
        pass


@allow_storage
@dataclass
class Bet:
    id: str
    creator: Address
    opponent: Address
    game_date: str
    kickoff_utc: str
    resolution_url: str
    team1: str
    team2: str
    creator_side: str
    opponent_side: str
    handicap_halves: i256
    amount: u256
    status: str
    real_winner: str
    real_score: str
    winner: Address


class BetSettledEvent(gl.Event):
    def __init__(self, bet_id: str, winner: Address, /, **blob): ...


class WithdrawalEvent(gl.Event):
    def __init__(self, addr: Address, /, **blob): ...


class FeesWithdrawnEvent(gl.Event):
    def __init__(self, addr: Address, /, **blob): ...


class P2PGambling(gl.Contract):
    owner: Address
    bets: TreeMap[str, Bet]
    balances: TreeMap[Address, u256]
    owner_fees: u256
    total_escrow: u256

    def __init__(self):
        self.owner = gl.message.sender_address

    def _verify_fixtures(
        self, game_date: str, team1: str, team2: str, resolution_url: str
    ) -> bool:
        """Verify that team1 vs team2 appears in the real fixtures for game_date.

        Fetches the resolution URL page and uses an LLM to extract the fixtures.
        Returns True only if both team names match a real fixture on that date.
        This prevents spam bets with fabricated team names.
        """

        def leader_fn():
            web_data = gl.nondet.web.render(resolution_url, mode="text")

            prompt = f"""You are a football fixture verifier. Below is a fixtures/scores
page for the date {game_date}.

Web content:
{web_data}

Check if a match between "{team1}" and "{team2}" exists on this page.
The team names may appear in different casings or with slight formatting
differences (e.g. "Man City" vs "Manchester City"). Be lenient — accept
reasonable abbreviations and common short forms.

Respond in JSON with exactly these keys:
{{
    "valid": true|false
}}
It is mandatory that you respond only using the JSON format above. Do not
include any other words or characters, no markdown code fences, no commentary.
"""
            result = gl.nondet.exec_prompt(prompt, response_format="json")
            return bool(result.get("valid", False))

        def validator_fn(leader_result) -> bool:
            if not isinstance(leader_result, gl.vm.Return):
                return False
            my_result = leader_fn()
            return leader_result.calldata == my_result

        return gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

    def _fetch_match_result(self, resolution_url: str, team1: str, team2: str) -> dict:
        def leader_fn():
            web_data = gl.nondet.web.render(resolution_url, mode="text")

            prompt = f"""
You are a match-result extractor. Determine the final result of a football match.

Team 1: {team1}
Team 2: {team2}

Web content:
{web_data}

Extract the FINAL score and the winner. If the match has not been played yet or
there is no final result, set winner to -1 and score to "-".

Respond in JSON with exactly these keys:
{{
    "score": "X:Y",     // final score, e.g. "2:1", or "-" if no result yet
    "winner": 1|2|0|-1  // 1 if Team 1 won, 2 if Team 2 won, 0 for a draw,
                        // -1 if the match has not finished
}}
It is mandatory that you respond only using the JSON format above. Do not include
any other words or characters, no markdown code fences, no commentary.
"""
            result = gl.nondet.exec_prompt(prompt, response_format="json")
            return {
                "score": str(result.get("score", "-")),
                "winner": int(result.get("winner", -1)),
            }

        def validator_fn(leader_result) -> bool:
            if not isinstance(leader_result, gl.vm.Return):
                return False
            my_result = leader_fn()
            leader_data = leader_result.calldata
            # Only the decision fields matter - score formatting must match exactly.
            return (
                leader_data.get("winner") == my_result.get("winner")
                and leader_data.get("score") == my_result.get("score")
            )

        return gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

    @gl.public.write.payable
    def deposit(self) -> None:
        """Add value to the caller's on-chain balance."""
        if gl.message.value <= 0:
            raise gl.vm.UserError("Deposit must be greater than 0")
        sender = gl.message.sender_address
        self.balances[sender] = u256(self.balances.get(sender, 0) + gl.message.value)

    @gl.public.write
    def withdraw(self, amount: u256) -> None:
        """Withdraw value from the caller's own balance back to their wallet."""
        if amount <= 0:
            raise gl.vm.UserError("Withdraw amount must be greater than 0")
        sender = gl.message.sender_address
        if self.balances.get(sender, 0) < amount:
            raise gl.vm.UserError("Insufficient balance")

        self.balances[sender] = u256(self.balances.get(sender, 0) - amount)
        _EOARecipient(sender).emit_transfer(value=amount)
        WithdrawalEvent(sender, amount=int(amount)).emit()

    @gl.public.write
    def create_bet(
        self,
        game_date: str,
        team1: str,
        team2: str,
        side: str,
        resolution_url: str,
        amount: u256,
        handicap_halves: i256 = 0,
        kickoff_utc: str = "",
    ) -> None:
        if side not in (SIDE_TEAM1, SIDE_TEAM2, SIDE_DRAW):
            raise gl.vm.UserError("Side must be '1', '2', or '0'")
        if not team1 or not team2 or team1.lower() == team2.lower():
            raise gl.vm.UserError("Team names must be distinct and non-empty")
        if not game_date:
            raise gl.vm.UserError("Game date is required")
        if amount <= 0:
            raise gl.vm.UserError("Bet amount must be greater than 0")
        if (
            handicap_halves < -HANDICAP_MAX_HALVES
            or handicap_halves > HANDICAP_MAX_HALVES
        ):
            raise gl.vm.UserError("Handicap must be between -2 and +2 goals")
        if side == SIDE_DRAW and handicap_halves != 0:
            raise gl.vm.UserError("Handicap is only available for team bets")

        if not (
            resolution_url.startswith("http://")
            or resolution_url.startswith("https://")
        ):
            raise gl.vm.UserError("Resolution URL must use a trusted source")
        if _trusted_host_of(resolution_url) not in TRUSTED_SOURCE_HOSTS:
            raise gl.vm.UserError("Resolution URL must use a trusted source")

        # Validate game_date format (YYYY-MM-DD)
        try:
            parsed_date = date.fromisoformat(game_date)
        except (ValueError, TypeError):
            raise gl.vm.UserError(
                "Game date must be in YYYY-MM-DD format"
            )

        # Reject bets with past game dates (prevents spam with old/fake dates)
        try:
            current_date = date.fromisoformat(gl.message_raw["datetime"][:10])
        except (ValueError, TypeError, KeyError):
            raise gl.vm.UserError("Unable to determine current date")
        if parsed_date < current_date:
            raise gl.vm.UserError("Game date must not be in the past")

        # Validate kickoff_utc (ISO 8601 UTC, e.g. "2026-08-23T19:30:00Z")
        if kickoff_utc:
            try:
                kickoff_dt = datetime.fromisoformat(kickoff_utc.replace("Z", "+00:00"))
            except (ValueError, TypeError):
                raise gl.vm.UserError(
                    "Kickoff time must be a valid ISO 8601 UTC timestamp"
                )
        else:
            kickoff_dt = None

        sender = gl.message.sender_address
        if sender == self.owner:
            raise gl.vm.UserError("Owner cannot place bets")
        if self.balances.get(sender, 0) < amount:
            raise gl.vm.UserError("Insufficient balance")

        # Verify teams exist in real fixtures for this date
        if not self._verify_fixtures(game_date, team1, team2, resolution_url):
            raise gl.vm.UserError(
                "Teams not found in fixtures for this date"
            )

        bet_id = f"{game_date}_{team1}_{team2}".lower()
        if bet_id in self.bets and self.bets[bet_id].status in (
            STATUS_OPEN,
            STATUS_JOINED,
        ):
            raise gl.vm.UserError("A bet for this match already exists")

        bet = Bet(
            id=bet_id,
            creator=sender,
            opponent=Address(bytes(20)),
            game_date=game_date,
            kickoff_utc=kickoff_utc,
            resolution_url=resolution_url,
            team1=team1,
            team2=team2,
            creator_side=side,
            opponent_side="",
            handicap_halves=handicap_halves,
            amount=amount,
            status=STATUS_OPEN,
            real_winner="",
            real_score="",
            winner=Address(bytes(20)),
        )
        self.balances[sender] = u256(self.balances.get(sender, 0) - amount)
        self.bets[bet_id] = bet
        self.total_escrow += amount

    @gl.public.write
    def join_bet(self, bet_id: str, side: str) -> None:
        if bet_id not in self.bets:
            raise gl.vm.UserError("Bet not found")
        bet = self.bets[bet_id]

        # --- Match cutoff enforcement ---
        # 1. Settlement window passed (most specific — must use refund, not re‑join)
        try:
            current_date = date.fromisoformat(gl.message_raw["datetime"][:10])
            match_date = date.fromisoformat(bet.game_date)
        except (ValueError, TypeError, KeyError):
            raise gl.vm.UserError("Unable to determine match timing")
        if current_date >= match_date + timedelta(days=SETTLEMENT_WINDOW_DAYS):
            raise gl.vm.UserError("Cannot join bet: settlement window has passed; use refund")
        # 2. Match kickoff passed (use precise datetime if available, else date-only)
        if bet.kickoff_utc:
            try:
                now_str = gl.message_raw["datetime"]
                now_utc = datetime.fromisoformat(now_str.replace("Z", "+00:00"))
                kickoff_dt = datetime.fromisoformat(bet.kickoff_utc.replace("Z", "+00:00"))
                if now_utc >= kickoff_dt:
                    raise gl.vm.UserError("Cannot join bet: match has already started")
            except gl.vm.UserError:
                raise
            except Exception:
                # Fallback to date-only comparison if kickoff_utc is malformed
                if current_date >= match_date:
                    raise gl.vm.UserError("Cannot join bet: match has already started or completed")
        else:
            if current_date >= match_date:
                raise gl.vm.UserError("Cannot join bet: match has already started or completed")
        # --------------------------------

        if bet.status != STATUS_OPEN:
            raise gl.vm.UserError("Bet is not open")
        if bet.creator == gl.message.sender_address:
            raise gl.vm.UserError("Cannot join your own bet")
        if side not in (SIDE_TEAM1, SIDE_TEAM2, SIDE_DRAW):
            raise gl.vm.UserError("Side must be '1', '2', or '0'")
        if side == bet.creator_side:
            raise gl.vm.UserError("Must bet on the opposite outcome")
        if self.balances.get(gl.message.sender_address, 0) < bet.amount:
            raise gl.vm.UserError("Insufficient balance")

        sender = gl.message.sender_address
        if sender == self.owner:
            raise gl.vm.UserError("Owner cannot place bets")
        self.balances[sender] = u256(self.balances.get(sender, 0) - bet.amount)
        bet.opponent = sender
        bet.opponent_side = side
        bet.status = STATUS_JOINED
        self.total_escrow += bet.amount

    @gl.public.write
    def resolve_bet(self, bet_id: str) -> None:
        if bet_id not in self.bets:
            raise gl.vm.UserError("Bet not found")
        bet = self.bets[bet_id]

        if bet.status != STATUS_JOINED:
            raise gl.vm.UserError("Bet must be joined by two players to resolve")

        match_status = self._fetch_match_result(
            bet.resolution_url, bet.team1, bet.team2
        )

        real_winner = str(match_status["winner"])
        if real_winner == "-1":
            raise gl.vm.UserError("Match not finished")

        if bet.handicap_halves != 0:
            adjusted = self._adjusted_winner(bet, str(match_status["score"]))
            if adjusted is not None:
                real_winner = adjusted

        winner_addr = self._determine_winner(bet, real_winner)

        if winner_addr is None:
            # Draw result (or no side matched) - refund both, no fee.
            self._refund_both(bet, real_winner, str(match_status["score"]))
        else:
            self._pay_winner(
                bet, real_winner, str(match_status["score"]), winner_addr
            )

    def _pay_winner(
        self, bet: Bet, real_winner: str, real_score: str, winner_addr: Address
    ) -> None:
        pot = bet.amount * 2
        # Round up to at least 1 wei so even tiny pots never bypass the fee.
        fee = max(pot * FEE_BPS // 10000, 1)
        payout = pot - fee

        bet.status = STATUS_RESOLVED
        bet.real_winner = real_winner
        bet.real_score = real_score
        bet.winner = winner_addr

        self.balances[winner_addr] = u256(
            self.balances.get(winner_addr, 0) + payout
        )
        self.owner_fees += fee
        self.total_escrow -= pot

        BetSettledEvent(
            bet.id,
            winner_addr,
            amount=int(bet.amount),
            pot=int(pot),
            fee=int(fee),
            winner_side=real_winner,
            score=real_score,
        ).emit()

    def _refund_both(self, bet: Bet, reason: str, real_score: str = "") -> None:
        bet.status = STATUS_RESOLVED
        bet.real_winner = reason
        bet.real_score = real_score
        bet.winner = Address(bytes(20))

        self.balances[bet.creator] = u256(
            self.balances.get(bet.creator, 0) + bet.amount
        )
        self.balances[bet.opponent] = u256(
            self.balances.get(bet.opponent, 0) + bet.amount
        )
        self.total_escrow -= bet.amount * 2

        BetSettledEvent(
            bet.id,
            Address(bytes(20)),
            amount=int(bet.amount),
            pot=int(bet.amount * 2),
            fee=0,
            winner_side=reason,
            score=real_score,
        ).emit()

    def _deadline_passed(self, game_date: str) -> bool:
        """True when the settlement window (match date + N days) has elapsed."""
        try:
            current = date.fromisoformat(gl.message_raw["datetime"][:10])
            match_date = date.fromisoformat(game_date)
        except (ValueError, TypeError, KeyError):
            # Fail closed: never unlock early on malformed dates.
            return False
        return current >= match_date + timedelta(days=SETTLEMENT_WINDOW_DAYS)

    @gl.public.write
    def refund_expired(self, bet_id: str) -> None:
        """Deterministic escape hatch: after the deadline, settle any unsettled bet.

        Performs NO web/LLM call, so it can never go undetermined:

        * A JOINED bet -> both stakes are returned to the players.
        * An OPEN bet  -> no opponent ever joined (and joining is now blocked
          once the window closes), so the creator's stake is returned and the
          bet is canceled instead of lingering forever.
        """
        if bet_id not in self.bets:
            raise gl.vm.UserError("Bet not found")
        bet = self.bets[bet_id]

        if bet.status == STATUS_OPEN:
            if not self._deadline_passed(bet.game_date):
                raise gl.vm.UserError("Settlement deadline not reached yet")
            self.balances[bet.creator] = u256(
                self.balances.get(bet.creator, 0) + bet.amount
            )
            self.total_escrow -= bet.amount
            bet.status = STATUS_CANCELED
            bet.real_winner = "REFUND"
        elif bet.status == STATUS_JOINED:
            if not self._deadline_passed(bet.game_date):
                raise gl.vm.UserError("Settlement deadline not reached yet")
            self._refund_both(bet, "REFUND")
        else:
            raise gl.vm.UserError("Bet must be open or joined by two players")

    @gl.public.write
    def withdraw_fees(self) -> None:
        """Owner-only: withdraw the accumulated platform fees.

        Only the owner can call this, and it moves only ``owner_fees`` (the
        aggregate fees collected from settled duels). User balances and active
        escrow are never touched.
        """
        if gl.message.sender_address != self.owner:
            raise gl.vm.UserError("Only the contract owner can withdraw fees")
        if self.owner_fees <= 0:
            raise gl.vm.UserError("No fees to withdraw")

        amount = self.owner_fees
        self.owner_fees = 0
        _EOARecipient(self.owner).emit_transfer(value=amount)
        FeesWithdrawnEvent(self.owner, amount=int(amount)).emit()

    @gl.public.write
    def cancel_bet(self, bet_id: str) -> None:
        if bet_id not in self.bets:
            raise gl.vm.UserError("Bet not found")
        bet = self.bets[bet_id]

        if bet.status != STATUS_OPEN:
            raise gl.vm.UserError("Only open bets can be canceled")
        if bet.creator != gl.message.sender_address:
            raise gl.vm.UserError("Only the creator can cancel the bet")

        bet.status = STATUS_CANCELED
        self.balances[bet.creator] = u256(
            self.balances.get(bet.creator, 0) + bet.amount
        )
        self.total_escrow -= bet.amount

    def _adjusted_winner(self, bet: Bet, real_score: str) -> str | None:
        """Recompute the winner from the final score plus the handicap.

        The handicap is stored in half-goals (positive = Team 2 gets the head
        start, negative = Team 1). Scores are compared in half-goal units so
        0.5-goal handicaps stay exact. Returns None when the score cannot be
        parsed, in which case the caller falls back to the verified verdict.
        """
        parts = [p for p in real_score.split(":") if p.strip().isdigit()]
        if len(parts) != 2:
            return None
        s1_halves = int(parts[0]) * 2
        s2_halves = int(parts[1]) * 2 + int(bet.handicap_halves)
        if s1_halves > s2_halves:
            return SIDE_TEAM1
        if s1_halves < s2_halves:
            return SIDE_TEAM2
        return SIDE_DRAW

    def _determine_winner(self, bet: Bet, real_winner: str):
        if real_winner == SIDE_DRAW:
            if bet.creator_side == SIDE_DRAW:
                return bet.creator
            if bet.opponent_side == SIDE_DRAW:
                return bet.opponent
            return None
        if bet.creator_side == real_winner:
            return bet.creator
        if bet.opponent_side == real_winner:
            return bet.opponent
        return None

    @gl.public.view
    def get_balance(self, addr: str) -> int:
        return int(self.balances.get(Address(addr), 0))

    @gl.public.view
    def get_owner_fees(self) -> int:
        return int(self.owner_fees)

    @gl.public.view
    def get_bet(self, bet_id: str) -> dict:
        if bet_id not in self.bets:
            raise gl.vm.UserError("Bet not found")
        bet = self.bets[bet_id]
        return {
            "id": bet.id,
            "creator": bet.creator.as_hex,
            "opponent": bet.opponent.as_hex,
            "game_date": bet.game_date,
            "kickoff_utc": bet.kickoff_utc,
            "resolution_url": bet.resolution_url,
            "team1": bet.team1,
            "team2": bet.team2,
            "creator_side": bet.creator_side,
            "opponent_side": bet.opponent_side,
            "handicap_halves": int(bet.handicap_halves),
            "amount": int(bet.amount),
            "status": bet.status,
            "real_winner": bet.real_winner,
            "real_score": bet.real_score,
            "winner": bet.winner.as_hex,
        }

    @gl.public.view
    def get_bets(self) -> dict:
        return {bet_id: self.get_bet(bet_id) for bet_id in self.bets}

    @gl.public.view
    def get_total_escrow(self) -> int:
        return int(self.total_escrow)

    @gl.public.view
    def get_owner(self) -> str:
        return self.owner.as_hex
