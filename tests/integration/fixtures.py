"""Expected contract state fixtures for P2P Gambling integration tests."""

EMPTY_ADDRESS = "0x0000000000000000000000000000000000000000"
AMOUNT = 1_000_000
RESOLUTION_URL = "https://www.bbc.com/sport/football/scores-fixtures/2024-06-20"


def parse_bet_id(bet_id: str) -> tuple[str, str, str]:
    """Split a bet id (game_date_team1_team2) back into its parts (lowercase)."""
    parts = bet_id.split("_")
    return parts[0], parts[1], "_".join(parts[2:])


def open_bet_state(creator, bet_id, handicap_halves=0,
                   team1=None, team2=None) -> dict:
    date, _, _ = parse_bet_id(bet_id)
    if team1 is None or team2 is None:
        _, team1, team2 = parse_bet_id(bet_id)
    return {
        "id": bet_id,
        "creator": creator,
        "opponent": EMPTY_ADDRESS,
        "game_date": date,
        "resolution_url": RESOLUTION_URL,
        "team1": team1,
        "team2": team2,
        "creator_side": "1",
        "opponent_side": "",
        "handicap_halves": handicap_halves,
        "amount": AMOUNT,
        "status": "OPEN",
        "real_winner": "",
        "real_score": "",
        "winner": EMPTY_ADDRESS,
    }


def joined_bet_state(creator, opponent, bet_id, handicap_halves=0,
                     team1=None, team2=None) -> dict:
    state = open_bet_state(creator, bet_id, handicap_halves, team1, team2)
    state["opponent"] = opponent
    state["opponent_side"] = "2"
    state["status"] = "JOINED"
    return state