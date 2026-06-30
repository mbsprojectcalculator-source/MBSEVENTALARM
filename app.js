(() => {
  "use strict";

  const config = Object.assign(
    {
      appsScriptUrl: "",
      timezone: "Asia/Singapore",
      timeZoneOffset: "+08:00",
      refreshMs: 60000,
      alarmWindowMinutes: 60
    },
    window.ALARM_REMINDER_CONFIG || {}
  );

  const ADMIN_SESSION_KEY = "alarmReminderAdminSession";

  const state = {
    events: [],
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
    loadTimer: null,
    adminToken: "",
    adminExpiresAt: 0
  };

  const dom = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    mapDom();
    loadAdminSession();
    bindEvents();
    setDefaultEventDateTime();
    updateAuthUi();
    renderSystemStatus();
    renderCalendar();
    refreshIcons();
    tickClock();
    setInterval(tickClock, 1000);
    setInterval(checkAlarms, 5000);

    if (config.appsScriptUrl) {
      loadEvents();
      state.loadTimer = setInterval(loadEvents, Number(config.refreshMs) || 60000);
    } else {
      renderEvents();
      setStatus("Not connected", "muted");
    }
  }

  function mapDom() {
    dom.connectionStatus = document.getElementById("connectionStatus");
    dom.authStatus = document.getElementById("authStatus");
    dom.sideToolbar = document.getElementById("sideToolbar");
    dom.toolbarToggleButton = document.getElementById("toolbarToggleButton");
    dom.clockLabel = document.getElementById("clockLabel");
    dom.refreshButton = document.getElementById("refreshButton");
    dom.addEventButton = document.getElementById("addEventButton");
    dom.adminButton = document.getElementById("adminButton");
    dom.soundButton = document.getElementById("soundButton");
    dom.adminDialog = document.getElementById("adminDialog");
    dom.adminMessage = document.getElementById("adminMessage");
    dom.loginForm = document.getElementById("loginForm");
    dom.logoutButton = document.getElementById("logoutButton");
    dom.eventForm = document.getElementById("eventForm");
    dom.recipientForm = document.getElementById("recipientForm");
    dom.completeCycleForm = document.getElementById("completeCycleForm");
    dom.archiveEventForm = document.getElementById("archiveEventForm");
    dom.clearEventFormButton = document.getElementById("clearEventFormButton");
    dom.disableRecipientButton = document.getElementById("disableRecipientButton");
    dom.bridgeForm = document.getElementById("bridgeForm");
    dom.bridgePayload = document.getElementById("bridgePayload");
    dom.customLeadWrap = document.getElementById("customLeadWrap");
    dom.customFrequencyWrap = document.getElementById("customFrequencyWrap");
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
    dom.adminButton.addEventListener("click", openAdminDialog);
    dom.addEventButton.addEventListener("click", startNewEvent);
    dom.calendarPrevButton.addEventListener("click", () => shiftCalendarMonth(-1));
    dom.calendarNextButton.addEventListener("click", () => shiftCalendarMonth(1));
    dom.calendarTodayButton.addEventListener("click", showCurrentCalendarMonth);
    dom.loginForm.addEventListener("submit", submitLoginForm);
    dom.logoutButton.addEventListener("click", logoutAdmin);
    dom.soundButton.addEventListener("click", unlockAudio);
    dom.dismissAlarmButton.addEventListener("click", dismissActiveAlarms);
    dom.eventForm.addEventListener("submit", submitEventForm);
    dom.recipientForm.addEventListener("submit", submitRecipientForm);
    dom.completeCycleForm.addEventListener("submit", submitCompleteCycleForm);
    dom.archiveEventForm.addEventListener("submit", submitArchiveForm);
    dom.clearEventFormButton.addEventListener("click", clearEventForm);
    dom.disableRecipientButton.addEventListener("click", submitDisableRecipient);
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
      showAdminMessage(error.message, false);
      state.systemStatus = Object.assign(normalizeSystemStatus(null), {
        status: "error",
        detail: error.message,
        lastError: error.message
      });
      renderSystemStatus();
      renderCalendar();
      renderEvents();
    }
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
      }, 20000);

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
      avatarUrl: String(recipient.avatarUrl || "").trim()
    };
  }

  function normalizeSystemStatus(status) {
    const safe = status || {};
    return {
      status: String(safe.status || "setup"),
      checkedAt: String(safe.checkedAt || ""),
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
    if (!config.appsScriptUrl) return "Set appsScriptUrl in config.js to enable backend status.";
    if (status.detail) return status.detail;
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
      meta.textContent = `${formatFullDateTime(event.nextOccurrence)} · ${formatReminderSchedule(event.leadMinutes, event.reminderFrequencyDays)}`;
      copy.appendChild(name);
      copy.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "calendar-detail-actions";

      const done = document.createElement("button");
      done.className = "primary-button";
      done.type = "button";
      done.innerHTML = '<i data-lucide="circle-check"></i><span>Done</span>';
      done.addEventListener("click", () => completeEventFromCard(event));

      const load = document.createElement("button");
      load.className = "ghost-button";
      load.type = "button";
      load.innerHTML = '<i data-lucide="pen-line"></i><span>Load</span>';
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
    dom.emptyState.classList.toggle("is-hidden", publicEvents.length > 0 || !config.appsScriptUrl);
    showNotice(!config.appsScriptUrl);

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
      card.querySelector(".copy-id-button").addEventListener("click", () => copyEventId(event.id));
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

  function submitEventForm(event) {
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
        recipientTags: form.recipientTags.value.trim(),
        soundEnabled: form.soundEnabled.checked,
        flashEnabled: form.flashEnabled.checked,
        active: true
      }
    };

    submitToAppsScript(payload);
  }

  function submitRecipientForm(event) {
    event.preventDefault();
    const form = dom.recipientForm;
    submitToAppsScript({
      action: "saveRecipient",
      recipient: {
        displayName: form.displayName.value.trim(),
        email: form.email.value.trim(),
        avatarUrl: form.avatarUrl.value.trim(),
        tags: form.tags.value.trim(),
        active: true
      }
    });
  }

  function submitDisableRecipient() {
    const form = dom.recipientForm;
    if (!form.reportValidity()) return;

    submitToAppsScript({
      action: "deleteRecipient",
      email: form.email.value.trim()
    });
  }

  function submitLoginForm(event) {
    event.preventDefault();
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

  function submitCompleteCycleForm(event) {
    event.preventDefault();
    const form = dom.completeCycleForm;
    submitToAppsScript({
      action: "completeCycle",
      id: form.id.value.trim(),
      note: form.note.value.trim()
    });
  }

  function submitArchiveForm(event) {
    event.preventDefault();
    const form = dom.archiveEventForm;
    submitToAppsScript({
      action: "deleteEvent",
      id: form.id.value.trim()
    });
  }

  function submitToAppsScript(payload, options = {}) {
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
  }

  function handleBridgeMessage(event) {
    const data = event.data;
    if (!data || data.source !== "alarm-reminder-apps-script") return;

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
      }
      if (data.action === "deleteEvent") {
        dom.archiveEventForm.reset();
      }
      if (data.action === "completeCycle") {
        dom.completeCycleForm.reset();
      }
      loadEvents();
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

  function openAdminDialog() {
    if (typeof dom.adminDialog.showModal === "function") {
      dom.adminDialog.showModal();
    } else {
      dom.adminDialog.setAttribute("open", "");
    }
    refreshIcons();
  }

  function startNewEvent() {
    if (!isAdminLoggedIn()) {
      openAdminDialog();
      showAdminMessage("Login first to add events.", false);
      return;
    }

    clearEventForm();
    openAdminDialog();
    showAdminMessage("New event form is ready.", true);
  }

  function showAdminMessage(message, ok) {
    if (!message) return;
    dom.adminMessage.textContent = message;
    dom.adminMessage.classList.add("is-visible");
    dom.adminMessage.classList.toggle("is-ok", ok === true);
    dom.adminMessage.classList.toggle("is-error", ok === false);
  }

  function loadEventIntoForm(event) {
    if (!isAdminLoggedIn()) {
      openAdminDialog();
      showAdminMessage("Login first to edit events.", false);
      return;
    }

    openAdminDialog();
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
    openAdminDialog();
    dom.completeCycleForm.id.value = event.id;
    dom.archiveEventForm.id.value = event.id;
    showAdminMessage(`Ready to mark "${event.title}" done for this cycle.`, true);
  }

  function loadEventIntoArchiveForm(event) {
    openAdminDialog();
    dom.archiveEventForm.id.value = event.id;
    dom.completeCycleForm.id.value = event.id;
    showAdminMessage(`Ready to archive "${event.title}". Press Archive to confirm.`, true);
  }

  function completeEventFromCard(event) {
    if (!isAdminLoggedIn()) {
      openAdminDialog();
      dom.completeCycleForm.id.value = event.id;
      showAdminMessage("Login first to mark this event done.", false);
      return;
    }

    submitToAppsScript({
      action: "completeCycle",
      id: event.id,
      note: ""
    });
  }

  function archiveEventFromCard(event) {
    if (!isAdminLoggedIn()) {
      openAdminDialog();
      dom.archiveEventForm.id.value = event.id;
      showAdminMessage("Login first to archive this event.", false);
      return;
    }

    const ok = window.confirm(`Archive "${event.title}"? It will stop showing and stop reminders.`);
    if (!ok) return;

    submitToAppsScript({
      action: "deleteEvent",
      id: event.id
    });
  }

  function clearEventForm() {
    dom.eventForm.reset();
    dom.eventForm.leadPreset.value = "20160";
    dom.eventForm.frequencyPreset.value = "1";
    toggleCustomLead();
    toggleCustomFrequency();
    setDefaultEventDateTime();
  }

  function loadAdminSession() {
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

  function logoutAdmin() {
    clearAdminSession();
    showAdminMessage("Logged out. You are browsing as guest.", true);
  }

  function isAdminLoggedIn() {
    return Boolean(state.adminToken) && Number(state.adminExpiresAt) > Date.now();
  }

  function updateAuthUi() {
    const isAdmin = isAdminLoggedIn();
    dom.authStatus.textContent = isAdmin ? "Admin" : "Guest";
    dom.authStatus.classList.toggle("status-ok", isAdmin);
    dom.authStatus.classList.toggle("status-muted", !isAdmin);
    dom.loginForm.classList.toggle("is-admin", isAdmin);
    dom.adminButton.querySelector("span").textContent = isAdmin ? "Admin" : "Login";

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

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }
  }
})();
