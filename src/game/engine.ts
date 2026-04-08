import { GameState, Player } from "./types";

// 🎯 Initialize Game
export function createGame(players: Player[]): GameState {
  return {
    players,
    currentTurnIndex: 0,
    diceValue: null,
    status: "playing",
  };
}

// 🎲 Roll Dice
export function rollDice(state: GameState): GameState {
  const dice = Math.floor(Math.random() * 6) + 1;

  return {
    ...state,
    diceValue: dice,
  };
}

// 🔁 Next Turn
export function nextTurn(state: GameState): GameState {
  const nextIndex =
    (state.currentTurnIndex + 1) % state.players.length;

  return {
    ...state,
    currentTurnIndex: nextIndex,
    diceValue: null,
  };
}

// 👤 Get Current Player
export function getCurrentPlayer(state: GameState): Player {
  return state.players[state.currentTurnIndex];
}