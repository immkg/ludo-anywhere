import { colorForArm } from "@/game/board";
import { cn } from "@/lib/utils";

export default function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("text-4xl font-extrabold tracking-tight", className)}>
      <span className="text-ink">My</span>
      <span style={{ color: colorForArm(3).hex }}>L</span>
      <span className="text-accent">u</span>
      <span style={{ color: colorForArm(1).hex }}>d</span>
      <span style={{ color: colorForArm(0).hex }}>o</span>
    </span>
  );
}
