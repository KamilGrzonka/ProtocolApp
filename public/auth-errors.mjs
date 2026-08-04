const authErrorMessages = {
  'auth/operation-not-allowed':
    'Rejestracja e-mail/hasło jest wyłączona w Firebase. Włącz ją w Authentication → Sign-in method.',
  'auth/api-key-not-valid':
    'Firebase odrzucił klucz API. W .env wpisz Web API Key z ustawień projektu Firebase.',
  'auth/invalid-api-key':
    'Firebase odrzucił klucz API. W .env wpisz Web API Key z ustawień projektu Firebase.',
  'auth/invalid-credential': 'Nieprawidłowy e-mail lub hasło.',
  'auth/email-already-in-use': 'Konto z tym adresem e-mail już istnieje.',
  'auth/weak-password': 'Hasło musi mieć co najmniej 6 znaków.',
  'auth/invalid-email': 'Podaj poprawny adres e-mail.'
};

export const getAuthErrorMessage = (error) => {
  const code = error?.code;
  if (authErrorMessages[code]) return authErrorMessages[code];
  if (code) return `Firebase zgłosił błąd ${code}. Sprawdź konfigurację Firebase i spróbuj ponownie.`;
  return 'Nie udało się wykonać operacji logowania.';
};

export const getGenerationErrorMessage = ({ status, error } = {}) => {
  if (status === 503) {
    return 'Konwerter PDF się uruchamia. Poczekaj chwilę i spróbuj ponownie.';
  }

  if (status === 504) {
    return 'Konwersja dokumentu PDF trwała zbyt długo. Spróbuj ponownie.';
  }

  if (status >= 500) {
    return 'Nie udało się wygenerować dokumentu PDF. Spróbuj ponownie.';
  }

  return error || 'Nie udało się wygenerować dokumentu PDF. Spróbuj ponownie.';
};
