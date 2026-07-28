# Cloud Deployment Design — ProtocolApp

## Cel

Udostępnić ProtocolApp jako aplikację sieciową bez lokalnego serwera po stronie użytkownika. Użytkownik otwiera stronę, loguje się, wypełnia formularz, generuje PDF i pobiera go z przeglądarki. PDF-y oraz lista protokołów mają być dostępne z dowolnego urządzenia po zalogowaniu.

## Zaakceptowane założenia

- Frontend i publiczne API są wdrażane na Netlify.
- Firebase Authentication obsługuje logowanie i rejestrację.
- Cloud Firestore przechowuje wyłącznie metadane protokołów i statusy.
- Netlify Blobs przechowuje gotowe pliki PDF.
- Osobny worker chmurowy uruchamia LibreOffice w kontenerze Linux i konwertuje DOCX do PDF.
- Darmowy worker może zasypiać; pierwsza konwersja po bezczynności może potrwać około minuty.
- Sekrety są ustawiane w zmiennych środowiskowych usług, nigdy w repozytorium.
- Lokalny `server.js` pozostaje trybem developerskim; produkcyjny ruch korzysta z Netlify Functions.

## Architektura

```text
Browser
  │ Firebase Auth ID token
  ▼
Netlify site + Netlify Function API
  ├── Firebase Admin SDK → Firestore (metadata)
  ├── Netlify Blobs (PDF bytes)
  └── HTTPS + worker secret → PDF worker
                              └── LibreOffice → PDF
```

Netlify Function jest jedynym punktem dostępnym dla przeglądarki. Weryfikuje token Firebase, kontroluje dostęp do danych użytkownika, wypełnia wybrany szablon DOCX, wywołuje worker, zapisuje PDF w Blobs i zapisuje metadane w Firestore.

Worker nie posiada dostępu do Firebase, Firestore ani Blobs. Przyjmuje wyłącznie wypełniony DOCX z poprawnym sekretem serwer-serwer, konwertuje plik w katalogu tymczasowym i zwraca PDF. Po zakończeniu nie przechowuje pliku.

## Przepływ generowania

1. Frontend pobiera ID token z aktualnej sesji Firebase.
2. Frontend wysyła `POST /api/protokoly/generuj` z danymi formularza i nagłówkiem `Authorization: Bearer <token>`.
3. Function weryfikuje token i waliduje typ protokołu oraz dane formularza.
4. Function wypełnia `szablon_wydanie.docx` albo `szablon_zdanie.docx` przez docxtemplater.
5. Function wysyła DOCX do `PDF_WORKER_URL/convert` z `X-Worker-Secret`.
6. Worker uruchamia LibreOffice z limitem czasu i zwraca binarny PDF.
7. Function zapisuje PDF w Netlify Blobs pod kluczem `users/{uid}/protocols/{protocolId}.pdf`.
8. Function zapisuje dokument Firestore pod `users/{uid}/protocols/{protocolId}`.
9. Function zwraca PDF do przeglądarki jako załącznik.

Jeżeli zapis PDF-u lub metadanych nie powiedzie się, Function nie zwraca sukcesu. Błąd jest logowany bez sekretów, a odpowiedź opisuje etap, na którym wystąpił problem.

## API produkcyjne

- `GET /api/firebase-config` — zwraca wyłącznie publiczną konfigurację Firebase Web SDK.
- `POST /api/protokoly/generuj` — wymaga Firebase ID tokenu; generuje, zapisuje i zwraca PDF.
- `GET /api/protokoly?type=all|wydanie|zdanie` — wymaga tokenu; zwraca metadane tylko bieżącego użytkownika.
- `GET /api/protokoly/:id/download` — wymaga tokenu; pobiera PDF z Blobs po sprawdzeniu właściciela.
- `PATCH /api/protokoly/:id/status` z `{ "status": "zakonczone" }` — wymaga tokenu; usuwa PDF z Blobs i dokument z Firestore.

Frontend zachowuje obecny kontrakt API, dlatego zmiana storage nie wymaga zmian w przepływie użytkownika.

## Model danych

Dokument Firestore:

```text
users/{uid}/protocols/{protocolId}
  type: "wydanie" | "zdanie"
  status: "oczekujace"
  fileName: string
  blobKey: string
  personName: string
  createdAt: server timestamp
```

PDF nie jest kodowany do Firestore. Jest przechowywany jako binarna wartość w Netlify Blobs, co omija limit rozmiaru dokumentu Firestore.

## Zmienne środowiskowe

### Netlify

- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET` — pozostaje w konfiguracji publicznej tylko dla zgodności Firebase, nie jest używany do PDF-ów
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`
- `FIREBASE_MEASUREMENT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `PDF_WORKER_URL`
- `PDF_WORKER_SECRET`

### Worker

- `PORT`
- `WORKER_SECRET`
- `CONVERSION_TIMEOUT_MS` — domyślnie 120000

`.env` pozostaje lokalny i jest ignorowany przez Git. Do Netlify i workera sekrety trafiają przez panel zmiennych środowiskowych.

## Bezpieczeństwo

- Firebase ID token jest wymagany przy każdym endpointcie dotyczącym protokołów.
- Function buduje ścieżki Blobs z UID zweryfikowanego przez Firebase, a nie z danych klienta.
- Worker odrzuca żądania bez poprawnego `X-Worker-Secret`.
- Worker nie loguje treści DOCX, tokenów ani kluczy.
- Firestore rules pozostają ograniczone do `users/{userId}/protocols/{protocolId}`.
- PDF-y są wydawane wyłącznie przez uwierzytelniony endpoint, nie przez publiczne URL-e Blobs.

## Tryb lokalny

Lokalny `server.js` nadal służy do testowania formularza i lokalnego workera. Zostanie dopasowany do wspólnego modułu generowania DOCX, ale produkcyjne zapisy PDF będą korzystać z Netlify Blobs. Lokalny tryb nie będzie wymagał utworzonego Firebase Storage.

## Testy i kryteria akceptacji

- Testy jednostkowe obejmują walidację konfiguracji workera, mapowanie błędów konwersji i wybór szablonu.
- Test integracyjny workera konwertuje oba dostarczone szablony i sprawdza, że wynik jest poprawnym PDF-em.
- Test API odrzuca brak tokenu, token użytkownika A nie odczytuje danych użytkownika B, a poprawny token może pobrać własny PDF.
- Test Blobs zapisuje, pobiera i usuwa PDF po kluczu użytkownika.
- Smoke test produkcyjny obejmuje: rejestrację, logowanie, wygenerowanie PDF-u, pobranie z listy i oznaczenie jako zakończone.
- Cold start workera jest prezentowany użytkownikowi jako stan „Konwerter się uruchamia…”, bez przedwczesnego błędu.

## Zakres poza pierwszą wersją

- automatyczne usuwanie starych protokołów po czasie,
- panel administratora,
- współdzielenie protokołów między użytkownikami,
- płatny, zawsze aktywny worker,
- migracja istniejących PDF-ów z Firebase Storage.
