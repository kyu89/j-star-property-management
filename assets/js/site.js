import { db } from "./firebase.js";
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { bindFormValidationToasts, showToast } from "./toast.js";

"use strict";

export const JSTAR = {
  email: "punyeramina@gmail.com",
  phone: "(484) 866-9728",
  address: "2317 Perkiomen Avenue, Mount Penn, PA 19606",
  collection: "properties",
  cloudName: "jwbxaqpg",
  uploadPreset: "jstar_property_uploads",
  types: ["Condo/Townhome", "Multi-Family", "Single-Family", "Industrial", "Office", "Retail", "Shopping Center", "Storage", "Parking Space"]
};
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export const money = v => "$" + Number(v || 0).toLocaleString("en-US");
export const beds = l => `${Number(l.beds) === 0 ? "Studio" : `${l.beds ?? 0} bd`} · ${l.baths || 0} ba${l.size ? " · " + Number(l.size).toLocaleString() + " sf" : ""}`;
let cachedListings = [];
let listingsReady = false;

export function photosOf(l) {
  if (Array.isArray(l.photos)) return l.photos.filter(Boolean);
  return l.photo ? [l.photo] : [];
}
export function firstPhoto(l) { return photosOf(l)[0] || ""; }

async function getPublicListings() {
  // This query must match the public-read condition in Firestore Rules.
  const q = query(collection(db, JSTAR.collection), where("status", "==", "available"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .filter(l => l.published !== false)
    .sort((a, b) => Number(!!b.featured) - Number(!!a.featured));
}
async function refreshPublicListings() {
  try {
    cachedListings = await getPublicListings();
    listingsReady = true;
    renderListings();
  } catch (err) {
    console.error("Could not load public property listings:", err);
    const target = $("#featured-listings") || $("#property-listings");
    if (target) target.innerHTML = '<div class="card"><p>Property listings could not be loaded right now. Please try again later or <a href="/pages/contact.html">contact us</a>.</p></div>';
  }
}
function activeListings() {
  return cachedListings.filter(l => l.status !== "rented" && l.published !== false)
    .sort((a, b) => Number(!!b.featured) - Number(!!a.featured));
}
function applyTheme(theme) {
  const dark = theme === "dark";
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  $$("#themeToggle, [data-admin-theme-toggle]").forEach(t => {
    const icon = $(".theme-toggle__icon i", t);
    icon.classList.toggle("fa-lightbulb", dark);
    icon.classList.toggle("fa-moon", !dark);
    $(".theme-toggle__label", t).textContent = dark ? "Light" : "Dark";
    t.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
  });
  try { localStorage.setItem("jstar-theme", dark ? "dark" : "light"); } catch {}
}
function initShared() {
  applyTheme(document.documentElement.dataset.theme);
  bindFormValidationToasts();
  const toggle = $("#menuToggle"), menu = $("#menu");
  toggle?.addEventListener("click", () => {
    const open = menu.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  $$("#themeToggle, [data-admin-theme-toggle]").forEach(toggle => {
    toggle.addEventListener("click", () => applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
  });
  const page = (location.pathname.split("/").pop() || "index.html").replace(".html", "");
  $$("[data-page]").forEach(a => { if (a.dataset.page === page) a.classList.add("active"); });
  $$("[data-year]").forEach(e => e.textContent = new Date().getFullYear());
}
function card(l) {
  const photo = firstPhoto(l);
  const bg = photo ? `style="background-image:url('${esc(photo)}')"` : "";
  return `<article class="lc"><div class="ph" ${bg}>${photo ? "" : "Photo coming soon"}</div><div class="b">${l.featured ? '<span class="tag" style="margin-bottom:8px">FEATURED</span>' : ""}<div class="price">${money(l.rent)}<span class="meta"> /mo</span></div><h3 style="margin:8px 0">${esc(l.address)}</h3><div class="meta">${esc(l.city)}, ${esc(l.state || "PA")} ${esc(l.zip || "")} · ${esc(l.type || "")}</div><div class="meta" style="margin:8px 0 16px">${esc(beds(l))}</div><div class="row" style="margin-top:auto;padding-top:16px"><button class="sm" type="button" data-details="${esc(l.id)}">View details</button><button class="btn sm outline" type="button" data-book="${esc(l.id)}">Book</button><a class="btn sm outline" href="/pages/apply.html?property=${encodeURIComponent(l.id)}">Apply</a><a class="btn sm outline" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${l.address}, ${l.city}, ${l.state || "PA"} ${l.zip || ""}`)}">Map</a></div></div></article>`;
}
function renderGrid(el, list, count) {
  if (!el) return;
  if (count) count.textContent = `${list.length} ${list.length === 1 ? "property" : "properties"} found`;
  el.innerHTML = list.length ? list.map(card).join("") : '<div class="card"><p>No properties match right now. Try different filters or <a href="/pages/contact.html">contact us</a>.</p></div>';
}
function renderListings() {
  if (!listingsReady) return;
  if ($("#featured-listings")) renderGrid($("#featured-listings"), activeListings().filter(x => x.featured).slice(0, 3));
  if ($("#property-listings")) {
    const p = new URLSearchParams(location.search);
    if (p.has("q") && $("#property-q")) $("#property-q").value = p.get("q");
    if (p.has("type") && $("#property-type")) $("#property-type").value = p.get("type");
    if (p.has("beds") && $("#property-beds")) $("#property-beds").value = p.get("beds");
    const update = () => {
      const q = ($("#property-q")?.value || "").trim().toLowerCase();
      const t = $("#property-type")?.value || "";
      const b = $("#property-beds")?.value || "";
      const m = $("#property-max")?.value || "";
      const list = activeListings().filter(l =>
        (`${l.address || ""} ${l.city || ""} ${l.zip || ""}`).toLowerCase().includes(q) &&
        (!t || l.type === t) &&
        (!b || (b === "4" ? Number(l.beds) >= 4 : Number(l.beds) === Number(b))) &&
        (!m || Number(l.rent) <= Number(m))
      );
      renderGrid($("#property-listings"), list, $("#results-count"));
    };
    $("#property-search-btn")?.addEventListener("click", update);
    $("#property-q")?.addEventListener("keydown", e => { if (e.key === "Enter") update(); });
    $("#property-type")?.addEventListener("change", update);
    $("#property-beds")?.addEventListener("change", update);
    $("#property-max")?.addEventListener("change", update);
    update();
  }
  $("#home-search-btn")?.addEventListener("click", () => {
    const p = new URLSearchParams(), q = $("#home-q")?.value.trim() || "", t = $("#home-type")?.value || "", b = $("#home-beds")?.value || "";
    if (q) p.set("q", q); if (t) p.set("type", t); if (b) p.set("beds", b);
    location.href = "/pages/properties.html" + (p.toString() ? "?" + p : "");
  });
}
function openDetails(id, focusBooking = false) {
  const l = activeListings().find(x => x.id === id);
  if (!l) return;
  const photos = photosOf(l);
  const photo = photos.length ? `<img src="${esc(photos[0])}" alt="Property at ${esc(l.address)}" style="width:100%;max-height:320px;object-fit:cover;border-radius:12px;margin-bottom:18px">` : "";
  const gallery = photos.length > 1 ? `<div class="g3" style="margin-bottom:16px">${photos.slice(1).map(url => `<img src="${esc(url)}" alt="Additional property photo" style="width:100%;height:120px;object-fit:cover;border-radius:10px">`).join("")}</div>` : "";
  const bookingForm = `<section class="booking-section" aria-labelledby="booking-heading"><h3 id="booking-heading">Book this property</h3><p>Send a booking request. The property remains available until J Star approves your request.</p><form id="booking-form" data-property-id="${esc(l.id)}"><div class="booking-fields"><div><label for="booking-name">Full name *</label><input id="booking-name" name="name" autocomplete="name" maxlength="100" required></div><div><label for="booking-email">Email *</label><input id="booking-email" name="email" type="email" autocomplete="email" maxlength="254" required></div><div><label for="booking-phone">Phone *</label><input id="booking-phone" name="phone" type="tel" autocomplete="tel" maxlength="30" required></div><div><label for="booking-move-in">Desired move-in date</label><input id="booking-move-in" name="moveInDate" type="date" min="${new Date().toISOString().slice(0, 10)}"></div><div><label for="booking-occupants">Number of occupants *</label><input id="booking-occupants" name="occupants" type="number" min="1" max="20" value="1" required></div><div class="booking-fields-wide"><label for="booking-message">Message</label><textarea id="booking-message" name="message" maxlength="2000" rows="3" placeholder="Anything you'd like us to know?"></textarea></div></div><label class="booking-honey" aria-hidden="true">Leave this field blank<input name="website" tabindex="-1" autocomplete="off"></label><p class="booking-feedback" id="booking-feedback" aria-live="polite"></p><button class="btn" type="submit">Submit booking request</button></form></section>`;
  const modal = $("#modal-root");
  modal.innerHTML = `<div class="modal-backdrop" data-close-modal><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">${photo}${gallery}<h2 id="modal-title">${esc(l.address)}</h2><p>${esc(l.city)}, ${esc(l.state || "PA")} ${esc(l.zip || "")}</p><div class="price">${money(l.rent)}<span class="meta"> /mo</span></div><p class="meta">${esc(beds(l))} · ${esc(l.type || "")}${l.available ? " · Available " + esc(l.available) : ""}</p><p style="white-space:pre-wrap">${esc(l.description || "Contact J Star for more information about this property.")}</p><div class="row"><a class="btn outline" href="/pages/apply.html?property=${encodeURIComponent(l.id)}">Apply online</a><button type="button" class="outline" data-close-modal>Close</button></div>${bookingForm}</div></div>`;
  if (focusBooking) $("#booking-name")?.focus();
}
function initListings() {
  const type = $("#home-type") || $("#property-type");
  const hasListingSurface = $("#featured-listings") || $("#property-listings") || $("#application-property");
  if (!hasListingSurface) return;
  if (type) type.innerHTML = '<option value="">Any type</option>' + JSTAR.types.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join("");
  refreshPublicListings();
}
function openGmailCompose(subject, body) {
  const params = new URLSearchParams({ view: "cm", fs: "1", to: JSTAR.email, su: subject, body });
  const url = `https://mail.google.com/mail/?${params.toString()}`;
  const gmailWindow = window.open(url, "_blank");
  if (gmailWindow) {
    gmailWindow.opener = null;
    return;
  }
  location.href = url;
}
function formatEmailBody(title, fields) {
  const labelWidth = Math.max(12, ...fields.map(([label]) => label.length));
  const details = fields
    .filter(([, value]) => String(value).trim())
    .map(([label, value]) => {
      const text = String(value).trim();
      if (text.includes("\n")) {
        return `${label.padEnd(labelWidth)}:\n${text.split(/\r?\n/).map(line => `  ${line}`).join("\n")}`;
      }
      return `${label.padEnd(labelWidth)}: ${text}`;
    })
    .join("\n\n");
  return [
    "J STAR PROPERTY MANAGEMENT",
    title.toUpperCase(),
    "-".repeat(48),
    "",
    details,
    "",
    "-".repeat(48),
    "Submitted through the J Star Property Management website.",
    `Phone: ${JSTAR.phone}`,
    `Email: ${JSTAR.email}`
  ].join("\n");
}
function formatFormFields(data) {
  return Object.entries(data).map(([key, value]) => [
    key.replace(/[_-]+/g, " ").replace(/\b\w/g, char => char.toUpperCase()),
    value
  ]);
}
function initMailForms() {
  $$(".mail-form").forEach(form => form.addEventListener("submit", e => {
    e.preventDefault(); if (!form.reportValidity()) return;
    const d = Object.fromEntries(new FormData(form).entries()), kind = form.dataset.form;
    const title = kind === "owner" ? "Owner Consultation Request" : kind === "maintenance" ? "Maintenance Request" : "Website Inquiry";
    const subject = kind === "owner" ? `${title} - ${d.name}` : kind === "maintenance" ? `${title} - ${d.name}` : `${title}: ${d.subject}`;
    const body = formatEmailBody(title, formatFormFields(d));
    openGmailCompose(subject, body);
    form.innerHTML = `<div class="ok"><strong>Gmail should have opened with your draft.</strong><br>Review the message and press Send. If Gmail does not open, email <a href="mailto:${JSTAR.email}">${JSTAR.email}</a> or call ${JSTAR.phone}.</div>`;
    showToast("Gmail draft prepared. Review it and press Send.");
  }));
}
function initApplication() {
  const select = $("#application-property"), form = $("#application-form");
  if (!select || !form) return;
  // The form is populated after the public listing query completes.
  const populate = () => {
    const listings = activeListings(), id = new URLSearchParams(location.search).get("property");
    select.innerHTML = '<option value="">Select a property</option><option value="not-sure">Not sure yet</option>' + listings.map(l => `<option value="${esc(l.id)}">${esc(l.address)} — ${esc(l.city)} (${money(l.rent)}/mo)</option>`).join("");
    if (id && listings.some(l => l.id === id)) select.value = id;
    else if (!listings.length) select.value = "not-sure";
  };
  populate();
  const previousRefresh = window.jstarOnListingsLoaded;
  window.jstarOnListingsLoaded = () => { populate(); previousRefresh?.(); };
  form.addEventListener("submit", e => {
    e.preventDefault(); if (!form.reportValidity()) return;
    const d = Object.fromEntries(new FormData(form).entries()), l = activeListings().find(x => x.id === select.value);
    const property = l ? `${l.address}, ${l.city}, ${l.state || "PA"}` : "Not sure yet";
    const subject = `Rental application: ${property} - ${d.first} ${d.last}`;
    const body = formatEmailBody("Rental Application", [
      ["Property", property],
      ...formatFormFields(Object.fromEntries(Object.entries(d).filter(([key]) => key !== "certify")))
    ]);
    openGmailCompose(subject, body);
    form.innerHTML = `<div class="ok"><strong>Gmail should have opened with your draft.</strong><br>Review the application and press Send. If Gmail does not open, email <a href="mailto:${JSTAR.email}">${JSTAR.email}</a>.</div>`;
    showToast("Gmail draft prepared. Review it and press Send.");
  });
}
function init() {
  initShared();
  $("#modal-root")?.addEventListener("click", e => { if (e.target.matches("[data-close-modal]")) $("#modal-root").innerHTML = ""; });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && $("#modal-root")) $("#modal-root").innerHTML = ""; });
  document.addEventListener("click", e => {
    const book = e.target.closest("[data-book]");
    const details = e.target.closest("[data-details]");
    if (book) openDetails(book.dataset.book, true);
    else if (details) openDetails(details.dataset.details);
  });
  $("#modal-root")?.addEventListener("submit", async e => {
    const form = e.target.closest("#booking-form");
    if (!form) return;
    e.preventDefault();
    const submit = $('button[type="submit"]', form);
    const feedback = $("#booking-feedback", form);
    const formData = new FormData(form);
    const body = Object.fromEntries(formData.entries());
    body.propertyId = form.dataset.propertyId;
    submit.disabled = true;
    feedback.textContent = "Submitting your booking request…";
    feedback.classList.remove("err");
    try {
      const response = await fetch("/.netlify/functions/submit-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not submit your booking. Please try again.");
      const emailNotice = result.emailSent
        ? "Your request is pending J Star's approval. The property remains available until approved."
        : `Your request is pending approval, but the admin email notification could not be sent. Please contact us at ${esc(JSTAR.phone)}.`;
      $("#modal-root").innerHTML = `<div class="modal-backdrop" data-close-modal><div class="modal booking-success" role="dialog" aria-modal="true" aria-labelledby="booking-success-heading"><h2 id="booking-success-heading">Booking request received</h2><p>${emailNotice}</p><button class="btn" type="button" data-close-modal>Done</button></div></div>`;
    } catch (err) {
      feedback.textContent = err.message || "Could not submit your booking. Please try again.";
      feedback.classList.add("err");
      submit.disabled = false;
    }
  });
  initListings(); initMailForms(); initApplication();
}
document.addEventListener("DOMContentLoaded", init);
