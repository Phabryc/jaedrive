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

// Cancellazione account (jaedrive_todo #1, "right to erasure" GDPR - vedi routes/user.ts
// DELETE /me): rimuove l'identita' di login stessa, non solo i dati applicativi in
// Postgres. Idempotente verso un utente gia' cancellato (es. un doppio click sul bottone, o
// un retry dopo che questa stessa chiamata era gia' andata a buon fine ma la successiva
// prisma.user.delete() era fallita) - "auth/user-not-found" viene trattato come successo
// invece che come errore, cosi' l'endpoint puo' essere richiamato in sicurezza piu' volte.
export async function deleteFirebaseUser(uid: string): Promise<void> {
  try {
    await getAuth(getFirebaseApp()).deleteUser(uid);
  } catch (err) {
    if ((err as { code?: string })?.code === "auth/user-not-found") return;
    throw err;
  }
}
