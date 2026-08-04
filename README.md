# ProtocolApp

ProtocolApp generuje PDF-y z prywatnych szablonów DOCX. Firebase Authentication uwierzytelnia użytkownika, Cloud Firestore przechowuje wyłącznie metadane archiwum, a zawartość PDF trafia do chronionego magazynu Netlify Blobs `protocol-pdfs`. Firebase Storage nie jest wymagany ani używany; nie twórz bucketa ani reguł Firebase Storage.

## Lokalne uruchomienie

Wymagane są Node.js 20+, pnpm oraz LibreOffice (`soffice` w `PATH` albo lokalny `.tools/libreoffice`). Skopiuj `.env.example` do `.env` i ustaw następujące zmienne:

```dotenv
# Konfiguracja publicznego klienta Firebase
FIREBASE_API_KEY=
FIREBASE_AUTH_DOMAIN=
FIREBASE_PROJECT_ID=
FIREBASE_MESSAGING_SENDER_ID=
FIREBASE_APP_ID=
FIREBASE_MEASUREMENT_ID=

# Konto usługi Firebase Admin
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Opcjonalne ustawienia lokalnego serwera i LibreOffice
PORT=3000
LIBREOFFICE_PATH=
LIBREOFFICE_TIMEOUT_MS=120000
```

`FIREBASE_PRIVATE_KEY` wpisz w jednej linii, z dosłownymi znakami `\n` między wierszami klucza — nie wklejaj wielowierszowej wartości. W Firebase Authentication włącz dostawcę Email/Password, a następnie wdroż reguły Firestore z `firestore.rules`.

```powershell
pnpm install
pnpm start
```

Otwórz [http://localhost:3000](http://localhost:3000). Lokalny serwer zapisuje testowe PDF-y w ignorowanym katalogu `storage/pdfs`; w środowisku produkcyjnym używane są wyłącznie Netlify Blobs.

## Worker PDF w Dockerze

Worker wykonuje jedynie konwersję LibreOffice i nie otrzymuje poświadczeń Firebase ani Netlify. Zbuduj obraz z katalogu głównego repozytorium:

```powershell
docker build -t protocol-pdf-worker ./pdf-worker
docker run --rm -p 8080:8080 -e WORKER_SECRET=replace-with-a-long-random-secret protocol-pdf-worker
```

Wymagana zmienna workera to `WORKER_SECRET`; `PORT` jest opcjonalna i domyślnie ma wartość `8080`. Po wdrożeniu obrazu u wybranego dostawcy zachowaj publiczny adres `https://...` endpointu `GET /health` — będzie wartością `PDF_WORKER_URL` w Netlify. Nie zapisuj sekretu w repozytorium.

## Wdrożenie w Netlify

Połącz repozytorium z Netlify. Konfiguracja w `netlify.toml` publikuje `public` i uruchamia funkcje z `netlify/functions`; nie zmieniaj kontraktu przeglądarki `/api/*`. W ustawieniach środowiska Netlify ustaw dokładnie:

```dotenv
# Konfiguracja publicznego klienta Firebase, zwracana przez /api/firebase-config
FIREBASE_API_KEY=
FIREBASE_AUTH_DOMAIN=
FIREBASE_PROJECT_ID=
FIREBASE_MESSAGING_SENDER_ID=
FIREBASE_APP_ID=
FIREBASE_MEASUREMENT_ID=

# Konto usługi Firebase Admin
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Połączenie z wdrożonym workerem PDF
PDF_WORKER_URL=https://worker.example.com
PDF_WORKER_SECRET=the-same-long-random-secret-as-WORKER_SECRET
```

W panelu Netlify wartość `FIREBASE_PRIVATE_KEY` musi pozostać jedną linią z literalnymi `\n`; aplikacja zamienia je na prawdziwe znaki nowej linii podczas inicjalizacji Admin SDK. Netlify zapewnia poświadczenia do Blobs automatycznie — nie konfiguruj `FIREBASE_STORAGE_BUCKET`, nie twórz Firebase Storage i nie dodawaj sekretów Blobs ręcznie.

Przed produkcyjnym użyciem wdroż tylko reguły Firestore (`firebase deploy --only firestore:rules`), a potem sprawdź rzeczywisty przepływ: rejestracja, wygenerowanie PDF, pobranie z archiwum, oznaczenie jako zakończony i niedostępność archiwum z drugiego konta. Samo wdrożenie workera i Netlify oraz poświadczenia pozostają pod kontrolą operatora.
