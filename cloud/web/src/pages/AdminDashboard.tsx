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
      alert(t("admin.errUpdateSub"));
    } finally {
      setUpdatingSub(false);
    }
  }

  async function handleAddExtraSwap(userId: string) {
    try {
      await api.adminAddExtraSwap(userId);
      await loadUsers();
      alert(t("admin.grantedExtraSwap"));
    } catch {
      alert(t("admin.errAddSwap"));
    }
  }

  async function handleToggleRole(u: Profile) {
    const newRole = u.role === "ADMIN" ? "USER" : "ADMIN";
    if (!confirm(t("admin.confirmChangeRole", { email: u.email ?? "", role: newRole }))) return;
    try {
      await api.adminUpdateRole(u.id, newRole);
      await loadUsers();
    } catch {
      alert(t("admin.errUpdateRole"));
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
      alert(t("admin.errCreateCode"));
    } finally {
      setCreatingCode(false);
    }
  }

  async function handleDeleteCode(id: string) {
    if (!confirm(t("admin.confirmDeleteCode"))) return;
    try {
      await api.adminDeleteDiscountCode(id);
      await loadCodes();
    } catch {
      alert(t("admin.errDeleteCode"));
    }
  }

  function addMonthsToModalDate(monthsCount: number) {
    let baseDate: Date;
    if (modalExpiresAt && !isNaN(Date.parse(modalExpiresAt))) {
      baseDate = new Date(modalExpiresAt);
    } else {
      baseDate = new Date();
    }
    baseDate.setMonth(baseDate.getMonth() + monthsCount);
    const year = baseDate.getFullYear();
    const month = String(baseDate.getMonth() + 1).padStart(2, "0");
    const day = String(baseDate.getDate()).padStart(2, "0");
    setModalExpiresAt(`${year}-${month}-${day}`);
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <h1 className="text-xl sm:text-2xl font-bold">{t("admin.title")}</h1>

        {/* RESPONSIVE SCROLLABLE TABS */}
        <div className="flex border-b border-surface-border overflow-x-auto scrollbar-none gap-2">
          <button
            onClick={() => setActiveTab("users")}
            className={`whitespace-nowrap px-4 py-2 font-medium border-b-2 text-sm transition ${
              activeTab === "users"
                ? "border-accent text-accent"
                : "border-transparent text-onsurface-variant hover:text-onsurface"
            }`}
          >
            {t("admin.tabUsers")}
          </button>
          <button
            onClick={() => setActiveTab("codes")}
            className={`whitespace-nowrap px-4 py-2 font-medium border-b-2 text-sm transition ${
              activeTab === "codes"
                ? "border-accent text-accent"
                : "border-transparent text-onsurface-variant hover:text-onsurface"
            }`}
          >
            {t("admin.tabCodes")}
          </button>
          <button
            onClick={() => setActiveTab("stats")}
            className={`whitespace-nowrap px-4 py-2 font-medium border-b-2 text-sm transition ${
              activeTab === "stats"
                ? "border-accent text-accent"
                : "border-transparent text-onsurface-variant hover:text-onsurface"
            }`}
          >
            {t("admin.tabStats")}
          </button>
        </div>

        {/* TAB 1: UTENTI */}
        {activeTab === "users" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <input
                type="text"
                placeholder={t("admin.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  loadUsers(e.target.value);
                }}
                className="w-full sm:w-72 rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <Button variant="secondary" size="sm" onClick={() => loadUsers()}>
                {t("admin.refreshList")}
              </Button>
            </div>

            {loadingUsers ? (
              <p className="text-sm text-onsurface-variant">{t("admin.loadingUsers")}</p>
            ) : (
              <>
                {/* DESKTOP TABLE */}
                <div className="hidden md:block overflow-x-auto rounded-xl border border-surface-border bg-surface">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-surface-border bg-bg/50 text-xs uppercase text-onsurface-variant">
                      <tr>
                        <th className="px-4 py-3">{t("admin.user")}</th>
                        <th className="px-4 py-3">{t("admin.subStatus")}</th>
                        <th className="px-4 py-3">{t("admin.tier")}</th>
                        <th className="px-4 py-3">{t("admin.expires")}</th>
                        <th className="px-4 py-3">{t("admin.garageSwaps")}</th>
                        <th className="px-4 py-3 text-right">{t("admin.actions")}</th>
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
                                ? new Date(u.subscription.expiresAt).toLocaleDateString()
                                : "—"}
                            </td>
                            <td className="px-4 py-3 text-xs">
                              <div>
                                {t("admin.seatsCount", { active: u.subscription?.activeVehicles ?? 0, max: u.subscription?.maxVehicles ?? 1 })}
                              </div>
                              <div className="text-onsurface-variant">
                                {t("admin.swapsCount", { used: u.subscription?.headunitSwaps ?? 0, max: u.subscription?.maxHeadunitSwaps ?? 2 })}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right space-x-2">
                              <Button variant="secondary" size="sm" onClick={() => openSubModal(u)}>
                                {t("admin.manageSub")}
                              </Button>
                              <Button variant="secondary" size="sm" onClick={() => handleAddExtraSwap(u.id)}>
                                {t("admin.addSwap")}
                              </Button>
                              <Button variant="secondary" size="sm" onClick={() => handleToggleRole(u)}>
                                {u.role === "ADMIN" ? t("admin.revokeAdmin") : t("admin.makeAdmin")}
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* MOBILE CARDS VIEW */}
                <div className="space-y-3 md:hidden">
                  {users.map((u) => {
                    const isSubActive = u.subscription?.status === "PREMIUM";
                    return (
                      <div key={u.id} className="rounded-xl border border-surface-border bg-surface p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-sm">{u.firstName} {u.lastName}</p>
                            <p className="text-xs text-onsurface-variant break-all">{u.email}</p>
                          </div>
                          {u.role === "ADMIN" && (
                            <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-bold text-sky-400">
                              ADMIN
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-surface-border">
                          <div>
                            <span className="text-onsurface-variant block">{t("admin.subStatus")}</span>
                            <span
                              className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                isSubActive ? "bg-emerald-500/20 text-emerald-400" : "bg-surface-border text-onsurface-variant"
                              }`}
                            >
                              {u.subscription?.status ?? "FREE"} ({u.subscription?.tier ?? "STANDARD"})
                            </span>
                          </div>
                          <div>
                            <span className="text-onsurface-variant block">{t("admin.expires")}</span>
                            <span className="font-medium mt-0.5 block">
                              {u.subscription?.expiresAt ? new Date(u.subscription.expiresAt).toLocaleDateString() : "—"}
                            </span>
                          </div>
                          <div className="col-span-2 pt-1 flex justify-between text-xs text-onsurface-variant">
                            <span>{t("admin.seatsCount", { active: u.subscription?.activeVehicles ?? 0, max: u.subscription?.maxVehicles ?? 1 })}</span>
                            <span>{t("admin.swapsCount", { used: u.subscription?.headunitSwaps ?? 0, max: u.subscription?.maxHeadunitSwaps ?? 2 })}</span>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-surface-border flex flex-wrap gap-2 justify-end">
                          <Button variant="secondary" size="sm" onClick={() => openSubModal(u)}>
                            {t("admin.manageSub")}
                          </Button>
                          <Button variant="secondary" size="sm" onClick={() => handleAddExtraSwap(u.id)}>
                            {t("admin.addSwap")}
                          </Button>
                          <Button variant="secondary" size="sm" onClick={() => handleToggleRole(u)}>
                            {u.role === "ADMIN" ? t("admin.revokeAdmin") : t("admin.makeAdmin")}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB 2: CODICI SCONTO */}
        {activeTab === "codes" && (
          <div className="space-y-4">
            <form onSubmit={handleCreateCode} className="rounded-xl border border-surface-border bg-surface p-4 flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-end gap-3.5">
              <div className="w-full sm:w-auto flex-1 min-w-[200px]">
                <label className="block text-xs text-onsurface-variant mb-1">{t("admin.codeLabel")}</label>
                <div className="flex items-center gap-1.5 w-full">
                  <input
                    type="text"
                    placeholder={t("admin.codePlaceholder")}
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                    className="w-full rounded-lg border border-surface-border bg-bg px-3 py-1.5 font-mono text-sm uppercase outline-none focus:border-accent"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setNewCode(generateRandomCode())}
                    className="whitespace-nowrap"
                  >
                    {t("admin.generate8")}
                  </Button>
                  {newCode && (
                    <button
                      type="button"
                      onClick={() => copyCode(newCode)}
                      title={t("admin.copyTitle")}
                      className="rounded-lg border border-surface-border bg-bg p-2 text-onsurface-variant hover:border-accent hover:text-accent transition shrink-0"
                    >
                      <IconCopy size={16} />
                    </button>
                  )}
                </div>
                {copiedCode === newCode && (
                  <span className="text-[10px] font-semibold text-emerald-400 mt-1 block">{t("admin.copiedClipboard")}</span>
                )}
              </div>

              <div className="w-full sm:w-auto">
                <label className="block text-xs text-onsurface-variant mb-1">{t("admin.discountType")}</label>
                <select
                  value={newType}
                  onChange={(e: any) => setNewType(e.target.value)}
                  className="w-full rounded-lg border border-surface-border bg-bg px-3 py-1.5 text-sm outline-none focus:border-accent"
                >
                  <option value="FREE_DAYS">{t("admin.freeDays")}</option>
                  <option value="PERCENT">{t("admin.percent")}</option>
                  <option value="FIXED_AMOUNT">{t("admin.fixedAmount")}</option>
                </select>
              </div>

              <div className="w-full sm:w-28">
                <label className="block text-xs text-onsurface-variant mb-1">{t("admin.valueLabel")}</label>
                <input
                  type="number"
                  value={newValue}
                  onChange={(e) => setNewValue(Number(e.target.value))}
                  className="w-full rounded-lg border border-surface-border bg-bg px-3 py-1.5 text-sm outline-none focus:border-accent"
                  required
                />
              </div>

              <div className="w-full sm:w-36">
                <label className="block text-xs text-onsurface-variant mb-1">{t("admin.maxUsesLabel")}</label>
                <input
                  type="number"
                  placeholder={t("admin.maxUsesPlaceholder")}
                  value={newMaxUses}
                  onChange={(e) => setNewMaxUses(e.target.value)}
                  className="w-full rounded-lg border border-surface-border bg-bg px-3 py-1.5 text-sm outline-none focus:border-accent"
                />
              </div>

              <div className="w-full sm:w-56">
                <label className="block text-xs text-onsurface-variant mb-1">{t("admin.assignedEmailLabel")}</label>
                <input
                  type="email"
                  placeholder={t("admin.assignedEmailPlaceholder")}
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full rounded-lg border border-surface-border bg-bg px-3 py-1.5 text-sm outline-none focus:border-accent"
                />
              </div>

              <Button type="submit" disabled={creatingCode} className="w-full sm:w-auto">
                {t("admin.createCode")}
              </Button>
            </form>

            {loadingCodes ? (
              <p className="text-sm text-onsurface-variant">{t("common.loading")}</p>
            ) : (
              <>
                {/* DESKTOP TABLE */}
                <div className="hidden md:block overflow-x-auto rounded-xl border border-surface-border bg-surface">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-surface-border bg-bg/50 text-xs uppercase text-onsurface-variant">
                      <tr>
                        <th className="px-4 py-3">{t("admin.codeLabel")}</th>
                        <th className="px-4 py-3">{t("admin.discountType")}</th>
                        <th className="px-4 py-3">Target</th>
                        <th className="px-4 py-3">{t("admin.garageSwaps")}</th>
                        <th className="px-4 py-3 text-right">{t("admin.actions")}</th>
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
                                title={t("admin.copyTitle")}
                                className="rounded border border-surface-border bg-bg p-1 text-onsurface-variant hover:border-accent hover:text-accent transition"
                              >
                                <IconCopy size={14} />
                              </button>
                              {copiedCode === c.code && (
                                <span className="text-[10px] text-emerald-400 font-semibold">{t("admin.copied")}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {c.discountType === "PERCENT" && `${c.value}%`}
                            {c.discountType === "FIXED_AMOUNT" && `${c.value} €`}
                            {c.discountType === "FREE_DAYS" && t("admin.daysCount", { count: c.value })}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {c.assignedEmail ? (
                              <span className="text-sky-400">{t("admin.adPersonam", { email: c.assignedEmail })}</span>
                            ) : (
                              <span className="text-emerald-400">{t("admin.globalTarget")}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs">{t("admin.usesCount", { count: c.usedCount })}</td>
                          <td className="px-4 py-3 text-right">
                            <Button variant="danger" size="sm" onClick={() => handleDeleteCode(c.id)}>
                              {t("common.delete")}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* MOBILE CARDS VIEW */}
                <div className="space-y-3 md:hidden">
                  {codes.map((c) => (
                    <div key={c.id} className="rounded-xl border border-surface-border bg-surface p-4 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-base">{c.code}</span>
                          <button
                            type="button"
                            onClick={() => copyCode(c.code)}
                            title={t("admin.copyTitle")}
                            className="rounded border border-surface-border bg-bg p-1 text-onsurface-variant hover:border-accent hover:text-accent transition"
                          >
                            <IconCopy size={14} />
                          </button>
                          {copiedCode === c.code && (
                            <span className="text-[10px] text-emerald-400 font-semibold">{t("admin.copied")}</span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-onsurface-variant">
                          <span>
                            {c.discountType === "PERCENT" && `${c.value}%`}
                            {c.discountType === "FIXED_AMOUNT" && `${c.value} €`}
                            {c.discountType === "FREE_DAYS" && t("admin.daysCount", { count: c.value })}
                          </span>
                          <span>•</span>
                          <span>
                            {c.assignedEmail ? (
                              <span className="text-sky-400">{t("admin.adPersonam", { email: c.assignedEmail })}</span>
                            ) : (
                              <span className="text-emerald-400">{t("admin.globalTarget")}</span>
                            )}
                          </span>
                          <span>•</span>
                          <span>{t("admin.usesCount", { count: c.usedCount })}</span>
                        </div>
                      </div>
                      <Button variant="danger" size="sm" onClick={() => handleDeleteCode(c.id)}>
                        {t("common.delete")}
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB 3: STATISTICHE SISTEMA */}
        {activeTab === "stats" && (
          <div>
            {loadingStats || !stats ? (
              <p className="text-sm text-onsurface-variant">{t("common.loading")}</p>
            ) : (
              <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-surface-border bg-surface p-4 sm:p-5">
                  <p className="text-xs text-onsurface-variant uppercase font-semibold">{t("admin.statsTotalUsers")}</p>
                  <p className="mt-2 text-2xl sm:text-3xl font-bold">{stats.totalUsers}</p>
                </div>
                <div className="rounded-xl border border-surface-border bg-surface p-4 sm:p-5">
                  <p className="text-xs text-onsurface-variant uppercase font-semibold">{t("admin.statsActiveSubs")}</p>
                  <p className="mt-2 text-2xl sm:text-3xl font-bold text-emerald-400">{stats.activeSubscriptions}</p>
                </div>
                <div className="rounded-xl border border-surface-border bg-surface p-4 sm:p-5">
                  <p className="text-xs text-onsurface-variant uppercase font-semibold">{t("admin.statsHeadunits")}</p>
                  <p className="mt-2 text-2xl sm:text-3xl font-bold text-sky-400">{stats.headunits}</p>
                </div>
                <div className="rounded-xl border border-surface-border bg-surface p-4 sm:p-5">
                  <p className="text-xs text-onsurface-variant uppercase font-semibold">{t("admin.statsTotalTrips")}</p>
                  <p className="mt-2 text-2xl sm:text-3xl font-bold text-amber-400">{stats.totalTrips}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL GESTIONE ABBONAMENTO */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl border border-surface-border bg-[#14161a] p-5 sm:p-6 shadow-2xl my-auto space-y-4">
            <div>
              <h3 className="text-lg font-bold">{t("admin.modalSubTitle")}</h3>
              <p className="text-xs text-onsurface-variant truncate">{selectedUser.email}</p>
            </div>

            <div className="space-y-3.5 text-sm">
              <div>
                <label className="block text-xs font-medium mb-1">{t("admin.modalStatus")}</label>
                <select
                  value={modalStatus}
                  onChange={(e: any) => setModalStatus(e.target.value)}
                  className="w-full rounded-lg border border-surface-border bg-bg px-3 py-2 outline-none focus:border-accent"
                >
                  <option value="FREE">{t("admin.freeNoCloud")}</option>
                  <option value="PREMIUM">{t("admin.premiumActive")}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">{t("admin.modalTier")}</label>
                <select
                  value={modalTier}
                  onChange={(e: any) => setModalTier(e.target.value)}
                  className="w-full rounded-lg border border-surface-border bg-bg px-3 py-2 outline-none focus:border-accent"
                >
                  <option value="STANDARD">{t("admin.standardTierDesc")}</option>
                  <option value="GARAGE">{t("admin.garageTierDesc")}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">{t("admin.modalExpiresAt")}</label>
                <input
                  type="date"
                  value={modalExpiresAt}
                  onChange={(e) => setModalExpiresAt(e.target.value)}
                  className="w-full rounded-lg border border-surface-border bg-bg px-3 py-2 outline-none focus:border-accent"
                />
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => addMonthsToModalDate(1)}
                    className="rounded-md border border-surface-border bg-bg px-3 py-1 text-xs font-medium text-onsurface-variant hover:border-accent hover:text-accent transition"
                  >
                    +1m
                  </button>
                  <button
                    type="button"
                    onClick={() => addMonthsToModalDate(3)}
                    className="rounded-md border border-surface-border bg-bg px-3 py-1 text-xs font-medium text-onsurface-variant hover:border-accent hover:text-accent transition"
                  >
                    +3m
                  </button>
                  <button
                    type="button"
                    onClick={() => addMonthsToModalDate(12)}
                    className="rounded-md border border-surface-border bg-bg px-3 py-1 text-xs font-medium text-onsurface-variant hover:border-accent hover:text-accent transition"
                  >
                    +1y
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">{t("admin.modalNotes")}</label>
                <input
                  type="text"
                  placeholder={t("admin.notesPlaceholder")}
                  value={modalNotes}
                  onChange={(e) => setModalNotes(e.target.value)}
                  className="w-full rounded-lg border border-surface-border bg-bg px-3 py-2 outline-none focus:border-accent"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2.5">
              <Button variant="secondary" onClick={() => setSelectedUser(null)}>
                {t("admin.cancel")}
              </Button>
              <Button onClick={handleSaveSub} disabled={updatingSub}>
                {t("admin.saveSub")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
