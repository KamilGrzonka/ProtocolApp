# Reset hasła przez Firebase Authentication

## Cel

Umożliwić użytkownikowi wysłanie wiadomości resetującej hasło bez opuszczania panelu logowania.

## Interfejs

- W trybie logowania, pod polem hasła, widoczny jest przycisk tekstowy `Nie pamiętam hasła?`.
- W trybie rejestracji przycisk jest ukryty.
- Przycisk wykorzystuje adres z pola `auth-email`.

## Przepływ

1. Użytkownik wpisuje adres e-mail i wybiera reset hasła.
2. Klient sprawdza, czy adres nie jest pusty i ma poprawny format przeglądarki.
3. Klient wywołuje Firebase `sendPasswordResetEmail` dla istniejącej instancji `firebaseAuth`.
4. Po powodzeniu komunikat formularza informuje, że instrukcja resetu została wysłana na podany adres. Komunikat nie potwierdza istnienia konta.
5. Błędy Firebase są tłumaczone na polskie komunikaty przez istniejący moduł `auth-errors.mjs`.

## Zakres techniczny

- Zmiany: `public/index.html`, `public/app.js`, `public/auth-errors.mjs`, `test/auth-errors.test.mjs`.
- Bez zmian backendu, Firestore, Netlify Blobs i reguł bezpieczeństwa.
- Testy obejmą komunikaty błędów resetu oraz widoczność elementu zależną od trybu formularza.

## Kryteria akceptacji

- Link jest widoczny tylko podczas logowania.
- Pusty e-mail nie wywołuje Firebase i daje jasny komunikat.
- Poprawny e-mail uruchamia reset Firebase i pokazuje neutralne potwierdzenie.
- Dotychczasowe logowanie i rejestracja pozostają bez zmian.
