import { auth, db, isConfigured } from "./firebase.js";
import { LIBRARY_NAME, LOAN_DAYS, FINE_PER_DAY, CURRENCY } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot,
  writeBatch, increment, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ================= Helpers ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DAY = 864e5;
const fmtDate = (ms) => new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const money = (n) => `${CURRENCY}${n.toLocaleString("en-IN")}`;
const ago = (ms) => {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
};

const state = { user: null, books: [], members: [], loans: [], view: "dashboard", loanFilter: "active", ready: 0 };
let unsubs = [];

/* ================= Auth guard ================= */
if (!isConfigured) location.replace("index.html");
else onAuthStateChanged(auth, (user) => {
  if (!user) { unsubs.forEach((u) => u()); location.replace("index.html"); return; }
  state.user = user;
  boot();
});

const col = (name) => collection(db, "users", state.user.uid, name);

function boot() {
  $("#libName").textContent = LIBRARY_NAME;
  document.title = `${LIBRARY_NAME} — Folio`;
  $("#today").textContent = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  renderUser();
  setView(state.view);
  unsubs.forEach((u) => u());
  const listen = (name, key, field) =>
    onSnapshot(query(col(name), orderBy(field, "desc")), (snap) => {
      state[key] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (++state.ready >= 3) $("#loader").classList.add("gone");
      renderAll();
    }, onErr);
  unsubs = [listen("books", "books", "createdAt"), listen("members", "members", "createdAt"), listen("loans", "loans", "issuedAt")];
  setTimeout(() => $("#loader").classList.add("gone"), 6000); // safety
}

function renderUser() {
  const u = state.user;
  const name = u.displayName || u.email.split("@")[0];
  $("#userName").textContent = name;
  $("#userEmail").textContent = u.email;
  $("#avatar").innerHTML = u.photoURL
    ? `<img src="${esc(u.photoURL)}" alt="" referrerpolicy="no-referrer">`
    : esc(name[0].toUpperCase());
}

/* ================= Domain logic ================= */
const loanStatus = (l) => (l.returnedAt ? "returned" : Date.now() > l.dueAt ? "overdue" : "active");
const fineFor = (l) => {
  const end = l.returnedAt || Date.now();
  const days = Math.ceil((end - l.dueAt) / DAY);
  return days > 0 ? days * FINE_PER_DAY : 0;
};
const activeLoans = () => state.loans.filter((l) => !l.returnedAt);
const activeFor = (key, id) => activeLoans().filter((l) => l[key] === id);

const COVERS = [["#1f4d3a", "#2f6b52"], ["#7a2e1f", "#b4492f"], ["#2f5d7c", "#4a7fa3"], ["#5b3a6e", "#80599c"],
  ["#8a5a1c", "#c08a3e"], ["#26302b", "#4a5650"], ["#6b2b43", "#9a4166"], ["#1e5960", "#2f8a93"]];
function coverStyle(title) {
  let h = 0;
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const [a, b] = COVERS[h % COVERS.length];
  return `background:linear-gradient(140deg,${a},${b})`;
}

/* ================= Rendering ================= */
function renderAll() {
  const overdue = activeLoans().filter((l) => loanStatus(l) === "overdue").length;
  const badge = $("#overdueBadge");
  badge.hidden = !overdue;
  badge.textContent = overdue;
  renderDashboard();
  renderBooks();
  renderMembers();
  renderLoans();
}

const TITLES = { books: "Catalogue", members: "Members", loans: "Circulation" };
function setView(view, filter) {
  state.view = view;
  $$(".view").forEach((v) => (v.hidden = v.id !== `view-${view}`));
  $$(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  if (filter) {
    state.loanFilter = filter;
    $$("#loanTabs .tab").forEach((t) => t.classList.toggle("active", t.dataset.f === filter));
    renderLoans();
  }
  const h = new Date().getHours();
  const hello = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const first = (state.user?.displayName || "").split(" ")[0];
  $("#viewTitle").textContent = view === "dashboard" ? `${hello}${first ? ", " + first : ""}.` : TITLES[view];
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderDashboard() {
  const { books, members, loans } = state;
  const copies = books.reduce((s, b) => s + (b.copies || 0), 0);
  const act = activeLoans();
  const overdue = act.filter((l) => loanStatus(l) === "overdue");
  const dueSoon = act.filter((l) => loanStatus(l) === "active" && l.dueAt - Date.now() < 7 * DAY).length;
  const accruing = overdue.reduce((s, l) => s + fineFor(l), 0);
  const collected = loans.filter((l) => l.returnedAt).reduce((s, l) => s + (l.fine || 0), 0);

  $("#stats").innerHTML = `
    <div class="stat" data-tab="CAT"><div class="lbl">Titles</div><div class="num">${books.length}</div><div class="sub">${copies} copies in total</div></div>
    <div class="stat" data-tab="OUT"><div class="lbl">On loan</div><div class="num">${act.length}</div><div class="sub">${dueSoon} due within 7 days</div></div>
    <div class="stat ${overdue.length ? "hot" : ""}" data-tab="LATE"><div class="lbl">Overdue</div><div class="num">${overdue.length}</div><div class="sub">${money(accruing)} fines accruing</div></div>
    <div class="stat" data-tab="MEM"><div class="lbl">Members</div><div class="num">${members.length}</div><div class="sub">${money(collected)} fines collected</div></div>`;

  const empty = !books.length && !members.length;
  $("#dashEmpty").hidden = !empty;
  $("#dashGrid").hidden = empty;
  if (empty) return;

  $("#overdueList").innerHTML = overdue.length
    ? overdue.slice(0, 5).map((l) => `
      <div class="list-item">
        <div class="li-icon in">!</div>
        <div class="li-main"><div class="li-title">${esc(l.bookTitle)}</div>
          <div class="li-sub">${esc(l.memberName)} · due ${fmtDate(l.dueAt)} · <b style="color:var(--rust)">${money(fineFor(l))}</b></div></div>
        <button class="btn btn-sm" data-action="return" data-id="${l.id}">Return</button>
      </div>`).join("")
    : `<p class="muted" style="padding:10px 0">Nothing overdue. Lovely. ✨</p>`;

  const events = [];
  loans.forEach((l) => {
    events.push({ t: l.issuedAt, out: true, l });
    if (l.returnedAt) events.push({ t: l.returnedAt, out: false, l });
  });
  events.sort((a, b) => b.t - a.t);
  $("#activity").innerHTML = events.length
    ? events.slice(0, 6).map((e) => `
      <div class="list-item">
        <div class="li-icon ${e.out ? "out" : "in"}">${e.out ? "↗" : "↙"}</div>
        <div class="li-main"><div class="li-title">${esc(e.l.bookTitle)}</div>
          <div class="li-sub">${e.out ? "Issued to" : "Returned by"} ${esc(e.l.memberName)} · ${ago(e.t)}</div></div>
      </div>`).join("")
    : `<p class="muted" style="padding:10px 0">No loans yet — issue your first book.</p>`;

  const genres = {};
  books.forEach((b) => { const g = b.genre || "Uncategorised"; genres[g] = (genres[g] || 0) + 1; });
  const gList = Object.entries(genres).sort((a, b) => b[1] - a[1]).slice(0, 7);
  const max = Math.max(1, ...gList.map((g) => g[1]));
  $("#genreBars").innerHTML = gList.length
    ? gList.map(([g, n]) => `<div class="bar-row"><span>${esc(g)}</span><div class="bar-track"><div class="bar-fill" style="width:${(n / max) * 100}%"></div></div><b>${n}</b></div>`).join("")
    : `<p class="muted">No books yet.</p>`;

  const counts = {};
  loans.forEach((l) => { counts[l.bookId] = counts[l.bookId] || { n: 0, title: l.bookTitle }; counts[l.bookId].n++; });
  const pop = Object.values(counts).sort((a, b) => b.n - a.n).slice(0, 5);
  $("#popular").innerHTML = pop.length
    ? pop.map((p, i) => `<div class="list-item"><div class="li-icon out" style="font-family:var(--serif);font-weight:700">${i + 1}</div>
        <div class="li-main"><div class="li-title">${esc(p.title)}</div><div class="li-sub">${p.n} loan${p.n > 1 ? "s" : ""}</div></div></div>`).join("")
    : `<p class="muted" style="padding:10px 0">Borrowing stats appear here.</p>`;
}

function renderBooks() {
  // genre filter + datalist
  const genres = [...new Set(["Fiction", "Classic", "Science", "History", "Biography", "Technology", "Poetry", "Self-help", "Children", "Reference",
    ...state.books.map((b) => b.genre).filter(Boolean)])].sort();
  const gf = $("#genreFilter"), cur = gf.value;
  gf.innerHTML = `<option value="">All genres</option>` + genres.map((g) => `<option ${g === cur ? "selected" : ""}>${esc(g)}</option>`).join("");
  $("#genreList").innerHTML = genres.map((g) => `<option value="${esc(g)}">`).join("");

  const q = $("#bookSearch").value.trim().toLowerCase();
  const g = gf.value, av = $("#availFilter").value;
  const list = state.books.filter((b) =>
    (!q || [b.title, b.author, b.isbn].some((x) => String(x || "").toLowerCase().includes(q))) &&
    (!g || b.genre === g) &&
    (!av || (av === "in" ? b.available > 0 : b.available <= 0)));

  if (!state.books.length) {
    $("#bookGrid").innerHTML = `<div class="panel empty" style="grid-column:1/-1"><div class="big">📖</div><h3>No books yet</h3>
      <p>Start your catalogue by adding a book.</p><button class="btn btn-primary" data-action="add-book">+ Add book</button>
      <button class="btn" data-action="seed">Load sample library</button></div>`;
    return;
  }
  if (!list.length) {
    $("#bookGrid").innerHTML = `<div class="panel empty" style="grid-column:1/-1"><h3>No matches</h3><p>Try a different search or filter.</p></div>`;
    return;
  }
  $("#bookGrid").innerHTML = list.map((b) => {
    const pill = b.available <= 0 ? `<span class="pill bad">All out</span>`
      : b.available < b.copies ? `<span class="pill warn">${b.available} of ${b.copies} in</span>`
      : `<span class="pill ok">${b.available} available</span>`;
    return `<article class="book">
      <div class="cover" style="${coverStyle(b.title)}">
        <div class="cover-title">${esc(b.title)}</div>
        <div class="cover-author">${esc(b.author)}</div>
      </div>
      <div class="book-body">
        <div class="meta">${b.genre ? `<span class="tag">${esc(b.genre)}</span>` : ""}${b.year ? `<span class="tag">${esc(b.year)}</span>` : ""}${b.shelf ? `<span class="tag">Shelf ${esc(b.shelf)}</span>` : ""}</div>
        <div>${pill}</div>
        <div class="book-actions">
          <button class="btn btn-sm btn-primary" data-action="issue" data-id="${b.id}" ${b.available <= 0 ? "disabled" : ""}>Issue</button>
          <button class="btn btn-sm" data-action="edit-book" data-id="${b.id}">Edit</button>
          <button class="btn btn-sm btn-ghost" data-action="delete-book" data-id="${b.id}" title="Delete">🗑</button>
        </div>
      </div>
    </article>`;
  }).join("");
}

function renderMembers() {
  const q = $("#memberSearch").value.trim().toLowerCase();
  const list = state.members.filter((m) => !q || [m.name, m.email, m.memberId, m.phone].some((x) => String(x || "").toLowerCase().includes(q)));
  if (!state.members.length) {
    $("#memberTable").innerHTML = `<div class="panel empty"><div class="big">🪪</div><h3>No members yet</h3><p>Register readers to start lending.</p>
      <button class="btn btn-primary" data-action="add-member">+ Add member</button></div>`;
    return;
  }
  $("#memberTable").innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Member</th><th>ID</th><th>Type</th><th>Phone</th><th>Books out</th><th>Joined</th><th></th></tr></thead>
    <tbody>${list.map((m) => {
      const out = activeFor("memberId", m.id);
      const late = out.some((l) => loanStatus(l) === "overdue");
      return `<tr>
        <td><div class="cell-main">${esc(m.name)}</div><div class="cell-sub">${esc(m.email || "—")}</div></td>
        <td class="mono">${esc(m.memberId)}</td>
        <td><span class="tag">${esc(m.type)}</span></td>
        <td>${esc(m.phone || "—")}</td>
        <td>${out.length ? `<span class="pill ${late ? "bad" : "warn"}">${out.length}${late ? " · overdue" : ""}</span>` : `<span class="pill muted">0</span>`}</td>
        <td class="cell-sub">${fmtDate(m.createdAt)}</td>
        <td><div class="actions">
          <button class="btn btn-sm btn-primary" data-action="issue-member" data-id="${m.id}">Issue</button>
          <button class="btn btn-sm" data-action="edit-member" data-id="${m.id}">Edit</button>
          <button class="btn btn-sm btn-ghost" data-action="delete-member" data-id="${m.id}" title="Delete">🗑</button>
        </div></td></tr>`;
    }).join("") || `<tr><td colspan="7" class="muted" style="text-align:center;padding:30px">No matches.</td></tr>`}</tbody></table></div>`;
}

function renderLoans() {
  const f = state.loanFilter;
  const q = $("#loanSearch").value.trim().toLowerCase();
  const list = state.loans.filter((l) => {
    const s = loanStatus(l);
    const okF = f === "all" || (f === "active" ? s !== "returned" : s === f);
    return okF && (!q || [l.bookTitle, l.memberName].some((x) => String(x || "").toLowerCase().includes(q)));
  });
  if (!list.length) {
    const txt = { active: "No books are on loan right now.", overdue: "No overdue loans. 🎉", returned: "No returns yet.", all: "No loans yet." }[f];
    $("#loanTable").innerHTML = `<div class="panel empty"><div class="big">🔁</div><h3>${txt}</h3>
      <button class="btn btn-primary" data-action="issue-new">Issue a book</button></div>`;
    return;
  }
  $("#loanTable").innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Book</th><th>Member</th><th>Issued</th><th>Due</th><th>Status</th><th>Fine</th><th></th></tr></thead>
    <tbody>${list.map((l) => {
      const s = loanStatus(l), fine = l.returnedAt ? l.fine || 0 : fineFor(l);
      const pill = s === "returned" ? `<span class="pill muted">Returned ${fmtDate(l.returnedAt)}</span>`
        : s === "overdue" ? `<span class="pill bad">${Math.ceil((Date.now() - l.dueAt) / DAY)}d overdue</span>`
        : `<span class="pill ok">Due in ${Math.max(0, Math.ceil((l.dueAt - Date.now()) / DAY))}d</span>`;
      return `<tr>
        <td class="cell-main">${esc(l.bookTitle)}</td>
        <td>${esc(l.memberName)}</td>
        <td class="cell-sub">${fmtDate(l.issuedAt)}</td>
        <td class="cell-sub">${fmtDate(l.dueAt)}</td>
        <td>${pill}</td>
        <td>${fine ? `<b style="color:var(--rust)">${money(fine)}</b>` : "—"}</td>
        <td><div class="actions">${s !== "returned" ? `<button class="btn btn-sm btn-primary" data-action="return" data-id="${l.id}">Return</button>` : ""}</div></td>
      </tr>`;
    }).join("")}</tbody></table></div>`;
}

/* ================= UI utilities ================= */
function toast(text, type = "") {
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = text;
  $("#toasts").appendChild(t);
  setTimeout(() => { t.style.opacity = 0; t.style.transition = ".3s"; }, 3200);
  setTimeout(() => t.remove(), 3600);
}
function onErr(err) {
  console.error(err);
  const msg = err?.code === "permission-denied"
    ? "Database access denied — publish the rules from firestore.rules in Firebase."
    : err?.message || "Something went wrong.";
  toast(msg, "error");
  $("#loader").classList.add("gone");
}
function confirmBox(title, text, okLabel = "Confirm", danger = false) {
  return new Promise((resolve) => {
    const d = $("#confirmDialog");
    $("#confirmTitle").textContent = title;
    $("#confirmText").textContent = text;
    const yes = $("#confirmYes");
    yes.textContent = okLabel;
    yes.className = `btn ${danger ? "btn-danger" : "btn-primary"}`;
    const done = (v) => { d.close(); yes.onclick = null; $("#confirmNo").onclick = null; resolve(v); };
    yes.onclick = () => done(true);
    $("#confirmNo").onclick = () => done(false);
    d.onclose = () => resolve(false);
    d.showModal();
  });
}
async function withBusy(form, fn) {
  const btn = form.querySelector("[type=submit]");
  btn.disabled = true;
  try { await fn(); } catch (e) { onErr(e); } finally { btn.disabled = false; }
}

/* ================= Books ================= */
function openBookDialog(id) {
  const f = $("#bookForm");
  f.reset();
  f.dataset.id = id || "";
  $("#bookDlgTitle").textContent = id ? "Edit book" : "Add a book";
  if (id) {
    const b = state.books.find((x) => x.id === id);
    ["title", "author", "genre", "year", "isbn", "shelf", "copies"].forEach((k) => (f.elements[k].value = b[k] ?? ""));
  }
  $("#bookDialog").showModal();
  f.elements.title.focus();
}
$("#bookForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target, v = (k) => f.elements[k].value.trim();
  const data = {
    title: v("title"), author: v("author"), genre: v("genre"), isbn: v("isbn"), shelf: v("shelf"),
    year: parseInt(v("year")) || null, copies: Math.max(1, parseInt(v("copies")) || 1)
  };
  if (!data.title || !data.author) return toast("Title and author are required.", "error");
  withBusy(f, async () => {
    const id = f.dataset.id;
    if (id) {
      const onLoan = activeFor("bookId", id).length;
      if (data.copies < onLoan) return toast(`${onLoan} copies are on loan — copies can't be fewer than that.`, "error");
      await updateDoc(doc(col("books"), id), { ...data, available: data.copies - onLoan });
      // keep loan titles in sync
      const batch = writeBatch(db);
      state.loans.filter((l) => l.bookId === id).forEach((l) => batch.update(doc(col("loans"), l.id), { bookTitle: data.title }));
      await batch.commit();
      toast("Book updated");
    } else {
      await addDoc(col("books"), { ...data, available: data.copies, createdAt: Date.now() });
      toast("Book added to the catalogue");
    }
    $("#bookDialog").close();
  });
});
async function deleteBook(id) {
  const b = state.books.find((x) => x.id === id);
  if (activeFor("bookId", id).length) return toast("This book has copies on loan. Return them first.", "error");
  if (!(await confirmBox("Delete this book?", `"${b.title}" will be removed from the catalogue.`, "Delete", true))) return;
  try { await deleteDoc(doc(col("books"), id)); toast("Book deleted"); } catch (e) { onErr(e); }
}

/* ================= Members ================= */
function openMemberDialog(id) {
  const f = $("#memberForm");
  f.reset();
  f.dataset.id = id || "";
  $("#memberDlgTitle").textContent = id ? "Edit member" : "Add a member";
  if (id) {
    const m = state.members.find((x) => x.id === id);
    ["name", "email", "phone", "memberId", "type"].forEach((k) => (f.elements[k].value = m[k] ?? ""));
  }
  $("#memberDialog").showModal();
  f.elements.name.focus();
}
$("#memberForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target, v = (k) => f.elements[k].value.trim();
  const data = { name: v("name"), email: v("email"), phone: v("phone"), type: v("type"),
    memberId: v("memberId") || "M-" + Date.now().toString(36).toUpperCase().slice(-5) };
  if (!data.name) return toast("Name is required.", "error");
  if (state.members.some((m) => m.memberId === data.memberId && m.id !== f.dataset.id)) return toast("That member ID is already used.", "error");
  withBusy(f, async () => {
    const id = f.dataset.id;
    if (id) {
      await updateDoc(doc(col("members"), id), data);
      const batch = writeBatch(db);
      state.loans.filter((l) => l.memberId === id).forEach((l) => batch.update(doc(col("loans"), l.id), { memberName: data.name }));
      await batch.commit();
      toast("Member updated");
    } else {
      await addDoc(col("members"), { ...data, createdAt: Date.now() });
      toast("Member registered");
    }
    $("#memberDialog").close();
  });
});
async function deleteMember(id) {
  const m = state.members.find((x) => x.id === id);
  if (activeFor("memberId", id).length) return toast("This member still has books out.", "error");
  if (!(await confirmBox("Remove this member?", `${m.name} will be removed. Their past loan history stays.`, "Remove", true))) return;
  try { await deleteDoc(doc(col("members"), id)); toast("Member removed"); } catch (e) { onErr(e); }
}

/* ================= Circulation ================= */
function openIssueDialog({ bookId, memberId } = {}) {
  const avail = state.books.filter((b) => b.available > 0);
  if (!avail.length) return toast(state.books.length ? "No copies available to issue." : "Add a book first.", "error");
  if (!state.members.length) { toast("Register a member first.", "error"); return openMemberDialog(); }
  const f = $("#issueForm");
  f.elements.bookId.innerHTML = `<option value="">Choose a book…</option>` +
    avail.map((b) => `<option value="${b.id}" ${b.id === bookId ? "selected" : ""}>${esc(b.title)} — ${esc(b.author)} (${b.available} left)</option>`).join("");
  f.elements.memberId.innerHTML = `<option value="">Choose a member…</option>` +
    state.members.map((m) => `<option value="${m.id}" ${m.id === memberId ? "selected" : ""}>${esc(m.name)} · ${esc(m.memberId)}</option>`).join("");
  const due = new Date(Date.now() + LOAN_DAYS * DAY);
  f.elements.due.value = isoDate(due);
  f.elements.due.min = isoDate(new Date());
  $("#fineHint").textContent = `Default loan: ${LOAN_DAYS} days. Late fine: ${money(FINE_PER_DAY)} per day.`;
  $("#issueDialog").showModal();
}
$("#issueForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  const book = state.books.find((b) => b.id === f.elements.bookId.value);
  const member = state.members.find((m) => m.id === f.elements.memberId.value);
  if (!book || !member) return toast("Choose a book and a member.", "error");
  if (book.available <= 0) return toast("No copies of that book are available.", "error");
  if (activeFor("memberId", member.id).some((l) => l.bookId === book.id)) return toast(`${member.name} already has this book.`, "error");
  const [y, m, d] = f.elements.due.value.split("-").map(Number);
  const dueAt = new Date(y, m - 1, d, 23, 59, 59).getTime();
  withBusy(f, async () => {
    const batch = writeBatch(db);
    batch.set(doc(col("loans")), {
      bookId: book.id, bookTitle: book.title, memberId: member.id, memberName: member.name,
      issuedAt: Date.now(), dueAt, returnedAt: null, fine: 0
    });
    batch.update(doc(col("books"), book.id), { available: increment(-1) });
    await batch.commit();
    $("#issueDialog").close();
    toast(`Issued "${book.title}" to ${member.name}`);
  });
});
async function returnLoan(id) {
  const l = state.loans.find((x) => x.id === id);
  const fine = fineFor(l);
  const ok = await confirmBox("Return this book?",
    `"${l.bookTitle}" from ${l.memberName}.` + (fine ? ` Overdue fine to collect: ${money(fine)}.` : " No fine due."), "Mark returned");
  if (!ok) return;
  try {
    const batch = writeBatch(db);
    batch.update(doc(col("loans"), id), { returnedAt: Date.now(), fine });
    if (state.books.some((b) => b.id === l.bookId)) batch.update(doc(col("books"), l.bookId), { available: increment(1) });
    await batch.commit();
    toast(fine ? `Returned · collect ${money(fine)}` : "Book returned");
  } catch (e) { onErr(e); }
}

/* ================= Sample data ================= */
async function seedSample() {
  if (!(await confirmBox("Load sample library?", "Adds 9 books, 3 members and 2 loans so you can explore. You can delete them later.", "Load samples"))) return;
  const now = Date.now();
  const books = [
    ["Pride and Prejudice", "Jane Austen", "Classic", 1813, 3, "A-01"],
    ["The Guide", "R. K. Narayan", "Fiction", 1958, 2, "B-04"],
    ["Wings of Fire", "A. P. J. Abdul Kalam", "Biography", 1999, 4, "D-02"],
    ["A Brief History of Time", "Stephen Hawking", "Science", 1988, 2, "C-07"],
    ["Gitanjali", "Rabindranath Tagore", "Poetry", 1910, 2, "A-09"],
    ["Sapiens", "Yuval Noah Harari", "History", 2011, 3, "D-11"],
    ["Clean Code", "Robert C. Martin", "Technology", 2008, 2, "E-03"],
    ["The God of Small Things", "Arundhati Roy", "Fiction", 1997, 1, "B-06"],
    ["Atomic Habits", "James Clear", "Self-help", 2018, 3, "F-01"]
  ];
  const members = [["Ananya Rao", "ananya@example.com", "Student"], ["Rahul Mehta", "rahul@example.com", "Faculty"], ["Priya Nair", "priya@example.com", "Public"]];
  try {
    const batch = writeBatch(db);
    const bRefs = books.map(([title, author, genre, year, copies, shelf], i) => {
      const ref = doc(col("books"));
      const out = i === 2 || i === 6 ? 1 : 0;
      batch.set(ref, { title, author, genre, year, copies, shelf, isbn: "", available: copies - out, createdAt: now - i * 1000 });
      return ref;
    });
    const mRefs = members.map(([name, email, type], i) => {
      const ref = doc(col("members"));
      batch.set(ref, { name, email, type, phone: "", memberId: `M-${String(1001 + i)}`, createdAt: now - i * 1000 });
      return ref;
    });
    batch.set(doc(col("loans")), { bookId: bRefs[2].id, bookTitle: books[2][0], memberId: mRefs[0].id, memberName: members[0][0],
      issuedAt: now - 20 * DAY, dueAt: now - 6 * DAY, returnedAt: null, fine: 0 });
    batch.set(doc(col("loans")), { bookId: bRefs[6].id, bookTitle: books[6][0], memberId: mRefs[1].id, memberName: members[1][0],
      issuedAt: now - 3 * DAY, dueAt: now + 11 * DAY, returnedAt: null, fine: 0 });
    await batch.commit();
    toast("Sample library loaded");
  } catch (e) { onErr(e); }
}

/* ================= Events ================= */
const actions = {
  goto: (_, b) => setView(b.dataset.view, b.dataset.filter),
  "add-book": () => openBookDialog(),
  "edit-book": (id) => openBookDialog(id),
  "delete-book": (id) => deleteBook(id),
  issue: (id) => openIssueDialog({ bookId: id }),
  "issue-member": (id) => openIssueDialog({ memberId: id }),
  "issue-new": () => openIssueDialog(),
  "add-member": () => openMemberDialog(),
  "edit-member": (id) => openMemberDialog(id),
  "delete-member": (id) => deleteMember(id),
  return: (id) => returnLoan(id),
  seed: () => seedSample(),
  logout: async () => {
    if (await confirmBox("Log out?", "You'll need to sign in again to manage the library.", "Log out")) {
      unsubs.forEach((u) => u());
      await signOut(auth);
    }
  }
};
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-action]");
  if (b && !b.disabled) actions[b.dataset.action]?.(b.dataset.id, b);
  const c = e.target.closest("[data-close]");
  if (c) c.closest("dialog").close();
});
$("#bookSearch").addEventListener("input", renderBooks);
$("#genreFilter").addEventListener("change", renderBooks);
$("#availFilter").addEventListener("change", renderBooks);
$("#memberSearch").addEventListener("input", renderMembers);
$("#loanSearch").addEventListener("input", renderLoans);
$("#loanTabs").addEventListener("click", (e) => {
  const t = e.target.closest(".tab");
  if (!t) return;
  state.loanFilter = t.dataset.f;
  $$("#loanTabs .tab").forEach((x) => x.classList.toggle("active", x === t));
  renderLoans();
});
setView("dashboard");
setInterval(() => state.ready && renderAll(), 60000); // refresh overdue status
