window.ALARM_REMINDER_CONFIG = {
  // Ignored in Firebase mode. Apps Script now runs only as a scheduled Gmail worker.
  appsScriptUrl: "",

  dataBackend: "firebase",
  firebase: {
    apiKey: "AIzaSyAAsEv5zVhNc_nTthZmwXQ7OgzFEnZJyo0",
    authDomain: "alarmevent-7d4fc.firebaseapp.com",
    projectId: "alarmevent-7d4fc",
    storageBucket: "alarmevent-7d4fc.firebasestorage.app",
    messagingSenderId: "931212410785",
    appId: "1:931212410785:web:544f603f59533506cc95e0"
  },
  adminEmails: ["mbsprojectcalculator@gmail.com"],

  timezone: "Asia/Singapore",
  timeZoneOffset: "+08:00",
  requestTimeoutMs: 60000,
  refreshMs: 60000,
  alarmWindowMinutes: 60
};
