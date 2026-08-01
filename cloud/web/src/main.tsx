import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./lib/AuthContext";
import { ProfileProvider } from "./lib/ProfileContext";
import { LanguageProvider } from "./lib/i18n/LanguageContext";
import { UnitsProvider } from "./lib/UnitsContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <LanguageProvider>
        <UnitsProvider>
          <AuthProvider>
            <ProfileProvider>
              <App />
            </ProfileProvider>
          </AuthProvider>
        </UnitsProvider>
      </LanguageProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
