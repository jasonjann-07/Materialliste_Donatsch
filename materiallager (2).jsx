import { useState, useEffect, useCallback, useRef } from 'react';
import {
import { supabase } from './supabase';
  Check, X, Plus, Trash2, Package, Loader2, ClipboardList,
  History, Boxes, ShoppingCart, User, AlertTriangle, Pencil,
} from 'lucide-react';

const ITEMS_KEY = 'lager-items-v2';
const HISTORY_KEY = 'lager-history-v2';
const USER_KEY = 'lager-username';

const STARTER_ITEMS = [
  ['Kugelschreiber Rot', 'Papeterie Schmid'],
  ['Kugelschreiber Blau', 'Papeterie Schmid'],
  ['Kugelschreiber Schwarz', 'Papeterie Schmid'],
  ['Klarsichtfolie zum Binden', 'Papeterie Schmid'],
  ['Schwarzes Bindeblatt', 'Papeterie Schmid'],
  ['Edding Schwarz', 'Papeterie Schmid'],
  ['Leuchtstift Blau', 'Papeterie Schmid'],
  ['Leuchtstift Gelb', 'Papeterie Schmid'],
  ['Leuchtstift Grün', 'Papeterie Schmid'],
  ['Gehefteter A5-Block', 'Papeterie Schmid'],
  ['Klebestreifen', 'Papeterie Schmid'],
  null,
  ['Pasteurisierte Milch', 'Lidl'],
  ['Rahm', 'Lidl'],
  ['Himbeersirup', 'Lidl'],
  null,
  ['Kaffeebohnen', 'Lidl'],
  ['Kaffeemaschinenfilter', 'Jura'],
  ['Entkalkungstabletten', 'Jura'],
  ['Reinigungstabletten', 'Jura'],
  null,
  ['Servietten', 'Lidl'],
  ['WC-Papier', 'Lidl'],
  ['Haushaltspapier', 'Lidl'],
  ['Handseifen-Nachfüllbeutel', 'Lidl'],
  null,
  ['Geschirrspülpulver', 'Lidl'],
  ['Geschirrspülmittel', 'Lidl'],
  ['Feinkörniges Regeneriersalz', 'Lidl'],
  null,
  ['Kehrichtsäcke 35 l', 'Lidl'],
  ['Rote Kehrichtsäcke 60 l', 'Lidl'],
  null,
  ['Zucker', 'Lidl'],
].map((row, i) =>
  row
    ? { id: 'seed-' + i, name: row[0], source: row[1], status: 'ok', divider: false }
    : { id: 'seed-' + i, divider: true }
);

// Reihenfolge der drei Status beim Anklicken: DA -> WENIG VORHANDEN -> FEHLT -> DA ...
const nextStatusOf = (s) => (s === 'ok' ? 'low' : s === 'low' ? 'missing' : 'ok');
const STATUS_LABEL = { ok: 'DA', low: 'WENIG', missing: 'FEHLT' };
const STATUS_ACTION_LABEL = {
  ok: 'auf DA gesetzt',
  low: 'auf WENIG VORHANDEN gesetzt',
  missing: 'auf FEHLT gesetzt',
};

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.floor(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.floor(h / 24);
  return `vor ${d} Tag${d > 1 ? 'en' : ''}`;
}

// Formatiert einen Zeitstempel als absolutes Datum + Uhrzeit (z.B. 28.08.2026 14:37)
function formatDateTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function MaterialLager() {
  const [items, setItems] = useState([]);
  const [history, setHistory] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('lager');
  const [user, setUser] = useState(null);
  const [nameInput, setNameInput] = useState('');
  const [newName, setNewName] = useState('');
  const [newSource, setNewSource] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameEditValue, setNameEditValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const nameFieldRef = useRef(null);
  // Verhindert, dass der automatische 5-Sekunden-Sync mitten in einer eigenen
  // Änderung (speichern + neu laden) den lokalen Stand überschreibt.
  const mutatingRef = useRef(false);
  // Zählt, wie viele Hintergrund-Syncs gerade laufen (für schnelle Klicks
  // können mehrere gleichzeitig unterwegs sein, bevor sie fertig sind).
  const pendingSyncCountRef = useRef(0);
  // Warteschlange: sorgt dafür, dass die eigentlichen Speichervorgänge (laden
  // -> ändern -> speichern -> neu laden) IMMER nacheinander ablaufen, auch
  // wenn der Benutzer sehr schnell mehrfach klickt. So liest jede Änderung
  // garantiert den Stand, den die vorherige Änderung tatsächlich gespeichert
  // hat - nichts wird durch überholende Hintergrund-Syncs zurückgesetzt.
  const syncQueueRef = useRef(Promise.resolve());

  // Lädt die aktuellsten Materialien direkt aus dem Shared Storage.
  // Gibt null zurück, falls (noch) nichts gespeichert ist oder ein Fehler auftritt.
  const loadItemsFromStorage = useCallback(async () => {
  const { data, error } = await supabase
    .from('items')
    .select('*');

  if (error) {
    console.error(error);
    return null;
  }

  return data;
}, []);

  // Lädt den aktuellsten Verlauf direkt aus dem Shared Storage.
  const loadHistoryFromStorage = useCallback(async () => {
    try {
      const res = await window.storage.get(HISTORY_KEY, true);
      return res && res.value ? JSON.parse(res.value) : null;
    } catch (e) {
      return null;
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(USER_KEY, false);
        if (res && res.value) setUser(res.value);
      } catch (e) {
        // kein Name gesetzt
      }
      const freshItems = await loadItemsFromStorage();
      setItems(freshItems ?? STARTER_ITEMS);
      const freshHistory = await loadHistoryFromStorage();
      if (freshHistory) setHistory(freshHistory);
      setLoaded(true);
    })();
  }, [loadItemsFromStorage, loadHistoryFromStorage]);

  // Automatischer Sync alle 5 Sekunden, damit mehrere gleichzeitig geöffnete
  // Geräte den gleichen Stand sehen. Pausiert während eine eigene Änderung läuft.
  useEffect(() => {
    const interval = setInterval(async () => {
      if (mutatingRef.current) return;
      const freshItems = await loadItemsFromStorage();
      if (freshItems) setItems(freshItems);
      const freshHistory = await loadHistoryFromStorage();
      if (freshHistory) setHistory(freshHistory);
    }, 5000);
    return () => clearInterval(interval);
  }, [loadItemsFromStorage, loadHistoryFromStorage]);

  // Hängt einen neuen Verlaufseintrag an - lädt vorher ebenfalls den neusten
  // Stand, damit Einträge anderer Benutzer nicht überschrieben werden.
  const appendHistory = useCallback(async (entryPartial) => {
    const freshHistory = (await loadHistoryFromStorage()) ?? [];
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      ts: Date.now(),
      ...entryPartial,
    };
    const next = [entry, ...freshHistory].slice(0, 300);
    try {
      await window.storage.set(HISTORY_KEY, JSON.stringify(next), true);
    } catch (e) {
      console.error('History speichern fehlgeschlagen', e);
    }
    setHistory(next);
  }, [loadHistoryFromStorage]);

  // Zentrale Funktion für JEDE Änderung an der Materialliste (Status ändern,
  // hinzufügen, löschen).
  //
  // "mutator" ist eine reine Funktion (list) => neueListe. Sie wird ZWEIMAL
  // aufgerufen: einmal sofort auf den lokalen Stand (optimistisches Update)
  // und einmal später im Hintergrund auf den frisch geladenen Storage-Stand.
  // Dadurch berechnet sich z.B. der nächste Status immer relativ zum
  // jeweils aktuellen Item-Status in genau der Liste, die gerade verarbeitet
  // wird - und nie anhand eines veralteten Werts von vor einem Klick.
  //
  // "buildHistoryEntry(list)" ist optional und liefert den Verlaufseintrag
  // anhand der tatsächlich gespeicherten Liste (nicht anhand des Klick-
  // Zeitpunkts), damit die Beschreibung im Verlauf immer korrekt ist.
  //
  // Ablauf:
  // 1) SOFORT lokal anzeigen (optimistisches Update), damit die Oberfläche
  //    ohne spürbare Wartezeit reagiert.
  // 2) Der eigentliche Sync (laden -> ändern -> speichern -> neu laden) wird
  //    an eine Warteschlange angehängt, statt sofort zu starten. So laufen
  //    bei schnellem Mehrfachklicken die Hintergrund-Syncs garantiert
  //    NACHEINANDER ab - jeder liest den Stand, den der vorherige tatsächlich
  //    gespeichert hat. Ohne diese Warteschlange könnten sich zwei parallele
  //    Speichervorgänge überholen und die Anzeige auf einen älteren Stand
  //    zurücksetzen.
  const mutateItems = useCallback((mutator, buildHistoryEntry) => {
    // 1) Optimistisches Update: sofort sichtbar, basiert auf dem jeweils
    // neuesten lokalen Stand (auch wenn kurz zuvor bereits optimistisch
    // geändert wurde) - dadurch bauen schnelle Klicks korrekt aufeinander auf.
    setItems((current) => mutator(current));

    pendingSyncCountRef.current += 1;
    mutatingRef.current = true;
    setSaving(true);

    // 2) Den eigentlichen Sync-Schritt an die Warteschlange anhängen, statt
    // ihn parallel zu vorherigen, noch laufenden Syncs zu starten.
    const runSync = async () => {
      let reloaded = null;
      try {
        const fresh = (await loadItemsFromStorage()) ?? items;
        const next = mutator(fresh);
        try {
          await window.storage.set(ITEMS_KEY, JSON.stringify(next), true);
        } catch (e) {
          console.error('Speichern fehlgeschlagen', e);
        }
        if (buildHistoryEntry) {
          const entry = buildHistoryEntry(next);
          if (entry) await appendHistory(entry);
        }
        reloaded = (await loadItemsFromStorage()) ?? next;
      } finally {
        pendingSyncCountRef.current -= 1;
        // WICHTIG: Nur wenn dies der LETZTE noch wartende Sync in der
        // Warteschlange ist, wird die Anzeige mit dem Storage-Stand
        // überschrieben. Würde jeder Zwischenschritt die Anzeige
        // überschreiben, käme kurzzeitig wieder ein älterer Stand zum
        // Vorschein (z.B. "WENIG" statt "FEHLT"), bevor der nächste,
        // bereits wartende Klick nachzieht - genau das sichtbare
        // "Zurückspringen" bei schnellem Mehrfachklicken.
        if (pendingSyncCountRef.current <= 0) {
          pendingSyncCountRef.current = 0;
          if (reloaded) setItems(reloaded);
          setSaving(false);
          mutatingRef.current = false;
        }
      }
    };
    // An die Kette anhängen: startet erst, wenn alle vorherigen Syncs fertig sind.
    syncQueueRef.current = syncQueueRef.current.then(runSync, runSync);
  }, [items, loadItemsFromStorage, appendHistory]);

  const saveUser = async () => {
    if (!nameInput.trim()) return;
    const name = nameInput.trim();
    setUser(name);
    try {
      await window.storage.set(USER_KEY, name, false);
    } catch (e) {
      console.error('Name speichern fehlgeschlagen', e);
    }
  };

  // Öffnet das kleine Eingabefeld im Kopfbereich, um den eigenen Namen zu ändern.
  const startEditName = () => {
    setNameEditValue(user || '');
    setEditingName(true);
  };

  // Speichert den geänderten Namen. Bereits bestehende Verlaufseinträge
  // behalten den alten Namen, da dieser jeweils zum Zeitpunkt der Änderung
  // fest in den Eintrag geschrieben wird.
  const saveNameEdit = async () => {
    if (!nameEditValue.trim()) return;
    const name = nameEditValue.trim();
    setUser(name);
    setEditingName(false);
    try {
      await window.storage.set(USER_KEY, name, false);
    } catch (e) {
      console.error('Name speichern fehlgeschlagen', e);
    }
  };

  const addItem = () => {
    if (!newName.trim()) return;
    const item = {
      id: Date.now().toString(36),
      name: newName.trim(),
      source: newSource.trim() || '—',
      status: 'ok',
      divider: false,
    };
    mutateItems(
      (list) => [...list, item],
      () => ({ user: user || 'Unbekannt', action: 'hinzugefügt', material: item.name })
    );
    setNewName('');
    setNewSource('');
    nameFieldRef.current?.focus();
  };

  // Wechselt den Status eines Materials in der Reihenfolge DA -> WENIG -> FEHLT -> DA.
  // Wichtig: der nächste Status wird INNERHALB des Mutators berechnet, jeweils
  // relativ zum Status in der Liste, die gerade verarbeitet wird (einmal die
  // optimistische, einmal die frisch geladene). So liefert auch schnelles
  // Mehrfachklicken immer den korrekten nächsten Status statt zurückzuspringen.
  const toggleStatus = (id) => {
    mutateItems(
      (list) => list.map((x) => (x.id === id ? { ...x, status: nextStatusOf(x.status) } : x)),
      (list) => {
        const it = list.find((x) => x.id === id);
        return it ? { user: user || 'Unbekannt', action: STATUS_ACTION_LABEL[it.status], material: it.name } : null;
      }
    );
  };

  // Öffnet den Bestätigungsdialog statt sofort zu löschen.
  const requestRemove = (id) => setConfirmDeleteId(id);
  const cancelRemove = () => setConfirmDeleteId(null);

  // Löscht erst NACH Bestätigung im Dialog.
  const confirmRemove = () => {
    const id = confirmDeleteId;
    const it = items.find((x) => x.id === id);
    setConfirmDeleteId(null);
    if (!it) return;
    mutateItems(
      (list) => list.filter((x) => x.id !== id),
      () => ({ user: user || 'Unbekannt', action: 'gelöscht', material: it.name })
    );
  };

  const realItems = items.filter((it) => !it.divider);
  const okCount = realItems.filter((it) => it.status === 'ok').length;
  const lowCount = realItems.filter((it) => it.status === 'low').length;
  const missingCount = realItems.filter((it) => it.status === 'missing').length;
  // Auf der Einkaufsliste erscheinen sowohl FEHLT als auch WENIG VORHANDEN.
  const purchaseItems = realItems.filter((it) => it.status === 'missing' || it.status === 'low');
  // Gruppiert die Einkaufsliste nach Einkaufsort für die Anzeige.
  const groupedPurchase = purchaseItems.reduce((acc, it) => {
    const key = it.source || '—';
    if (!acc[key]) acc[key] = [];
    acc[key].push(it);
    return acc;
  }, {});
  const itemBeingDeleted = confirmDeleteId ? items.find((x) => x.id === confirmDeleteId) : null;

  if (!loaded) {
    return (
      <div className="lk-root">
        <style>{baseStyles}</style>
        <div className="lk-loading">
          <Loader2 size={18} className="lk-spin" /> Lade Lagerdaten…
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="lk-root">
        <style>{baseStyles}</style>
        <div className="lk-namegate">
          <div className="lk-namegate-card">
            <p className="lk-eyebrow">Lagerkontrolle · Lehrlinge</p>
            <h1 className="lk-title" style={{ marginBottom: 14 }}>Wie heisst du?</h1>
            <p style={{ fontSize: 13, color: 'var(--navy-dim)', marginTop: 0 }}>
              Dein Name wird bei Änderungen im Verlauf mitgespeichert.
            </p>
            <input
              autoFocus
              className="lk-namegate-input"
              placeholder="Vorname"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveUser()}
            />
            <button className="lk-addbtn" style={{ marginTop: 10, width: '100%', justifyContent: 'center' }} onClick={saveUser}>
              Weiter
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lk-root">
      <style>{baseStyles}</style>
      <div className="lk-wrap">
        <div className="lk-titleblock">
          <div className="lk-titleblock-main">
            <p className="lk-eyebrow">Stückliste · Lagerkontrolle</p>
            <h1 className="lk-title">Donatsch Materialmanagement</h1>
          </div>
          <div className="lk-titleblock-meta">
            <div className="lk-meta-row">
              <User size={12} />
              {editingName ? (
                <>
                  <input
                    autoFocus
                    className="lk-name-edit-input"
                    value={nameEditValue}
                    onChange={(e) => setNameEditValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveNameEdit()}
                  />
                  <button className="lk-name-edit-btn" onClick={saveNameEdit} title="Speichern">
                    <Check size={12} />
                  </button>
                </>
              ) : (
                <>
                  <span>{user}</span>
                  <button className="lk-name-edit-btn" onClick={startEditName} title="Name ändern">
                    <Pencil size={11} />
                  </button>
                </>
              )}
            </div>
            <div className="lk-meta-row">
              <span className="lk-meta-label">Stand</span>
              <span>{new Date().toLocaleDateString('de-CH')}</span>
            </div>
          </div>
        </div>

        <div className="lk-tabs">
          <button className={`lk-tab ${tab === 'lager' ? 'active' : ''}`} onClick={() => setTab('lager')}>
            <Boxes size={15} /> Lager
          </button>
          <button className={`lk-tab ${tab === 'einkauf' ? 'active' : ''}`} onClick={() => setTab('einkauf')}>
            <ShoppingCart size={15} /> Einkaufsliste
            {purchaseItems.length > 0 && <span className="lk-badge">{purchaseItems.length}</span>}
          </button>
          <button className={`lk-tab ${tab === 'verlauf' ? 'active' : ''}`} onClick={() => setTab('verlauf')}>
            <History size={15} /> Verlauf
          </button>
        </div>

        {tab === 'lager' && (
          <>
            <div className="lk-addbar">
              <input
                ref={nameFieldRef}
                className="lk-name"
                placeholder="Neues Material…"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addItem()}
              />
              <input
                className="lk-source"
                placeholder="Einkaufsort"
                value={newSource}
                onChange={(e) => setNewSource(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addItem()}
              />
              <button className="lk-addbtn" onClick={addItem}>
                <Plus size={16} /> <span className="lk-addbtn-label">Hinzufügen</span>
              </button>
            </div>

            <div className="lk-list">
              {realItems.length === 0 ? (
                <div className="lk-empty">Noch keine Materialien erfasst.</div>
              ) : (
                items.map((it) =>
                  it.divider ? (
                    <div key={it.id} className="lk-divider" />
                  ) : (
                    <div
                      key={it.id}
                      className={`lk-row ${it.status === 'missing' ? 'is-missing' : it.status === 'low' ? 'is-low' : ''}`}
                    >
                      <span className="lk-name-cell">{it.name}</span>
                      <button
                        className={`lk-status-btn ${it.status}`}
                        onClick={() => toggleStatus(it.id)}
                        title={STATUS_LABEL[it.status]}
                      >
                        {it.status === 'ok' && (<><Check size={13} /> DA</>)}
                        {it.status === 'low' && (<><AlertTriangle size={13} /> WENIG</>)}
                        {it.status === 'missing' && (<><X size={13} /> FEHLT</>)}
                      </button>
                      <button className="lk-del" onClick={() => requestRemove(it.id)} title="Löschen">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )
                )
              )}
            </div>

            <div className="lk-summary">
              <div className="lk-pill ok">
                vorhanden <b>{okCount}</b>
              </div>
              <div className="lk-pill low">
                wenig <b>{lowCount}</b>
              </div>
              <div className="lk-pill missing">
                fehlt <b>{missingCount}</b>
              </div>
            </div>
          </>
        )}

        {tab === 'einkauf' && (
          <div className="lk-shopping">
            <div className="lk-shopping-head">
              <span className="lk-shopping-title">
                <Package size={16} /> Einkaufsliste ({purchaseItems.length})
              </span>
            </div>
            {purchaseItems.length === 0 ? (
              <p className="lk-muted">Aktuell fehlt nichts.</p>
            ) : (
              Object.entries(groupedPurchase).map(([source, list]) => (
                <div key={source} className="lk-shopping-group">
                  <div className="lk-shopping-source-header">{source}</div>
                  <div className="lk-shopping-list">
                    {list.map((it) => (
                      <div
                        key={it.id}
                        className={`lk-shopping-item ${it.status === 'low' ? 'is-low' : 'is-missing'}`}
                      >
                        <span className="lk-shopping-name">{it.name}</span>
                        <span className={`lk-shopping-status ${it.status}`}>
                          {it.status === 'low' ? 'WENIG VORHANDEN' : 'FEHLT'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'verlauf' && (
          <div className="lk-history">
            {history.length === 0 ? (
              <p className="lk-muted">Noch keine Änderungen protokolliert.</p>
            ) : (
              history.map((h) => (
                <div key={h.id} className="lk-history-row">
                  <ClipboardList size={14} className="lk-history-icon" />
                  <div className="lk-history-body">
                    <div className="lk-history-text">
                      <span className="lk-history-user">{h.user}</span> hat{' '}
                      <span className="lk-history-material">{h.material}</span> {h.action}
                    </div>
                    <div className="lk-history-meta">
                      <span>{timeAgo(h.ts)}</span>
                      <span className="lk-history-dot">·</span>
                      <span>{formatDateTime(h.ts)}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        <div className="lk-saving">
          {saving && (
            <>
              <Loader2 size={12} className="lk-spin" /> speichert…
            </>
          )}
        </div>
      </div>

      {itemBeingDeleted && (
        <div className="lk-modal-overlay">
          <div className="lk-modal-card">
            <p className="lk-modal-text">
              <strong>{itemBeingDeleted.name}</strong> wirklich löschen?
            </p>
            <div className="lk-modal-actions">
              <button className="lk-modal-cancel" onClick={cancelRemove}>Abbrechen</button>
              <button className="lk-modal-confirm" onClick={confirmRemove}>Löschen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const baseStyles = `
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap');

  .lk-root {
    --navy: #1B3A5C;
    --navy-dim: #4C6B87;
    --paper: #F6F8FA;
    --line: #C7D3DD;
    --ok: #2F6B4F;
    --ok-bg: #E6F0EA;
    --low: #B8791A;
    --low-bg: #FDF1DE;
    --missing: #B23A20;
    --missing-bg: #FBEAE5;
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    color: var(--navy);
    background:
      linear-gradient(var(--paper), var(--paper)),
      repeating-linear-gradient(0deg, rgba(27,58,92,0.05) 0 1px, transparent 1px 28px),
      repeating-linear-gradient(90deg, rgba(27,58,92,0.05) 0 1px, transparent 1px 28px);
    min-height: 100vh;
    padding: 20px 12px 60px;
    box-sizing: border-box;
    position: relative;
  }
  .lk-wrap { max-width: 720px; margin: 0 auto; }
  .lk-loading, .lk-namegate {
    display: flex; align-items: center; justify-content: center; min-height: 70vh;
    font-family: 'IBM Plex Mono', monospace; font-size: 13px; color: var(--navy-dim);
  }
  .lk-namegate-card {
    background: #fff; border: 2px solid var(--navy); padding: 24px;
    max-width: 320px; width: 100%; box-shadow: 3px 3px 0 rgba(27,58,92,0.15);
  }
  .lk-namegate-input {
    width: 100%; box-sizing: border-box; border: 1px solid var(--line);
    padding: 10px; font-size: 14px; font-family: 'IBM Plex Sans', sans-serif;
    background: var(--paper); color: var(--navy); margin-top: 12px;
  }

  .lk-titleblock {
    border: 2px solid var(--navy); background: #fff;
    display: grid; grid-template-columns: 1fr auto;
    box-shadow: 3px 3px 0 rgba(27,58,92,0.15);
  }
  .lk-titleblock-main { padding: 14px 16px; border-right: 1px solid var(--line); }
  .lk-eyebrow {
    font-family: 'IBM Plex Mono', monospace; font-size: 10px; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--navy-dim); margin: 0 0 4px;
  }
  .lk-title { font-size: 20px; font-weight: 700; margin: 0; }
  .lk-titleblock-meta {
    padding: 14px 16px; font-family: 'IBM Plex Mono', monospace; font-size: 11px;
    display: flex; flex-direction: column; justify-content: center; gap: 6px; min-width: 120px;
  }
  .lk-meta-row { display: flex; align-items: center; gap: 6px; justify-content: flex-end; }
  .lk-meta-label { color: var(--navy-dim); }
  .lk-name-edit-input {
    width: 64px; font-family: 'IBM Plex Mono', monospace; font-size: 11px;
    border: 1px solid var(--line); padding: 2px 4px; background: var(--paper); color: var(--navy);
  }
  .lk-name-edit-btn {
    background: none; border: none; cursor: pointer; color: var(--navy-dim);
    display: flex; align-items: center; padding: 2px;
  }
  .lk-name-edit-btn:hover { color: var(--navy); }

  .lk-tabs { display: flex; gap: 4px; margin-top: 14px; border-bottom: 2px solid var(--navy); }
  .lk-tab {
    flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
    background: #fff; border: 1px solid var(--line); border-bottom: none;
    padding: 10px 8px; font-size: 12px; font-weight: 600; font-family: 'IBM Plex Sans', sans-serif;
    color: var(--navy-dim); cursor: pointer; position: relative;
  }
  .lk-tab.active { color: var(--navy); background: var(--paper); border-color: var(--navy); }
  .lk-badge {
    background: var(--missing); color: #fff; font-size: 10px; font-family: 'IBM Plex Mono', monospace;
    border-radius: 10px; padding: 1px 6px; margin-left: 2px;
  }

  .lk-addbar {
    margin-top: 14px; display: flex; gap: 8px; background: #fff; border: 1px solid var(--line); padding: 10px;
    flex-wrap: wrap;
  }
  .lk-addbar input {
    font-family: 'IBM Plex Sans', sans-serif; border: 1px solid var(--line);
    padding: 9px 10px; font-size: 14px; background: var(--paper); color: var(--navy);
  }
  .lk-addbar .lk-name { flex: 2; min-width: 140px; }
  .lk-addbar .lk-source { flex: 1; min-width: 110px; }
  .lk-addbtn {
    display: flex; align-items: center; gap: 6px; background: var(--navy); color: #fff;
    border: none; padding: 9px 14px; font-weight: 600; font-size: 14px; cursor: pointer;
  }
  .lk-addbtn:hover { background: #142c46; }

  .lk-list { margin-top: 14px; border: 1px solid var(--navy); background: #fff; }
  .lk-row {
    display: grid; grid-template-columns: 1fr 90px 36px; align-items: center;
    padding: 11px 10px; border-top: 1px solid var(--line); font-size: 14px; gap: 6px;
  }
  .lk-list > .lk-row:first-child { border-top: none; }
  .lk-row.is-missing { background: var(--missing-bg); }
  .lk-row.is-low { background: var(--low-bg); }
  .lk-name-cell { font-weight: 500; }
  .lk-divider { height: 10px; background: var(--paper); border-top: 1px dashed var(--line); border-bottom: 1px dashed var(--line); }
  .lk-status-btn {
    display: flex; align-items: center; justify-content: center; gap: 4px;
    border: 1px solid var(--line); background: #fff; padding: 6px 6px; font-size: 11px;
    font-weight: 600; cursor: pointer; font-family: 'IBM Plex Mono', monospace;
  }
  .lk-status-btn.ok { color: var(--ok); border-color: var(--ok); background: var(--ok-bg); }
  .lk-status-btn.low { color: var(--low); border-color: var(--low); background: var(--low-bg); }
  .lk-status-btn.missing { color: var(--missing); border-color: var(--missing); background: var(--missing-bg); }
  .lk-del { background: none; border: none; cursor: pointer; color: #b0bcc7; display: flex; align-items: center; justify-content: center; }
  .lk-del:hover { color: var(--missing); }
  .lk-empty, .lk-muted { padding: 24px; text-align: center; color: var(--navy-dim); font-size: 13px; }

  .lk-summary { display: flex; gap: 10px; margin-top: 14px; flex-wrap: wrap; }
  .lk-pill { font-family: 'IBM Plex Mono', monospace; font-size: 12px; padding: 6px 12px; border: 1px solid var(--line); background: #fff; }
  .lk-pill b { font-size: 14px; }
  .lk-pill.ok b { color: var(--ok); }
  .lk-pill.low b { color: var(--low); }
  .lk-pill.missing b { color: var(--missing); }

  .lk-shopping { margin-top: 14px; border: 2px dashed var(--missing); background: #fff; padding: 14px 16px; }
  .lk-shopping-head { margin-bottom: 10px; }
  .lk-shopping-title { font-weight: 700; font-size: 15px; display: flex; align-items: center; gap: 8px; }
  .lk-shopping-group { margin-bottom: 16px; }
  .lk-shopping-group:last-child { margin-bottom: 0; }
  .lk-shopping-source-header {
    font-family: 'IBM Plex Mono', monospace; font-weight: 700; font-size: 12px;
    text-transform: uppercase; letter-spacing: 0.06em; color: var(--navy-dim);
    border-bottom: 1px solid var(--line); padding-bottom: 4px; margin-bottom: 8px;
  }
  .lk-shopping-list { display: flex; flex-direction: column; gap: 8px; }
  .lk-shopping-item {
    font-family: 'IBM Plex Mono', monospace; font-size: 13px;
    display: flex; justify-content: space-between; gap: 10px;
    border-bottom: 1px dotted var(--line); padding-bottom: 6px;
  }
  .lk-shopping-status.missing { color: var(--missing); font-weight: 600; }
  .lk-shopping-status.low { color: var(--low); font-weight: 600; }

  .lk-history { margin-top: 14px; border: 1px solid var(--navy); background: #fff; }
  .lk-history-row {
    display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px;
    border-top: 1px solid var(--line); font-size: 13px;
  }
  .lk-history-row:first-child { border-top: none; }
  .lk-history-icon { color: var(--navy-dim); flex-shrink: 0; margin-top: 2px; }
  .lk-history-body { flex: 1; }
  .lk-history-text { }
  .lk-history-user { font-weight: 700; }
  .lk-history-material { font-style: italic; }
  .lk-history-meta {
    font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--navy-dim);
    margin-top: 3px; display: flex; gap: 6px; flex-wrap: wrap;
  }
  .lk-history-dot { opacity: 0.6; }

  .lk-saving {
    font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--navy-dim);
    display: flex; align-items: center; gap: 5px; margin-top: 10px; height: 14px;
  }
  .lk-spin { animation: lk-spin 0.8s linear infinite; }
  @keyframes lk-spin { to { transform: rotate(360deg); } }

  .lk-modal-overlay {
    position: fixed; inset: 0; background: rgba(27,58,92,0.35);
    display: flex; align-items: center; justify-content: center; z-index: 50; padding: 16px;
  }
  .lk-modal-card {
    background: #fff; border: 2px solid var(--navy); padding: 20px;
    max-width: 320px; width: 100%; box-shadow: 3px 3px 0 rgba(27,58,92,0.15);
  }
  .lk-modal-text { margin: 0; font-size: 14px; }
  .lk-modal-actions { display: flex; gap: 8px; margin-top: 16px; }
  .lk-modal-cancel {
    flex: 1; padding: 9px; border: 1px solid var(--line); background: #fff;
    cursor: pointer; font-weight: 600; font-family: 'IBM Plex Sans', sans-serif;
  }
  .lk-modal-confirm {
    flex: 1; padding: 9px; border: none; background: var(--missing); color: #fff;
    cursor: pointer; font-weight: 600; font-family: 'IBM Plex Sans', sans-serif;
  }

  @media (max-width: 480px) {
    .lk-addbtn-label { display: none; }
    .lk-title { font-size: 17px; }
    .lk-row { grid-template-columns: 1fr 78px 32px; }
  }
`;
