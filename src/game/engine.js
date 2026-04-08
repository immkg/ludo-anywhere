// 🎯 Initialize Game
export function createGame(players) {
  return {
    players: players.map((p) => ({
      ...p,
      tokens: [-1, -1, -1, -1], // 4 tokens
    })),
    currentTurnIndex: 0,
    diceValue: null,
    status: "playing",
  };
}

// 🎲 Roll Dice
export function rollDice(state) {
  const dice = Math.floor(Math.random() * 6) + 1;

  return {
    ...state,
    diceValue: dice,
  };
}

// 🔁 Next Turn
export function nextTurn(state) {
  // 🎲 If dice = 6 → same player again
  if (state.diceValue === 6) {
    return {
      ...state,
      diceValue: null,
    };
  }

  const nextIndex = (state.currentTurnIndex + 1) % state.players.length;

  return {
    ...state,
    currentTurnIndex: nextIndex,
    diceValue: null,
  };
}

// 👤 Get Current Player
export function getCurrentPlayer(state) {
  return state.players[state.currentTurnIndex];
}

export function moveToken(state, playerId, tokenIndex) {
  const player = state.players[state.currentTurnIndex];

  // ❌ Not your turn
  if (player.id !== playerId) return state;

  const dice = state.diceValue;

  // ❌ No dice rolled
  if (!dice) return state;

  const tokens = [...player.tokens];
  let position = tokens[tokenIndex];

  // 🚪 Entry rule
  if (position === -1) {
    if (dice === 6) {
      tokens[tokenIndex] = 0;
    } else {
      return state; // can't move
    }
  } else {
    const newPos = position + dice;

    if (newPos <= 51) {
      tokens[tokenIndex] = newPos;
    } else {
      return state;
    }
  }

  const updatedPlayers = [...state.players];
  updatedPlayers[state.currentTurnIndex] = {
    ...player,
    tokens,
  };

  return {
    ...state,
    players: updatedPlayers,
    diceValue: null, // ✅ reset dice AFTER move
  };
}