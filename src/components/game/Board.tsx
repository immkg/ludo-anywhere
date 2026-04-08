"use client";

import { HOME_CELLS, PATH } from "@/constants/board";

export default function Board({ game }: any) {
  const size = 15;

  const getCellColor = (index: number) => {
    if (HOME_CELLS.red.includes(index)) return "bg-red-400";
    if (HOME_CELLS.blue.includes(index)) return "bg-blue-400";
    if (HOME_CELLS.green.includes(index)) return "bg-green-400";
    if (HOME_CELLS.yellow.includes(index)) return "bg-yellow-400";

    if (PATH.includes(index)) return "bg-gray-200";

    return "bg-white";
  };

  const centerIndex = 7 * 15 + 7;

  return (
    <div className="w-full max-w-md mx-auto aspect-square grid grid-cols-15 grid-rows-15 border">
      {Array.from({ length: 225 }).map((_, i) => {
        const isCenter = i === centerIndex;

        return (
          <div
            key={i}
            className={`border flex items-center justify-center relative ${getCellColor(
              i
            )}`}
          >
            {/* 🎯 Center Dice */}
            {isCenter && (
              <div className="text-sm font-bold">
                🎲 {game?.diceValue ?? "-"}
              </div>
            )}

            {/* 🔴 Tokens */}
            {game?.players?.map((p: any) =>
              p.tokens.map((pos: number, idx: number) => {
                if (pos === i) {
                  return (
                    <div
                      key={p.id + idx}
                      className="w-3 h-3 rounded-full absolute"
                      style={{
                        backgroundColor: p.color,
                      }}
                    />
                  );
                }
                return null;
              })
            )}
          </div>
        );
      })}
    </div>
  );
}