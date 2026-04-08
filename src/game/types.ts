export type Player = {
    id: string;
    name: string;
    color: string;
  };
  
  export type GameState = {
    players: Player[];
    currentTurnIndex: number;
    diceValue: number | null;
    status: "waiting" | "playing" | "finished";
  };