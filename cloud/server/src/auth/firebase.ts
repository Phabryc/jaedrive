import { initializeApp, cert, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { env } from "../env.js";

let app: App | undefined;

function getFirebaseApp(): App {
  if (!app) {
    const serviceAccount = JSON.parse(env.firebaseServiceAccountJson);
    app = initializeApp({
      credential: cert(serviceAccount),
      projectId: env.firebaseProjectId,
    });
  }
  return app;
}

export async function verifyFirebaseIdToken(idToken: string) {
  return getAuth(getFirebaseApp()).verifyIdToken(idToken);
}
