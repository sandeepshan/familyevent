// =============================================================================
// Get-Together Central — app logic
// Vanilla JS + Firebase (Firestore for data, Storage for photos).
// No build step — this file runs as-is in the browser.
// =============================================================================

// Firebase's SDK is loaded lazily inside boot(), AFTER we've confirmed
// js/firebase-config.js has real values — see the note there. That keeps an
// unconfigured install (or one where the Firebase CDN can't be reached) from
// showing a blank page: the lightweight local import below always succeeds,
// so the "please configure Firebase" banner can always be shown.
import { firebaseConfig, isFirebaseConfigured } from "./firebase-config.js";

// Populated inside boot() once the Firebase SDK has loaded.
let initializeApp;
let getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot,
  query, orderBy, serverTimestamp, getDocs, writeBatch, setDoc;
let getStorage, storageRef, uploadBytesResumable, getDownloadURL, deleteObject;

// -----------------------------------------------------------------------------
// Tiny DOM helpers
// -----------------------------------------------------------------------------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function showToast(msg, ms = 2600) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.add("hidden"), ms);
}

function getMyName() {
  let name = localStorage.getItem("gtc_name");
  if (!name) {
    name = (window.prompt("What's your name? (shown next to what you add — no password needed)", "") || "").trim();
    if (name) localStorage.setItem("gtc_name", name);
  }
  return name || "Someone";
}

// -----------------------------------------------------------------------------
// Modal system
// -----------------------------------------------------------------------------
function openModal(html, { onMount } = {}) {
  $("#modalContent").innerHTML = html;
  $("#modalOverlay").classList.remove("hidden");
  if (onMount) onMount($("#modalContent"));
}
function closeModal() {
  $("#modalOverlay").classList.add("hidden");
  $("#modalContent").innerHTML = "";
}
$("#modalCloseBtn").addEventListener("click", closeModal);
$("#modalOverlay").addEventListener("click", (e) => {
  if (e.target === $("#modalOverlay")) closeModal();
});

// -----------------------------------------------------------------------------
// Firebase init
// -----------------------------------------------------------------------------
let db, storage;
const FIREBASE_SDK_VERSION = "10.13.2";

async function boot() {
  if (!isFirebaseConfigured(firebaseConfig)) {
    $("#setupBanner").classList.remove("hidden");
    return;
  }
  try {
    const [appMod, fsMod, stMod] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-firestore.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-storage.js`),
    ]);
    ({ initializeApp } = appMod);
    ({ getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot,
      query, orderBy, serverTimestamp, getDocs, writeBatch, setDoc } = fsMod);
    ({ getStorage, uploadBytesResumable, getDownloadURL, deleteObject } = stMod);
    storageRef = stMod.ref;

    const fbApp = initializeApp(firebaseConfig);
    db = getFirestore(fbApp);
    storage = getStorage(fbApp);
  } catch (err) {
    console.error(err);
    $("#setupBannerMsg").textContent =
      "Couldn't connect to Firebase — double check the values in js/firebase-config.js, and that you're online. (" + err.message + ")";
    $("#setupBanner").classList.remove("hidden");
    return;
  }
  $("#app").classList.remove("hidden");
  initTabs();
  initSettings();
  initAttendees();
  initBudget();
  initPhotos();
  initGames();
  registerServiceWorker();
}

// -----------------------------------------------------------------------------
// Tabs
// -----------------------------------------------------------------------------
function initTabs() {
  $$(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
  $$("[data-quick]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.quick;
      switchTab(tab);
      if (tab === "attendees") $("#addAttendeeBtn").click();
      if (tab === "budget") $("#addBudgetBtn").click();
      if (tab === "photos") $("#photoInput").click();
      if (tab === "games") $("#surpriseBtn").click();
    });
  });
}
function switchTab(name) {
  $$(".tab-btn").forEach((b) => {
    const active = b.dataset.tab === name;
    b.classList.toggle("active", active);
    b.setAttribute("aria-selected", active ? "true" : "false");
  });
  $$(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === "tab-" + name));
}

// =============================================================================
// EVENT SETTINGS (single doc: settings/eventInfo)
// =============================================================================
let eventInfo = { eventName: "Family Get-Together", eventDate: "", venue: "", budgetTarget: 0, currencySymbol: "$" };

function initSettings() {
  const ref = doc(db, "settings", "eventInfo");
  onSnapshot(
    ref,
    (snap) => {
      if (snap.exists()) eventInfo = { ...eventInfo, ...snap.data() };
      renderEventHeader();
      renderDashboard();
    },
    (err) => console.error("settings listener:", err)
  );

  $("#settingsBtn").addEventListener("click", () => openSettingsModal());
}

function renderEventHeader() {
  $("#eventNameDisplay").textContent = eventInfo.eventName || "Family Get-Together";
  $("#eventSubDisplay").textContent = eventInfo.venue ? `📍 ${eventInfo.venue}` : "Plan it together";
  document.title = eventInfo.eventName || "Get-Together Central";
}

function fmtMoney(n) {
  const num = Number(n) || 0;
  return `${eventInfo.currencySymbol || "$"}${num.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function openSettingsModal() {
  openModal(
    `
    <h3>⚙️ Event settings</h3>
    <label class="field-label">Event name</label>
    <input class="input" id="setEventName" value="${escapeHtml(eventInfo.eventName || "")}" placeholder="e.g. Sharma Family Reunion 2026" />
    <div class="field-row">
      <div>
        <label class="field-label">Event date</label>
        <input class="input" id="setEventDate" type="date" value="${escapeHtml(eventInfo.eventDate || "")}" />
      </div>
      <div>
        <label class="field-label">Currency</label>
        <select class="input" id="setCurrency">
          ${["$", "₹", "£", "€", "A$", "C$"]
            .map((c) => `<option value="${c}" ${eventInfo.currencySymbol === c ? "selected" : ""}>${c}</option>`)
            .join("")}
        </select>
      </div>
    </div>
    <label class="field-label">Venue</label>
    <input class="input" id="setVenue" value="${escapeHtml(eventInfo.venue || "")}" placeholder="e.g. Green Park Community Hall" />
    <label class="field-label">Budget target (optional)</label>
    <input class="input" id="setBudgetTarget" type="number" min="0" step="0.01" value="${eventInfo.budgetTarget || ""}" placeholder="e.g. 1500" />
    <div class="modal-actions">
      <button class="btn btn-ghost" id="settingsCancel">Cancel</button>
      <button class="btn btn-primary" id="settingsSave">Save</button>
    </div>
  `,
    {
      onMount: (root) => {
        $("#settingsCancel", root).addEventListener("click", closeModal);
        $("#settingsSave", root).addEventListener("click", async () => {
          const data = {
            eventName: $("#setEventName", root).value.trim() || "Family Get-Together",
            eventDate: $("#setEventDate", root).value || "",
            venue: $("#setVenue", root).value.trim(),
            currencySymbol: $("#setCurrency", root).value,
            budgetTarget: parseFloat($("#setBudgetTarget", root).value) || 0,
          };
          try {
            await setDoc(doc(db, "settings", "eventInfo"), data, { merge: true });
            closeModal();
            showToast("Settings saved");
          } catch (err) {
            console.error(err);
            showToast("Couldn't save settings — check your connection");
          }
        });
      },
    }
  );
}

// =============================================================================
// DASHBOARD
// =============================================================================
function renderDashboard() {
  // Countdown
  if (eventInfo.eventDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const eventDate = new Date(eventInfo.eventDate + "T00:00:00");
    const diffDays = Math.round((eventDate - today) / 86400000);
    let label;
    if (diffDays > 1) label = `${diffDays} days to go`;
    else if (diffDays === 1) label = "Tomorrow! 🎉";
    else if (diffDays === 0) label = "Today! 🎉";
    else label = `Was ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? "" : "s"} ago`;
    $("#statCountdown").textContent = label;
    $("#statDateVenue").textContent = `${eventDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}${eventInfo.venue ? " · " + eventInfo.venue : ""}`;
  } else {
    $("#statCountdown").textContent = "—";
    $("#statDateVenue").textContent = "Set your event date in ⚙️ settings";
  }

  // Headcount
  const t = attendeeTotals();
  $("#statHeadcount").textContent = t.total;
  $("#statHeadcountBreak").textContent = `${t.adults} adults · ${t.kids512 + t.kidsU5} kids`;

  // Budget
  const budgetTotal = budgetGrandTotal();
  $("#statBudget").textContent = fmtMoney(budgetTotal);
  if (eventInfo.budgetTarget > 0) {
    $("#statBudgetTarget").textContent = `of ${fmtMoney(eventInfo.budgetTarget)} target`;
    const pct = Math.min(999, Math.round((budgetTotal / eventInfo.budgetTarget) * 100));
    $("#budgetProgressCard").hidden = false;
    $("#budgetProgressPct").textContent = pct + "%";
    $("#budgetProgressFill").style.width = Math.min(100, pct) + "%";
    $("#budgetProgressFill").classList.toggle("over", pct > 100);
  } else {
    $("#statBudgetTarget").textContent = "No target set";
    $("#budgetProgressCard").hidden = true;
  }

  // Photos
  $("#statPhotos").textContent = photos.length;

  renderActivityFeed();
}

function renderActivityFeed() {
  const items = [];
  attendees.forEach((a) => items.push({ ts: a.createdAt, text: `👨‍👩‍👧‍👦 ${a.addedBy || "Someone"} added <b>${escapeHtml(a.familyName)}</b> (${a.adults + a.kids512 + a.kidsU5} people)` }));
  budgetItems.forEach((b) => items.push({ ts: b.createdAt, text: `🧾 ${b.addedBy || "Someone"} added <b>${escapeHtml(b.itemName)}</b> — ${fmtMoney(b.quantity * b.unitPrice)}` }));
  photos.forEach((p) => items.push({ ts: p.createdAt, text: `📸 ${p.uploadedBy || "Someone"} uploaded a photo` }));
  items.sort((a, b) => tsMillis(b.ts) - tsMillis(a.ts));
  const feed = $("#activityFeed");
  if (!items.length) {
    feed.innerHTML = `<li class="muted">Nothing yet — start adding attendees, expenses or photos!</li>`;
    return;
  }
  feed.innerHTML = items.slice(0, 8).map((it) => `<li>${it.text}</li>`).join("");
}

function tsMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  return 0;
}

// =============================================================================
// ATTENDEES
// =============================================================================
let attendees = [];

function initAttendees() {
  const ref = query(collection(db, "attendees"), orderBy("createdAt", "asc"));
  onSnapshot(
    ref,
    (snap) => {
      attendees = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderAttendees();
      renderDashboard();
    },
    (err) => {
      console.error("attendees listener:", err);
      showToast("Couldn't load attendees — check Firestore rules");
    }
  );

  $("#addAttendeeBtn").addEventListener("click", () => openAttendeeModal());
  $("#attendeeSearch").addEventListener("input", renderAttendees);
  $("#exportAttendeesBtn").addEventListener("click", exportAttendeesCsv);
}

function attendeeTotals(list = attendees) {
  return list.reduce(
    (acc, a) => {
      acc.families += 1;
      acc.adults += Number(a.adults) || 0;
      acc.kids512 += Number(a.kids512) || 0;
      acc.kidsU5 += Number(a.kidsU5) || 0;
      acc.total += (Number(a.adults) || 0) + (Number(a.kids512) || 0) + (Number(a.kidsU5) || 0);
      return acc;
    },
    { families: 0, adults: 0, kids512: 0, kidsU5: 0, total: 0 }
  );
}

function renderAttendees() {
  const searchTerm = ($("#attendeeSearch").value || "").toLowerCase().trim();
  const filtered = searchTerm
    ? attendees.filter((a) => (a.familyName || "").toLowerCase().includes(searchTerm))
    : attendees;

  const t = attendeeTotals(attendees);
  $("#attFamilies").textContent = t.families;
  $("#attAdults").textContent = t.adults;
  $("#attKids512").textContent = t.kids512;
  $("#attKidsU5").textContent = t.kidsU5;
  $("#attTotal").textContent = t.total;

  const body = $("#attendeeTableBody");
  if (!filtered.length) {
    body.innerHTML = `<tr class="empty-row"><td colspan="9">${searchTerm ? "No matches." : "No attendees yet. Add the first family above!"}</td></tr>`;
    return;
  }
  const rsvpBadge = (r) => {
    if (r === "Confirmed") return `<span class="badge badge-purchased">Confirmed</span>`;
    if (r === "Maybe") return `<span class="badge badge-planned">Maybe</span>`;
    return `<span class="muted">Invited</span>`;
  };
  body.innerHTML = filtered
    .map((a) => {
      const total = (Number(a.adults) || 0) + (Number(a.kids512) || 0) + (Number(a.kidsU5) || 0);
      return `<tr>
        <td><strong>${escapeHtml(a.familyName)}</strong></td>
        <td>${a.adults || 0}</td>
        <td>${a.kids512 || 0}</td>
        <td>${a.kidsU5 || 0}</td>
        <td><strong>${total}</strong></td>
        <td>${rsvpBadge(a.rsvp)}</td>
        <td class="muted">${escapeHtml(a.notes || "")}</td>
        <td class="muted">${escapeHtml(a.addedBy || "")}</td>
        <td class="row-actions">
          <button class="icon-action" data-edit="${a.id}" title="Edit">✏️</button>
          <button class="icon-action" data-del="${a.id}" title="Delete">🗑️</button>
        </td>
      </tr>`;
    })
    .join("");

  $$("[data-edit]", body).forEach((btn) =>
    btn.addEventListener("click", () => openAttendeeModal(attendees.find((a) => a.id === btn.dataset.edit)))
  );
  $$("[data-del]", body).forEach((btn) =>
    btn.addEventListener("click", () => confirmDeleteAttendee(btn.dataset.del))
  );
}

function openAttendeeModal(existing) {
  const isEdit = !!existing;
  openModal(
    `
    <h3>${isEdit ? "✏️ Edit" : "➕ Add"} family / person</h3>
    <label class="field-label">Family or person name</label>
    <input class="input" id="fAttName" value="${escapeHtml(existing?.familyName || "")}" placeholder="e.g. The Sharmas" />
    <div class="field-row">
      <div><label class="field-label">Adults</label><input class="input" id="fAttAdults" type="number" min="0" value="${existing?.adults ?? 1}" /></div>
      <div><label class="field-label">Kids 5–12</label><input class="input" id="fAttKids512" type="number" min="0" value="${existing?.kids512 ?? 0}" /></div>
    </div>
    <div class="field-row">
      <div><label class="field-label">Kids under 5</label><input class="input" id="fAttKidsU5" type="number" min="0" value="${existing?.kidsU5 ?? 0}" /></div>
      <div><label class="field-label">RSVP</label>
        <select class="input" id="fAttRsvp">
          ${["Confirmed", "Maybe", "Invited"].map((r) => `<option ${existing?.rsvp === r ? "selected" : ""}>${r}</option>`).join("")}
        </select>
      </div>
    </div>
    <label class="field-label">Notes (dietary, allergies, etc.)</label>
    <input class="input" id="fAttNotes" value="${escapeHtml(existing?.notes || "")}" placeholder="e.g. vegetarian, nut allergy" />
    <div class="modal-actions">
      <button class="btn btn-ghost" id="attCancel">Cancel</button>
      <button class="btn btn-primary" id="attSave">${isEdit ? "Save changes" : "Add"}</button>
    </div>
  `,
    {
      onMount: (root) => {
        $("#fAttName", root).focus();
        $("#attCancel", root).addEventListener("click", closeModal);
        $("#attSave", root).addEventListener("click", async () => {
          const familyName = $("#fAttName", root).value.trim();
          if (!familyName) return showToast("Please enter a name");
          const data = {
            familyName,
            adults: parseInt($("#fAttAdults", root).value, 10) || 0,
            kids512: parseInt($("#fAttKids512", root).value, 10) || 0,
            kidsU5: parseInt($("#fAttKidsU5", root).value, 10) || 0,
            rsvp: $("#fAttRsvp", root).value,
            notes: $("#fAttNotes", root).value.trim(),
          };
          try {
            if (isEdit) {
              await updateDoc(doc(db, "attendees", existing.id), data);
            } else {
              data.addedBy = getMyName();
              data.createdAt = serverTimestamp();
              await addDoc(collection(db, "attendees"), data);
            }
            closeModal();
            showToast(isEdit ? "Updated" : "Added!");
          } catch (err) {
            console.error(err);
            showToast("Couldn't save — check your connection");
          }
        });
      },
    }
  );
}

function confirmDeleteAttendee(id) {
  const a = attendees.find((x) => x.id === id);
  if (!a) return;
  if (!window.confirm(`Remove "${a.familyName}" from the attendee list?`)) return;
  deleteDoc(doc(db, "attendees", id)).then(() => showToast("Removed")).catch((err) => {
    console.error(err);
    showToast("Couldn't remove — check your connection");
  });
}

function exportAttendeesCsv() {
  const rows = [["Family/Person", "Adults", "Kids 5-12", "Kids under 5", "Total", "RSVP", "Notes", "Added by"]];
  attendees.forEach((a) => {
    rows.push([
      a.familyName,
      a.adults || 0,
      a.kids512 || 0,
      a.kidsU5 || 0,
      (a.adults || 0) + (a.kids512 || 0) + (a.kidsU5 || 0),
      a.rsvp || "",
      a.notes || "",
      a.addedBy || "",
    ]);
  });
  downloadCsv(rows, "attendees.csv");
}

function downloadCsv(rows, filename) {
  const csv = rows
    .map((r) => r.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// =============================================================================
// BUDGET
// =============================================================================
const BUDGET_CATEGORIES = [
  "Catering & Food",
  "Water & Beverages",
  "Disposables & Supplies",
  "Decorations",
  "Venue & Logistics",
  "Games & Prizes",
  "Photography & Printing",
  "Miscellaneous",
];
const CATEGORY_ICONS = {
  "Catering & Food": "🍛",
  "Water & Beverages": "💧",
  "Disposables & Supplies": "🍽️",
  Decorations: "🎈",
  "Venue & Logistics": "🏛️",
  "Games & Prizes": "🏆",
  "Photography & Printing": "📷",
  Miscellaneous: "📦",
};

let budgetItems = [];

function initBudget() {
  const filterSel = $("#budgetCategoryFilter");
  BUDGET_CATEGORIES.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = `${CATEGORY_ICONS[c] || ""} ${c}`;
    filterSel.appendChild(opt);
  });
  filterSel.addEventListener("change", renderBudget);

  const ref = query(collection(db, "budgetItems"), orderBy("createdAt", "asc"));
  onSnapshot(
    ref,
    (snap) => {
      budgetItems = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderBudget();
      renderDashboard();
    },
    (err) => {
      console.error("budget listener:", err);
      showToast("Couldn't load budget — check Firestore rules");
    }
  );

  $("#addBudgetBtn").addEventListener("click", () => openBudgetModal());
  $("#exportBudgetBtn").addEventListener("click", exportBudgetCsv);
}

function budgetGrandTotal(list = budgetItems) {
  return list.reduce((sum, b) => sum + (Number(b.quantity) || 0) * (Number(b.unitPrice) || 0), 0);
}

function renderBudget() {
  const filterCat = $("#budgetCategoryFilter").value;
  const filtered = filterCat ? budgetItems.filter((b) => b.category === filterCat) : budgetItems;

  const grand = budgetGrandTotal(budgetItems);
  $("#budgetGrandTotal").textContent = fmtMoney(grand);
  $("#budgetItemCount").textContent = budgetItems.length;
  const t = attendeeTotals();
  $("#budgetPerAdult").textContent = t.adults > 0 ? fmtMoney(grand / t.adults) : "—";
  $("#budgetPerPerson").textContent = t.total > 0 ? fmtMoney(grand / t.total) : "—";

  // Category breakdown
  const byCat = {};
  budgetItems.forEach((b) => {
    const cat = b.category || "Miscellaneous";
    byCat[cat] = (byCat[cat] || 0) + (Number(b.quantity) || 0) * (Number(b.unitPrice) || 0);
  });
  const breakdownEl = $("#categoryBreakdown");
  const catEntries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  if (!catEntries.length) {
    breakdownEl.innerHTML = `<p class="muted">Add expenses to see the breakdown.</p>`;
  } else {
    const max = Math.max(...catEntries.map((e) => e[1]), 1);
    breakdownEl.innerHTML = catEntries
      .map(
        ([cat, amt]) => `
      <div class="category-row">
        <span class="cat-name">${CATEGORY_ICONS[cat] || "📦"} ${escapeHtml(cat)}</span>
        <span class="cat-bar-track"><span class="cat-bar-fill" style="width:${(amt / max) * 100}%"></span></span>
        <span class="cat-amount">${fmtMoney(amt)}</span>
      </div>`
      )
      .join("");
  }

  const body = $("#budgetTableBody");
  if (!filtered.length) {
    body.innerHTML = `<tr class="empty-row"><td colspan="8">No expenses yet. Add plates, catering, water, decorations…</td></tr>`;
    return;
  }
  body.innerHTML = filtered
    .map((b) => {
      const total = (Number(b.quantity) || 0) * (Number(b.unitPrice) || 0);
      const statusBadge =
        b.status === "Purchased" ? `<span class="badge badge-purchased">Purchased</span>` : `<span class="badge badge-planned">Planned</span>`;
      return `<tr>
        <td><strong>${escapeHtml(b.itemName)}</strong></td>
        <td>${CATEGORY_ICONS[b.category] || "📦"} ${escapeHtml(b.category || "")}</td>
        <td>${b.quantity || 0}</td>
        <td>${fmtMoney(b.unitPrice || 0)}</td>
        <td><strong>${fmtMoney(total)}</strong></td>
        <td>${statusBadge}</td>
        <td class="muted">${escapeHtml(b.addedBy || "")}</td>
        <td class="row-actions">
          <button class="icon-action" data-edit="${b.id}" title="Edit">✏️</button>
          <button class="icon-action" data-del="${b.id}" title="Delete">🗑️</button>
        </td>
      </tr>`;
    })
    .join("");

  $$("[data-edit]", body).forEach((btn) =>
    btn.addEventListener("click", () => openBudgetModal(budgetItems.find((b) => b.id === btn.dataset.edit)))
  );
  $$("[data-del]", body).forEach((btn) => btn.addEventListener("click", () => confirmDeleteBudget(btn.dataset.del)));
}

function openBudgetModal(existing) {
  const isEdit = !!existing;
  openModal(
    `
    <h3>${isEdit ? "✏️ Edit" : "➕ Add"} expense</h3>
    <label class="field-label">Item</label>
    <input class="input" id="fBItem" value="${escapeHtml(existing?.itemName || "")}" placeholder="e.g. Paper plates (large)" />
    <label class="field-label">Category</label>
    <select class="input" id="fBCat">
      ${BUDGET_CATEGORIES.map((c) => `<option ${existing?.category === c ? "selected" : ""}>${c}</option>`).join("")}
    </select>
    <div class="field-row">
      <div><label class="field-label">Quantity</label><input class="input" id="fBQty" type="number" min="0" step="1" value="${existing?.quantity ?? 1}" /></div>
      <div><label class="field-label">Unit price</label><input class="input" id="fBPrice" type="number" min="0" step="0.01" value="${existing?.unitPrice ?? ""}" placeholder="0.00" /></div>
    </div>
    <label class="field-label">Status</label>
    <select class="input" id="fBStatus">
      ${["Planned", "Purchased"].map((s) => `<option ${existing?.status === s ? "selected" : ""}>${s}</option>`).join("")}
    </select>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="bCancel">Cancel</button>
      <button class="btn btn-primary" id="bSave">${isEdit ? "Save changes" : "Add"}</button>
    </div>
  `,
    {
      onMount: (root) => {
        $("#fBItem", root).focus();
        $("#bCancel", root).addEventListener("click", closeModal);
        $("#bSave", root).addEventListener("click", async () => {
          const itemName = $("#fBItem", root).value.trim();
          if (!itemName) return showToast("Please enter an item name");
          const data = {
            itemName,
            category: $("#fBCat", root).value,
            quantity: parseFloat($("#fBQty", root).value) || 0,
            unitPrice: parseFloat($("#fBPrice", root).value) || 0,
            status: $("#fBStatus", root).value,
          };
          try {
            if (isEdit) {
              await updateDoc(doc(db, "budgetItems", existing.id), data);
            } else {
              data.addedBy = getMyName();
              data.createdAt = serverTimestamp();
              await addDoc(collection(db, "budgetItems"), data);
            }
            closeModal();
            showToast(isEdit ? "Updated" : "Added!");
          } catch (err) {
            console.error(err);
            showToast("Couldn't save — check your connection");
          }
        });
      },
    }
  );
}

function confirmDeleteBudget(id) {
  const b = budgetItems.find((x) => x.id === id);
  if (!b) return;
  if (!window.confirm(`Remove "${b.itemName}"?`)) return;
  deleteDoc(doc(db, "budgetItems", id)).then(() => showToast("Removed")).catch((err) => {
    console.error(err);
    showToast("Couldn't remove — check your connection");
  });
}

function exportBudgetCsv() {
  const rows = [["Item", "Category", "Quantity", "Unit price", "Total", "Status", "Added by"]];
  budgetItems.forEach((b) => {
    rows.push([b.itemName, b.category, b.quantity, b.unitPrice, (b.quantity || 0) * (b.unitPrice || 0), b.status, b.addedBy || ""]);
  });
  downloadCsv(rows, "budget.csv");
}

// =============================================================================
// PHOTOS
// =============================================================================
let photos = [];

function initPhotos() {
  const ref = query(collection(db, "photos"), orderBy("createdAt", "asc"));
  onSnapshot(
    ref,
    (snap) => {
      photos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderPhotos();
      renderDashboard();
    },
    (err) => {
      console.error("photos listener:", err);
      showToast("Couldn't load photos — check Firestore rules");
    }
  );

  $("#photoInput").addEventListener("change", (e) => handlePhotoUpload(e.target.files));
  $("#slideshowBtn").addEventListener("click", () => openSlideshow(0));
  $("#downloadAllBtn").addEventListener("click", downloadAllPhotosZip);
}

function renderPhotos() {
  const grid = $("#photoGrid");
  const empty = $("#photoEmptyMsg");
  if (!photos.length) {
    grid.innerHTML = "";
    grid.appendChild(empty);
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  grid.innerHTML = photos
    .map(
      (p, i) => `
    <div class="photo-tile" data-index="${i}">
      <img src="${p.downloadURL}" alt="${escapeHtml(p.caption || "Event photo")}" loading="lazy" />
      <button class="photo-delete" data-del="${p.id}" title="Delete">✕</button>
      <div class="photo-meta">${escapeHtml(p.uploadedBy || "")}</div>
    </div>`
    )
    .join("");

  $$(".photo-tile", grid).forEach((tile) => {
    tile.addEventListener("click", (e) => {
      if (e.target.closest("[data-del]")) return;
      openSlideshow(parseInt(tile.dataset.index, 10));
    });
  });
  $$("[data-del]", grid).forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      confirmDeletePhoto(btn.dataset.del);
    })
  );
}

async function handlePhotoUpload(fileList) {
  const files = Array.from(fileList || []).filter((f) => f.type.startsWith("image/"));
  if (!files.length) return;
  const uploaderName = getMyName();

  const wrap = $("#uploadProgressWrap");
  const fill = $("#uploadProgressFill");
  const label = $("#uploadProgressLabel");
  wrap.classList.remove("hidden");

  const totals = files.map((f) => f.size);
  const transferred = files.map(() => 0);
  const totalBytes = totals.reduce((a, b) => a + b, 0) || 1;

  let doneCount = 0;
  const updateProgress = () => {
    const sum = transferred.reduce((a, b) => a + b, 0);
    const pct = Math.round((sum / totalBytes) * 100);
    fill.style.width = pct + "%";
    label.textContent = `Uploading ${doneCount}/${files.length} (${pct}%)`;
  };

  await Promise.all(
    files.map(
      (file, i) =>
        new Promise((resolve) => {
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const path = `photos/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;
          const task = uploadBytesResumable(storageRef(storage, path), file, { contentType: file.type });
          task.on(
            "state_changed",
            (snap) => {
              transferred[i] = snap.bytesTransferred;
              updateProgress();
            },
            (err) => {
              console.error("upload failed:", err);
              showToast(`Couldn't upload ${file.name}`);
              resolve();
            },
            async () => {
              try {
                const downloadURL = await getDownloadURL(task.snapshot.ref);
                await addDoc(collection(db, "photos"), {
                  storagePath: path,
                  downloadURL,
                  uploadedBy: uploaderName,
                  caption: "",
                  sizeBytes: file.size,
                  contentType: file.type,
                  createdAt: serverTimestamp(),
                });
              } catch (err) {
                console.error(err);
                showToast(`Couldn't save ${file.name}`);
              }
              doneCount++;
              updateProgress();
              resolve();
            }
          );
        })
    )
  );

  setTimeout(() => wrap.classList.add("hidden"), 800);
  $("#photoInput").value = "";
  showToast(`Uploaded ${doneCount} photo${doneCount === 1 ? "" : "s"}!`);
}

function confirmDeletePhoto(id) {
  const p = photos.find((x) => x.id === id);
  if (!p) return;
  if (!window.confirm("Delete this photo for everyone?")) return;
  deleteDoc(doc(db, "photos", id))
    .then(() => deleteObject(storageRef(storage, p.storagePath)).catch(() => {}))
    .then(() => showToast("Photo deleted"))
    .catch((err) => {
      console.error(err);
      showToast("Couldn't delete — check your connection");
    });
}

async function downloadAllPhotosZip() {
  if (!photos.length) return showToast("No photos to download yet");
  if (typeof JSZip === "undefined") return showToast("Still loading zip tool — try again in a moment");
  showToast("Preparing ZIP — this can take a bit for lots of photos…", 5000);
  try {
    const zip = new JSZip();
    let i = 0;
    for (const p of photos) {
      i++;
      const res = await fetch(p.downloadURL);
      const blob = await res.blob();
      const ext = (p.contentType || "image/jpeg").split("/")[1] || "jpg";
      zip.file(`photo_${String(i).padStart(3, "0")}.${ext}`, blob);
    }
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(eventInfo.eventName || "event").replace(/[^a-z0-9]+/gi, "_")}_photos.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("Download ready!");
  } catch (err) {
    console.error(err);
    showToast("Couldn't build the ZIP — try again");
  }
}

// ---------- Slideshow lightbox ----------
let slideshowIndex = 0;
let slideshowTimer = null;
let slideshowPlaying = true;

function openSlideshow(startIndex) {
  if (!photos.length) return showToast("No photos yet");
  slideshowIndex = startIndex;
  $("#slideshowOverlay").classList.remove("hidden");
  renderSlide();
  startSlideshowTimer();
}
function closeSlideshow() {
  $("#slideshowOverlay").classList.add("hidden");
  stopSlideshowTimer();
}
function renderSlide() {
  const p = photos[slideshowIndex];
  if (!p) return;
  $("#slideshowImg").src = p.downloadURL;
  $("#slideshowCaption").textContent = `${p.uploadedBy ? "📤 " + p.uploadedBy : ""}  ·  ${slideshowIndex + 1} / ${photos.length}`;
}
function nextSlide() {
  slideshowIndex = (slideshowIndex + 1) % photos.length;
  renderSlide();
}
function prevSlide() {
  slideshowIndex = (slideshowIndex - 1 + photos.length) % photos.length;
  renderSlide();
}
function startSlideshowTimer() {
  stopSlideshowTimer();
  slideshowPlaying = true;
  $("#slideshowPlayBtn").textContent = "⏸️ Pause";
  slideshowTimer = setInterval(nextSlide, 4000);
}
function stopSlideshowTimer() {
  clearInterval(slideshowTimer);
  slideshowTimer = null;
}
$("#slideshowCloseBtn").addEventListener("click", closeSlideshow);
$("#slideshowNextBtn").addEventListener("click", () => {
  nextSlide();
  if (slideshowPlaying) startSlideshowTimer();
});
$("#slideshowPrevBtn").addEventListener("click", () => {
  prevSlide();
  if (slideshowPlaying) startSlideshowTimer();
});
$("#slideshowPlayBtn").addEventListener("click", () => {
  if (slideshowPlaying) {
    stopSlideshowTimer();
    slideshowPlaying = false;
    $("#slideshowPlayBtn").textContent = "▶️ Play";
  } else {
    startSlideshowTimer();
  }
});
document.addEventListener("keydown", (e) => {
  if ($("#slideshowOverlay").classList.contains("hidden")) return;
  if (e.key === "Escape") closeSlideshow();
  if (e.key === "ArrowRight") { nextSlide(); if (slideshowPlaying) startSlideshowTimer(); }
  if (e.key === "ArrowLeft") { prevSlide(); if (slideshowPlaying) startSlideshowTimer(); }
});

// =============================================================================
// GAMES
// =============================================================================
const SEED_GAMES = [
  { name: "Antakshari (Bollywood Edition)", category: "Dance/Music", ageGroup: "All ages", groupSize: "2 teams", duration: "20–40 min", props: "None — just enthusiasm!", desc: "Classic song-chain game — keep the music going using the last letter of the previous song." },
  { name: "Dumb Charades (Bollywood Movies)", category: "Indoor/Table", ageGroup: "All ages", groupSize: "6+", duration: "30 min", props: "Chits with movie names", desc: "Act out movie titles without speaking while your team guesses." },
  { name: "Tambola / Housie", category: "Indoor/Table", ageGroup: "All ages", groupSize: "8+", duration: "30–45 min", props: "Tambola tickets, numbered balls or an app, small prizes", desc: "Everyone's favourite bingo-style game — great for mixing kids, parents and grandparents." },
  { name: "Musical Chairs", category: "Active/Outdoor", ageGroup: "Kids & adults", groupSize: "6+", duration: "15–20 min", props: "Chairs, music", desc: "One fewer chair than players — classic elimination fun." },
  { name: "Passing the Parcel", category: "Icebreaker", ageGroup: "Kids", groupSize: "8+", duration: "15 min", props: "Wrapped parcel with layers, music", desc: "Add a fun forfeit or mini-prize in every layer for extra excitement." },
  { name: "Lemon & Spoon Race", category: "Active/Outdoor", ageGroup: "All ages", groupSize: "Any", duration: "15 min", props: "Spoons, lemons or limes", desc: "A family favourite relay race — hilarious with adults too." },
  { name: "Three-Legged Race", category: "Active/Outdoor", ageGroup: "Kids & adults", groupSize: "Even numbers", duration: "15 min", props: "Scarves or fabric strips to tie legs", desc: "Pair up and race — pair siblings or cousins for extra laughs." },
  { name: "Tug of War", category: "Active/Outdoor", ageGroup: "All ages", groupSize: "10+", duration: "10–15 min", props: "A sturdy rope", desc: "Split into two teams for a classic energy-burner before food." },
  { name: "Balloon Stomp", category: "Active/Outdoor", ageGroup: "Kids", groupSize: "6+", duration: "15 min", props: "Balloons, string", desc: "Tie a balloon to each ankle — last one with an unpopped balloon wins." },
  { name: "Treasure Hunt", category: "Icebreaker", ageGroup: "All ages", groupSize: "Any", duration: "30–60 min", props: "Clue cards, small prizes", desc: "Hide clues around the venue leading to a final treasure — great for mixed-age teams." },
  { name: "Family Quiz Night", category: "Indoor/Table", ageGroup: "All ages", groupSize: "Teams of 4–6", duration: "30 min", props: "Quiz questions, a bell or buzzer", desc: "Mix Bollywood, cricket, general knowledge and family in-jokes." },
  { name: "\"Mr & Mrs\" Couple Quiz", category: "Indoor/Table", ageGroup: "Adults", groupSize: "Couples", duration: "20–30 min", props: "Prepared questions about each couple", desc: "How well do couples really know each other? A guaranteed laugh riot." },
  { name: "Rangoli Competition", category: "Cultural", ageGroup: "All ages", groupSize: "Teams or individuals", duration: "30–45 min", props: "Rangoli colours/petals, chalk", desc: "Friendly competition to design the best rangoli — let the kids judge!" },
  { name: "Mehendi Corner", category: "Cultural", ageGroup: "All ages", groupSize: "Walk-in", duration: "Ongoing", props: "Henna cones", desc: "Set up a casual mehendi station for anyone who wants a design." },
  { name: "Dandiya / Garba Session", category: "Dance/Music", ageGroup: "All ages", groupSize: "Any", duration: "30–45 min", props: "Dandiya sticks, a playlist", desc: "A high-energy dance session — perfect if the season fits!" },
  { name: "Bollywood Dance-Off / Karaoke", category: "Dance/Music", ageGroup: "All ages", groupSize: "Any", duration: "30–60 min", props: "Speaker, playlist or karaoke app", desc: "Open floor for anyone to perform — kids often steal the show." },
  { name: "Fancy Dress / Best Dressed Kids", category: "Kids", ageGroup: "Kids", groupSize: "Any", duration: "20 min", props: "Costumes (bring from home)", desc: "A cute mini ramp-walk — pick a theme in advance." },
  { name: "Drawing & Colouring Corner", category: "Kids", ageGroup: "Kids", groupSize: "Any", duration: "Ongoing", props: "Paper, crayons or colours", desc: "A quiet corner to keep younger kids happily occupied." },
  { name: "Simplified Housie for Kids", category: "Kids", ageGroup: "Kids", groupSize: "6+", duration: "15 min", props: "Simple number cards", desc: "An easier version of tambola sized for the younger ones." },
  { name: "Card Games Corner (Rummy / UNO)", category: "Indoor/Table", ageGroup: "Adults", groupSize: "4–6 per table", duration: "Ongoing", props: "Card decks", desc: "A relaxed table for anyone who'd rather sit, chat and play." },
  { name: "Human Knot", category: "Icebreaker", ageGroup: "All ages", groupSize: "8–15", duration: "10–15 min", props: "None", desc: "A great mixer game to get everyone talking and laughing early on." },
  { name: "Cricket / Backyard Sports", category: "Active/Outdoor", ageGroup: "All ages", groupSize: "Any", duration: "Flexible", props: "Bat, ball, stumps", desc: "If the venue has space, an informal match is always a hit." },
];

let games = [];

function initGames() {
  const ref = query(collection(db, "games"), orderBy("createdAt", "asc"));
  onSnapshot(
    ref,
    async (snap) => {
      games = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (games.length === 0) {
        await seedGamesIfEmpty();
        return; // the listener will fire again once seeding completes
      }
      renderGames();
    },
    (err) => {
      console.error("games listener:", err);
      showToast("Couldn't load games — check Firestore rules");
    }
  );

  $("#addGameBtn").addEventListener("click", () => openGameModal());
  $("#surpriseBtn").addEventListener("click", surpriseGame);
  $$("#gameFilterChips .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      $$("#gameFilterChips .chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      renderGames();
    });
  });
}

let seeding = false;
async function seedGamesIfEmpty() {
  if (seeding) return;
  // Double-check right before writing to reduce (not eliminate) the chance
  // two committee members seed at the same moment.
  const snap = await getDocs(collection(db, "games"));
  if (!snap.empty) return;
  seeding = true;
  try {
    const batch = writeBatch(db);
    SEED_GAMES.forEach((g) => {
      const ref = doc(collection(db, "games"));
      batch.set(ref, { ...g, selected: false, isSeed: true, addedBy: "", createdAt: serverTimestamp() });
    });
    await batch.commit();
  } catch (err) {
    console.error("seeding games failed:", err);
  } finally {
    seeding = false;
  }
}

function activeFilter() {
  const active = $("#gameFilterChips .chip.active");
  return active ? active.dataset.filter : "all";
}

function renderGames() {
  const filter = activeFilter();
  let list = games;
  if (filter === "selected") list = games.filter((g) => g.selected);
  else if (filter !== "all") list = games.filter((g) => g.category === filter);

  const listEl = $("#gameList");
  if (!list.length) {
    listEl.innerHTML = `<p class="muted empty-row">No games in this filter yet.</p>`;
    return;
  }
  listEl.innerHTML = list
    .map(
      (g) => `
    <div class="game-card ${g.selected ? "selected" : ""}" data-id="${g.id}">
      <div class="game-card-head">
        <div>
          <span class="game-cat-tag">${escapeHtml(g.category || "")}</span>
          <h4>${escapeHtml(g.name)}</h4>
        </div>
        <button class="game-star" data-star="${g.id}" title="${g.selected ? "Remove from lineup" : "Add to lineup"}">${g.selected ? "⭐" : "☆"}</button>
      </div>
      <p class="game-desc">${escapeHtml(g.desc || "")}</p>
      <div class="game-meta">
        <span>👥 ${escapeHtml(g.groupSize || "Any")}</span>
        <span>⏱️ ${escapeHtml(g.duration || "")}</span>
        <span>🎒 ${escapeHtml(g.props || "None")}</span>
      </div>
      <div class="game-card-foot">
        <span class="muted" style="font-size:0.72rem">${g.isSeed ? "Suggested" : "Added by " + escapeHtml(g.addedBy || "committee")}</span>
        ${g.isSeed ? "" : `<button class="icon-action" data-del="${g.id}" title="Remove">🗑️</button>`}
      </div>
    </div>`
    )
    .join("");

  $$("[data-star]", listEl).forEach((btn) =>
    btn.addEventListener("click", () => toggleGameSelected(btn.dataset.star))
  );
  $$("[data-del]", listEl).forEach((btn) =>
    btn.addEventListener("click", () => {
      if (window.confirm("Remove this game suggestion?")) {
        deleteDoc(doc(db, "games", btn.dataset.del)).catch((err) => console.error(err));
      }
    })
  );
}

function toggleGameSelected(id) {
  const g = games.find((x) => x.id === id);
  if (!g) return;
  updateDoc(doc(db, "games", id), { selected: !g.selected }).catch((err) => {
    console.error(err);
    showToast("Couldn't update — check your connection");
  });
}

function openGameModal() {
  const categories = ["Icebreaker", "Active/Outdoor", "Indoor/Table", "Kids", "Dance/Music", "Cultural"];
  openModal(
    `
    <h3>➕ Add your own game</h3>
    <label class="field-label">Game name</label>
    <input class="input" id="fGName" placeholder="e.g. Bollywood Trivia" />
    <label class="field-label">Category</label>
    <select class="input" id="fGCat">${categories.map((c) => `<option>${c}</option>`).join("")}</select>
    <div class="field-row">
      <div><label class="field-label">Age group</label><input class="input" id="fGAge" placeholder="e.g. All ages" /></div>
      <div><label class="field-label">Group size</label><input class="input" id="fGGroup" placeholder="e.g. 6+" /></div>
    </div>
    <div class="field-row">
      <div><label class="field-label">Duration</label><input class="input" id="fGDuration" placeholder="e.g. 20 min" /></div>
      <div><label class="field-label">Props needed</label><input class="input" id="fGProps" placeholder="e.g. None" /></div>
    </div>
    <label class="field-label">Description</label>
    <textarea class="input" id="fGDesc" rows="3" placeholder="How do you play?"></textarea>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="gCancel">Cancel</button>
      <button class="btn btn-primary" id="gSave">Add game</button>
    </div>
  `,
    {
      onMount: (root) => {
        $("#fGName", root).focus();
        $("#gCancel", root).addEventListener("click", closeModal);
        $("#gSave", root).addEventListener("click", async () => {
          const name = $("#fGName", root).value.trim();
          if (!name) return showToast("Please enter a game name");
          try {
            await addDoc(collection(db, "games"), {
              name,
              category: $("#fGCat", root).value,
              ageGroup: $("#fGAge", root).value.trim() || "All ages",
              groupSize: $("#fGGroup", root).value.trim() || "Any",
              duration: $("#fGDuration", root).value.trim() || "",
              props: $("#fGProps", root).value.trim() || "None",
              desc: $("#fGDesc", root).value.trim(),
              selected: true,
              isSeed: false,
              addedBy: getMyName(),
              createdAt: serverTimestamp(),
            });
            closeModal();
            showToast("Game added to your lineup!");
          } catch (err) {
            console.error(err);
            showToast("Couldn't save — check your connection");
          }
        });
      },
    }
  );
}

function surpriseGame() {
  const pool = games.filter((g) => g.selected).length ? games.filter((g) => g.selected) : games;
  if (!pool.length) return showToast("No games loaded yet");
  const pick = pool[Math.floor(Math.random() * pool.length)];
  openModal(
    `
    <h3>🎲 Let's play…</h3>
    <div class="game-card" style="box-shadow:none;border:none;padding:0">
      <span class="game-cat-tag">${escapeHtml(pick.category || "")}</span>
      <h4 style="font-size:1.3rem">${escapeHtml(pick.name)}</h4>
      <p class="game-desc">${escapeHtml(pick.desc || "")}</p>
      <div class="game-meta">
        <span>👥 ${escapeHtml(pick.groupSize || "Any")}</span>
        <span>⏱️ ${escapeHtml(pick.duration || "")}</span>
        <span>🎒 ${escapeHtml(pick.props || "None")}</span>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="surpriseAgain">🎲 Roll again</button>
      <button class="btn btn-primary" id="surpriseClose">Let's go!</button>
    </div>
  `,
    {
      onMount: (root) => {
        $("#surpriseClose", root).addEventListener("click", closeModal);
        $("#surpriseAgain", root).addEventListener("click", () => {
          closeModal();
          surpriseGame();
        });
      },
    }
  );
}

// =============================================================================
// PWA service worker
// =============================================================================
function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

// -----------------------------------------------------------------------------
boot();
