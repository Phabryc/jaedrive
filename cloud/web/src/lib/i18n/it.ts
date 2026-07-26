// Dizionario italiano - fonte di verità per l'insieme delle chiavi (en.ts deve avere
// esattamente le stesse, vedi LanguageContext.tsx: en e' tipizzato come
// Record<keyof typeof it, string>, un errore di compilazione se le due liste divergono).
// Stessa filosofia delle risorse stringa Android (values/values-it) ma un'unica lingua di
// riferimento invece di due file "alla pari", perche' l'app e' nata ed e' tuttora scritta
// prima in italiano.
export const it = {
  // Comuni a piu' pagine
  "common.loading": "Caricamento...",
  "common.delete": "Elimina",
  "common.edit": "Modifica",
  "common.save": "Salva",
  "common.saving": "Salvataggio...",
  "common.back": "← Indietro",
  "common.name": "Nome",
  "common.firstName": "Nome",
  "common.lastName": "Cognome",
  "common.email": "Email",
  "common.password": "Password",
  "common.or": "oppure",
  "common.login": "Accedi",
  "common.continue": "Continua",
  "common.genericError": "Si è verificato un errore. Riprova.",
  "common.reset": "reimposta",

  // Etichette metriche riusate in piu' punti (TripRow, TripDetail, ecc.)
  "trip.kindAuto": "Percorso GPS",
  "trip.kindManual": "Viaggio manuale",
  "trip.ongoing": "in corso",
  "trip.km": "Km",
  "trip.liters": "Litri",
  "trip.kmPerL": "Km/l",
  "trip.kmTraveled": "Km percorsi",
  "trip.avgConsumption": "Consumo medio",

  // Percorso preimpostato: messaggi condivisi tra piu' pagine
  "routeCommon.deleteConfirm": 'Eliminare il percorso "{{name}}"? L\'operazione non può essere annullata.',
  "routeCommon.saveError": "Impossibile salvare il percorso. Riprova.",

  // Link legali (footer AppShell/Landing, checkbox Onboarding)
  "legal.terms": "Termini di Servizio",
  "legal.privacy": "Informativa Privacy",

  // AppShell (barra di navigazione dell'app autenticata)
  "appShell.myVehicles": "Le mie auto",
  "appShell.settings": "Impostazioni",
  "appShell.logout": "Esci",

  // Landing (pagina pubblica su "/")
  "landing.eyebrow": "Jaecoo · Omoda",
  "landing.heroTitleLine1": "I dati della tua auto,",
  "landing.heroTitleLine2": "oltre lo schermo di serie.",
  "landing.heroSubtitle":
    "JaeDrive legge il bus veicolo di Jaecoo e Omoda e mostra quello che l'infotainment ufficiale nasconde: consumi reali, flusso di energia ibrido, viaggi automatici — tutto sincronizzato nel cloud.",
  "landing.ctaSecondary": "Scopri come funziona",
  "landing.feature1Title": "Dati reali, non stimati",
  "landing.feature1Body":
    "Modalità di guida, flusso di energia ibrido, stato di carica: letti direttamente dal bus veicolo, non dai valori segnaposto dell'infotainment di serie.",
  "landing.feature2Title": "Viaggi e percorsi automatici",
  "landing.feature2Body":
    "Ogni tragitto viene tracciato via GPS in automatico, con mappa ed elenco EV/ibrido/motore. Salva i tuoi percorsi ricorrenti e vedi le statistiche aggregarsi da sole.",
  "landing.feature3Title": "Consumi sotto controllo",
  "landing.feature3Body":
    "Andamento del consumo nel tempo, confronto tra viaggi, stima CO₂: calcolati sui dati reali della tua auto, non su medie generiche di listino.",
  "landing.feature4Title": "Sempre sincronizzato",
  "landing.feature4Body":
    "Associa l'auto al tuo account con un codice o un QR dallo schermo di bordo: i viaggi arrivano da soli su jaedrive.com, consultabili da qualunque dispositivo.",
  "landing.modelsTitle": "Un'app, tutta la gamma",
  "landing.modelsSubtitle": "Non solo un'auto: JaeDrive è pensata per l'intera famiglia Jaecoo e Omoda, motorizzazioni ibride e termiche comprese.",
  "landing.finalCtaTitle": "Pronto a vedere cosa nasconde la tua auto?",
  "landing.finalCtaButton": "Accedi o crea un account",
  "landing.disclaimer": "JaeDrive è un progetto indipendente e amatoriale, non affiliato a Chery, Jaecoo, Omoda o Desay.",

  // Login
  "login.signinSubtitle": "Accedi al tuo account",
  "login.signupSubtitle": "Crea un nuovo account",
  "login.signupButton": "Registrati",
  "login.continueWithGoogle": "Continua con Google",
  "login.switchToSignup": "Non hai un account? Registrati",
  "login.switchToSignin": "Hai già un account? Accedi",
  "login.error.wrongPassword": "Email o password errati.",
  "login.error.emailInUse": "Esiste già un account con questa email.",
  "login.error.weakPassword": "Password troppo corta (minimo 6 caratteri).",
  "login.error.userNotFound": "Nessun account con questa email.",
  "login.error.unauthorizedDomain":
    "Questo dominio non è autorizzato per l'accesso Google. Aggiungilo in Firebase Console → Authentication → Settings → Authorized domains.",
  "login.error.operationNotAllowed": "L'accesso con Google non è abilitato per questo progetto Firebase (Authentication → Sign-in method).",
  "login.error.popupBlocked": "Il browser ha bloccato il popup di accesso Google. Consenti i popup per questo sito e riprova.",

  // Onboarding (profilo + accettazione legale obbligatoria)
  "onboarding.titleUpdated": "Termini aggiornati",
  "onboarding.titleComplete": "Completa il profilo",
  "onboarding.subtitleUpdated": "Abbiamo aggiornato Termini di Servizio e Informativa Privacy: per continuare devi accettarli di nuovo.",
  "onboarding.subtitleComplete": "Ci servono questi dati prima di continuare.",
  "onboarding.acceptLegalPart1": "Ho letto e accetto i",
  "onboarding.acceptLegalPart2": "e l'",

  // Pair (associazione auto via codice/QR)
  "pair.title": "Aggiungi auto",
  "pair.autoClaiming": "Codice rilevato dal QR, associazione in corso...",
  "pair.instructions":
    "Apri JaeDrive sull'auto: nella pagina di associazione viene mostrato un codice a 8 caratteri (o un QR da inquadrare). Inseriscilo qui per collegare l'auto al tuo account.",
  "pair.invalidCode": "Codice non valido o scaduto.",
  "pair.submitButton": "Collega auto",
  "pair.placeholderExample": "Es. K7H2P9QX",

  // Dashboard (elenco auto dell'utente)
  "dashboard.addVehicle": "+ Aggiungi auto",
  "dashboard.notSynced": "Marca/modello non ancora sincronizzati",

  // Settings
  "settings.title": "Impostazioni",
  "settings.deleteVehicle": "Elimina auto",
  "settings.deleteVehicleConfirm": 'Eliminare "{{name}}" e tutti i suoi viaggi? L\'operazione non può essere annullata.',
  "settings.newNamePlaceholder": "Nuovo nome",
  "settings.rename": "Rinomina",
  "settings.language": "Lingua",

  // Trips (elenco viaggi di un veicolo)
  "trips.filterAll": "Tutti",
  "trips.filterAuto": "Percorsi GPS",
  "trips.filterManual": "Viaggi manuali",
  "trips.title": "Viaggi",
  "trips.savedRoutesLink": "Percorsi salvati →",
  "trips.backfillButton": "Recupera indirizzi mancanti",
  "trips.backfillBusy": "Recupero in corso...",
  "trips.backfillAllPresent": "Tutti gli indirizzi sono già presenti.",
  "trips.backfillResult": "Aggiornati {{updated}} indirizzi su {{scanned}} controllati.",
  "trips.backfillContinue": " Clicca di nuovo per continuare.",
  "trips.backfillError": "Errore durante il recupero degli indirizzi.",
  "trips.noTrips": "Nessun viaggio trovato.",
  "trips.prevPage": "← Precedenti",
  "trips.nextPage": "Successivi →",
  "trips.pageOf": "Pagina {{page}} di {{total}}",

  // TripDetail
  "tripDetail.deleteConfirm": "Eliminare questo viaggio? L'operazione non può essere annullata.",
  "tripDetail.saveAsRoute": "Salva come percorso",
  "tripDetail.routeNamePlaceholder": "Nome del percorso (es. Casa-Lavoro)",
  "tripDetail.routeSaved": "Percorso salvato.",
  "tripDetail.viewRoute": "Vedi il percorso →",
  "tripDetail.driveModeTitle": "Modalità di guida",
  "tripDetail.manualRangeTitle": "Viaggi GPS in questo periodo",
  "tripDetail.manualRangeEmpty": "Nessun percorso GPS registrato tra l'inizio e la fine di questo accumulo manuale.",

  // Routes (elenco percorsi preimpostati)
  "routes.backFallback": "Viaggi",
  "routes.title": "Percorsi salvati",
  "routes.newRoute": "+ Nuovo percorso",
  "routes.empty": "Nessun percorso salvato.",
  "routes.radiusCreated": "Raggio {{radius}} m · creato il {{date}}",

  // RouteDetail
  "routeDetail.backLink": "← Percorsi salvati",
  "routeDetail.radiusLabel": "Raggio di match: {{radius}} m",
  "routeDetail.matchOne": "{{count}} viaggio corrisponde a questo percorso (partenza e arrivo entro {{radius}} m).",
  "routeDetail.matchMany": "{{count}} viaggi corrispondono a questo percorso (partenza e arrivo entro {{radius}} m).",
  "routeDetail.emptyState":
    "Nessun viaggio corrisponde ancora a questo percorso. Il viaggio usato per crearlo dovrebbe comparire qui - se non lo vedi, prova ad allargare il raggio di match modificando il percorso.",

  // RouteEditor
  "routeEditor.editTitle": "Modifica percorso",
  "routeEditor.newTitle": "Nuovo percorso",
  "routeEditor.namePlaceholder": "es. Casa-Lavoro",
  "routeEditor.start": "Partenza",
  "routeEditor.end": "Arrivo",
  "routeEditor.searchStartPlaceholder": "Cerca un indirizzo di partenza...",
  "routeEditor.searchEndPlaceholder": "Cerca un indirizzo di arrivo...",
  "routeEditor.hintSetStart": "Clicca sulla mappa per impostare la partenza, oppure cerca un indirizzo qui sopra.",
  "routeEditor.hintSetEnd": "Clicca sulla mappa per impostare l'arrivo, oppure cerca un indirizzo qui sopra.",
  "routeEditor.hintDrag": "Trascina i due marker sulla mappa per affinare la posizione.",
  "routeEditor.radiusLabel": "Raggio di tolleranza: {{radius}} m",
  "routeEditor.saveButton": "Salva percorso",

  // AddressSearch
  "addressSearch.searching": "Ricerca...",

  // VehicleInfoCard
  "vehicleInfo.notConfigured": "Auto non configurata",
  "vehicleInfo.notSynced": "Marca/modello non ancora sincronizzati dall'app",
  "vehicleInfo.editName": "Modifica nome →",

  // Statistiche (VehicleStatsPanel/StatsBody, riusate anche da RouteDetail/TripDetail)
  "stats.loading": "Caricamento statistiche...",
  "stats.totalKm": "Km totali",
  "stats.totalLiters": "Litri totali",
  "stats.trips": "Viaggi",
  "stats.co2": "CO₂ stimata",
  "stats.consumptionTrend": "Andamento consumo",
  "stats.energyBreakdown": "Ripartizione energia",
  "stats.driveModeBreakdown": "Ripartizione modalità di guida",
  "stats.noDataYet": "Dati non ancora disponibili.",
  "stats.kmElectric": "Km in elettrico",
  "stats.kmHybrid": "Km in ibrido",
  "stats.bestTrip": "Miglior viaggio",
  "stats.worstTrip": "Peggior viaggio",

  // CalendarHeatmap
  "calendar.title": "Giorni guidati",
  "calendar.month0": "Gennaio",
  "calendar.month1": "Febbraio",
  "calendar.month2": "Marzo",
  "calendar.month3": "Aprile",
  "calendar.month4": "Maggio",
  "calendar.month5": "Giugno",
  "calendar.month6": "Luglio",
  "calendar.month7": "Agosto",
  "calendar.month8": "Settembre",
  "calendar.month9": "Ottobre",
  "calendar.month10": "Novembre",
  "calendar.month11": "Dicembre",
  "calendar.weekday0": "Lun",
  "calendar.weekday1": "Mar",
  "calendar.weekday2": "Mer",
  "calendar.weekday3": "Gio",
  "calendar.weekday4": "Ven",
  "calendar.weekday5": "Sab",
  "calendar.weekday6": "Dom",
  "calendar.durationHoursMinutes": "{{h}}h {{m}}min",
  "calendar.durationHoursOnly": "{{h}}h",
  "calendar.durationMinutesOnly": "{{m}} min",
  "calendar.tripSingular": "viaggio",
  "calendar.tripPlural": "viaggi",
  "calendar.noTrips": "Nessun viaggio",
  "calendar.noTripsThisDay": "Nessun viaggio questo giorno.",
  "calendar.statDistance": "Percorsi",
  "calendar.statConsumption": "Consumo medio",
  "calendar.statFuel": "Carburante",
  "calendar.statDuration": "Alla guida",

  // Grafici viaggio (TripTimelineCharts/ExperimentalTripCharts)
  "charts.battery": "Batteria",
  "charts.fuel": "Carburante",
  "charts.modeTooltipPrefix": "Modalità: ",
  "charts.batteryFuelTitle": "Batteria e carburante",
  "charts.batteryFuelHint": "Sfondo colorato = modalità energia nel momento",
  "charts.speed": "Velocità",
  "charts.elevationTitle": "Profilo altimetrico",
  "charts.elevationHint": "Sfondo colorato = modalità di guida nel momento",
  "charts.elevationSeries": "Altitudine",
  "charts.experimentalTitle": "Dati sperimentali (valori grezzi, scala non confermata)",
  "charts.instConsumption": "Consumo istantaneo (grezzo)",
  "charts.regenLevel": "Livello rigenerazione (grezzo)",
} as const;
