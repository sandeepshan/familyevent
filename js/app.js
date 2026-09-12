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
  query, orderBy, serverTimestamp, getDocs, writeBatch, setDoc, arrayUnion, arrayRemove;
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
      query, orderBy, serverTimestamp, getDocs, writeBatch, setDoc, arrayUnion, arrayRemove } = fsMod);
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
  initSchedule();
  initPhotos();
  initGames();
  initWishlist();
  initGuestbook();
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
let eventInfo = {
  eventName: "Family Get-Together",
  eventDate: "2026-10-09",
  eventStartTime: "18:00",
  eventEndTime: "22:00",
  venue: "Club Alamora, Tarneit",
  budgetTarget: 0,
  currencySymbol: "$",
  categoryCaps: {},
};

function initSettings() {
  const ref = doc(db, "settings", "eventInfo");
  onSnapshot(
    ref,
    (snap) => {
      if (snap.exists()) eventInfo = { ...eventInfo, ...snap.data() };
      renderEventHeader();
      renderDashboard();
      renderBudget();
      renderSchedule();
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
    <div class="field-row">
      <div>
        <label class="field-label">Start time</label>
        <input class="input" id="setEventStart" type="time" value="${escapeHtml(eventInfo.eventStartTime || "")}" />
      </div>
      <div>
        <label class="field-label">End time</label>
        <input class="input" id="setEventEnd" type="time" value="${escapeHtml(eventInfo.eventEndTime || "")}" />
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
            eventStartTime: $("#setEventStart", root).value || "",
            eventEndTime: $("#setEventEnd", root).value || "",
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
function eventStartDateTime() {
  if (!eventInfo.eventDate) return null;
  const time = eventInfo.eventStartTime || "00:00";
  const d = new Date(`${eventInfo.eventDate}T${time}:00`);
  return isNaN(d) ? null : d;
}
function eventEndDateTime() {
  if (!eventInfo.eventDate) return null;
  const time = eventInfo.eventEndTime || "23:59";
  const d = new Date(`${eventInfo.eventDate}T${time}:00`);
  return isNaN(d) ? null : d;
}
function fmtTime12(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  if (isNaN(h)) return "";
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}
function eventTimeRangeLabel() {
  if (!eventInfo.eventStartTime) return "";
  return `${fmtTime12(eventInfo.eventStartTime)}${eventInfo.eventEndTime ? " – " + fmtTime12(eventInfo.eventEndTime) : ""}`;
}

function renderHero() {
  $("#heroEventName").textContent = eventInfo.eventName || "Family Get-Together";
  const start = eventStartDateTime();
  if (start) {
    const dateStr = start.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    const timeStr = eventTimeRangeLabel();
    $("#heroDateTime").textContent = `📅 ${dateStr}${timeStr ? " · " + timeStr : ""}`;
  } else {
    $("#heroDateTime").textContent = "📅 Set your date in ⚙️ settings";
  }
  $("#heroVenue").textContent = eventInfo.venue ? `📍 ${eventInfo.venue}` : "📍 Add a venue";

  if (start) {
    const now = new Date();
    const end = eventEndDateTime();
    const diffDays = Math.ceil((new Date(eventInfo.eventDate + "T00:00:00") - new Date(new Date().toDateString())) / 86400000);
    if (end && now >= start && now <= end) {
      $("#heroCountdownNum").textContent = "🎉";
      $("#heroCountdownLabel").textContent = "Happening right now!";
    } else if (end && now > end) {
      $("#heroCountdownNum").textContent = "✅";
      $("#heroCountdownLabel").textContent = "What a get-together!";
    } else if (diffDays > 1) {
      $("#heroCountdownNum").textContent = diffDays;
      $("#heroCountdownLabel").textContent = "days to go";
    } else if (diffDays === 1) {
      $("#heroCountdownNum").textContent = "1";
      $("#heroCountdownLabel").textContent = "sleep to go!";
    } else {
      $("#heroCountdownNum").textContent = "🎉";
      $("#heroCountdownLabel").textContent = "Today's the day!";
    }
  } else {
    $("#heroCountdownNum").textContent = "—";
    $("#heroCountdownLabel").textContent = "days to go";
  }
}

function renderDashboard() {
  renderHero();
  $("#statPrograms").textContent = scheduleItems.length;

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
  scheduleItems.forEach((s) => items.push({ ts: s.createdAt, text: `🗓️ ${s.addedBy || "Someone"} added <b>${escapeHtml(s.title)}</b> to the schedule` }));
  (wishlistItems || []).forEach((w) => items.push({ ts: w.createdAt, text: `🧺 ${w.addedBy || "Someone"} added <b>${escapeHtml(w.text)}</b> to bring` }));
  (guestbookMessages || []).forEach((g) => items.push({ ts: g.createdAt, text: `💌 ${g.addedBy || "Someone"} left a message` }));
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
      renderBudget();
    },
    (err) => {
      console.error("attendees listener:", err);
      showToast("Couldn't load attendees — check Firestore rules");
    }
  );

  $("#addAttendeeBtn").addEventListener("click", () => openAttendeeModal());
  $("#attendeeSearch").addEventListener("input", renderAttendees);
  $("#exportAttendeesBtn").addEventListener("click", exportAttendeesCsv);
  $("#confirmedOnlyToggle").addEventListener("change", () => {
    renderAttendees();
    renderBudget();
  });
}

function confirmedOnly() {
  return $("#confirmedOnlyToggle").checked;
}

// Catering headcount: adults count as a full head, kids 5-12 as half
// (smaller portions), kids under 5 are free (don't move the needle on
// catering quantities). Used to divide catering/budget costs fairly.
function cateringWeight(a) {
  return (Number(a.adults) || 0) * 1 + (Number(a.kids512) || 0) * 0.5 + (Number(a.kidsU5) || 0) * 0;
}

// Trim to at most 1 decimal place, dropping a trailing ".0".
function formatWeight(n) {
  return (Math.round(n * 10) / 10).toString();
}

function attendeeTotals(list = attendees) {
  return list.reduce(
    (acc, a) => {
      acc.families += 1;
      acc.adults += Number(a.adults) || 0;
      acc.kids512 += Number(a.kids512) || 0;
      acc.kidsU5 += Number(a.kidsU5) || 0;
      acc.total += (Number(a.adults) || 0) + (Number(a.kids512) || 0) + (Number(a.kidsU5) || 0);
      acc.cateringHeads += cateringWeight(a);
      return acc;
    },
    { families: 0, adults: 0, kids512: 0, kidsU5: 0, total: 0, cateringHeads: 0 }
  );
}

function renderAttendees() {
  const searchTerm = ($("#attendeeSearch").value || "").toLowerCase().trim();
  const filtered = searchTerm
    ? attendees.filter((a) => (a.familyName || "").toLowerCase().includes(searchTerm))
    : attendees;

  const statsSource = confirmedOnly() ? attendees.filter((a) => a.rsvp === "Confirmed") : attendees;
  const t = attendeeTotals(statsSource);
  $("#attFamilies").textContent = t.families;
  $("#attAdults").textContent = t.adults;
  $("#attKids512").textContent = t.kids512;
  $("#attKidsU5").textContent = t.kidsU5;
  $("#attTotal").textContent = t.total;
  $("#attCateringHeads").textContent = formatWeight(t.cateringHeads);

  renderDietaryRollup(attendees);
  renderSeatingOverview(attendees);

  const body = $("#attendeeTableBody");
  if (!filtered.length) {
    body.innerHTML = `<tr class="empty-row"><td colspan="10">${searchTerm ? "No matches." : "No attendees yet. Add the first family above!"}</td></tr>`;
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
        <td>${formatWeight(cateringWeight(a))}</td>
        <td class="muted">${escapeHtml(a.table || "")}</td>
        <td>${rsvpBadge(a.rsvp)}</td>
        <td class="muted">${escapeHtml(a.dietary || "")}</td>
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

function renderDietaryRollup(list) {
  const el = $("#dietaryRollup");
  const counts = {};
  list.forEach((a) => {
    if (!a.dietary) return;
    a.dietary
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((tag) => {
        const key = tag.toLowerCase();
        counts[key] = counts[key] || { label: tag, count: 0 };
        counts[key].count++;
      });
  });
  const entries = Object.values(counts).sort((a, b) => b.count - a.count);
  if (!entries.length) {
    el.innerHTML = `<p class="muted">Add attendees with dietary notes to see a summary here.</p>`;
    return;
  }
  el.innerHTML = entries
    .map((e) => `<span class="dietary-tag">🥗 ${escapeHtml(e.label)} <span class="count">${e.count}</span></span>`)
    .join("");
}

function renderSeatingOverview(list) {
  const el = $("#seatingOverview");
  const groups = {};
  const unassigned = [];
  list.forEach((a) => {
    const heads = (Number(a.adults) || 0) + (Number(a.kids512) || 0) + (Number(a.kidsU5) || 0);
    if (a.table && a.table.trim()) {
      const key = a.table.trim();
      groups[key] = groups[key] || { names: [], heads: 0 };
      groups[key].names.push(a.familyName);
      groups[key].heads += heads;
    } else {
      unassigned.push(a.familyName);
    }
  });
  const keys = Object.keys(groups).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (!keys.length && !unassigned.length) {
    el.innerHTML = `<p class="muted">Assign tables when adding attendees to see the layout here.</p>`;
    return;
  }
  let html = keys
    .map(
      (k) => `
    <div class="seating-group">
      <span class="table-heads">${groups[k].heads} 👤</span>
      <span class="table-name">🪑 ${escapeHtml(k)}</span>
      <div class="table-families">${escapeHtml(groups[k].names.join(", "))}</div>
    </div>`
    )
    .join("");
  if (unassigned.length) {
    html += `
    <div class="seating-group">
      <span class="table-heads">${unassigned.length} 👤</span>
      <span class="table-name">❔ Unassigned</span>
      <div class="table-families">${escapeHtml(unassigned.join(", "))}</div>
    </div>`;
  }
  el.innerHTML = html;
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
    <div class="field-row">
      <div><label class="field-label">Table (optional)</label><input class="input" id="fAttTable" value="${escapeHtml(existing?.table || "")}" placeholder="e.g. Table 3" /></div>
      <div><label class="field-label">Dietary / allergies</label><input class="input" id="fAttDietary" value="${escapeHtml(existing?.dietary || "")}" placeholder="e.g. Vegetarian, nut allergy" /></div>
    </div>
    <label class="field-label">Notes</label>
    <input class="input" id="fAttNotes" value="${escapeHtml(existing?.notes || "")}" placeholder="Anything else worth knowing" />
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
            table: $("#fAttTable", root).value.trim(),
            dietary: $("#fAttDietary", root).value.trim(),
            notes: $("#fAttNotes", root).value.trim(),
          };
          try {
            if (isEdit) {
              await updateDoc(doc(db, "attendees", existing.id), data);
            } else {
              data.addedBy = getMyName();
              data.paid = false;
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
  const rows = [["Family/Person", "Adults", "Kids 5-12", "Kids under 5", "Total", "Catering Head", "Table", "RSVP", "Dietary", "Notes", "Added by"]];
  attendees.forEach((a) => {
    rows.push([
      a.familyName,
      a.adults || 0,
      a.kids512 || 0,
      a.kidsU5 || 0,
      (a.adults || 0) + (a.kids512 || 0) + (a.kidsU5 || 0),
      formatWeight(cateringWeight(a)),
      a.table || "",
      a.rsvp || "",
      a.dietary || "",
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
  $("#setCapsBtn").addEventListener("click", openCategoryCapsModal);
}

function openCategoryCapsModal() {
  openModal(
    `
    <h3>🎯 Category budgets</h3>
    <p class="muted" style="margin-bottom:10px">Set a soft cap per category — the bar turns red if you go over. Leave blank for no cap.</p>
    ${BUDGET_CATEGORIES.map(
      (c) => `
      <label class="field-label">${CATEGORY_ICONS[c] || ""} ${c}</label>
      <input class="input" type="number" min="0" step="0.01" data-cap="${escapeHtml(c)}" value="${
        eventInfo.categoryCaps && eventInfo.categoryCaps[c] ? eventInfo.categoryCaps[c] : ""
      }" placeholder="No cap" />`
    ).join("")}
    <div class="modal-actions">
      <button class="btn btn-ghost" id="capsCancel">Cancel</button>
      <button class="btn btn-primary" id="capsSave">Save</button>
    </div>
  `,
    {
      onMount: (root) => {
        $("#capsCancel", root).addEventListener("click", closeModal);
        $("#capsSave", root).addEventListener("click", async () => {
          const caps = {};
          $$("[data-cap]", root).forEach((inp) => {
            const v = parseFloat(inp.value);
            if (v > 0) caps[inp.dataset.cap] = v;
          });
          try {
            await setDoc(doc(db, "settings", "eventInfo"), { categoryCaps: caps }, { merge: true });
            closeModal();
            showToast("Category budgets saved");
          } catch (err) {
            console.error(err);
            showToast("Couldn't save — check your connection");
          }
        });
      },
    }
  );
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
  // Weighted catering headcount: adult = 1, kid 5-12 = 0.5, kid <5 = free.
  $("#budgetPerPerson").textContent = t.cateringHeads > 0 ? fmtMoney(grand / t.cateringHeads) : "—";

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
      .map(([cat, amt]) => {
        const cap = (eventInfo.categoryCaps && eventInfo.categoryCaps[cat]) || 0;
        const overCap = cap > 0 && amt > cap;
        const barPct = cap > 0 ? Math.min(100, (amt / cap) * 100) : (amt / max) * 100;
        const capNote = cap > 0 ? `<div class="cat-cap-note">${overCap ? "⚠️ " + fmtMoney(amt - cap) + " over" : "of " + fmtMoney(cap)}</div>` : "";
        return `
      <div class="category-row ${overCap ? "over-cap" : ""}">
        <span class="cat-name">${CATEGORY_ICONS[cat] || "📦"} ${escapeHtml(cat)}</span>
        <span class="cat-bar-track"><span class="cat-bar-fill" style="width:${barPct}%"></span></span>
        <span class="cat-amount">${fmtMoney(amt)}${capNote}</span>
      </div>`;
      })
      .join("");
  }

  renderCostSplit();

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

function renderCostSplit() {
  const summaryEl = $("#costSplitSummary");
  const listEl = $("#costSplitList");
  if (!summaryEl || !listEl) return;
  const statsSource = confirmedOnly() ? attendees.filter((a) => a.rsvp === "Confirmed") : attendees;
  const grand = budgetGrandTotal(budgetItems);
  const t = attendeeTotals(statsSource);
  if (!statsSource.length || grand <= 0 || t.cateringHeads <= 0) {
    summaryEl.textContent = "Add attendees and expenses to calculate shares.";
    listEl.innerHTML = "";
    return;
  }
  const perHead = grand / t.cateringHeads;
  summaryEl.textContent = `${fmtMoney(perHead)} per catering head × ${formatWeight(t.cateringHeads)} heads = ${fmtMoney(grand)} total`;
  listEl.innerHTML = statsSource
    .map((a) => {
      const w = cateringWeight(a);
      const share = w * perHead;
      return `
    <div class="cost-split-row">
      <div>
        <div class="cost-split-name">${escapeHtml(a.familyName)}</div>
        <div class="cost-split-share">${formatWeight(w)} heads · ${fmtMoney(share)}</div>
      </div>
      <label class="paid-checkbox-label">
        <input type="checkbox" data-paid="${a.id}" ${a.paid ? "checked" : ""} />
        ${a.paid ? "Paid" : "Unpaid"}
      </label>
    </div>`;
    })
    .join("");

  $$("[data-paid]", listEl).forEach((cb) => {
    cb.addEventListener("change", () => {
      updateDoc(doc(db, "attendees", cb.dataset.paid), { paid: cb.checked }).catch((err) => {
        console.error(err);
        showToast("Couldn't update — check your connection");
      });
    });
  });
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
// SCHEDULE
// =============================================================================
let scheduleItems = [];
const SCHEDULE_TYPES = ["Arrival", "Welcome", "Meal", "Games & Activities", "Performance", "Speech", "Ceremony", "Other"];
const SCHEDULE_TYPE_ICONS = {
  Arrival: "🚪",
  Welcome: "👋",
  Meal: "🍽️",
  "Games & Activities": "🎉",
  Performance: "🎤",
  Speech: "🎙️",
  Ceremony: "🪔",
  Other: "📌",
};

function initSchedule() {
  const ref = query(collection(db, "scheduleItems"), orderBy("startTime", "asc"));
  onSnapshot(
    ref,
    (snap) => {
      scheduleItems = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderSchedule();
      renderDashboard();
    },
    (err) => {
      console.error("schedule listener:", err);
      showToast("Couldn't load the schedule — check Firestore rules");
    }
  );

  $("#addScheduleBtn").addEventListener("click", () => openScheduleModal());
  $("#printScheduleBtn").addEventListener("click", printSchedule);
  window.addEventListener("afterprint", () => $("#tab-schedule").classList.remove("printing"));
}

function printSchedule() {
  const panel = $("#tab-schedule");
  panel.classList.add("printing");
  window.print();
  setTimeout(() => panel.classList.remove("printing"), 500);
}

function renderScheduleWindow() {
  const el = $("#scheduleWindow");
  if (!eventInfo.eventDate) {
    el.textContent = "Set your event date, time and venue in ⚙️ settings.";
    return;
  }
  const start = eventStartDateTime();
  const dateStr = start ? start.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "";
  const timeStr = eventTimeRangeLabel();
  el.textContent = `🕕 ${dateStr}${timeStr ? " · " + timeStr : ""}${eventInfo.venue ? " · 📍 " + eventInfo.venue : ""}`;
}

function renderSchedule() {
  renderScheduleWindow();
  const timeline = $("#scheduleTimeline");
  if (!scheduleItems.length) {
    timeline.innerHTML = `<p class="muted empty-row" id="scheduleEmptyMsg">No programs yet — add your first one (welcome, dinner, games, speeches…).</p>`;
    return;
  }
  timeline.innerHTML = scheduleItems
    .map(
      (s) => `
    <div class="schedule-item" data-id="${s.id}">
      <div class="schedule-item-card">
        <div class="schedule-time">${fmtTime12(s.startTime)}${s.endTime ? " – " + fmtTime12(s.endTime) : ""}</div>
        <div class="schedule-title-row">
          <div>
            <h4>${escapeHtml(s.title)}</h4>
            <span class="schedule-type-tag">${SCHEDULE_TYPE_ICONS[s.type] || "📌"} ${escapeHtml(s.type || "Other")}</span>
          </div>
          <div class="schedule-actions no-print">
            <button class="icon-action" data-edit="${s.id}" title="Edit">✏️</button>
            <button class="icon-action" data-del="${s.id}" title="Delete">🗑️</button>
          </div>
        </div>
        ${s.notes ? `<div class="schedule-notes">${escapeHtml(s.notes)}</div>` : ""}
      </div>
    </div>`
    )
    .join("");

  $$("[data-edit]", timeline).forEach((btn) =>
    btn.addEventListener("click", () => openScheduleModal(scheduleItems.find((s) => s.id === btn.dataset.edit)))
  );
  $$("[data-del]", timeline).forEach((btn) => btn.addEventListener("click", () => confirmDeleteSchedule(btn.dataset.del)));
}

function openScheduleModal(existing) {
  const isEdit = !!existing;
  openModal(
    `
    <h3>${isEdit ? "✏️ Edit" : "➕ Add"} program</h3>
    <label class="field-label">Program name</label>
    <input class="input" id="fSchTitle" value="${escapeHtml(existing?.title || "")}" placeholder="e.g. Guest arrival & welcome drinks" />
    <div class="field-row">
      <div><label class="field-label">Start time</label><input class="input" id="fSchStart" type="time" value="${existing?.startTime || ""}" /></div>
      <div><label class="field-label">End time (optional)</label><input class="input" id="fSchEnd" type="time" value="${existing?.endTime || ""}" /></div>
    </div>
    <label class="field-label">Type</label>
    <select class="input" id="fSchType">
      ${SCHEDULE_TYPES.map((t) => `<option ${existing?.type === t ? "selected" : ""}>${t}</option>`).join("")}
    </select>
    <label class="field-label">Notes (optional)</label>
    <textarea class="input" id="fSchNotes" rows="2" placeholder="Who's running it, special instructions…">${escapeHtml(existing?.notes || "")}</textarea>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="schCancel">Cancel</button>
      <button class="btn btn-primary" id="schSave">${isEdit ? "Save changes" : "Add"}</button>
    </div>
  `,
    {
      onMount: (root) => {
        $("#fSchTitle", root).focus();
        $("#schCancel", root).addEventListener("click", closeModal);
        $("#schSave", root).addEventListener("click", async () => {
          const title = $("#fSchTitle", root).value.trim();
          const startTime = $("#fSchStart", root).value;
          if (!title) return showToast("Please enter a program name");
          if (!startTime) return showToast("Please set a start time");
          const data = {
            title,
            startTime,
            endTime: $("#fSchEnd", root).value || "",
            type: $("#fSchType", root).value,
            notes: $("#fSchNotes", root).value.trim(),
          };
          try {
            if (isEdit) {
              await updateDoc(doc(db, "scheduleItems", existing.id), data);
            } else {
              data.addedBy = getMyName();
              data.createdAt = serverTimestamp();
              await addDoc(collection(db, "scheduleItems"), data);
            }
            closeModal();
            showToast(isEdit ? "Updated" : "Added to schedule!");
          } catch (err) {
            console.error(err);
            showToast("Couldn't save — check your connection");
          }
        });
      },
    }
  );
}

function confirmDeleteSchedule(id) {
  const s = scheduleItems.find((x) => x.id === id);
  if (!s) return;
  if (!window.confirm(`Remove "${s.title}" from the schedule?`)) return;
  deleteDoc(doc(db, "scheduleItems", id)).then(() => showToast("Removed")).catch((err) => {
    console.error(err);
    showToast("Couldn't remove — check your connection");
  });
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
      if (!$("#slideshowOverlay").classList.contains("hidden")) renderSlide();
    },
    (err) => {
      console.error("photos listener:", err);
      showToast("Couldn't load photos — check Firestore rules");
    }
  );

  $("#photoInput").addEventListener("change", (e) => handlePhotoUpload(e.target.files));
  $("#slideshowBtn").addEventListener("click", () => openSlideshow(0));
  $("#downloadAllBtn").addEventListener("click", downloadAllPhotosZip);
  $$("#photoFilterChips .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      $$("#photoFilterChips .chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      renderPhotos();
    });
  });
}

function activePhotoFilter() {
  const active = $("#photoFilterChips .chip.active");
  return active ? active.dataset.filter : "all";
}

function renderPhotos() {
  const grid = $("#photoGrid");
  const filter = activePhotoFilter();
  const list = filter === "highlights" ? photos.filter((p) => (p.likedBy || []).length > 0) : photos;
  if (!list.length) {
    const msg = filter === "highlights" ? "No highlights yet — like a photo to feature it here! 🌟" : "No photos yet — be the first to upload!";
    grid.innerHTML = `<p class="muted empty-row" id="photoEmptyMsg">${escapeHtml(msg)}</p>`;
    return;
  }
  const myName = localStorage.getItem("gtc_name") || "";
  grid.innerHTML = list
    .map((p) => {
      const idx = photos.indexOf(p);
      const liked = (p.likedBy || []).includes(myName);
      const likeCount = (p.likedBy || []).length;
      return `
    <div class="photo-tile" data-index="${idx}">
      <img src="${p.downloadURL}" alt="${escapeHtml(p.caption || "Event photo")}" loading="lazy" />
      ${p.familyTag ? `<span class="photo-tag-chip">🏷️ ${escapeHtml(p.familyTag)}</span>` : ""}
      <button class="photo-delete" data-del="${p.id}" title="Delete">✕</button>
      <button class="photo-like-btn ${liked ? "liked" : ""}" data-like="${p.id}" title="Like this photo">${liked ? "❤️" : "🤍"}${likeCount ? " " + likeCount : ""}</button>
      <div class="photo-meta">${escapeHtml(p.uploadedBy || "")}</div>
    </div>`;
    })
    .join("");

  $$(".photo-tile", grid).forEach((tile) => {
    tile.addEventListener("click", (e) => {
      if (e.target.closest("[data-del]") || e.target.closest("[data-like]")) return;
      openSlideshow(parseInt(tile.dataset.index, 10));
    });
  });
  $$("[data-del]", grid).forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      confirmDeletePhoto(btn.dataset.del);
    })
  );
  $$("[data-like]", grid).forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      togglePhotoLike(btn.dataset.like);
    })
  );
}

function togglePhotoLike(id) {
  const p = photos.find((x) => x.id === id);
  if (!p) return;
  const myName = getMyName();
  const likedBy = p.likedBy || [];
  const isLiked = likedBy.includes(myName);
  updateDoc(doc(db, "photos", id), { likedBy: isLiked ? arrayRemove(myName) : arrayUnion(myName) }).catch((err) => {
    console.error(err);
    showToast("Couldn't update — check your connection");
  });
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
                  familyTag: "",
                  likedBy: [],
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
  $("#slideshowCaption").textContent = `${p.uploadedBy ? "📤 " + p.uploadedBy : ""}  ·  ${slideshowIndex + 1} / ${photos.length}${
    p.familyTag ? "  ·  🏷️ " + p.familyTag : ""
  }  ·  (tap to tag)`;
  const myName = localStorage.getItem("gtc_name") || "";
  const liked = (p.likedBy || []).includes(myName);
  const likeCount = (p.likedBy || []).length;
  $("#slideshowLikeBtn").textContent = liked ? `❤️ Liked${likeCount ? " (" + likeCount + ")" : ""}` : `🤍 Like`;
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
$("#slideshowLikeBtn").addEventListener("click", () => {
  const p = photos[slideshowIndex];
  if (p) togglePhotoLike(p.id);
});
$("#slideshowCaption").style.cursor = "pointer";
$("#slideshowCaption").title = "Tap to tag a family or person in this photo";
$("#slideshowCaption").addEventListener("click", () => {
  const p = photos[slideshowIndex];
  if (!p) return;
  const tag = window.prompt("Tag a family or person in this photo (optional):", p.familyTag || "");
  if (tag === null) return;
  updateDoc(doc(db, "photos", p.id), { familyTag: tag.trim() }).catch((err) => {
    console.error(err);
    showToast("Couldn't update — check your connection");
  });
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
// WISHLIST ("Things to bring")
// =============================================================================
let wishlistItems = [];

function initWishlist() {
  const ref = query(collection(db, "wishlistItems"), orderBy("createdAt", "asc"));
  onSnapshot(
    ref,
    (snap) => {
      wishlistItems = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderWishlist();
      renderDashboard();
    },
    (err) => console.error("wishlist listener:", err)
  );

  $("#wishlistForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $("#wishlistInput");
    const text = input.value.trim();
    if (!text) return;
    try {
      await addDoc(collection(db, "wishlistItems"), {
        text,
        claimedBy: "",
        addedBy: getMyName(),
        createdAt: serverTimestamp(),
      });
      input.value = "";
    } catch (err) {
      console.error(err);
      showToast("Couldn't add — check your connection");
    }
  });
}

function renderWishlist() {
  const list = $("#wishlistList");
  if (!wishlistItems.length) {
    list.innerHTML = `<li class="muted">Nothing on the list yet.</li>`;
    return;
  }
  list.innerHTML = wishlistItems
    .map(
      (w) => `
    <li class="wishlist-item ${w.claimedBy ? "claimed" : ""}">
      <span class="wishlist-item-name">${escapeHtml(w.text)}</span>
      <span class="wishlist-item-actions">
        <button class="claim-btn ${w.claimedBy ? "claimed-by" : ""}" data-claim="${w.id}">${
        w.claimedBy ? "✓ " + escapeHtml(w.claimedBy) : "I'll bring it"
      }</button>
        <button class="icon-action" data-del="${w.id}" title="Remove">🗑️</button>
      </span>
    </li>`
    )
    .join("");

  $$("[data-claim]", list).forEach((btn) => btn.addEventListener("click", () => toggleWishlistClaim(btn.dataset.claim)));
  $$("[data-del]", list).forEach((btn) =>
    btn.addEventListener("click", () => {
      if (window.confirm("Remove this item?")) {
        deleteDoc(doc(db, "wishlistItems", btn.dataset.del)).catch((err) => console.error(err));
      }
    })
  );
}

function toggleWishlistClaim(id) {
  const w = wishlistItems.find((x) => x.id === id);
  if (!w) return;
  const myName = getMyName();
  if (w.claimedBy && w.claimedBy !== myName) {
    if (!window.confirm(`This is already claimed by ${w.claimedBy}. Take it over?`)) return;
  }
  const newClaimed = w.claimedBy === myName ? "" : myName;
  updateDoc(doc(db, "wishlistItems", id), { claimedBy: newClaimed }).catch((err) => {
    console.error(err);
    showToast("Couldn't update — check your connection");
  });
}

// =============================================================================
// GUESTBOOK
// =============================================================================
let guestbookMessages = [];

function initGuestbook() {
  const ref = query(collection(db, "guestbookMessages"), orderBy("createdAt", "asc"));
  onSnapshot(
    ref,
    (snap) => {
      guestbookMessages = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderGuestbook();
      renderDashboard();
    },
    (err) => console.error("guestbook listener:", err)
  );

  $("#guestbookForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $("#guestbookInput");
    const text = input.value.trim();
    if (!text) return;
    try {
      await addDoc(collection(db, "guestbookMessages"), {
        text,
        addedBy: getMyName(),
        createdAt: serverTimestamp(),
      });
      input.value = "";
    } catch (err) {
      console.error(err);
      showToast("Couldn't post — check your connection");
    }
  });
}

function renderGuestbook() {
  const list = $("#guestbookList");
  if (!guestbookMessages.length) {
    list.innerHTML = `<li class="muted">No messages yet — be the first!</li>`;
    return;
  }
  const items = [...guestbookMessages].reverse().slice(0, 25);
  list.innerHTML = items
    .map(
      (g) => `
    <li class="guestbook-item">
      <span class="gb-name">${escapeHtml(g.addedBy || "Someone")}:</span> ${escapeHtml(g.text)}
    </li>`
    )
    .join("");
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
