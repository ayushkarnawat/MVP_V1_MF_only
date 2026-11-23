"use strict";

const storageKey = "unifolio-checklist-spike";
const byId = (id) => document.getElementById(id);
const hasPip = "documentPictureInPicture" in window;
const ua = navigator.userAgent;
const browserMatch = ua.match(/Edg\/[\d.]+/) || ua.match(/Firefox\/[\d.]+/) ||
  ua.match(/Chrome\/[\d.]+/) || ua.match(/Version\/[\d.]+/);
const browser = browserMatch ? browserMatch[0].replace("Version/", "Safari/") : ua.slice(0, 120);
const environment = `${browser}; documentPictureInPicture=${hasPip}; secureContext=${window.isSecureContext}`;
const lines = [];
let attemptNumber = 0;
let pipWindow = null;
let busy = false;
let state = { ticks: [false, false, false, false, false], step: "Fill the CAMS form" };

function log(message) {
  lines.push(`${new Date().toISOString()} ${message}`);
  byId("results").textContent = lines.join("\n");
}

try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  if (saved && Array.isArray(saved.ticks) && saved.ticks.length === 5 &&
      saved.ticks.every((tick) => typeof tick === "boolean") &&
      ["Fill the CAMS form", "Wait for the email"].includes(saved.step)) state = saved;
} catch (error) {
  log(`State restore failed: ${error.name}`);
}

const checklist = document.createElement("section");
checklist.className = "checklist";
const title = document.createElement("h2");
title.textContent = "Fill the CAMS form";
const progress = document.createElement("p");
progress.setAttribute("aria-live", "polite");
const list = document.createElement("ol");
const items = [
  "Statement type: Detailed",
  "Period: Specific Period, from 10 years ago to today",
  "Folio listing: With zero balance folios",
  "Email: the one registered with your funds",
  "Password: 8 to 15 characters, a capital, a number, one of @ # $ * _. Remember it"
];
const inputs = items.map((text, index) => {
  const row = document.createElement("li");
  const label = document.createElement("label");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.id = `tick-${index}`;
  label.htmlFor = input.id;
  label.append(input, document.createTextNode(text));
  row.append(label);
  list.append(row);
  input.addEventListener("change", () => {
    state.ticks[index] = input.checked;
    render();
    save();
    log(`Q5 tick ${index + 1}=${input.checked}; source=${checklist.ownerDocument === document ? "main" : "floating"}; shared state=${JSON.stringify(state)}`);
  });
  return input;
});
const advance = document.createElement("button");
advance.textContent = "I have submitted the form";
advance.addEventListener("click", () => {
  state.step = "Wait for the email";
  render();
  save();
  log(`Step changed: ${state.step}`);
});
const openCams = document.createElement("button");
openCams.textContent = "Open CAMS stand-in (button inside the checklist)";
openCams.addEventListener("click", () => {
  const tab = window.open("cams-stand-in.html", "_blank");
  log(`Q3b click inside the checklist (${checklist.ownerDocument === document ? "main" : "floating"}): window.open returned ${tab ? "window" : "null (blocked)"}`);
});
checklist.append(title, progress, list, advance, openCams);
byId("checklist-home").append(checklist);

function render() {
  const count = state.ticks.filter(Boolean).length;
  inputs.forEach((input, index) => { input.checked = state.ticks[index]; });
  title.textContent = state.step;
  progress.textContent = `${count} of 5 done`;
  advance.disabled = count !== 5;
  byId("shared-state").textContent = `Main page state: ${count} of 5 done. Step: ${state.step}`;
}

function save() {
  try { localStorage.setItem(storageKey, JSON.stringify(state)); }
  catch (error) { log(`State save failed: ${error.name}`); }
}

function fallback(reason) {
  byId("checklist-home").append(checklist);
  byId("location").textContent = `In-page checklist: ${reason}`;
  log(`Fallback: ${reason}`);
}

function copyStyles(target, tag) {
  for (const sheet of document.styleSheets) {
    try {
      const style = target.createElement("style");
      style.textContent = Array.from(sheet.cssRules, (rule) => rule.cssText).join("\n");
      if (sheet.media.mediaText) style.media = sheet.media.mediaText;
      target.head.append(style);
      log(`${tag} Q6 copied stylesheet rules`);
    } catch (error) {
      if (sheet.href) {
        const link = target.createElement("link");
        link.rel = "stylesheet";
        link.href = sheet.href;
        link.media = sheet.media.mediaText;
        target.head.append(link);
        log(`${tag} Q6 stylesheet link fallback: ${error.name}`);
      } else log(`${tag} Q6 stylesheet copy failed: ${error.name}`);
    }
  }
  const light = target.createElement("style");
  light.textContent = ":root { color-scheme: light !important; } body { background: white !important; color: #17251d !important; }";
  target.head.append(light);
}

async function openChecklist(tag, simulateRefusal) {
  if (!hasPip) {
    log(`${tag} requestWindow unavailable`);
    fallback("API unavailable");
    return;
  }
  const existing = window.documentPictureInPicture.window;
  if (existing && !existing.closed) {
    existing.focus();
    log(`${tag} Q7 focused existing window`);
    return;
  }
  let opened;
  try {
    if (simulateRefusal) throw new DOMException("", "NotAllowedError");
    // This call runs on the original click stack, before the first await.
    const pending = window.documentPictureInPicture.requestWindow({ width: 320, height: 440 });
    log(`${tag} requestWindow called`);
    opened = await pending;
  } catch (error) {
    log(`${tag} requestWindow threw ${error.name}${simulateRefusal ? " (simulated)" : ""}`);
    fallback("Floating window refused");
    return;
  }
  log(`${tag} requestWindow returned window`);
  pipWindow = opened;
  opened.addEventListener("pagehide", () => {
    byId("checklist-home").append(checklist);
    if (pipWindow === opened) pipWindow = null;
    byId("location").textContent = "Floating window closed. Checklist returned here.";
    log(`${tag} pagehide: checklist moved back to main page`);
  }, { once: true });
  opened.document.title = "Unifolio checklist";
  opened.document.body.className = "pip-page";
  copyStyles(opened.document, tag);
  opened.document.body.append(checklist);
  byId("location").textContent = "Checklist is floating. Main page state remains visible here.";
  log(`${tag} checklist DOM moved; shared handlers retained`);
}

function fakeRequest(delay, tag) {
  log(`${tag} fake request started`);
  return new Promise((resolve) => setTimeout(() => {
    log(`${tag} fake request finished`);
    resolve();
  }, delay));
}

async function run(order) {
  if (busy) return;
  const delay = Number(byId("delay").value);
  const tag = `Attempt ${++attemptNumber} ${order}; delay=${delay / 1000}s; ${environment}`;
  const simulateRefusal = byId("refuse").checked;
  busy = true;
  try {
    if (order === "request-first") await fakeRequest(delay, tag);
    if (order === "cams-first") {
      // window.open runs on the click stack, before any await.
      const tab = window.open("cams-stand-in.html", "_blank");
      log(`${tag} window.open (first) returned ${tab ? "window" : "null (blocked)"}`);
    }
    await openChecklist(tag, simulateRefusal);
    if (order === "checklist-first" || order === "cams-first") await fakeRequest(delay, tag);
    if (order !== "checklist-only" && order !== "cams-first") {
      try {
        const tab = window.open("cams-stand-in.html", "_blank");
        log(`${tag} window.open returned ${tab ? "window" : "null (blocked)"}`);
      } catch (error) { log(`${tag} window.open threw ${error.name}`); }
    }
  } catch (error) {
    log(`${tag} setup failed: ${error.name}`);
    if (pipWindow && !pipWindow.closed) pipWindow.close();
    fallback("Checklist setup failed");
  } finally { busy = false; }
}

byId("checklist-first").addEventListener("click", () => { void run("checklist-first"); });
byId("cams-first").addEventListener("click", () => { void run("cams-first"); });
byId("request-first").addEventListener("click", () => { void run("request-first"); });
byId("checklist-only").addEventListener("click", () => { void run("checklist-only"); });
byId("close").addEventListener("click", () => {
  if (pipWindow && !pipWindow.closed) pipWindow.close();
  else log("Close: no floating window open");
});
byId("record").addEventListener("click", () => {
  log(`Manual observation; latest attempt=${attemptNumber}; ${byId("observation").value}: ${byId("outcome").value}`);
});
byId("copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(lines.join("\n"));
    byId("copy").textContent = "Results copied";
  } catch (error) { log(`Clipboard failed: ${error.name}; select and copy the results text manually`); }
});
byId("environment").textContent = environment;
render();
byId("location").textContent = "Checklist is in the page until opened.";
log(`Load: ${environment}; restored state=${JSON.stringify(state)}`);
if (!hasPip) fallback("API unavailable");
