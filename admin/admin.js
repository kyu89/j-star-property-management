import { auth, db } from "../assets/js/firebase.js";
import {
  collection, getDocs, onSnapshot, addDoc, updateDoc, deleteDoc, doc,
  query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import {
  onAuthStateChanged, signInWithEmailAndPassword, sendPasswordResetEmail, signOut
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { JSTAR, $, esc, money, beds, photosOf, firstPhoto } from "../assets/js/site.js";
import { showToast } from "../assets/js/toast.js";

function validateImageFiles(files) {
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  const invalidFile = files.find(file => !allowedTypes.includes(file.type));
  if (invalidFile) throw new Error(`${invalidFile.name} must be a JPG, PNG, or WebP image.`);
}

async function uploadImages(files) {
  validateImageFiles(files);
  const urls = [];
  for (const file of files) {
    if (file.size > 5 * 1024 * 1024) throw new Error(`${file.name} must be 5 MB or smaller.`);
    const data = new FormData();
    data.append("file", file);
    data.append("upload_preset", JSTAR.uploadPreset);
    const response = await fetch(`https://api.cloudinary.com/v1_1/${JSTAR.cloudName}/image/upload`, { method: "POST", body: data });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || "Image upload failed.");
    urls.push(result.secure_url);
  }
  return urls;
}

function setAdminMessage(message, error = false) {
  const el = $("#listing-error");
  if (el) {
    el.textContent = message;
    el.classList.toggle("err", error);
    el.classList.toggle("ok", !error && !!message);
  }
}

async function getAllAdminListings() {
  const snap = await getDocs(query(collection(db, JSTAR.collection), orderBy("createdAt", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function initAdmin() {
  const form = $("#listing-form");
  if (!form) return;
  const loginForm = $("#admin-login-form"), loginPanel = $("#admin-login-panel"), editor = $("#admin-editor");
  const status = $("#admin-auth-status");
  $("#listing-type").innerHTML = JSTAR.types.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join("");
  const setSignedIn = user => {
    if (loginPanel) loginPanel.hidden = !!user;
    if (editor) editor.hidden = !user;
    if (status) status.textContent = user ? `Signed in as ${user.email}` : "Sign in with your administrator account to manage listings.";
    const signedInStatus = $("#admin-auth-status-signed-in");
    if (signedInStatus) signedInStatus.textContent = user ? `Signed in as ${user.email}` : "";
  };
  const reset = () => {
    form.reset(); $("#listing-id").value = ""; $("#listing-state").value = "PA";
    $("#listing-beds").value = "1"; $("#listing-baths").value = "1";
    $("#admin-form-title").textContent = "Add a property"; $("#listing-cancel").hidden = true;
    $("#listing-error").textContent = ""; $("#listing-photos").value = "";
    $("#listing-photo-preview").innerHTML = "";
  };
  let adminListings = [];
  let adminBookings = [];
  let unsubscribeListings;
  const renderBookings = () => {
    const container = $("#admin-bookings");
    if (!container) return;
    container.innerHTML = adminBookings.map(booking => {
      const submittedAt = booking.createdAt ? new Date(booking.createdAt).toLocaleString() : "Date unavailable";
      return `<article class="listing-card booking-card"><div class="row" style="justify-content:space-between"><strong class="listing-card-title">${esc(booking.name)}</strong><span class="listing-badge booked">BOOKED</span></div><p><strong>${esc(booking.address)}</strong></p><p>${esc(booking.email)} · ${esc(booking.phone)}</p><p class="meta">Requested ${esc(submittedAt)} · ${Number(booking.occupants)} occupant(s)${booking.moveInDate ? ` · Move-in ${esc(booking.moveInDate)}` : ""}</p>${booking.message ? `<p class="booking-message">${esc(booking.message)}</p>` : ""}</article>`;
    }).join("") || '<p class="empty-state">No bookings yet.</p>';
  };
  const loadBookings = async () => {
    const container = $("#admin-bookings");
    try {
      const user = auth.currentUser;
      if (!user) return;
      const token = await user.getIdToken();
      const response = await fetch("/.netlify/functions/admin-bookings", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load bookings.");
      if (auth.currentUser !== user) return;
      adminBookings = result.bookings;
      renderBookings();
    } catch (err) {
      console.error("Could not load admin bookings:", err);
      if (container) container.innerHTML = '<p class="empty-state">Could not load bookings. Check the Netlify function configuration and admin account settings.</p>';
    }
  };
  const render = () => {
    $("#admin-total-count").textContent = String(adminListings.length);
    $("#admin-available-count").textContent = String(adminListings.filter(l => l.status === "available" && l.published !== false).length);
    $("#admin-booked-count").textContent = String(adminListings.filter(l => l.status === "booked").length);
    $("#admin-rented-count").textContent = String(adminListings.filter(l => l.status === "rented" || (l.published === false && l.status !== "booked")).length);
    $("#admin-listings").innerHTML = adminListings.map(l => {
      const photo = firstPhoto(l);
      const booked = l.status === "booked";
      const unavailable = l.status === "rented" || (l.published === false && !booked);
      const statusLabel = booked ? "BOOKED" : unavailable ? "RENTED" : "AVAILABLE";
      return `<article class="listing-card"><div class="row" style="justify-content:space-between"><strong class="listing-card-title">${esc(l.address)}</strong><span class="listing-badge${booked ? " booked" : unavailable ? " rented" : ""}">${statusLabel}</span></div>${photo ? `<img class="listing-card-photo" src="${esc(photo)}" alt="">` : ""}<p>${esc(l.city)}, ${esc(l.state || "PA")} · <strong>${money(l.rent)}/mo</strong></p><p class="meta">${esc(l.type)} · ${esc(beds(l))}</p><div class="listing-card-actions"><button class="button button-secondary" data-edit="${esc(l.id)}" type="button">Edit</button><button class="button delete-button" data-delete="${esc(l.id)}" type="button">Delete</button></div></article>`;
    }).join("") || '<p class="empty-state">No listings yet. Add your first property above.</p>';
  };
  const watchListings = () => {
    unsubscribeListings?.();
    unsubscribeListings = onSnapshot(
      query(collection(db, JSTAR.collection), orderBy("createdAt", "desc")),
      snapshot => {
        adminListings = snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
        render();
      },
      err => {
        console.error("Could not watch admin listings:", err);
        const message = "Could not refresh listings. Check Firestore rules for this administrator.";
        setAdminMessage(message, true);
        showToast(message, "error");
      }
    );
  };
  const load = async () => { adminListings = await getAllAdminListings(); render(); await loadBookings(); };
  $("#admin-refresh-bookings")?.addEventListener("click", loadBookings);
  loginForm?.addEventListener("submit", async e => {
    e.preventDefault();
    const btn = $('button[type="submit"]', loginForm);
    btn.disabled = true;
    try {
      await signInWithEmailAndPassword(auth, $("#admin-email").value.trim(), $("#admin-password").value);
      loginForm.reset(); setAdminMessage("");
      showToast("Signed in successfully.");
    } catch (err) {
      const message = "Sign-in failed. Check the email and password, and confirm Email/Password sign-in is enabled in Firebase Authentication.";
      $("#admin-login-error").textContent = message;
      showToast(message, "error");
    } finally { btn.disabled = false; }
  });
  $("#admin-forgot-password")?.addEventListener("click", async () => {
    const emailInput = $("#admin-email");
    emailInput.value = emailInput.value.trim();
    if (!emailInput.reportValidity()) return;

    const button = $("#admin-forgot-password");
    const messageEl = $("#admin-login-error");
    button.disabled = true;
    messageEl.textContent = "";
    try {
      await sendPasswordResetEmail(auth, emailInput.value);
      const message = "If an admin account exists for this email, a password reset link will be sent.";
      messageEl.textContent = message;
      showToast(message);
    } catch (err) {
      console.error("Could not send password reset email:", err);
      const message = "Could not send a password reset email. Check the email address and Firebase Authentication settings, then try again.";
      messageEl.textContent = message;
      showToast(message, "error");
    } finally { button.disabled = false; }
  });
  $("#admin-logout")?.addEventListener("click", async () => {
    try {
      await signOut(auth);
      showToast("Signed out successfully.");
    } catch (err) {
      console.error("Could not sign out:", err);
      showToast("Could not sign out. Please try again.", "error");
    }
  });
  onAuthStateChanged(auth, async user => {
    unsubscribeListings?.();
    unsubscribeListings = null;
    setSignedIn(user);
    if (!user) {
      adminListings = [];
      adminBookings = [];
      if ($("#admin-listings")) $("#admin-listings").innerHTML = "";
      if ($("#admin-bookings")) $("#admin-bookings").innerHTML = "";
      return;
    }
    try { await load(); watchListings(); }
    catch (err) {
      console.error(err);
      const message = "Could not load listings. Check that your Firestore rules allow this signed-in administrator to read the properties collection.";
      setAdminMessage(message, true);
      showToast(message, "error");
    }
  });
  $("#listing-photos")?.addEventListener("change", event => {
    const input = event.currentTarget;
    const preview = $("#listing-photo-preview");
    const files = [...input.files];
    try {
      validateImageFiles(files);
      setAdminMessage("");
      preview.innerHTML = files.map(f => `<span class="meta">${esc(f.name)}</span>`).join(" · ");
    } catch (err) {
      input.value = "";
      preview.textContent = "";
      setAdminMessage(err.message, true);
      showToast(err.message, "error");
    }
  });
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) {
      setAdminMessage("Please sign in first.", true);
      showToast("Please sign in first.", "error");
      return;
    }
    const submit = $('button[type="submit"]', form);
    submit.disabled = true; setAdminMessage("Saving listing and uploading photos…");
    try {
      const id = $("#listing-id").value;
      const existing = adminListings.find(l => l.id === id);
      const chosenFiles = [...($("#listing-photos")?.files || [])];
      const uploaded = chosenFiles.length ? await uploadImages(chosenFiles) : [];
      const existingPhotos = existing ? photosOf(existing) : [];
      const photos = [...existingPhotos, ...uploaded];
      const listing = {
        address: $("#listing-address").value.trim(),
        city: $("#listing-city").value.trim(),
        state: $("#listing-state").value.trim().toUpperCase() || "PA",
        zip: $("#listing-zip").value.trim(),
        rent: Number($("#listing-rent").value),
        type: $("#listing-type").value,
        beds: Number($("#listing-beds").value || 0),
        baths: Number($("#listing-baths").value || 0),
        size: Number($("#listing-size").value || 0),
        available: $("#listing-available").value,
        status: $("#listing-status").value,
        photo: photos[0] || "",
        photos,
        description: $("#listing-description").value.trim(),
        featured: $("#listing-featured").checked,
        published: $("#listing-status").value === "available",
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid
      };
      if (!listing.address || !listing.city || !listing.rent) throw new Error("Street address, city and rent are required.");
      if (id) await updateDoc(doc(db, JSTAR.collection, id), listing);
      else await addDoc(collection(db, JSTAR.collection), { ...listing, createdAt: serverTimestamp() });
      await load(); reset(); setAdminMessage("Listing saved successfully.");
      showToast("Listing saved successfully.");
    } catch (err) {
      console.error(err);
      const message = err.message || "Could not save the listing. Check Firestore rules and Cloudinary upload settings.";
      setAdminMessage(message, true);
      showToast(message, "error");
    } finally { submit.disabled = false; }
  });
  $("#listing-cancel")?.addEventListener("click", reset);
  $("#admin-listings")?.addEventListener("click", async e => {
    const edit = e.target.closest("[data-edit]"), del = e.target.closest("[data-delete]");
    if (edit) {
      const listing = adminListings.find(x => x.id === edit.dataset.edit);
      if (!listing) return;
      for (const [id, key] of [["listing-address","address"],["listing-city","city"],["listing-state","state"],["listing-zip","zip"],["listing-rent","rent"],["listing-type","type"],["listing-beds","beds"],["listing-baths","baths"],["listing-size","size"],["listing-available","available"],["listing-status","status"],["listing-description","description"]]) $("#" + id).value = listing[key] ?? "";
      $("#listing-featured").checked = !!listing.featured;
      $("#listing-id").value = listing.id;
      $("#admin-form-title").textContent = "Edit property";
      $("#listing-cancel").hidden = false;
      $("#listing-photo-preview").textContent = `${photosOf(listing).length} existing photo(s). Newly selected photos will be added.`;
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    if (del && confirm("Delete this property listing from Firestore?")) {
      try {
        await deleteDoc(doc(db, JSTAR.collection, del.dataset.delete));
        await load();
        setAdminMessage("Listing deleted.");
        showToast("Listing deleted.");
      } catch (err) {
        console.error(err);
        const message = "Could not delete this listing. Check Firestore rules.";
        setAdminMessage(message, true);
        showToast(message, "error");
      }
    }
  });
}

document.addEventListener("DOMContentLoaded", initAdmin);
