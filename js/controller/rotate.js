// Portrait detection and the full-screen "rotate your phone" gate for the landscape-only pad.

let gate = null;

function build() {
  if (gate) return gate;
  gate = document.createElement("div");
  gate.className = "rot-gate";
  gate.innerHTML =
    '<div class="rot-card">' +
      '<svg class="rot-phone" viewBox="0 0 120 120" aria-hidden="true">' +
        '<rect x="42" y="12" width="36" height="70" rx="7" fill="#FFF6E9" stroke="#111111" stroke-width="6"/>' +
        '<rect x="53" y="20" width="14" height="4" rx="2" fill="#111111"/>' +
        '<circle cx="60" cy="74" r="3.4" fill="#111111"/>' +
        '<path d="M26 96a40 40 0 0 1 68 0" fill="none" stroke="#111111" stroke-width="6" stroke-linecap="round"/>' +
        '<path d="M94 96l-11-7 1 14z" fill="#111111"/>' +
      '</svg>' +
      '<div class="rot-title">ROTATE<br>YOUR PHONE</div>' +
      '<div class="rot-sub">TRACK CREW PADS ARE HELD SIDEWAYS</div>' +
    '</div>';
  document.body.appendChild(gate);
  return gate;
}

export function initRotateGate() {
  const el = build();
  const isLandscape = () => window.innerWidth >= window.innerHeight;
  const apply = () => {
    const land = isLandscape();
    el.classList.toggle("on", !land);
    document.body.classList.toggle("is-portrait", !land);
  };
  window.addEventListener("resize", apply);
  window.addEventListener("orientationchange", () => setTimeout(apply, 120));
  if (window.visualViewport) window.visualViewport.addEventListener("resize", apply);
  apply();
  return isLandscape;
}
