'use strict';

const JSTAR = {
  email: 'jstarpm@gmail.com',
  phone: '(484) 866-9728',
  address: '2317 Perkiomen Avenue, Mount Penn, PA 19606',
  storageKey: 'jstar-listings-v1',
  types: [
    'Condo/Townhome',
    'Multi-Family',
    'Single-Family',
    'Industrial',
    'Office',
    'Retail',
    'Shopping Center',
    'Storage',
    'Parking Space'
  ]
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const esc = v =>
  String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]);

const money = v => '$' + Number(v || 0).toLocaleString('en-US');

const beds = l =>
  `${Number(l.beds) === 0 ? 'Studio' : `${l.beds} bd`} · ${l.baths || 0} ba${l.size ? ' · ' + Number(l.size).toLocaleString() + ' sf' : ''}`;

// ========================================
// PROPERTY STORAGE
// ========================================

function readListings() {
  try {
    return JSON.parse(localStorage.getItem(JSTAR.storageKey) || '[]');
  } catch (e) {
    return [];
  }
}

function saveListings(list) {
  localStorage.setItem(JSTAR.storageKey, JSON.stringify(list));
}

function activeListings() {
  return readListings()
    .filter(x => x.status !== 'rented')
    .sort((a, b) => Number(!!b.featured) - Number(!!a.featured));
}

// ========================================
// LIGHT AND DARK THEME
// ========================================

function applyTheme(theme) {
  const dark = theme === 'dark';

  document.documentElement.setAttribute(
    'data-theme',
    dark ? 'dark' : 'light'
  );

  const toggle = $('#themeToggle');

  if (toggle) {
    const icon = $('.theme-toggle__icon', toggle);
    const label = $('.theme-toggle__label', toggle);

    if (icon) {
      icon.innerHTML = dark
        ? '<i class="fas fa-sun"></i>'
        : '<i class="fas fa-moon"></i>';
    }

    if (label) {
      label.textContent = dark ? 'Light' : 'Dark';
    }

    toggle.setAttribute(
      'aria-label',
      dark ? 'Switch to light theme' : 'Switch to dark theme'
    );
  }

  try {
    localStorage.setItem('jstar-theme', dark ? 'dark' : 'light');
  } catch (e) {}
}

function initTheme() {
  let savedTheme = 'light';

  try {
    const storedTheme = localStorage.getItem('jstar-theme');

    if (storedTheme === 'dark' || storedTheme === 'light') {
      savedTheme = storedTheme;
    } else {
      const currentTheme = document.documentElement.dataset.theme;

      if (currentTheme === 'dark' || currentTheme === 'light') {
        savedTheme = currentTheme;
      }
    }
  } catch (e) {
    const currentTheme = document.documentElement.dataset.theme;

    if (currentTheme === 'dark' || currentTheme === 'light') {
      savedTheme = currentTheme;
    }
  }

  applyTheme(savedTheme);

  $('#themeToggle')?.addEventListener('click', () => {
    const currentTheme = document.documentElement.dataset.theme;

    applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
  });
}

// ========================================
// SHARED NAVIGATION AND PAGE ELEMENTS
// ========================================

function initShared() {
  const toggle = $('#menuToggle');
  const menu = $('#menu');

  toggle?.addEventListener('click', () => {
    const open = menu.classList.toggle('open');

    toggle.setAttribute('aria-expanded', String(open));
  });

  // Highlight the current navigation link.
  const page = (location.pathname.split('/').pop() || 'index.html')
    .replace('.html', '');

  $$('[data-page]').forEach(a => {
    if (a.dataset.page === page) {
      a.classList.add('active');
    }
  });

  // Automatically update the copyright year.
  $$('[data-year]').forEach(e => {
    e.textContent = new Date().getFullYear();
  });
}

// ========================================
// PROPERTY CARDS
// ========================================

function card(l) {
  const photo = l.photo
    ? `style="background-image:url('${esc(l.photo)}')"`
    : '';

  return `
    <article class="lc">
      <div class="ph" ${photo}>
        ${l.photo ? '' : 'Photo coming soon'}
      </div>

      <div class="b">
        ${
          l.featured
            ? '<span class="tag" style="margin-bottom: 8px">FEATURED</span>'
            : ''
        }

        <div class="price">
          ${money(l.rent)}
          <span class="meta"> /mo</span>
        </div>

        <h3 style="margin: 8px 0">
          ${esc(l.address)}
        </h3>

        <div class="meta">
          ${esc(l.city)}, ${esc(l.state || 'PA')}
          ${esc(l.zip || '')} · ${esc(l.type || '')}
        </div>

        <div class="meta" style="margin: 8px 0 16px">
          ${esc(beds(l))}
        </div>

        <div class="row" style="margin-top: auto; padding-top: 16px">
          <button
            class="sm"
            type="button"
            data-details="${esc(l.id)}"
          >
            View details
          </button>

          <a
            class="btn sm outline"
            href="apply.html?property=${encodeURIComponent(l.id)}"
          >
            Apply
          </a>

          <a
            class="btn sm outline"
            target="_blank"
            rel="noopener"
            href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${l.address}, ${l.city}, ${l.state || 'PA'} ${l.zip || ''}`)}"
          >
            Map
          </a>
        </div>
      </div>
    </article>
  `;
}

function renderGrid(el, list, count) {
  if (!el) return;

  if (count) {
    count.textContent = `${list.length} ${
      list.length === 1 ? 'property' : 'properties'
    } found`;
  }

  el.innerHTML = list.length
    ? list.map(card).join('')
    : `
      <div class="card">
        <p>
          No properties match right now. Try different filters or
          <a href="contact.html">contact us</a>.
        </p>
      </div>
    `;
}

// ========================================
// PROPERTY DETAILS MODAL
// ========================================

function openDetails(id) {
  const l = activeListings().find(x => x.id === id);

  if (!l) return;

  const photo = l.photo
    ? `
      <img
        src="${esc(l.photo)}"
        alt="Property at ${esc(l.address)}"
        style="width: 100%; max-height: 320px; object-fit: cover; border-radius: 12px; margin-bottom: 18px"
      >
    `
    : '';

  $('#modal-root').innerHTML = `
    <div class="modal-backdrop" data-close-modal>
      <div
        class="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        ${photo}

        <h2 id="modal-title">
          ${esc(l.address)}
        </h2>

        <p>
          ${esc(l.city)}, ${esc(l.state || 'PA')} ${esc(l.zip || '')}
        </p>

        <div class="price">
          ${money(l.rent)}
          <span class="meta"> /mo</span>
        </div>

        <p class="meta">
          ${esc(beds(l))} · ${esc(l.type || '')}
          ${l.available ? ' · Available ' + esc(l.available) : ''}
        </p>

        <p style="white-space: pre-wrap">
          ${esc(l.description || 'Contact J Star for more information about this property.')}
        </p>

        <div class="row">
          <a
            class="btn"
            href="apply.html?property=${encodeURIComponent(l.id)}"
          >
            Apply online
          </a>

          <button
            type="button"
            class="outline"
            data-close-modal
          >
            Close
          </button>
        </div>
      </div>
    </div>
  `;
}

// ========================================
// PROPERTY SEARCH AND LISTINGS
// ========================================

function initListings() {
  const type = $('#home-type') || $('#property-type');

  if (type) {
    type.innerHTML = '<option value="">Any type</option>' +
      JSTAR.types.map(t => `
        <option value="${esc(t)}">${esc(t)}</option>
      `).join('');
  }

  if ($('#featured-listings')) {
    renderGrid(
      $('#featured-listings'),
      activeListings().filter(x => x.featured).slice(0, 3)
    );
  }

  if ($('#property-listings')) {
    const p = new URLSearchParams(location.search);

    if (p.has('q')) {
      $('#property-q').value = p.get('q');
    }

    if (p.has('type')) {
      $('#property-type').value = p.get('type');
    }

    if (p.has('beds')) {
      $('#property-beds').value = p.get('beds');
    }

    const update = () => {
      const q = ($('#property-q').value || '').trim().toLowerCase();
      const t = $('#property-type').value;
      const b = $('#property-beds').value;
      const m = $('#property-max').value;

      const list = activeListings().filter(l =>
        `${l.address} ${l.city} ${l.zip}`.toLowerCase().includes(q) &&
        (!t || l.type === t) &&
        (!b || (
          b === '4'
            ? Number(l.beds) >= 4
            : Number(l.beds) === Number(b)
        )) &&
        (!m || Number(l.rent) <= Number(m))
      );

      renderGrid(
        $('#property-listings'),
        list,
        $('#results-count')
      );
    };

    $('#property-search-btn').addEventListener('click', update);

    $('#property-q').addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        update();
      }
    });

    update();
  }

  $('#home-search-btn')?.addEventListener('click', () => {
    const p = new URLSearchParams();
    const q = $('#home-q').value.trim();
    const t = $('#home-type').value;
    const b = $('#home-beds').value;

    if (q) p.set('q', q);
    if (t) p.set('type', t);
    if (b) p.set('beds', b);

    location.href = 'properties.html' + (p.toString() ? '?' + p : '');
  });
}

// ========================================
// EMAIL FORMS
// ========================================

function mailto(subject, body) {
  location.href =
    `mailto:${JSTAR.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function initMailForms() {
  $$('.mail-form').forEach(form => {
    form.addEventListener('submit', e => {
      e.preventDefault();

      if (!form.reportValidity()) return;

      const d = Object.fromEntries(new FormData(form).entries());
      const kind = form.dataset.form;

      const subject = kind === 'owner'
        ? `Owner consultation request - ${d.name}`
        : kind === 'maintenance'
          ? `Maintenance request - ${d.name}`
          : `Website inquiry: ${d.subject}`;

      const body = Object.entries(d)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n');

      mailto(subject, body);

      form.innerHTML = `
        <div class="ok">
          <strong>Your email app should have opened.</strong>
          <br>
          Review the message and press Send. If it did not open, email
          <a href="mailto:${JSTAR.email}">${JSTAR.email}</a>
          or call ${JSTAR.phone}.
        </div>
      `;
    });
  });
}

// ========================================
// RENTAL APPLICATION
// ========================================

function initApplication() {
  const select = $('#application-property');
  const form = $('#application-form');

  if (!select || !form) return;

  const listings = activeListings();
  const id = new URLSearchParams(location.search).get('property');

  select.innerHTML = `
    <option value="">Select a property</option>
    <option value="not-sure">Not sure yet</option>
  ` + listings.map(l => `
    <option value="${esc(l.id)}">
      ${esc(l.address)} — ${esc(l.city)} (${money(l.rent)}/mo)
    </option>
  `).join('');

  if (id && listings.some(l => l.id === id)) {
    select.value = id;
  } else if (!listings.length) {
    select.value = 'not-sure';
  }

  form.addEventListener('submit', e => {
    e.preventDefault();

    if (!form.reportValidity()) return;

    const d = Object.fromEntries(new FormData(form).entries());
    const l = listings.find(x => x.id === select.value);

    const property = l
      ? `${l.address}, ${l.city}, ${l.state || 'PA'}`
      : 'Not sure yet';

    const subject =
      `Rental application: ${property} - ${d.first} ${d.last}`;

    const body = `Property: ${property}\n\n` +
      Object.entries(d)
        .filter(([k]) => k !== 'certify')
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n');

    mailto(subject, body);

    form.innerHTML = `
      <div class="ok">
        <strong>Your email app should have opened.</strong>
        <br>
        Review the application and press Send. If it did not open, email
        <a href="mailto:${JSTAR.email}">${JSTAR.email}</a>.
      </div>
    `;
  });
}

// ========================================
// ADMIN PROPERTY MANAGEMENT
// ========================================

function initAdmin() {
  const form = $('#listing-form');

  if (!form) return;

  $('#listing-type').innerHTML = JSTAR.types.map(t => `
    <option>${esc(t)}</option>
  `).join('');

  const reset = () => {
    form.reset();

    $('#listing-id').value = '';
    $('#listing-state').value = 'PA';
    $('#listing-beds').value = '1';
    $('#listing-baths').value = '1';
    $('#admin-form-title').textContent = 'Add a property';
    $('#listing-error').textContent = '';
  };

  const render = () => {
    $('#admin-listings').innerHTML = readListings().map(l => `
      <article class="card">
        <div class="row" style="justify-content: space-between">
          <strong>${esc(l.address)}</strong>

          ${
            l.status === 'rented'
              ? '<span class="tag">RENTED</span>'
              : ''
          }
        </div>

        <p>
          ${esc(l.city)}, ${esc(l.state || 'PA')} · ${money(l.rent)}/mo
        </p>

        <p class="meta">
          ${esc(l.type)} · ${esc(beds(l))}
        </p>

        <div class="row">
          <button
            class="sm"
            data-edit="${esc(l.id)}"
            type="button"
          >
            Edit
          </button>

          <button
            class="sm outline"
            data-delete="${esc(l.id)}"
            type="button"
          >
            Delete
          </button>
        </div>
      </article>
    `).join('') || `
      <div class="card">
        <p>No listings yet. Add your first property above.</p>
      </div>
    `;
  };

  form.addEventListener('submit', e => {
    e.preventDefault();

    const id = $('#listing-id').value ||
      (crypto.randomUUID
        ? crypto.randomUUID()
        : String(Date.now()));

    const all = readListings();
    const old = all.find(l => l.id === id);

    const l = {
      id,
      address: $('#listing-address').value.trim(),
      city: $('#listing-city').value.trim(),
      state: $('#listing-state').value.trim().toUpperCase() || 'PA',
      zip: $('#listing-zip').value.trim(),
      rent: Number($('#listing-rent').value),
      type: $('#listing-type').value,
      beds: Number($('#listing-beds').value || 0),
      baths: Number($('#listing-baths').value || 0),
      size: Number($('#listing-size').value || 0),
      available: $('#listing-available').value,
      status: $('#listing-status').value,
      photo: $('#listing-photo').value.trim(),
      description: $('#listing-description').value.trim(),
      featured: $('#listing-featured').checked,
      createdAt: old?.createdAt || new Date().toISOString()
    };

    if (!l.address || !l.city || !l.rent) {
      $('#listing-error').textContent =
        'Street address, city and rent are required.';
      return;
    }

    try {
      const i = all.findIndex(x => x.id === id);

      if (i < 0) {
        all.push(l);
      } else {
        all[i] = l;
      }

      saveListings(all);
      reset();
      render();
    } catch (err) {
      $('#listing-error').textContent =
        'Could not save. Browser storage may be full or disabled.';
    }
  });

  $('#listing-cancel').addEventListener('click', reset);

  $('#admin-listings').addEventListener('click', e => {
    const eb = e.target.closest('[data-edit]');
    const db = e.target.closest('[data-delete]');

    if (eb) {
      const l = readListings().find(x => x.id === eb.dataset.edit);

      if (!l) return;

      for (const [id, key] of [
        ['listing-address', 'address'],
        ['listing-city', 'city'],
        ['listing-state', 'state'],
        ['listing-zip', 'zip'],
        ['listing-rent', 'rent'],
        ['listing-type', 'type'],
        ['listing-beds', 'beds'],
        ['listing-baths', 'baths'],
        ['listing-size', 'size'],
        ['listing-available', 'available'],
        ['listing-status', 'status'],
        ['listing-photo', 'photo'],
        ['listing-description', 'description']
      ]) {
        $('#' + id).value = l[key] ?? '';
      }

      $('#listing-featured').checked = !!l.featured;
      $('#listing-id').value = l.id;
      $('#admin-form-title').textContent = 'Edit property';

      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }

    if (db && confirm('Delete this property listing?')) {
      saveListings(
        readListings().filter(x => x.id !== db.dataset.delete)
      );

      render();
    }
  });

  render();
}

// ========================================
// INITIALIZE WEBSITE
// ========================================

function init() {
  // Initialize the theme before setting up the other features.
  initTheme();

  initShared();

  $('#modal-root')?.addEventListener('click', e => {
    if (e.target.matches('[data-close-modal]')) {
      $('#modal-root').innerHTML = '';
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      $('#modal-root').innerHTML = '';
    }
  });

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-details]');

    if (b) {
      openDetails(b.dataset.details);
    }
  });

  initListings();
  initMailForms();
  initApplication();
  initAdmin();
}

document.addEventListener('DOMContentLoaded', init);