import React, { useEffect, useMemo, useRef, useState } from "react";

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

const btnSecondary =
  "print:hidden px-3 py-2 rounded-xl text-sm font-medium border border-neutral-200 bg-white shadow-sm hover:bg-neutral-50 active:translate-y-[1px] transition disabled:opacity-50 disabled:cursor-not-allowed";
const btnPrimary =
  "print:hidden px-3 py-2 rounded-xl text-sm font-medium border border-neutral-900 bg-neutral-900 text-white shadow-sm hover:bg-neutral-800 active:translate-y-[1px] transition disabled:opacity-50 disabled:cursor-not-allowed";
const btnDanger =
  "print:hidden px-3 py-2 rounded-xl text-sm font-medium border border-red-200 bg-red-50 text-red-700 shadow-sm hover:bg-red-100 active:translate-y-[1px] transition disabled:opacity-50 disabled:cursor-not-allowed";
const inputBase =
  "mt-2 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-lime-400/25 focus:border-neutral-300";
const card = "rounded-2xl bg-white border border-neutral-200 shadow-sm";
const cardHead = "px-4 py-3 border-b border-neutral-100";
const cardPad = "p-4";

function SmallButton({ children, onClick, tone = "default", disabled, title, className = "" }) {
  const cls = tone === "primary" ? btnPrimary : tone === "danger" ? btnDanger : btnSecondary;
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} className={`${cls} ${className}`}>
      {children}
    </button>
  );
}

function Pill({ children, tone = "default" }) {
  const cls =
    tone === "accent"
      ? "border-lime-200 bg-lime-50 text-neutral-800"
      : tone === "warn"
      ? "border-amber-200 bg-amber-50 text-neutral-800"
      : "border-neutral-200 bg-white text-neutral-700";

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${cls}`}>
      {children}
    </span>
  );
}

function Checkbox({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`h-5 w-5 rounded-md border flex items-center justify-center transition ${
        checked ? "bg-neutral-900 border-neutral-900" : "bg-white border-neutral-300 hover:bg-neutral-50"
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

function ConfirmModal({ open, title, message, confirmText = "Delete", onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-2xl bg-white border border-neutral-200 shadow-xl overflow-hidden">
        <div className="p-4 border-b border-neutral-100">
          <div className="text-lg font-semibold text-neutral-900">{title}</div>
          <div className="text-sm text-neutral-600 mt-1">{message}</div>
          <div className="mt-3 h-[2px] w-40 rounded-full bg-gradient-to-r from-lime-400/0 via-lime-400 to-emerald-400/0" />
        </div>
        <div className="p-4 flex items-center justify-end gap-2">
          <button
            type="button"
            className="px-3 py-2 rounded-xl text-sm font-medium border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-900 transition"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="px-3 py-2 rounded-xl text-sm font-medium border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 transition"
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [title, setTitle] = useState("Check-It");

  // NEW: Search + filter
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // all | today | overdue

  const [sections, setSections] = useState(() => {
    const base = [
      { id: uid(), name: "General", items: [{ id: uid(), text: "Add your first task", done: false, dueDate: "" }] },
    ];
    const saved = localStorage.getItem(LS_KEY);
    const data = saved ? safeParse(saved, null) : null;
    if (data?.sections && Array.isArray(data.sections)) {
      return data.sections.map((s) => ({
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

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify({ title, sections }));
  }, [title, sections]);

  const totals = useMemo(() => {
    let total = 0;
    let done = 0;
    let overdue = 0;
    const t = todayISO();
    for (const s of sections) {
      for (const it of s.items || []) {
        total += 1;
        if (it.done) done += 1;
        if (!it.done && it.dueDate && it.dueDate < t) overdue += 1;
      }
    }
    return { total, done, left: Math.max(0, total - done), overdue };
  }, [sections]);

  const sectionTotals = useMemo(() => {
    const t = todayISO();
    return sections.map((s) => {
      const total = (s.items || []).length;
      const done = (s.items || []).filter((i) => i.done).length;
      const overdue = (s.items || []).filter((i) => !i.done && i.dueDate && i.dueDate < t).length;
      return { id: s.id, total, done, left: Math.max(0, total - done), overdue };
    });
  }, [sections]);

  // NEW: filtered sections (for display/preview)
  const filteredSections = useMemo(() => {
    const q = search.trim().toLowerCase();
    const t = todayISO();

    const passesFilter = (it) => {
      if (filter === "today") return !it.done && it.dueDate && it.dueDate === t;
      if (filter === "overdue") return !it.done && it.dueDate && it.dueDate < t;
      return true; // all
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
    const t = todayISO();
    return filteredSections.map((s) => {
      const total = (s.items || []).length;
      const done = (s.items || []).filter((i) => i.done).length;
      const overdue = (s.items || []).filter((i) => !i.done && i.dueDate && i.dueDate < t).length;
      return { id: s.id, total, done, left: Math.max(0, total - done), overdue };
    });
  }, [filteredSections]);

  const addSection = () => {
    setSections((prev) => [...prev, { id: uid(), name: `Section ${prev.length + 1}`, items: [] }]);
    notify("Section added");
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
    setConfirm({ open: false, sectionId: null });
    notify("Section deleted");
  };

  const addItem = (sectionId) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? { ...s, items: [...(s.items || []), { id: uid(), text: "New item", done: false, dueDate: "" }] }
          : s
      )
    );
    notify("Item added");
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
    const blob = new Blob([JSON.stringify({ title, sections }, null, 2)], { type: "application/json" });
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
      notify("Invalid JSON");
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
    notify("Imported");
  };

  const onDragStartItem = (sectionId, fromIndex) => (e) => {
    dragRef.current = { sectionId, fromIndex };
    try {
      e.dataTransfer.effectAllowed = "move";
    } catch {}
  };

  const onDragOverItem = () => (e) => {
    e.preventDefault();
  };

  const onDropItem = (sectionId, toIndex) => (e) => {
    e.preventDefault();
    const { sectionId: fromSection, fromIndex } = dragRef.current || {};
    if (!fromSection || fromIndex == null) return;
    if (fromSection !== sectionId) return; // MVP: within a section
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, items: arrayMove(s.items || [], fromIndex, toIndex) } : s))
    );
    dragRef.current = { sectionId: null, fromIndex: null };
    notify("Reordered");
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      {/* Print rules */}
      <style>{`
        @media print { .print\\:hidden { display: none !important; } }
      `}</style>

      {previewOpen ? (
        <style>{`
          @media print {
            body * { visibility: hidden !important; }
            #checkit-print, #checkit-print * { visibility: visible !important; }
            #checkit-print { position: absolute !important; left: 0; top: 0; width: 100%; }
          }
        `}</style>
      ) : null}

      <ConfirmModal
        open={confirm.open}
        title="Delete section?"
        message="This will delete the section and all its items."
        onCancel={() => setConfirm({ open: false, sectionId: null })}
        onConfirm={deleteSectionNow}
      />

      {/* Preview Modal */}
      {previewOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
          <div className="absolute inset-0 bg-black/40" onClick={() => setPreviewOpen(false)} />
          <div className="relative w-full max-w-5xl">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="text-lg font-semibold text-white">Print preview</div>
              <div className="flex items-center gap-2">
                <button
                  className="px-3 py-2 rounded-xl text-sm font-medium border border-white/40 bg-white/10 hover:bg-white/15 text-white transition"
                  onClick={() => window.print()}
                >
                  Print / Save PDF
                </button>
                <button
                  className="px-3 py-2 rounded-xl text-sm font-medium border border-white/40 bg-white/10 hover:bg-white/15 text-white transition"
                  onClick={() => setPreviewOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>

            <div className="rounded-2xl bg-white border border-neutral-200 shadow-xl overflow-auto max-h-[80vh]">
              <div id="checkit-print" className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-2xl font-bold tracking-tight text-neutral-900">{title || "Check-It"}</div>
                    <div className="text-sm text-neutral-600">
                      {totals.done}/{totals.total} completed{totals.overdue ? ` • ${totals.overdue} overdue` : ""}
                      {isFiltered ? ` • showing ${filteredTotals.total} item(s)` : ""}
                    </div>
                    <div className="mt-3 h-[2px] w-72 rounded-full bg-gradient-to-r from-lime-400/0 via-lime-400 to-emerald-400/0" />
                  </div>
                  <div className="text-sm text-neutral-600">Generated: {new Date().toLocaleString()}</div>
                </div>

                <div className="mt-5 space-y-5">
                  {filteredSections.map((s) => (
                    <div key={s.id} className="rounded-2xl border border-neutral-200">
                      <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between">
                        <div className="font-semibold text-neutral-900">{s.name}</div>
                        <div className="text-xs text-neutral-500">
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
                                    it.done ? "bg-neutral-900 border-neutral-900" : "bg-white border-neutral-400"
                                  }`}
                                />
                                <div className="min-w-0 flex-1">
                                  <div className={`text-sm ${it.done ? "text-neutral-500 line-through" : "text-neutral-900"}`}>
                                    {it.text}
                                  </div>
                                  {it.dueDate ? <div className="text-xs text-neutral-500 mt-0.5">Due: {it.dueDate}</div> : null}
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="text-sm text-neutral-500">(no items)</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 text-xs text-neutral-500">ToolStack • Check-It</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="max-w-6xl mx-auto p-4 sm:p-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-2xl font-bold tracking-tight text-neutral-900">Check-It</div>
            <div className="text-sm text-neutral-600">Checklists, due dates, and drag-to-reorder.</div>
            <div className="mt-3 h-[2px] w-80 rounded-full bg-gradient-to-r from-lime-400/0 via-lime-400 to-emerald-400/0" />
            <div className="mt-3 flex flex-wrap gap-2">
              <Pill tone="accent">{totals.left} left</Pill>
              <Pill>{totals.done} done</Pill>
              <Pill>{totals.total} total</Pill>
              {totals.overdue ? <Pill tone="warn">{totals.overdue} overdue</Pill> : null}
              {isFiltered ? <Pill>Filtered: {filteredTotals.total}</Pill> : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <SmallButton onClick={() => setPreviewOpen(true)} disabled={totals.total === 0}>
              Preview
            </SmallButton>
            <SmallButton onClick={() => window.print()} disabled={totals.total === 0}>
              Print / Save PDF
            </SmallButton>
            <SmallButton onClick={exportJSON}>Export</SmallButton>

            <label className={`${btnPrimary} cursor-pointer`}>
              Import
              <input
                type="file"
                className="hidden"
                accept="application/json"
                onChange={(e) => importJSON(e.target.files?.[0] || null)}
              />
            </label>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Controls */}
          <div className={`${card}`}>
            <div className={`${cardHead}`}>
              <div className="font-semibold text-neutral-900">Controls</div>
            </div>
            <div className={`${cardPad} space-y-3`}>
              <div>
                <label className="text-sm text-neutral-700 font-medium">Checklist title</label>
                <input className={inputBase} value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>

              {/* NEW: Search + Filter */}
              <div>
                <label className="text-sm text-neutral-700 font-medium">Search</label>
                <input
                  className={inputBase}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search items..."
                />

                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={`print:hidden px-3 py-2 rounded-xl text-sm font-medium border shadow-sm transition ${
                      filter === "all"
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-900"
                    }`}
                    onClick={() => setFilter("all")}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    className={`print:hidden px-3 py-2 rounded-xl text-sm font-medium border shadow-sm transition ${
                      filter === "today"
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-900"
                    }`}
                    onClick={() => setFilter("today")}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    className={`print:hidden px-3 py-2 rounded-xl text-sm font-medium border shadow-sm transition ${
                      filter === "overdue"
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-900"
                    }`}
                    onClick={() => setFilter("overdue")}
                  >
                    Overdue
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
                      Clear
                    </button>
                  ) : null}
                </div>

                {isFiltered ? (
                  <div className="mt-2 text-xs text-neutral-500">Showing {filteredTotals.total} item(s) (filtered)</div>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <SmallButton tone="primary" onClick={addSection} className="w-full">
                  Add section
                </SmallButton>
                <SmallButton
                  onClick={() => {
                    setSections((prev) => prev.map((s) => ({ ...s, items: (s.items || []).filter((it) => !it.done) })));
                    notify("Completed cleared");
                  }}
                  className="w-full"
                  disabled={totals.done === 0}
                >
                  Clear done
                </SmallButton>
              </div>

              <div className="text-xs text-neutral-500">Tip: drag the handle (≡) to reorder items inside a section.</div>
            </div>
          </div>

          {/* Sections */}
          <div className="lg:col-span-2 space-y-3">
            {filteredSections.map((s) => {
              const stAll = sectionTotals.find((x) => x.id === s.id) || { total: 0, done: 0, left: 0, overdue: 0 };
              const stShown = filteredSectionTotals.find((x) => x.id === s.id) || { total: 0, done: 0, left: 0, overdue: 0 };
              const st = isFiltered ? stShown : stAll;

              return (
                <div key={s.id} className={`${card}`}>
                  <div className={`${cardHead} flex items-center justify-between gap-3`}>
                    <div className="min-w-0">
                      <input
                        className="w-full font-semibold text-neutral-900 bg-transparent outline-none"
                        value={s.name}
                        onChange={(e) => renameSection(s.id, e.target.value)}
                      />
                      <div className="text-xs text-neutral-500 mt-1">
                        {st.done}/{st.total} done • {st.left} left{st.overdue ? ` • ${st.overdue} overdue` : ""}
                        {isFiltered ? (
                          <span className="ml-2">• showing {stShown.total}/{stAll.total}</span>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <SmallButton onClick={() => addItem(s.id)}>Add item</SmallButton>
                      <SmallButton
                        tone="danger"
                        onClick={() => requestDeleteSection(s.id)}
                        disabled={sections.length === 1}
                        title={sections.length === 1 ? "Keep at least one section" : "Delete section"}
                      >
                        Delete
                      </SmallButton>
                    </div>
                  </div>

                  <div className={`${cardPad}`}>
                    {(s.items || []).length ? (
                      <ul className="space-y-3">
                        {s.items.map((it, idx) => {
                          const overdue = !it.done && it.dueDate && it.dueDate < todayISO();
                          return (
                            <li
                              key={it.id}
                              className={`flex items-start gap-3 rounded-2xl p-2 border ${
                                overdue ? "border-red-200 bg-red-50" : "border-neutral-200 bg-white"
                              }`}
                              onDragOver={onDragOverItem()}
                              onDrop={onDropItem(s.id, idx)}
                            >
                              <button
                                type="button"
                                draggable
                                onDragStart={onDragStartItem(s.id, idx)}
                                className="print:hidden h-9 w-9 rounded-xl border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 flex items-center justify-center cursor-grab active:cursor-grabbing"
                                title="Drag to reorder"
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
                                        ? "border-neutral-200 bg-neutral-50 text-neutral-500 line-through"
                                        : "border-neutral-200 bg-white text-neutral-900"
                                    }`}
                                    value={it.text}
                                    onChange={(e) => updateItem(s.id, it.id, { text: e.target.value })}
                                  />
                                </div>

                                <div>
                                  <input
                                    type="date"
                                    className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-lime-400/25 focus:border-neutral-300"
                                    value={it.dueDate || ""}
                                    onChange={(e) => updateItem(s.id, it.id, { dueDate: e.target.value })}
                                  />
                                  {overdue ? <div className="text-xs text-red-700 mt-1">Overdue</div> : null}
                                </div>
                              </div>

                              <button
                                type="button"
                                className="print:hidden px-2 py-2 rounded-xl border border-neutral-200 hover:bg-neutral-50 text-neutral-700"
                                onClick={() => deleteItem(s.id, it.id)}
                                title="Delete item"
                              >
                                ✕
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <div className="text-sm text-neutral-500">No items yet. Click “Add item”.</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {toast ? (
          <div className="fixed bottom-6 right-6 rounded-2xl bg-neutral-900 text-white px-4 py-3 shadow-xl print:hidden">
            <div className="text-sm">{toast}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
