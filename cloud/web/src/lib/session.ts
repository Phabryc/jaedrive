const ENTERED_APP_KEY = "jaedrive_has_entered_app";

export function hasEnteredAppSession(): boolean {
  try {
    return sessionStorage.getItem(ENTERED_APP_KEY) === "true";
  } catch {
    return false;
  }
}

export function setEnteredAppSession(): void {
  try {
    sessionStorage.setItem(ENTERED_APP_KEY, "true");
  } catch {
    // Ignore storage errors in restricted contexts
  }
}

export function clearEnteredAppSession(): void {
  try {
    sessionStorage.removeItem(ENTERED_APP_KEY);
  } catch {
    // Ignore storage errors in restricted contexts
  }
}
