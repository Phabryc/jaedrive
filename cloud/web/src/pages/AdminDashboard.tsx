import { useEffect, useState } from "react";
import { AppShell } from "../components/AppShell";
import { Button } from "../components/Button";
import { api, type Profile } from "../lib/api";
import { IconCopy } from "../components/icons";
import { useLanguage } from "../lib/i18n/LanguageContext";

interface AdminStats {
  totalUsers: number;
  activeSubscriptions: number;
  headunits: number;
  totalTrips: number;
}

interface DiscountCode {
  id: string;
  code: string;
  discountType: string;
  value: number;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  isGlobal: boolean;
  assignedEmail: string | null;
  createdAt: string;
}

function generateRandomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export default function AdminDashboard() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<"users" | "codes" | "stats">("users");

  // Users state
  const [users, setUsers] = useState<Profile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(true);

  // Selected user for modal
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [modalStatus, setModalStatus] = useState<"FREE" | "PREMIUM">("PREMIUM");
  const [modalTier, setModalTier] = useState<"STANDARD" | "GARAGE">("STANDARD");
  const [modalExpiresAt, setModalExpiresAt] = useState<string>("");
  const [modalNotes, setModalNotes] = useState<string>("");
  const [updatingSub, setUpdatingSub] = useState(false);

  // Codes state
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [loadingCodes, setLoadingCodes] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newType, setNewType] = useState<"PERCENT" | "FIXED_AMOUNT" | "FREE_DAYS">("FREE_DAYS");
  const [newValue, setNewValue] = useState<number>(30);
  const [newMaxUses, setNewMaxUses] = useState<string>("");
  const [newEmail, setNewEmail] = useState("");
  const [creatingCode, setCreatingCode] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  function copyCode(codeToCopy: string) {
    if (!codeToCopy) return;
    navigator.clipboard.writeText(codeToCopy);
    setCopiedCode(codeToCopy);
    setTimeout(() => setCopiedCode(null), 2000);
  }

  // Stats state
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers(query = searchQuery) {
    setLoadingUsers(true);
    try {
      const u = await api.adminUsers(query);
      setUsers(u);
    } catch (err) {
      console.error("Failed to load admin users", err);
    } finally {
      setLoadingUsers(false);
    }
  }

  async function loadCodes() {
    setLoadingCodes(true);
    try {
      const c = await api.adminDiscountCodes();
      setCodes(c);
    } catch (err) {
      console.error("Failed to load discount codes", err);
    } finally {
      setLoadingCodes(false);
    }
  }

  async function loadStats() {
    setLoadingStats(true);
    try {
      const s = await api.adminStats();
      setStats(s);
    } catch (err) {
      console.error("Failed to load admin stats", err);
    } finally {
      setLoadingStats(false);
    }
  }

  useEffect(() => {
    if (activeTab === "codes") loadCodes();
    if (activeTab === "stats") loadStats();
  }, [activeTab]);

  function openSubModal(u: Profile) {
    setSelectedUser(u);
    setModalStatus(u.subscription?.status ?? "PREMIUM");
    setModalTier(u.subscription?.tier ?? "STANDARD");
    // Default 1 year from now if empty
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    setModalExpiresAt(u.subscription?.expiresAt ? new Date(u.subscription.expiresAt).toISOString().slice(0, 10) : nextYear.toISOString().slice(0, 10));
    setModalNotes("");
  }

  async function handleSaveSub() {
    if (!selectedUser) return;
    setUpdatingSub(true);
    try {
      await api.adminUpdateSubscription(selectedUser.id, {
        status: modalStatus,
        tier: modalTier,
        expiresAt: modalExpiresAt ? new Date(modalExpiresAt).toISOString() : null,
        notes: modalNotes,
      });
      setSelectedUser(null);
      await loadUsers();
    } catch (err) {
      alert("Errore nell'aggiornamento dell'abbonamento");
    } finally {
      setUpdatingSub(false);
    }
  }

  async function handleAddExtraSwap(userId: string) {
    try {
      await api.adminAddExtraSwap(userId);
      await loadUsers();
      alert("Concesso +1 cambio Headunit straordinario!");
    } catch {
      alert("Errore nell'aggiunta del cambio extra");
    }
  }

  async function handleToggleRole(u: Profile) {
    const newRole = u.role === "ADMIN" ? "USER" : "ADMIN";
    if (!confirm(`Sei sicuro di voler impostare il ruolo di ${u.email} a ${newRole}?`)) return;
    try {
      await api.adminUpdateRole(u.id, newRole);
      await loadUsers();
    } catch {
      alert("Errore nell'aggiornamento del ruolo");
    }
  }

  async function handleCreateCode(e: React.FormEvent) {
    e.preventDefault();
    const finalCode = newCode.trim() || generateRandomCode();
    setCreatingCode(true);
    try {
      await api.adminCreateDiscountCode({
        code: finalCode.toUpperCase(),
        discountType: newType,
        value: Number(newValue),
        maxUses: newMaxUses.trim() ? Number(newMaxUses) : null,
        isGlobal: !newEmail.trim(),
        assignedEmail: newEmail.trim() || null,
      });
      setNewCode("");
      setNewEmail("");
      setNewMaxUses("");
      await loadCodes();
    } catch {
      alert("Errore nella creazione del codice sconto");
    } finally {
      setCreatingCode(false);
    }
  }

  async function handleDeleteCode(id: string) {
    if (!confirm("Eliminare questo codice sconto?")) return;
    try {
      await api.adminDeleteDiscountCode(id);
      await loadCodes();
    } catch {
      alert("Errore nella cancellazione del codice");
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-6 text-2xl font-bold">Pannello Amministratore</h1>

        <div className="mb-6 flex border-b border-surface-border">
          <button
            onClick={() => setActiveTab("users")}
            className={`px-4 py-2 font-medium border-b-2 transition ${
              activeTab === "users"
                ? "border-accent text-accent"
                : "border-transparent text-onsurface-variant hover:text-onsurface"
            }`}
          >
            Utenti & Abbonamenti
          </button>
          <button
            onClick={() => setActiveTab("codes")}
            className={`px-4 py-2 font-medium border-b-2 transition ${
              activeTab === "codes"
                ? "border-accent text-accent"
                : "border-transparent text-onsurface-variant hover:text-onsurface"
            }`}
          >
            Codici Sconto
          </button>
          <button
            onClick={() => setActiveTab("stats")}
            className={`px-4 py-2 font-medium border-b-2 transition ${
              activeTab === "stats"
                ? "border-accent text-accent"
                : "border-transparent text-onsurface-variant hover:text-onsurface"
            }`}
          >
            Statistiche Sistema
          </button>
        </div>

        {/* TAB 1: UTENTI */}
        {activeTab === "users" && (
          <div>
            <div className="mb-4 flex items-center justify-between gap-4">
              <input
                type="text"
                placeholder="Cerca per email o nome..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  loadUsers(e.target.value);
                }}
                className="w-72 rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <Button variant="secondary" size="sm" onClick={() => loadUsers()}>
                Aggiorna Listato
              </Button>
            </div>

            {loadingUsers ? (
              <p className="text-sm text-onsurface-variant">Caricamento utenti...</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-surface-border bg-surface">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-surface-border bg-bg/50 text-xs uppercase text-onsurface-variant">
                    <tr>
                      <th className="px-4 py-3">Utente</th>
                      <th className="px-4 py-3">Stato Sub</th>
                      <th className="px-4 py-3">Piano</th>
                      <th className="px-4 py-3">Scadenza</th>
                      <th className="px-4 py-3">Garage / Cambi</th>
                      <th className="px-4 py-3 text-right">Azioni</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border">
                    {users.map((u) => {
                      const isSubActive = u.subscription?.status === "PREMIUM";
                      return (
                        <tr key={u.id} className="hover:bg-bg/40">
                          <td className="px-4 py-3">
                            <div className="font-medium">{u.firstName} {u.lastName}</div>
                            <div className="text-xs text-onsurface-variant">{u.email}</div>
                            {u.role === "ADMIN" && (
                              <span className="mt-1 inline-block rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-bold text-sky-400">
                                ADMIN
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                                isSubActive
                                  ? "bg-emerald-500/20 text-emerald-400"
                                  : "bg-surface-border text-onsurface-variant"
                              }`}
                            >
                              {u.subscription?.status ?? "FREE"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs font-mono">
                            {u.subscription?.tier ?? "STANDARD"}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {u.subscription?.expiresAt
                              ? new Date(u.subscription.expiresAt).toLocaleDateString("it-IT")
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            <div>
                              Posti: {u.subscription?.activeVehicles ?? 0} / {u.subscription?.maxVehicles ?? 1}
                            </div>
                            <div className="text-onsurface-variant">
                              Cambi: {u.subscription?.headunitSwaps ?? 0} / {u.subscription?.maxHeadunitSwaps ?? 2}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right space-x-2">
                            <Button variant="secondary" size="sm" onClick={() => openSubModal(u)}>
                              Gestisci Sub
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => handleAddExtraSwap(u.id)}>
                              +1 Cambio
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => handleToggleRole(u)}>
                              {u.role === "ADMIN" ? "Revoca Admin" : "Fai Admin"}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: CODICI SCONTO */}
        {activeTab === "codes" && (
          <div>
            <form onSubmit={handleCreateCode} className="mb-6 rounded-xl border border-surface-border bg-surface p-4 flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-onsurface-variant mb-1">Codice Promo (8 Caratteri)</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    placeholder="Es: X7K9P2M4"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                    className="w-36 rounded-lg border border-surface-border bg-bg px-3 py-1.5 font-mono text-sm uppercase outline-none focus:border-accent"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setNewCode(generateRandomCode())}
                  >
                    Genera 8-Char
                  </Button>
                  {newCode && (
                    <button
                      type="button"
                      onClick={() => copyCode(newCode)}
                      title="Copia codice"
                      className="rounded-lg border border-surface-border bg-bg p-2 text-onsurface-variant hover:border-accent hover:text-accent transition"
                    >
                      <IconCopy size={16} />
                    </button>
                  )}
                </div>
                {copiedCode === newCode && (
                  <span className="text-[10px] font-semibold text-emerald-400 mt-1 block">Copiato negli appunti!</span>
                )}
              </div>
              <div>
                <label className="block text-xs text-onsurface-variant mb-1">Tipo Sconto</label>
                <select
                  value={newType}
                  onChange={(e: any) => setNewType(e.target.value)}
                  className="rounded-lg border border-surface-border bg-bg px-3 py-1.5 text-sm outline-none focus:border-accent"
                >
                  <option value="FREE_DAYS">Giorni Gratis</option>
                  <option value="PERCENT">Percentuale (%)</option>
                  <option value="FIXED_AMOUNT">Fisso (€)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-onsurface-variant mb-1">Valore (giorni / %)</label>
                <input
                  type="number"
                  value={newValue}
                  onChange={(e) => setNewValue(Number(e.target.value))}
                  className="w-24 rounded-lg border border-surface-border bg-bg px-3 py-1.5 text-sm outline-none focus:border-accent"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-onsurface-variant mb-1">Max Utilizzi Totali (opzionale)</label>
                <input
                  type="number"
                  placeholder="Es: 100 o vuoto"
                  value={newMaxUses}
                  onChange={(e) => setNewMaxUses(e.target.value)}
                  className="w-32 rounded-lg border border-surface-border bg-bg px-3 py-1.5 text-sm outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-xs text-onsurface-variant mb-1">Email Riservata Ad Personam (opzionale)</label>
                <input
                  type="email"
                  placeholder="adpersonam@email.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-56 rounded-lg border border-surface-border bg-bg px-3 py-1.5 text-sm outline-none focus:border-accent"
                />
              </div>
              <Button type="submit" disabled={creatingCode}>
                Crea Codice Promo
              </Button>
            </form>

            {loadingCodes ? (
              <p className="text-sm text-onsurface-variant">Caricamento codici...</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-surface-border bg-surface">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-surface-border bg-bg/50 text-xs uppercase text-onsurface-variant">
                    <tr>
                      <th className="px-4 py-3">Codice</th>
                      <th className="px-4 py-3">Sconto</th>
                      <th className="px-4 py-3">Target</th>
                      <th className="px-4 py-3">Utilizzi</th>
                      <th className="px-4 py-3 text-right">Azioni</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border">
                    {codes.map((c) => (
                      <tr key={c.id}>
                        <td className="px-4 py-3 font-mono font-bold">
                          <div className="flex items-center gap-2">
                            <span>{c.code}</span>
                            <button
                              type="button"
                              onClick={() => copyCode(c.code)}
                              title="Copia codice"
                              className="rounded border border-surface-border bg-bg p-1 text-onsurface-variant hover:border-accent hover:text-accent transition"
                            >
                              <IconCopy size={14} />
                            </button>
                            {copiedCode === c.code && (
                              <span className="text-[10px] text-emerald-400 font-semibold">Copiato!</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {c.discountType === "PERCENT" && `${c.value}%`}
                          {c.discountType === "FIXED_AMOUNT" && `${c.value} €`}
                          {c.discountType === "FREE_DAYS" && `${c.value} giorni`}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {c.assignedEmail ? (
                            <span className="text-sky-400">Ad Personam ({c.assignedEmail})</span>
                          ) : (
                            <span className="text-emerald-400">Globale</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs">{c.usedCount} utilizzi</td>
                        <td className="px-4 py-3 text-right">
                          <Button variant="danger" size="sm" onClick={() => handleDeleteCode(c.id)}>
                            Elimina
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: STATISTICHE SISTEMA */}
        {activeTab === "stats" && (
          <div>
            {loadingStats || !stats ? (
              <p className="text-sm text-onsurface-variant">Caricamento metriche...</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-surface-border bg-surface p-5">
                  <p className="text-xs text-onsurface-variant uppercase font-semibold">Utenti Totali</p>
                  <p className="mt-2 text-3xl font-bold">{stats.totalUsers}</p>
                </div>
                <div className="rounded-xl border border-surface-border bg-surface p-5">
                  <p className="text-xs text-onsurface-variant uppercase font-semibold">Abbonamenti Attivi</p>
                  <p className="mt-2 text-3xl font-bold text-emerald-400">{stats.activeSubscriptions}</p>
                </div>
                <div className="rounded-xl border border-surface-border bg-surface p-5">
                  <p className="text-xs text-onsurface-variant uppercase font-semibold">Headunit Collegate</p>
                  <p className="mt-2 text-3xl font-bold text-sky-400">{stats.headunits}</p>
                </div>
                <div className="rounded-xl border border-surface-border bg-surface p-5">
                  <p className="text-xs text-onsurface-variant uppercase font-semibold">Viaggi Sincronizzati</p>
                  <p className="mt-2 text-3xl font-bold text-amber-400">{stats.totalTrips}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL GESTIONE ABBONAMENTO */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-surface-border bg-surface p-6 shadow-2xl">
            <h3 className="text-lg font-bold">Gestisci Abbonamento</h3>
            <p className="text-xs text-onsurface-variant mb-4">{selectedUser.email}</p>

            <div className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-medium mb-1">Stato Abbonamento</label>
                <select
                  value={modalStatus}
                  onChange={(e: any) => setModalStatus(e.target.value)}
                  className="w-full rounded-lg border border-surface-border bg-bg px-3 py-2 outline-none focus:border-accent"
                >
                  <option value="FREE">FREE (Nessun Cloud)</option>
                  <option value="PREMIUM">PREMIUM (Attivo)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Piano Abbonamento</label>
                <select
                  value={modalTier}
                  onChange={(e: any) => setModalTier(e.target.value)}
                  className="w-full rounded-lg border border-surface-border bg-bg px-3 py-2 outline-none focus:border-accent"
                >
                  <option value="STANDARD">Standard (1 Auto, 2 Cambi/anno)</option>
                  <option value="GARAGE">Garage (3 Auto, 5 Cambi/anno)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Data Scadenza</label>
                <input
                  type="date"
                  value={modalExpiresAt}
                  onChange={(e) => setModalExpiresAt(e.target.value)}
                  className="w-full rounded-lg border border-surface-border bg-bg px-3 py-2 outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Note Pagamento / Riferimento</label>
                <input
                  type="text"
                  placeholder="Es: Pagato via PayPal ref #12345"
                  value={modalNotes}
                  onChange={(e) => setModalNotes(e.target.value)}
                  className="w-full rounded-lg border border-surface-border bg-bg px-3 py-2 outline-none focus:border-accent"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setSelectedUser(null)}>
                Annulla
              </Button>
              <Button onClick={handleSaveSub} disabled={updatingSub}>
                Salva Abbonamento
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
