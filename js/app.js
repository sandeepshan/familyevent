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
  initCrewRoles();
  initCommunications();
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
      maybeFetchWeather();
      refreshShareLinks();
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

// -----------------------------------------------------------------------------
// Weather widget (Open-Meteo — free, no API key). Best-effort: any failure
// (offline, venue not found, event too far out for a forecast) just keeps
// the card hidden rather than showing an error.
// -----------------------------------------------------------------------------
function weatherCodeToEmoji(code) {
  if (code === 0) return "☀️";
  if ([1, 2, 3].includes(code)) return "⛅";
  if ([45, 48].includes(code)) return "🌫️";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67].includes(code)) return "🌧️";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "❄️";
  if ([80, 81, 82].includes(code)) return "🌦️";
  if ([95, 96, 99].includes(code)) return "⛈️";
  return "🌡️";
}

let lastWeatherKey = "";
async function maybeFetchWeather() {
  const venue = (eventInfo.venue || "").trim();
  const key = `${venue}|${eventInfo.eventDate || ""}`;
  if (!venue || !eventInfo.eventDate) {
    $("#weatherCard").hidden = true;
    return;
  }
  if (key === lastWeatherKey) return;
  lastWeatherKey = key;
  try {
    const daysOut = Math.round((new Date(eventInfo.eventDate + "T00:00:00") - new Date(new Date().toDateString())) / 86400000);
    if (daysOut < 0 || daysOut > 15) {
      $("#weatherCard").hidden = true;
      return; // outside Open-Meteo's ~16-day forecast window
    }
    const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(venue.split(",")[0])}&count=1`);
    const geo = await geoRes.json();
    const place = geo?.results?.[0];
    if (!place) {
      $("#weatherCard").hidden = true;
      return;
    }
    const fRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode&timezone=auto&start_date=${eventInfo.eventDate}&end_date=${eventInfo.eventDate}`
    );
    const data = await fRes.json();
    if (!data?.daily?.time?.length) {
      $("#weatherCard").hidden = true;
      return;
    }
    const max = Math.round(data.daily.temperature_2m_max[0]);
    const min = Math.round(data.daily.temperature_2m_min[0]);
    const rain = data.daily.precipitation_probability_max[0];
    const icon = weatherCodeToEmoji(data.daily.weathercode[0]);
    $("#weatherContent").innerHTML = `
      <div class="weather-row">
        <span class="weather-icon">${icon}</span>
        <span class="weather-temp">${min}° – ${max}°</span>
        <span class="weather-rain">☔ ${rain}% chance of rain</span>
      </div>
      <p class="muted" style="margin-top:6px;font-size:0.78rem">For ${escapeHtml(place.name)} — forecasts firm up closer to the day, so check back.</p>`;
    $("#weatherCard").hidden = false;
  } catch (err) {
    // Non-critical: offline, blocked network, or Open-Meteo hiccup — just
    // keep the forecast card hidden rather than surfacing an error.
    console.warn("weather forecast unavailable:", err && err.message);
    $("#weatherCard").hidden = true;
  }
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
  budgetItems.forEach((b) => items.push({ ts: b.createdAt, text: `🧾 ${b.addedBy || "Someone"} added <b>${escapeHtml(b.itemName)}</b> — ${fmtMoney(budgetItemTotal(b))}` }));
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
    body.innerHTML = `<tr class="empty-row"><td colspan="13">${searchTerm ? "No matches." : "No attendees yet. Add the first family above!"}</td></tr>`;
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
        <td class="muted">${a.phone ? `<a href="tel:${escapeHtml(a.phone)}">${escapeHtml(a.phone)}</a>` : ""}</td>
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
          ${a.phone ? `<a class="icon-action" href="${attendeeWhatsappHref(a)}" target="_blank" rel="noopener" title="WhatsApp reminder">💬</a>` : ""}
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
    <label class="field-label">Phone number (optional)</label>
    <input class="input" id="fAttPhone" type="tel" value="${escapeHtml(existing?.phone || "")}" placeholder="e.g. +61 412 345 678" />
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
            phone: $("#fAttPhone", root).value.trim(),
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
  const rows = [["Family/Person", "Phone", "Adults", "Kids 5-12", "Kids under 5", "Total", "Catering Head", "Table", "RSVP", "Dietary", "Notes", "Added by"]];
  attendees.forEach((a) => {
    rows.push([
      a.familyName,
      a.phone || "",
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
const COMMITTEE_MEMBERS = ["Binoy", "Hans", "Manoj", "Joban", "Sojan", "Martin", "Sandeep"];
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

// Backward-compatible readers: older entries were saved with quantity × unit
// price and a Planned/Purchased status; new entries just have a price, an
// optional assignee, and a done checkbox.
function budgetItemTotal(b) {
  return typeof b.price === "number" ? b.price : (Number(b.quantity) || 0) * (Number(b.unitPrice) || 0);
}
function budgetItemDone(b) {
  return typeof b.done === "boolean" ? b.done : b.status === "Purchased";
}

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
  return list.reduce((sum, b) => sum + budgetItemTotal(b), 0);
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
    byCat[cat] = (byCat[cat] || 0) + budgetItemTotal(b);
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
    body.innerHTML = `<tr class="empty-row"><td colspan="7">No expenses yet. Add plates, catering, water, decorations…</td></tr>`;
    return;
  }
  body.innerHTML = filtered
    .map((b) => {
      const total = budgetItemTotal(b);
      const done = budgetItemDone(b);
      return `<tr class="${done ? "row-done" : ""}">
        <td><strong>${escapeHtml(b.itemName)}</strong></td>
        <td>${CATEGORY_ICONS[b.category] || "📦"} ${escapeHtml(b.category || "")}</td>
        <td><strong>${fmtMoney(total)}</strong></td>
        <td class="muted">${b.assignedTo ? escapeHtml(b.assignedTo) : "—"}</td>
        <td>
          <label class="done-checkbox-label">
            <input type="checkbox" data-done="${b.id}" ${done ? "checked" : ""} />
            ${done ? "✅ Done" : "Planned"}
          </label>
        </td>
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
  $$("[data-done]", body).forEach((cb) => {
    cb.addEventListener("change", () => {
      updateDoc(doc(db, "budgetItems", cb.dataset.done), { done: cb.checked }).catch((err) => {
        console.error(err);
        showToast("Couldn't update — check your connection");
      });
    });
  });
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
      <div><label class="field-label">Price</label><input class="input" id="fBPrice" type="number" min="0" step="0.01" value="${existing ? budgetItemTotal(existing) || "" : ""}" placeholder="0.00" /></div>
      <div><label class="field-label">Assigned to <span class="muted">(optional)</span></label>
        <select class="input" id="fBAssigned">
          <option value="">— Unassigned —</option>
          ${COMMITTEE_MEMBERS.map((m) => `<option ${existing?.assignedTo === m ? "selected" : ""}>${m}</option>`).join("")}
        </select>
      </div>
    </div>
    <label class="toggle-row">
      <span class="field-label" style="margin:0">✅ Already done / purchased</span>
      <span class="toggle-switch"><input type="checkbox" id="fBDone" ${existing && budgetItemDone(existing) ? "checked" : ""} /><span class="toggle-track"><span class="toggle-thumb"></span></span></span>
    </label>
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
            price: parseFloat($("#fBPrice", root).value) || 0,
            assignedTo: $("#fBAssigned", root).value.trim(),
            done: $("#fBDone", root).checked,
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
  const rows = [["Item", "Category", "Price", "Assigned to", "Done", "Added by"]];
  budgetItems.forEach((b) => {
    rows.push([b.itemName, b.category, budgetItemTotal(b), b.assignedTo || "", budgetItemDone(b) ? "Yes" : "No", b.addedBy || ""]);
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
  Ceremony: "🕯️",
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
let photoWallOpen = false;

function initPhotos() {
  const ref = query(collection(db, "photos"), orderBy("createdAt", "asc"));
  onSnapshot(
    ref,
    (snap) => {
      photos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderPhotos();
      renderDashboard();
      if (!$("#slideshowOverlay").classList.contains("hidden")) renderSlide();
      if (photoWallOpen) renderPhotoWall();
    },
    (err) => {
      console.error("photos listener:", err);
      showToast("Couldn't load photos — check Firestore rules");
    }
  );

  $("#photoInput").addEventListener("change", (e) => handlePhotoUpload(e.target.files));
  $("#slideshowBtn").addEventListener("click", () => openSlideshow(0));
  $("#downloadAllBtn").addEventListener("click", downloadAllPhotosZip);
  $("#downloadPptxBtn").addEventListener("click", downloadPhotosPptx);
  $("#photoWallBtn").addEventListener("click", openPhotoWall);
  $("#wallCloseBtn").addEventListener("click", closePhotoWall);
  $$("#photoFilterChips .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      $$("#photoFilterChips .chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      renderPhotos();
    });
  });
}

// ---- Photo Wall (fullscreen TV display mode) ----
function openPhotoWall() {
  photoWallOpen = true;
  $("#photoWallOverlay").classList.remove("hidden");
  try {
    document.documentElement.requestFullscreen?.().catch(() => {});
  } catch (e) {
    /* fullscreen unsupported/blocked — the overlay still fills the viewport */
  }
  renderPhotoWall();
}

function closePhotoWall() {
  photoWallOpen = false;
  $("#photoWallOverlay").classList.add("hidden");
  try {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  } catch (e) {
    /* ignore */
  }
}

function renderPhotoWall() {
  $("#wallEventName").textContent = eventInfo.eventName || "Family Get-Together";
  $("#wallPhotoCount").textContent = `${photos.length} photo${photos.length === 1 ? "" : "s"}`;
  const grid = $("#wallGrid");
  if (!photos.length) {
    grid.innerHTML = `<p class="muted empty-row">No photos yet — upload some from any phone to see them appear here live!</p>`;
    return;
  }
  // Show newest first so a freshly-uploaded photo appears at the top of the wall.
  const list = photos.slice().reverse();
  grid.innerHTML = list
    .map((p) => {
      const highlighted = (p.likedBy || []).length > 0;
      return `
    <div class="wall-tile${highlighted ? " wall-tile-highlight" : ""}">
      <img src="${p.downloadURL}" alt="${escapeHtml(p.caption || "Event photo")}" loading="lazy" />
      ${p.familyTag ? `<span class="wall-tile-tag">🏷️ ${escapeHtml(p.familyTag)}</span>` : ""}
    </div>`;
    })
    .join("");
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
    let failCount = 0;
    for (const p of photos) {
      i++;
      try {
        const res = await fetch(p.downloadURL);
        const blob = await res.blob();
        const ext = (p.contentType || "image/jpeg").split("/")[1] || "jpg";
        zip.file(`photo_${String(i).padStart(3, "0")}.${ext}`, blob);
      } catch (e) {
        console.error("skipping photo in zip export:", e);
        failCount++;
      }
    }
    if (failCount > 0 && failCount === photos.length) {
      showToast("Couldn't load any photos — this usually means Storage CORS isn't set up yet. Ask your app admin to check the README's CORS section.", 8000);
      return;
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
    showToast(failCount > 0 ? `Download ready — ${failCount} photo${failCount === 1 ? "" : "s"} couldn't be loaded and ${failCount === 1 ? "was" : "were"} skipped.` : "Download ready!");
  } catch (err) {
    console.error(err);
    showToast("Couldn't build the ZIP — try again");
  }
}

// ---------- PowerPoint export ----------
async function imageUrlToBase64(url) {
  const res = await fetch(url);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function loadImageEl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't decode image"));
    img.src = dataUrl;
  });
}

// Renders a rich diagonal gradient (indigo → berry → coral) with a few soft
// glow "orbs" as a background image, instead of a flat colour fill, for a
// more dynamic, modern look. Generated once and reused across every
// full-bleed slide in the deck.
function makeDynamicBackgroundDataUrl(pxW, pxH) {
  const canvas = document.createElement("canvas");
  canvas.width = pxW;
  canvas.height = pxH;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, pxW, pxH);
  grad.addColorStop(0, "#241B3D");
  grad.addColorStop(0.55, "#7A2D63");
  grad.addColorStop(1, "#FF7A55");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, pxW, pxH);

  const orbs = [
    { x: pxW * 0.12, y: pxH * 0.2, r: pxW * 0.22, color: "rgba(255,193,69,0.30)" },
    { x: pxW * 0.92, y: pxH * 0.1, r: pxW * 0.16, color: "rgba(255,122,89,0.35)" },
    { x: pxW * 0.85, y: pxH * 0.92, r: pxW * 0.24, color: "rgba(122,45,99,0.45)" },
    { x: pxW * 0.05, y: pxH * 0.95, r: pxW * 0.14, color: "rgba(255,193,69,0.18)" },
  ];
  orbs.forEach((o) => {
    const rg = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
    rg.addColorStop(0, o.color);
    rg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
    ctx.fill();
  });
  return canvas.toDataURL("image/jpeg", 0.92);
}

// Scales a photo to fit *entirely* within a target box (like CSS
// object-fit: contain — never cropping any of the photo) and returns a
// JPEG data URL sized to exactly that box, with any left-over space filled
// white so it blends into the white photo "card" behind it on the slide.
// We do this ourselves with a canvas rather than relying on PptxGenJS's
// built-in sizing modes — its auto-crop ("cover") chopped off the tops of
// people's heads on wide frames, and capping the output resolution here
// also keeps large phone photos from looking pixelated once PowerPoint
// scales them.
async function containFitToDataUrl(dataUrl, targetW, targetH, maxOutW = 1600) {
  const img = await loadImageEl(dataUrl);
  const targetRatio = targetW / targetH;
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  const srcRatio = srcW / srcH;

  const outW = maxOutW;
  const outH = Math.round(outW / targetRatio);

  let dw, dh;
  if (srcRatio > targetRatio) {
    // photo is relatively wider than the frame — fit to width, letterbox top/bottom
    dw = outW;
    dh = Math.round(dw / srcRatio);
  } else {
    // photo is relatively taller than the frame — fit to height, letterbox left/right
    dh = outH;
    dw = Math.round(dh * srcRatio);
  }
  const dx = Math.round((outW - dw) / 2);
  const dy = Math.round((outH - dh) / 2);

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, outW, outH);
  ctx.drawImage(img, 0, 0, srcW, srcH, dx, dy, dw, dh);
  return canvas.toDataURL("image/jpeg", 0.9);
}

async function downloadPhotosPptx() {
  if (!photos.length) return showToast("No photos to export yet");
  if (typeof PptxGenJS === "undefined") return showToast("Still loading — try again in a moment");
  showToast("Building your PowerPoint — this can take a bit for lots of photos…", 6000);

  // Theme colours: a vibrant indigo → berry → coral gradient with gold
  // accents, painted as actual gradient background images (see
  // makeDynamicBackgroundDataUrl) rather than flat fills, for a more
  // dynamic, layered look than a plain solid colour.
  const CORAL = "FF7A55";
  const CORAL_SOFT = "FFA98C";
  const GOLD = "FFC145";
  const GOLD_SOFT = "FFD98C";
  const CREAM = "FFF6EC";
  const BLUSH = "FBE9E7";
  const INK = "2B1F2E";
  const W = 10,
    H = 5.63; // 16:9

  try {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_16x9";

    // One gradient background image, generated once and reused on every
    // full-bleed slide (title / word cloud / closing).
    const bgDataUrl = makeDynamicBackgroundDataUrl(1600, Math.round((1600 * H) / W));
    const fullBleed = (slide) => slide.addImage({ data: bgDataUrl, x: 0, y: 0, w: W, h: H });
    // A slim gold hairline top & bottom — a lighter, more modern touch than a
    // blocky solid bar.
    const accentLines = (slide) => {
      slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.045, fill: { color: GOLD }, line: { type: "none" } });
      slide.addShape(pptx.ShapeType.rect, { x: 0, y: H - 0.045, w: W, h: 0.045, fill: { color: GOLD }, line: { type: "none" } });
    };
    const MALAYALAM_FONT = "Noto Sans Malayalam";

    // ---------- Opening slide: a word cloud of our group names ----------
    const groupCloud = pptx.addSlide();
    fullBleed(groupCloud);
    accentLines(groupCloud);
    // A scatter of small confetti shapes for a fun, festive feel.
    [
      { x: 0.6, y: 0.65, w: 0.09, h: 0.09, color: GOLD, shape: "ellipse" },
      { x: 9.15, y: 0.6, w: 0.12, h: 0.05, color: CORAL_SOFT, shape: "rect", rotate: 30 },
      { x: 0.45, y: 4.85, w: 0.08, h: 0.08, color: CORAL_SOFT, shape: "ellipse" },
      { x: 9.35, y: 4.9, w: 0.1, h: 0.1, color: GOLD, shape: "ellipse" },
      { x: 5.05, y: 0.5, w: 0.11, h: 0.05, color: GOLD_SOFT, shape: "rect", rotate: -20 },
      { x: 1.6, y: 5.05, w: 0.09, h: 0.09, color: GOLD_SOFT, shape: "ellipse" },
      { x: 8.3, y: 0.55, w: 0.08, h: 0.08, color: CORAL_SOFT, shape: "ellipse" },
    ].forEach((c) =>
      groupCloud.addShape(pptx.ShapeType[c.shape], {
        x: c.x, y: c.y, w: c.w, h: c.h, fill: { color: c.color }, line: { type: "none" }, rotate: c.rotate || 0,
      })
    );
    groupCloud.addText("🎉  OUR GROUPS  🎉", {
      x: 0, y: 0.55, w: W, h: 0.5, align: "center", fontSize: 15, bold: true, color: GOLD, charSpacing: 2,
    });
    // Hand-placed "word cloud" of the family's group names, in Malayalam —
    // varying sizes, colors and gentle rotations for an organic, festive feel.
    const cloudWords = [
      { text: "ശ്രീ മാരുതി സൈക്ലിംഗ് ക്ലബ്", x: 0.4, y: 1.15, w: 9.2, h: 0.9, fontSize: 30, color: GOLD, rotate: 0 },
      { text: "ടാർണീറ്റ് ബോയ്സ്", x: 0.15, y: 2.15, w: 4.3, h: 0.75, fontSize: 25, color: "FFFFFF", rotate: -7 },
      { text: "ജിം ബോയ്സ്", x: 6.9, y: 2.05, w: 2.9, h: 0.75, fontSize: 26, color: CORAL_SOFT, rotate: 6 },
      { text: "വിൻഡാം ക്യാമ്പേഴ്സ്", x: 0.75, y: 3.15, w: 4.0, h: 0.75, fontSize: 24, color: GOLD_SOFT, rotate: 5 },
      { text: "വിൻഡാം ഫിഷിംഗ്", x: 5.5, y: 3.2, w: 3.7, h: 0.75, fontSize: 24, color: CREAM, rotate: -6 },
      { text: "ടാർണീറ്റ് ബൈക്കീസ്", x: 2.6, y: 4.15, w: 4.6, h: 0.7, fontSize: 25, color: "FFFFFF", rotate: 3 },
    ];
    cloudWords.forEach((w) =>
      groupCloud.addText(w.text, {
        x: w.x, y: w.y, w: w.w, h: w.h, align: "center", valign: "middle",
        fontSize: w.fontSize, bold: true, color: w.color, fontFace: MALAYALAM_FONT, rotate: w.rotate,
      })
    );
    groupCloud.addText(eventInfo.eventName || "Family Get-Together", {
      x: 0.5, y: H - 0.65, w: W - 1, h: 0.3, align: "center", fontSize: 10, italic: true, color: GOLD_SOFT,
    });

    // ---------- Title slide ----------
    const title = pptx.addSlide();
    fullBleed(title);
    accentLines(title);
    title.addText("🎉", { x: 0, y: 0.9, w: W, h: 1, align: "center", fontSize: 54 });
    title.addText(eventInfo.eventName || "Family Get-Together", {
      x: 0.5, y: 2.0, w: W - 1, h: 1, align: "center", fontSize: 40, bold: true, color: "FFFFFF", fontFace: "Georgia",
    });
    const start = eventStartDateTime();
    const dateVenueLine = [
      start ? start.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "",
      eventTimeRangeLabel(),
      eventInfo.venue,
    ]
      .filter(Boolean)
      .join("   ·   ");
    title.addText(dateVenueLine, { x: 0.5, y: 3.05, w: W - 1, h: 0.5, align: "center", fontSize: 15, color: GOLD });
    title.addText(`📸 ${photos.length} photo${photos.length === 1 ? "" : "s"} shared by the family`, {
      x: 0.5, y: 3.6, w: W - 1, h: 0.5, align: "center", fontSize: 13, italic: true, color: GOLD_SOFT,
    });

    // Highlights (liked photos) first, so the deck opens with its best moments.
    const ordered = [...photos].sort((a, b) => (b.likedBy || []).length - (a.likedBy || []).length);

    let i = 0;
    let failCount = 0;
    for (const p of ordered) {
      i++;
      let b64;
      try {
        const raw = await imageUrlToBase64(p.downloadURL);
        b64 = await containFitToDataUrl(raw, W - 1.5, 4.15);
      } catch (e) {
        console.error("skipping photo in pptx export:", e);
        failCount++;
        continue;
      }
      const slide = pptx.addSlide();
      slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: H, fill: { color: i % 2 === 0 ? BLUSH : CREAM }, line: { type: "none" } });
      // Colour-accented frame: a coral backdrop peeking out from behind a
      // white photo card, for a layered, dynamic card look with real depth.
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.47, y: 0.32, w: W - 0.94, h: 4.76,
        fill: { color: CORAL }, line: { type: "none" },
      });
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.55, y: 0.4, w: W - 1.1, h: 4.6,
        fill: { color: "FFFFFF" },
        line: { color: GOLD, width: 1.5 },
        shadow: { type: "outer", color: "241B3D", opacity: 0.35, blur: 8, offset: 3, angle: 90 },
      });
      // b64 is already scaled to fit within this exact box (letterboxed in
      // white, never cropped), so no "sizing" is needed here — that avoids
      // PptxGenJS's own auto-crop, which was chopping off parts of photos.
      slide.addImage({ data: b64, x: 0.75, y: 0.6, w: W - 1.5, h: 4.15 });
      const likeCount = (p.likedBy || []).length;
      if (likeCount > 0) {
        slide.addShape(pptx.ShapeType.roundRect, { x: W - 1.85, y: 0.5, w: 1.1, h: 0.38, fill: { color: CORAL }, line: { type: "none" }, rectRadius: 0.1 });
        slide.addText("🌟 Highlight", { x: W - 1.85, y: 0.5, w: 1.1, h: 0.38, align: "center", valign: "middle", fontSize: 9, bold: true, color: "FFFFFF" });
      }
      slide.addText(`${eventInfo.eventName || "Family Get-Together"}   ·   ${i}/${ordered.length}`, {
        x: 0.3, y: H - 0.32, w: W - 0.6, h: 0.28, align: "left", fontSize: 8, color: INK,
      });
    }

    // ---------- Closing slide ----------
    const closing = pptx.addSlide();
    fullBleed(closing);
    accentLines(closing);
    closing.addText("🎉", { x: 0, y: 1.4, w: W, h: 1, align: "center", fontSize: 50 });
    closing.addText("Thank You!", { x: 0.5, y: 2.4, w: W - 1, h: 0.9, align: "center", fontSize: 36, bold: true, color: "FFFFFF", fontFace: "Georgia" });
    closing.addText("For celebrating with us", { x: 0.5, y: 3.2, w: W - 1, h: 0.5, align: "center", fontSize: 16, italic: true, color: GOLD });
    closing.addText("Made with ❤️ by the family committee", { x: 0.5, y: 4.5, w: W - 1, h: 0.4, align: "center", fontSize: 11, color: GOLD_SOFT });

    if (failCount > 0 && failCount === ordered.length) {
      // Every single photo failed to load — almost always a Firebase Storage
      // CORS misconfiguration (the browser blocks fetch() from reading the
      // image bytes cross-origin), not a code bug. Say so plainly instead of
      // silently handing back a photo-less deck.
      showToast("Couldn't load any photos — this usually means Storage CORS isn't set up yet. Ask your app admin to check the README's CORS section.", 8000);
      return;
    }
    await pptx.writeFile({ fileName: `${(eventInfo.eventName || "event").replace(/[^a-z0-9]+/gi, "_")}_photos.pptx` });
    if (failCount > 0) {
      showToast(`PowerPoint ready — ${failCount} photo${failCount === 1 ? "" : "s"} couldn't be loaded and ${failCount === 1 ? "was" : "were"} skipped.`, 7000);
    } else {
      showToast("PowerPoint ready!");
    }
  } catch (err) {
    console.error(err);
    showToast("Couldn't build the PowerPoint — try again");
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
  { name: "Dumb Charades (Malayalam Movies)", category: "Indoor/Table", ageGroup: "All ages", groupSize: "6+", duration: "30 min", props: "Chits with movie names", desc: "Act out Malayalam movie titles without speaking while your team guesses." },
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
  { name: "Pookalam Making Contest (Onam Flower Rangoli)", category: "Cultural", ageGroup: "All ages", groupSize: "Teams or individuals", duration: "30–45 min", props: "Flower petals (or rangoli colours as a substitute)", desc: "Kerala's classic Onam flower carpet — friendly competition to design the best pookalam." },
  { name: "Mehendi Corner", category: "Cultural", ageGroup: "All ages", groupSize: "Walk-in", duration: "Ongoing", props: "Henna cones", desc: "Set up a casual mehendi station for anyone who wants a design." },
  { name: "Thiruvathira / Kaikottikali (Kerala Circle Dance)", category: "Dance/Music", ageGroup: "All ages", groupSize: "Any", duration: "20–30 min", props: "A Thiruvathira/Malayalam folk playlist, open floor space", desc: "The classic Kerala circle dance — graceful claps and steps to a folk song, everyone welcome." },
  { name: "Uriyadi (Pot-Breaking Game)", category: "Active/Outdoor", ageGroup: "All ages", groupSize: "Any", duration: "20–30 min", props: "A pot with a treat inside, rope, a stick, a blindfold", desc: "A classic Onam favourite — blindfolded players are guided by shouted directions to break the hanging pot." },
  { name: "Fancy Dress / Best Dressed Kids", category: "Kids", ageGroup: "Kids", groupSize: "Any", duration: "20 min", props: "Costumes (bring from home)", desc: "A cute mini ramp-walk — pick a theme in advance." },
  { name: "Kasavu & Mundu Walk (Traditional Attire Ramp Walk)", category: "Cultural", ageGroup: "All ages", groupSize: "Any", duration: "20 min", props: "Kasavu sarees, mundu/veshti, traditional jewellery (bring from home)", desc: "A fun mini ramp-walk in traditional Kerala attire — grandparents often steal the show." },
  { name: "Drawing & Colouring Corner", category: "Kids", ageGroup: "Kids", groupSize: "Any", duration: "Ongoing", props: "Paper, crayons or colours", desc: "A quiet corner to keep younger kids happily occupied." },
  { name: "Simplified Housie for Kids", category: "Kids", ageGroup: "Kids", groupSize: "6+", duration: "15 min", props: "Simple number cards", desc: "An easier version of tambola sized for the younger ones." },
  { name: "Card Games Corner (Rummy / UNO)", category: "Indoor/Table", ageGroup: "Adults", groupSize: "4–6 per table", duration: "Ongoing", props: "Card decks", desc: "A relaxed table for anyone who'd rather sit, chat and play." },
  { name: "Human Knot", category: "Icebreaker", ageGroup: "All ages", groupSize: "8–15", duration: "10–15 min", props: "None", desc: "A great mixer game to get everyone talking and laughing early on." },
  { name: "Cricket / Backyard Sports", category: "Active/Outdoor", ageGroup: "All ages", groupSize: "Any", duration: "Flexible", props: "Bat, ball, stumps", desc: "If the venue has space, an informal match is always a hit." },
];

// Detailed hosting scripts (materials/steps/tips) — and full question banks for
// the two quiz-style games — for every seeded game suggestion. Keyed by game
// name so this works for already-seeded Firestore data too, without needing a
// migration. Custom games the committee adds themselves won't have an entry
// here, and the script modal handles that gracefully.
const GAME_SCRIPTS = {
  "Antakshari (Bollywood Edition)": {
    materials: ["Nothing required — just enthusiasm! (A bell or timer adds fun pressure)"],
    steps: [
      "Split into 2 or more teams and pick a starting letter at random.",
      "One team sings a line (or hums the tune) of any Bollywood song starting with that letter, within ~15 seconds.",
      "The next team must start their song with the last letter of the previous song's last word.",
      "Keep alternating between teams — a team that can't respond in time, repeats a song, or gets it wrong loses a point.",
      "Play multiple rounds and keep a running score for a full mini-tournament.",
    ],
    tips: [
      "Set a phone timer for suspense.",
      "Allow one \"help call\" to a teammate per round for younger or newer players.",
      "Mix old classics and recent hits so every generation can join in.",
    ],
  },
  "Dumb Charades (Malayalam Movies)": {
    materials: ["15–20 Malayalam movie names written on folded chits", "A bowl or bag to hold the chits", "A timer"],
    steps: [
      "Write Malayalam movie titles on small chits, fold them, and place them in a bowl.",
      "Split into 2 teams. One player from Team A picks a chit and silently acts it out for their team (60–90 seconds).",
      "Teammates shout guesses — a correct guess within the time limit scores a point.",
      "Alternate turns between teams until all chits are used.",
      "Highest score wins.",
    ],
    tips: [
      "Agree on standard charade signals first (number of words, \"sounds like\", syllable count) so beginners aren't lost.",
      "Mix old classics (Mohanlal, Mammootty-era favourites) with recent hits so all ages can play.",
    ],
  },
  "Tambola / Housie": {
    materials: ["Tambola/housie tickets (printed sheets or a free app)", "A number caller (app, or a bag of numbered tokens)", "Small prizes"],
    steps: [
      "Give each player one or more tickets.",
      "The caller draws and announces numbers one at a time.",
      "Players mark matching numbers on their tickets.",
      "First to complete a pattern (early five, top/middle/bottom line, full house) shouts \"Housie!\" and wins that round's prize.",
      "Play multiple rounds with different patterns.",
    ],
    tips: [
      "A free housie/tambola app makes calling fair and easy to double-check winning claims.",
      "Announce which patterns are in play (and their prizes) before each round starts.",
    ],
  },
  "Musical Chairs": {
    materials: ["Chairs (one fewer than the number of players)", "Music / a speaker"],
    steps: [
      "Arrange chairs in a circle, one fewer than the number of players.",
      "Play music while everyone walks around the chairs.",
      "Stop the music suddenly — everyone scrambles for a seat.",
      "Whoever's left standing is out; remove one more chair and repeat.",
      "Last person seated wins.",
    ],
    tips: [
      "Use a shuffled Bollywood playlist and stop it unpredictably for extra fun.",
      "For younger kids, try a gentler \"freeze dance\" version with no elimination.",
    ],
  },
  "Passing the Parcel": {
    materials: ["A gift wrapped in many layers, with a mini prize or forfeit note in each layer", "Music / a speaker"],
    steps: [
      "Sit everyone in a circle and start the music.",
      "Pass the parcel around the circle while the music plays.",
      "When the music stops, whoever's holding it unwraps one layer and does the forfeit or keeps the prize inside.",
      "Resume the music and repeat until the final (biggest) layer is reached.",
    ],
    tips: [
      "Mix silly forfeits (sing a line, dance for 10 seconds) with small treats to keep everyone excited to unwrap.",
      "Have an adult control the music from behind so stops feel random.",
    ],
  },
  "Lemon & Spoon Race": {
    materials: ["Spoons", "Lemons or limes", "A marked start and finish line"],
    steps: [
      "Line up racers, each given a spoon with a lemon balanced on top.",
      "On \"go\", race to the finish line without dropping the lemon.",
      "If it drops, pick it up and continue from that spot.",
      "First to cross the line with the lemon still balanced wins.",
    ],
    tips: ["Run heats by age group for fairness.", "An adults-only round is usually the most hilarious one."],
  },
  "Three-Legged Race": {
    materials: ["Scarves or fabric strips to tie legs together", "A marked start and finish line"],
    steps: [
      "Pair up (siblings or cousins work great) and tie each pair's inside legs together at the ankle.",
      "Line up pairs at the start.",
      "On \"go\", pairs race to the finish, coordinating their tied legs.",
      "First pair to cross the line without falling wins.",
    ],
    tips: ["A short practice walk before the real race helps pairs sync their steps."],
  },
  "Tug of War": {
    materials: ["A sturdy rope", "A marked centreline on the ground"],
    steps: [
      "Split into two evenly matched teams.",
      "Each team grips one end of the rope, with the centreline marked between them.",
      "On \"go\", both teams pull — the team that drags the other's back foot over the centreline wins.",
      "Play best-of-three for a decisive winner.",
    ],
    tips: ["Balance teams by mixing adults and kids on both sides.", "Play on grass rather than concrete."],
  },
  "Balloon Stomp": {
    materials: ["Balloons", "String"],
    steps: [
      "Tie one inflated balloon to each player's ankle with string.",
      "On \"go\", everyone tries to stomp and pop others' balloons while protecting their own.",
      "Last player with an unpopped balloon wins.",
    ],
    tips: ["Great for kids and playful adults alike.", "Set a clear \"no shoving\" rule before starting."],
  },
  "Treasure Hunt": {
    materials: ["A chain of written clues (prepared in advance)", "A final treasure / small prizes", "Hiding spots around the venue"],
    steps: [
      "Prepare a chain of clues ahead of time — each one leads to the next hiding spot, ending at a final treasure.",
      "Split into mixed-age teams.",
      "Give each team the first clue; they race to solve it and find the next one.",
      "First team to reach the final treasure wins it.",
    ],
    tips: [
      "Write clues as simple riddles tied to venue landmarks.",
      "Scale difficulty so younger kids can contribute — pair them with an older cousin.",
    ],
  },
  "Family Quiz Night": {
    materials: ["The question list below (or your own)", "A bell/buzzer or just hands-up", "A scorepad"],
    steps: [
      "Split into teams of 4–6, mixing generations on each team.",
      "The host reads questions one at a time, going round by round (Bollywood, Cricket, General Knowledge, Family).",
      "First team to buzz or raise hands answers — correct is 1 point, wrong passes to the next team.",
      "Tally scores after all rounds; the highest score wins.",
    ],
    tips: [
      "Add a \"family round\" of questions only your own family would know for the biggest laughs — see the note at the end of the question list.",
      "Keep a strict time limit per answer (10–15 seconds) to keep the pace lively.",
    ],
    questions: [
      { q: "Which 1995 romantic film starring Shah Rukh Khan and Kajol became the longest continuously-running film in Indian cinema history?", a: "Dilwale Dulhania Le Jayenge (DDLJ)" },
      { q: "Which music composer, famous for \"Jai Ho\" and an Oscar win for Slumdog Millionaire, is nicknamed the \"Mozart of Madras\"?", a: "A. R. Rahman" },
      { q: "Which veteran Malayalam actor, fondly called \"Lalettan\", has starred in over 350 films?", a: "Mohanlal" },
      { q: "Which actor is known as the \"King of Bollywood\", starring in classics like DDLJ, Kuch Kuch Hota Hai and Chennai Express?", a: "Shah Rukh Khan" },
      { q: "Amitabh Bachchan hosts which long-running Indian TV game show — the Hindi version of \"Who Wants to Be a Millionaire?\"", a: "Kaun Banega Crorepati (KBC)" },
      { q: "Who was known as the \"Nightingale of India\" and sang thousands of playback songs across seven decades?", a: "Lata Mangeshkar" },
      { q: "Which country won the very first Cricket World Cup, in 1975?", a: "West Indies" },
      { q: "Who is widely called the \"God of Cricket\" and holds the record for the most international centuries?", a: "Sachin Tendulkar" },
      { q: "How many players from each team are on the field during a cricket match?", a: "11" },
      { q: "What's it called when a bowler takes three wickets on three consecutive deliveries?", a: "A hat-trick" },
      { q: "What is the capital city of India?", a: "New Delhi" },
      { q: "Which harvest festival is Kerala's biggest celebration of the year, famous for its grand sadhya feast and flower carpet (pookalam)?", a: "Onam" },
      { q: "Which river, flowing through cities like Varanasi, is considered the most sacred in Hinduism?", a: "The Ganges (Ganga)" },
      { q: "What are the three main colours of the Indian flag, from top to bottom?", a: "Saffron, white, and green" },
      { q: "Holi, the festival of colours, is typically celebrated in which season?", a: "Spring (around March)" },
      { q: "👪 FAMILY ROUND: (Host — add 3–5 of your own here!) e.g. \"In what year did [names] get married?\"", a: "Write your own answer before quiz night!" },
    ],
  },
  '"Mr & Mrs" Couple Quiz': {
    materials: ["The question list below (or your own)", "Two chairs (optional, back-to-back)", "Paper or a small whiteboard for answers"],
    steps: [
      "Seat each couple back-to-back, or have one partner step just out of earshot.",
      "Ask Partner A a question about Partner B (from the list below); they write down or whisper their guess.",
      "Bring Partner B back and ask the same question about themselves — reveal both answers together.",
      "A match scores a point for the couple; keep going through the question list and tally at the end.",
    ],
    tips: [
      "Works best with 3 or more couples competing for \"most in-sync couple\".",
      "Keep questions light and playful, not personal or awkward — swap out any that don't fit a couple.",
    ],
    questions: [
      { q: "Where did you two first meet?", a: "(Compare answers — did they match?)" },
      { q: "What was your first date?", a: "(Compare answers)" },
      { q: "What is your partner's favourite food?", a: "(Compare answers)" },
      { q: "What is your partner's go-to order at a restaurant?", a: "(Compare answers)" },
      { q: "What's your partner's most-used phrase or catchphrase?", a: "(Compare answers)" },
      { q: "What was your partner wearing the day you got engaged or married?", a: "(Compare answers)" },
      { q: "What's one household chore your partner hates doing?", a: "(Compare answers)" },
      { q: "What's your partner's dream travel destination?", a: "(Compare answers)" },
      { q: "Who said \"I love you\" first?", a: "(Compare answers)" },
      { q: "What's your partner's favourite movie or show?", a: "(Compare answers)" },
      { q: "What's one thing your partner is surprisingly good at?", a: "(Compare answers)" },
      { q: "What dessert would your partner order, no matter what?", a: "(Compare answers)" },
      { q: "What's your partner's biggest pet peeve?", a: "(Compare answers)" },
      { q: "If your partner could have any superpower, what would they pick?", a: "(Compare answers)" },
      { q: "What's the most romantic thing your partner has ever done for you?", a: "(Compare answers)" },
    ],
  },
  "Pookalam Making Contest (Onam Flower Rangoli)": {
    materials: ["An assortment of flower petals (or rangoli colours/powder as a substitute)", "A flat outdoor or indoor space", "Reference pookalam designs (optional)"],
    steps: [
      "Mark out equal-sized circular spaces for each team or family.",
      "Set a time limit (30–45 min) and let teams arrange flower petals into a circular, layered pookalam design.",
      "Suggest a theme if you like — traditional Onam motifs, a family crest, or a welcome message.",
      "Everyone (or a neutral judge) votes for their favourite at the end.",
    ],
    tips: [
      "Buying loose flower petals in bulk from a florist is far easier than picking your own.",
      "Lay a mat or sheet underneath for easy cleanup afterward.",
    ],
  },
  "Mehendi Corner": {
    materials: ["Henna cones", "Tissues", "Reference design pictures"],
    steps: [
      "Set up a table or corner with a henna artist (or willing volunteers) and reference designs.",
      "Guests drop by throughout the event for a mini or full design.",
      "Let the henna dry undisturbed for 20–30 minutes before touching it.",
    ],
    tips: ["Offer a quick 2-minute \"mini\" design option to keep the queue moving during a busy event."],
  },
  "Thiruvathira / Kaikottikali (Kerala Circle Dance)": {
    materials: ["A Thiruvathira/Malayalam folk song playlist (or live singing)", "Open floor space", "Traditional attire optional (settu-mundu / kasavu)"],
    steps: [
      "Form a circle, everyone facing inward — a small lamp or floral centrepiece in the middle adds a nice traditional touch.",
      "Follow the basic Thiruvathira step: gentle claps paired with graceful steps moving in and out of the circle, in time with the song.",
      "Have someone experienced lead a short demo of the clap-and-step pattern first — everyone else follows along.",
      "Tighten and widen the circle as the song builds, finishing together on the final beat.",
    ],
    tips: [
      "Traditionally danced by the women of the family, but a mixed, whole-family version is just as fun.",
      "Start with a slower folk track for beginners — save the faster songs for once everyone's confident.",
    ],
  },
  "Uriyadi (Pot-Breaking Game)": {
    materials: ["A clay or plastic pot with a treat inside (sweets, water, or a small prize)", "Rope to hang it", "A stick", "A blindfold"],
    steps: [
      "Hang the pot at head height from a tree branch, frame, or rope strung between two points.",
      "Blindfold one player at a time and spin them around gently to disorient them a little.",
      "Guide them toward the pot using only shouted directions from the crowd (\"left! forward! a bit more!\") — no touching allowed.",
      "Give each player a few swings with the stick to try to break the pot; whoever cracks it open wins whatever's inside (and the mess)!",
    ],
    tips: [
      "Keep the pot light and clear the area of anything breakable nearby.",
      "A classic Onam favourite — just as fun for adults as it is for kids.",
    ],
  },
  "Fancy Dress / Best Dressed Kids": {
    materials: ["Costumes (brought from home)", "A runway or open space", "Music (optional)"],
    steps: [
      "Announce the theme in advance so kids can prepare costumes.",
      "Line kids up and let each walk the \"ramp\" one at a time to music.",
      "Judges (or the whole crowd, by applause) pick favourites in fun categories.",
      "Everyone gets a small prize or certificate for taking part.",
    ],
    tips: ["Give every child a category to \"win\" (most colourful, best smile, etc.) so nobody feels left out."],
  },
  "Kasavu & Mundu Walk (Traditional Attire Ramp Walk)": {
    materials: ["Traditional attire — kasavu sarees, mundu/veshti, jewellery (brought from home)", "A runway or open space", "Music (optional — a Malayalam instrumental works well)"],
    steps: [
      "Announce it in advance so everyone can bring or wear their kasavu saree, mundu, or other traditional outfit.",
      "Line participants up and let each walk the \"ramp\" one at a time.",
      "The crowd cheers on favourites — award fun categories (best kasavu, sharpest mundu, best jewellery) rather than one single winner.",
      "Take plenty of photos — this one's a highlight for the photo wall!",
    ],
    tips: [
      "Open it up to all ages, not just kids — grandparents in traditional attire are often the highlight.",
      "Pair it with the photo upload feature so every outfit gets captured.",
    ],
  },
  "Drawing & Colouring Corner": {
    materials: ["Paper", "Crayons or colours", "A table"],
    steps: [
      "Set up a quiet table with paper and colours.",
      "Kids can drop in and out freely throughout the event.",
      "Optional: set a simple theme (\"draw your family\") and display finished pictures on a board.",
    ],
    tips: ["Pin finished drawings up on a wall or board — kids love seeing their art displayed."],
  },
  "Simplified Housie for Kids": {
    materials: ["Simple number cards (1–30)", "A caller"],
    steps: [
      "Give each child a card with a few numbers on it.",
      "The caller announces numbers one at a time.",
      "Kids mark or cover matching numbers.",
      "First to complete their card shouts out and wins a small prize.",
    ],
    tips: ["Keep the number range small and rounds short so younger kids stay engaged."],
  },
  "Card Games Corner (Rummy / UNO)": {
    materials: ["Card decks (Rummy, UNO, etc.)", "A table and chairs"],
    steps: [
      "Set up a relaxed table away from the main activity area.",
      "Anyone can join in for a casual game whenever they like.",
      "Rotate players in and out as people come and go.",
    ],
    tips: ["Keep 2–3 decks on hand — a great low-key option for guests who want a break from louder games."],
  },
  "Human Knot": {
    materials: ["None — just a group of 8–15 people"],
    steps: [
      "Stand in a circle, shoulder to shoulder.",
      "Everyone reaches across and grabs two different people's hands (not the person directly next to them).",
      "Without letting go, the group works together to untangle into a single circle or connected loop.",
    ],
    tips: ["Great icebreaker right at the start of the event, before other games.", "Offer hints if the group gets stuck."],
  },
  "Cricket / Backyard Sports": {
    materials: ["Bat, ball, stumps (or improvised equivalents)"],
    steps: [
      "Mark out a simple pitch and boundary.",
      "Pick teams, mixing ages and skill levels.",
      "Play an informal, low-stakes match — adjust rules for the space (tennis ball, underarm bowling for kids).",
    ],
    tips: ["Keep it casual and inclusive — rotate the batting order so everyone gets a turn."],
  },
};

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
        <span class="game-card-foot-actions">
          <button class="btn btn-ghost game-script-btn" data-script="${g.id}">${GAME_SCRIPTS[g.name]?.questions ? "🎤 Script & quiz" : "📜 Script"}</button>
          ${g.isSeed ? "" : `<button class="icon-action" data-del="${g.id}" title="Remove">🗑️</button>`}
        </span>
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
  $$("[data-script]", listEl).forEach((btn) =>
    btn.addEventListener("click", () => openGameScriptModal(games.find((g) => g.id === btn.dataset.script)))
  );
}

// -----------------------------------------------------------------------------
// Game script / interactive quiz-mode modal
// -----------------------------------------------------------------------------
function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function openGameScriptModal(game) {
  if (!game) return;
  const script = GAME_SCRIPTS[game.name];
  const quiz = {
    index: 0,
    revealed: false,
    order: script?.questions ? script.questions.map((_, i) => i) : [],
  };

  const renderBody = () => {
    const materialsHtml = script?.materials?.length
      ? `<h4 class="script-heading">🎒 What you'll need</h4><ul class="script-list">${script.materials
          .map((m) => `<li>${escapeHtml(m)}</li>`)
          .join("")}</ul>`
      : "";
    const stepsHtml = script?.steps?.length
      ? `<h4 class="script-heading">📋 How to run it</h4><ol class="script-list">${script.steps
          .map((s) => `<li>${escapeHtml(s)}</li>`)
          .join("")}</ol>`
      : "";
    const tipsHtml = script?.tips?.length
      ? `<h4 class="script-heading">💡 Hosting tips</h4><ul class="script-list">${script.tips
          .map((t) => `<li>${escapeHtml(t)}</li>`)
          .join("")}</ul>`
      : "";
    const noScriptHtml = !script
      ? `<p class="muted" style="margin-top:14px">No detailed script yet for this custom game — the description above is all we've got. Play it by ear!</p>`
      : "";

    let quizHtml = "";
    if (script?.questions?.length) {
      const qIdx = quiz.order[quiz.index];
      const q = script.questions[qIdx];
      quizHtml = `
      <h4 class="script-heading">🎤 Quiz mode — question ${quiz.index + 1} of ${script.questions.length}</h4>
      <div class="quiz-card">
        <div class="quiz-question">${escapeHtml(q.q)}</div>
        ${
          quiz.revealed
            ? `<div class="quiz-answer">✅ ${escapeHtml(q.a)}</div>`
            : `<button class="btn btn-ghost" id="quizRevealBtn">Reveal answer</button>`
        }
      </div>
      <div class="quiz-nav">
        <button class="btn btn-ghost" id="quizPrevBtn" ${quiz.index === 0 ? "disabled" : ""}>‹ Prev</button>
        <button class="btn btn-ghost" id="quizShuffleBtn">🔀 Shuffle</button>
        <button class="btn btn-ghost" id="quizNextBtn" ${quiz.index === script.questions.length - 1 ? "disabled" : ""}>Next ›</button>
      </div>`;
    }

    return `
      <h3>${script ? "📜" : "🎮"} ${escapeHtml(game.name)}</h3>
      <span class="game-cat-tag">${escapeHtml(game.category || "")}</span>
      <p class="game-desc" style="margin-top:8px">${escapeHtml(game.desc || "")}</p>
      <div class="game-meta">
        <span>👥 ${escapeHtml(game.groupSize || "Any")}</span>
        <span>⏱️ ${escapeHtml(game.duration || "")}</span>
        <span>🎒 ${escapeHtml(game.props || "None")}</span>
      </div>
      ${materialsHtml}${stepsHtml}${tipsHtml}${noScriptHtml}${quizHtml}
      <div class="modal-actions">
        <button class="btn btn-primary" id="scriptCloseBtn">Close</button>
      </div>
    `;
  };

  const mount = (root) => {
    $("#scriptCloseBtn", root).addEventListener("click", closeModal);
    const revealBtn = $("#quizRevealBtn", root);
    if (revealBtn)
      revealBtn.addEventListener("click", () => {
        quiz.revealed = true;
        rerender();
      });
    const prevBtn = $("#quizPrevBtn", root);
    if (prevBtn)
      prevBtn.addEventListener("click", () => {
        quiz.index = Math.max(0, quiz.index - 1);
        quiz.revealed = false;
        rerender();
      });
    const nextBtn = $("#quizNextBtn", root);
    if (nextBtn)
      nextBtn.addEventListener("click", () => {
        quiz.index = Math.min(script.questions.length - 1, quiz.index + 1);
        quiz.revealed = false;
        rerender();
      });
    const shuffleBtn = $("#quizShuffleBtn", root);
    if (shuffleBtn)
      shuffleBtn.addEventListener("click", () => {
        quiz.order = shuffleArray(script.questions.map((_, i) => i));
        quiz.index = 0;
        quiz.revealed = false;
        rerender();
      });
  };

  const rerender = () => {
    const content = $("#modalContent");
    if (!content) return;
    content.innerHTML = renderBody();
    mount(content);
  };

  openModal(renderBody(), { onMount: mount });
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
      <button class="btn btn-ghost" id="surpriseScript">📜 View script</button>
      <button class="btn btn-ghost" id="surpriseAgain">🎲 Roll again</button>
      <button class="btn btn-primary" id="surpriseClose">Let's go!</button>
    </div>
  `,
    {
      onMount: (root) => {
        $("#surpriseClose", root).addEventListener("click", closeModal);
        $("#surpriseScript", root).addEventListener("click", () => openGameScriptModal(pick));
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
// CREW & VOLUNTEERS (committee/logistics roster)
// =============================================================================
let crewRoles = [];
const SEED_CREW_ROLES = [
  "Setup crew (before event)",
  "Cleanup crew (after event)",
  "Food & serving crew",
  "Games & activities host",
];

function initCrewRoles() {
  const ref = query(collection(db, "crewRoles"), orderBy("createdAt", "asc"));
  onSnapshot(
    ref,
    async (snap) => {
      crewRoles = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (crewRoles.length === 0) {
        await seedCrewRolesIfEmpty();
        return; // the listener fires again once seeding completes
      }
      renderCrewRoles();
    },
    (err) => console.error("crewRoles listener:", err)
  );

  $("#crewRoleForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $("#crewRoleInput");
    const name = input.value.trim();
    if (!name) return;
    try {
      await addDoc(collection(db, "crewRoles"), {
        name,
        volunteers: [],
        isSeed: false,
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

let seedingCrew = false;
async function seedCrewRolesIfEmpty() {
  if (seedingCrew) return;
  const snap = await getDocs(collection(db, "crewRoles"));
  if (!snap.empty) return;
  seedingCrew = true;
  try {
    const batch = writeBatch(db);
    SEED_CREW_ROLES.forEach((name) => {
      const ref = doc(collection(db, "crewRoles"));
      batch.set(ref, { name, volunteers: [], isSeed: true, addedBy: "", createdAt: serverTimestamp() });
    });
    await batch.commit();
  } catch (err) {
    console.error("seeding crew roles failed:", err);
  } finally {
    seedingCrew = false;
  }
}

function renderCrewRoles() {
  const list = $("#crewRoleList");
  if (!crewRoles.length) {
    list.innerHTML = `<li class="muted">No roles yet — add one above.</li>`;
    return;
  }
  const myName = getMyName();
  list.innerHTML = crewRoles
    .map((r) => {
      const volunteers = r.volunteers || [];
      const joined = volunteers.includes(myName);
      return `
    <li class="crew-role-item">
      <div class="crew-role-head">
        <span class="crew-role-name">${escapeHtml(r.name)}</span>
        <span class="crew-role-actions">
          <button class="crew-join-btn ${joined ? "joined" : ""}" data-join="${r.id}">${joined ? "✓ Joined" : "Join"}</button>
          ${r.isSeed ? "" : `<button class="icon-action" data-del="${r.id}" title="Remove">🗑️</button>`}
        </span>
      </div>
      <div class="crew-volunteers">${
        volunteers.length ? "👥 " + escapeHtml(volunteers.join(", ")) : `<span class="none">No volunteers yet</span>`
      }</div>
    </li>`;
    })
    .join("");

  $$("[data-join]", list).forEach((btn) => btn.addEventListener("click", () => toggleCrewJoin(btn.dataset.join)));
  $$("[data-del]", list).forEach((btn) =>
    btn.addEventListener("click", () => {
      if (window.confirm("Remove this role?")) {
        deleteDoc(doc(db, "crewRoles", btn.dataset.del)).catch((err) => console.error(err));
      }
    })
  );
}

function toggleCrewJoin(id) {
  const r = crewRoles.find((x) => x.id === id);
  if (!r) return;
  const myName = getMyName();
  const joined = (r.volunteers || []).includes(myName);
  updateDoc(doc(db, "crewRoles", id), { volunteers: joined ? arrayRemove(myName) : arrayUnion(myName) }).catch((err) => {
    console.error(err);
    showToast("Couldn't update — check your connection");
  });
}

// =============================================================================
// COMMUNICATIONS (WhatsApp / email reminders)
// =============================================================================
function reminderMessageText() {
  const name = eventInfo.eventName || "our family get-together";
  const start = eventStartDateTime();
  const dateStr = start ? start.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "";
  const timeStr = eventTimeRangeLabel();
  const venue = eventInfo.venue || "";
  let msg = `Hi! Quick reminder about ${name}`;
  if (dateStr) msg += ` on ${dateStr}`;
  if (timeStr) msg += ` at ${timeStr}`;
  msg += ".";
  if (venue) msg += ` 📍 ${venue}.`;
  msg += " See you there! 🎉";
  return msg;
}

function initCommunications() {
  refreshShareLinks();
}

// Kept as real <a href> links (rather than JS-triggered navigation) so
// clicking behaves like any normal link — reliable across browsers and
// easy to verify. Call this whenever the event details change.
function refreshShareLinks() {
  const text = encodeURIComponent(reminderMessageText());
  const waLink = $("#shareWhatsappBtn");
  if (waLink) waLink.href = `https://wa.me/?text=${text}`;
  const subject = encodeURIComponent(`Reminder: ${eventInfo.eventName || "Family Get-Together"}`);
  const emailLink = $("#shareEmailBtn");
  if (emailLink) emailLink.href = `mailto:?subject=${subject}&body=${text}`;
}

function attendeeWhatsappHref(a) {
  if (!a || !a.phone) return "";
  const digits = a.phone.replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (!digits) return "";
  const text = encodeURIComponent(`Hi ${a.familyName}! ` + reminderMessageText());
  return `https://wa.me/${digits}?text=${text}`;
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
