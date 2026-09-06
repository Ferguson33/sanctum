#!/usr/bin/env node
/** One-shot generator for high-contrast Staunton SVGs. */
import { writeFileSync } from "node:fs";

const WHITE = {
  fill: "#f7f0e0",
  halo: "#1c1610",
  stroke: "#6a5428",
  accent: "#8a7040",
  jewel: "#c5a46a",
};
const BLACK = {
  fill: "#2a120e",
  halo: "#f6ead8",
  stroke: "#e25822",
  accent: "#e25822",
  jewel: "#f0c4a0",
};

function svg(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">${inner}</svg>\n`;
}

function wrap(p, paths, extras = "") {
  return svg(`
  <g fill="none" stroke="${p.halo}" stroke-width="5.4" stroke-linejoin="round" stroke-linecap="round">
    ${paths}
  </g>
  <g fill="${p.fill}" stroke="${p.stroke}" stroke-width="1.55" stroke-linejoin="round" stroke-linecap="round">
    ${paths}
    ${extras}
  </g>`);
}

function pawn(p) {
  return wrap(
    p,
    `<path d="M17.5 55h29l-2.4 4.4H19.9z"/>
    <path d="M20.2 50.4h23.6v4.6H20.2z"/>
    <path d="M24.4 50.4c0-7.2 1.8-12.2 7.6-16.2 5.8 4 7.6 9 7.6 16.2z"/>
    <path d="M22.8 33.2h18.4c-1.4 2.4-4.8 3.6-9.2 3.6s-7.8-1.2-9.2-3.6z"/>
    <circle cx="32" cy="22.4" r="8.3"/>`,
  );
}

function rook(p) {
  return wrap(
    p,
    `<path d="M15.5 55h33l-2.5 4.4H18z"/>
    <path d="M18.2 50.2h27.6v4.8H18.2z"/>
    <path d="M21.6 27.5h20.8v22.7H21.6z"/>
    <path d="M15.8 11.5h6.4v8h6.1v-8h7.4v8h6.1v-8h6.4V29H15.8z"/>`,
    `<path d="M21.6 41.2h20.8" fill="none" stroke="${p.accent}" stroke-width="1.7"/>`,
  );
}

function bishop(p) {
  return wrap(
    p,
    `<path d="M17.8 55h28.4l-2.3 4.4H20.1z"/>
    <path d="M20.4 50.3h23.2v4.7H20.4z"/>
    <path d="M25.6 50.3c0-7.8 1.6-13.4 6.4-18.4 4.8 5 6.4 10.6 6.4 18.4z"/>
    <path d="M32 11.4c-8.2 6.8-11.4 15.6-11.4 22.8h22.8c0-7.2-3.2-16-11.4-22.8z"/>
    <circle cx="32" cy="8.6" r="3.2"/>`,
    `<path d="M32 16.2v12.4" fill="none"/>
    <path d="M27.2 22.8h9.6" fill="none"/>
    <circle cx="32" cy="29.4" r="1.85" fill="${p.jewel}"/>`,
  );
}

function queen(p) {
  return wrap(
    p,
    `<path d="M17.2 55h29.6l-2.4 4.4H19.6z"/>
    <path d="M19.8 50.3h24.4v4.7H19.8z"/>
    <path d="M24.6 50.3c.4-8.8 2.4-15 7.4-19.8 5 4.8 7 11 7.4 19.8z"/>
    <path d="M15.8 29.2 20.4 13.6 26.2 25.8 32 9.2 37.8 25.8 43.6 13.6 48.2 29.2 43 33.4H21z"/>
    <circle cx="20.4" cy="12.4" r="2.45"/>
    <circle cx="32" cy="8" r="2.9"/>
    <circle cx="43.6" cy="12.4" r="2.45"/>
    <circle cx="15.8" cy="28.2" r="2.15"/>
    <circle cx="48.2" cy="28.2" r="2.15"/>`,
    `<circle cx="20.4" cy="12.4" r="1.3" fill="${p.jewel}" stroke="none"/>
    <circle cx="32" cy="8" r="1.5" fill="${p.jewel}" stroke="none"/>
    <circle cx="43.6" cy="12.4" r="1.3" fill="${p.jewel}" stroke="none"/>`,
  );
}

function king(p) {
  return wrap(
    p,
    `<path d="M17.2 55h29.6l-2.4 4.4H19.6z"/>
    <path d="M19.8 50.3h24.4v4.7H19.8z"/>
    <path d="M24.4 50.3c.2-9 2.6-15.4 7.6-20.4 5 5 7.4 11.4 7.6 20.4z"/>
    <path d="M20.6 25.4h22.8l-1.7 5.4H22.3z"/>
    <path d="M18.8 20.2 23 13.6 32 19.2 41 13.6 45.2 20.2 40.4 25.4H23.6z"/>
    <rect x="29.05" y="3.6" width="5.9" height="12.4" rx="0.9"/>
    <rect x="22.8" y="7.1" width="18.4" height="5.4" rx="0.9"/>`,
  );
}

function knight(p, flip) {
  const t = flip ? ` transform="translate(64 0) scale(-1 1)"` : "";
  const paths = `<path d="M13.5 55h37l-2.6 4.4H16.1z"/>
    <path d="M16.2 50.5h31.2v4.5H16.2z"/>
    <path d="M18 50.5c.4-5.4 1.8-9.6 6.6-12.2 4.8-2.2 8.8-6.4 11-11.8 1.4-1.2 4.8-3.6 4.2-7.4 2.8-.4 5.8-2.6 5.4-6.2-.4-3.4-3.6-5.2-6.8-4.6L36.2 2.8 30.2 8.2C26.4 4.2 19.8 5.2 17.8 10.4c-3.2.8-5.6 3.8-5.6 7.4.2 3.4 2 6 4.8 7.8-2.6 2.8-4.8 6.6-4.2 10.6.6 3.2-1 6.4-3.6 8.2-2.6 2-4 5.8-3 9.1z"/>`;
  const extras = `<circle cx="32.8" cy="17.2" r="1.9" fill="${p.halo}" stroke="none"/>
    <path d="M26.8 12.2c1.6-2.2 4.6-2.8 7-1.2" fill="none" stroke="${p.accent}" stroke-width="1.6"/>`;
  return svg(`
  <g fill="none" stroke="${p.halo}" stroke-width="5.4" stroke-linejoin="round" stroke-linecap="round"${t}>
    ${paths}
  </g>
  <g fill="${p.fill}" stroke="${p.stroke}" stroke-width="1.55" stroke-linejoin="round" stroke-linecap="round"${t}>
    ${paths}
    ${extras}
  </g>`);
}

const makers = {
  p: pawn,
  r: rook,
  b: bishop,
  q: queen,
  k: king,
  n: (p, side) => knight(p, side === "b"),
};

for (const side of ["w", "b"]) {
  const pal = side === "w" ? WHITE : BLACK;
  for (const type of ["p", "n", "b", "r", "q", "k"]) {
    writeFileSync(`/workspace/public/sets/sigil/${side}-${type}.svg`, makers[type](pal, side));
  }
}
console.log("wrote 12 staunton svgs");
