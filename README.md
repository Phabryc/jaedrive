# JaeDrive

Monorepo: app Android diagnostica per Jaecoo 7 SHS-H (questa cartella, radice del progetto
Gradle) + companion cloud/webapp in [`cloud/`](cloud/README.md) (account utente, aggiunta
auto, visualizzazione viaggi caricati dall'app).

## App Android — Probe App

App diagnostica per Jaecoo 7 SHS-H. Legge dati via CarPropertyManager e li mostra a schermo + logcat.

## Scopo
Verificare quali property sono accessibili sull'head unit Desaysv/Snapdragon e che valori/tipi restituiscono.

## Build

### Prerequisiti
1. Android Studio o SDK con Gradle
2. `android.car.jar` — va estratto dall'head unit:

```bash
adb pull /system/framework/android.car.jar app/libs/android.car.jar
mkdir -p app/libs
```

### Compilazione
```bash
./gradlew assembleDebug
```

### Installazione
```bash
adb install app/build/outputs/apk/debug/app-debug.apk
```

## Dati monitorati
| Property | ID hex | Nota |
|----------|--------|------|
| GEAR_SELECTION | 0x11400400 | Marcia selezionata |
| CURRENT_GEAR | 0x11400401 | Marcia attuale |
| PERF_VEHICLE_SPEED | 0x207 | Velocità km/h |
| PERF_ODOMETER | 0x11600204 | Odometro km |
| FUEL_LEVEL | 0x11600307 | Livello carburante (tipo da verificare) |
| INFO_FUEL_CAPACITY | 0x11600104 | Capacità serbatoio (statico) |
| IGNITION_STATE | 0x409 | Stato accensione/READY |

## Log
```bash
adb logcat -s JaeDrive
```
Tutti i valori raw (tipo + valore) vengono loggati ad ogni cambio.

## Note
- Se una property dà ERRORE, viene mostrato il messaggio a schermo
- Il tipo Java del valore (Float, Integer, ecc.) è mostrato per capire le unità
- FUEL_LEVEL potrebbe essere %, litri, o ml — da verificare dal valore raw
