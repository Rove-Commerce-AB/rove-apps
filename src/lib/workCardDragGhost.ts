import type { DragEvent as ReactDragEvent } from "react";

export type WorkCardDragGhost = {
  move: (clientX: number, clientY: number) => void;
  /** Animate tilt back to flat in place, then remove. */
  dispose: () => Promise<void>;
  /** Fly to a screen rect (untilt + translate), then remove. */
  landAt: (target: {
    left: number;
    top: number;
    width?: number;
  }) => Promise<void>;
  /** Remove immediately without animation. */
  remove: () => void;
};

type Options = {
  rotateDeg?: number;
  scale?: number;
  durationMs?: number;
  landDurationMs?: number;
};

function waitTransition(
  el: HTMLElement,
  propertyName: string,
  fallbackMs: number
): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      el.removeEventListener("transitionend", onEnd);
      resolve();
    };
    const onEnd = (event: TransitionEvent) => {
      if (event.target !== el) return;
      if (event.propertyName !== propertyName) return;
      finish();
    };
    el.addEventListener("transitionend", onEnd);
    window.setTimeout(finish, fallbackMs);
  });
}

/**
 * Custom drag preview that can animate tilt in/out and land on drop.
 * Native setDragImage is a frozen bitmap, so we hide it and follow the pointer instead.
 */
export function startWorkCardDragGhost(
  event: ReactDragEvent<HTMLElement>,
  options: Options = {}
): WorkCardDragGhost {
  const rotateDeg = options.rotateDeg ?? 3;
  const scale = options.scale ?? 1;
  const durationMs = options.durationMs ?? 160;
  const landDurationMs = options.landDurationMs ?? 220;
  const ease = "cubic-bezier(0.2, 0.8, 0.2, 1)";

  const source = event.currentTarget;
  const rect = source.getBoundingClientRect();
  const offsetX = event.clientX - rect.left;
  const offsetY = event.clientY - rect.top;

  const blank = document.createElement("canvas");
  blank.width = 1;
  blank.height = 1;
  event.dataTransfer.setDragImage(blank, 0, 0);

  const wrap = document.createElement("div");
  wrap.style.position = "fixed";
  wrap.style.left = "0";
  wrap.style.top = "0";
  wrap.style.zIndex = "9999";
  wrap.style.pointerEvents = "none";
  wrap.style.willChange = "transform";

  const ghost = source.cloneNode(true) as HTMLElement;
  ghost.removeAttribute("draggable");
  ghost.style.width = `${rect.width}px`;
  ghost.style.margin = "0";
  ghost.style.boxSizing = "border-box";
  ghost.style.opacity = "1";
  ghost.style.transformOrigin = `${offsetX}px ${offsetY}px`;
  ghost.style.transform = "rotate(0deg) scale(1)";
  ghost.style.transition = `transform ${durationMs}ms ${ease}`;
  ghost.style.boxShadow = "var(--shadow-lg, 0 12px 28px rgba(0,0,0,0.18))";
  wrap.appendChild(ghost);
  document.body.appendChild(wrap);

  function place(clientX: number, clientY: number) {
    wrap.style.transition = "none";
    wrap.style.transform = `translate(${clientX - offsetX}px, ${clientY - offsetY}px)`;
  }
  place(event.clientX, event.clientY);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!wrap.isConnected) return;
      ghost.style.transform = `rotate(${rotateDeg}deg) scale(${scale})`;
    });
  });

  function onDragOver(nativeEvent: DragEvent) {
    place(nativeEvent.clientX, nativeEvent.clientY);
  }
  document.addEventListener("dragover", onDragOver);

  let disposed = false;

  function cleanupListeners() {
    document.removeEventListener("dragover", onDragOver);
  }

  function remove() {
    if (disposed) return;
    disposed = true;
    cleanupListeners();
    wrap.remove();
  }

  async function dispose(): Promise<void> {
    if (disposed) return;
    disposed = true;
    cleanupListeners();
    ghost.style.transition = `transform ${durationMs}ms ${ease}`;
    ghost.style.transform = "rotate(0deg) scale(1)";
    await waitTransition(ghost, "transform", durationMs + 80);
    wrap.remove();
  }

  async function landAt(target: {
    left: number;
    top: number;
    width?: number;
  }): Promise<void> {
    if (disposed) return;
    disposed = true;
    cleanupListeners();

    if (typeof target.width === "number" && target.width > 0) {
      ghost.style.width = `${target.width}px`;
    }

    // Enable fly transition after freezing current transform.
    void wrap.getBoundingClientRect();
    wrap.style.transition = `transform ${landDurationMs}ms ${ease}`;
    ghost.style.transition = `transform ${landDurationMs}ms ${ease}`;
    void wrap.getBoundingClientRect();

    wrap.style.transform = `translate(${target.left}px, ${target.top}px)`;
    ghost.style.transform = "rotate(0deg) scale(1)";

    await Promise.all([
      waitTransition(wrap, "transform", landDurationMs + 80),
      waitTransition(ghost, "transform", landDurationMs + 80),
    ]);
    wrap.remove();
  }

  return { move: place, dispose, landAt, remove };
}

/** Wait for the next paint(s) so layout after a React update is readable. */
export function waitForPaint(frames = 2): Promise<void> {
  return new Promise((resolve) => {
    let left = frames;
    const tick = () => {
      left -= 1;
      if (left <= 0) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
