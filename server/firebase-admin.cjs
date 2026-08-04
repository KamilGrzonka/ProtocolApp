const admin = require('firebase-admin');

const initializeFirebaseAdmin = (environment) => {
  const privateKey = (environment.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const hasAdminCredentials = Boolean(
    environment.FIREBASE_PROJECT_ID &&
    environment.FIREBASE_CLIENT_EMAIL &&
    privateKey
  );

  let firestore = null;

  if (hasAdminCredentials) {
    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: environment.FIREBASE_PROJECT_ID,
          clientEmail: environment.FIREBASE_CLIENT_EMAIL,
          privateKey
        })
      });
    }

    firestore = admin.firestore();
  }

  return {
    admin,
    firestore,
    verifyIdToken: (token) => admin.auth().verifyIdToken(token)
  };
};

module.exports = { initializeFirebaseAdmin };
