# ProtocolApp

Aplikacja webowa do wprowadzania danych i generowania protokołów przekazania sprzętu w formacie PDF.

## Uruchomienie

Wymagany jest Node.js 18 lub nowszy.

Na serwerze musi być również dostępny LibreOffice. Aplikacja najpierw używa lokalnego konwertera z `.tools/libreoffice`, jeśli istnieje, a następnie szuka `soffice` w `PATH`. Można też wskazać własną ścieżkę zmienną `LIBREOFFICE_PATH`.

```powershell
pnpm install
pnpm start
```

Następnie otwórz [http://localhost:3000](http://localhost:3000).

Frontend wysyła dane do `POST /api/protokoly/generuj`. Backend wybiera odpowiedni prywatny szablon DOCX, wstrzykuje dane przez Docxtemplater, konwertuje dokument przez LibreOffice i zwraca gotowy plik PDF do pobrania. Pliki tymczasowe są usuwane po zakończeniu żądania.
