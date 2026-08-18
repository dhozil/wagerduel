"""Expected contract state fixtures for P2P Gambling integration tests."""

EMPTY_ADDRESS = "0x0000000000000000000000000000000000000000"
AMOUNT = 1_000_000
RESOLUTION_URL = "https://www.bbc.com/sport/football/scores-fixtures/2024-06-20"


def open_bet_state(creator) -> dict:
    return {
        "id": "2024-06-20_spain_italy",
        "creator": creator,
        "opponent": EMPTY_ADDRESS,
        "game_date": "2024-06-20",
        "resolution_url": RESOLUTION_URL,
        "team1": "Spain",
        "team2": "Italy",
        "creator_side": "1",
        "opponent_side": "",
        "amount": AMOUNT,
        "status": "OPEN",
        "real_winner": "",
        "real_score": "",
        "winner": EMPTY_ADDRESS,
    }


def joined_bet_state(creator, opponent) -> dict:
    state = open_bet_state(creator)
    state["opponent"] = opponent
    state["opponent_side"] = "2"
    state["status"] = "JOINED"
    return state


def resolved_creator_wins_state(creator) -> dict:
    state = open_bet_state(creator)
    state["opponent_side"] = "2"
    state["status"] = "RESOLVED"
    state["real_winner"] = "1"
    state["real_score"] = "1:0"
    state["winner"] = creator
    return state