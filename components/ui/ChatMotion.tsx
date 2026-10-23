'use client';

/**
 * Re-usable Google-inspired motion primitives for the chat surface.
 *
 * 1. <FluidAura />     — full-bleed Gemini-style gradient mesh + SVG turbulence.
 * 2. <FourDotWave />   — 4 colored dots bouncing in a wave.
 * 3. <AiBubble />      — springy entrance + slow-shifting gradient background.
 *
 * All animations are pure CSS; no external libraries.
 */

import React from "react";

/* -------------------------------------------------------------------------- */
/* 1. Fluid Aura                                                             */
/* -------------------------------------------------------------------------- */

export function FluidAura({ className = "" }: { className?: string }) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      aria-hidden
    >
      {/* The moving gradient mesh. Two layers offset for parallax effect. */}
      <div className="absolute inset-0 [filter:url(#auraDisplace)]">
        <div className="aura-mesh aura-mesh-a" />
        <div className="aura-mesh aura-mesh-b" />
      </div>

      {/* SVG turbulence filter — gives the gradient the liquid ripple effect */}
      <svg className="absolute h-0 w-0" aria-hidden focusable="false">
        <defs>
          <filter id="auraDisplace">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.012 0.018"
              numOctaves="2"
              seed="7"
            >
              <animate
                attributeName="baseFrequency"
                dur="22s"
                values="0.012 0.018; 0.022 0.028; 0.012 0.018"
                repeatCount="indefinite"
              />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" scale="120" />
          </filter>
        </defs>
      </svg>

      {/* Local styles — kept here so the component is self-contained. */}
      <style jsx>{`
        .aura-mesh {
          position: absolute;
          inset: -25%;
          background: radial-gradient(
              circle at 20% 30%,
              rgba(66, 133, 244, 0.55) 0%,
              transparent 45%
            ),
            radial-gradient(
              circle at 80% 20%,
              rgba(155, 81, 224, 0.5) 0%,
              transparent 45%
            ),
            radial-gradient(
              circle at 70% 80%,
              rgba(234, 67, 53, 0.45) 0%,
              transparent 45%
            ),
            radial-gradient(
              circle at 25% 85%,
              rgba(251, 188, 5, 0.45) 0%,
              transparent 45%
            );
          will-change: transform;
        }
        .aura-mesh-a {
          animation: auraDrift1 18s ease-in-out infinite alternate;
        }
        .aura-mesh-b {
          animation: auraDrift2 24s ease-in-out infinite alternate;
          mix-blend-mode: screen;
          opacity: 0.7;
        }
        @keyframes auraDrift1 {
          from { transform: translate3d(-4%, -3%, 0) scale(1.05); }
          to   { transform: translate3d(6%,  4%, 0) scale(1.15); }
        }
        @keyframes auraDrift2 {
          from { transform: translate3d(5%,  3%, 0) scale(1.10); }
          to   { transform: translate3d(-5%, -4%, 0) scale(1.20); }
        }
      `}</style>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 2. Four-Dot Voice Wave                                                     */
/* -------------------------------------------------------------------------- */

export function FourDotWave({ className = "" }: { className?: string }) {
  const dots = [
    { color: "#8a2a2a", delay: "0s" },   // oxblood
    { color: "#c89a5b", delay: "0.12s" }, // brass
    { color: "#5a6b3b", delay: "0.24s" }, // moss
    { color: "#2c5b5e", delay: "0.36s" }, // teal
  ];
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`} aria-label="Loading">
      {dots.map((d, i) => (
        <span
          key={i}
          className="dot-wave"
          style={{ backgroundColor: d.color, animationDelay: d.delay }}
        />
      ))}
      <style jsx>{`
        .dot-wave {
          display: inline-block;
          width: 7px;
          height: 7px;
          border-radius: 9999px;
          will-change: transform;
          animation: dotBounce 1.1s cubic-bezier(0.45, 0, 0.55, 1) infinite;
        }
        @keyframes dotBounce {
          0%, 60%, 100% { transform: translate3d(0, 0, 0); }
          30%           { transform: translate3d(0, -6px, 0); }
        }
      `}</style>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* 3. Springy chat bubble with shifting gradient                             */
/* -------------------------------------------------------------------------- */

export function AiBubble({
  children,
  className = "",
  springIn = true,
  style,
  typing = false,
}: {
  children: React.ReactNode;
  className?: string;
  springIn?: boolean;
  style?: React.CSSProperties;
  typing?: boolean;
}) {
  return (
    <div
      className={`ai-bubble ${springIn ? "ai-bubble-in" : ""} ${typing ? "ai-typing" : ""} ${className}`}
      style={style}
    >
      {children}
      <style jsx>{`
        .ai-bubble {
          position: relative;
          transform-origin: bottom left;
          color: #1e1e1e;
          background: linear-gradient(
            135deg,
            #eef2ff 0%,
            #f5f3ff 35%,
            #ecfeff 70%,
            #eef2ff 100%
          );
          background-size: 250% 250%;
          will-change: transform, background-position, box-shadow;
          transition: box-shadow 220ms ease, background 220ms ease;
        }
        .ai-bubble-in {
          animation: aiSpring 620ms cubic-bezier(0.175, 0.885, 0.32, 1.275) both;
        }
        /* Typing state: vibrant purple gradient with glow */
        .ai-typing {
          background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 35%, #8b5cf6 70%, #7c3aed 100%);
          background-size: 200% 200%;
          animation: aiTypingShift 4.5s ease-in-out infinite;
          box-shadow: 0 12px 36px rgba(124,58,237,0.20), 0 1px 0 rgba(255,255,255,0.05) inset;
          color: #fff;
          border-color: rgba(255,255,255,0.08);
        }
        @keyframes aiSpring {
          0%   { transform: scale(0.4) translate3d(0, 12px, 0); opacity: 0; }
          60%  { transform: scale(1.04) translate3d(0, -2px, 0); opacity: 1; }
          100% { transform: scale(1) translate3d(0, 0, 0); opacity: 1; }
        }
        @keyframes aiTypingShift {
          0%   { background-position:   0%  50%; filter: drop-shadow(0 0 0 rgba(124,58,237,0)); }
          50%  { background-position: 100%  50%; filter: drop-shadow(0 18px 48px rgba(124,58,237,0.18)); }
          100% { background-position:   0%  50%; filter: drop-shadow(0 0 0 rgba(124,58,237,0)); }
        }
      `}</style>
    </div>
  );
}

export function UserBubble({
  children,
  className = "",
  springIn = true,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  springIn?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`user-bubble ${springIn ? "user-bubble-in" : ""} ${className}`}
      style={style}
    >
      {children}
      <style jsx>{`
        .user-bubble {
          position: relative;
          transform-origin: bottom right;
          background: #111113;
          color: #ffffff;
          will-change: transform;
        }
        .user-bubble-in {
          animation: userSpring 520ms cubic-bezier(0.175, 0.885, 0.32, 1.275) both;
        }
        @keyframes userSpring {
          0%   { transform: scale(0.4) translate3d(0, 12px, 0); opacity: 0; }
          60%  { transform: scale(1.04) translate3d(0, -2px, 0); opacity: 1; }
          100% { transform: scale(1) translate3d(0, 0, 0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
