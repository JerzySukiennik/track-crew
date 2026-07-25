// Track Crew — query parsing, role routing and the landing screen shown when no role is given.

import { TUNE } from "./config.js";

const ROLE_DISPLAY = "display";
const ROLE_CONTROLLER = "controller";

const ENTRY = {
  [ROLE_DISPLAY]: "./display/main.js",
  [ROLE_CONTROLLER]: "./controller/main.js"
};

const glRoot = document.getElementById("gl");
const tvRoot = document.getElementById("tv-root");
const padRoot = document.getElementById("pad-root");

function readQuery() {
  const q = new URLSearchParams(location.search);
  const role = (q.get("role") || "").toLowerCase();
  return {
    role: role === ROLE_DISPLAY || role === ROLE_CONTROLLER ? role : null,
    room: normalizeCode(q.get("room") || ""),
    debug: q.get("debug") === "1",
    seed: q.get("seed") ? Number(q.get("seed")) : null
  };
}

function normalizeCode(raw) {
  const up = String(raw).toUpperCase().replace(/[^A-Z]/g, "");
  let out = "";
  for (const ch of up) if (TUNE.ROOM_CODE_ALPHABET.includes(ch)) out += ch;
  return out.slice(0, TUNE.ROOM_CODE_LEN);
}

function isValidCode(code) {
  return code.length === TUNE.ROOM_CODE_LEN;
}

function go(role, room) {
  const q = new URLSearchParams();
  q.set("role", role);
  if (room) q.set("room", room);
  location.search = "?" + q.toString();
}

function showLanding(prefill) {
  document.body.classList.add("paper-dark");
  padRoot.hidden = false;
  padRoot.innerHTML = `
    <div class="boot">
      <h1>TRACK CREW</h1>
      <p>Open this page on the <b>TV</b> to run the game. Phones join with the room code shown there.</p>
      <div class="code-entry">
        <input id="boot-code" type="text" inputmode="latin" autocapitalize="characters"
               autocomplete="off" spellcheck="false" maxlength="${TUNE.ROOM_CODE_LEN}" value="${prefill}" aria-label="Room code">
        <button class="btn" id="boot-join">JOIN</button>
      </div>
      <button class="btn fill-cyan" id="boot-tv">I AM THE TV</button>
      <span class="err" id="boot-err" hidden>ENTER THE ${TUNE.ROOM_CODE_LEN}-LETTER CODE</span>
    </div>`;

  const input = padRoot.querySelector("#boot-code");
  const err = padRoot.querySelector("#boot-err");
  const join = () => {
    const code = normalizeCode(input.value);
    input.value = code;
    if (!isValidCode(code)) {
      err.hidden = false;
      return;
    }
    go(ROLE_CONTROLLER, code);
  };
  input.addEventListener("input", () => {
    input.value = normalizeCode(input.value);
    err.hidden = true;
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") join();
  });
  padRoot.querySelector("#boot-join").addEventListener("click", join);
  padRoot.querySelector("#boot-tv").addEventListener("click", () => go(ROLE_DISPLAY, ""));
  input.focus();
}

function showFailure(message) {
  document.body.classList.add("paper-dark");
  glRoot.hidden = true;
  tvRoot.hidden = true;
  padRoot.hidden = false;
  padRoot.innerHTML = `
    <div class="boot">
      <h1>NOT ON TRACK</h1>
      <p>${message}</p>
      <button class="btn" id="boot-back">BACK</button>
    </div>`;
  padRoot.querySelector("#boot-back").addEventListener("click", () => {
    location.search = "";
  });
}

async function run() {
  const params = readQuery();
  window.TC = params;

  if (!params.role) {
    showLanding(params.room);
    return;
  }

  if (params.role === ROLE_DISPLAY) {
    glRoot.hidden = false;
    tvRoot.hidden = false;
  } else {
    padRoot.hidden = false;
  }

  try {
    const mod = await import(ENTRY[params.role]);
    if (typeof mod.start === "function") await mod.start(params);
  } catch (e) {
    showFailure("This build could not start the " + params.role + ". Check the console for details.");
    throw e;
  }
}

run();
