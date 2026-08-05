# Guida e Protocollo di Comunicazione tra Agenti AI (`/agent/`)

Questa directory è il centro di coordinamento, documentazione e passaggio consegne riservato agli **agenti di codifica (Coding Agents)** che lavorano sul monorepo **JaeDrive**.

Qualsiasi agente AI che opera su questo repository è **tenuto a consultare ed aggiornare** i file contenuti in questa cartella per garantire continuità, coerenza architetturale e tracciabilità delle modifiche tra diverse sessioni e modelli.

---

## 📁 Indice e Struttura dei Documenti

- **[`README.md`](file:///d:/P/JaeDrive/agent/README.md)** (questo file): Regole d'uso, protocollo di comunicazione e standard per gli agenti.
- **[`agent_log.md`](file:///d:/P/JaeDrive/agent/agent_log.md)**: Registro cronologico di tutte le modifiche, bugfix e decisioni architetturali.
- **[`SIMULATOR.md`](file:///d:/P/JaeDrive/agent/SIMULATOR.md)**: Guida tecnica completa per la configurazione dell'ambiente Android SDK, emulatore AVD (1440 × 1770) e il sistema di mock telemetria (`src/debug` vs `src/release`).
- Documenti tematici aggiuntivi (creati al bisogno dagli agenti):
  - `CLOUD_API.md`: Specifica endpoint e modelli dati backend/cloud.
  - `VDB_PROTOCOL.md`: Mappatura segnali e reverse engineering Desay VDB.

---

## 💬 Protocollo di Comunicazione tra Agenti (Agent-to-Agent Protocol)

Tutti gli agenti **devono** seguire la struttura standardizzata sotto descritta quando aggiornano o creano documenti in questa cartella.

### 1. Formato degli Aggiornamenti nel Log (`agent_log.md`)

Ogni intervento sul codice deve essere registrato in `agent_log.md` aggiungendo una nuova sezione in cima (in ordine cronologico inverso):

```markdown
## [YYYY-MM-DD] - <Titolo Sintetico Modifica>

### 👤 Agent Metadata
- **Agent Nickname / Model**: <Nickname e Modello, es. Leo AG (Antigravity / Gemini 3.6 Flash)>
- **Scope / Subsystem**: <`[app]`, `[cloud]`, `[agent]`, `[build-system]`>
- **Status**: <`COMPLETED` | `IN_PROGRESS` | `REQUIRES_USER_TEST`>

### 📌 Sintesi della Funzionalità / Modifica
Breve descrizione del problema affrontato e dell'obiettivo raggiunto.

### 🛠️ Dettagli Tecnici & File Modificati
- [`NomeFile.java`](file:///d:/P/JaeDrive/path/to/file): Descrizione della modifica o refactoring.
- [`build.gradle`](file:///d:/P/JaeDrive/app/build.gradle): Eventuali cambi di dipendenze o variabili.

### 🧪 Comandi di Verifica Eseguiti
Elenco esatto dei comandi eseguiti per validare il codice (es. `.\gradlew.bat assembleDebug assembleRelease`).

### 📋 Handover & Passaggio Consegne per l'Agente Successivo
- **Stato Attuale**: Descrizione dello stato del repository.
- **Open Questions / Pending Tasks**: Attività pendenti o aspetti da verificare con l'utente.
- **Constraints / Warning**: Vincoli da non rompere (es. non includere mock nelle build di release).
```

---

## 📑 Informazioni Obbligatorie da Documentare

Ogni agente che modifica il progetto deve sempre documentare:

1. **Dipendenze e Requisiti di Build**:
   - Qualsiasi dipendenza esterna o jar di sistema non tracciato su git (es. `app/libs/android.car.jar`).
   - Versioni di JDK, SDK, AGP o pacchetti npm richiesti.
2. **Scelte Architetturali e Guardrails**:
   - Isolamenti tra build varianti (es. `src/debug` vs `src/release`).
   - Comportamenti condizionali o fallback.
3. **Ambiente ed Emulazione**:
   - Risoluzione target dell'head unit: **1440 × 1770** pixel.
   - Presenza di simulatori o mock.
4. **Comandi di Build e Validazione**:
   - I comandi esatti per compilare e testare sia in ambiente Windows (PowerShell) che Linux (Bash).

---

## 📌 Regole di Condotta per Agenti AI

1. **Consulta Prima di Agire**: Prima di effettuare modifiche architetturali, leggi `agent/README.md`, `agent/agent_log.md` e `agent/SIMULATOR.md`.
2. **Aggiorna Sempre il Log**: Al termine del lavoro, aggiungi la tua voce in `agent/agent_log.md`.
3. **Non Rimuovere la Documentazione Esistente**: Preserva le note storiche e i commenti scritti dagli agenti precedenti.
4. **Mantieni I Link Clickable**: Inserisci sempre link markdown formattati con lo schema `file:///d:/P/JaeDrive/...` verso i file modificati o citati.
