import test from 'node:test';
import assert from 'node:assert/strict';
import { getAuthErrorMessage, getGenerationErrorMessage } from '../public/auth-errors.mjs';

test('shows a useful message when Email/Password sign-up is disabled', () => {
  assert.equal(
    getAuthErrorMessage({ code: 'auth/operation-not-allowed' }),
    'Rejestracja e-mail/hasło jest wyłączona w Firebase. Włącz ją w Authentication → Sign-in method.'
  );
});

test('includes the Firebase code for an unrecognized authentication error', () => {
  assert.equal(
    getAuthErrorMessage({ code: 'auth/internal-error' }),
    'Firebase zgłosił błąd auth/internal-error. Sprawdź konfigurację Firebase i spróbuj ponownie.'
  );
});

test('formats a converter unavailable error for a cold worker', () => {
  assert.equal(
    getGenerationErrorMessage({ status: 503, error: 'Konwerter PDF jest chwilowo niedostępny.' }),
    'Konwerter PDF się uruchamia. Poczekaj chwilę i spróbuj ponownie.'
  );
});

test('formats a generation timeout separately from other failures', () => {
  assert.equal(
    getGenerationErrorMessage({ status: 504, error: 'Konwersja dokumentu do PDF przekroczyła limit czasu.' }),
    'Konwersja dokumentu PDF trwała zbyt długo. Spróbuj ponownie.'
  );
});

test('uses a clear fallback for other server-side generation failures', () => {
  assert.equal(
    getGenerationErrorMessage({ status: 500, error: 'Wewnętrzny szczegół techniczny.' }),
    'Nie udało się wygenerować dokumentu PDF. Spróbuj ponownie.'
  );
});

test('preserves a backend message for a client-side generation error', () => {
  assert.equal(
    getGenerationErrorMessage({ status: 400, error: 'Nieprawidłowy typ protokołu.' }),
    'Nieprawidłowy typ protokołu.'
  );
});
