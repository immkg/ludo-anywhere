// No canonical points/score field exists anywhere in the schema or backend
// (only isWinner/placement, used for display) — this is the one place that
// formula lives, so both the leaderboard aggregation and its explanatory
// copy stay in sync instead of drifting.
export const WIN_POINTS = 25;
export const LOSS_POINTS = -20;

export function totalPoints(wins: number, losses: number): number {
  return wins * WIN_POINTS + losses * LOSS_POINTS;
}
