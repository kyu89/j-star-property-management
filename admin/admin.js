import { auth, db } from "../assets/js/firebase.js";
import {
  collection, getDocs, onSnapshot, addDoc, updateDoc, deleteDoc, deleteField, doc,
  query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import {
  onAuthStateChanged, signInWithEmailAndPassword, sendPasswordResetEmail, signOut
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { JSTAR, $, $$, esc, money, rentRange, beds, photosOf, firstPhoto } from "../assets/js/site.js";
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
  let retainedPhotos = [];
  let selectedPhotoFiles = [];
  const renderPhotoPreview = () => {
    const preview = $("#listing-photo-preview");
    if (!preview) return;
    const existing = retainedPhotos.map((url, index) =>
      `<div class="photo-preview-item"><img src="${esc(url)}" alt="Existing property photo ${index + 1}"><button class="button button-secondary" type="button" data-remove-existing-photo="${index}" aria-label="Remove existing photo ${index + 1}">Remove</button></div>`
    );
    const selected = selectedPhotoFiles.map((file, index) =>
      `<div class="photo-preview-item photo-preview-file"><span class="meta">${esc(file.name)}</span><button class="button button-secondary" type="button" data-remove-selected-photo="${index}" aria-label="Remove ${esc(file.name)}">Remove</button></div>`
    );
    preview.innerHTML = existing.concat(selected).join("") ||
      '<span class="meta">No photos selected. Removing a photo takes effect when you save the listing.</span>';
  };
  const reset = () => {
    form.reset(); $("#listing-id").value = ""; $("#listing-state").value = "PA";
    $("#listing-beds").value = "1"; $("#listing-baths").value = "1";
    $("#admin-form-title").textContent = "Add a property"; $("#listing-cancel").hidden = true;
    $("#listing-error").textContent = ""; $("#listing-photos").value = "";
    retainedPhotos = [];
    selectedPhotoFiles = [];
    renderPhotoPreview();
  };
  let adminListings = [];
  let unsubscribeListings;
  const render = () => {
    $("#admin-total-count").textContent = String(adminListings.length);
    const availableListings = adminListings.filter(l => l.status === "available" && l.published !== false);
    const unavailableListings = adminListings.filter(l => l.status === "booked" || l.status === "rented" || l.published === false);
    $("#admin-available-count").textContent = String(availableListings.length);
    $("#admin-booked-count").textContent = String(adminListings.filter(l => l.status === "booked").length);
    $("#admin-rented-count").textContent = String(adminListings.filter(l => l.status === "rented" || (l.published === false && l.status !== "booked")).length);
    const renderListingCards = (listings, emptyMessage) => listings.map(l => {
      const photo = firstPhoto(l);
      const booked = l.status === "booked";
      const unavailable = l.status === "rented" || (l.published === false && !booked);
      const statusLabel = booked ? "BOOKED" : unavailable ? "RENTED" : "AVAILABLE";
      const viewingHours = Array.isArray(l.viewingDays) && l.viewingDays.length && l.viewingStartTime && l.viewingEndTime
        ? ` · Viewings ${esc(l.viewingDays.join(", "))} ${esc(l.viewingStartTime)}–${esc(l.viewingEndTime)}`
        : "";
      const restoreButton = unavailable
        ? `<button class="button button-primary" data-mark-available="${esc(l.id)}" type="button">Mark available</button>`
        : "";
      return `<article class="listing-card"><div class="row" style="justify-content:space-between"><strong class="listing-card-title">${esc(l.address)}</strong><span class="listing-badge${booked ? " booked" : unavailable ? " rented" : ""}">${statusLabel}</span></div>${photo ? `<img class="listing-card-photo" src="${esc(photo)}" alt="">` : ""}<p>${esc(l.city)}, ${esc(l.state || "PA")} · <strong>${rentRange(l)}/mo</strong></p><p class="meta">${esc(l.type)} · ${esc(beds(l))}${l.available ? ` · Move-in from ${esc(l.available)}` : ""}${viewingHours}</p><div class="listing-card-actions">${restoreButton}<button class="button button-secondary" data-edit="${esc(l.id)}" type="button">Edit</button><button class="button delete-button" data-delete="${esc(l.id)}" type="button">Delete</button></div></article>`;
    }).join("") || `<p class="empty-state">${emptyMessage}</p>`;
    $("#admin-listings").innerHTML = renderListingCards(availableListings, "No available properties. When an unavailable listing is marked available, it will appear here.");
    $("#admin-unavailable-listings").innerHTML = renderListingCards(unavailableListings, "No booked or rented properties.");
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
  const load = async () => { adminListings = await getAllAdminListings(); render(); };
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
      if ($("#admin-listings")) $("#admin-listings").innerHTML = "";
      if ($("#admin-unavailable-listings")) $("#admin-unavailable-listings").innerHTML = "";
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
    const files = [...input.files];
    try {
      validateImageFiles(files);
      setAdminMessage("");
      selectedPhotoFiles.push(...files);
      input.value = "";
      renderPhotoPreview();
    } catch (err) {
      input.value = "";
      setAdminMessage(err.message, true);
      showToast(err.message, "error");
    }
  });
  $("#listing-photo-preview")?.addEventListener("click", event => {
    const removeExisting = event.target.closest("[data-remove-existing-photo]");
    const removeSelected = event.target.closest("[data-remove-selected-photo]");
    if (removeExisting) retainedPhotos.splice(Number(removeExisting.dataset.removeExistingPhoto), 1);
    if (removeSelected) selectedPhotoFiles.splice(Number(removeSelected.dataset.removeSelectedPhoto), 1);
    if (removeExisting || removeSelected) renderPhotoPreview();
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
      const uploaded = selectedPhotoFiles.length ? await uploadImages(selectedPhotoFiles) : [];
      const photos = [...retainedPhotos, ...uploaded];
      const listing = {
        address: $("#listing-address").value.trim(),
        city: $("#listing-city").value.trim(),
        state: $("#listing-state").value.trim().toUpperCase() || "PA",
        zip: $("#listing-zip").value.trim(),
        rent: Number($("#listing-rent-min").value),
        rentMin: Number($("#listing-rent-min").value),
        rentMax: Number($("#listing-rent-max").value),
        type: $("#listing-type").value,
        beds: Number($("#listing-beds").value || 0),
        baths: Number($("#listing-baths").value || 0),
        size: Number($("#listing-size").value || 0),
        available: $("#listing-available").value,
        viewingDays: $$('input[name="listing-viewing-days"]:checked', form).map(input => input.value),
        viewingStartTime: $("#listing-viewing-start").value,
        viewingEndTime: $("#listing-viewing-end").value,
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
      if (!listing.address || !listing.city || !listing.rentMin || !listing.rentMax) throw new Error("Street address, city, and minimum and maximum rent are required.");
      if (listing.rentMin > listing.rentMax) throw new Error("Minimum rent cannot be higher than maximum rent.");
      const hasViewingDetails = listing.viewingDays.length || listing.viewingStartTime || listing.viewingEndTime;
      if (hasViewingDetails &&
          (!listing.viewingDays.length || !listing.viewingStartTime || !listing.viewingEndTime ||
           listing.viewingStartTime >= listing.viewingEndTime)) {
        throw new Error("Select viewing days and a valid start and end time.");
      }
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
  const handleListingAction = async e => {
    const markAvailable = e.target.closest("[data-mark-available]");
    if (markAvailable) {
      markAvailable.disabled = true;
      try {
        await updateDoc(doc(db, JSTAR.collection, markAvailable.dataset.markAvailable), {
          status: "available",
          published: true,
          bookingId: deleteField(),
          bookedAt: deleteField(),
          updatedAt: new Date().toISOString(),
          updatedBy: auth.currentUser?.uid || ""
        });
        await load();
        showToast("Property is available and has been returned to the available listings.");
      } catch (error) {
        console.error("Could not mark property available:", error);
        showToast("Could not mark this property available. Check Firestore rules and try again.", "error");
        markAvailable.disabled = false;
      }
      return;
    }
    const edit = e.target.closest("[data-edit]"), del = e.target.closest("[data-delete]");
    if (edit) {
      const listing = adminListings.find(x => x.id === edit.dataset.edit);
      if (!listing) return;
      for (const [id, key] of [["listing-address","address"],["listing-city","city"],["listing-state","state"],["listing-zip","zip"],["listing-rent-min","rentMin"],["listing-rent-max","rentMax"],["listing-type","type"],["listing-beds","beds"],["listing-baths","baths"],["listing-size","size"],["listing-available","available"],["listing-status","status"],["listing-viewing-start","viewingStartTime"],["listing-viewing-end","viewingEndTime"],["listing-description","description"]]) $("#" + id).value = listing[key] ?? (key === "rentMin" || key === "rentMax" ? listing.rent ?? "" : "");
      $$('input[name="listing-viewing-days"]', form).forEach(input => {
        input.checked = Array.isArray(listing.viewingDays) && listing.viewingDays.includes(input.value);
      });
      $("#listing-featured").checked = !!listing.featured;
      $("#listing-id").value = listing.id;
      $("#admin-form-title").textContent = "Edit property";
      $("#listing-cancel").hidden = false;
      retainedPhotos = [...photosOf(listing)];
      selectedPhotoFiles = [];
      renderPhotoPreview();
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
  };
  $("#admin-listings")?.addEventListener("click", handleListingAction);
  $("#admin-unavailable-listings")?.addEventListener("click", handleListingAction);
}

document.addEventListener("DOMContentLoaded", initAdmin);
