import test from 'node:test';
import assert from 'node:assert/strict';
import { getAuthErrorMessage } from '../public/auth-errors.mjs';

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
