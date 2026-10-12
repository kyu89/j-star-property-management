import { auth, db } from "../assets/js/firebase.js";
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc,
  query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import {
  onAuthStateChanged, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { JSTAR, $, esc, money, beds, photosOf, firstPhoto } from "../assets/js/site.js";
import { showToast } from "../assets/js/toast.js";

async function uploadImages(files) {
  const urls = [];
  for (const file of files) {
    if (!file.type.startsWith("image/")) throw new Error(`${file.name} is not an image file.`);
    if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name} is over the 10 MB limit.`);
    const data = new FormData();
    data.append("file", file);
    data.append("upload_preset", JSTAR.uploadPreset);
    data.append("folder", "jstar-properties");
    const response = await fetch(`https://api.cloudinary.com/v1_1/${JSTAR.cloudName}/image/upload`, { method: "POST", body: data });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || `Upload failed for ${file.name}.`);
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
  const render = () => {
    $("#admin-total-count").textContent = String(adminListings.length);
    $("#admin-available-count").textContent = String(adminListings.filter(l => l.status !== "rented" && l.published !== false).length);
    $("#admin-rented-count").textContent = String(adminListings.filter(l => l.status === "rented" || l.published === false).length);
    $("#admin-listings").innerHTML = adminListings.map(l => {
      const photo = firstPhoto(l);
      const rented = l.status === "rented" || l.published === false;
      return `<article class="listing-card"><div class="row" style="justify-content:space-between"><strong class="listing-card-title">${esc(l.address)}</strong><span class="listing-badge${rented ? " rented" : ""}">${rented ? "RENTED" : "AVAILABLE"}</span></div>${photo ? `<img class="listing-card-photo" src="${esc(photo)}" alt="">` : ""}<p>${esc(l.city)}, ${esc(l.state || "PA")} · <strong>${money(l.rent)}/mo</strong></p><p class="meta">${esc(l.type)} · ${esc(beds(l))}</p><div class="listing-card-actions"><button class="button button-secondary" data-edit="${esc(l.id)}" type="button">Edit</button><button class="button delete-button" data-delete="${esc(l.id)}" type="button">Delete</button></div></article>`;
    }).join("") || '<p class="empty-state">No listings yet. Add your first property above.</p>';
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
    setSignedIn(user);
    if (!user) { adminListings = []; if ($("#admin-listings")) $("#admin-listings").innerHTML = ""; return; }
    try { await load(); }
    catch (err) {
      console.error(err);
      const message = "Could not load listings. Check that your Firestore rules allow this signed-in administrator to read the properties collection.";
      setAdminMessage(message, true);
      showToast(message, "error");
    }
  });
  $("#listing-photos")?.addEventListener("change", () => {
    const preview = $("#listing-photo-preview");
    const files = [...$("#listing-photos").files];
    preview.innerHTML = files.map(f => `<span class="meta">${esc(f.name)}</span>`).join(" · ");
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
