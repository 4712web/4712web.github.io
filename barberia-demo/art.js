/* ===== ilustraciones (retratos de ejemplo y productos) ===== */
function retratoSVG(b, i){
  if (b.foto) return `<img src="${b.foto}" alt="${esc(b.n)}">`;
  const skins = ["#d6a77a","#b98257","#8d5a3b"], sk = skins[i % 3];
  const hair = ["#1d1a17","#3a2a1e","#e8e2d6"][i % 3];
  const hairs = [
    // pompadour con fade
    `<path d="M33 46c-1-15 8-26 27-26 16 0 26 8 27 22-6-5-13-7-21-7-12 0-21 4-33 11z" fill="${hair}"/><path d="M34 47c0-4 1-7 2-9l-2 18zM86 47c0-4-1-7-2-9l2 18z" fill="${hair}" opacity=".45"/>`,
    // peinado hacia atrás
    `<path d="M32 50c-2-17 9-29 28-29s30 11 28 28c-4-8-12-13-28-13-15 0-24 5-28 14z" fill="${hair}"/>`,
    // rapado platinado
    `<path d="M34 48c0-14 10-23 26-23s26 9 26 23c-7-6-15-8-26-8s-19 2-26 8z" fill="${hair}"/>`
  ];
  const beards = [
    `<path d="M40 66c2 14 10 22 20 22s18-8 20-22c-4 6-10 9-20 9s-16-3-20-9z" fill="${hair}" opacity=".9"/>`,
    `<path d="M38 62c0 18 9 30 22 30s22-12 22-30c-3 9-11 14-22 14s-19-5-22-14z" fill="${hair}"/><path d="M52 74c3-2 13-2 16 0-2 3-14 3-16 0z" fill="${sk}"/>`,
    `<path d="M50 73c3 2 17 2 20 0-1 3-5 5-10 5s-9-2-10-5z" fill="${hair}" opacity=".7"/>`
  ];
  return `<svg viewBox="0 0 120 120" role="img" aria-label="${esc(b.n)}"><rect width="120" height="120" fill="${b.c}"/><circle cx="60" cy="60" r="60" fill="url(#rg${i})"/>
  <defs><radialGradient id="rg${i}" cx=".5" cy=".35" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></radialGradient></defs>
  <path d="M18 120c3-20 20-30 42-30s39 10 42 30z" fill="#151311"/><path d="M50 90h20l-4 12h-12z" fill="${sk}"/><path d="M47 92l13 14 13-14" fill="none" stroke="#f1e8d8" stroke-width="2.5"/>
  <rect x="52" y="76" width="16" height="18" rx="6" fill="${sk}"/>
  <ellipse cx="60" cy="56" rx="24" ry="28" fill="${sk}"/><ellipse cx="35" cy="58" rx="4" ry="6" fill="${sk}"/><ellipse cx="85" cy="58" rx="4" ry="6" fill="${sk}"/>
  <circle cx="51" cy="56" r="2.4" fill="#1d1a17"/><circle cx="69" cy="56" r="2.4" fill="#1d1a17"/>
  <path d="M46 49c3-2 7-2 10 0M64 49c3-2 7-2 10 0" stroke="${hair === "#e8e2d6" ? "#8a7a68" : hair}" stroke-width="2.6" stroke-linecap="round" fill="none"/>
  <path d="M60 58v8h-3" stroke="#000" stroke-opacity=".25" stroke-width="2" fill="none" stroke-linecap="round"/>
  ${beards[i % 3]}<path d="M53 72c4 2 10 2 14 0" stroke="#5a2e22" stroke-width="2.4" fill="none" stroke-linecap="round"/>${hairs[i % 3]}</svg>`;
}
function productoSVG(p){
  const c = p.c, k = p.ic;
  const shapes = {
    jar: `<rect x="34" y="52" width="52" height="40" rx="8" fill="${c}"/><rect x="31" y="42" width="58" height="14" rx="5" fill="#1d1a17"/><rect x="40" y="64" width="40" height="16" rx="3" fill="#f1e8d8" opacity=".9"/><path d="M46 72h28" stroke="#1d1a17" stroke-width="3"/>`,
    drop: `<rect x="46" y="44" width="28" height="52" rx="8" fill="${c}"/><rect x="51" y="30" width="18" height="16" rx="3" fill="#1d1a17"/><rect x="56" y="18" width="8" height="14" rx="4" fill="#3a332b"/><rect x="50" y="58" width="20" height="22" rx="3" fill="#f1e8d8" opacity=".9"/>`,
    bottle: `<path d="M44 46c0-6 4-10 10-10h12c6 0 10 4 10 10v46H44z" fill="${c}"/><rect x="52" y="22" width="16" height="16" rx="3" fill="#1d1a17"/><rect x="49" y="56" width="22" height="26" rx="3" fill="#f1e8d8" opacity=".9"/><path d="M53 64h14M53 70h10" stroke="#1d1a17" stroke-width="2.5"/>`,
    can: `<rect x="42" y="38" width="36" height="56" rx="6" fill="${c}"/><rect x="42" y="30" width="36" height="12" rx="4" fill="#1d1a17"/><rect x="47" y="56" width="26" height="20" rx="3" fill="#1d1a17" opacity=".85"/><path d="M52 66h16" stroke="${c}" stroke-width="3"/>`
  };
  return `<svg viewBox="0 0 120 120" aria-hidden="true"><ellipse cx="60" cy="98" rx="34" ry="5" fill="#000" opacity=".35"/>${shapes[k] || shapes.jar}<path d="M38 48l6-4" stroke="#fff" stroke-opacity=".35" stroke-width="3" stroke-linecap="round"/></svg>`;
}
const ICONOS = {
  Servicios: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/></svg>`,
  Promos: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>`,
  Color: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3s7 7.6 7 12a7 7 0 0 1-14 0c0-4.4 7-12 7-12z"/></svg>`
};
