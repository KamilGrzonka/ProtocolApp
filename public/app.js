import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js';
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut
} from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js';
import { getAuthErrorMessage, getGenerationErrorMessage } from './auth-errors.mjs';

export { getGenerationErrorMessage };

const authCard = document.getElementById('auth-card');
const appCard = document.getElementById('app-card');
const authForm = document.getElementById('auth-form');
const authEmail = document.getElementById('auth-email');
const authPassword = document.getElementById('auth-password');
const authTitle = document.getElementById('auth-title');
const authIntro = document.getElementById('auth-intro');
const authMessage = document.getElementById('auth-message');
const authSubmit = document.getElementById('auth-submit');
const authToggle = document.getElementById('auth-toggle');
const authPasswordReset = document.getElementById('auth-password-reset');
const accountEmail = document.getElementById('account-email');
const logoutButton = document.getElementById('logout-button');
const protocolForm = document.getElementById('protocol-form');
const generateButton = document.getElementById('generuj-protokol');
const archiveFilter = document.getElementById('archive-filter');
const archiveList = document.getElementById('archive-list');

let firebaseAuth;
let authMode = 'login';

const setAuthMessage = (message = '') => {
  authMessage.textContent = message;
};

const setAuthMode = (mode) => {
  authMode = mode;
  const isRegister = mode === 'register';
  authTitle.textContent = isRegister ? 'Utwórz konto' : 'Zaloguj się';
  authIntro.textContent = isRegister
    ? 'Utwórz konto, aby zachować dostęp do swoich protokołów.'
    : 'Zaloguj się, aby generować i przeglądać swoje protokoły.';
  authSubmit.textContent = isRegister ? 'Utwórz konto' : 'Zaloguj się';
  authToggle.textContent = isRegister ? 'Mam już konto' : 'Utwórz konto';
  authPassword.autocomplete = isRegister ? 'new-password' : 'current-password';
  authPasswordReset.hidden = authMode !== 'login';
  setAuthMessage();
};

const getFieldValue = (id) => document.getElementById(id).value.trim();

const getProtocolData = () => ({
  typProtokolu: getFieldValue('typ-protokolu'),
  ImieNazwisko: getFieldValue('imie-nazwisko'),
  PESEL: getFieldValue('pesel'),
  Data: getFieldValue('data'),
  ModelKomputera: getFieldValue('nazwa-model-komputera'),
  NumerSerwisowy: getFieldValue('numer-serwisowy'),
  Ladowarka: getFieldValue('ladowarka-zasilacz'),
  Monitor: getFieldValue('monitor'),
  Klawiatura: getFieldValue('klawiatura'),
  Mysz: getFieldValue('mysz'),
  Sluchawki: getFieldValue('sluchawki-usb'),
  Wartosc: getFieldValue('wartosc-przekazanego-sprzetu'),
  Uwagi: getFieldValue('uwagi')
});

const getSafeFileName = (name) => {
  const safeName = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return safeName || 'Uzytkownik';
};

const downloadBlob = (blob, fileName) => {
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(downloadUrl);
};

const apiFetch = async (url, options = {}) => {
  const user = firebaseAuth.currentUser;
  if (!user) {
    throw new Error('Sesja logowania wygasła. Zaloguj się ponownie.');
  }

  const token = await user.getIdToken();
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);

  return fetch(url, { ...options, headers });
};

const getApiError = async (response, fallback) => {
  const body = await response.json().catch(() => ({}));
  return body.error || fallback;
};

const getGenerationResponseError = async (response) => {
  const body = await response.json().catch(() => ({}));
  return getGenerationErrorMessage({ status: response.status, error: body.error });
};

const formatDate = (dateValue) => {
  if (!dateValue) return 'Brak daty';
  return new Intl.DateTimeFormat('pl-PL', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(dateValue));
};

const formatType = (type) => type === 'zdanie' ? 'Zdanie' : 'Wydanie';

const renderArchive = (protocols) => {
  if (protocols.length === 0) {
    archiveList.innerHTML = '<p class="empty-state">Brak oczekujących protokołów.</p>';
    return;
  }

  archiveList.innerHTML = protocols.map((protocol) => `
    <article class="archive-item">
      <div>
        <h3 class="archive-item-title">${escapeHtml(protocol.fileName)}</h3>
        <p class="archive-item-meta">
          <span>${formatType(protocol.type)}</span>
          <span>${escapeHtml(protocol.personName || 'Brak osoby')}</span>
          <span>${formatDate(protocol.createdAt)}</span>
          <span>Oczekujące</span>
        </p>
      </div>
      <div class="archive-item-actions">
        <button class="archive-action" type="button" data-action="download" data-id="${protocol.id}" data-file-name="${escapeHtml(protocol.fileName)}">Pobierz</button>
        <button class="archive-action archive-action--complete" type="button" data-action="complete" data-id="${protocol.id}">Zakończone</button>
      </div>
    </article>
  `).join('');
};

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const loadArchive = async () => {
  archiveList.innerHTML = '<p class="empty-state">Ładowanie listy...</p>';
  const type = archiveFilter.value;
  const response = await apiFetch(`/api/protokoly?type=${encodeURIComponent(type)}`);

  if (!response.ok) {
    throw new Error(await getApiError(response, 'Nie udało się pobrać listy protokołów.'));
  }

  renderArchive(await response.json());
};

const showApplication = async (user) => {
  authCard.hidden = true;
  appCard.hidden = false;
  accountEmail.textContent = user.email || user.uid;

  try {
    await loadArchive();
  } catch (error) {
    archiveList.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
  }
};

const showLogin = () => {
  authCard.hidden = false;
  appCard.hidden = true;
};

authToggle.addEventListener('click', () => {
  setAuthMode(authMode === 'login' ? 'register' : 'login');
});

const requestPasswordReset = async () => {
  const email = authEmail.value.trim();
  if (!email || !authEmail.checkValidity()) {
    setAuthMessage('Podaj poprawny adres e-mail, aby zresetować hasło.');
    authEmail.focus();
    return;
  }

  authPasswordReset.disabled = true;
  try {
    await sendPasswordResetEmail(firebaseAuth, email);
    setAuthMessage('Jeśli konto istnieje, instrukcja resetu hasła została wysłana na podany adres e-mail.');
  } catch (error) {
    console.error('Firebase password reset error:', error);
    setAuthMessage(getAuthErrorMessage(error));
  } finally {
    authPasswordReset.disabled = false;
  }
};

authPasswordReset.addEventListener('click', requestPasswordReset);

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!authForm.reportValidity()) return;

  authSubmit.disabled = true;
  setAuthMessage();

  try {
    if (authMode === 'register') {
      await createUserWithEmailAndPassword(firebaseAuth, authEmail.value.trim(), authPassword.value);
    } else {
      await signInWithEmailAndPassword(firebaseAuth, authEmail.value.trim(), authPassword.value);
    }
  } catch (error) {
    console.error('Firebase authentication error:', error);
    setAuthMessage(getAuthErrorMessage(error));
  } finally {
    authSubmit.disabled = false;
  }
});

logoutButton.addEventListener('click', () => signOut(firebaseAuth));
archiveFilter.addEventListener('change', () => loadArchive().catch((error) => {
  archiveList.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
}));

protocolForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!protocolForm.reportValidity()) return;

  const protocolData = getProtocolData();
  generateButton.disabled = true;
  generateButton.textContent = 'Generowanie...';
  const converterStartingTimer = window.setTimeout(() => {
    generateButton.textContent = 'Konwerter się uruchamia...';
  }, 8_000);

  try {
    const response = await apiFetch('/api/protokoly/generuj', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(protocolData)
    });

    if (!response.ok) {
      throw new Error(await getGenerationResponseError(response));
    }

    downloadBlob(await response.blob(), `Protokol_${getSafeFileName(protocolData.ImieNazwisko)}.pdf`);
    await loadArchive();
  } catch (error) {
    window.alert(error.message);
  } finally {
    window.clearTimeout(converterStartingTimer);
    generateButton.disabled = false;
    generateButton.textContent = 'Generuj Protokół';
  }
});

archiveList.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  button.disabled = true;

  try {
    if (button.dataset.action === 'download') {
      const response = await apiFetch(`/api/protokoly/${button.dataset.id}/download`);
      if (!response.ok) throw new Error(await getApiError(response, 'Nie udało się pobrać pliku.'));
      downloadBlob(await response.blob(), button.dataset.fileName || 'protokol.pdf');
    }

    if (button.dataset.action === 'complete') {
      const response = await apiFetch(`/api/protokoly/${button.dataset.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'zakonczone' })
      });
      if (!response.ok) throw new Error(await getApiError(response, 'Nie udało się zakończyć protokołu.'));
      await loadArchive();
    }
  } catch (error) {
    window.alert(error.message);
    button.disabled = false;
  }
});

const initializeFirebaseClient = async () => {
  const response = await fetch('/api/firebase-config');
  if (!response.ok) throw new Error('Nie udało się pobrać konfiguracji Firebase.');

  const config = await response.json();
  if (!config.apiKey || !config.projectId || !config.authDomain) {
    throw new Error('Firebase nie jest skonfigurowany. Uzupełnij plik .env.');
  }

  firebaseAuth = getAuth(initializeApp(config));
  onAuthStateChanged(firebaseAuth, (user) => {
    if (user) {
      showApplication(user);
    } else {
      showLogin();
    }
  });
};

initializeFirebaseClient().catch((error) => {
  setAuthMessage(error.message);
  authSubmit.disabled = true;
});
