import { db } from "./firebase.js";
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

"use strict";

export const JSTAR = {
  email: "jstarpm@gmail.com",
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
  return `<article class="lc"><div class="ph" ${bg}>${photo ? "" : "Photo coming soon"}</div><div class="b">${l.featured ? '<span class="tag" style="margin-bottom:8px">FEATURED</span>' : ""}<div class="price">${money(l.rent)}<span class="meta"> /mo</span></div><h3 style="margin:8px 0">${esc(l.address)}</h3><div class="meta">${esc(l.city)}, ${esc(l.state || "PA")} ${esc(l.zip || "")} · ${esc(l.type || "")}</div><div class="meta" style="margin:8px 0 16px">${esc(beds(l))}</div><div class="row" style="margin-top:auto;padding-top:16px"><button class="sm" type="button" data-details="${esc(l.id)}">View details</button><a class="btn sm outline" href="/pages/apply.html?property=${encodeURIComponent(l.id)}">Apply</a><a class="btn sm outline" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${l.address}, ${l.city}, ${l.state || "PA"} ${l.zip || ""}`)}">Map</a></div></div></article>`;
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
function openDetails(id) {
  const l = activeListings().find(x => x.id === id);
  if (!l) return;
  const photos = photosOf(l);
  const photo = photos.length ? `<img src="${esc(photos[0])}" alt="Property at ${esc(l.address)}" style="width:100%;max-height:320px;object-fit:cover;border-radius:12px;margin-bottom:18px">` : "";
  const gallery = photos.length > 1 ? `<div class="g3" style="margin-bottom:16px">${photos.slice(1).map(url => `<img src="${esc(url)}" alt="Additional property photo" style="width:100%;height:120px;object-fit:cover;border-radius:10px">`).join("")}</div>` : "";
  $("#modal-root").innerHTML = `<div class="modal-backdrop" data-close-modal><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">${photo}${gallery}<h2 id="modal-title">${esc(l.address)}</h2><p>${esc(l.city)}, ${esc(l.state || "PA")} ${esc(l.zip || "")}</p><div class="price">${money(l.rent)}<span class="meta"> /mo</span></div><p class="meta">${esc(beds(l))} · ${esc(l.type || "")}${l.available ? " · Available " + esc(l.available) : ""}</p><p style="white-space:pre-wrap">${esc(l.description || "Contact J Star for more information about this property.")}</p><div class="row"><a class="btn" href="/pages/apply.html?property=${encodeURIComponent(l.id)}">Apply online</a><button type="button" class="outline" data-close-modal>Close</button></div></div></div>`;
}
function initListings() {
  const type = $("#home-type") || $("#property-type");
  const hasListingSurface = $("#featured-listings") || $("#property-listings") || $("#application-property");
  if (!hasListingSurface) return;
  if (type) type.innerHTML = '<option value="">Any type</option>' + JSTAR.types.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join("");
  refreshPublicListings();
}
function mailto(subject, body) { location.href = `mailto:${JSTAR.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`; }
function initMailForms() {
  $$(".mail-form").forEach(form => form.addEventListener("submit", e => {
    e.preventDefault(); if (!form.reportValidity()) return;
    const d = Object.fromEntries(new FormData(form).entries()), kind = form.dataset.form;
    const subject = kind === "owner" ? `Owner consultation request - ${d.name}` : kind === "maintenance" ? `Maintenance request - ${d.name}` : `Website inquiry: ${d.subject}`;
    const body = Object.entries(d).map(([k, v]) => `${k}: ${v}`).join("\n");
    mailto(subject, body);
    form.innerHTML = `<div class="ok"><strong>Your email app should have opened.</strong><br>Review the message and press Send. If it did not open, email <a href="mailto:${JSTAR.email}">${JSTAR.email}</a> or call ${JSTAR.phone}.</div>`;
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
    const body = `Property: ${property}\n\n` + Object.entries(d).filter(([k]) => k !== "certify").map(([k, v]) => `${k}: ${v}`).join("\n");
    mailto(subject, body);
    form.innerHTML = `<div class="ok"><strong>Your email app should have opened.</strong><br>Review the application and press Send. If it did not open, email <a href="mailto:${JSTAR.email}">${JSTAR.email}</a>.</div>`;
  });
}
function init() {
  initShared();
  $("#modal-root")?.addEventListener("click", e => { if (e.target.matches("[data-close-modal]")) $("#modal-root").innerHTML = ""; });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && $("#modal-root")) $("#modal-root").innerHTML = ""; });
  document.addEventListener("click", e => { const b = e.target.closest("[data-details]"); if (b) openDetails(b.dataset.details); });
  initListings(); initMailForms(); initApplication();
}
document.addEventListener("DOMContentLoaded", init);
