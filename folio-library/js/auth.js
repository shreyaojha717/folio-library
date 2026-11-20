import { auth, isConfigured, googleProvider } from "./firebase.js";
import {
  signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile,
  sendPasswordResetEmail, signInWithPopup, signInWithRedirect, getRedirectResult,
  onAuthStateChanged, setPersistence, browserLocalPersistence, browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

/* ---------- Rotating quotes (public domain) ---------- */
const QUOTES = [
  ["If you have a garden and a library, you have everything you need.", "Cicero"],
  ["The true university of these days is a collection of books.", "Thomas Carlyle"],
  ["Some books are to be tasted, others to be swallowed, and some few to be chewed and digested.", "Francis Bacon"],
  ["A room without books is like a body without a soul.", "Attributed to Cicero"]
];
let qi = 0;
function showQuote() {
  const q = $("#quote");
  q.style.opacity = 0;
  setTimeout(() => {
    const [text, who] = QUOTES[qi++ % QUOTES.length];
    q.innerHTML = `“${text}”<cite>— ${who}</cite>`;
    q.style.opacity = 1;
  }, 350);
}
showQuote();
setInterval(showQuote, 7000);

/* ---------- Panel switching ---------- */
const panels = { login: $("#loginForm"), signup: $("#signupForm"), reset: $("#resetForm") };
const copy = {
  login:  ["Welcome back.",   "Sign in to manage your collection."],
  signup: ["Open a new card.", "Create a librarian account in seconds."],
  reset:  ["Lost your key?",  "We'll email you a link to set a new password."]
};
function show(name) {
  Object.entries(panels).forEach(([k, el]) => (el.hidden = k !== name));
  $("#authTitle").textContent = copy[name][0];
  $("#authSub").textContent = copy[name][1];
  $("#seg").hidden = name === "reset";
  $("#googleWrap").hidden = name === "reset";
  $$(".seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  if (name === "reset") $("#resetEmail").value = $("#loginEmail").value;
  setMsg("");
}
$$("[data-tab]").forEach((b) => b.addEventListener("click", () => show(b.dataset.tab)));

$$("[data-toggle]").forEach((b) =>
  b.addEventListener("click", () => {
    const inp = document.getElementById(b.dataset.toggle);
    const hidden = inp.type === "password";
    inp.type = hidden ? "text" : "password";
    b.textContent = hidden ? "Hide" : "Show";
  })
);

/* ---------- Helpers ---------- */
function setMsg(text, type = "") {
  const m = $("#msg");
  m.textContent = text;
  m.className = "msg " + type;
}
function busy(btn, on, label = "Please wait…") {
  if (on) { btn.dataset.label = btn.innerHTML; btn.textContent = label; btn.disabled = true; }
  else { btn.innerHTML = btn.dataset.label || btn.innerHTML; btn.disabled = false; }
}
function friendly(err) {
  const map = {
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/wrong-password": "Email or password is incorrect.",
    "auth/user-not-found": "No account found with that email.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/missing-password": "Please enter your password.",
    "auth/email-already-in-use": "An account with this email already exists. Try signing in.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/too-many-requests": "Too many attempts. Please wait a minute and try again.",
    "auth/network-request-failed": "Network error — check your internet connection.",
    "auth/popup-closed-by-user": "Google sign-in was cancelled.",
    "auth/cancelled-popup-request": "Google sign-in was cancelled.",
    "auth/account-exists-with-different-credential": "This email already uses another sign-in method.",
    "auth/unauthorized-domain": "This website's domain isn't authorised. In Firebase → Authentication → Settings → Authorized domains, add this domain.",
    "auth/operation-not-allowed": "This sign-in method is not enabled in Firebase → Authentication → Sign-in method."
  };
  return map[err?.code] || err?.message || "Something went wrong.";
}
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

/* ---------- Not configured? ---------- */
if (!isConfigured) {
  $("#configWarning").hidden = false;
  $$("button[type=submit], #googleBtn").forEach((b) => (b.disabled = true));
} else {
  let creating = false;

  onAuthStateChanged(auth, (user) => {
    if (user && !creating) location.replace("app.html");
  });
  getRedirectResult(auth).catch((err) => setMsg(friendly(err), "error"));

  const persist = () =>
    setPersistence(auth, $("#remember").checked ? browserLocalPersistence : browserSessionPersistence);

  /* Login */
  panels.login.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#loginEmail").value.trim();
    const pass = $("#loginPass").value;
    if (!validEmail(email)) return setMsg("Please enter a valid email address.", "error");
    if (!pass) return setMsg("Please enter your password.", "error");
    const btn = e.submitter || panels.login.querySelector("[type=submit]");
    busy(btn, true, "Signing in…");
    try {
      await persist();
      await signInWithEmailAndPassword(auth, email, pass);
      setMsg("Signed in — opening your library…", "ok");
    } catch (err) {
      setMsg(friendly(err), "error");
      busy(btn, false);
    }
  });

  /* Signup */
  panels.signup.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("#suName").value.trim();
    const email = $("#suEmail").value.trim();
    const p1 = $("#suPass").value, p2 = $("#suPass2").value;
    if (!name) return setMsg("Please enter your name.", "error");
    if (!validEmail(email)) return setMsg("Please enter a valid email address.", "error");
    if (p1.length < 6) return setMsg("Password must be at least 6 characters.", "error");
    if (p1 !== p2) return setMsg("Passwords don't match.", "error");
    const btn = e.submitter || panels.signup.querySelector("[type=submit]");
    busy(btn, true, "Creating account…");
    creating = true;
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, p1);
      await updateProfile(cred.user, { displayName: name });
      location.replace("app.html");
    } catch (err) {
      creating = false;
      setMsg(friendly(err), "error");
      busy(btn, false);
    }
  });

  /* Forgot password */
  panels.reset.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#resetEmail").value.trim();
    if (!validEmail(email)) return setMsg("Please enter a valid email address.", "error");
    const btn = e.submitter || panels.reset.querySelector("[type=submit]");
    busy(btn, true, "Sending…");
    try {
      await sendPasswordResetEmail(auth, email);
      setMsg("If an account exists for that email, a reset link is on its way. Check your inbox (and spam).", "ok");
    } catch (err) {
      setMsg(friendly(err), "error");
    } finally {
      busy(btn, false);
    }
  });

  /* Google */
  $("#googleBtn").addEventListener("click", async () => {
    const btn = $("#googleBtn");
    busy(btn, true, "Opening Google…");
    try {
      await persist();
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      if (["auth/popup-blocked", "auth/operation-not-supported-in-this-environment"].includes(err.code)) {
        await signInWithRedirect(auth, googleProvider);
        return;
      }
      setMsg(friendly(err), "error");
      busy(btn, false);
    }
  });
}
