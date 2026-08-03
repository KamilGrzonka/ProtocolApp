# ProtocolApp

Aplikacja webowa do wprowadzania danych i generowania protokołów przekazania sprzętu w formacie PDF.

## Uruchomienie

Wymagany jest Node.js 18 lub nowszy.

Na serwerze musi być również dostępny LibreOffice. Aplikacja najpierw używa lokalnego konwertera z `.tools/libreoffice`, jeśli istnieje, a następnie szuka `soffice` w `PATH`. Można też wskazać własną ścieżkę zmienną `LIBREOFFICE_PATH`.

Do logowania i archiwizacji PDF trzeba również:

1. Włączyć dostawcę Email/Password w Firebase Authentication.
2. Utworzyć bazę Cloud Firestore i bucket Firebase Storage.
3. Pobrać klucz konta serwisowego Firebase Admin SDK.
4. Uzupełnić w `.env` `FIREBASE_CLIENT_EMAIL` i `FIREBASE_PRIVATE_KEY`.
5. Wdrożyć `firestore.rules` i `storage.rules` w projekcie Firebase.

Konfiguracja klienta Firebase znajduje się w `.env`, a `.env` jest ignorowany przez Git. Plik `.env.example` pokazuje wymagane nazwy zmiennych bez sekretów.

```powershell
pnpm install
pnpm start
```

Następnie otwórz [http://localhost:3000](http://localhost:3000).

Frontend wysyła dane do `POST /api/protokoly/generuj`. Backend weryfikuje token Firebase zalogowanego użytkownika, wybiera prywatny szablon DOCX, wstrzykuje dane przez Docxtemplater, konwertuje dokument przez LibreOffice, zapisuje PDF w Storage użytkownika i tworzy metadane w Firestore. Pliki tymczasowe są usuwane po zakończeniu żądania.
