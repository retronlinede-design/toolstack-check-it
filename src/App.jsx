
import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Check-It (ToolStack) — logic-first build (no Tailwind required yet)
 * Features:
 * - Sections + items
 * - Delete section (in-app confirm)
 * - Reorder items via drag & drop (within a section)
 * - Due date per item + overdue flag
 * - Export/Import JSON
 */

const LS_KEY = "toolstack_checkit_v1";
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

function ConfirmModal({ open, title, message, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div style={styles.modalBackdrop}>
      <div style={styles.modalCard}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>{title}</div>
        <div style={{ marginTop: 8, color: "#444" }}>{message}</div>
        <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onCancel} style={styles.btn}>Cancel</button>
          <button onClick={onConfirm} style={{ ...styles.btn, background: "#d33", color: "white" }}>Delete</button>
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
    if (data?.sections && Array.isArray(data.sections)) return data.sections;
    return base;
  });

  const [confirm, setConfirm] = useState({ open: false, sectionId: null });
  const dragRef = useRef({ sectionId: null, fromIndex: null });

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify({ title, sections }));
  }, [title, sections]);

  const totals = useMemo(() => {
    let total = 0, done = 0, overdue = 0;
    const t = todayISO();
    for (const s of sections) {
      for (const it of (s.items || [])) {
        total += 1;
        if (it.done) done += 1;
        if (!it.done && it.dueDate && it.dueDate < t) overdue += 1;
      }
    }
    return { total, done, left: Math.max(0, total - done), overdue };
  }, [sections]);

  const addSection = () => {
    setSections(prev => [...prev, { id: uid(), name: `Section ${prev.length + 1}`, items: [] }]);
  };

  const renameSection = (id, name) => {
    setSections(prev => prev.map(s => s.id === id ? { ...s, name } : s));
  };

  const requestDeleteSection = (sectionId) => {
    if (sections.length === 1) return;
    setConfirm({ open: true, sectionId });
  };

  const deleteSectionNow = () => {
    const id = confirm.sectionId;
    setSections(prev => prev.filter(s => s.id !== id));
    setConfirm({ open: false, sectionId: null });
  };

  const addItem = (sectionId) => {
    setSections(prev => prev.map(s => (
      s.id === sectionId
        ? { ...s, items: [...(s.items || []), { id: uid(), text: "New item", done: false, dueDate: "" }] }
        : s
    )));
  };

  const updateItem = (sectionId, itemId, patch) => {
    setSections(prev => prev.map(s => (
      s.id === sectionId
        ? { ...s, items: (s.items || []).map(it => it.id === itemId ? { ...it, ...patch } : it) }
        : s
    )));
  };

  const deleteItem = (sectionId, itemId) => {
    setSections(prev => prev.map(s => (
      s.id === sectionId
        ? { ...s, items: (s.items || []).filter(it => it.id !== itemId) }
        : s
    )));
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
    if (!parsed || !Array.isArray(parsed.sections)) return alert("Invalid JSON");
    setTitle(String(parsed.title || "Check-It"));
    setSections(parsed.sections);
  };

  const onDragStartItem = (sectionId, fromIndex) => (e) => {
    dragRef.current = { sectionId, fromIndex };
    try { e.dataTransfer.effectAllowed = "move"; } catch {}
  };
  const onDragOverItem = () => (e) => e.preventDefault();
  const onDropItem = (sectionId, toIndex) => (e) => {
    e.preventDefault();
    const { sectionId: fromSection, fromIndex } = dragRef.current || {};
    if (!fromSection || fromIndex == null) return;
    if (fromSection !== sectionId) return; // within section only
    setSections(prev => prev.map(s => (
      s.id === sectionId ? { ...s, items: arrayMove(s.items || [], fromIndex, toIndex) } : s
    )));
    dragRef.current = { sectionId: null, fromIndex: null };
  };

  return (
    <div style={styles.page}>
      <ConfirmModal
        open={confirm.open}
        title="Delete section?"
        message="This will delete the section and all its items."
        onCancel={() => setConfirm({ open: false, sectionId: null })}
        onConfirm={deleteSectionNow}
      />

      <div style={styles.header}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{title}</div>
          <div style={{ color: "#555", marginTop: 4 }}>
            {totals.left} left • {totals.done} done • {totals.total} total{totals.overdue ? ` • ${totals.overdue} overdue` : ""}
          </div>
        </div>

        <div style={styles.headerBtns}>
          <button style={styles.btn} onClick={addSection}>Add section</button>
          <button style={styles.btn} onClick={exportJSON}>Export</button>
          <label style={{ ...styles.btn, cursor: "pointer" }}>
            Import
            <input type="file" accept="application/json" style={{ display: "none" }}
              onChange={(e) => importJSON(e.target.files?.[0] || null)} />
          </label>
        </div>
      </div>

      <div style={styles.sections}>
        {sections.map((s) => (
          <div key={s.id} style={styles.card}>
            <div style={styles.cardHeader}>
              <input
                value={s.name}
                onChange={(e) => renameSection(s.id, e.target.value)}
                style={styles.sectionName}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button style={styles.btn} onClick={() => addItem(s.id)}>Add item</button>
                <button
                  style={{ ...styles.btn, background: sections.length === 1 ? "#eee" : "#ffd6d6" }}
                  onClick={() => requestDeleteSection(s.id)}
                  disabled={sections.length === 1}
                  title={sections.length === 1 ? "Keep at least one section" : "Delete section"}
                >
                  Delete
                </button>
              </div>
            </div>

            <div style={{ padding: 12 }}>
              {(s.items || []).length ? (
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
                  {s.items.map((it, idx) => {
                    const overdue = !it.done && it.dueDate && it.dueDate < todayISO();
                    return (
                      <li
                        key={it.id}
                        style={{ ...styles.itemRow, background: overdue ? "#ffecec" : "white" }}
                        onDragOver={onDragOverItem()}
                        onDrop={onDropItem(s.id, idx)}
                      >
                        <button
                          draggable
                          onDragStart={onDragStartItem(s.id, idx)}
                          style={styles.handle}
                          title="Drag to reorder"
                        >
                          ≡
                        </button>

                        <input
                          type="checkbox"
                          checked={!!it.done}
                          onChange={(e) => updateItem(s.id, it.id, { done: e.target.checked })}
                          style={{ transform: "scale(1.2)" }}
                        />

                        <input
                          value={it.text}
                          onChange={(e) => updateItem(s.id, it.id, { text: e.target.value })}
                          style={{ ...styles.textInput, textDecoration: it.done ? "line-through" : "none", color: it.done ? "#777" : "#111" }}
                        />

                        <input
                          type="date"
                          value={it.dueDate || ""}
                          onChange={(e) => updateItem(s.id, it.id, { dueDate: e.target.value })}
                          style={styles.dateInput}
                        />

                        <button style={styles.xBtn} onClick={() => deleteItem(s.id, it.id)} title="Delete item">✕</button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div style={{ color: "#666" }}>No items yet. Click “Add item”.</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles = {
  page: { maxWidth: 1000, margin: "0 auto", padding: 18, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" },
  header: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 14 },
  headerBtns: { display: "flex", gap: 8, flexWrap: "wrap" },
  sections: { display: "grid", gap: 12 },
  card: { border: "1px solid #ddd", borderRadius: 14, background: "white", overflow: "hidden" },
  cardHeader: { padding: 12, borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" },
  sectionName: { fontSize: 18, fontWeight: 700, border: "1px solid #eee", borderRadius: 10, padding: "8px 10px", width: "100%", maxWidth: 420 },
  btn: { border: "1px solid #ddd", borderRadius: 10, padding: "8px 10px", background: "white" },
  itemRow: { border: "1px solid #eee", borderRadius: 12, padding: 10, display: "grid", gridTemplateColumns: "40px 30px 1fr 160px 40px", gap: 10, alignItems: "center" },
  handle: { border: "1px solid #ddd", borderRadius: 10, background: "white", height: 34, width: 34, cursor: "grab" },
  textInput: { border: "1px solid #eee", borderRadius: 10, padding: "8px 10px", width: "100%" },
  dateInput: { border: "1px solid #eee", borderRadius: 10, padding: "8px 10px" },
  xBtn: { border: "1px solid #ddd", borderRadius: 10, background: "white", height: 34, width: 34, cursor: "pointer" },
  modalBackdrop: { position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
  modalCard: { width: "100%", maxWidth: 420, background: "white", borderRadius: 14, border: "1px solid #ddd", padding: 16 },
};
