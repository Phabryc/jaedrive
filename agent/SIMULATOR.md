# Ambiente di Emulazione e Mock Telemetria Veicolo (JaeDrive)

Questo documento fornisce le istruzioni tecniche complete per configurare l'ambiente di compilazione, l'emulatore Android e il sistema di mock telemetria per **JaeDrive** (app per Jaecoo 7 SHS-H).

La guida è strutturata per consentire sia agli sviluppatori che ad **agenti AI (coding agents)** di replicare l'ambiente in modo totalmente automatizzato su macchine **Windows** e **Linux**.

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

## 2. Prerequisiti dell'Ambiente di Sviluppo

1. **JDK 17** (raccomandato Eclipse Temurin 17).
2. **Android SDK Command Line Tools** (versione recente).
3. **Android SDK Platform 33** & **Build-Tools 33.0.2**.
4. **`android.car.jar`**: Dipendenza di sistema Android Automotive. Deve essere posizionata in `app/libs/android.car.jar`. Può essere prelevata dall'Android SDK (`platforms/android-33/optional/android.car.jar`).

---

## 3. Guida alla Configurazione: Windows

### 3.1 Download e Setup Automatizzato SDK (PowerShell)

Eseguire i seguenti comandi in PowerShell per configurare JDK 17, Android SDK e accettare le licenze:

```powershell
# 1. Download e installazione JDK 17 portatile
$jdkUrl = "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.10%2B7/OpenJDK17U-jdk_x64_windows_hotspot_17.0.10_7.zip"
curl.exe -L -o "$env:TEMP\jdk17.zip" $jdkUrl
Expand-Archive -Path "$env:TEMP\jdk17.zip" -DestinationPath "$env:TEMP\jdk17_temp" -Force
$extractedJdk = Get-ChildItem "$env:TEMP\jdk17_temp" | Select-Object -First 1
Move-Item -Path $extractedJdk.FullName -Destination "$env:USERPROFILE\.jdk-17" -Force
Remove-Item "$env:TEMP\jdk17.zip", "$env:TEMP\jdk17_temp" -Recurse -Force

# 2. Download Android Command Line Tools
$cmdlineUrl = "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip"
curl.exe -L -o "$env:TEMP\cmdline.zip" $cmdlineUrl
New-Item -ItemType Directory -Path "$env:USERPROFILE\.android-sdk\cmdline-tools" -Force | Out-Null
Expand-Archive -Path "$env:TEMP\cmdline.zip" -DestinationPath "$env:TEMP\cmdline_temp" -Force
Move-Item -Path "$env:TEMP\cmdline_temp\cmdline-tools" -Destination "$env:USERPROFILE\.android-sdk\cmdline-tools\latest" -Force
Remove-Item "$env:TEMP\cmdline.zip", "$env:TEMP\cmdline_temp" -Recurse -Force

# 3. Variabili d'ambiente per la sessione
$env:JAVA_HOME = "$env:USERPROFILE\.jdk-17"
$env:ANDROID_HOME = "$env:USERPROFILE\.android-sdk"
$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:ANDROID_HOME\emulator;$env:ANDROID_HOME\platform-tools;$env:PATH"

# 4. Installazione Piattaforma 33, Emulator e Immagine di Sistema x86_64
echo "y" | sdkmanager.bat --sdk_root=$env:ANDROID_HOME "platforms;android-33" "build-tools;33.0.2" "platform-tools" "emulator" "system-images;android-33;google_apis;x86_64"

# 5. Copia del jar android.car.jar nella cartella app/libs del progetto
New-Item -ItemType Directory -Path "app\libs" -Force | Out-Null
Copy-Item "$env:ANDROID_HOME\platforms\android-33\optional\android.car.jar" -Destination "app\libs\android.car.jar" -Force
```

### 3.2 Creazione e Personalizzazione AVD (1440 × 1770)

L'head unit del veicolo Jaecoo 7 SHS-H ha un display verticale con risoluzione **1440 × 1770**.

```powershell
# Creazione dell'AVD
echo "no" | avdmanager.bat create avd -n JaeDrive_Emulator -k "system-images;android-33;google_apis;x86_64" --force

# Configurazione della risoluzione 1440x1770 nel file config.ini dell'AVD
$configPath = "$env:USERPROFILE\.android\avd\JaeDrive_Emulator.avd\config.ini"
Add-Content -Path $configPath -Value "hw.lcd.width=1440"
Add-Content -Path $configPath -Value "hw.lcd.height=1770"
Add-Content -Path $configPath -Value "hw.lcd.density=240"
```

### 3.3 Avvio dell'Emulatore

```powershell
emulator.exe -avd JaeDrive_Emulator -gpu host
```
*(Nota per agenti AI/Headless: aggiungere `-no-window` se viene eseguito su server privo di display GUI).*

---

## 4. Guida alla Configurazione: Linux

### 4.1 Download e Setup Automatizzato SDK (Bash)

 Su Linux (Ubuntu/Debian) verificare la presenza di KVM per l'accelerazione hardware:
```bash
sudo apt update && sudo apt install -y cpu-checker qemu-kvm libvirt-daemon-system libvirt-clients bridge-utils
sudo usermod -aG kvm $USER
```

Eseguire lo script di installazione environment:

```bash
#!/usr/bin/env bash
set -e

# 1. Download JDK 17
mkdir -p ~/.jdk-17
curl -fsSL "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.10%2B7/OpenJDK17U-jdk_x64_linux_hotspot_17.0.10_7.tar.gz" | tar -xz -C ~/.jdk-17 --strip-components=1

# 2. Download Android Command Line Tools
mkdir -p ~/.android-sdk/cmdline-tools
curl -fsSL "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip" -o /tmp/cmdline.zip
unzip -q /tmp/cmdline.zip -d /tmp/cmdline_temp
mv /tmp/cmdline_temp/cmdline-tools ~/.android-sdk/cmdline-tools/latest
rm -rf /tmp/cmdline.zip /tmp/cmdline_temp

# 3. Esportazione Variabili d'Ambiente
export JAVA_HOME="$HOME/.jdk-17"
export ANDROID_HOME="$HOME/.android-sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$PATH"

# 4. Installazione Pacchetti Android SDK
yes | sdkmanager --sdk_root="$ANDROID_HOME" "platforms;android-33" "build-tools;33.0.2" "platform-tools" "emulator" "system-images;android-33;google_apis;x86_64"

# 5. Copia android.car.jar
mkdir -p app/libs
cp "$ANDROID_HOME/platforms/android-33/optional/android.car.jar" app/libs/android.car.jar
```

### 4.2 Creazione e Personalizzazione AVD (Linux)

```bash
# Creazione AVD
echo "no" | avdmanager create avd -n JaeDrive_Emulator -k "system-images;android-33;google_apis;x86_64" --force

# Configurazione Risoluzione 1440x1770
CONFIG_FILE="$HOME/.android/avd/JaeDrive_Emulator.avd/config.ini"
echo "hw.lcd.width=1440" >> "$CONFIG_FILE"
echo "hw.lcd.height=1770" >> "$CONFIG_FILE"
echo "hw.lcd.density=240" >> "$CONFIG_FILE"
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

## 6. Istruzioni per Coding Agents

Per replicare ed eseguire l'ambiente in autonomia:
1. Verificare sempre la presenza di `app/libs/android.car.jar` prima di lanciare la compilazione Gradle.
2. Usare sempre la flag `--sdk_root` quando si invoca `sdkmanager.bat` / `sdkmanager` per evitare ambiguità sui percorsi.
3. Passare `echo "y"` a `sdkmanager` per accettare le licenze in modalità non-interattiva.
4. Per compilare una build di produzione (senza alcun codice mock), eseguire `./gradlew assembleRelease`.
