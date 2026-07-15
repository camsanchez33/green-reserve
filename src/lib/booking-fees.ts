export const ACCESS_FEE_CENTS = 150; // $1.50 per player
export const ACCESS_FEE_PER_PLAYER = 1.5; // dollars

export function serviceFeeLabel(players: number): string {
  return `GreenReserve service fee ($1.50 × ${players})`;
}

export function hoursLabel(n: number): string {
  return `${n} hour${n === 1 ? '' : 's'}`;
}
