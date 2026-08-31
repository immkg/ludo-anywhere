"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  motion,
  useAnimationControls,
  useMotionValue,
  animate as animateValue,
  type MotionValue,
} from "framer-motion";
import { cn } from "@/lib/utils";
import { playDiceRoll } from "@/lib/sound";
import { timeoutsForLevel } from "@/game/engine";

const MIN_SPIN_MS = 650;
const SPIN_LOOP_SECONDS = 0.5;
const LAND_SECONDS = 0.55;
const LAND_EASE = [0.16, 1, 0.3, 1] as const;
const CUBE_SIZE = 48; // px — shrunk from 58 to land on the same size as PlayerCorner.tsx's
// (now-enlarged) avatar circle, so the die and the avatar read as one
// consistent scale — matches the button's h-[48px] w-[48px] below.
const HALF = CUBE_SIZE / 2;
// Fallback only for a caller that doesn't pass autoRollMs (e.g. the dev
// test harness) — real play always passes the seat's actual decayed
// deadline (see GameView.tsx), level 0's roll timeout from engine.js's
// INACTIVITY_TIMEOUTS_MS.
const DEFAULT_AUTO_ROLL_MS = timeoutsForLevel(0)[0];
// Pointer down->up shorter than this is a plain tap (today's simple
// in-place roll); at or past it counts as a deliberate hold-and-release,
// which throws the die onto the board instead — see startRoll below.
const HOLD_THRESHOLD_MS = 350;
// A second press-down within this long after the first release is a
// double-tap — also a flick. Every plain tap now waits this long before
// committing, to leave room for that second tap to arrive.
const DOUBLE_TAP_WINDOW_MS = 280;
const THROW_MS_RANGE: [number, number] = [700, 1050];
const RETURN_MS_RANGE: [number, number] = [350, 600];
// Touching the die pauses the auto-roll countdown; letting go without
// actually completing a roll (moving off, or a cancelled gesture) costs
// this much off whatever time was left when it resumes.
const ABANDON_PENALTY_MS = 2000;

// A plain cream-and-black die — not tinted per player, so it reads the
// same physical object no matter whose turn it is (that's what the player
// cards' own borders/traces are for now — see PlayerCorner.tsx). Fixed
// colors rather than theme tokens (which flip dark in dark mode), same
// reasoning as Token.tsx's fixed WHITE border: a physical die's plastic
// stays the same color regardless of the app's theme.
// A visibly cream (not near-white) gradient, plus the highlight blob and
// outer drop shadow below, are what keep the die reading as a distinct
// object against a white surface (bg-surface, a board cell) instead of
// blending into it — no border needed for that, just this contrast.
const DICE_FACE_BG =
  "linear-gradient(135deg, #fffaf0 0%, #f7e9c8 45%, #ecdba8 100%)";
const DICE_FACE_SHADOW =
  "inset 0 2px 3px rgba(255,255,255,0.9), inset 0 -3px 5px rgba(0,0,0,0.14), inset 2px 0 3px rgba(255,255,255,0.35), 0 3px 8px rgba(80,60,25,0.22)";
const DICE_PIP_COLOR = "#241c15";

const PIP_LAYOUTS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [
    [0, 0],
    [2, 2],
  ],
  3: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  4: [
    [0, 0],
    [0, 2],
    [2, 0],
    [2, 2],
  ],
  5: [
    [0, 0],
    [0, 2],
    [1, 1],
    [2, 0],
    [2, 2],
  ],
  6: [
    [0, 0],
    [0, 2],
    [1, 0],
    [1, 2],
    [2, 0],
    [2, 2],
  ],
};

// Each face's own placement on the cube: rotate it to face outward, then
// push it out along its (now rotated) local Z axis by half the cube size.
const FACE_PLACEMENT: Record<number, string> = {
  1: `translateZ(${HALF}px)`,
  6: `rotateY(180deg) translateZ(${HALF}px)`,
  2: `rotateY(90deg) translateZ(${HALF}px)`,
  5: `rotateY(-90deg) translateZ(${HALF}px)`,
  3: `rotateX(90deg) translateZ(${HALF}px)`,
  4: `rotateX(-90deg) translateZ(${HALF}px)`,
};

// The cube rotation (deg) that brings each face flush to the viewer —
// the inverse of that face's own placement rotation above.
const LANDING_ORIENTATION: Record<number, { x: number; y: number }> = {
  1: { x: 0, y: 0 },
  2: { x: 0, y: -90 },
  3: { x: -90, y: 0 },
  4: { x: 90, y: 0 },
  5: { x: 0, y: 90 },
  6: { x: 0, y: 180 },
};

// Added on top of every resting LANDING_ORIENTATION so the die reads as
// sitting up off the ground — tipped back slightly, bottom edge rising
// toward the viewer — instead of perfectly flush to the viewer, which
// hides every face but the one facing the camera. Mostly X (positive tips
// the bottom into view, the "risen" look); barely any Y, which instead
// reveals a *side* face and reads as viewed from the side rather than from
// below. Pure rotateX/rotateY only, inside the perspective/preserve-3d
// scene — that stays a rigid rotation under perspective, however extreme
// the angle. Each lands with its own small random jitter around these base
// numbers (see randomRestingTilt) so every roll settles at a similar but
// not identical angle, instead of the exact same pose every time.
const RESTING_TILT_BASE = { x: 16, y: 2 };
const RESTING_TILT_JITTER = { x: 6, y: 3 };
function withTilt(o: { x: number; y: number }, tilt: { x: number; y: number }) {
  return { x: o.x + tilt.x, y: o.y + tilt.y };
}
function randomRestingTilt() {
  return {
    x:
      RESTING_TILT_BASE.x +
      randomBetween(-RESTING_TILT_JITTER.x, RESTING_TILT_JITTER.x),
    y:
      RESTING_TILT_BASE.y +
      randomBetween(-RESTING_TILT_JITTER.y, RESTING_TILT_JITTER.y),
  };
}

// A jaunty resting angle for the *whole* die, applied as a plain 2D rotate
// on a wrapper with no perspective/preserve-3d of its own — so it rotates
// the already-flattened, fully-projected die image in the screen plane,
// like turning a photo of it. (A Z-axis rotate tried *inside* the 3D scene
// instead read as the cube's faces twisting/shearing relative to each
// other — see RESTING_TILT above.) Small and randomized per roll, same as
// the tilt.
const SCREEN_ROTATE_BASE = 5;
const SCREEN_ROTATE_JITTER = 4;
function randomScreenRotate() {
  return (
    SCREEN_ROTATE_BASE +
    randomBetween(-SCREEN_ROTATE_JITTER, SCREEN_ROTATE_JITTER)
  );
}

function Face({ value }: { value: number }) {
  const pips = PIP_LAYOUTS[value] ?? [];
  return (
    <div
      className="absolute inset-0 grid grid-cols-3 grid-rows-3 gap-0.5 rounded-2xl p-1.5 [backface-visibility:hidden]"
      style={{
        transform: FACE_PLACEMENT[value],
        background: DICE_FACE_BG,
        boxShadow: DICE_FACE_SHADOW,
      }}
    >
      {/* A soft, offset highlight — the same "catching the light" gloss the
          token discs get (Token.tsx's own highlight Ellipse), not a full
          glassy shine. */}
      <div
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{
          background:
            "radial-gradient(circle at 30% 22%, rgba(255,255,255,0.85), transparent 55%)",
        }}
      />
      {Array.from({ length: 9 }, (_, i) => {
        const row = Math.floor(i / 3);
        const col = i % 3;
        const active = pips.some(([r, c]) => r === row && c === col);
        return (
          <span
            key={i}
            className="relative m-auto h-2 w-2 rounded-full bg-transparent"
            style={
              active
                ? {
                    backgroundColor: DICE_PIP_COLOR,
                    boxShadow: "inset 0 1px 1.5px rgba(0,0,0,0.3)",
                  }
                : undefined
            }
          />
        );
      })}
    </div>
  );
}

export type ThrowStyle = "tap" | "flick";
type Point = { x: number; y: number };
type SafeRegion = { left: number; top: number; size: number };

type DiceProps = {
  lastRoll: number | null;
  rollSeq: number;
  canRoll: boolean;
  // `style` reflects how this roll was triggered — a plain tap/keyboard
  // press rolls in place exactly as before; a deliberate hold-and-release
  // throws the die onto the board (see handleClick below).
  onRoll: (style: ThrowStyle) => void;
  // Mirrors isRolling out to the parent — the "Roll"/"Move" label now lives
  // up in the player-name row (see DiceLabel), separate from this cube, but
  // still needs to hide for the same window the spin animation is playing.
  onRollingChange?: (isRolling: boolean) => void;
  // The board's on-screen bounds and this dice's own resting spot, both in
  // pixels relative to the same positioned ancestor (see GameView.tsx) —
  // only meaningful for a "flick" throw. Omitted (e.g. the dev test
  // harness) just makes every roll behave like a plain tap.
  restPoint?: Point | null;
  safeRegion?: SafeRegion | null;
  // The current pending roll's value — null once its move has fully
  // resolved, which is this dice's cue to return home if it's out on the
  // board (see the diceValue effect below).
  diceValue?: number | null;
  // Which style the *current* rollSeq should animate as — set locally the
  // instant this device triggers a roll, and relayed from whoever else
  // triggered it (see game:diceThrow in GameView.tsx) so every viewer sees
  // the same flourish, not just the roller.
  throwStyle?: ThrowStyle;
  // The auto-roll countdown's 0..1 motion value — owned here by default,
  // but a parent that also wants to trace the same countdown somewhere
  // else (see PlayerCorner.tsx's card border) can create it and pass it in
  // instead, so both places read the exact same pausable progress.
  rollProgress?: MotionValue<number>;
  // The color of whichever seat currently needs to roll — only used to
  // tint the pulsating glow behind the die while it spins (see the return
  // below); the die itself (face/pips) stays a plain neutral cream/black
  // regardless of whose turn it is.
  glowColor: string;
  // How long the countdown ring takes to drain before this seat's turn
  // would time out — the seat's own decayed deadline (see
  // INACTIVITY_TIMEOUTS_MS in src/game/engine.js), passed down by
  // GameView.tsx. This is purely visual: the actual auto-roll only ever
  // happens server-side (see server.js's sweepTurnTimeouts) once the real
  // deadline passes, so this ring reflects that deadline without ever
  // triggering the roll itself.
  autoRollMs?: number;
};

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export default function Dice({
  lastRoll,
  rollSeq,
  canRoll,
  onRoll,
  onRollingChange,
  restPoint,
  safeRegion,
  diceValue,
  throwStyle,
  rollProgress,
  glowColor,
  autoRollMs = DEFAULT_AUTO_ROLL_MS,
}: DiceProps) {
  const [isRolling, setIsRolling] = useState(false);
  const [orientation, setOrientation] = useState(() =>
    withTilt(LANDING_ORIENTATION[lastRoll ?? 1], randomRestingTilt()),
  );
  const [screenRotateDeg, setScreenRotateDeg] = useState(() =>
    randomScreenRotate(),
  );
  const prevRollSeqRef = useRef(rollSeq);
  const spinStartRef = useRef(0);
  const landTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Position/phase machinery for the "flick" throw — untouched by a plain
  // tap, which never moves this at all (stays at {x:0, y:0}, i.e. its
  // ordinary laid-out spot).
  const posControls = useAnimationControls();
  const [onBoard, setOnBoard] = useState(false);
  const pointerDownAtRef = useRef<number | null>(null);
  const prevDiceValueRef = useRef(diceValue ?? null);
  // Gesture state: a sustained hold throws on its own (no need to release),
  // a quick release waits briefly for a possible second tap (double-tap),
  // and rolledThisPressRef stops whichever trigger fires first from also
  // firing a second time for the same press.
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rolledThisPressRef = useRef(false);

  // The auto-roll countdown (progress 0..1, driving both the actual
  // auto-roll trigger via its onComplete and — see PlayerCorner.tsx — the
  // card-border trace) — a plain motion value + imperative animation
  // rather than a declarative one, so touching the die can pause it
  // mid-flight and resume it later at a penalized remaining duration. See
  // startAutoRollCountdown below. Falls back to an internally-owned value
  // when no parent shares one in (e.g. the dev test harness).
  const internalRollProgressMV = useMotionValue(0);
  const rollProgressMV = rollProgress ?? internalRollProgressMV;
  const rollAnimRef = useRef<ReturnType<typeof animateValue> | null>(null);

  function spinFrom(prev: { x: number; y: number }) {
    const turnsX =
      Math.round(randomBetween(2, 4)) * (Math.random() < 0.5 ? -1 : 1);
    const turnsY =
      Math.round(randomBetween(3, 5)) * (Math.random() < 0.5 ? -1 : 1);
    return { x: prev.x + 360 * turnsX, y: prev.y + 360 * turnsY };
  }

  // Throws the die from its resting spot to a random point within the
  // board's safe-landing region (a centered square, 80% of the board's
  // side, so it never lands flush against an edge), along a curved path,
  // then gives it a couple of small settle bounces before holding there.
  async function throwOntoBoard(durationMs: number) {
    if (!restPoint || !safeRegion) return;
    setOnBoard(true);

    const target: Point = {
      x: safeRegion.left + Math.random() * safeRegion.size,
      y: safeRegion.top + Math.random() * safeRegion.size,
    };
    const dx = target.x - restPoint.x;
    const dy = target.y - restPoint.y;
    const dist = Math.hypot(dx, dy);
    // A curved (not straight-line) path: an intermediate point offset both
    // upward (a throwing arc) and sideways (so it doesn't look like a
    // perfectly straight ramp), varied per throw.
    const arcLift = dist * randomBetween(0.25, 0.45);
    const sideDrift =
      (Math.random() < 0.5 ? -1 : 1) * dist * randomBetween(0.05, 0.2);
    const midX = dx / 2 + sideDrift;
    const midY = dy / 2 - arcLift;

    await posControls.start({
      x: [0, midX, dx],
      y: [0, midY, dy],
      transition: {
        duration: durationMs / 1000,
        times: [0, 0.55, 1],
        ease: ["easeOut", "easeIn"],
      },
    });

    // A couple of small squash-and-settle bounces on impact — count and
    // intensity both vary per throw.
    const bounces = Math.round(randomBetween(1, 3));
    for (let i = 0; i < bounces; i++) {
      const intensity = 0.16 * (1 - i / bounces) + 0.04;
      await posControls.start({
        scaleY: [1, 1 - intensity, 1 + intensity * 0.4, 1],
        scaleX: [1, 1 + intensity * 0.5, 1 - intensity * 0.2, 1],
        transition: { duration: 0.22, ease: "easeOut" },
      });
    }
  }

  async function returnHome() {
    setOnBoard(false);
    const durationMs = randomBetween(...RETURN_MS_RANGE);
    await posControls.start({
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      transition: { duration: durationMs / 1000, ease: LAND_EASE },
    });
  }

  // Fires for every viewer (the roller and anyone spectating) whenever the
  // server confirms a new roll — this is the only thing allowed to stop the
  // spin, so it can never get stuck even when a turn auto-forfeits and
  // diceValue lands back on null.
  useEffect(() => {
    if (rollSeq === prevRollSeqRef.current) return;
    prevRollSeqRef.current = rollSeq;
    const style = throwStyle ?? "tap";
    const durationMs =
      style === "flick" ? randomBetween(...THROW_MS_RANGE) : MIN_SPIN_MS;

    const alreadySpinning =
      isRolling && Date.now() - spinStartRef.current < durationMs;
    if (!alreadySpinning) {
      spinStartRef.current = Date.now();
      setIsRolling(true);
      setOrientation(spinFrom);
      playDiceRoll();
      if (style === "flick") throwOntoBoard(durationMs);
    }

    const target = withTilt(
      LANDING_ORIENTATION[lastRoll ?? 1],
      randomRestingTilt(),
    );
    const remaining = Math.max(
      0,
      durationMs - (Date.now() - spinStartRef.current),
    );
    if (landTimeoutRef.current) clearTimeout(landTimeoutRef.current);
    landTimeoutRef.current = setTimeout(() => {
      setOrientation({ x: target.x + 360 * 2, y: target.y + 360 * 2 });
      setScreenRotateDeg(randomScreenRotate());
      setIsRolling(false);
    }, remaining);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollSeq, lastRoll]);

  // Once this roll's move has fully resolved (diceValue back to null),
  // bring a die that's out on the board back home. Skipped on mount and
  // for a plain tap, which never left home in the first place.
  useEffect(() => {
    const prev = prevDiceValueRef.current;
    prevDiceValueRef.current = diceValue ?? null;
    if (prev != null && diceValue == null && onBoard) {
      returnHome();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diceValue]);

  useEffect(() => {
    return () => {
      if (landTimeoutRef.current) clearTimeout(landTimeoutRef.current);
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      if (pendingTapTimerRef.current) clearTimeout(pendingTapTimerRef.current);
      rollAnimRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    onRollingChange?.(isRolling);
  }, [isRolling, onRollingChange]);

  // Drives the visual countdown ring toward this seat's real deadline —
  // pausable so handlePointerDown/handlePointerLeave below can pause it
  // while the die is being touched and penalize an abandoned gesture. This
  // is purely visual: the actual auto-roll only ever happens server-side
  // (server.js's sweepTurnTimeouts), once the real deadline elapses there
  // — not from this animation completing. Keeping the auto-trigger
  // client-side too used to race the server's own enforcement (both could
  // fire for the same turn), which is exactly the kind of duplicate action
  // this split avoids.
  function startAutoRollCountdown(durationMs: number) {
    rollAnimRef.current?.stop();
    rollAnimRef.current = animateValue(rollProgressMV, 1, {
      duration: durationMs / 1000,
      ease: "linear",
    });
  }

  useEffect(() => {
    if (!canRoll || isRolling) {
      rollAnimRef.current?.stop();
      rollProgressMV.set(0);
      return;
    }
    startAutoRollCountdown(autoRollMs);
    return () => {
      rollAnimRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRoll, isRolling, autoRollMs]);

  // The roll actually triggers here, via pointerdown/up (covers mouse and
  // touch directly) — the click handler below only exists to catch
  // keyboard activation (Enter/Space), which fires a click with no pointer
  // events at all. Three ways to get a flick: hold past the threshold
  // without releasing, release-then-press-again within the double-tap
  // window, or a plain hold-and-release past the threshold.
  const suppressNextClickRef = useRef(false);

  function triggerRoll(style: ThrowStyle) {
    if (rolledThisPressRef.current) return;
    rolledThisPressRef.current = true;
    rollAnimRef.current?.stop(); // a real roll is happening now — the countdown is moot
    onRoll(style);
  }

  // Cancels whatever gesture was in progress (moved off, or the browser
  // cancelled it) without rolling, and resumes the auto-roll countdown at
  // a penalty rather than where it was paused — see ABANDON_PENALTY_MS.
  function abandonPress() {
    pointerDownAtRef.current = null;
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (!canRoll || isRolling || rolledThisPressRef.current) return;
    const naturalRemainingMs = (1 - rollProgressMV.get()) * autoRollMs;
    const penalizedMs = naturalRemainingMs - ABANDON_PENALTY_MS;
    if (penalizedMs <= 0) {
      // Ring reads as "done" — the server's own deadline (already at or
      // past this point too, same clock) is what actually rolls, not this.
      rollProgressMV.set(1);
    } else {
      startAutoRollCountdown(penalizedMs);
    }
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
    if (onBoard) return; // tapping while it's out on the board just brings it home — see handleClick
    if (!canRoll || isRolling) return;
    pointerDownAtRef.current = Date.now();
    rolledThisPressRef.current = false;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    rollAnimRef.current?.pause();

    // A second press-down while the previous tap's roll is still waiting
    // to see if a double-tap follows — this is that double-tap, so throw
    // immediately instead of letting the pending single tap fire.
    if (pendingTapTimerRef.current) {
      clearTimeout(pendingTapTimerRef.current);
      pendingTapTimerRef.current = null;
      triggerRoll("flick");
      return;
    }

    // A sustained hold throws on its own — no need to wait for release.
    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null;
      triggerRoll("flick");
    }, HOLD_THRESHOLD_MS);
  }

  function handlePointerUp() {
    if (onBoard) return;
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (pointerDownAtRef.current == null) return;
    pointerDownAtRef.current = null;
    suppressNextClickRef.current = true;
    if (rolledThisPressRef.current) return; // already thrown via a sustained hold
    // A quick release — wait briefly in case a second tap follows (that's
    // a double-tap, handled above); otherwise this settles as a plain tap.
    pendingTapTimerRef.current = setTimeout(() => {
      pendingTapTimerRef.current = null;
      triggerRoll("tap");
    }, DOUBLE_TAP_WINDOW_MS);
  }

  function handleClick() {
    if (onBoard) {
      returnHome();
      return;
    }
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    if (!canRoll || isRolling) return;
    // Keyboard activation only — mouse/touch are fully handled above.
    triggerRoll("tap");
  }

  const waitingToRoll = canRoll && !isRolling;

  return (
    <motion.div
      animate={posControls}
      initial={{ x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 }}
      className={cn("relative", onBoard && "z-10")}
    >
      {/* No perspective/preserve-3d here — this wrapper renders the button
          (and its whole 3D scene) as a flat, already-projected image, so
          rotating it is a plain screen-plane rotation of the entire die,
          not a transform composed into the 3D scene itself. */}
      <div
        className="relative"
        style={{ transform: `rotate(${screenRotateDeg}deg)` }}
      >
        {/* A pulsating glow behind the die, tinted to whoever's up next —
            shown while it's waiting to be rolled, not while it's actually
            spinning — a growing/shrinking box-shadow rather than a fading
            overlay, so nothing here ever dims via opacity. Breathes between
            ~30% and full size/strength (never down to nothing) on a gentle
            sine-like curve rather than a sharp ease. */}
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-2xl"
          animate={{
            boxShadow: waitingToRoll
              ? [
                  `0 0 8px 2px ${glowColor}66`,
                  `0 0 28px 12px ${glowColor}E6`,
                  `0 0 8px 2px ${glowColor}66`,
                ]
              : `0 0 0px 0px ${glowColor}00`,
          }}
          transition={
            waitingToRoll
              ? { duration: 1.1, repeat: Infinity, ease: [0.45, 0.05, 0.55, 0.95] }
              : { duration: 0.25 }
          }
        />
        <button
          onClick={handleClick}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={abandonPress}
          onPointerCancel={abandonPress}
          disabled={(!canRoll && !onBoard) || isRolling}
          aria-label={onBoard ? "Bring the die back" : undefined}
          className={cn(
            "relative h-[48px] w-[48px] rounded-2xl transition",
            waitingToRoll ? "ring-2 ring-[#FFD400]/70 ring-offset-2 ring-offset-bg active:scale-95" : "",
          )}
          style={{
            // Tight enough that the far (bottom-tilted) face visibly
            // shrinks relative to the near one — real perspective, not an
            // orthographic-looking flat cube. Safe to keep tight now that
            // the resting tilt is pure rotateX/rotateY (see RESTING_TILT
            // above): that's a rigid rotation under any perspective
            // distance, so tightening this only adds correct depth
            // foreshortening, not the shearing a Z-axis rotate caused when
            // it used to live inside this same 3D scene. Scaled down from
            // 180 along with CUBE_SIZE (48/58) to keep the same relative
            // foreshortening at the smaller size.
            perspective: 150,
          }}
        >
          <div
            className="relative h-full w-full"
            style={{ transformStyle: "preserve-3d" }}
          >
            <motion.div
              className="relative h-full w-full"
              style={{ transformStyle: "preserve-3d" }}
              animate={{
                rotateX: orientation.x,
                rotateY: orientation.y,
                scale: isRolling ? [1, 1.25, 1.05] : 1,
              }}
              transition={{
                rotateX: isRolling
                  ? {
                      duration: SPIN_LOOP_SECONDS,
                      repeat: Infinity,
                      ease: "linear",
                    }
                  : { duration: LAND_SECONDS, ease: LAND_EASE },
                rotateY: isRolling
                  ? {
                      duration: SPIN_LOOP_SECONDS,
                      repeat: Infinity,
                      ease: "linear",
                    }
                  : { duration: LAND_SECONDS, ease: LAND_EASE },
                scale: isRolling
                  ? { duration: 0.35, ease: "easeOut" }
                  : { duration: LAND_SECONDS, ease: LAND_EASE },
              }}
            >
              {[1, 2, 3, 4, 5, 6].map((value) => (
                <Face key={value} value={value} />
              ))}
            </motion.div>
          </div>
        </button>
      </div>
    </motion.div>
  );
}
