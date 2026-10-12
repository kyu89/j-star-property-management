let toastRegion;

function getToastRegion() {
  if (toastRegion?.isConnected) return toastRegion;
  toastRegion = document.createElement("div");
  toastRegion.className = "toast-region";
  toastRegion.setAttribute("aria-label", "Notifications");
  document.body.append(toastRegion);
  return toastRegion;
}

export function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.textContent = message;
  getToastRegion().append(toast);

  const remove = () => {
    toast.classList.add("toast-leaving");
    toast.addEventListener("transitionend", () => toast.remove(), { once: true });
    setTimeout(() => toast.remove(), 250);
  };

  const timeout = setTimeout(remove, 4500);
  toast.addEventListener("click", () => {
    clearTimeout(timeout);
    remove();
  }, { once: true });
}

export function bindFormValidationToasts(root = document) {
  const invalidForms = new WeakSet();
  root.addEventListener("invalid", event => {
    const form = event.target.form;
    if (!form || invalidForms.has(form)) return;
    invalidForms.add(form);
    showToast("Please check the highlighted fields and try again.", "error");
    setTimeout(() => invalidForms.delete(form), 500);
  }, true);
}
