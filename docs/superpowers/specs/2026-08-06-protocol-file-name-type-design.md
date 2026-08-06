# Sufiks typu w nazwie protokołu — specyfikacja

## Cel

Nadać nowo generowanym plikom PDF nazwę zawierającą typ protokołu, np. `Protokol_Jan_Kowalski_Wydanie.pdf`.

## Zakres

- Źródłem typu pozostaje zwalidowane `typProtokolu` zwracane przez `validateProtocolRequest()`.
- `wydanie` jest prezentowane jako `Wydanie`, a `zdanie` jako `Zdanie`.
- Zmieniona wartość `fileName` ma być używana zarówno w odpowiedzi pobierającej PDF, jak i w metadanych Firestore wyświetlanych w archiwum.

## Projekt

Zmiana pozostaje w `server/protocol-service.cjs`, gdzie `createProtocolService().generate()` tworzy `fileName`. Zastosowane będzie jawne mapowanie typu technicznego na etykietę użytkową. Nie zmieniamy nazw kluczy Netlify Blobs ani istniejących wpisów archiwalnych.

## Kryteria akceptacji

- Dla danych Jana Kowalskiego i typu `wydanie` nazwa wynosi `Protokol_Jan_Kowalski_Wydanie.pdf`.
- Dla typu `zdanie` suffix wynosi `Zdanie`.
- Metadane przekazane do `protocolReference.set()` zawierają tę samą nazwę.
- Pełny zestaw `node --test` przechodzi bez regresji.
