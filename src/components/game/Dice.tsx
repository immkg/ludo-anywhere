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

const MIN_SPIN_MS = 650;
const SPIN_LOOP_SECONDS = 0.5;
const LAND_SECONDS = 0.55;
const LAND_EASE = [0.16, 1, 0.3, 1] as const;
const CUBE_SIZE = 58; // px — 10% down from the original 64 (h-16); matches the button's h-[58px] w-[58px] below
const HALF = CUBE_SIZE / 2;
const AUTO_ROLL_MS = 5000;
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
// How see-through the die gets while it's sitting out on the board — still
// a little, so it doesn't fully block the tokens/cells underneath it, but
// mostly opaque so the die itself reads clearly.
const ON_BOARD_OPACITY = 0.88;

// A plain white/black die — not tinted per player, so it reads the same
// physical object no matter whose turn it is (that's what the player
// cards' own borders/traces are for now — see PlayerCorner.tsx). Fixed
// colors rather than theme tokens (which flip dark in dark mode), same
// reasoning as Token.tsx's fixed WHITE border: a physical die's plastic
// stays the same color regardless of the app's theme.
// The gradient (lighter top-left, deeper bottom-right) plus the highlight
// blob in Face below are what actually sell "glossy and domed", the same
// trick used for the token discs.
const DICE_FACE_BG =
  "linear-gradient(135deg, #ffffff 0%, #f3f3f0 45%, #e2e0d8 100%)";
const DICE_FACE_SHADOW =
  "inset 0 2px 3px rgba(255,255,255,0.9), inset 0 -3px 5px rgba(0,0,0,0.14), inset 2px 0 3px rgba(255,255,255,0.35)";
const DICE_FRAME_COLOR = "#241c15";
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
      className="absolute inset-0 grid grid-cols-3 grid-rows-3 gap-0.5 rounded-2xl border-2 p-1.5 [backface-visibility:hidden]"
      style={{
        transform: FACE_PLACEMENT[value],
        borderColor: DICE_FRAME_COLOR,
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
      // Fades in over the flight, landing at ON_BOARD_OPACITY — so it
      // doesn't fully hide whatever's underneath once it's sitting there.
      opacity: [1, 1, ON_BOARD_OPACITY],
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

  // Ref so the auto-roll timer doesn't restart on every re-render — the
  // parent passes a fresh onRoll closure each time it renders.
  const onRollRef = useRef(onRoll);
  useEffect(() => {
    onRollRef.current = onRoll;
  }, [onRoll]);

  // Drives both the visual countdown ring and the actual auto-roll
  // trigger from one pausable animation, instead of a plain setTimeout —
  // see handlePointerDown/handlePointerLeave below, which pause this while
  // the die is being touched and penalize it on an abandoned gesture.
  function startAutoRollCountdown(durationMs: number) {
    rollAnimRef.current?.stop();
    rollAnimRef.current = animateValue(rollProgressMV, 1, {
      duration: durationMs / 1000,
      ease: "linear",
      // An unattended auto-roll is never a deliberate flick — keep it quiet.
      onComplete: () => onRollRef.current("tap"),
    });
  }

  useEffect(() => {
    if (!canRoll || isRolling) {
      rollAnimRef.current?.stop();
      rollProgressMV.set(0);
      return;
    }
    startAutoRollCountdown(AUTO_ROLL_MS);
    return () => {
      rollAnimRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRoll, isRolling]);

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
    const naturalRemainingMs = (1 - rollProgressMV.get()) * AUTO_ROLL_MS;
    const penalizedMs = naturalRemainingMs - ABANDON_PENALTY_MS;
    if (penalizedMs <= 0) {
      rollProgressMV.set(1);
      onRollRef.current("tap");
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
        {/* A soft white glow behind the die, only while it's actively
            spinning — see DICE_ROLL_GLOW above. */}
        <motion.div
          className="pointer-events-none absolute -inset-3 rounded-[28px] blur-xl"
          style={{
            background:
              "radial-gradient(circle, rgba(255,255,255,0.9), transparent 70%)",
          }}
          animate={{ opacity: isRolling ? [0.25, 0.8, 0.25] : 0 }}
          transition={
            isRolling
              ? { duration: 0.6, repeat: Infinity, ease: "easeInOut" }
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
            "relative h-[58px] w-[58px] rounded-2xl transition disabled:opacity-40",
            canRoll && !isRolling
              ? "ring-2 ring-[#FFD400]/70 ring-offset-2 ring-offset-bg active:scale-95"
              : "",
          )}
          style={{
            // Tight enough that the far (bottom-tilted) face visibly
            // shrinks relative to the near one — real perspective, not an
            // orthographic-looking flat cube. Safe to keep tight now that
            // the resting tilt is pure rotateX/rotateY (see RESTING_TILT
            // above): that's a rigid rotation under any perspective
            // distance, so tightening this only adds correct depth
            // foreshortening, not the shearing a Z-axis rotate caused when
            // it used to live inside this same 3D scene.
            perspective: 180,
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
