import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  arrayRemove,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

(() => {
  "use strict";

  const config = Object.assign(
    {
      appsScriptUrl: "",
      dataBackend: "appsScript",
      firebase: null,
      adminEmails: [],
      timezone: "Asia/Singapore",
      timeZoneOffset: "+08:00",
      requestTimeoutMs: 60000,
      refreshMs: 60000,
      alarmWindowMinutes: 60,
      githubImages: {
        owner: "",
        repo: "",
        branch: "main",
        directory: "images",
        apiUrl: ""
      },
      avatarChoices: []
    },
    window.ALARM_REMINDER_CONFIG || {}
  );

  const ADMIN_SESSION_KEY = "alarmReminderAdminSession";
  const firebaseMode = config.dataBackend === "firebase";
  const adminEmails = (config.adminEmails || []).map((email) => String(email).trim().toLowerCase()).filter(Boolean);
  let firebaseApp = null;
  let firebaseAuth = null;
  let firestore = null;

  if (firebaseMode && config.firebase && config.firebase.projectId) {
    firebaseApp = initializeApp(config.firebase);
    firebaseAuth = getAuth(firebaseApp);
    firestore = getFirestore(firebaseApp);
  }

  const state = {
    events: [],
    publicContacts: [],
    privateContacts: [],
    publicGroups: [],
    avatarChoices: [],
    systemStatus: null,
    calendarMonth: startOfMonth(new Date()),
    selectedCalendarDate: "",
    calendarAutoSelected: false,
    calendarUserControlled: false,
    activeAlarms: [],
    audioContext: null,
    alarmInterval: null,
    audioUnlocked: false,
    pendingSubmit: false,
    pendingSubmitTimer: null,
    loadTimer: null,
    firebaseUser: null,
    authReady: !firebaseMode,
    adminToken: "",
    adminExpiresAt: 0
  };

  const dom = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    mapDom();
    loadAdminSession();
    bindEvents();
    initFirebaseAuth();
    loadAvatarChoices();
    setDefaultEventDateTime();
    updateAuthUi();
    renderSystemStatus();
    renderCalendar();
    refreshIcons();
    tickClock();
    setInterval(tickClock, 1000);
    setInterval(checkAlarms, 5000);

    if (hasDataBackend()) {
      loadEvents();
      state.loadTimer = setInterval(loadEvents, Number(config.refreshMs) || 60000);
    } else {
      renderEvents();
      setStatus("Not connected", "muted");
    }
  }

  function initFirebaseAuth() {
    if (!firebaseMode || !firebaseAuth) return;

    onAuthStateChanged(firebaseAuth, (user) => {
      state.firebaseUser = user;
      state.authReady = true;
      updateAuthUi();
    });
  }

  function mapDom() {
    dom.connectionStatus = document.getElementById("connectionStatus");
    dom.authStatus = document.getElementById("authStatus");
    dom.sideToolbar = document.getElementById("sideToolbar");
    dom.toolbarToggleButton = document.getElementById("toolbarToggleButton");
    dom.clockLabel = document.getElementById("clockLabel");
    dom.refreshButton = document.getElementById("refreshButton");
    dom.addEventButton = document.getElementById("addEventButton");
    dom.addContactButton = document.getElementById("addContactButton");
    dom.addGroupButton = document.getElementById("addGroupButton");
    dom.adminButton = document.getElementById("adminButton");
    dom.soundButton = document.getElementById("soundButton");
    dom.adminDialog = document.getElementById("adminDialog");
    dom.adminMessage = document.getElementById("adminMessage");
    dom.adminGrid = document.querySelector(".admin-grid");
    dom.loginForm = document.getElementById("loginForm");
    dom.logoutButton = document.getElementById("logoutButton");
    dom.eventForm = document.getElementById("eventForm");
    dom.recipientForm = document.getElementById("recipientForm");
    dom.avatarPickerToggle = document.getElementById("avatarPickerToggle");
    dom.avatarPickerPanel = document.getElementById("avatarPickerPanel");
    dom.avatarPreview = document.getElementById("avatarPreview");
    dom.avatarPickerLabel = document.getElementById("avatarPickerLabel");
    dom.avatarPickerPath = document.getElementById("avatarPickerPath");
    dom.clearAvatarButton = document.getElementById("clearAvatarButton");
    dom.avatarGallery = document.getElementById("avatarGallery");
    dom.avatarGalleryEmpty = document.getElementById("avatarGalleryEmpty");
    dom.contactManagerList = document.getElementById("contactManagerList");
    dom.contactManagerCount = document.getElementById("contactManagerCount");
    dom.groupForm = document.getElementById("groupForm");
    dom.completeCycleForm = document.getElementById("completeCycleForm");
    dom.archiveEventForm = document.getElementById("archiveEventForm");
    dom.clearEventFormButton = document.getElementById("clearEventFormButton");
    dom.deleteEventButton = document.getElementById("deleteEventButton");
    dom.disableRecipientButton = document.getElementById("disableRecipientButton");
    dom.deleteContactButton = document.getElementById("deleteContactButton");
    dom.disableGroupButton = document.getElementById("disableGroupButton");
    dom.bridgeForm = document.getElementById("bridgeForm");
    dom.bridgePayload = document.getElementById("bridgePayload");
    dom.customLeadWrap = document.getElementById("customLeadWrap");
    dom.customFrequencyWrap = document.getElementById("customFrequencyWrap");
    dom.recipientPicker = document.getElementById("recipientPicker");
    dom.recipientPickerCount = document.getElementById("recipientPickerCount");
    dom.recipientPickerEmpty = document.getElementById("recipientPickerEmpty");
    dom.groupPicker = document.getElementById("groupPicker");
    dom.groupPickerCount = document.getElementById("groupPickerCount");
    dom.groupPickerEmpty = document.getElementById("groupPickerEmpty");
    dom.groupContactPicker = document.getElementById("groupContactPicker");
    dom.groupContactPickerCount = document.getElementById("groupContactPickerCount");
    dom.groupContactPickerEmpty = document.getElementById("groupContactPickerEmpty");
    dom.eventList = document.getElementById("eventList");
    dom.eventCount = document.getElementById("eventCount");
    dom.lastUpdated = document.getElementById("lastUpdated");
    dom.emptyState = document.getElementById("emptyState");
    dom.setupNotice = document.getElementById("setupNotice");
    dom.systemStatusPanel = document.getElementById("systemStatusPanel");
    dom.systemStatusTitle = document.getElementById("systemStatusTitle");
    dom.systemStatusBadge = document.getElementById("systemStatusBadge");
    dom.systemStatusDetail = document.getElementById("systemStatusDetail");
    dom.systemLastCheck = document.getElementById("systemLastCheck");
    dom.systemTrigger = document.getElementById("systemTrigger");
    dom.systemQuota = document.getElementById("systemQuota");
    dom.systemSentToday = document.getElementById("systemSentToday");
    dom.systemCoverage = document.getElementById("systemCoverage");
    dom.systemLastRun = document.getElementById("systemLastRun");
    dom.systemLastError = document.getElementById("systemLastError");
    dom.calendarTitle = document.getElementById("calendarTitle");
    dom.calendarGrid = document.getElementById("calendarGrid");
    dom.calendarDetail = document.getElementById("calendarDetail");
    dom.calendarPrevButton = document.getElementById("calendarPrevButton");
    dom.calendarNextButton = document.getElementById("calendarNextButton");
    dom.calendarTodayButton = document.getElementById("calendarTodayButton");
    dom.alarmPanel = document.getElementById("alarmPanel");
    dom.alarmTitle = document.getElementById("alarmTitle");
    dom.alarmMeta = document.getElementById("alarmMeta");
    dom.dismissAlarmButton = document.getElementById("dismissAlarmButton");
    dom.eventTemplate = document.getElementById("eventCardTemplate");
  }

  function bindEvents() {
    dom.refreshButton.addEventListener("click", () => loadEvents({ manual: true }));
    dom.toolbarToggleButton.addEventListener("click", toggleSideToolbar);
    dom.adminDialog.addEventListener("click", closeDialogOnBackdropClick);
    dom.adminButton.addEventListener("click", openAdminDialog);
    dom.addEventButton.addEventListener("click", startNewEvent);
    dom.addContactButton.addEventListener("click", startNewContact);
    dom.addGroupButton.addEventListener("click", startNewGroup);
    dom.calendarPrevButton.addEventListener("click", () => shiftCalendarMonth(-1));
    dom.calendarNextButton.addEventListener("click", () => shiftCalendarMonth(1));
    dom.calendarTodayButton.addEventListener("click", showCurrentCalendarMonth);
    dom.loginForm.addEventListener("submit", submitLoginForm);
    dom.logoutButton.addEventListener("click", logoutAdmin);
    dom.soundButton.addEventListener("click", unlockAudio);
    dom.dismissAlarmButton.addEventListener("click", dismissActiveAlarms);
    dom.eventForm.addEventListener("submit", submitEventForm);
    dom.recipientForm.addEventListener("submit", submitRecipientForm);
    dom.groupForm.addEventListener("submit", submitGroupForm);
    dom.completeCycleForm.addEventListener("submit", submitCompleteCycleForm);
    dom.archiveEventForm.addEventListener("submit", submitArchiveForm);
    dom.clearEventFormButton.addEventListener("click", clearEventForm);
    dom.deleteEventButton.addEventListener("click", submitDeleteEvent);
    dom.disableRecipientButton.addEventListener("click", submitDisableRecipient);
    dom.deleteContactButton.addEventListener("click", submitDeleteContact);
    dom.disableGroupButton.addEventListener("click", submitDisableGroup);
    dom.avatarPickerToggle.addEventListener("click", () => toggleAvatarPicker());
    dom.clearAvatarButton.addEventListener("click", clearSelectedAvatar);
    dom.eventForm.leadPreset.addEventListener("change", toggleCustomLead);
    dom.eventForm.frequencyPreset.addEventListener("change", toggleCustomFrequency);
    window.addEventListener("message", handleBridgeMessage);
  }

  function setDefaultEventDateTime() {
    const now = new Date(Date.now() + 60 * 60 * 1000);
    const parts = getZoneParts(now);
    dom.eventForm.eventDate.value = `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
    dom.eventForm.eventTime.value = `${pad(parts.hour)}:${pad(parts.minute)}`;
  }

  function tickClock() {
    const now = new Date();
    dom.clockLabel.textContent = new Intl.DateTimeFormat(undefined, {
      timeZone: config.timezone,
      dateStyle: "medium",
      timeStyle: "medium"
    }).format(now);
  }

  async function loadEvents(options = {}) {
    if (firebaseMode) {
      await loadFirebaseData(options);
      return;
    }

    if (!config.appsScriptUrl) {
      renderEvents();
      showNotice(true);
      return;
    }

    setStatus(options.manual ? "Refreshing" : "Loading", "muted");

    try {
      const response = await jsonp("publicEvents");
      if (!response || response.ok !== true) {
        throw new Error((response && response.error) || "Apps Script returned an error.");
      }

      state.systemStatus = normalizeSystemStatus(response.systemStatus);
      state.events = (response.events || []).map(normalizeEvent);
      state.events.sort(sortByNextOccurrence);
      ensureDefaultCalendarSelection();
      renderSystemStatus();
      renderCalendar();
      renderEvents();
      checkAlarms();
      setStatus("Connected", "ok");
      dom.lastUpdated.textContent = `Loaded ${formatShortDateTime(new Date())}`;
      showNotice(false);
    } catch (error) {
      setStatus("Load failed", "error");
      if (options.manual || options.showErrors) {
        showAdminMessage(appsScriptTimeoutMessage(error), false);
      }
      state.systemStatus = Object.assign(normalizeSystemStatus(null), {
        status: "error",
        detail: appsScriptTimeoutMessage(error),
        lastError: appsScriptTimeoutMessage(error)
      });
      renderSystemStatus();
      renderCalendar();
      renderEvents();
    }
  }

  async function loadFirebaseData(options = {}) {
    if (!firestore) {
      renderEvents();
      showNotice(true);
      setStatus("Firebase setup", "error");
      state.systemStatus = Object.assign(normalizeSystemStatus(null), {
        status: "error",
        detail: "Add Firebase config in config.js before loading events.",
        lastError: "Firebase is not initialized."
      });
      renderSystemStatus();
      renderCalendar();
      return;
    }

    setStatus(options.manual ? "Refreshing" : "Loading", "muted");

    try {
      const admin = isAdminLoggedIn();
      const [eventsSnapshot, contactsSnapshot, groupsSnapshot, systemSnapshot, privateContactsSnapshot] = await Promise.all([
        getDocs(query(collection(firestore, "events"), where("active", "==", true))),
        getDocs(query(collection(firestore, "publicContacts"), where("active", "==", true))),
        getDocs(query(collection(firestore, "publicGroups"), where("active", "==", true))),
        getDoc(doc(firestore, "system", "status")),
        admin ? getDocs(collection(firestore, "contacts")) : Promise.resolve(null)
      ]);

      const publicContacts = eventsFromSnapshot(contactsSnapshot).map(normalizePublicContactForStore);
      const publicGroups = eventsFromSnapshot(groupsSnapshot).map(normalizePublicGroupForStore);
      state.publicContacts = publicContacts;
      state.privateContacts = privateContactsSnapshot ? eventsFromSnapshot(privateContactsSnapshot).map(normalizePrivateContactForStore) : [];
      state.publicGroups = publicGroups;
      state.systemStatus = normalizeSystemStatus(systemSnapshot.exists() ? systemSnapshot.data() : null);
      state.events = eventsFromSnapshot(eventsSnapshot)
        .map((item) => attachPublicContacts(item, publicContacts, publicGroups))
        .map(normalizeEvent)
        .sort(sortByNextOccurrence);

      ensureDefaultCalendarSelection();
      renderSystemStatus();
      renderCalendar();
      renderEvents();
      renderContactPicker();
      renderGroupPicker();
      renderGroupContactPicker();
      renderContactManager();
      checkAlarms();
      setStatus("Firebase", "ok");
      dom.lastUpdated.textContent = `Loaded ${formatShortDateTime(new Date())}`;
      showNotice(false);
    } catch (error) {
      setStatus("Load failed", "error");
      if (options.manual || options.showErrors) {
        showAdminMessage(firebaseErrorMessage(error), false);
      }
      state.systemStatus = Object.assign(normalizeSystemStatus(null), {
        status: "error",
        detail: firebaseErrorMessage(error),
        lastError: firebaseErrorMessage(error)
      });
      renderSystemStatus();
      renderCalendar();
      renderEvents();
      showNotice(true);
    }
  }

  function eventsFromSnapshot(snapshot) {
    return snapshot.docs.map((documentSnapshot) => {
      return Object.assign({ id: documentSnapshot.id }, documentSnapshot.data());
    });
  }

  function normalizePublicContactForStore(contact) {
    const displayName = String(contact.displayName || contact.name || "Contact").trim();
    return {
      id: String(contact.id || ""),
      displayName,
      initials: String(contact.initials || initialsForName(displayName)).slice(0, 3).toUpperCase(),
      avatarUrl: sanitizeAvatarPath(contact.avatarUrl || ""),
      tags: contact.tags || contact.tagsArray || "",
      active: toBoolean(contact.active, true)
    };
  }

  function normalizePrivateContactForStore(contact) {
    const displayName = String(contact.displayName || contact.email || "Contact").trim();
    return {
      id: String(contact.id || ""),
      email: String(contact.email || "").trim().toLowerCase(),
      displayName,
      initials: String(contact.initials || initialsForName(displayName)).slice(0, 3).toUpperCase(),
      avatarUrl: sanitizeAvatarPath(contact.avatarUrl || ""),
      tags: contact.tags || contact.tagsArray || "",
      active: toBoolean(contact.active, true)
    };
  }

  function normalizePublicGroupForStore(group) {
    const name = String(group.name || group.displayName || "Group").trim();
    return {
      id: String(group.id || ""),
      name,
      initials: String(group.initials || initialsForName(name)).slice(0, 3).toUpperCase(),
      contactIds: normalizeRecipientIds(group.contactIds),
      active: toBoolean(group.active, true)
    };
  }

  function attachPublicContacts(event, contacts, groups) {
    const hasRecipientIds = Array.isArray(event.recipientIds);
    const hasGroupIds = Array.isArray(event.recipientGroupIds);
    const recipientIds = normalizeRecipientIds(event.recipientIds);
    const recipientGroupIds = normalizeRecipientIds(event.recipientGroupIds);
    const groupSet = new Set(recipientGroupIds);
    const recipientSet = new Set(recipientIds);
    const eventTags = parseTags(event.recipientTags || event.recipientTagsArray);

    if (hasGroupIds) {
      for (const group of groups || []) {
        if (!group.active || !groupSet.has(group.id)) continue;
        for (const contactId of group.contactIds) {
          recipientSet.add(contactId);
        }
      }
    }

    const recipients = contacts
      .filter((contact) => contact.active)
      .filter((contact) => {
        if (hasRecipientIds || hasGroupIds) return recipientSet.has(contact.id);
        if (eventTags.length === 0) return false;
        const contactTags = parseTags(contact.tags || contact.tagsArray);
        return eventTags.some((tag) => contactTags.includes(tag));
      })
      .map(normalizeRecipientContact);

    return Object.assign({}, event, { recipientIds, recipientGroupIds, recipients });
  }

  function firebaseErrorMessage(error) {
    const code = String(error && error.code ? error.code : "");
    if (code === "permission-denied") {
      return "Firebase permission denied. Check Firestore rules and login status.";
    }
    if (code === "unavailable") {
      return "Firebase is temporarily unavailable. Try Refresh again.";
    }
    return String(error && error.message ? error.message : error);
  }

  function jsonp(action, params = {}) {
    return new Promise((resolve, reject) => {
      const callbackName = `alarmReminderCallback_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}`;
      const script = document.createElement("script");
      const url = new URL(config.appsScriptUrl);

      url.searchParams.set("action", action);
      url.searchParams.set("callback", callbackName);
      Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

      const timer = window.setTimeout(() => {
        cleanup();
        reject(new Error("Apps Script did not respond in time."));
      }, Number(config.requestTimeoutMs) || 60000);

      window[callbackName] = (payload) => {
        cleanup();
        resolve(payload);
      };

      script.onerror = () => {
        cleanup();
        reject(new Error("Unable to load Apps Script response."));
      };

      function cleanup() {
        window.clearTimeout(timer);
        delete window[callbackName];
        script.remove();
      }

      script.src = url.toString();
      document.head.appendChild(script);
    });
  }

  function appsScriptTimeoutMessage(error) {
    const message = String(error && error.message ? error.message : error);
    if (message === "Apps Script did not respond in time.") {
      return "Apps Script public data refresh timed out. Login may still be OK; wait a moment and press Refresh.";
    }
    return message;
  }

  function normalizeEvent(event) {
    const recurrence = event.recurrence === "yearly" ? "yearly" : "none";
    const normalized = {
      id: String(event.id || "").trim(),
      title: String(event.title || "Untitled reminder").trim(),
      eventDate: String(event.eventDate || event.date || "").slice(0, 10),
      eventTime: String(event.eventTime || event.time || "09:00").slice(0, 5),
      details: String(event.details || ""),
      recurrence,
      yearlyMonth: Number(event.yearlyMonth || 0),
      yearlyDay: Number(event.yearlyDay || 0),
      leadMinutes: clampInteger(event.leadMinutes, 0, 525600, 20160),
      reminderFrequencyDays: clampInteger(event.reminderFrequencyDays, 0, 365, 1),
      recipientIds: normalizeRecipientIds(event.recipientIds),
      recipientGroupIds: normalizeRecipientIds(event.recipientGroupIds),
      recipientTags: Array.isArray(event.recipientTags || event.recipientTagsArray)
        ? (event.recipientTags || event.recipientTagsArray).join(", ")
        : String(event.recipientTags || ""),
      recipients: Array.isArray(event.recipients) ? event.recipients.map(normalizeRecipientContact) : [],
      soundEnabled: toBoolean(event.soundEnabled, true),
      flashEnabled: toBoolean(event.flashEnabled, true),
      active: toBoolean(event.active, true),
      completedOccurrenceKeys: Array.isArray(event.completedOccurrenceKeys) ? event.completedOccurrenceKeys.map(String) : [],
      nextOccurrenceIso: event.nextOccurrenceIso || "",
      reminderAtIso: event.reminderAtIso || ""
    };

    const nextOccurrence = normalized.nextOccurrenceIso
      ? new Date(normalized.nextOccurrenceIso)
      : computeNextOccurrence(normalized, new Date());
    normalized.nextOccurrence = nextOccurrence;
    normalized.nextOccurrenceIso = normalized.nextOccurrenceIso || (nextOccurrence ? nextOccurrence.toISOString() : "");
    return normalized;
  }

  function normalizeRecipientContact(recipient) {
    const displayName = String(recipient.displayName || recipient.name || "Contact").trim();
    return {
      id: String(recipient.id || ""),
      displayName,
      initials: String(recipient.initials || initialsForName(displayName)).slice(0, 3).toUpperCase(),
      avatarUrl: sanitizeAvatarPath(recipient.avatarUrl || "")
    };
  }

  function normalizeSystemStatus(status) {
    const safe = status || {};
    return {
      status: String(safe.status || "setup"),
      checkedAt: timestampToIso(safe.checkedAt),
      triggerInstalled: toBoolean(safe.triggerInstalled, false),
      triggerStale: toBoolean(safe.triggerStale, true),
      senderExpected: String(safe.senderExpected || ""),
      senderDetected: String(safe.senderDetected || ""),
      quotaRemaining: safe.quotaRemaining === "" || safe.quotaRemaining === undefined ? "" : Number(safe.quotaRemaining),
      activeEvents: clampInteger(safe.activeEvents, 0, 999999, 0),
      activeRecipients: clampInteger(safe.activeRecipients, 0, 999999, 0),
      dueEvents: clampInteger(safe.dueEvents, 0, 999999, 0),
      lastRunEmailsSent: clampInteger(safe.lastRunEmailsSent, 0, 999999, 0),
      lastRunEmailsFailed: clampInteger(safe.lastRunEmailsFailed, 0, 999999, 0),
      emailsSentToday: clampInteger(safe.emailsSentToday, 0, 999999, 0),
      emailsFailedToday: clampInteger(safe.emailsFailedToday, 0, 999999, 0),
      lastError: String(safe.lastError || ""),
      detail: String(safe.detail || "")
    };
  }

  function renderSystemStatus() {
    const status = state.systemStatus || normalizeSystemStatus(null);
    const level = status.status === "ok" || status.status === "warning" || status.status === "error" ? status.status : "setup";
    const displayLevel = level === "ok" ? "OK" : level === "setup" ? "Setup" : level[0].toUpperCase() + level.slice(1);

    dom.systemStatusPanel.classList.toggle("status-ok", level === "ok");
    dom.systemStatusPanel.classList.toggle("status-warning", level === "warning");
    dom.systemStatusPanel.classList.toggle("status-error", level === "error");
    dom.systemStatusBadge.className = `status-pill ${level === "ok" ? "status-ok" : level === "warning" ? "status-warning" : level === "error" ? "status-error" : "status-muted"}`;
    dom.systemStatusBadge.textContent = displayLevel;

    dom.systemStatusTitle.textContent =
      level === "ok" ? "Reminder engine online" :
      level === "warning" ? "Reminder engine needs attention" :
      level === "error" ? "Reminder engine error" :
      "Backend setup required";

    dom.systemStatusDetail.textContent = systemStatusDetail(status, level);
    dom.systemLastCheck.textContent = status.checkedAt ? formatFullDateTime(new Date(status.checkedAt)) : "-";
    dom.systemTrigger.textContent = status.triggerInstalled ? (status.triggerStale ? "Stale" : "Running") : "Missing";
    dom.systemQuota.textContent = status.quotaRemaining === "" || Number.isNaN(status.quotaRemaining)
      ? "Unknown"
      : `${status.quotaRemaining} left`;
    dom.systemSentToday.textContent = `${status.emailsSentToday} sent / ${status.emailsFailedToday} failed`;
    dom.systemCoverage.textContent = `${status.activeEvents} events / ${status.activeRecipients} contacts`;
    dom.systemLastRun.textContent = `${status.lastRunEmailsSent} sent / ${status.lastRunEmailsFailed} failed`;
    dom.systemLastError.textContent = status.lastError ? `Last error: ${status.lastError}` : "";
    dom.systemLastError.classList.toggle("is-hidden", !status.lastError);
  }

  function systemStatusDetail(status, level) {
    if (!hasDataBackend()) return "Connect Firebase in config.js to enable reminders.";
    if (status.detail) return status.detail;
    if (firebaseMode && level === "setup") return "Firebase is connected. Apps Script Gmail worker has not checked in yet.";
    if (!status.triggerInstalled) return "Install the Apps Script time trigger to activate automatic email checks.";
    if (status.triggerStale) return "The trigger has not checked in recently. Open Apps Script and inspect triggers.";
    if (status.lastError) return status.lastError;
    if (level === "ok") return "Trigger, sender, quota, and email logs look healthy.";
    if (level === "warning") return "The system is running, but recent sends or trigger freshness need attention.";
    if (level === "error") return "The reminder engine reported an error.";
    return "Waiting for the first Apps Script health check.";
  }

  function renderCalendar() {
    const month = state.calendarMonth || startOfMonth(new Date());
    const eventsByDate = groupEventsByCalendarDate(state.events.filter((event) => event.active && event.nextOccurrence));
    const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
    const startOffset = firstDay.getDay();
    const gridStart = new Date(month.getFullYear(), month.getMonth(), 1 - startOffset);
    const todayKey = localDateKey(new Date());

    dom.calendarTitle.textContent = new Intl.DateTimeFormat(undefined, {
      month: "long",
      year: "numeric"
    }).format(month);

    dom.calendarGrid.innerHTML = "";
    for (let index = 0; index < 42; index += 1) {
      const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
      const key = localDateKey(date);
      const events = eventsByDate.get(key) || [];
      const button = document.createElement("button");
      button.type = "button";
      button.className = "calendar-cell";
      button.classList.toggle("is-outside", date.getMonth() !== month.getMonth());
      button.classList.toggle("is-today", key === todayKey);
      button.classList.toggle("has-events", events.length > 0);
      button.classList.toggle("is-selected", key === state.selectedCalendarDate);
      button.disabled = events.length === 0;
      button.setAttribute("aria-label", calendarCellLabel(date, events));

      const day = document.createElement("span");
      day.className = "calendar-day";
      day.textContent = String(date.getDate());
      button.appendChild(day);

      if (events.length > 0) {
        const marker = document.createElement("span");
        marker.className = "calendar-alert-marker";
        marker.textContent = "!";
        button.appendChild(marker);

        const count = document.createElement("span");
        count.className = "calendar-event-count";
        count.textContent = `${events.length} event${events.length === 1 ? "" : "s"}`;
        button.appendChild(count);
      }

      button.addEventListener("click", () => selectCalendarDate(key));
      dom.calendarGrid.appendChild(button);
    }

    renderCalendarDetail();
    refreshIcons();
  }

  function renderCalendarDetail() {
    const events = state.selectedCalendarDate
      ? state.events.filter((event) => event.active && event.nextOccurrence && localDateKey(event.nextOccurrence) === state.selectedCalendarDate)
      : [];

    dom.calendarDetail.innerHTML = "";
    dom.calendarDetail.classList.toggle("is-hidden", events.length === 0);
    if (events.length === 0) return;

    const title = document.createElement("div");
    title.className = "calendar-detail-head";
    title.innerHTML = `<strong>${formatCalendarDetailDate(state.selectedCalendarDate)}</strong><span>${events.length} event${events.length === 1 ? "" : "s"}</span>`;
    dom.calendarDetail.appendChild(title);

    for (const event of events) {
      const item = document.createElement("article");
      item.className = "calendar-detail-item";

      const copy = document.createElement("div");
      const name = document.createElement("h3");
      name.textContent = event.title;
      const meta = document.createElement("p");
      meta.textContent = `${formatFullDateTime(event.nextOccurrence)} - ${formatReminderSchedule(event.leadMinutes, event.reminderFrequencyDays)}`;
      copy.appendChild(name);
      copy.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "calendar-detail-actions";
      actions.classList.toggle("is-hidden", !isAdminLoggedIn());

      const done = document.createElement("button");
      done.className = "primary-button";
      done.type = "button";
      done.innerHTML = '<i data-lucide="circle-check"></i><span>Done</span>';
      done.addEventListener("click", () => completeEventFromCard(event));

      const load = document.createElement("button");
      load.className = "ghost-button";
      load.type = "button";
      load.innerHTML = '<i data-lucide="pen-line"></i><span>Edit</span>';
      load.addEventListener("click", () => loadEventIntoForm(event));

      actions.appendChild(done);
      actions.appendChild(load);
      item.appendChild(copy);
      item.appendChild(actions);
      dom.calendarDetail.appendChild(item);
    }

    refreshIcons();
  }

  function selectCalendarDate(dateKey) {
    state.selectedCalendarDate = state.selectedCalendarDate === dateKey ? "" : dateKey;
    state.calendarAutoSelected = false;
    state.calendarUserControlled = true;
    renderCalendar();
  }

  function shiftCalendarMonth(direction) {
    state.calendarMonth = new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth() + direction, 1);
    state.selectedCalendarDate = "";
    state.calendarAutoSelected = false;
    state.calendarUserControlled = true;
    renderCalendar();
  }

  function showCurrentCalendarMonth() {
    state.calendarMonth = startOfMonth(new Date());
    state.selectedCalendarDate = localDateKey(new Date());
    state.calendarAutoSelected = false;
    state.calendarUserControlled = true;
    renderCalendar();
  }

  function ensureDefaultCalendarSelection() {
    const activeEvents = state.events.filter((event) => event.active && event.nextOccurrence);
    if (activeEvents.length === 0) {
      state.selectedCalendarDate = "";
      state.calendarAutoSelected = false;
      return;
    }

    if (state.calendarUserControlled) return;

    const currentMonthKey = monthKey(state.calendarMonth);
    const monthEvents = activeEvents.filter((event) => monthKey(event.nextOccurrence) === currentMonthKey);
    if (monthEvents.length === 0) {
      state.selectedCalendarDate = "";
      state.calendarAutoSelected = false;
      return;
    }

    const selectedStillExists = monthEvents.some((event) => localDateKey(event.nextOccurrence) === state.selectedCalendarDate);
    if (!state.selectedCalendarDate || !selectedStillExists || state.calendarAutoSelected) {
      const firstEvent = monthEvents[0];
      const dateKey = localDateKey(firstEvent.nextOccurrence);
      state.selectedCalendarDate = dateKey;
      state.calendarAutoSelected = true;
    }
  }

  function groupEventsByCalendarDate(events) {
    const grouped = new Map();
    for (const event of events) {
      const key = localDateKey(event.nextOccurrence);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(event);
    }
    return grouped;
  }

  function calendarCellLabel(date, events) {
    const dateLabel = new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(date);
    if (events.length === 0) return dateLabel;
    return `${dateLabel}, ${events.length} event${events.length === 1 ? "" : "s"}`;
  }

  function formatCalendarDetailDate(dateKey) {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(parseLocalDateKey(dateKey));
  }

  function renderEvents() {
    const publicEvents = state.events.filter((event) => event.active);
    dom.eventList.innerHTML = "";
    dom.eventCount.textContent = `${publicEvents.length} ${publicEvents.length === 1 ? "event" : "events"}`;
    dom.emptyState.classList.toggle("is-hidden", publicEvents.length > 0 || !hasDataBackend());
    showNotice(!hasDataBackend());

    for (const event of publicEvents) {
      const card = dom.eventTemplate.content.firstElementChild.cloneNode(true);
      const due = getDueAlarm(event, new Date());
      card.classList.toggle("is-due", Boolean(due));
      card.querySelector(".event-id").textContent = event.id ? `ID ${event.id}` : "No ID";
      card.querySelector("h3").textContent = event.title;
      card.querySelector(".repeat-badge").textContent = event.recurrence === "yearly" ? "Every year" : "Once";
      card.querySelector(".event-time").textContent = event.nextOccurrence
        ? formatFullDateTime(event.nextOccurrence)
        : "Past event";
      card.querySelector(".lead-time").textContent = formatReminderSchedule(event.leadMinutes, event.reminderFrequencyDays);
      const details = card.querySelector(".event-details");
      details.textContent = event.details;
      details.classList.toggle("is-hidden", !event.details);
      renderRecipientStrip(card.querySelector(".recipient-strip"), event.recipients);

      card.querySelector(".load-event-button").addEventListener("click", () => loadEventIntoForm(event));
      card.querySelector(".complete-event-button").addEventListener("click", () => completeEventFromCard(event));
      card.querySelector(".archive-event-button").addEventListener("click", () => archiveEventFromCard(event));
      card.querySelector(".delete-event-button").addEventListener("click", () => deleteEventFromCard(event));
      card.querySelector(".copy-id-button").addEventListener("click", () => copyEventId(event.id));
      card.querySelector(".card-actions").classList.toggle("is-hidden", !isAdminLoggedIn());
      dom.eventList.appendChild(card);
    }

    refreshIcons();
  }

  function renderRecipientStrip(container, recipients) {
    container.innerHTML = "";
    const contacts = Array.isArray(recipients) ? recipients : [];
    container.classList.toggle("is-hidden", contacts.length === 0);
    if (contacts.length === 0) return;

    const label = document.createElement("span");
    label.className = "recipient-strip-label";
    label.textContent = "Reminds";
    container.appendChild(label);

    for (const contact of contacts) {
      const item = document.createElement("span");
      item.className = "contact-avatar";
      item.title = contact.displayName;
      item.setAttribute("aria-label", contact.displayName);

      if (contact.avatarUrl) {
        const image = document.createElement("img");
        image.alt = "";
        image.loading = "lazy";
        image.referrerPolicy = "no-referrer";
        image.src = contact.avatarUrl;
        image.addEventListener("error", () => {
          image.remove();
          item.textContent = contact.initials;
          item.classList.add("avatar-fallback");
        });
        item.appendChild(image);
      } else {
        item.textContent = contact.initials;
        item.classList.add("avatar-fallback");
      }

      container.appendChild(item);
    }
  }

  function renderContactPicker(selectedIds = getSelectedRecipientIds()) {
    if (!dom.recipientPicker) return;

    const selectedSet = new Set(normalizeRecipientIds(selectedIds));
    const contacts = state.publicContacts
      .filter((contact) => contact.active)
      .slice()
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

    dom.recipientPicker.innerHTML = "";
    dom.recipientPickerEmpty.classList.toggle("is-hidden", contacts.length > 0);

    for (const contact of contacts) {
      const label = document.createElement("label");
      label.className = "contact-option";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = "recipientIds";
      input.value = contact.id;
      input.checked = selectedSet.has(contact.id);
      input.addEventListener("change", handleRecipientPickerChange);

      const avatar = buildContactAvatar(contact);

      const name = document.createElement("span");
      name.className = "contact-option-name";
      name.textContent = contact.displayName;

      label.appendChild(input);
      label.appendChild(avatar);
      label.appendChild(name);
      dom.recipientPicker.appendChild(label);
    }

    updateRecipientPickerCount();
  }

  function buildContactAvatar(contact) {
    const item = document.createElement("span");
    item.className = "contact-avatar";
    item.title = contact.displayName;
    item.setAttribute("aria-label", contact.displayName);

    if (contact.avatarUrl) {
      const image = document.createElement("img");
      image.alt = "";
      image.loading = "lazy";
      image.referrerPolicy = "no-referrer";
      image.src = contact.avatarUrl;
      image.addEventListener("error", () => {
        image.remove();
        item.textContent = contact.initials;
        item.classList.add("avatar-fallback");
      });
      item.appendChild(image);
    } else {
      item.textContent = contact.initials;
      item.classList.add("avatar-fallback");
    }

    return item;
  }

  function handleRecipientPickerChange(event) {
    void event;
    updateRecipientPickerCount();
  }

  function updateRecipientPickerCount() {
    if (!dom.recipientPickerCount) return;
    const selected = getSelectedRecipientIds();
    dom.recipientPickerCount.textContent = `${selected.length} selected`;
  }

  function getSelectedRecipientIds() {
    if (!dom.recipientPicker) return [];
    return Array.from(dom.recipientPicker.querySelectorAll('input[name="recipientIds"]:checked'))
      .map((input) => input.value)
      .filter(Boolean);
  }

  function renderGroupPicker(selectedIds = getSelectedGroupIds()) {
    if (!dom.groupPicker) return;

    const selectedSet = new Set(normalizeRecipientIds(selectedIds));
    const groups = state.publicGroups
      .filter((group) => group.active)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));

    dom.groupPicker.innerHTML = "";
    dom.groupPickerEmpty.classList.toggle("is-hidden", groups.length > 0);

    for (const group of groups) {
      const label = document.createElement("label");
      label.className = "contact-option group-option";
      label.title = `ID ${group.id}`;

      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = "recipientGroupIds";
      input.value = group.id;
      input.checked = selectedSet.has(group.id);
      input.addEventListener("change", updateGroupPickerCount);

      const avatar = document.createElement("span");
      avatar.className = "contact-avatar avatar-fallback group-avatar";
      avatar.textContent = group.initials;

      const name = document.createElement("span");
      name.className = "contact-option-name";
      name.textContent = `${group.name} (${group.contactIds.length})`;

      label.appendChild(input);
      label.appendChild(avatar);
      label.appendChild(name);
      dom.groupPicker.appendChild(label);
    }

    updateGroupPickerCount();
  }

  function updateGroupPickerCount() {
    if (!dom.groupPickerCount) return;
    const selected = getSelectedGroupIds();
    dom.groupPickerCount.textContent = `${selected.length} selected`;
  }

  function getSelectedGroupIds() {
    if (!dom.groupPicker) return [];
    return Array.from(dom.groupPicker.querySelectorAll('input[name="recipientGroupIds"]:checked'))
      .map((input) => input.value)
      .filter(Boolean);
  }

  function renderGroupContactPicker(selectedIds = getSelectedGroupContactIds()) {
    if (!dom.groupContactPicker) return;

    const selectedSet = new Set(normalizeRecipientIds(selectedIds));
    const contacts = state.publicContacts
      .filter((contact) => contact.active)
      .slice()
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

    dom.groupContactPicker.innerHTML = "";
    dom.groupContactPickerEmpty.classList.toggle("is-hidden", contacts.length > 0);

    for (const contact of contacts) {
      const label = document.createElement("label");
      label.className = "contact-option";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = "groupContactIds";
      input.value = contact.id;
      input.checked = selectedSet.has(contact.id);
      input.addEventListener("change", updateGroupContactPickerCount);

      label.appendChild(input);
      label.appendChild(buildContactAvatar(contact));

      const name = document.createElement("span");
      name.className = "contact-option-name";
      name.textContent = contact.displayName;
      label.appendChild(name);

      dom.groupContactPicker.appendChild(label);
    }

    updateGroupContactPickerCount();
  }

  function updateGroupContactPickerCount() {
    if (!dom.groupContactPickerCount) return;
    const selected = getSelectedGroupContactIds();
    dom.groupContactPickerCount.textContent = `${selected.length} selected`;
  }

  function getSelectedGroupContactIds() {
    if (!dom.groupContactPicker) return [];
    return Array.from(dom.groupContactPicker.querySelectorAll('input[name="groupContactIds"]:checked'))
      .map((input) => input.value)
      .filter(Boolean);
  }

  async function loadAvatarChoices() {
    const configured = normalizeAvatarChoices(config.avatarChoices || []);
    let githubChoices = [];
    let directoryChoices = [];

    try {
      githubChoices = await loadGithubAvatarChoices();
    } catch (_error) {
      githubChoices = [];
    }

    try {
      directoryChoices = await loadDirectoryAvatarChoices();
    } catch (_error) {
      directoryChoices = [];
    }

    state.avatarChoices = mergeAvatarChoices(githubChoices, directoryChoices, configured);
    renderAvatarGallery();
  }

  function normalizeAvatarChoices(value) {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => {
        if (typeof item === "string") {
          const src = sanitizeAvatarPath(item);
          return { src, label: src.split("/").pop() || src };
        }
        const src = sanitizeAvatarPath(item && item.src ? item.src : "");
        return {
          src,
          label: String(item && item.label ? item.label : src).trim()
        };
      })
      .filter((item) => item.src);
  }

  async function loadGithubAvatarChoices() {
    const source = githubAvatarSource();
    if (!source) return [];

    const response = await fetch(source.apiUrl, {
      cache: "no-store",
      headers: {
        Accept: "application/vnd.github+json"
      }
    });
    if (!response.ok) return [];

    const files = await response.json();
    if (!Array.isArray(files)) return [];

    return files
      .filter((file) => file && file.type === "file" && /\.(jpe?g|png|webp|gif)$/i.test(file.name || ""))
      .map((file) => {
        const src = sanitizeAvatarPath(file.path || `${source.directory}/${file.name}`);
        return {
          src,
          label: labelFromImageName(file.name)
        };
      })
      .filter((item) => item.src);
  }

  async function loadDirectoryAvatarChoices() {
    const directory = avatarImageDirectory();
    const response = await fetch(`${directory}/`, { cache: "no-store" });
    if (!response.ok) return [];

    const html = await response.text();
    const documentFragment = new DOMParser().parseFromString(html, "text/html");
    return Array.from(documentFragment.querySelectorAll("a[href]"))
      .map((link) => {
        const href = link.getAttribute("href") || "";
        const url = new URL(href, response.url);
        const fileName = decodeURIComponent(url.pathname.split("/").pop() || "");
        if (!/\.(jpe?g|png|webp|gif)$/i.test(fileName)) return null;
        const src = sanitizeAvatarPath(`${directory}/${fileName}`);
        return {
          src,
          label: labelFromImageName(fileName)
        };
      })
      .filter(Boolean)
      .filter((item) => item.src);
  }

  function githubAvatarSource() {
    const imageConfig = Object.assign(
      {
        owner: "",
        repo: "",
        branch: "main",
        directory: "images",
        apiUrl: ""
      },
      config.githubImages || {}
    );

    const directory = String(imageConfig.directory || "images").replace(/^\/+|\/+$/g, "") || "images";
    const apiUrl = String(imageConfig.apiUrl || "").trim();
    if (apiUrl) return { apiUrl, directory };

    let owner = String(imageConfig.owner || "").trim();
    let repo = String(imageConfig.repo || "").trim();
    const branch = String(imageConfig.branch || "main").trim() || "main";

    if ((!owner || !repo) && /\.github\.io$/i.test(window.location.hostname)) {
      owner = owner || window.location.hostname.replace(/\.github\.io$/i, "");
      const pathParts = window.location.pathname.split("/").filter(Boolean);
      repo = repo || pathParts[0] || `${owner}.github.io`;
    }

    if (!owner || !repo) return null;

    const encodedDirectory = directory.split("/").map(encodeURIComponent).join("/");
    return {
      directory,
      apiUrl:
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}` +
        `/contents/${encodedDirectory}?ref=${encodeURIComponent(branch)}`
    };
  }

  function avatarImageDirectory() {
    const imageConfig = Object.assign({ directory: "images" }, config.githubImages || {});
    return String(imageConfig.directory || "images").replace(/^\/+|\/+$/g, "") || "images";
  }

  function mergeAvatarChoices(...groups) {
    const choices = [];
    const seen = new Set();

    groups.flat().forEach((item) => {
      const src = sanitizeAvatarPath(item && item.src ? item.src : "");
      if (!src || seen.has(src)) return;
      seen.add(src);
      choices.push({
        src,
        label: String(item.label || labelFromImageName(src)).trim()
      });
    });

    return choices;
  }

  function labelFromImageName(name) {
    return String(name || "")
      .split("/")
      .pop()
      .replace(/\.(jpe?g|png|webp|gif)$/i, "")
      .replace(/[_-]+/g, " ")
      .trim() || "Avatar";
  }

  function renderAvatarGallery(selected = dom.recipientForm ? dom.recipientForm.avatarUrl.value : "") {
    if (!dom.avatarGallery) return;
    dom.avatarGallery.innerHTML = "";
    dom.avatarGalleryEmpty.classList.toggle("is-hidden", state.avatarChoices.length > 0);
    updateAvatarPreview(selected);

    for (const avatar of state.avatarChoices) {
      const button = document.createElement("button");
      button.className = "avatar-choice";
      button.classList.toggle("is-selected", avatar.src === selected);
      button.type = "button";
      button.title = avatar.label || avatar.src;

      const image = document.createElement("img");
      image.alt = "";
      image.src = avatar.src;

      const label = document.createElement("span");
      label.textContent = avatar.label || avatar.src;

      button.appendChild(image);
      button.appendChild(label);
      button.addEventListener("click", () => {
        selectAvatar(avatar.src);
      });
      dom.avatarGallery.appendChild(button);
    }
  }

  function toggleAvatarPicker(forceOpen) {
    if (!dom.avatarPickerPanel || !dom.avatarPickerToggle) return;
    const shouldOpen =
      typeof forceOpen === "boolean" ? forceOpen : dom.avatarPickerPanel.classList.contains("is-hidden");
    dom.avatarPickerPanel.classList.toggle("is-hidden", !shouldOpen);
    dom.avatarPickerToggle.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
  }

  function selectAvatar(src) {
    dom.recipientForm.avatarUrl.value = src;
    renderAvatarGallery(src);
    toggleAvatarPicker(false);
  }

  function clearSelectedAvatar() {
    dom.recipientForm.avatarUrl.value = "";
    renderAvatarGallery("");
    toggleAvatarPicker(false);
  }

  function updateAvatarPreview(selected = "") {
    if (!dom.avatarPreview || !dom.avatarPickerLabel || !dom.avatarPickerPath) return;
    const avatar = state.avatarChoices.find((item) => item.src === selected);
    dom.avatarPreview.innerHTML = "";
    dom.avatarPreview.classList.toggle("avatar-fallback", !selected);

    if (selected) {
      const image = document.createElement("img");
      image.alt = "";
      image.src = selected;
      image.addEventListener("error", () => {
        image.remove();
        dom.avatarPreview.textContent = "?";
        dom.avatarPreview.classList.add("avatar-fallback");
      });
      dom.avatarPreview.appendChild(image);
    } else {
      dom.avatarPreview.textContent = "?";
    }

    dom.avatarPickerLabel.textContent = selected ? avatar?.label || "Selected avatar" : "Choose avatar";
    dom.avatarPickerPath.textContent = selected ? avatar?.src || selected : "Click to open thumbnail list";
  }

  function renderContactManager() {
    if (!dom.contactManagerList) return;
    const contacts = state.privateContacts
      .slice()
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

    dom.contactManagerList.innerHTML = "";
    dom.contactManagerCount.textContent = String(contacts.length);

    for (const contact of contacts) {
      const item = document.createElement("article");
      item.className = "contact-manager-item";
      item.classList.toggle("is-inactive", !contact.active);

      const avatar = buildContactAvatar(contact);
      const copy = document.createElement("div");
      copy.className = "contact-manager-copy";
      const name = document.createElement("strong");
      name.textContent = contact.displayName;
      const email = document.createElement("span");
      email.textContent = contact.email || "No email";
      copy.appendChild(name);
      copy.appendChild(email);

      const actions = document.createElement("div");
      actions.className = "contact-manager-actions";

      const edit = document.createElement("button");
      edit.className = "ghost-button";
      edit.type = "button";
      edit.innerHTML = '<i data-lucide="pen-line"></i><span>Edit</span>';
      edit.addEventListener("click", () => loadContactIntoForm(contact));

      const remove = document.createElement("button");
      remove.className = "danger-button";
      remove.type = "button";
      remove.innerHTML = '<i data-lucide="trash-2"></i><span>Delete</span>';
      remove.addEventListener("click", () => deleteContactFromManager(contact));

      actions.appendChild(edit);
      actions.appendChild(remove);
      item.appendChild(avatar);
      item.appendChild(copy);
      item.appendChild(actions);
      dom.contactManagerList.appendChild(item);
    }

    refreshIcons();
  }

  function checkAlarms() {
    const now = new Date();
    const due = state.events
      .map((event) => ({ event, alarm: getDueAlarm(event, now) }))
      .filter((entry) => entry.alarm && !isDismissed(entry.event, entry.alarm.key));

    state.activeAlarms = due;
    renderAlarmPanel();

    const shouldFlash = due.some((entry) => entry.event.flashEnabled);
    document.body.classList.toggle("alarm-flashing", shouldFlash);

    if (due.some((entry) => entry.event.soundEnabled)) {
      startAlarmSound();
    } else {
      stopAlarmSound();
    }
  }

  function renderAlarmPanel() {
    if (state.activeAlarms.length === 0) {
      dom.alarmPanel.classList.add("is-hidden");
      stopAlarmSound();
      return;
    }

    const first = state.activeAlarms[0];
    dom.alarmPanel.classList.remove("is-hidden");
    dom.alarmTitle.textContent = first.event.title;
    dom.alarmMeta.textContent =
      state.activeAlarms.length > 1
        ? `${formatFullDateTime(first.alarm.occurrence)} and ${state.activeAlarms.length - 1} more`
        : formatFullDateTime(first.alarm.occurrence);
    refreshIcons();
  }

  function dismissActiveAlarms() {
    for (const entry of state.activeAlarms) {
      localStorage.setItem(dismissKey(entry.event, entry.alarm.key), "1");
    }
    state.activeAlarms = [];
    document.body.classList.remove("alarm-flashing");
    renderAlarmPanel();
    renderEvents();
  }

  function isDismissed(event, occurrenceKey) {
    return localStorage.getItem(dismissKey(event, occurrenceKey)) === "1";
  }

  function dismissKey(event, occurrenceKey) {
    return `alarmDismissed:${event.id}:${occurrenceKey}`;
  }

  function computeNextOccurrence(event, referenceDate) {
    const reference = referenceDate || new Date();
    if (!event.eventDate) return null;

    if (event.recurrence !== "yearly") {
      const occurrence = makeDateInConfiguredZone(event.eventDate, event.eventTime);
      if (!occurrence || event.completedOccurrenceKeys.includes(occurrenceKey(occurrence))) return null;
      return occurrence.getTime() >= reference.getTime() ? occurrence : null;
    }

    const parts = getZoneParts(reference);
    const month = event.yearlyMonth || Number(event.eventDate.slice(5, 7));
    const day = event.yearlyDay || Number(event.eventDate.slice(8, 10));
    let occurrence = makeYearlyDate(parts.year, month, day, event.eventTime);

    let guard = 0;
    while (
      guard < 10 &&
      (occurrence.getTime() < reference.getTime() || event.completedOccurrenceKeys.includes(occurrenceKey(occurrence)))
    ) {
      occurrence = makeYearlyDate(parts.year + 1, month, day, event.eventTime);
      parts.year += 1;
      guard += 1;
    }

    return occurrence;
  }

  function getDueAlarm(event, referenceDate) {
    if (!event.active || !event.eventDate) return null;

    const now = referenceDate || new Date();
    const windowMs = (Number(config.alarmWindowMinutes) || 60) * 60000;
    const candidates = [];

    if (event.recurrence === "yearly") {
      const parts = getZoneParts(now);
      const month = event.yearlyMonth || Number(event.eventDate.slice(5, 7));
      const day = event.yearlyDay || Number(event.eventDate.slice(8, 10));
      candidates.push(makeYearlyDate(parts.year - 1, month, day, event.eventTime));
      candidates.push(makeYearlyDate(parts.year, month, day, event.eventTime));
      candidates.push(makeYearlyDate(parts.year + 1, month, day, event.eventTime));
    } else {
      candidates.push(makeDateInConfiguredZone(event.eventDate, event.eventTime));
    }

    for (const occurrence of candidates.filter(Boolean)) {
      const elapsed = now.getTime() - occurrence.getTime();
      const key = occurrenceKey(occurrence);
      if (event.completedOccurrenceKeys.includes(key)) {
        continue;
      }
      if (elapsed >= 0 && elapsed <= windowMs) {
        return {
          occurrence,
          key
        };
      }
    }

    return null;
  }

  function makeDateInConfiguredZone(dateString, timeString) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return null;
    const time = /^\d{2}:\d{2}$/.test(timeString) ? timeString : "09:00";
    return new Date(`${dateString}T${time}:00${config.timeZoneOffset}`);
  }

  function makeYearlyDate(year, month, day, timeString) {
    const safeDay = Math.min(day, daysInMonth(year, month));
    return makeDateInConfiguredZone(`${year}-${pad(month)}-${pad(safeDay)}`, timeString);
  }

  async function submitEventForm(event) {
    event.preventDefault();
    const form = dom.eventForm;
    const leadMinutes =
      form.leadPreset.value === "custom"
        ? clampInteger(form.leadCustom.value, 0, 525600, 20160)
        : Number(form.leadPreset.value);
    const reminderFrequencyDays =
      form.frequencyPreset.value === "custom"
        ? clampInteger(form.frequencyCustom.value, 1, 365, 1)
        : Number(form.frequencyPreset.value);
    const recipientIds = getSelectedRecipientIds();
    const recipientGroupIds = getSelectedGroupIds();

    const payload = {
      action: "saveEvent",
      event: {
        id: form.id.value.trim(),
        title: form.title.value.trim(),
        details: form.details.value.trim(),
        eventDate: form.eventDate.value,
        eventTime: form.eventTime.value,
        recurrence: form.recurrence.value,
        leadMinutes,
        reminderFrequencyDays,
        recipientIds,
        recipientGroupIds,
        recipientTags: "",
        soundEnabled: form.soundEnabled.checked,
        flashEnabled: form.flashEnabled.checked,
        active: true
      }
    };

    if (firebaseMode) {
      await saveFirebaseEvent(payload.event);
      return;
    }

    submitToAppsScript(payload);
  }

  async function submitRecipientForm(event) {
    event.preventDefault();
    const form = dom.recipientForm;
    const payload = {
      action: "saveRecipient",
      recipient: {
        id: form.id.value.trim(),
        displayName: form.displayName.value.trim(),
        email: form.email.value.trim(),
        avatarUrl: form.avatarUrl.value.trim(),
        tags: form.tags.value.trim(),
        active: true
      }
    };

    if (firebaseMode) {
      await saveFirebaseRecipient(payload.recipient);
      return;
    }

    submitToAppsScript(payload);
  }

  async function submitDisableRecipient() {
    const form = dom.recipientForm;
    const id = form.id.value.trim();
    const email = form.email.value.trim();
    if (!id && !form.reportValidity()) return;

    const ok = window.confirm("Disable this contact? Future event emails will not be sent to this contact.");
    if (!ok) return;

    const payload = {
      action: "deleteRecipient",
      id,
      email
    };

    if (firebaseMode) {
      await disableFirebaseRecipient(payload);
      return;
    }

    submitToAppsScript(payload);
  }

  async function submitDeleteContact() {
    const id = dom.recipientForm.id.value.trim();
    const email = dom.recipientForm.email.value.trim();
    if (!id && !email) {
      showAdminMessage("Load or enter a contact before deleting.", false);
      return;
    }

    const ok = window.confirm("Permanently delete this contact and remove it from events/groups? This cannot be undone.");
    if (!ok) return;

    if (firebaseMode) {
      await deleteFirebaseContact({ id, email });
      return;
    }

    showAdminMessage("Hard delete contact is only available in Firebase mode.", false);
  }

  async function submitGroupForm(event) {
    event.preventDefault();
    const form = dom.groupForm;
    const payload = {
      action: "saveGroup",
      group: {
        id: form.id.value.trim(),
        name: form.name.value.trim(),
        contactIds: getSelectedGroupContactIds(),
        active: true
      }
    };

    if (firebaseMode) {
      await saveFirebaseGroup(payload.group);
      return;
    }

    submitToAppsScript(payload);
  }

  async function submitDisableGroup() {
    const form = dom.groupForm;
    const id = form.id.value.trim();
    if (!id) {
      showAdminMessage("Enter the Group ID to disable a group.", false);
      return;
    }

    const ok = window.confirm(`Disable group "${id}"? Event emails will no longer expand through this group.`);
    if (!ok) return;

    if (firebaseMode) {
      await disableFirebaseGroup(id);
      return;
    }

    submitToAppsScript({
      action: "deleteGroup",
      id
    });
  }

  async function submitLoginForm(event) {
    event.preventDefault();
    if (firebaseMode) {
      await loginWithFirebase();
      return;
    }

    if (!config.appsScriptUrl) {
      showAdminMessage("Set appsScriptUrl in config.js before logging in.", false);
      return;
    }

    const password = dom.loginForm.password.value;
    if (!password) {
      showAdminMessage("Enter admin password.", false);
      return;
    }

    submitToAppsScript(
      {
        action: "login",
        password
      },
      { allowGuest: true, message: "Logging in..." }
    );
  }

  async function submitCompleteCycleForm(event) {
    event.preventDefault();
    const form = dom.completeCycleForm;
    const payload = {
      action: "completeCycle",
      id: form.id.value.trim(),
      note: form.note.value.trim()
    };

    if (!payload.id) {
      showAdminMessage("Enter the Event ID to mark done.", false);
      return;
    }

    const ok = window.confirm(`Mark event "${payload.id}" done for this cycle?`);
    if (!ok) return;

    if (firebaseMode) {
      await completeFirebaseCycle(payload.id, payload.note);
      return;
    }

    submitToAppsScript(payload);
  }

  async function submitArchiveForm(event) {
    event.preventDefault();
    const form = dom.archiveEventForm;
    const payload = {
      action: "deleteEvent",
      id: form.id.value.trim()
    };

    if (!payload.id) {
      showAdminMessage("Enter the Event ID to archive.", false);
      return;
    }

    const ok = window.confirm(`Archive event "${payload.id}"? It will stop showing and stop reminders.`);
    if (!ok) return;

    if (firebaseMode) {
      await archiveFirebaseEvent(payload.id);
      return;
    }

    submitToAppsScript(payload);
  }

  async function submitDeleteEvent() {
    const id = dom.archiveEventForm.id.value.trim();
    if (!id) {
      showAdminMessage("Enter the Event ID to delete.", false);
      return;
    }

    const ok = window.confirm(`Permanently delete event "${id}" and its reminder logs? This cannot be undone.`);
    if (!ok) return;

    if (firebaseMode) {
      await deleteFirebaseEvent(id);
      return;
    }

    showAdminMessage("Hard delete is only available in Firebase mode.", false);
  }

  async function loginWithFirebase() {
    if (!firebaseAuth) {
      showAdminMessage("Firebase Auth is not initialized. Check config.js.", false);
      return;
    }

    const email = String(dom.loginForm.email.value || "").trim().toLowerCase();
    const password = dom.loginForm.password.value;
    if (!email || !password) {
      showAdminMessage("Enter admin email and password.", false);
      return;
    }

    if (adminEmails.length > 0 && !adminEmails.includes(email)) {
      showAdminMessage("This email is not listed as an admin in config.js.", false);
      return;
    }

    if (state.pendingSubmit) return;
    state.pendingSubmit = true;
    setAdminFormsDisabled(true);
    showAdminMessage("Logging in with Firebase...", true);

    try {
      const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
      state.firebaseUser = credential.user;
      updateAuthUi();
      setAdminView("all");
      dom.loginForm.reset();
      showAdminMessage("Logged in. Admin actions are unlocked on this browser.", true);
      await loadEvents({ silent: true });
    } catch (error) {
      showAdminMessage(firebaseErrorMessage(error), false);
    } finally {
      state.pendingSubmit = false;
      setAdminFormsDisabled(false);
    }
  }

  async function saveFirebaseEvent(input) {
    await runFirebaseAdminAction("Saving event...", async () => {
      const id = makeDocumentId(input.id, "evt");
      const title = String(input.title || "").trim();
      const eventDate = requireDateString(input.eventDate);
      const eventTime = requireTimeString(input.eventTime);
      const recurrence = input.recurrence === "yearly" ? "yearly" : "none";
      const dateParts = eventDate.split("-").map(Number);
      const recipientIds = normalizeRecipientIds(input.recipientIds);
      const recipientGroupIds = normalizeRecipientIds(input.recipientGroupIds);

      if (!title) throw new Error("Event title is required.");

      const eventRef = doc(firestore, "events", id);
      const existing = await getDoc(eventRef);
      const existingData = existing.exists() ? existing.data() : {};
      const hasNoticeTargets = recipientIds.length > 0 || recipientGroupIds.length > 0;
      const record = {
        id,
        title: title.slice(0, 120),
        details: String(input.details || "").trim().slice(0, 6000),
        eventDate,
        eventTime,
        recurrence,
        yearlyMonth: recurrence === "yearly" ? dateParts[1] : 0,
        yearlyDay: recurrence === "yearly" ? dateParts[2] : 0,
        leadMinutes: clampInteger(input.leadMinutes, 0, 525600, 20160),
        reminderFrequencyDays: clampInteger(input.reminderFrequencyDays, 0, 365, 1),
        recipientIds,
        recipientGroupIds,
        recipientTags: String(input.recipientTags || "").trim().slice(0, 200),
        recipientTagsArray: parseTags(input.recipientTags),
        soundEnabled: toBoolean(input.soundEnabled, true),
        flashEnabled: toBoolean(input.flashEnabled, true),
        active: input.active === undefined ? true : toBoolean(input.active, true),
        updatedAt: serverTimestamp(),
        updatedBy: currentAdminEmail()
      };

      if (!existing.exists()) {
        record.createdAt = serverTimestamp();
        record.completedOccurrenceKeys = [];
        record.setupNoticeStatus = hasNoticeTargets ? "pending" : "skipped";
        record.setupNoticeRequestedAt = serverTimestamp();
        record.setupNoticeRequestedBy = currentAdminEmail();
      } else if (
        hasNoticeTargets &&
        !["pending", "sent"].includes(String(existingData.setupNoticeStatus || "").toLowerCase())
      ) {
        record.setupNoticeStatus = "pending";
        record.setupNoticeRequestedAt = serverTimestamp();
        record.setupNoticeRequestedBy = currentAdminEmail();
      }

      await setDoc(eventRef, record, { merge: true });
      return existing.exists()
        ? "Event saved."
        : "Event saved. Setup notice will be emailed by the next worker check.";
    });
  }

  async function saveFirebaseRecipient(input) {
    await runFirebaseAdminAction("Saving contact...", async () => {
      const email = String(input.email || "").trim().toLowerCase();
      if (!isValidEmail(email)) throw new Error("A valid Gmail address is required.");

      const id = makeDocumentId(input.id || contactDocumentId(email), "rec");
      const displayName = String(input.displayName || email.split("@")[0]).trim().slice(0, 80);
      const avatarUrl = sanitizeAvatarPath(input.avatarUrl || "");
      const tags = String(input.tags || "").trim().slice(0, 200);
      const tagsArray = parseTags(tags);
      const initials = initialsForName(displayName).slice(0, 3).toUpperCase();
      const contactRef = doc(firestore, "contacts", id);
      const publicRef = doc(firestore, "publicContacts", id);
      const existing = await getDoc(contactRef);
      const batch = writeBatch(firestore);
      const base = {
        id,
        displayName,
        avatarUrl,
        tags,
        tagsArray,
        active: input.active === undefined ? true : toBoolean(input.active, true),
        updatedAt: serverTimestamp(),
        updatedBy: currentAdminEmail()
      };

      batch.set(
        contactRef,
        Object.assign({}, base, {
          email,
          createdAt: existing.exists() ? existing.data().createdAt || serverTimestamp() : serverTimestamp()
        }),
        { merge: true }
      );
      batch.set(
        publicRef,
        Object.assign({}, base, {
          initials,
          createdAt: existing.exists() ? existing.data().createdAt || serverTimestamp() : serverTimestamp()
        }),
        { merge: true }
      );
      await batch.commit();
      dom.recipientForm.reset();
      renderAvatarGallery("");
      toggleAvatarPicker(false);
      return "Gmail contact saved.";
    });
  }

  async function disableFirebaseRecipient(input) {
    await runFirebaseAdminAction("Disabling contact...", async () => {
      const email = String(input.email || "").trim().toLowerCase();
      const id = String(input.id || "").trim() || contactDocumentId(email);
      if (!id) throw new Error("Contact ID is required.");

      const batch = writeBatch(firestore);
      const updates = {
        active: false,
        updatedAt: serverTimestamp(),
        updatedBy: currentAdminEmail()
      };

      batch.set(doc(firestore, "contacts", id), Object.assign({ id, email }, updates), { merge: true });
      batch.set(doc(firestore, "publicContacts", id), Object.assign({ id }, updates), { merge: true });
      await batch.commit();
      dom.recipientForm.reset();
      renderAvatarGallery("");
      toggleAvatarPicker(false);
      return "Gmail contact disabled.";
    });
  }

  async function deleteFirebaseContact(input) {
    await runFirebaseAdminAction("Deleting contact...", async () => {
      const email = String(input.email || "").trim().toLowerCase();
      const id = String(input.id || "").trim() || contactDocumentId(email);
      if (!id) throw new Error("Contact ID is required.");

      const [eventsSnapshot, groupsSnapshot, publicGroupsSnapshot] = await Promise.all([
        getDocs(query(collection(firestore, "events"), where("recipientIds", "array-contains", id))),
        getDocs(query(collection(firestore, "groups"), where("contactIds", "array-contains", id))),
        getDocs(query(collection(firestore, "publicGroups"), where("contactIds", "array-contains", id)))
      ]);

      const batch = writeBatch(firestore);
      batch.delete(doc(firestore, "contacts", id));
      batch.delete(doc(firestore, "publicContacts", id));

      eventsSnapshot.docs.forEach((snapshot) => {
        batch.update(snapshot.ref, {
          recipientIds: arrayRemove(id),
          updatedAt: serverTimestamp(),
          updatedBy: currentAdminEmail()
        });
      });
      groupsSnapshot.docs.forEach((snapshot) => {
        batch.update(snapshot.ref, {
          contactIds: arrayRemove(id),
          updatedAt: serverTimestamp(),
          updatedBy: currentAdminEmail()
        });
      });
      publicGroupsSnapshot.docs.forEach((snapshot) => {
        batch.update(snapshot.ref, {
          contactIds: arrayRemove(id),
          updatedAt: serverTimestamp(),
          updatedBy: currentAdminEmail()
        });
      });

      await batch.commit();
      dom.recipientForm.reset();
      renderAvatarGallery("");
      toggleAvatarPicker(false);
      return "Contact deleted and removed from events/groups.";
    });
  }

  async function saveFirebaseGroup(input) {
    await runFirebaseAdminAction("Saving group...", async () => {
      const name = String(input.name || "").trim();
      const contactIds = normalizeRecipientIds(input.contactIds);
      if (!name) throw new Error("Group name is required.");
      if (contactIds.length === 0) throw new Error("Choose at least one contact for this group.");

      const id = makeDocumentId(input.id || name, "grp");
      const groupRef = doc(firestore, "groups", id);
      const publicRef = doc(firestore, "publicGroups", id);
      const existing = await getDoc(groupRef);
      const base = {
        id,
        name: name.slice(0, 80),
        contactIds,
        active: input.active === undefined ? true : toBoolean(input.active, true),
        updatedAt: serverTimestamp(),
        updatedBy: currentAdminEmail()
      };
      if (!existing.exists()) {
        base.createdAt = serverTimestamp();
      }

      const batch = writeBatch(firestore);
      batch.set(groupRef, base, { merge: true });
      batch.set(
        publicRef,
        Object.assign({}, base, {
          initials: initialsForName(name).slice(0, 3).toUpperCase()
        }),
        { merge: true }
      );
      await batch.commit();
      dom.groupForm.reset();
      renderGroupContactPicker([]);
      return "Gmail group saved.";
    });
  }

  async function disableFirebaseGroup(idInput) {
    await runFirebaseAdminAction("Disabling group...", async () => {
      const id = makeDocumentId(idInput, "grp");
      const updates = {
        active: false,
        updatedAt: serverTimestamp(),
        updatedBy: currentAdminEmail()
      };
      const batch = writeBatch(firestore);
      batch.set(doc(firestore, "groups", id), Object.assign({ id }, updates), { merge: true });
      batch.set(doc(firestore, "publicGroups", id), Object.assign({ id }, updates), { merge: true });
      await batch.commit();
      dom.groupForm.reset();
      renderGroupContactPicker([]);
      return "Gmail group disabled.";
    });
  }

  async function completeFirebaseCycle(id, note) {
    await runFirebaseAdminAction("Marking done...", async () => {
      const eventId = String(id || "").trim();
      if (!eventId) throw new Error("Event ID is required.");

      const reminder = state.events.find((item) => item.id === eventId);
      if (!reminder) throw new Error("Active event not found.");

      const occurrence = computeNextOccurrence(reminder, new Date());
      if (!occurrence) throw new Error("No upcoming cycle to complete.");

      const key = occurrenceKey(occurrence);
      const completionId = makeDocumentId(`${eventId}_${key}`, "done");
      const eventRef = doc(firestore, "events", eventId);
      const completionRef = doc(firestore, "completionLog", completionId);
      const completedOccurrenceKeys = Array.from(new Set([...(reminder.completedOccurrenceKeys || []), key]));
      const eventUpdates = {
        completedOccurrenceKeys,
        updatedAt: serverTimestamp(),
        updatedBy: currentAdminEmail()
      };

      if (reminder.recurrence !== "yearly") {
        eventUpdates.active = false;
      }

      const batch = writeBatch(firestore);
      batch.set(
        completionRef,
        {
          completionId,
          eventId,
          occurrenceKey: key,
          completedAt: serverTimestamp(),
          completedBy: currentAdminEmail(),
          note: String(note || "").trim().slice(0, 1000)
        },
        { merge: true }
      );
      batch.update(eventRef, eventUpdates);
      await batch.commit();
      dom.completeCycleForm.reset();
      return reminder.recurrence === "yearly"
        ? "This cycle is marked done. Next yearly reminder will be shown."
        : "This one-time event is marked done and hidden.";
    });
  }

  async function archiveFirebaseEvent(id) {
    await runFirebaseAdminAction("Archiving event...", async () => {
      const eventId = String(id || "").trim();
      if (!eventId) throw new Error("Event ID is required.");

      await updateDoc(doc(firestore, "events", eventId), {
        active: false,
        archivedAt: serverTimestamp(),
        archivedBy: currentAdminEmail(),
        updatedAt: serverTimestamp()
      });
      dom.archiveEventForm.reset();
      return "Event archived.";
    });
  }

  async function deleteFirebaseEvent(id) {
    await runFirebaseAdminAction("Deleting event...", async () => {
      const eventId = String(id || "").trim();
      if (!eventId) throw new Error("Event ID is required.");

      const [completionSnapshot, emailSnapshot] = await Promise.all([
        getDocs(query(collection(firestore, "completionLog"), where("eventId", "==", eventId))),
        getDocs(query(collection(firestore, "emailLog"), where("eventId", "==", eventId)))
      ]);
      const refs = [
        doc(firestore, "events", eventId),
        ...completionSnapshot.docs.map((snapshot) => snapshot.ref),
        ...emailSnapshot.docs.map((snapshot) => snapshot.ref)
      ];

      await deleteFirestoreRefs(refs);
      dom.archiveEventForm.reset();
      dom.completeCycleForm.reset();
      if (dom.eventForm.id.value.trim() === eventId) clearEventForm();
      return `Event deleted with ${refs.length - 1} related log record${refs.length === 2 ? "" : "s"}.`;
    });
  }

  async function deleteFirestoreRefs(refs) {
    let batch = writeBatch(firestore);
    let count = 0;

    for (const ref of refs) {
      batch.delete(ref);
      count += 1;
      if (count === 450) {
        await batch.commit();
        batch = writeBatch(firestore);
        count = 0;
      }
    }

    if (count > 0) {
      await batch.commit();
    }
  }

  async function runFirebaseAdminAction(message, action) {
    if (!firestore) {
      showAdminMessage("Firebase is not initialized. Check config.js.", false);
      return;
    }

    if (!isAdminLoggedIn()) {
      openAdminDialog();
      showAdminMessage("Login first, then try again.", false);
      return;
    }

    if (state.pendingSubmit) return;
    state.pendingSubmit = true;
    setAdminFormsDisabled(true);
    showAdminMessage(message, true);

    try {
      const successMessage = await action();
      showAdminMessage(successMessage || "Saved.", true);
      await loadEvents({ silent: true });
    } catch (error) {
      showAdminMessage(firebaseErrorMessage(error), false);
    } finally {
      state.pendingSubmit = false;
      setAdminFormsDisabled(false);
    }
  }

  function submitToAppsScript(payload, options = {}) {
    if (firebaseMode) {
      showAdminMessage("Firebase stores events now. Apps Script only sends scheduled Gmail reminders.", false);
      return;
    }

    if (!config.appsScriptUrl) {
      showAdminMessage("Set appsScriptUrl in config.js before saving.", false);
      return;
    }

    if (!options.allowGuest) {
      if (!isAdminLoggedIn()) {
        openAdminDialog();
        showAdminMessage("Login first, then try again.", false);
        return;
      }
      payload.token = state.adminToken;
    }

    if (state.pendingSubmit) return;
    state.pendingSubmit = true;
    setAdminFormsDisabled(true);
    showAdminMessage(options.message || "Saving...", true);

    dom.bridgeForm.action = config.appsScriptUrl;
    dom.bridgePayload.value = JSON.stringify(payload);
    dom.bridgeForm.submit();
    window.clearTimeout(state.pendingSubmitTimer);
    state.pendingSubmitTimer = window.setTimeout(() => {
      state.pendingSubmit = false;
      setAdminFormsDisabled(false);
      showAdminMessage("Apps Script admin action did not respond in time. Check deployment URL/permissions, then try again.", false);
    }, Number(config.requestTimeoutMs) || 60000);
  }

  function handleBridgeMessage(event) {
    const data = event.data;
    if (!data || data.source !== "alarm-reminder-apps-script") return;

    window.clearTimeout(state.pendingSubmitTimer);
    state.pendingSubmitTimer = null;
    state.pendingSubmit = false;
    setAdminFormsDisabled(false);
    showAdminMessage(data.message || data.error || "Apps Script replied.", data.ok === true);

    if (data.ok === true) {
      if (data.action === "login") {
        saveAdminSession(data.token, data.expiresAt);
        dom.loginForm.reset();
        showAdminMessage("Logged in. Admin actions are unlocked on this browser.", true);
      }
      if (data.action === "saveRecipient" || data.action === "deleteRecipient") {
        dom.recipientForm.reset();
        renderAvatarGallery("");
        toggleAvatarPicker(false);
      }
      if (data.action === "deleteEvent") {
        dom.archiveEventForm.reset();
      }
      if (data.action === "completeCycle") {
        dom.completeCycleForm.reset();
      }
      loadEvents({ silent: data.action === "login" });
      renderCalendar();
    } else if (/token|session|login/i.test(String(data.error || data.message || ""))) {
      clearAdminSession();
    }
    updateAuthUi();
  }

  function setAdminFormsDisabled(disabled) {
    dom.adminDialog.querySelectorAll("button, input, select, textarea").forEach((element) => {
      if (element.closest(".dialog-titlebar")) return;
      element.disabled = disabled;
    });
    if (!disabled) updateAuthUi();
  }

  function closeDialogOnBackdropClick(event) {
    if (event.target !== dom.adminDialog) return;

    const rect = dom.adminDialog.getBoundingClientRect();
    const clickedInside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;

    if (clickedInside) return;

    if (typeof dom.adminDialog.close === "function") {
      dom.adminDialog.close();
    } else {
      dom.adminDialog.removeAttribute("open");
    }
  }

  function openAdminDialog(view = "") {
    const requestedView = typeof view === "string" ? view : "";
    setAdminView(requestedView || (isAdminLoggedIn() ? "all" : "login"));
    if (typeof dom.adminDialog.showModal === "function") {
      dom.adminDialog.showModal();
    } else {
      dom.adminDialog.setAttribute("open", "");
    }
    refreshIcons();
  }

  function setAdminView(view) {
    const panels = {
      event: dom.eventForm,
      contact: dom.recipientForm,
      group: dom.groupForm,
      complete: dom.completeCycleForm,
      archive: dom.archiveEventForm
    };
    const mode = view || "all";
    const showAll = mode === "all";
    const hideAll = mode === "login";

    Object.entries(panels).forEach(([key, panel]) => {
      panel.classList.toggle("is-hidden", hideAll || (!showAll && key !== mode));
    });
    dom.adminGrid.classList.toggle("is-single-view", !showAll);
  }

  function startNewEvent() {
    if (!isAdminLoggedIn()) {
      openAdminDialog("login");
      showAdminMessage("Login first to add events.", false);
      return;
    }

    clearEventForm();
    openAdminDialog("event");
    showAdminMessage("New event form is ready.", true);
  }

  function startNewContact() {
    if (!isAdminLoggedIn()) {
      openAdminDialog("login");
      showAdminMessage("Login first to add contacts.", false);
      return;
    }

    dom.recipientForm.reset();
    renderAvatarGallery("");
    toggleAvatarPicker(false);
    openAdminDialog("contact");
    showAdminMessage("New contact form is ready.", true);
  }

  function startNewGroup() {
    if (!isAdminLoggedIn()) {
      openAdminDialog("login");
      showAdminMessage("Login first to add groups.", false);
      return;
    }

    dom.groupForm.reset();
    renderGroupContactPicker([]);
    openAdminDialog("group");
    showAdminMessage("New group form is ready.", true);
  }

  function showAdminMessage(message, ok) {
    if (!message) return;
    dom.adminMessage.textContent = message;
    dom.adminMessage.classList.add("is-visible");
    dom.adminMessage.classList.toggle("is-ok", ok === true);
    dom.adminMessage.classList.toggle("is-error", ok === false);
  }

  function loadContactIntoForm(contact) {
    openAdminDialog("contact");
    dom.recipientForm.id.value = contact.id || "";
    dom.recipientForm.displayName.value = contact.displayName || "";
    dom.recipientForm.email.value = contact.email || "";
    dom.recipientForm.avatarUrl.value = contact.avatarUrl || "";
    dom.recipientForm.tags.value = Array.isArray(contact.tags) ? contact.tags.join(", ") : String(contact.tags || "");
    renderAvatarGallery(contact.avatarUrl || "");
    toggleAvatarPicker(false);
    showAdminMessage(`Editing contact "${contact.displayName}".`, true);
  }

  async function deleteContactFromManager(contact) {
    const ok = window.confirm(`Permanently delete "${contact.displayName}" and remove it from events/groups? This cannot be undone.`);
    if (!ok) return;
    await deleteFirebaseContact(contact);
  }

  function loadEventIntoForm(event) {
    if (!isAdminLoggedIn()) {
      openAdminDialog("login");
      showAdminMessage("Login first to edit events.", false);
      return;
    }

    openAdminDialog("event");
    dom.eventForm.id.value = event.id;
    dom.completeCycleForm.id.value = event.id;
    dom.archiveEventForm.id.value = event.id;
    dom.eventForm.title.value = event.title;
    dom.eventForm.details.value = event.details;
    dom.eventForm.eventDate.value = event.eventDate;
    dom.eventForm.eventTime.value = event.eventTime;
    dom.eventForm.recurrence.value = event.recurrence;
    dom.eventForm.soundEnabled.checked = event.soundEnabled;
    dom.eventForm.flashEnabled.checked = event.flashEnabled;
    renderGroupPicker(event.recipientGroupIds || []);
    renderContactPicker(event.recipientIds || []);

    const presetValues = ["10", "60", "1440", "10080", "20160", "43200", "86400", "129600"];
    if (presetValues.includes(String(event.leadMinutes))) {
      dom.eventForm.leadPreset.value = String(event.leadMinutes);
    } else {
      dom.eventForm.leadPreset.value = "custom";
      dom.eventForm.leadCustom.value = event.leadMinutes;
    }
    toggleCustomLead();

    const frequencyPresetValues = ["0", "1", "7"];
    if (frequencyPresetValues.includes(String(event.reminderFrequencyDays))) {
      dom.eventForm.frequencyPreset.value = String(event.reminderFrequencyDays);
    } else {
      dom.eventForm.frequencyPreset.value = "custom";
      dom.eventForm.frequencyCustom.value = event.reminderFrequencyDays || 1;
    }
    toggleCustomFrequency();
  }

  function loadEventIntoCompleteForm(event) {
    openAdminDialog("complete");
    dom.completeCycleForm.id.value = event.id;
    dom.archiveEventForm.id.value = event.id;
    showAdminMessage(`Ready to mark "${event.title}" done for this cycle.`, true);
  }

  function loadEventIntoArchiveForm(event) {
    openAdminDialog("archive");
    dom.archiveEventForm.id.value = event.id;
    dom.completeCycleForm.id.value = event.id;
    showAdminMessage(`Ready to archive "${event.title}". Press Archive to confirm.`, true);
  }

  async function completeEventFromCard(event) {
    if (!isAdminLoggedIn()) {
      openAdminDialog();
      dom.completeCycleForm.id.value = event.id;
      showAdminMessage("Login first to mark this event done.", false);
      return;
    }

    const ok = window.confirm(`Mark "${event.title}" done for this cycle?`);
    if (!ok) return;

    if (firebaseMode) {
      await completeFirebaseCycle(event.id, "");
      return;
    }

    submitToAppsScript({
      action: "completeCycle",
      id: event.id,
      note: ""
    });
  }

  async function archiveEventFromCard(event) {
    if (!isAdminLoggedIn()) {
      openAdminDialog();
      dom.archiveEventForm.id.value = event.id;
      showAdminMessage("Login first to archive this event.", false);
      return;
    }

    const ok = window.confirm(`Archive "${event.title}"? It will stop showing and stop reminders.`);
    if (!ok) return;

    if (firebaseMode) {
      await archiveFirebaseEvent(event.id);
      return;
    }

    submitToAppsScript({
      action: "deleteEvent",
      id: event.id
    });
  }

  async function deleteEventFromCard(event) {
    if (!isAdminLoggedIn()) {
      openAdminDialog();
      dom.archiveEventForm.id.value = event.id;
      showAdminMessage("Login first to delete this event.", false);
      return;
    }

    const ok = window.confirm(`Permanently delete "${event.title}" and its reminder logs? This cannot be undone.`);
    if (!ok) return;

    if (firebaseMode) {
      await deleteFirebaseEvent(event.id);
      return;
    }

    showAdminMessage("Hard delete is only available in Firebase mode.", false);
  }

  function clearEventForm() {
    dom.eventForm.reset();
    dom.eventForm.leadPreset.value = "20160";
    dom.eventForm.frequencyPreset.value = "1";
    toggleCustomLead();
    toggleCustomFrequency();
    renderGroupPicker([]);
    renderContactPicker([]);
    setDefaultEventDateTime();
  }

  function loadAdminSession() {
    if (firebaseMode) {
      state.adminToken = "";
      state.adminExpiresAt = 0;
      localStorage.removeItem(ADMIN_SESSION_KEY);
      return;
    }

    try {
      const raw = localStorage.getItem(ADMIN_SESSION_KEY);
      if (!raw) return;
      const session = JSON.parse(raw);
      state.adminToken = String(session.token || "");
      state.adminExpiresAt = Number(session.expiresAt || 0);
      if (!isAdminLoggedIn()) clearAdminSession();
    } catch (_error) {
      clearAdminSession();
    }
  }

  function saveAdminSession(token, expiresAt) {
    const expiresMs = typeof expiresAt === "number" ? expiresAt : Date.parse(expiresAt);
    state.adminToken = String(token || "");
    state.adminExpiresAt = expiresMs || 0;
    localStorage.setItem(
      ADMIN_SESSION_KEY,
      JSON.stringify({
        token: state.adminToken,
        expiresAt: state.adminExpiresAt
      })
    );
    updateAuthUi();
  }

  function clearAdminSession() {
    state.adminToken = "";
    state.adminExpiresAt = 0;
    localStorage.removeItem(ADMIN_SESSION_KEY);
    updateAuthUi();
  }

  async function logoutAdmin() {
    if (firebaseMode) {
      if (firebaseAuth) await signOut(firebaseAuth);
      state.firebaseUser = null;
      updateAuthUi();
      setAdminView("login");
      showAdminMessage("Logged out. You are browsing as guest.", true);
      return;
    }

    clearAdminSession();
    setAdminView("login");
    showAdminMessage("Logged out. You are browsing as guest.", true);
  }

  function isAdminLoggedIn() {
    if (firebaseMode) {
      return Boolean(
        state.firebaseUser &&
          state.firebaseUser.email &&
          (adminEmails.length === 0 || adminEmails.includes(String(state.firebaseUser.email).toLowerCase()))
      );
    }

    return Boolean(state.adminToken) && Number(state.adminExpiresAt) > Date.now();
  }

  function updateAuthUi() {
    const isAdmin = isAdminLoggedIn();
    const signedInEmail = state.firebaseUser && state.firebaseUser.email ? String(state.firebaseUser.email) : "";
    dom.authStatus.textContent = isAdmin ? "Admin" : signedInEmail ? "Guest" : "Guest";
    dom.authStatus.classList.toggle("status-ok", isAdmin);
    dom.authStatus.classList.toggle("status-muted", !isAdmin);
    dom.loginForm.classList.toggle("is-admin", isAdmin);
    dom.adminButton.querySelector("span").textContent = isAdmin ? "Admin" : "Login";
    dom.addEventButton.classList.toggle("is-hidden", !isAdmin);
    dom.addContactButton.classList.toggle("is-hidden", !isAdmin);
    dom.addGroupButton.classList.toggle("is-hidden", !isAdmin);
    document.querySelectorAll(".card-actions, .calendar-detail-actions").forEach((element) => {
      element.classList.toggle("is-hidden", !isAdmin);
    });
    if (firebaseMode && dom.loginForm.email && !dom.loginForm.email.value) {
      dom.loginForm.email.value = adminEmails[0] || "";
    }

    dom.adminDialog.querySelectorAll(".admin-grid button, .admin-grid input, .admin-grid select, .admin-grid textarea").forEach((element) => {
      element.disabled = !isAdmin || state.pendingSubmit;
    });

    dom.loginForm.querySelectorAll("button, input").forEach((element) => {
      element.disabled = state.pendingSubmit;
    });
  }

  function toggleSideToolbar() {
    const open = !dom.sideToolbar.classList.contains("is-open");
    dom.sideToolbar.classList.toggle("is-open", open);
    dom.toolbarToggleButton.setAttribute("aria-expanded", String(open));
    dom.toolbarToggleButton.setAttribute("aria-label", open ? "Close tools" : "Open tools");
    const icon = dom.toolbarToggleButton.querySelector("i");
    if (icon) icon.setAttribute("data-lucide", open ? "chevron-right" : "chevron-left");
    refreshIcons();
  }

  function toggleCustomLead() {
    dom.customLeadWrap.classList.toggle("is-hidden", dom.eventForm.leadPreset.value !== "custom");
  }

  function toggleCustomFrequency() {
    dom.customFrequencyWrap.classList.toggle("is-hidden", dom.eventForm.frequencyPreset.value !== "custom");
  }

  async function copyEventId(id) {
    if (!id) return;
    try {
      await navigator.clipboard.writeText(id);
      showAdminMessage(`Copied ${id}`, true);
    } catch (_error) {
      showAdminMessage(`Event ID: ${id}`, true);
    }
  }

  function unlockAudio() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        showAdminMessage("This browser does not support Web Audio.", false);
        return;
      }
      state.audioContext = state.audioContext || new AudioContextClass();
      state.audioContext.resume();
      state.audioUnlocked = true;
      playBeep(0.08);
      dom.soundButton.classList.add("status-ok");
    } catch (error) {
      showAdminMessage(error.message, false);
    }
  }

  function startAlarmSound() {
    if (!state.audioUnlocked || !state.audioContext) return;
    if (state.alarmInterval) return;
    playBeep(0.18);
    state.alarmInterval = window.setInterval(() => playBeep(0.18), 1500);
  }

  function stopAlarmSound() {
    if (state.alarmInterval) {
      window.clearInterval(state.alarmInterval);
      state.alarmInterval = null;
    }
  }

  function playBeep(durationSeconds) {
    if (!state.audioContext) return;
    const oscillator = state.audioContext.createOscillator();
    const gain = state.audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.value = 0.001;
    oscillator.connect(gain);
    gain.connect(state.audioContext.destination);
    const now = state.audioContext.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + durationSeconds);
    oscillator.start(now);
    oscillator.stop(now + durationSeconds + 0.03);
  }

  function setStatus(label, type) {
    dom.connectionStatus.textContent = label;
    dom.connectionStatus.classList.toggle("status-ok", type === "ok");
    dom.connectionStatus.classList.toggle("status-error", type === "error");
    dom.connectionStatus.classList.toggle("status-muted", type !== "ok" && type !== "error");
  }

  function showNotice(show) {
    dom.setupNotice.classList.toggle("is-hidden", !show);
  }

  function hasDataBackend() {
    if (firebaseMode) return Boolean(firestore);
    return Boolean(config.appsScriptUrl);
  }

  function sortByNextOccurrence(a, b) {
    if (!a.nextOccurrence && !b.nextOccurrence) return a.title.localeCompare(b.title);
    if (!a.nextOccurrence) return 1;
    if (!b.nextOccurrence) return -1;
    return a.nextOccurrence.getTime() - b.nextOccurrence.getTime();
  }

  function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function localDateKey(date) {
    const parts = getZoneParts(date);
    return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
  }

  function monthKey(date) {
    const parts = getZoneParts(date);
    return `${parts.year}-${pad(parts.month)}`;
  }

  function parseLocalDateKey(dateKey) {
    const [year, month, day] = String(dateKey).split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function formatReminderSchedule(minutes, frequencyDays) {
    const lead = formatLeadTime(minutes);
    if (frequencyDays === 0) return `Once, ${lead}`;
    if (frequencyDays === 1) return `Starts ${lead}, every day`;
    if (frequencyDays === 7) return `Starts ${lead}, every week`;
    return `Starts ${lead}, every ${frequencyDays} days`;
  }

  function formatLeadTime(minutes) {
    if (minutes === 0) return "At event time";
    if (minutes % 10080 === 0) return `${minutes / 10080} week${minutes === 10080 ? "" : "s"} before`;
    if (minutes % 1440 === 0) return `${minutes / 1440} day${minutes === 1440 ? "" : "s"} before`;
    if (minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? "" : "s"} before`;
    return `${minutes} minutes before`;
  }

  function initialsForName(name) {
    const words = String(name || "")
      .replace(/@.*$/, "")
      .split(/[\s._-]+/)
      .filter(Boolean);
    const initials = words.slice(0, 2).map((word) => word[0]).join("");
    return initials || "?";
  }

  function formatFullDateTime(date) {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: config.timezone,
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  }

  function formatShortDateTime(date) {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: config.timezone,
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function getZoneParts(date) {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: config.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    });

    const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
    return {
      year: Number(parts.year),
      month: Number(parts.month),
      day: Number(parts.day),
      hour: Number(parts.hour),
      minute: Number(parts.minute)
    };
  }

  function occurrenceKey(date) {
    const parts = getZoneParts(date);
    return `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}`;
  }

  function daysInMonth(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  function clampInteger(value, min, max, fallback) {
    const number = Number.parseInt(value, 10);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
  }

  function toBoolean(value, fallback) {
    if (value === true || value === "true" || value === "TRUE" || value === 1 || value === "1") return true;
    if (value === false || value === "false" || value === "FALSE" || value === 0 || value === "0") return false;
    return fallback;
  }

  function currentAdminEmail() {
    return state.firebaseUser && state.firebaseUser.email ? String(state.firebaseUser.email).toLowerCase() : "";
  }

  function makeDocumentId(value, prefix) {
    const raw = String(value || "").trim();
    const fallback = `${prefix}_${randomId()}`;
    const base = raw || fallback;
    const cleaned = base
      .replace(/[^A-Za-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 120);
    if (!cleaned || cleaned === "." || cleaned === ".." || /^__.*__$/.test(cleaned)) return fallback;
    return cleaned;
  }

  function contactDocumentId(email) {
    return makeDocumentId(`rec_${String(email || "").toLowerCase()}`, "rec");
  }

  function randomId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID().replace(/-/g, "");
    }
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  }

  function requireDateString(value) {
    const text = String(value || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error("Date must be YYYY-MM-DD.");
    const [year, month, day] = text.split("-").map(Number);
    if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
      throw new Error("Invalid date.");
    }
    return text;
  }

  function requireTimeString(value) {
    const text = String(value || "").trim();
    if (!/^\d{2}:\d{2}$/.test(text)) throw new Error("Time must be HH:mm.");
    const [hour, minute] = text.split(":").map(Number);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      throw new Error("Invalid time.");
    }
    return text;
  }

  function parseTags(value) {
    const raw = Array.isArray(value) ? value.join(",") : String(value || "");
    return raw
      .split(",")
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);
  }

  function normalizeRecipientIds(value) {
    const raw = Array.isArray(value) ? value : String(value || "").split(",");
    return Array.from(
      new Set(
        raw
          .map((id) => String(id || "").trim())
          .filter(Boolean)
      )
    );
  }

  function timestampToIso(value) {
    if (!value) return "";
    if (value instanceof Date) return value.toISOString();
    if (typeof value.toDate === "function") return value.toDate().toISOString();
    if (typeof value.seconds === "number") return new Date(value.seconds * 1000).toISOString();
    return String(value);
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
  }

  function sanitizeAvatarPath(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    if (text.includes("..") || text.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(text)) return "";
    if (/^images\/[A-Za-z0-9._%/() -]+\.(jpe?g|png|webp|gif)$/i.test(text)) return text.slice(0, 1000);
    if (/^[A-Za-z0-9._%/() -]+\.(jpe?g|png|webp|gif)$/i.test(text)) return text.slice(0, 1000);
    return "";
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }
  }
})();
