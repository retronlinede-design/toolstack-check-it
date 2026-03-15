import React, { useEffect, useMemo, useRef, useState } from "react";
import checkitLogo from "./assets/checkit-logo.png";

/**
 * ToolStack — Check-It (Styled v1: grey + lime/green accent)
 * - Sections + items
 * - Delete section (in-app confirm modal)
 * - Reorder items via drag & drop (within a section)
 * - Due date per item + overdue flag
 * - Print Preview (prints only the preview sheet)
 * - Export/Import JSON
 * - Autosave to localStorage
 *
 * Added:
 * - Search box (filters items across all sections)
 * - Filter pills: All / Today / Overdue
 * - Email (mailto:) summary (no PDF attachment)
 * - Help “?” icon pinned far-right (Help Pack v1 modal)
 * - Per-section collapse/expand (persisted)
 * - EN/DE UI toggle (default EN, persisted)
 */

const LS_KEY = "toolstack_checkit_v2";
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const safeParse = (s, fallback) => {
  try {
    const v = JSON.parse(s);
    return v ?? fallback;
  } catch {
    return fallback;
  }
};

const todayISO = () => new Date().toISOString().slice(0, 10);

function arrayMove(arr, from, to) {
  const a = [...arr];
  const start = Math.max(0, Math.min(a.length - 1, from));
  const end = Math.max(0, Math.min(a.length - 1, to));
  if (start === end) return a;
  const [item] = a.splice(start, 1);
  a.splice(end, 0, item);
  return a;
}

const sanitizeCollapsedById = (m) => {
  if (!m || typeof m !== "object" || Array.isArray(m)) return {};
  const out = {};
  for (const k of Object.keys(m)) out[k] = !!m[k];
  return out;
};

const btnSecondary =
  "print:hidden px-3 py-2 rounded-2xl text-sm font-medium border transition active:translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed bg-white hover:bg-[#D5FF00]/30 hover:border-[#D5FF00]/30 hover:text-neutral-800 text-neutral-700 border-neutral-200 shadow-sm";
const btnPrimary =
  "print:hidden px-3 py-2 rounded-2xl text-sm font-medium border transition active:translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed bg-[#D5FF00]/30 border-[#D5FF00]/30 text-neutral-800 shadow-sm hover:bg-white hover:border-neutral-200";
const btnDanger =
  "print:hidden px-3 py-2 rounded-2xl text-sm font-medium border transition active:translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed bg-red-50 hover:bg-red-100 text-red-700 border-red-200 shadow-sm";
const inputBase =
  "mt-2 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-lime-400/25 focus:border-neutral-300";
const card = "rounded-2xl bg-white border border-neutral-200 shadow-lg";
const cardHead = "px-4 py-3 border-b border-neutral-200";
const cardPad = "p-4";

function SmallButton({ children, onClick, tone = "default", disabled, title, className = "" }) {
  const cls = tone === "primary" ? btnPrimary : tone === "danger" ? btnDanger : btnSecondary;
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} className={`${cls} ${className}`}>
      {children}
    </button>
  );
}

/** Normalized Top Actions (mobile-aligned “table/grid”) */
const ACTION_BASE = 
  "print:hidden h-9 px-6 rounded-xl text-xs font-medium border transition shadow-sm active:translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center";

function ActionButton({ children, onClick, tone = "default", disabled, title, className = "" }) {
  const cls =
    tone === "primary"
      ? "bg-[#D5FF00]/30 border-[#D5FF00]/30 text-neutral-800 hover:bg-white hover:border-neutral-200"
      : tone === "danger"
        ? "bg-red-50 hover:bg-red-100 text-red-700 border-red-200"
        : "bg-white hover:bg-[#D5FF00]/30 hover:border-[#D5FF00]/30 hover:text-neutral-800 text-neutral-700 border-neutral-200";

  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} className={`${ACTION_BASE} ${cls} ${className}`}>
      {children}
    </button>
  );
}

function ActionFileButton({ children, onFile, accept = "application/json", tone = "primary", title, className = "" }) {
  const cls =
    tone === "primary"
      ? "bg-[#D5FF00]/30 border-[#D5FF00]/30 text-neutral-800 hover:bg-white hover:border-neutral-200"
      : "bg-white hover:bg-[#D5FF00]/30 hover:border-[#D5FF00]/30 hover:text-neutral-800 text-neutral-700 border-neutral-200";

  return (
    <label title={title} className={`${ACTION_BASE} ${cls} cursor-pointer ${className}`}>
      <span>{children}</span>
      <input
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onFile?.(e.target.files?.[0] || null)}
      />
    </label>
  );
}

function Checkbox({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`h-5 w-5 rounded-md border flex items-center justify-center transition ${
        checked ? "bg-neutral-800 border-neutral-800" : "bg-white border-neutral-300 hover:bg-neutral-50"
      }`}
      aria-label={checked ? "Uncheck" : "Check"}
    >
      {checked ? (
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M16.25 5.75L8.5 13.5L3.75 8.75"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </button>
  );
}

function DateField({ value, onChange, disabled, lang = "en" }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(() => ({ top: 0, left: 0, width: 320 }));
  const panelRef = useRef(null);
  const btnRef = useRef(null);

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  const pad2 = (n) => String(n).padStart(2, "0");
  const toISO = (y, m0, d) => `${y}-${pad2(m0 + 1)}-${pad2(d)}`;

  const parseISO = (iso) => {
    if (!iso || typeof iso !== "string") return null;
    const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(iso);
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
    return { y, m: mo, d };
  };

  const todayParts = () => {
    const t = todayISO();
    return parseISO(t) || { y: new Date().getFullYear(), m: new Date().getMonth(), d: new Date().getDate() };
  };

  const selected = parseISO(value);
  const initial = selected || todayParts();

  const [view, setView] = useState(() => ({ y: initial.y, m: initial.m }));

  // keep month in sync when a value is externally changed
  useEffect(() => {
    const sel = parseISO(value);
    if (sel) setView({ y: sel.y, m: sel.m });
  }, [value]);

  const locale = lang === "de" ? "de-DE" : "en-US";

  const monthLabel = useMemo(() => {
    const d = new Date(view.y, view.m, 1);
    try {
      return d.toLocaleString(locale, { month: "long" });
    } catch {
      return d.toDateString().split(" ")[1];
    }
  }, [view.y, view.m, locale]);

  const daysInMonth = (y, m0) => new Date(y, m0 + 1, 0).getDate();
  const firstDowMon0 = (y, m0) => {
    // JS: 0=Sun..6=Sat => convert to Mon=0..Sun=6
    const dow = new Date(y, m0, 1).getDay();
    return (dow + 6) % 7;
  };

  const grid = useMemo(() => {
    const total = daysInMonth(view.y, view.m);
    const lead = firstDowMon0(view.y, view.m);
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= total; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    while (cells.length < 42) cells.push(null);
    return cells.slice(0, 42);
  }, [view.y, view.m]);

  const computePos = () => {
    const btn = btnRef.current;
    if (!btn) return;

    const r = btn.getBoundingClientRect();
    const gap = 8;
    const vw = window.innerWidth || 0;
    const vh = window.innerHeight || 0;

    const width = Math.min(320, Math.max(240, vw - gap * 2));
    const left = clamp(r.left, gap, Math.max(gap, vw - width - gap));

    // Prefer below, flip above if needed
    let top = r.bottom + gap;
    const panel = panelRef.current;
    const h = panel ? panel.getBoundingClientRect().height : 360;

    if (top + h > vh - gap) {
      const above = r.top - gap - h;
      if (above >= gap) top = above;
      else top = Math.max(gap, vh - gap - h);
    }

    setPos({ top, left, width });
  };

  useEffect(() => {
    if (!open) return;

    const tick = () => computePos();
    const onResize = () => tick();
    const onScroll = () => tick();

    const raf = requestAnimationFrame(() => {
      computePos();
      requestAnimationFrame(computePos);
    });

    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  const close = () => setOpen(false);

  const openPicker = () => {
    if (disabled) return;
    setOpen(true);

    const sel = parseISO(value);
    if (sel) setView({ y: sel.y, m: sel.m });

    requestAnimationFrame(() => {
      computePos();
      requestAnimationFrame(computePos);
    });
  };

  const shiftMonth = (delta) => {
    let y = view.y;
    let m = view.m + delta;
    while (m < 0) {
      m += 12;
      y -= 1;
    }
    while (m > 11) {
      m -= 12;
      y += 1;
    }
    setView({ y, m });
  };

  const pickDay = (d) => {
    const iso = toISO(view.y, view.m, d);
    onChange?.(iso);
    close();
  };

  const clear = () => {
    onChange?.("");
    close();
  };

  const pickToday = () => {
    const t = todayParts();
    setView({ y: t.y, m: t.m });
    onChange?.(toISO(t.y, t.m, t.d));
    close();
  };

  // Close on outside click + Esc
  useEffect(() => {
    if (!open) return;

    const onDown = (e) => {
      if (!panelRef.current) return;
      const panel = panelRef.current;
      const btn = btnRef.current;
      const target = e.target;
      if (panel.contains(target)) return;
      if (btn && btn.contains(target)) return;
      close();
    };

    const onKey = (e) => {
      if (e.key === "Escape") close();
    };

    window.addEventListener("mousedown", onDown);
    window.addEventListener("touchstart", onDown, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("touchstart", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const display = value || "";
  const weekdays = lang === "de" ? ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? close() : openPicker())}
        disabled={disabled}
        className={`w-full rounded-xl border bg-white px-3 py-2 pr-12 text-sm text-left focus:outline-none focus:ring-2 focus:ring-lime-400/25 focus:border-neutral-300 transition ${
          disabled
            ? "border-neutral-200 text-neutral-400 cursor-not-allowed"
            : "border-neutral-200 text-neutral-800 hover:bg-neutral-50"
        }`}
        aria-haspopup="dialog"
        aria-expanded={open ? "true" : "false"}
      >
        {display ? (
          <span className="tabular-nums">{display}</span>
        ) : (
          <span className="text-neutral-500">{lang === "de" ? "Kein Datum" : "No due date"}</span>
        )}
      </button>

      <button
        type="button"
        className="print:hidden absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 shadow-sm flex items-center justify-center"
        onClick={() => (open ? close() : openPicker())}
        title={lang === "de" ? "Datum wählen" : "Pick date"}
        aria-label={lang === "de" ? "Datum wählen" : "Pick date"}
        disabled={disabled}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M8 3V5M16 3V5M4 9H20M6 5H18C19.1046 5 20 5.89543 20 7V19C20 20.1046 19.1046 21 18 21H6C4.89543 21 4 20.1046 4 19V7C4 5.89543 4.89543 5 6 5Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open ? (
        <div
          ref={panelRef}
          role="dialog" 
          aria-label={lang === "de" ? "Fälligkeitsdatum wählen" : "Choose due date"}
          style={{ top: pos.top, left: pos.left, width: pos.width }}
          className="print:hidden fixed z-50 rounded-2xl border border-neutral-200 bg-white shadow-2xl overflow-hidden max-h-[80vh]"
        >
          <div className="px-3 py-2 border-b border-neutral-100 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                className="h-9 w-9 rounded-xl border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 flex items-center justify-center"
                aria-label={lang === "de" ? "Vorheriger Monat" : "Previous month"}
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                className="h-9 w-9 rounded-xl border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 flex items-center justify-center"
                aria-label={lang === "de" ? "Nächster Monat" : "Next month"}
              >
                →
              </button>
            </div>

            <div className="text-sm font-semibold text-neutral-800">
              {monthLabel} {view.y}
            </div>

            <button
              type="button"
              onClick={close}
              className="h-9 w-9 rounded-xl border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 flex items-center justify-center"
              aria-label={lang === "de" ? "Schließen" : "Close"}
            >
              X
            </button>
          </div>

          <div className="p-3">
            <div className="grid grid-cols-7 gap-1 text-[11px] font-medium text-neutral-500">
              {weekdays.map((d) => (
                <div key={d} className="text-center py-1">
                  {d}
                </div>
              ))}
            </div>

            <div className="mt-1 grid grid-cols-7 gap-1">
              {grid.map((d, idx) => {
                if (!d) return <div key={idx} className="h-9" />;

                const iso = toISO(view.y, view.m, d);
                const isSel = value === iso;
                const t = todayISO();
                const isToday = iso === t;

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => pickDay(d)}
                    className={`h-9 rounded-xl text-sm flex items-center justify-center border transition ${
                      isSel
                        ? "bg-neutral-800 text-white border-neutral-800"
                        : "bg-white text-neutral-800 border-neutral-200 hover:bg-neutral-50"
                    } ${isToday && !isSel ? "ring-2 ring-lime-400/25" : ""}`}
                    aria-label={(lang === "de" ? "Wähle " : "Select ") + iso}
                  >
                    {d}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={clear}
                className="px-3 py-2 rounded-xl text-sm font-medium border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-800 transition"
              >
                {lang === "de" ? "Löschen" : "Clear"}
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={pickToday}
                  className="px-3 py-2 rounded-xl text-sm font-medium border border-lime-200 bg-lime-50 hover:bg-lime-100 text-neutral-800 transition"
                >
                  {lang === "de" ? "Heute" : "Today"}
                </button>
                <button
                  type="button"
                  onClick={close}
                  className="px-3 py-2 rounded-xl text-sm font-medium border border-neutral-700 bg-neutral-700 text-white hover:bg-neutral-600 transition"
                >
                  {lang === "de" ? "Fertig" : "Done"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const HELP_TEXT = {
  en: {
    aboutTitle: "1) About Check-It",
    aboutText: "Check-It is a local-first checklist tool designed to help you organise tasks into sections, track progress, and print clean checklists. It’s built for fast daily use with no accounts, no cloud storage, and no automatic data sharing.",
    howTitle: "2) How Check-It Works",
    howIntro: "Check-It follows a simple workflow:",
    howSteps: [
      { b: "Create Sections", t: "Add sections for categories (e.g., Home, Work, Vehicle, Admin)." },
      { b: "Add Checklist Items", t: "Add items under each section. Use due dates if needed." },
      { b: "Reorder and Maintain", t: "Reorder items to match your workflow and update items as you complete them." },
      { b: "Preview & Print", t: "Use Preview to generate a print-ready checklist sheet." },
      { b: "Export a Backup", t: "Export a JSON backup regularly, especially after major updates." },
    ],
    privacyTitle: "3) Your Data & Privacy",
    privacyText: "Your data is saved locally in this browser using secure local storage.",
    privacyMeaning: "This means:",
    privacyList: [
      "Your data stays on this device",
      "Clearing browser data can remove your lists",
      "Incognito/private mode will not retain data",
      "Data does not automatically sync across devices"
    ],
    backupTitle: "4) Backup & Restore",
    backupText1: "Export downloads a JSON backup of your current Check-It data.",
    backupText2: "Import restores a previously exported JSON file and replaces current app data.",
    backupRec: "Recommended routine:",
    backupList: [
      "Export weekly",
      "Export after major edits",
      "Store backups in two locations (e.g., Downloads + Drive/USB)"
    ],
    buttonsTitle: "5) Buttons Explained",
    buttonsList: [
      { b: "Preview", t: "Opens the print-ready view." },
      { b: "Print / Save PDF", t: "Prints only the preview sheet. Choose “Save as PDF” to create a file." },
      { b: "Export", t: "Downloads a JSON backup file." },
      { b: "Import", t: "Restores data from a JSON backup file." }
    ],
    storageTitle: "6) Storage Keys (Advanced)",
    storageKeys: [
      "App data key: toolstack.checkit.v1",
      "Shared profile key: toolstack.profile.v1",
    ],
    storageCurrent: "Current App Key",
    notesTitle: "7) Notes / Limitations",
    notesText1: "Check-It is a productivity tool. Data accuracy depends on what you enter.",
    notesText2: "Use Export regularly to avoid data loss.",
    supportTitle: "8) Support / Feedback",
    supportText: "If something breaks, include: device + browser + steps to reproduce + what you expected vs what happened."
  },
  de: {
    aboutTitle: "1) Über Check-It",
    aboutText: "Check-It ist ein lokales Checklisten-Tool, mit dem du Aufgaben in Abschnitte organisieren, Fortschritte verfolgen und saubere Checklisten drucken kannst. Es ist für den schnellen täglichen Gebrauch konzipiert – ohne Konten, ohne Cloud-Speicher und ohne automatische Datenweitergabe.",
    howTitle: "2) Wie Check-It funktioniert",
    howIntro: "Check-It folgt einem einfachen Arbeitsablauf:",
    howSteps: [
      { b: "Abschnitte erstellen", t: "Füge Abschnitte für Kategorien hinzu (z. B. Zuhause, Arbeit, Fahrzeug, Admin)." },
      { b: "Einträge hinzufügen", t: "Füge Einträge unter jedem Abschnitt hinzu. Nutze Fälligkeitsdaten bei Bedarf." },
      { b: "Sortieren und Pflegen", t: "Sortiere Einträge passend zu deinem Ablauf und aktualisiere sie, wenn sie erledigt sind." },
      { b: "Vorschau & Drucken", t: "Nutze die Vorschau, um eine druckfertige Checkliste zu erstellen." },
      { b: "Backup exportieren", t: "Exportiere regelmäßig ein JSON-Backup, besonders nach größeren Änderungen." },
    ],
    privacyTitle: "3) Deine Daten & Privatsphäre",
    privacyText: "Deine Daten werden lokal in diesem Browser im sicheren lokalen Speicher gespeichert.",
    privacyMeaning: "Das bedeutet:",
    privacyList: [
      "Deine Daten bleiben auf diesem Gerät",
      "Das Löschen von Browserdaten kann deine Listen entfernen",
      "Inkognito/Privat-Modus speichert keine Daten dauerhaft",
      "Daten werden nicht automatisch über Geräte hinweg synchronisiert"
    ],
    backupTitle: "4) Backup & Wiederherstellung",
    backupText1: "Export lädt ein JSON-Backup deiner aktuellen Check-It-Daten herunter.",
    backupText2: "Import stellt eine zuvor exportierte JSON-Datei wieder her und ersetzt die aktuellen App-Daten.",
    backupRec: "Empfohlene Routine:",
    backupList: [
      "Wöchentlich exportieren",
      "Nach größeren Bearbeitungen exportieren",
      "Backups an zwei Orten speichern (z. B. Downloads + Drive/USB)"
    ],
    buttonsTitle: "5) Erklärte Schaltflächen",
    buttonsList: [
      { b: "Vorschau", t: "Öffnet die druckfertige Ansicht." },
      { b: "Drucken / PDF speichern", t: "Druckt nur das Vorschaublatt. Wähle „Als PDF speichern“, um eine Datei zu erstellen." },
      { b: "Export", t: "Lädt eine JSON-Backup-Datei herunter." },
      { b: "Import", t: "Stellt Daten aus einer JSON-Backup-Datei wieder her." }
    ],
    storageTitle: "6) Speicherschlüssel (Erweitert)",
    storageKeys: [
      "App-Daten-Schlüssel: toolstack.checkit.v1",
      "Geteilter Profil-Schlüssel: toolstack.profile.v1",
    ],
    storageCurrent: "Aktueller App-Schlüssel",
    notesTitle: "7) Hinweise / Einschränkungen",
    notesText1: "Check-It ist ein Produktivitäts-Tool. Die Datengenauigkeit hängt von deinen Eingaben ab.",
    notesText2: "Nutze Export regelmäßig, um Datenverlust zu vermeiden.",
    supportTitle: "8) Support / Feedback",
    supportText: "Wenn etwas nicht funktioniert, gib bitte an: Gerät + Browser + Schritte zum Reproduzieren + was du erwartet hast vs. was passiert ist."
  }
};

function HelpModal({ open, onClose, t, lang = "en" }) {
  if (!open) return null;
  const ht = HELP_TEXT[lang] || HELP_TEXT.en;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
      <div className="absolute inset-0 bg-neutral-900/50 backdrop-blur-sm transition-opacity" onClick={onClose} />
      
      <div className="relative w-full max-w-lg transform transition-all">
        <div className="relative bg-white border border-neutral-200 rounded-[2rem] shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="relative p-6 pb-4 flex items-center justify-between border-b-2 border-neutral-100">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black italic tracking-tighter text-neutral-900">
              {t.help}
            </h2>
            <button
              type="button"
              className="h-10 w-10 rounded-xl bg-neutral-100 hover:bg-[#D5FF00] border-2 border-transparent hover:border-neutral-900 text-neutral-900 font-bold flex items-center justify-center transition-all"
              onClick={onClose}
            >
              ✕
            </button>
          </div>

          {/* Content */}
          <div className="p-8 space-y-6 overflow-y-auto max-h-[60vh]">
            <section>
              <h3 className="font-bold text-neutral-900">{ht.aboutTitle}</h3>
              <p className="text-neutral-700 mt-1">{ht.aboutText}</p>
            </section>

            <section>
              <h3 className="font-bold text-neutral-900">{ht.howTitle}</h3>
              <p className="text-neutral-700 mt-1">{ht.howIntro}</p>
              <ol className="list-decimal list-inside text-neutral-700 mt-2 space-y-1 ml-1">
                {ht.howSteps.map((step, i) => (
                  <li key={i}><strong>{step.b}</strong><br /><span className="ml-4">{step.t}</span></li>
                ))}
              </ol>
            </section>

            <section>
              <h3 className="font-bold text-neutral-900">{ht.privacyTitle}</h3>
              <p className="text-neutral-700 mt-1">{ht.privacyText}</p>
              <p className="text-neutral-700 mt-1">{ht.privacyMeaning}</p>
              <ul className="list-disc list-inside text-neutral-700 mt-1 ml-1">
                {ht.privacyList.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </section>

            <section>
              <h3 className="font-bold text-neutral-900">{ht.backupTitle}</h3>
              <p className="text-neutral-700 mt-1">
                {ht.backupText1}<br />
                {ht.backupText2}
              </p>
              <p className="text-neutral-700 mt-2">{ht.backupRec}</p>
              <ul className="list-disc list-inside text-neutral-700 mt-1 ml-1">
                {ht.backupList.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </section>

            <section>
              <h3 className="font-bold text-neutral-900">{ht.buttonsTitle}</h3>
              <ul className="text-neutral-700 mt-1 space-y-1">
                {ht.buttonsList.map((btn, i) => (
                  <li key={i}><strong>{btn.b}</strong> – {btn.t}</li>
                ))}
              </ul>
            </section>

            <section>
              <h3 className="font-bold text-neutral-900">{ht.storageTitle}</h3>
              <ul className="text-neutral-700 mt-1 space-y-1 font-mono text-sm">
                {ht.storageKeys.map((k, i) => <li key={i}>{k}</li>)}
                <li>{ht.storageCurrent}: {LS_KEY}</li>
              </ul>
            </section>

            <section>
              <h3 className="font-bold text-neutral-900">{ht.notesTitle}</h3>
              <p className="text-neutral-700 mt-1">
                {ht.notesText1}<br />
                {ht.notesText2}
              </p>
            </section>

            <section>
              <h3 className="font-bold text-neutral-900">{ht.supportTitle}</h3>
              <p className="text-neutral-700 mt-1">{ht.supportText}</p>
            </section>

            <div className="pt-6 border-t border-neutral-100 text-center">
              <div className="inline-block px-4 py-1 rounded-full bg-neutral-100 border border-neutral-200 text-xs font-bold text-neutral-500 tracking-widest uppercase">
                ToolStack • Check-It
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const EXPORT_TEXT = {
  en: {
    title: "Export Pack",
    subtitle: "Save, share, or back up your data.",
    downloadPdf: "Download PDF",
    printPdf: "Print / Save PDF",
    emailDraft: "Create Email Draft",
    downloadJson: "Download JSON",
    importJson: "Import JSON",
    importWarning: "Import replaces current app data. Export first if unsure.",
    jsonData: "JSON Data",
    emailSubject: "Check-It Export Pack",
    emailBody: "Attach: PDF export from Check-It (please attach the downloaded PDF file).\n\nExports are generated on your device. No data is uploaded automatically."
  },
  de: {
    title: "Export-Paket",
    subtitle: "Speichere, teile oder sichere deine Daten.",
    downloadPdf: "PDF herunterladen",
    printPdf: "Drucken / PDF speichern",
    emailDraft: "E-Mail-Entwurf erstellen",
    downloadJson: "JSON herunterladen",
    importJson: "JSON importieren",
    importWarning: "Der Import ersetzt die aktuellen App-Daten. Im Zweifel zuerst exportieren.",
    jsonData: "JSON-Daten",
    emailSubject: "Check-It Export-Paket",
    emailBody: "Anhängen: PDF-Export von Check-It (bitte die heruntergeladene PDF-Datei anhängen).\n\nExporte werden auf deinem Gerät erstellt. Es werden keine Daten automatisch hochgeladen."
  }
};

function ExportModal({ open, onClose, t, actions, lang = "en" }) {
  if (!open) return null;
  const et = EXPORT_TEXT[lang] || EXPORT_TEXT.en;

  const handleEmailDraft = () => {
    const subject = `${et.emailSubject} – ${new Date().toISOString().slice(0, 10)}`;
    const body = et.emailBody;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
      <div className="absolute inset-0 bg-neutral-900/50 backdrop-blur-sm transition-opacity" onClick={onClose} />
      
      <div className="relative w-full max-w-sm transform transition-all">
        <div className="relative bg-white border border-neutral-200 rounded-[2rem] shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="relative p-6 pb-4 flex items-center justify-between border-b-2 border-neutral-100">
            <h2 className="text-2xl sm:text-3xl font-black italic tracking-tighter text-neutral-900">
              {et.title}
            </h2>
            <button
              type="button"
              className="h-10 w-10 rounded-xl bg-neutral-100 hover:bg-[#D5FF00] border-2 border-transparent hover:border-neutral-900 text-neutral-900 font-bold flex items-center justify-center transition-all"
              onClick={onClose}
            >
              ✕
            </button>
          </div>

          {/* Content */}
          <div className="p-8 space-y-4">
            <p className="text-neutral-600 text-sm font-medium mb-2">
              {et.subtitle}
            </p>

            <div className="space-y-2">
              <ActionButton onClick={() => { actions.preview(); onClose(); }} disabled={actions.disabled} className="!bg-neutral-50 !border-neutral-200 !text-neutral-900 hover:!bg-neutral-100 w-full">
                {et.downloadPdf}
              </ActionButton>
              <ActionButton onClick={() => { actions.preview(); onClose(); }} disabled={actions.disabled} className="!bg-neutral-50 !border-neutral-200 !text-neutral-900 hover:!bg-neutral-100 w-full">
                {et.printPdf}
              </ActionButton>
              <ActionButton onClick={() => { handleEmailDraft(); onClose(); }} disabled={actions.disabled} className="!bg-neutral-50 !border-neutral-200 !text-neutral-900 hover:!bg-neutral-100 w-full">
                {et.emailDraft}
              </ActionButton>
            </div>
            
            <div className="h-px bg-neutral-200 my-2" />
            
            <div className="space-y-2">
              <ActionButton onClick={() => { actions.export(); onClose(); }} className="!bg-neutral-50 !border-neutral-200 !text-neutral-900 hover:!bg-neutral-100 w-full">
                {et.downloadJson}
              </ActionButton>
              
              <ActionFileButton onFile={(f) => { actions.import(f); onClose(); }} tone="primary" className="!bg-[#D5FF00] !border-[#D5FF00] !text-neutral-900 hover:!bg-white hover:!border-neutral-900 w-full">
                {et.importJson}
              </ActionFileButton>
              <p className="text-xs text-neutral-500 text-center mt-1">
                {et.importWarning}
              </p>
            </div>

            <div className="pt-4 border-t border-neutral-100 text-center mt-4">
              <div className="inline-block px-4 py-1 rounded-full bg-neutral-100 border border-neutral-200 text-xs font-bold text-neutral-500 tracking-widest uppercase">
                {et.jsonData}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({ open, title, message, confirmText = "Delete", onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
      <div className="absolute inset-0 bg-neutral-900/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-[2rem] bg-white border border-neutral-200 shadow-2xl overflow-hidden">
        <div className="p-6 border-b-2 border-neutral-100">
          <h3 className="text-xl font-black text-neutral-900">{title}</h3>
          <p className="text-neutral-600 mt-2 font-medium">{message}</p>
        </div>
        <div className="p-6 flex items-center justify-end gap-3 bg-neutral-50">
          <button
            type="button"
            className="px-4 py-2 rounded-xl text-sm font-bold border-2 border-neutral-200 bg-white hover:border-neutral-900 text-neutral-700 transition"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded-xl text-sm font-bold border-2 border-red-100 bg-red-50 hover:bg-red-100 hover:border-red-200 text-red-700 transition"
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

// DEV-only micro tests (kept tiny, no runtime impact in production builds)
if (import.meta?.env?.DEV) {
  console.assert(
    JSON.stringify(arrayMove([1, 2, 3], 0, 2)) === JSON.stringify([2, 3, 1]),
    "arrayMove should move item"
  );
  console.assert(safeParse("{\"a\":1}", null)?.a === 1, "safeParse should parse valid JSON");
  console.assert(safeParse("not-json", "x") === "x", "safeParse should fallback on invalid JSON");
  console.assert(/\d{4}-\d{2}-\d{2}/.test(todayISO()), "todayISO should be YYYY-MM-DD");
  const m = sanitizeCollapsedById({ a: 1, b: false });
  console.assert(m.a === true && m.b === false, "sanitizeCollapsedById should coerce booleans");
}

export default function App() {
  const savedRaw = typeof window !== "undefined" ? localStorage.getItem(LS_KEY) : null;
  const saved = savedRaw ? safeParse(savedRaw, null) : null;

  // Language (default EN)
  const [lang, setLang] = useState(() => {
    const l = saved?.ui?.lang;
    return l === "de" ? "de" : "en";
  });

  const t = useMemo(() => {
    const dict = {
      en: {
        tagline: "Simple daily checklist to help manage your day",
        help: "Help",
        menu: "Menu",
        language: "Language",
        controls: "Controls",
        checklistTitle: "Checklist title",
        search: "Search",
        searchPh: "Search items...",
        all: "All",
        today: "Today",
        overdue: "Overdue",
        clear: "Clear",
        addSection: "Add section",
        clearDone: "Clear done",
        tipDrag: "Tip: drag the handle (≡) to reorder items inside a section.",
        emailHint: "Email sends a text summary (no PDF attachment). Use “Print / Save PDF” to attach a PDF manually.",
        addItem: "Add item",
        del: "Delete",
        keepOne: "Keep at least one section",
        deleteSectionTitle: "Delete section?",
        deleteSectionMsg: "This will delete the section and all its items.",
        preview: "Preview",
        printSave: "Print / Save PDF",
        email: "Email",
        export: "Export",
        import: "Import",
        printPreview: "Print preview",
        close: "Close",
        generated: "Generated",
        noItems: "(no items)",
        noItemsYet: "No items yet. Click “Add item”.",
        filteredShowing: "Showing",
        filteredItems: "item(s) (filtered)",
        sectionCollapsed: "Section collapsed",
        expand: "Expand",
        collapse: "Collapse",
        left: "left",
        done: "done",
        total: "total",
        overdueLabel: "overdue",
        exportImport: "Export / Import",
      },
      de: {
        tagline: "Einfache tägliche Checkliste für deinen Tag",
        help: "Hilfe",
        menu: "Menü",
        language: "Sprache",
        controls: "Steuerung",
        checklistTitle: "Titel der Checkliste",
        search: "Suche",
        searchPh: "Einträge suchen...",
        all: "Alle",
        today: "Heute",
        overdue: "Überfällig",
        clear: "Zurücksetzen",
        addSection: "Abschnitt hinzufügen",
        clearDone: "Erledigte löschen",
        tipDrag: "Tipp: Ziehe den Griff (≡), um Einträge im Abschnitt zu sortieren.",
        emailHint: "E-Mail sendet nur eine Text-Zusammenfassung (kein PDF). Für ein PDF nutze “Drucken / PDF speichern”.",
        addItem: "Eintrag hinzufügen",
        del: "Löschen",
        keepOne: "Mindestens ein Abschnitt bleibt",
        deleteSectionTitle: "Abschnitt löschen?",
        deleteSectionMsg: "Das löscht den Abschnitt und alle Einträge.",
        preview: "Vorschau",
        printSave: "Drucken / PDF speichern",
        email: "E-Mail",
        export: "Export",
        import: "Import",
        printPreview: "Druckvorschau",
        close: "Schließen",
        generated: "Erstellt",
        noItems: "(keine Einträge)",
        noItemsYet: "Noch keine Einträge. Klicke “Eintrag hinzufügen”.",
        filteredShowing: "Anzeige",
        filteredItems: "Eintrag/Einträge (gefiltert)",
        sectionCollapsed: "Abschnitt eingeklappt",
        expand: "Ausklappen",
        collapse: "Einklappen",
        left: "offen",
        done: "erledigt",
        total: "gesamt",
        overdueLabel: "überfällig",
        exportImport: "Export / Import",
      },
    };
    return dict[lang] || dict.en;
  }, [lang]);

  const [title, setTitle] = useState(() => String(saved?.title || "Check-It"));
  const [exportOpen, setExportOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // Search + filter
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // all | today | overdue

  const [sections, setSections] = useState(() => {
    const base = [
      {
        id: uid(),
        name: lang === "de" ? "Allgemein" : "General",
        items: [{ id: uid(), text: lang === "de" ? "Ersten Eintrag hinzufügen" : "Add your first task", done: false, dueDate: "" }],
      },
    ];

    if (saved?.sections && Array.isArray(saved.sections)) {
      return saved.sections.map((s) => ({
        ...s,
        items: (s.items || []).map((it) => ({
          ...it,
          text: String(it.text ?? ""),
          done: !!it.done,
          dueDate: typeof it.dueDate === "string" ? it.dueDate : "",
        })),
      }));
    }
    return base;
  });

  // UI: collapsed/expanded sections (persisted)
  const [collapsedById, setCollapsedById] = useState(() => sanitizeCollapsedById(saved?.ui?.collapsedById));

  const [previewOpen, setPreviewOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const [confirm, setConfirm] = useState({ open: false, sectionId: null });

  const dragRef = useRef({ sectionId: null, fromIndex: null });

  const notify = (msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  };

  const isSectionCollapsed = (id) => !!collapsedById?.[id];
  const toggleSectionCollapsed = (id) => {
    setCollapsedById((prev) => ({ ...(prev || {}), [id]: !prev?.[id] }));
  };

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify({ title, sections, ui: { collapsedById, lang } }));
  }, [title, sections, collapsedById, lang]);

  const totals = useMemo(() => {
    let total = 0;
    let done = 0;
    let overdue = 0;
    let dueToday = 0;
    const tt = todayISO();
    for (const s of sections) {
      for (const it of s.items || []) {
        total += 1;
        if (it.done) done += 1;
        if (!it.done && it.dueDate) {
          if (it.dueDate < tt) overdue += 1;
          if (it.dueDate === tt) dueToday += 1;
        }
      }
    }
    return { total, done, left: Math.max(0, total - done), overdue, dueToday };
  }, [sections]);

  const sectionTotals = useMemo(() => {
    const tt = todayISO();
    return sections.map((s) => {
      const total = (s.items || []).length;
      const done = (s.items || []).filter((i) => i.done).length;
      const overdue = (s.items || []).filter((i) => !i.done && i.dueDate && i.dueDate < tt).length;
      return { id: s.id, total, done, left: Math.max(0, total - done), overdue };
    });
  }, [sections]);

  // Filtered sections (for display/preview)
  const filteredSections = useMemo(() => {
    const q = search.trim().toLowerCase();
    const tt = todayISO();

    const passesFilter = (it) => {
      if (filter === "today") return !it.done && it.dueDate && it.dueDate === tt;
      if (filter === "overdue") return !it.done && it.dueDate && it.dueDate < tt;
      return true;
    };

    const passesSearch = (it) => {
      if (!q) return true;
      return String(it.text || "").toLowerCase().includes(q);
    };

    return sections.map((s) => ({
      ...s,
      items: (s.items || []).filter((it) => passesFilter(it) && passesSearch(it)),
    }));
  }, [sections, search, filter]);

  const isFiltered = useMemo(() => !!search.trim() || filter !== "all", [search, filter]);

  const filteredTotals = useMemo(() => {
    let total = 0;
    for (const s of filteredSections) total += (s.items || []).length;
    return { total };
  }, [filteredSections]);

  const filteredSectionTotals = useMemo(() => {
    const tt = todayISO();
    return filteredSections.map((s) => {
      const total = (s.items || []).length;
      const done = (s.items || []).filter((i) => i.done).length;
      const overdue = (s.items || []).filter((i) => !i.done && i.dueDate && i.dueDate < tt).length;
      return { id: s.id, total, done, left: Math.max(0, total - done), overdue };
    });
  }, [filteredSections]);

  // build plain-text email summary of CURRENT VIEW (filtered)
  const buildEmailText = () => {
    const lines = [];
    const now = new Date();
    const iso = todayISO();

    lines.push(`ToolStack • Check-It`);
    lines.push(`Title: ${title || "Check-It"}`);
    lines.push(`Date: ${iso}`);
    lines.push(`Generated: ${now.toLocaleString()}`);
    lines.push("");
    lines.push(`Summary: ${totals.done}/${totals.total} completed${totals.overdue ? ` • ${totals.overdue} overdue` : ""}`);
    if (isFiltered) lines.push(`View: Filtered • Showing ${filteredTotals.total} item(s)`);
    lines.push("");

    for (const s of filteredSections) {
      const items = s.items || [];
      if (!items.length) continue;
      const stAll = sectionTotals.find((x) => x.id === s.id) || { total: 0, done: 0, left: 0, overdue: 0 };
      const stShown = filteredSectionTotals.find((x) => x.id === s.id) || { total: 0, done: 0, left: 0, overdue: 0 };

      lines.push(`== ${s.name} ==`);
      lines.push(isFiltered ? `Showing: ${stShown.total}/${stAll.total}` : `Items: ${stAll.total}`);
      for (const it of items) {
        const mark = it.done ? "[x]" : "[ ]";
        const due = it.dueDate ? ` (due ${it.dueDate})` : "";
        lines.push(`${mark} ${it.text}${due}`);
      }
      lines.push("");
    }

    lines.push(`Link: https://toolstack-check-it.vercel.app`);
    return lines.join("\n");
  };

  const emailCurrentView = () => {
    const subject = `ToolStack Check-It: ${title || "Checklist"} (${todayISO()})`;
    const body = buildEmailText();
    const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
  };

  const addSection = () => {
    const id = uid();
    setSections((prev) => [...prev, { id, name: `Section ${prev.length + 1}`, items: [] }]);
    setCollapsedById((prev) => ({ ...(prev || {}), [id]: false }));
    notify(lang === "de" ? "Abschnitt hinzugefügt" : "Section added");
  };

  const renameSection = (id, name) => {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
  };

  const requestDeleteSection = (id) => {
    if (sections.length === 1) return;
    setConfirm({ open: true, sectionId: id });
  };

  const deleteSectionNow = () => {
    const id = confirm.sectionId;
    setSections((prev) => prev.filter((s) => s.id !== id));
    setCollapsedById((prev) => {
      const next = { ...(prev || {}) };
      if (id) delete next[id];
      return next;
    });
    setConfirm({ open: false, sectionId: null });
    notify(lang === "de" ? "Abschnitt gelöscht" : "Section deleted");
  };

  const addItem = (sectionId) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? { ...s, items: [...(s.items || []), { id: uid(), text: "", done: false, dueDate: "" }] }
          : s
      )
    );
    notify(lang === "de" ? "Eintrag hinzugefügt" : "Item added");
  };

  const updateItem = (sectionId, itemId, patch) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? { ...s, items: (s.items || []).map((it) => (it.id === itemId ? { ...it, ...patch } : it)) }
          : s
      )
    );
  };

  const deleteItem = (sectionId, itemId) => {
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, items: (s.items || []).filter((it) => it.id !== itemId) } : s))
    );
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify({ title, sections, ui: { collapsedById, lang } }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "toolstack-check-it.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const importJSON = async (file) => {
    if (!file) return;
    const text = await file.text();
    const parsed = safeParse(text, null);
    if (!parsed || !Array.isArray(parsed.sections)) {
      notify(lang === "de" ? "Ungültiges JSON" : "Invalid JSON");
      return;
    }

    const migrated = parsed.sections.map((s) => ({
      id: s.id || uid(),
      name: String(s.name ?? "Section"),
      items: (s.items || []).map((it) => ({
        id: it.id || uid(),
        text: String(it.text ?? ""),
        done: !!it.done,
        dueDate: typeof it.dueDate === "string" ? it.dueDate : "",
      })),
    }));

    setTitle(String(parsed.title || "Check-It"));
    setSections(migrated);

    const allowed = new Set(migrated.map((s) => s.id));
    const uiMap = sanitizeCollapsedById(parsed?.ui?.collapsedById);
    const cleaned = {};
    for (const k of Object.keys(uiMap)) if (allowed.has(k)) cleaned[k] = !!uiMap[k];
    setCollapsedById(cleaned);

    const importedLang = parsed?.ui?.lang;
    if (importedLang === "de" || importedLang === "en") setLang(importedLang);

    notify(lang === "de" ? "Importiert" : "Imported");
  };

  const onDragStartItem = (sectionId, fromIndex) => (e) => {
    dragRef.current = { sectionId, fromIndex };
    try {
      e.dataTransfer.effectAllowed = "move";
    } catch {}
  };

  const onDropItem = (sectionId, toIndex) => (e) => {
    e.preventDefault();
    const { sectionId: fromSection, fromIndex } = dragRef.current || {};
    if (!fromSection || fromIndex == null) return;
    if (fromSection !== sectionId) return; // MVP: within a section
    setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, items: arrayMove(s.items || [], fromIndex, toIndex) } : s)));
    dragRef.current = { sectionId: null, fromIndex: null };
    notify(lang === "de" ? "Sortiert" : "Reordered");
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-800">
      {/* Print rules */}
      <style>{`
        @media print { .print\\:hidden { display: none !important; } }
      `}</style>

      {previewOpen ? (
        <style>{`
          @media print {
            .main-app-content { display: none !important; }
            body * { visibility: hidden; }
            
            /* Unwrap modal containers so they don't affect layout or create ghost pages */
            .print-modal-reset {
              display: contents !important;
            }

            html, body, #root {
              height: auto !important;
              min-height: 0 !important;
              overflow: visible !important;
            }

            #checkit-print, #checkit-print * { visibility: visible; }
            #checkit-print { 
              position: absolute !important; 
              left: 0 !important; top: 0 !important; 
              width: 100% !important; margin: 0 !important; padding: 0 !important; 
            }
          }
        `}</style>
      ) : null}

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} t={t} lang={lang} />

      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        t={t}
        lang={lang}
        actions={{
          email: emailCurrentView,
          export: exportJSON,
          import: importJSON,
          preview: () => setPreviewOpen(true),
          disabled: totals.total === 0
        }}
      />

      <ConfirmModal
        open={confirm.open}
        title={t.deleteSectionTitle}
        message={t.deleteSectionMsg}
        confirmText={t.del}
        onCancel={() => setConfirm({ open: false, sectionId: null })}
        onConfirm={deleteSectionNow}
      />

      {/* Preview Modal */}
      {previewOpen ? (
        <div className="print-modal-reset fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
          <div className="absolute inset-0 bg-neutral-900/50 backdrop-blur-sm transition-opacity" onClick={() => setPreviewOpen(false)} />
          
          <div className="print-modal-reset relative w-full max-w-5xl h-[85vh] flex flex-col transform transition-all">
            <div className="print-modal-reset relative flex flex-col h-full bg-white border border-neutral-200 rounded-[2rem] shadow-2xl overflow-hidden">
              
              {/* Header */}
              <div className="print:hidden relative p-6 pb-4 flex items-center justify-between shrink-0 border-b-2 border-neutral-100 bg-white z-10">
                <div>
                  <h2 className="text-2xl sm:text-4xl font-black italic tracking-tighter text-neutral-900">
                    {t.printPreview}
                  </h2>
                </div>
                
                <div className="flex items-center gap-4">
                  <button 
                    className="px-6 py-3 rounded-xl text-sm font-bold border-2 border-[#D5FF00] bg-[#D5FF00] text-neutral-900 hover:bg-white hover:border-neutral-900 transition shadow-[4px_4px_0px_rgba(0,0,0,0.1)] uppercase tracking-wider"
                    onClick={() => window.print()}
                  >
                    {t.printSave}
                  </button>
                  <button
                    type="button"
                    className="h-12 w-12 rounded-xl bg-neutral-100 hover:bg-[#D5FF00] border-2 border-transparent hover:border-neutral-900 text-neutral-900 font-black text-2xl flex items-center justify-center transition-all"
                    onClick={() => setPreviewOpen(false)}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Content Area - Scrollable */}
              <div className="print-modal-reset flex-1 overflow-y-auto p-4 sm:p-8 bg-neutral-50">
                <div className="print-modal-reset mx-auto max-w-3xl bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                  <div id="checkit-print" className="p-8 sm:p-12">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <img src={checkitLogo} alt="CheckIt" className="h-24 w-auto mb-4 mix-blend-multiply" />
                    <div className="text-sm text-neutral-700">
                      {totals.done}/{totals.total} {t.done}
                      {totals.overdue ? ` • ${totals.overdue} ${t.overdueLabel}` : ""}
                      {isFiltered ? ` • ${t.filteredShowing} ${filteredTotals.total} ${t.filteredItems}` : ""}
                    </div>
                  </div>
                  <div className="text-sm text-neutral-700">
                    {t.generated}: {new Date().toLocaleString()}
                  </div>
                </div>

                <div className="mt-5 space-y-5">
                  {filteredSections.map((s) => (
                    <div key={s.id} className="rounded-2xl border border-neutral-200">
                      <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between">
                        <div className="font-semibold text-neutral-800">{s.name}</div>
                        <div className="text-xs text-neutral-600">
                          {(s.items || []).filter((i) => i.done).length}/{(s.items || []).length}
                        </div>
                      </div>
                      <div className="p-4">
                        {(s.items || []).length ? (
                          <ul className="space-y-2">
                            {s.items.map((it) => (
                              <li key={it.id} className="flex items-start gap-3">
                                <div
                                  className={`mt-0.5 h-4 w-4 rounded border ${
                                    it.done ? "bg-neutral-800 border-neutral-800" : "bg-white border-neutral-400"
                                  }`}
                                />
                                <div className="min-w-0 flex-1">
                                  <div className={`text-sm ${it.done ? "text-neutral-600 line-through" : "text-neutral-800"}`}>
                                    {it.text}
                                  </div>
                                  {it.dueDate ? <div className="text-xs text-neutral-600 mt-0.5">Due: {it.dueDate}</div> : null}
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="text-sm text-neutral-600">{t.noItems}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 text-xs text-neutral-600">ToolStack • Check-It</div>
              </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="main-app-content max-w-6xl mx-auto p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row items-start justify-between gap-6 mb-8">
          <img src={checkitLogo} alt="CheckIt" className="h-20 w-auto sm:h-36 select-none mix-blend-multiply" draggable="false" />

          <div className="relative flex justify-end gap-2 w-full sm:w-auto sm:mt-4">
            <div className="flex items-center gap-2">
              <ActionButton onClick={() => {}}>HUB</ActionButton>
              <ActionButton onClick={() => setPreviewOpen(true)}>{t.preview}</ActionButton>
              <ActionButton onClick={() => setExportOpen(true)}>{t.export}</ActionButton>
            </div>

            <button
              type="button"
              title={t.help}
              onClick={() => setHelpOpen(true)}
              className="print:hidden h-9 w-9 rounded-xl border border-neutral-200 bg-white hover:bg-[#D5FF00]/30 hover:border-[#D5FF00]/30 hover:text-neutral-800 shadow-sm flex items-center justify-center font-bold text-neutral-800 text-sm"
            >
              ?
            </button>

            <div className="print:hidden absolute right-0 top-14 flex gap-3">
              <button
                onClick={() => setLang("en")}
                className={`h-8 w-9 text-xs font-black border-2 border-black transition-all ${
                  lang === "en"
                    ? "bg-[#D5FF00] text-black -rotate-12 scale-110 shadow-[4px_4px_0px_#000] z-10"
                    : "bg-white text-neutral-400 rotate-6 hover:rotate-0 hover:bg-neutral-50 hover:text-black hover:shadow-[2px_2px_0px_#000]"
                }`}
                style={{ borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px" }}
              >
                EN
              </button>
              <button
                onClick={() => setLang("de")}
                className={`h-8 w-9 text-xs font-black border-2 border-black transition-all ${
                  lang === "de"
                    ? "bg-[#D5FF00] text-black rotate-12 scale-110 shadow-[4px_4px_0px_#000] z-10"
                    : "bg-white text-neutral-400 -rotate-6 hover:rotate-0 hover:bg-neutral-50 hover:text-black hover:shadow-[2px_2px_0px_#000]"
                }`}
                style={{ borderRadius: "15px 225px 15px 255px / 255px 15px 225px 15px" }}
              >
                DE
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Left Column: Logo, Status, Controls */}
          <div className="flex flex-col gap-6">
            <div className="w-full max-w-lg bg-white rounded-2xl border border-neutral-200 shadow-lg p-5">
                <div className="flex items-end justify-between mb-4">
                  <div>
                    <div className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1">
                      {lang === "de" ? "Fortschritt" : "Progress"}
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-black text-neutral-900 tracking-tight">
                        {Math.round(totals.total > 0 ? (totals.done / totals.total) * 100 : 0)}%
                      </span>
                      <span className="text-sm font-medium text-neutral-500">
                        {totals.done} / {totals.total}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex gap-4 sm:gap-6">
                    <div className="text-right">
                      <div className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-0.5">{t.left}</div>
                      <div className="text-2xl font-bold text-neutral-800">{totals.left}</div>
                    </div>
                    {totals.dueToday > 0 && (
                      <div className="text-right">
                        <div className="text-xs font-bold text-lime-600 uppercase tracking-wider mb-0.5">{t.today}</div>
                        <div className="text-2xl font-bold text-lime-700">{totals.dueToday}</div>
                      </div>
                    )}
                    {totals.overdue > 0 && (
                      <div className="text-right">
                        <div className="text-xs font-bold text-red-400 uppercase tracking-wider mb-0.5">{t.overdueLabel}</div>
                        <div className="text-2xl font-bold text-red-600">{totals.overdue}</div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="relative h-4 w-full bg-neutral-100 rounded-full overflow-hidden">
                  <div
                    className="absolute top-0 left-0 h-full bg-[#D5FF00] transition-all duration-500 ease-out"
                    style={{ width: `${totals.total > 0 ? (totals.done / totals.total) * 100 : 0}%` }}
                  />
                  {/* Diagonal stripes for texture */}
                  <div 
                    className="absolute inset-0 opacity-20"
                    style={{
                      backgroundImage: "linear-gradient(45deg, #000 25%, transparent 25%, transparent 50%, #000 50%, #000 75%, transparent 75%, transparent)",
                      backgroundSize: "16px 16px"
                    }}
                  />
                </div>

                <div className="mt-3 flex items-center justify-between">
                  {isFiltered ? (
                    <div className="flex items-center gap-2 text-xs font-medium text-neutral-400 bg-neutral-50 px-3 py-1.5 rounded-lg w-fit">
                      <div className="h-1.5 w-1.5 rounded-full bg-neutral-400" />
                      {lang === "de" ? `Gefiltert: ${filteredTotals.total} angezeigt` : `Filtered view: ${filteredTotals.total} showing`}
                    </div>
                  ) : (
                    <div className="text-xs font-medium text-neutral-400">
                      {(() => {
                        const pct = totals.total > 0 ? Math.round((totals.done / totals.total) * 100) : 0;
                        if (pct === 100) return lang === "de" ? "Alles erledigt! 🎉" : "All done! 🎉";
                        if (pct >= 75) return lang === "de" ? "Fast geschafft!" : "Almost there!";
                        if (pct >= 50) return lang === "de" ? "Über die Hälfte!" : "Over halfway!";
                        if (pct >= 25) return lang === "de" ? "Guter Anfang!" : "Good start!";
                        return lang === "de" ? "Los geht's!" : "Let's go!";
                      })()}
                    </div>
                  )}
                </div>
            </div>

            {/* Controls */}
            <div className={`${card}`}>
              <div className={`${cardHead} `}>
                <div className="font-semibold text-neutral-800">{t.controls}</div>
              </div>
              <div className={`${cardPad} space-y-3`}>
                <div>
                  <label className="text-sm text-neutral-700 font-medium">{t.checklistTitle}</label>
                  <input className={inputBase} value={title} onChange={(e) => setTitle(e.target.value)}  />
                </div>

                {/* Search + Filter */}
                <div> 
                  <label className="text-sm text-neutral-700 font-medium">{t.search}</label>
                  <input className={inputBase} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.searchPh} />

                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={`print:hidden px-3 py-2 rounded-xl text-sm font-medium border shadow-sm transition ${
                        filter === "all" 
                          ? "border-neutral-700 bg-neutral-700 text-white hover:bg-neutral-600"
                          : "border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-800"
                      }`}
                      onClick={() => setFilter("all")}
                    >
                      {t.all}
                    </button>
                    <button
                      type="button"
                      className={`print:hidden px-3 py-2 rounded-xl text-sm font-medium border shadow-sm transition ${
                        filter === "today"
                          ? "border-neutral-700 bg-neutral-700 text-white hover:bg-neutral-600"
                          : "border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-800"
                      }`}
                      onClick={() => setFilter("today")}
                    >
                      {t.today}
                    </button>
                    <button
                      type="button"
                      className={`print:hidden px-3 py-2 rounded-xl text-sm font-medium border shadow-sm transition ${
                        filter === "overdue"
                          ? "border-neutral-700 bg-neutral-700 text-white hover:bg-neutral-600"
                          : "border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-800"
                      }`}
                      onClick={() => setFilter("overdue")}
                    >
                      {t.overdue}
                    </button>

                    {isFiltered ? (
                      <button
                        type="button"
                        className={btnSecondary}
                        onClick={() => {
                          setSearch("");
                          setFilter("all");
                        }}
                      >
                        {t.clear}
                      </button>
                    ) : null}
                  </div>

                  {isFiltered ? (
                    <div className="mt-2 text-xs text-neutral-600">
                      {t.filteredShowing} {filteredTotals.total} {t.filteredItems}
                    </div>
                  ) : null}

                  <div className="mt-2 text-xs text-neutral-600">{t.emailHint}</div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <SmallButton tone="primary" onClick={addSection} className="w-full">
                    {t.addSection}
                  </SmallButton>
                  <SmallButton
                    onClick={() => {
                      setSections((prev) => prev.map((s) => ({ ...s, items: (s.items || []).filter((it) => !it.done) })));
                      notify(lang === "de" ? "Erledigte gelöscht" : "Completed cleared");
                    }}
                    className="w-full"
                    disabled={totals.done === 0}
                  >
                    {t.clearDone}
                  </SmallButton>
                </div>

                <div className="text-xs text-neutral-600">{t.tipDrag}</div>
              </div>
            </div>
          </div>

          {/* Right Column: Actions, Sections */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            {/* Sections */}
            <div className="space-y-3">
              {filteredSections.map((s) => {
                const stAll = sectionTotals.find((x) => x.id === s.id) || { total: 0, done: 0, left: 0, overdue: 0 };
                const stShown = filteredSectionTotals.find((x) => x.id === s.id) || { total: 0, done: 0, left: 0, overdue: 0 };
                const st = isFiltered ? stShown : stAll;
                const collapsed = isSectionCollapsed(s.id);
          
                return (
                  <div key={s.id} className={`${card}`}>
                    <div className={`${cardHead} flex items-center justify-between gap-3`}>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleSectionCollapsed(s.id)}
                            title={collapsed ? t.expand : t.collapse}
                            className="print:hidden h-9 w-9 rounded-xl border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 flex items-center justify-center"
                            aria-label={collapsed ? t.expand : t.collapse}
                          >
                            {collapsed ? "▸" : "▾"}
                          </button>
                          <input
                            className="flex-1 w-full font-bold text-neutral-800 bg-transparent border-2 border-transparent hover:border-neutral-200 hover:bg-white focus:bg-white focus:border-[#D5FF00] rounded-xl px-2 py-1 transition-all outline-none"
                            value={s.name}
                            onChange={(e) => renameSection(s.id, e.target.value)}
                          />
                        </div>
                        <div className="text-xs text-neutral-600 mt-1">
                          {st.done}/{st.total} {t.done} • {st.left} {t.left}
                          {st.overdue ? ` • ${st.overdue} ${t.overdueLabel}` : ""}
                          {isFiltered ? <span className="ml-2">• {t.filteredShowing} {stShown.total}/{stAll.total}</span> : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <SmallButton onClick={() => addItem(s.id)}>{t.addItem}</SmallButton>
                        <SmallButton
                          tone="danger"
                          onClick={() => requestDeleteSection(s.id)}
                          disabled={sections.length === 1}
                          title={sections.length === 1 ? t.keepOne : t.del}
                        >
                          {t.del}
                        </SmallButton>
                      </div>
                    </div>
        
                    <div className={`${cardPad}`}>
                      {collapsed ? (
                        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 flex items-center justify-between gap-3">
                          <div className="text-sm text-neutral-700">
                            <span className="font-medium text-neutral-800">{t.sectionCollapsed}.</span> {st.total} {lang === "de" ? "Eintrag/Einträge" : "item(s)"}
                            {st.overdue ? ` • ${st.overdue} ${t.overdueLabel}` : ""}.
                          </div>
                          <SmallButton tone="primary" onClick={() => toggleSectionCollapsed(s.id)}>
                            {t.expand}
                          </SmallButton>
                        </div>
                      ) : (s.items || []).length ? (
                        <ul className="space-y-3">
                          {s.items.map((it, idx) => {
                            const overdue = !it.done && it.dueDate && it.dueDate < todayISO(); 
                            return (
                              <li
                                key={it.id}
                                className={`flex items-start gap-3 rounded-2xl p-2 border ${
                                  overdue ? "border-red-200 bg-red-50" : "border-neutral-200 bg-white"
                                }`}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={onDropItem(s.id, idx)}
                              >
                                <button
                                  type="button"
                                  draggable
                                  onDragStart={onDragStartItem(s.id, idx)}
                                  className="print:hidden h-9 w-9 rounded-xl border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 flex items-center justify-center cursor-grab active:cursor-grabbing"
                                  title={lang === "de" ? "Ziehen zum Sortieren" : "Drag to reorder"}
                                >
                                  ≡
                                </button>

                                <div className="mt-2">
                                  <Checkbox checked={!!it.done} onChange={(v) => updateItem(s.id, it.id, { done: v })} />
                                </div>

                                <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-3 gap-2">
                                  <div className="md:col-span-2">
                                    <input
                                      className={`w-full rounded-xl border px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-lime-400/25 focus:border-neutral-300 ${
                                        it.done
                                          ? "border-neutral-200 bg-neutral-50 text-neutral-600 line-through"
                                          : "border-neutral-200 bg-white text-neutral-800"
                                      }`}
                                      value={it.text}
                                      onChange={(e) => updateItem(s.id, it.id, { text: e.target.value })}
                                    />
                                  </div>

                                  <div>
                                    <DateField lang={lang} value={it.dueDate || ""} onChange={(v) => updateItem(s.id, it.id, { dueDate: v })} />
                                    {overdue ? <div className="text-xs text-red-700 mt-1">{t.overdue}</div> : null}
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  className="print:hidden px-2 py-2 rounded-xl border border-neutral-200 hover:bg-neutral-50 text-neutral-700"
                                  onClick={() => deleteItem(s.id, it.id)}
                                  title={lang === "de" ? "Eintrag löschen" : "Delete item"}
                                >
                                  ✕
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <div className="text-sm text-neutral-600">{t.noItemsYet}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {toast ? (
          <div className="fixed bottom-6 right-6 rounded-2xl bg-neutral-800 text-white px-4 py-3 shadow-xl print:hidden">
            <div className="text-sm">{toast}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
