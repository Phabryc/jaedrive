# Ambiente di Emulazione e Mock Telemetria Veicolo (JaeDrive)

Questo documento fornisce le istruzioni tecniche complete per configurare l'ambiente di compilazione, l'emulatore Android e il sistema di mock telemetria per **JaeDrive** (app per Jaecoo 7 SHS-H).

La guida è strutturata per consentire sia agli sviluppatori che ad **agenti AI (coding agents)** di replicare l'ambiente in modo totalmente automatizzato su qualsiasi macchina **Windows** o **Linux**.

---

## 1. Architettura del Sistema di Mock

Su veicoli reali, JaeDrive comunica con il bus VDB Desay tramite il servizio Android `com.desaysv.ivi.vds.carinfo` (`VDInfoClient.java`). Su emulatori o dispositivi di sviluppo standard, questo servizio non è presente.

### Principio di Isolamento Strict (Debug vs Release)
Per evitare che codice di test o dati sintetici finiscano nella build distribuibile sulle vetture, l'architettura sfrutta i **Gradle Source Sets**:

* **`app/src/debug/java/com/phabryc/jaedrive/mock/`** (Compilato **SOLO** nelle build Debug):
  - `VehicleSimulator.java`: Generatore dinamico in background che simula l'evoluzione in tempo reale dei segnali del veicolo:
    - **Stato Batteria (SOC %)** e **Livello Carburante (%)**
    - **Odometro Totale (km)** e **Distanza Viaggio (km)**
    - **Flusso d'Energia (EV / HEV / Rigenerazione frenata)**
    - **Consumo Istantaneo (kWh/100km)**, **Rigenerazione** e **Avvisi Pneumatici**
  - `VehicleMockBridge.java` (Debug): Intercetta il fallimento del `bindService()` verso il servizio Desay ed avvia automaticamente il `VehicleSimulator`, inviando i pacchetti `VDEvent` mock ai listener dell'interfaccia utente (`MainActivity`, `TrackingService`).

* **`app/src/release/java/com/phabryc/jaedrive/mock/`** (Compilato **SOLO** nelle build Release):
  - `VehicleMockBridge.java` (Release): Implementazione **No-Op**. Nessun timer, thread o codice di simulazione viene compilato nell'APK finale di produzione.

* **`app/src/main/java/com/phabryc/jaedrive/VDInfoClient.java`**:
  - Invia la richiesta di bind. Se `bindService()` fallisce, richiama `VehicleMockBridge.onBindFailed()`.

---

## 2. Requisiti di Sistema & Prerequisiti

> [!IMPORTANT]
> **Requisito Spazio Disco (Pre-Check)**:
> La configurazione completa (JDK 17 + Android SDK + Piattaforma 33 + Immagine di Sistema decompressa + Partizione AVD) richiede **almeno 8 GB (8000 MB)** di spazio libero sul disco di destinazione.
>
> **Dinamicita dei Percorsi**:
> Non utilizzare lettere di unità o percorsi hardcodati nei comandi. Verificare sempre lo spazio disponibile sull'unità desiderata ed impostare le variabili d'ambiente `$env:ANDROID_HOME` ed `$env:ANDROID_AVD_HOME` sul percorso idoneo.

1. **JDK 17** (raccomandato Eclipse Temurin 17).
2. **Android SDK Command Line Tools** (versione recente).
3. **Android SDK Platform 33** & **Build-Tools 33.0.2**.
4. **`android.car.jar`**: Dipendenza di sistema Android Automotive. Deve essere posizionata in `app/libs/android.car.jar`. Può essere prelevata dall'Android SDK (`platforms/android-33/optional/android.car.jar`).

---

## 3. Guida alla Configurazione: Windows

### 3.1 Pre-Check Spazio Disco e Setup SDK (PowerShell)

Eseguire i seguenti comandi in PowerShell per verificare lo spazio, configurare JDK 17, Android SDK ed accettare le licenze:

```powershell
# 1. Pre-Check Spazio Disco Disponibile (minimo 8 GB richiesti)
$targetDrive = (Get-Item $env:USERPROFILE).PSDrive.Name
$freeSpaceGB = [math]::Round((Get-PSDrive $targetDrive).Free / 1GB, 2)
Write-Host "Spazio libero su unità $targetDrive`: $freeSpaceGB GB"

if ($freeSpaceGB -lt 8) {
    Write-Warning "Spazio insufficiente su $targetDrive`: ($freeSpaceGB GB disponibili, 8 GB richiesti)."
    Write-Warning "Impostare ANDROID_HOME ed ANDROID_AVD_HOME su un'unità con almeno 8 GB liberi prima di proseguire."
}

# 2. Impostazione Dinamica Percorsi (modificare i percorsi se si usa un'unità secondaria con più spazio)
$env:JAVA_HOME = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { "$env:USERPROFILE\.jdk-17" }
$env:ANDROID_HOME = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:USERPROFILE\.android-sdk" }
$env:ANDROID_AVD_HOME = if ($env:ANDROID_AVD_HOME) { $env:ANDROID_AVD_HOME } else { "$env:USERPROFILE\.android\avd" }

# 3. Download e installazione JDK 17 portatile (se non presente)
if (-not (Test-Path "$env:JAVA_HOME\bin\java.exe")) {
    $jdkUrl = "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.10%2B7/OpenJDK17U-jdk_x64_windows_hotspot_17.0.10_7.zip"
    curl.exe -L -o "$env:TEMP\jdk17.zip" $jdkUrl
    Expand-Archive -Path "$env:TEMP\jdk17.zip" -DestinationPath "$env:TEMP\jdk17_temp" -Force
    $extractedJdk = Get-ChildItem "$env:TEMP\jdk17_temp" | Select-Object -First 1
    Move-Item -Path $extractedJdk.FullName -Destination $env:JAVA_HOME -Force
    Remove-Item "$env:TEMP\jdk17.zip", "$env:TEMP\jdk17_temp" -Recurse -Force
}

# 4. Download Command Line Tools (se non presente)
if (-not (Test-Path "$env:ANDROID_HOME\cmdline-tools\latest\bin\sdkmanager.bat")) {
    $cmdlineUrl = "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip"
    curl.exe -L -o "$env:TEMP\cmdline.zip" $cmdlineUrl
    New-Item -ItemType Directory -Path "$env:ANDROID_HOME\cmdline-tools" -Force | Out-Null
    Expand-Archive -Path "$env:TEMP\cmdline.zip" -DestinationPath "$env:TEMP\cmdline_temp" -Force
    Move-Item -Path "$env:TEMP\cmdline_temp\cmdline-tools" -Destination "$env:ANDROID_HOME\cmdline-tools\latest" -Force
    Remove-Item "$env:TEMP\cmdline.zip", "$env:TEMP\cmdline_temp" -Recurse -Force
}

# 5. Esportazione PATH per la sessione
$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:ANDROID_HOME\emulator;$env:ANDROID_HOME\platform-tools;$env:PATH"

# 6. Installazione Piattaforma 33, Emulator ed Immagine di Sistema
# NOTA: Per accelerazione hardware x86_64 usare system-images;android-33;google_apis;x86_64.
# Se l'hypervisor x86 (AEHD/WHPX) non è attivo senza riavvio, usare l'immagine ARM64 (system-images;android-33;google_apis;arm64-v8a).
cmd.exe /c "echo y | ""$env:ANDROID_HOME\cmdline-tools\latest\bin\sdkmanager.bat"" --sdk_root=""$env:ANDROID_HOME"" ""platforms;android-33"" ""build-tools;33.0.2"" ""platform-tools"" ""emulator"" ""system-images;android-33;google_apis;arm64-v8a"""

# 7. Copia del jar android.car.jar nella cartella app/libs del progetto
New-Item -ItemType Directory -Path "app\libs" -Force | Out-Null
Copy-Item "$env:ANDROID_HOME\platforms\android-33\optional\android.car.jar" -Destination "app\libs\android.car.jar" -Force
```

### 3.2 Creazione e Personalizzazione AVD (1440 × 1770)

L'head unit del veicolo Jaecoo 7 SHS-H ha un display verticale con risoluzione **1440 × 1770**.

```powershell
# Creazione dell'AVD nel percorso configurato da ANDROID_AVD_HOME
New-Item -ItemType Directory -Path $env:ANDROID_AVD_HOME -Force | Out-Null
echo "no" | & "$env:ANDROID_HOME\cmdline-tools\latest\bin\avdmanager.bat" create avd -n JaeDrive_Emulator -k "system-images;android-33;google_apis;arm64-v8a" --force

# Configurazione della risoluzione 1440x1770 e parametri RAM/Disco nel config.ini dell'AVD
$configPath = "$env:ANDROID_AVD_HOME\JaeDrive_Emulator.avd\config.ini"
if (Test-Path $configPath) {
    Add-Content -Path $configPath -Value "hw.lcd.width=1440"
    Add-Content -Path $configPath -Value "hw.lcd.height=1770"
    Add-Content -Path $configPath -Value "hw.lcd.density=240"
    Add-Content -Path $configPath -Value "hw.ramSize=2048M"
    Add-Content -Path $configPath -Value "disk.dataPartition.size=2147483648"
}
```

### 3.3 Avvio dell'Emulatore

```powershell
& "$env:ANDROID_HOME\emulator\emulator.exe" -avd JaeDrive_Emulator -gpu host
```
*(Nota per agenti AI/Headless: aggiungere `-no-window` se viene eseguito su server privo di display GUI).*

---

## 4. Guida alla Configurazione: Linux

### 4.1 Pre-Check Spazio Disco e Setup SDK (Bash)

Su Linux verificare che la directory target abbia almeno **8 GB liberi**:

```bash
#!/usr/bin/env bash
set -e

# 1. Pre-Check Spazio Disco
FREE_SPACE_GB=$(df -BG "$HOME" | awk 'NR==2 {print $4}' | sed 's/G//')
echo "Spazio libero su Home: ${FREE_SPACE_GB} GB"
if [ "$FREE_SPACE_GB" -lt 8 ]; then
    echo "WARNING: Spazio insufficiente su Home ($FREE_SPACE_GB GB disponibili, 8 GB richiesti)."
    echo "Impostare ANDROID_HOME ed ANDROID_AVD_HOME su una partizione idonea."
fi

# 2. Impostazione Dinamica Percorsi
export JAVA_HOME="${JAVA_HOME:-$HOME/.jdk-17}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/.android-sdk}"
export ANDROID_AVD_HOME="${ANDROID_AVD_HOME:-$HOME/.android/avd}"

# 3. Download JDK 17
if [ ! -f "$JAVA_HOME/bin/java" ]; then
    mkdir -p "$JAVA_HOME"
    curl -fsSL "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.10%2B7/OpenJDK17U-jdk_x64_linux_hotspot_17.0.10_7.tar.gz" | tar -xz -C "$JAVA_HOME" --strip-components=1
fi

# 4. Download Command Line Tools
if [ ! -f "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]; then
    mkdir -p "$ANDROID_HOME/cmdline-tools"
    curl -fsSL "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip" -o /tmp/cmdline.zip
    unzip -q /tmp/cmdline.zip -d /tmp/cmdline_temp
    mv /tmp/cmdline_temp/cmdline-tools "$ANDROID_HOME/cmdline-tools/latest"
    rm -rf /tmp/cmdline.zip /tmp/cmdline_temp
fi

# 5. Esportazione PATH
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$PATH"

# 6. Installazione Pacchetti Android SDK
yes | sdkmanager --sdk_root="$ANDROID_HOME" "platforms;android-33" "build-tools;33.0.2" "platform-tools" "emulator" "system-images;android-33;google_apis;x86_64"

# 7. Copia android.car.jar
mkdir -p app/libs
cp "$ANDROID_HOME/platforms/android-33/optional/android.car.jar" app/libs/android.car.jar
```

### 4.2 Creazione e Personalizzazione AVD (Linux)

```bash
# Creazione AVD
mkdir -p "$ANDROID_AVD_HOME"
echo "no" | avdmanager create avd -n JaeDrive_Emulator -k "system-images;android-33;google_apis;x86_64" --force

# Configurazione Risoluzione 1440x1770
CONFIG_FILE="$ANDROID_AVD_HOME/JaeDrive_Emulator.avd/config.ini"
echo "hw.lcd.width=1440" >> "$CONFIG_FILE"
echo "hw.lcd.height=1770" >> "$CONFIG_FILE"
echo "hw.lcd.density=240" >> "$CONFIG_FILE"
echo "hw.ramSize=2048M" >> "$CONFIG_FILE"
echo "disk.dataPartition.size=2147483648" >> "$CONFIG_FILE"
```

### 4.3 Avvio dell'Emulatore (Linux)

```bash
emulator -avd JaeDrive_Emulator -gpu host
```

---

## 5. Compilazione, Deploy ed Esecuzione

Con l'emulatore avviato e rilevato da `adb devices`:

```bash
# 1. Compilazione della variante Debug (con Mock attivi)
./gradlew assembleDebug

# 2. Installazione dell'APK sull'emulatore
adb install -r app/build/outputs/apk/debug/JaeDrive.apk

# 3. Avvio dell'Activity Principale
adb shell am start -n com.phabryc.jaedrive/.MainActivity
```

All'avvio su emulatore, nei log (`adb logcat -s JaeDrive`) comparirà:
`[EMULAZIONE DEBUG] Bus VDB OEM non rilevato. Avvio VehicleSimulator per test su Emulatore...`
L'interfaccia utente mostrerà i dati di telemetria fittizi aggiornati dinamicamente in tempo reale.

---

## 6. Risoluzione Problemi Note e Best Practices per Agenti AI

1. **Pre-Check Spazio Disco (8 GB)**: Verificare sempre la quota disco prima del download. In caso di spazio scarso sul drive principale, configurare `$env:ANDROID_HOME` ed `$env:ANDROID_AVD_HOME` su un'unità capiente senza usare lettere fisse o hardcodate nel codice.
2. **Accelerazione CPU su Windows**: Le immagini x86_64 richiedono l'installazione del driver `Android_Emulator_Hypervisor_Driver` (AEHD) via `silent_install.bat` con permessi elevati (UAC), oppure l'uso dell'immagine **ARM64** (`system-images;android-33;google_apis;arm64-v8a`).
3. **Piped Accept License**: In PowerShell usare sempre `cmd.exe /c "echo y | ...\sdkmanager.bat ..."` per assicurarsi che l'accettazione della licenza non resti bloccata in attesa di input da console.
4. **Variante Release Pulita**: Per verificare che la versione di produzione sia priva di simulazioni e mock, eseguire `./gradlew assembleRelease`.
