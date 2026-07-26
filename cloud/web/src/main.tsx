import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./lib/AuthContext";
import { ProfileProvider } from "./lib/ProfileContext";
import { LanguageProvider } from "./lib/i18n/LanguageContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <LanguageProvider>
        <AuthProvider>
          <ProfileProvider>
            <App />
          </ProfileProvider>
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
