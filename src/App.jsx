import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * ToolStack — Check-It (Tailwind UI)
 * - Sections + items
 * - Delete section (in-app confirm modal)
 * - Reorder items via drag & drop (within a section)
 * - Due date per item + overdue flag
 * - Print Preview (prints only the preview sheet)
 * - Export/Import JSON
 * - Autosave to localStorage
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

function SmallButton({ children, onClick, tone = "default", disabled, title, className = "" }) {
  const cls =
    tone === "primary"
      ? "bg-slate-900 hover:bg-slate-800 text-white border-slate-900"
      : tone === "danger"
        ? "bg-rose-600 hover:bg-rose-700 text-white border-rose-700"
        : "bg-white hover:bg-slate-50 text-slate-900 border-slate-200";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`print:hidden px-3 py-2 rounded-xl text-sm font-medium border transition disabled:opacity-50 disabled:cursor-not-allowed ${cls} ${className}`}
    >
      {children}
    </button>
  );
}

function Pill({ children }) {
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border border-slate-200 bg-white text-slate-700">
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
        checked ? "bg-slate-900 border-slate-900" : "bg-white border-slate-300 hover:bg-slate-50"
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
      <div className="relative w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-lg">
        <div className="p-4 border-b border-slate-100">
          <div className="text-lg font-semibold text-slate-900">{title}</div>
          <div className="text-sm text-slate-600 mt-1">{message}</div>
        </div>
        <div className="p-4 flex items-center justify-end gap-2">
          <button
            type="button"
            className="px-3 py-2 rounded-xl text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-900 transition"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="px-3 py-2 rounded-xl text-sm font-medium border border-rose-700 bg-rose-600 hover:bg-rose-700 text-white transition"
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
        s.id === sectionId ? { ...s, items: (s.items || []).map((it) => (it.id === itemId ? { ...it, ...patch } : it)) } : s
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
    <div className="min-h-screen bg-slate-50">
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

            <div className="rounded-2xl bg-white border border-slate-200 shadow-lg overflow-auto max-h-[80vh]">
              <div id="checkit-print" className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-2xl font-semibold text-slate-900">{title || "Check-It"}</div>
                    <div className="text-sm text-slate-600">
                      {totals.done}/{totals.total} completed{totals.overdue ? ` • ${totals.overdue} overdue` : ""}
                    </div>
                  </div>
                  <div className="text-sm text-slate-600">Generated: {new Date().toLocaleString()}</div>
                </div>

                <div className="mt-5 space-y-5">
                  {sections.map((s) => (
                    <div key={s.id} className="rounded-2xl border border-slate-200">
                      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                        <div className="font-semibold text-slate-900">{s.name}</div>
                        <div className="text-xs text-slate-500">
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
                                    it.done ? "bg-slate-900 border-slate-900" : "bg-white border-slate-400"
                                  }`}
                                />
                                <div className="min-w-0 flex-1">
                                  <div className={`text-sm ${it.done ? "text-slate-500 line-through" : "text-slate-900"}`}>
                                    {it.text}
                                  </div>
                                  {it.dueDate ? <div className="text-xs text-slate-500 mt-0.5">Due: {it.dueDate}</div> : null}
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="text-sm text-slate-500">(no items)</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 text-xs text-slate-500">ToolStack • Check-It</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-2xl font-semibold text-slate-900">Check-It</div>
            <div className="text-sm text-slate-600">Sections, due dates, and drag-to-reorder.</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Pill>{totals.left} left</Pill>
              <Pill>{totals.done} done</Pill>
              <Pill>{totals.total} total</Pill>
              {totals.overdue ? <Pill>{totals.overdue} overdue</Pill> : null}
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
            <label className="print:hidden px-3 py-2 rounded-xl text-sm font-medium bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 cursor-pointer">
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
          <div className="rounded-2xl bg-white shadow-sm border border-slate-200">
            <div className="px-4 py-3 border-b border-slate-100">
              <div className="font-semibold text-slate-900">Controls</div>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-sm text-slate-700 font-medium">Checklist title</label>
                <input
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
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

              <div className="text-xs text-slate-500">Tip: drag the handle (≡) to reorder items inside a section.</div>
            </div>
          </div>

          {/* Sections */}
          <div className="lg:col-span-2 space-y-3">
            {sections.map((s) => {
              const st = sectionTotals.find((x) => x.id === s.id) || { total: 0, done: 0, left: 0, overdue: 0 };
              return (
                <div key={s.id} className="rounded-2xl bg-white shadow-sm border border-slate-200">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <input
                        className="w-full font-semibold text-slate-900 bg-transparent outline-none"
                        value={s.name}
                        onChange={(e) => renameSection(s.id, e.target.value)}
                      />
                      <div className="text-xs text-slate-500 mt-1">
                        {st.done}/{st.total} done • {st.left} left{st.overdue ? ` • ${st.overdue} overdue` : ""}
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

                  <div className="p-4">
                    {(s.items || []).length ? (
                      <ul className="space-y-3">
                        {s.items.map((it, idx) => {
                          const overdue = !it.done && it.dueDate && it.dueDate < todayISO();
                          return (
                            <li
                              key={it.id}
                              className={`flex items-start gap-3 rounded-2xl p-2 border ${
                                overdue ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-white"
                              }`}
                              onDragOver={onDragOverItem()}
                              onDrop={onDropItem(s.id, idx)}
                            >
                              <button
                                type="button"
                                draggable
                                onDragStart={onDragStartItem(s.id, idx)}
                                className="print:hidden h-9 w-9 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center cursor-grab active:cursor-grabbing"
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
                                    className={`w-full rounded-xl border px-3 py-2 text-sm outline-none transition ${
                                      it.done
                                        ? "border-slate-200 bg-slate-50 text-slate-500 line-through"
                                        : "border-slate-200 bg-white text-slate-900 focus:border-slate-300"
                                    }`}
                                    value={it.text}
                                    onChange={(e) => updateItem(s.id, it.id, { text: e.target.value })}
                                  />
                                </div>

                                <div>
                                  <input
                                    type="date"
                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                    value={it.dueDate || ""}
                                    onChange={(e) => updateItem(s.id, it.id, { dueDate: e.target.value })}
                                  />
                                  {overdue ? <div className="text-xs text-rose-700 mt-1">Overdue</div> : null}
                                </div>
                              </div>

                              <button
                                type="button"
                                className="print:hidden px-2 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700"
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
                      <div className="text-sm text-slate-500">No items yet. Click “Add item”.</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {toast ? (
          <div className="fixed bottom-6 right-6 rounded-2xl bg-slate-900 text-white px-4 py-3 shadow-lg print:hidden">
            <div className="text-sm">{toast}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
