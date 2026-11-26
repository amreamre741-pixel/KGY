"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type TxType = "expense" | "income" | "transfer";
type TabKey = "dashboard" | "wallets" | "goals" | "budgets";
type CurrencyMode = "dzd" | "centime";

interface Wallet {
  id: string;
  name: string;
  emoji: string;
  balance: number; // stored in DZD
}

interface Transaction {
  id: string;
  type: TxType;
  amount: number; // in DZD
  categoryId: string;
  itemEmoji?: string;
  walletId: string;
  toWalletId?: string;
  note: string;
  date: string; // YYYY-MM-DD
}

interface SavingsGoal {
  id: string;
  title: string;
  emoji: string;
  target: number; // in DZD
  saved: number; // in DZD
}

interface MasroufState {
  wallets: Wallet[];
  transactions: Transaction[];
  goals: SavingsGoal[];
  budgets: Record<string, number>; // categoryId -> monthly limit in DZD
  favoriteItems: string[];
  currencyMode: CurrencyMode;
}

interface CategoryDef {
  id: string;
  label: string;
  emoji: string;
  color: string;
  kind: "expense" | "income";
}

interface SubItemDef {
  id: string;
  label: string;
  emoji: string;
}

const STORAGE_KEY = "masrouf_dz_v1";

const CATEGORY_ITEMS: Record<string, SubItemDef[]> = {
  groceries: [
    { id: "eggs", label: "بيض", emoji: "🥚" },
    { id: "sugar", label: "سكر", emoji: "🍚" },
    { id: "meat", label: "لحم", emoji: "🥩" },
    { id: "chicken", label: "دجاج", emoji: "🍗" },
    { id: "potato", label: "بطاطا", emoji: "🥔" },
    { id: "tomato", label: "طماطم", emoji: "🍅" },
    { id: "onion", label: "بصلة", emoji: "🧅" },
    { id: "bread", label: "خبز", emoji: "🥖" },
    { id: "milk", label: "حليب", emoji: "🥛" },
    { id: "oil", label: "زيت", emoji: "🫒" },
    { id: "coffee", label: "قهوة", emoji: "☕" },
    { id: "cheese", label: "فرماج", emoji: "🧀" },
    { id: "pasta", label: "عجائن", emoji: "🍝" },
    { id: "fruits", label: "فواكه", emoji: "🍎" },
    { id: "veggies", label: "خضر أخرى", emoji: "🥬" },
    { id: "water", label: "ماء معدني", emoji: "💧" },
  ],
  kids: [
    { id: "k_milk", label: "حليب أطفال", emoji: "🍼" },
    { id: "k_diapers", label: "حفاضات (لي كوش)", emoji: "🧷" },
    { id: "k_wipes", label: "مناديل مبللة", emoji: "🧻" },
    { id: "k_meds", label: "دواء / طبيب", emoji: "💊" },
    { id: "k_clothes", label: "ملابس أطفال", emoji: "👕" },
    { id: "k_school", label: "مدرسة وأدوات", emoji: "🎒" },
    { id: "k_snacks", label: "سناك / ياغورت", emoji: "🍪" },
    { id: "k_toys", label: "ألعاب", emoji: "🧸" },
    { id: "k_care", label: "شامبو وعناية", emoji: "🧴" },
  ],
  bills: [
    { id: "elec", label: "كهرباء", emoji: "⚡" },
    { id: "gas", label: "غاز", emoji: "🔥" },
    { id: "water_bill", label: "ماء", emoji: "🚰" },
    { id: "internet", label: "إنترنت", emoji: "🌐" },
    { id: "flexy", label: "فليكسي", emoji: "📱" },
  ],
  transport: [
    { id: "fuel", label: "بنزين/مازوت", emoji: "⛽" },
    { id: "taxi", label: "طاكسي/نقل", emoji: "🚕" },
    { id: "repair", label: "صيانة", emoji: "🔧" },
  ],
};

const CATEGORIES: CategoryDef[] = [
  { id: "groceries", label: "قفة الدار وأكل", emoji: "🛒", color: "#0f766e", kind: "expense" },
  { id: "kids", label: "مصاريف الأطفال", emoji: "👶", color: "#ec4899", kind: "expense" },
  { id: "bills", label: "فواتير (كهرباء/ماء/إنترنت)", emoji: "⚡", color: "#0284c7", kind: "expense" },
  { id: "transport", label: "نقل وبنزين", emoji: "🚗", color: "#d97706", kind: "expense" },
  { id: "rent", label: "كراء ومصاريف المنزل", emoji: "🏠", color: "#7c3aed", kind: "expense" },
  { id: "health", label: "صحة ودواء", emoji: "💊", color: "#dc2626", kind: "expense" },
  { id: "clothes", label: "ملابس وعناية", emoji: "👕", color: "#db2777", kind: "expense" },
  { id: "emergency", label: "مصاريف طارئة", emoji: "🆘", color: "#ea580c", kind: "expense" },
  { id: "other_exp", label: "مصاريف أخرى", emoji: "📦", color: "#475569", kind: "expense" },
  { id: "salary", label: "راتب / دخل شهري", emoji: "💼", color: "#15803d", kind: "income" },
  { id: "freelance", label: "عمل حر / تجارة", emoji: "💻", color: "#059669", kind: "income" },
  { id: "other_inc", label: "مدخول إضافي", emoji: "🎁", color: "#16a34a", kind: "income" },
];

const EXPENSE_CATEGORIES = CATEGORIES.filter((c) => c.kind === "expense");
const INCOME_CATEGORIES = CATEGORIES.filter((c) => c.kind === "income");

function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function currentMonthKey(): string {
  return todayISO().slice(0, 7);
}

function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const dt = new Date(y, m - 1 + delta, 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthAr(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  const dt = new Date(y, m - 1, 1);
  return new Intl.DateTimeFormat("ar-DZ", { month: "long", year: "numeric" }).format(dt);
}

function createInitialState(): MasroufState {
  const today = todayISO();
  return {
    wallets: [
      { id: "w_cash", name: "كاش (المنزل / الجيب)", emoji: "💵", balance: 18500 },
      { id: "w_ccp", name: "CCP / بريدي موب", emoji: "💳", balance: 45000 },
      { id: "w_box", name: "حصالة الادخار (شحيحة)", emoji: "🏦", balance: 30000 },
    ],
    transactions: [
      {
        id: "tx_1",
        type: "income",
        amount: 60000,
        categoryId: "salary",
        walletId: "w_ccp",
        note: "الراتب الشهري",
        date: today,
      },
      {
        id: "tx_2",
        type: "expense",
        amount: 4500,
        categoryId: "groceries",
        walletId: "w_cash",
        note: "خضر وفواكه ومواد غذائية",
        date: today,
      },
      {
        id: "tx_3",
        type: "expense",
        amount: 2000,
        categoryId: "bills",
        walletId: "w_ccp",
        note: "تعبئة الإنترنت",
        date: today,
      },
    ],
    goals: [
      {
        id: "g_ecom",
        title: "رأس مال التجارة الإلكترونية",
        emoji: "🚀",
        target: 100000,
        saved: 30000,
      },
      {
        id: "g_emerg",
        title: "صندوق الطوارئ المنزلي",
        emoji: "🛡️",
        target: 50000,
        saved: 12000,
      },
    ],
    budgets: {
      groceries: 20000,
      bills: 6000,
      transport: 5000,
      rent: 15000,
      health: 4000,
      clothes: 5000,
    },
    favoriteItems: ["eggs", "bread", "milk", "potato"],
    currencyMode: "dzd",
  };
}

function formatMoney(amountDzd: number, mode: CurrencyMode): string {
  if (mode === "centime") {
    const centimes = Math.round(amountDzd * 100);
    return `${centimes.toLocaleString("fr-DZ")} سنتيم`;
  }
  return `${Math.round(amountDzd).toLocaleString("fr-DZ")} دج`;
}

export default function MasroufApp() {
  const [state, setState] = useState<MasroufState>(createInitialState);
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState<TabKey>("dashboard");
  const [monthKey, setMonthKey] = useState<string>(currentMonthKey);

  // Modals
  const [txModal, setTxModal] = useState<TxType | null>(null);
  const [txAmount, setTxAmount] = useState("");
  const [txCategory, setTxCategory] = useState("groceries");
  const [selectedSubItem, setSelectedSubItem] = useState<SubItemDef | null>(null);
  const [txWallet, setTxWallet] = useState("w_cash");
  const [txToWallet, setTxToWallet] = useState("w_box");
  const [txNote, setTxNote] = useState("");
  const [txDate, setTxDate] = useState(todayISO);

  const [walletModal, setWalletModal] = useState(false);
  const [newWalletName, setNewWalletName] = useState("");
  const [newWalletEmoji, setNewWalletEmoji] = useState("👛");
  const [newWalletBalance, setNewWalletBalance] = useState("");

  const [goalModal, setGoalModal] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState("");
  const [newGoalEmoji, setNewGoalEmoji] = useState("🎯");
  const [newGoalTarget, setNewGoalTarget] = useState("");

  const [fundGoalId, setFundGoalId] = useState<string | null>(null);
  const [fundAmount, setFundAmount] = useState("");
  const [fundWalletId, setFundWalletId] = useState("w_cash");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as MasroufState;
        if (parsed && Array.isArray(parsed.wallets) && Array.isArray(parsed.transactions)) {
          setState(parsed);
        }
      }
    } catch {
      // ignore corrupted storage
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore storage quota errors
    }
  }, [state, hydrated]);

  const totalBalance = useMemo(
    () => state.wallets.reduce((sum, w) => sum + w.balance, 0),
    [state.wallets]
  );

  const monthTransactions = useMemo(
    () => state.transactions.filter((tx) => tx.date.startsWith(monthKey)),
    [state.transactions, monthKey]
  );

  const monthIncome = useMemo(
    () => monthTransactions.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0),
    [monthTransactions]
  );

  const monthExpense = useMemo(
    () => monthTransactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0),
    [monthTransactions]
  );

  const monthNet = monthIncome - monthExpense;
  const savingsRate = monthIncome > 0 ? Math.round((monthNet / monthIncome) * 100) : 0;

  const expenseByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const tx of monthTransactions) {
      if (tx.type === "expense") {
        map[tx.categoryId] = (map[tx.categoryId] || 0) + tx.amount;
      }
    }
    return map;
  }, [monthTransactions]);

  const sortedExpenseCategories = useMemo(() => {
    return EXPENSE_CATEGORIES.map((cat) => ({
      ...cat,
      spent: expenseByCategory[cat.id] || 0,
    }))
      .filter((c) => c.spent > 0)
      .sort((a, b) => b.spent - a.spent);
  }, [expenseByCategory]);

  function toggleFavoriteItem(itemId: string) {
    setState((prev) => {
      const favs = prev.favoriteItems || [];
      const exists = favs.includes(itemId);
      return {
        ...prev,
        favoriteItems: exists ? favs.filter((id) => id !== itemId) : [...favs, itemId],
      };
    });
  }

  function openTxModal(type: TxType) {
    setTxModal(type);
    setTxAmount("");
    setTxNote("");
    setSelectedSubItem(null);
    setTxDate(todayISO());
    if (type === "expense") setTxCategory("groceries");
    if (type === "income") setTxCategory("salary");
    if (state.wallets.length > 0) {
      setTxWallet(state.wallets[0].id);
      setTxToWallet(state.wallets[1]?.id || state.wallets[0].id);
    }
  }

  function handleSaveTx(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(txAmount);
    if (!txModal || !amount || amount <= 0) return;

    const newTx: Transaction = {
      id: `tx_${Date.now()}`,
      type: txModal,
      amount,
      categoryId: txModal === "transfer" ? "transfer" : txCategory,
      itemEmoji: txModal === "expense" && selectedSubItem ? selectedSubItem.emoji : undefined,
      walletId: txWallet,
      toWalletId: txModal === "transfer" ? txToWallet : undefined,
      note: txNote.trim(),
      date: txDate || todayISO(),
    };

    setState((prev) => {
      const wallets = prev.wallets.map((w) => {
        if (txModal === "expense" && w.id === txWallet) {
          return { ...w, balance: w.balance - amount };
        }
        if (txModal === "income" && w.id === txWallet) {
          return { ...w, balance: w.balance + amount };
        }
        if (txModal === "transfer") {
          if (w.id === txWallet) return { ...w, balance: w.balance - amount };
          if (w.id === txToWallet) return { ...w, balance: w.balance + amount };
        }
        return w;
      });
      return {
        ...prev,
        wallets,
        transactions: [newTx, ...prev.transactions],
      };
    });

    setTxModal(null);
  }

  function handleDeleteTx(tx: Transaction) {
    setState((prev) => {
      const wallets = prev.wallets.map((w) => {
        if (tx.type === "expense" && w.id === tx.walletId) {
          return { ...w, balance: w.balance + tx.amount };
        }
        if (tx.type === "income" && w.id === tx.walletId) {
          return { ...w, balance: w.balance - tx.amount };
        }
        if (tx.type === "transfer") {
          if (w.id === tx.walletId) return { ...w, balance: w.balance + tx.amount };
          if (w.id === tx.toWalletId) return { ...w, balance: w.balance - tx.amount };
        }
        return w;
      });
      return {
        ...prev,
        wallets,
        transactions: prev.transactions.filter((t) => t.id !== tx.id),
      };
    });
  }

  function handleAddWallet(e: React.FormEvent) {
    e.preventDefault();
    if (!newWalletName.trim()) return;
    const balance = Number(newWalletBalance) || 0;
    const wallet: Wallet = {
      id: `w_${Date.now()}`,
      name: newWalletName.trim(),
      emoji: newWalletEmoji || "👛",
      balance,
    };
    setState((prev) => ({ ...prev, wallets: [...prev.wallets, wallet] }));
    setNewWalletName("");
    setNewWalletBalance("");
    setWalletModal(false);
  }

  function handleAddGoal(e: React.FormEvent) {
    e.preventDefault();
    const target = Number(newGoalTarget);
    if (!newGoalTitle.trim() || !target || target <= 0) return;
    const goal: SavingsGoal = {
      id: `g_${Date.now()}`,
      title: newGoalTitle.trim(),
      emoji: newGoalEmoji || "🎯",
      target,
      saved: 0,
    };
    setState((prev) => ({ ...prev, goals: [...prev.goals, goal] }));
    setNewGoalTitle("");
    setNewGoalTarget("");
    setGoalModal(false);
  }

  function handleFundGoal(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(fundAmount);
    if (!fundGoalId || !amount || amount <= 0) return;
    setState((prev) => ({
      ...prev,
      goals: prev.goals.map((g) => (g.id === fundGoalId ? { ...g, saved: g.saved + amount } : g)),
      wallets: prev.wallets.map((w) =>
        w.id === fundWalletId ? { ...w, balance: w.balance - amount } : w
      ),
    }));
    setFundGoalId(null);
    setFundAmount("");
  }

  function handleDeleteGoal(id: string) {
    setState((prev) => ({ ...prev, goals: prev.goals.filter((g) => g.id !== id) }));
  }

  function handleBudgetChange(catId: string, val: string) {
    const num = Math.max(0, Number(val) || 0);
    setState((prev) => ({
      ...prev,
      budgets: { ...prev.budgets, [catId]: num },
    }));
  }

  function handleExportBackup() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `masrouf-backup-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportBackup(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as MasroufState;
        if (parsed && Array.isArray(parsed.wallets) && Array.isArray(parsed.transactions)) {
          setState(parsed);
        }
      } catch {
        // ignore invalid file
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function handleResetData() {
    if (window.confirm("هل تريد مسح كل البيانات والبدء من الصفر؟")) {
      setState({
        wallets: [
          { id: "w_cash", name: "كاش (المنزل / الجيب)", emoji: "💵", balance: 0 },
          { id: "w_ccp", name: "CCP / بريدي موب", emoji: "💳", balance: 0 },
          { id: "w_box", name: "حصالة الادخار (شحيحة)", emoji: "🏦", balance: 0 },
        ],
        transactions: [],
        goals: [],
        budgets: {},
        favoriteItems: state.favoriteItems || [],
        currencyMode: state.currencyMode,
      });
    }
  }

  const getCategory = (id: string) => CATEGORIES.find((c) => c.id === id);
  const getWalletName = (id: string) => state.wallets.find((w) => w.id === id)?.name || "محفظة";

  return (
    <div>
      {/* Header */}
      <header className="ms-header">
        <div className="ms-container">
          <div className="ms-topbar">
            <div className="ms-brand">
              <div className="ms-brand-icon">💰</div>
              <div>
                <h1>مصروفي</h1>
                <p>تسيير الميزانية والادخار المنزلي</p>
              </div>
            </div>

            <div className="ms-top-controls">
              <div className="ms-month-picker">
                <button type="button" onClick={() => setMonthKey((m) => shiftMonth(m, -1))} aria-label="الشهر السابق">
                  ‹
                </button>
                <span>{formatMonthAr(monthKey)}</span>
                <button type="button" onClick={() => setMonthKey((m) => shiftMonth(m, 1))} aria-label="الشهر القادم">
                  ›
                </button>
              </div>

              <button
                type="button"
                className="ms-pill-btn"
                onClick={() =>
                  setState((prev) => ({
                    ...prev,
                    currencyMode: prev.currencyMode === "dzd" ? "centime" : "dzd",
                  }))
                }
              >
                {state.currencyMode === "dzd" ? "العملة: دينار (دج)" : "العملة: سنتيم"}
              </button>
            </div>
          </div>

          <div className="ms-balance-hero">
            <div>
              <div className="ms-balance-label">الرصيد الإجمالي في كل المحافظ</div>
              <div className="ms-balance-value">{formatMoney(totalBalance, state.currencyMode)}</div>
            </div>

            <div className="ms-quick-actions">
              <button type="button" className="ms-action-btn ms-action-expense" onClick={() => openTxModal("expense")}>
                − مصروف
              </button>
              <button type="button" className="ms-action-btn ms-action-income" onClick={() => openTxModal("income")}>
                + مدخول
              </button>
              <button type="button" className="ms-action-btn ms-action-transfer" onClick={() => openTxModal("transfer")}>
                ⇄ تحويل
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="ms-container">
        {/* Desktop Tabs */}
        <nav className="ms-desktop-tabs" aria-label="التنقل الرئيسي">
          <button type="button" className={`ms-tab-btn ${tab === "dashboard" ? "active" : ""}`} onClick={() => setTab("dashboard")}>
            📊 الرئيسية
          </button>
          <button type="button" className={`ms-tab-btn ${tab === "wallets" ? "active" : ""}`} onClick={() => setTab("wallets")}>
            👛 المحافظ
          </button>
          <button type="button" className={`ms-tab-btn ${tab === "goals" ? "active" : ""}`} onClick={() => setTab("goals")}>
            🎯 أهداف الادخار
          </button>
          <button type="button" className={`ms-tab-btn ${tab === "budgets" ? "active" : ""}`} onClick={() => setTab("budgets")}>
            📋 الميزانية الشهرية
          </button>
        </nav>

        <main className="ms-main">
          {tab === "dashboard" && (
            <>
              <div className="ms-kpi-grid">
                <div className="ms-card">
                  <div className="ms-kpi-title">
                    <span>مداخيل الشهر</span>
                    <span>📈</span>
                  </div>
                  <div className="ms-kpi-num ms-num-income">{formatMoney(monthIncome, state.currencyMode)}</div>
                </div>

                <div className="ms-card">
                  <div className="ms-kpi-title">
                    <span>مصاريف الشهر</span>
                    <span>📉</span>
                  </div>
                  <div className="ms-kpi-num ms-num-expense">{formatMoney(monthExpense, state.currencyMode)}</div>
                </div>

                <div className="ms-card">
                  <div className="ms-kpi-title">
                    <span>صافي الادخار</span>
                    <span className={`ms-badge ${monthNet >= 0 ? "ms-badge-ok" : "ms-badge-danger"}`}>
                      {monthIncome > 0 ? `${savingsRate}%` : "0%"}
                    </span>
                  </div>
                  <div className={`ms-kpi-num ${monthNet >= 0 ? "ms-num-primary" : "ms-num-expense"}`}>
                    {formatMoney(monthNet, state.currencyMode)}
                  </div>
                </div>
              </div>

              <div className="ms-grid-2">
                {/* Expense Breakdown */}
                <section className="ms-card">
                  <div className="ms-section-head">
                    <h2>أين ذهبت مصاريفك؟</h2>
                  </div>
                  {sortedExpenseCategories.length === 0 ? (
                    <div className="ms-empty">لا توجد مصاريف مسجلة في هذا الشهر بعد.</div>
                  ) : (
                    <div className="ms-list">
                      {sortedExpenseCategories.map((cat) => {
                        const pct = monthExpense > 0 ? Math.round((cat.spent / monthExpense) * 100) : 0;
                        return (
                          <div key={cat.id} className="ms-bar-row">
                            <div className="ms-bar-head">
                              <span>
                                {cat.emoji} {cat.label}
                              </span>
                              <span>
                                {formatMoney(cat.spent, state.currencyMode)} ({pct}%)
                              </span>
                            </div>
                            <div className="ms-bar-track">
                              <div className="ms-bar-fill" style={{ width: `${pct}%`, background: cat.color }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* Recent Transactions */}
                <section className="ms-card">
                  <div className="ms-section-head">
                    <h2>آخر العمليات ({monthTransactions.length})</h2>
                  </div>
                  {monthTransactions.length === 0 ? (
                    <div className="ms-empty">اضغط على &quot;− مصروف&quot; أو &quot;+ مدخول&quot; لتسجيل أول عملية.</div>
                  ) : (
                    <div className="ms-list">
                      {monthTransactions.map((tx) => {
                        const cat = getCategory(tx.categoryId);
                        const isExp = tx.type === "expense";
                        const isInc = tx.type === "income";
                        return (
                          <div key={tx.id} className="ms-tx-item">
                            <div className="ms-tx-left">
                              <div className="ms-tx-emoji">
                                {tx.type === "transfer" ? "⇄" : tx.itemEmoji || cat?.emoji || "💵"}
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div className="ms-tx-title">
                                  {tx.note || (tx.type === "transfer" ? "تحويل بين المحافظ" : cat?.label || "عملية")}
                                </div>
                                <div className="ms-tx-meta">
                                  {tx.type === "transfer"
                                    ? `${getWalletName(tx.walletId)} ← ${getWalletName(tx.toWalletId || "")}`
                                    : getWalletName(tx.walletId)}{" "}
                                  · {tx.date}
                                </div>
                              </div>
                            </div>
                            <div className="ms-tx-right">
                              <span
                                className={`ms-tx-amount ${
                                  isExp ? "ms-num-expense" : isInc ? "ms-num-income" : "ms-num-primary"
                                }`}
                              >
                                {isExp ? "−" : isInc ? "+" : ""}
                                {formatMoney(tx.amount, state.currencyMode)}
                              </span>
                              <button
                                type="button"
                                className="ms-icon-btn"
                                title="حذف العملية"
                                onClick={() => handleDeleteTx(tx)}
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>

              {/* Backup & Reset */}
              <section className="ms-card">
                <div className="ms-section-head" style={{ marginBottom: 0, flexWrap: "wrap" }}>
                  <div>
                    <h2>حفظ بياناتك</h2>
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ms-muted)" }}>
                      بياناتك محفوظة تلقائياً على هذا الجهاز. يمكنك تنزيل نسخة احتياطية في أي وقت.
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" className="ms-btn-outline" onClick={handleExportBackup}>
                      ⬇️ تصدير نسخة
                    </button>
                    <button type="button" className="ms-btn-outline" onClick={() => fileInputRef.current?.click()}>
                      ⬆️ استيراد نسخة
                    </button>
                    <button type="button" className="ms-btn-outline" onClick={handleResetData}>
                      🗑️ تصفير البيانات
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="application/json"
                      style={{ display: "none" }}
                      onChange={handleImportBackup}
                    />
                  </div>
                </div>
              </section>
            </>
          )}

          {tab === "wallets" && (
            <section>
              <div className="ms-section-head">
                <h2>محافظك وحساباتك</h2>
                <button type="button" className="ms-btn" onClick={() => setWalletModal(true)}>
                  + إضافة محفظة
                </button>
              </div>
              <div className="ms-wallet-grid">
                {state.wallets.map((w) => (
                  <div key={w.id} className="ms-wallet-card">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 26 }}>{w.emoji}</span>
                      <span className="ms-badge ms-badge-ok">نشطة</span>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{w.name}</div>
                    <div className="ms-kpi-num ms-num-primary">{formatMoney(w.balance, state.currencyMode)}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {tab === "goals" && (
            <section>
              <div className="ms-section-head">
                <h2>أهداف الادخار</h2>
                <button type="button" className="ms-btn" onClick={() => setGoalModal(true)}>
                  + هدف جديد
                </button>
              </div>
              {state.goals.length === 0 ? (
                <div className="ms-card ms-empty">لا توجد أهداف ادخار حالياً. أضف هدفك الأول مثل رأس مال التجارة!</div>
              ) : (
                <div className="ms-grid-2">
                  {state.goals.map((g) => {
                    const pct = Math.min(100, Math.round((g.saved / g.target) * 100));
                    const remaining = Math.max(0, g.target - g.saved);
                    return (
                      <div key={g.id} className="ms-card">
                        <div className="ms-section-head" style={{ marginBottom: 10 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 22 }}>{g.emoji}</span>
                            <strong>{g.title}</strong>
                          </div>
                          <button type="button" className="ms-icon-btn" onClick={() => handleDeleteGoal(g.id)} title="حذف الهدف">
                            ✕
                          </button>
                        </div>

                        <div className="ms-bar-row" style={{ marginBottom: 12 }}>
                          <div className="ms-bar-head">
                            <span>المجموع: {formatMoney(g.saved, state.currencyMode)}</span>
                            <span>{pct}%</span>
                          </div>
                          <div className="ms-bar-track">
                            <div className="ms-bar-fill" style={{ width: `${pct}%`, background: "#0f766e" }} />
                          </div>
                          <div className="ms-tx-meta">
                            الهدف: {formatMoney(g.target, state.currencyMode)} · المتبقي:{" "}
                            {formatMoney(remaining, state.currencyMode)}
                          </div>
                        </div>

                        <button
                          type="button"
                          className="ms-btn"
                          style={{ width: "100%" }}
                          onClick={() => {
                            setFundGoalId(g.id);
                            setFundAmount("");
                            if (state.wallets[0]) setFundWalletId(state.wallets[0].id);
                          }}
                        >
                          + إضافة مبلغ لهذا الهدف
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {tab === "budgets" && (
            <section className="ms-card">
              <div className="ms-section-head">
                <h2>سقف الميزانية الشهرية ({formatMonthAr(monthKey)})</h2>
              </div>
              <div className="ms-list">
                {EXPENSE_CATEGORIES.map((cat) => {
                  const limit = state.budgets[cat.id] || 0;
                  const spent = expenseByCategory[cat.id] || 0;
                  const pct = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
                  const over = limit > 0 && spent > limit;
                  const warn = limit > 0 && pct >= 75 && !over;

                  return (
                    <div key={cat.id} className="ms-tx-item" style={{ flexDirection: "column", alignItems: "stretch" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>
                          {cat.emoji} {cat.label}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 12, color: "var(--ms-muted)" }}>السقف (دج):</span>
                          <input
                            type="number"
                            min={0}
                            className="ms-input"
                            style={{ width: 110, padding: "6px 8px" }}
                            value={limit || ""}
                            placeholder="0"
                            onChange={(e) => handleBudgetChange(cat.id, e.target.value)}
                          />
                        </div>
                      </div>

                      {limit > 0 && (
                        <div className="ms-bar-row" style={{ marginTop: 6 }}>
                          <div className="ms-bar-head">
                            <span>المصروف: {formatMoney(spent, state.currencyMode)}</span>
                            <span className={`ms-badge ${over ? "ms-badge-danger" : warn ? "ms-badge-warn" : "ms-badge-ok"}`}>
                              {over ? "تجاوزت السقف!" : `${pct}%`}
                            </span>
                          </div>
                          <div className="ms-bar-track">
                            <div
                              className="ms-bar-fill"
                              style={{
                                width: `${pct}%`,
                                background: over ? "#be123c" : warn ? "#d97706" : "#0f766e",
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <nav className="ms-bottom-nav" aria-label="قائمة الهاتف">
        <button type="button" className={tab === "dashboard" ? "active" : ""} onClick={() => setTab("dashboard")}>
          <span>📊</span>
          <span>الرئيسية</span>
        </button>
        <button type="button" className={tab === "wallets" ? "active" : ""} onClick={() => setTab("wallets")}>
          <span>👛</span>
          <span>المحافظ</span>
        </button>
        <button type="button" className={tab === "goals" ? "active" : ""} onClick={() => setTab("goals")}>
          <span>🎯</span>
          <span>الأهداف</span>
        </button>
        <button type="button" className={tab === "budgets" ? "active" : ""} onClick={() => setTab("budgets")}>
          <span>📋</span>
          <span>الميزانية</span>
        </button>
      </nav>

      {/* Transaction Modal */}
      {txModal && (
        <div className="ms-modal-backdrop" onClick={() => setTxModal(null)}>
          <div className="ms-modal" onClick={(e) => e.stopPropagation()}>
            <h3>
              {txModal === "expense" ? "تسجيل مصروف جديد" : txModal === "income" ? "تسجيل مدخول جديد" : "تحويل بين المحافظ"}
            </h3>
            <form onSubmit={handleSaveTx}>
              <div className="ms-field">
                <label>المبلغ (بالدينار الجزائري دج)</label>
                <input
                  type="number"
                  min={1}
                  required
                  autoFocus
                  className="ms-input"
                  placeholder="مثال: 2500"
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                />
              </div>

              {txModal !== "transfer" && (
                <>
                  <div className="ms-field">
                    <label>الفئة</label>
                    <select
                      className="ms-select"
                      value={txCategory}
                      onChange={(e) => {
                        setTxCategory(e.target.value);
                        setSelectedSubItem(null);
                      }}
                    >
                      {(txModal === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.emoji} {c.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {txModal === "expense" && CATEGORY_ITEMS[txCategory] && (
                    <div className="ms-subitems-wrap">
                      <div className="ms-subitems-head">
                        <span>اختر المادة بسرعة (اضغط ⭐ لتثبيتها في الأعلى)</span>
                      </div>
                      <div className="ms-subitems-grid">
                        {[...CATEGORY_ITEMS[txCategory]]
                          .sort((a, b) => {
                            const favs = state.favoriteItems || [];
                            return (favs.includes(b.id) ? 1 : 0) - (favs.includes(a.id) ? 1 : 0);
                          })
                          .map((item) => {
                            const isFav = (state.favoriteItems || []).includes(item.id);
                            const isSel = selectedSubItem?.id === item.id;
                            return (
                              <div
                                key={item.id}
                                className={`ms-subitem-card ${isFav ? "fav" : ""} ${isSel ? "selected" : ""}`}
                                onClick={() => {
                                  setSelectedSubItem(item);
                                  setTxNote(item.label);
                                }}
                              >
                                <button
                                  type="button"
                                  className={`ms-star-btn ${isFav ? "active" : ""}`}
                                  title="تثبيت في المفضلة"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleFavoriteItem(item.id);
                                  }}
                                >
                                  {isFav ? "★" : "☆"}
                                </button>
                                <div className="ms-subitem-emoji">{item.emoji}</div>
                                <div className="ms-subitem-name">{item.label}</div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="ms-field">
                <label>{txModal === "transfer" ? "من المحفظة" : "المحفظة"}</label>
                <select className="ms-select" value={txWallet} onChange={(e) => setTxWallet(e.target.value)}>
                  {state.wallets.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.emoji} {w.name}
                    </option>
                  ))}
                </select>
              </div>

              {txModal === "transfer" && (
                <div className="ms-field">
                  <label>إلى المحفظة</label>
                  <select className="ms-select" value={txToWallet} onChange={(e) => setTxToWallet(e.target.value)}>
                    {state.wallets.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.emoji} {w.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="ms-field">
                <label>التاريخ</label>
                <input type="date" className="ms-input" value={txDate} onChange={(e) => setTxDate(e.target.value)} />
              </div>

              <div className="ms-field">
                <label>ملاحظة (اختياري)</label>
                <input
                  type="text"
                  className="ms-input"
                  placeholder="مثال: مقاضي الأسبوع"
                  value={txNote}
                  onChange={(e) => setTxNote(e.target.value)}
                />
              </div>

              <div className="ms-modal-actions">
                <button type="button" className="ms-btn-outline" onClick={() => setTxModal(null)}>
                  إلغاء
                </button>
                <button type="submit" className="ms-btn">
                  حفظ العملية
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Wallet Modal */}
      {walletModal && (
        <div className="ms-modal-backdrop" onClick={() => setWalletModal(false)}>
          <div className="ms-modal" onClick={(e) => e.stopPropagation()}>
            <h3>إضافة محفظة جديدة</h3>
            <form onSubmit={handleAddWallet}>
              <div className="ms-field">
                <label>اسم المحفظة</label>
                <input
                  type="text"
                  required
                  className="ms-input"
                  placeholder="مثال: حساب بنكي / شحيحة العمل"
                  value={newWalletName}
                  onChange={(e) => setNewWalletName(e.target.value)}
                />
              </div>
              <div className="ms-field">
                <label>أيقونة</label>
                <input
                  type="text"
                  className="ms-input"
                  value={newWalletEmoji}
                  onChange={(e) => setNewWalletEmoji(e.target.value)}
                />
              </div>
              <div className="ms-field">
                <label>الرصيد الحالي (دج)</label>
                <input
                  type="number"
                  className="ms-input"
                  placeholder="0"
                  value={newWalletBalance}
                  onChange={(e) => setNewWalletBalance(e.target.value)}
                />
              </div>
              <div className="ms-modal-actions">
                <button type="button" className="ms-btn-outline" onClick={() => setWalletModal(false)}>
                  إلغاء
                </button>
                <button type="submit" className="ms-btn">
                  إضافة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Goal Modal */}
      {goalModal && (
        <div className="ms-modal-backdrop" onClick={() => setGoalModal(false)}>
          <div className="ms-modal" onClick={(e) => e.stopPropagation()}>
            <h3>إضافة هدف ادخار جديد</h3>
            <form onSubmit={handleAddGoal}>
              <div className="ms-field">
                <label>اسم الهدف</label>
                <input
                  type="text"
                  required
                  className="ms-input"
                  placeholder="مثال: رأس مال التجارة الإلكترونية"
                  value={newGoalTitle}
                  onChange={(e) => setNewGoalTitle(e.target.value)}
                />
              </div>
              <div className="ms-field">
                <label>أيقونة</label>
                <input
                  type="text"
                  className="ms-input"
                  value={newGoalEmoji}
                  onChange={(e) => setNewGoalEmoji(e.target.value)}
                />
              </div>
              <div className="ms-field">
                <label>المبلغ المستهدف (دج)</label>
                <input
                  type="number"
                  min={1}
                  required
                  className="ms-input"
                  placeholder="100000"
                  value={newGoalTarget}
                  onChange={(e) => setNewGoalTarget(e.target.value)}
                />
              </div>
              <div className="ms-modal-actions">
                <button type="button" className="ms-btn-outline" onClick={() => setGoalModal(false)}>
                  إلغاء
                </button>
                <button type="submit" className="ms-btn">
                  حفظ الهدف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Fund Goal Modal */}
      {fundGoalId && (
        <div className="ms-modal-backdrop" onClick={() => setFundGoalId(null)}>
          <div className="ms-modal" onClick={(e) => e.stopPropagation()}>
            <h3>إضافة مبلغ للهدف</h3>
            <form onSubmit={handleFundGoal}>
              <div className="ms-field">
                <label>المبلغ (دج)</label>
                <input
                  type="number"
                  min={1}
                  required
                  autoFocus
                  className="ms-input"
                  placeholder="5000"
                  value={fundAmount}
                  onChange={(e) => setFundAmount(e.target.value)}
                />
              </div>
              <div className="ms-field">
                <label>خصم من المحفظة</label>
                <select className="ms-select" value={fundWalletId} onChange={(e) => setFundWalletId(e.target.value)}>
                  {state.wallets.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.emoji} {w.name} ({formatMoney(w.balance, state.currencyMode)})
                    </option>
                  ))}
                </select>
              </div>
              <div className="ms-modal-actions">
                <button type="button" className="ms-btn-outline" onClick={() => setFundGoalId(null)}>
                  إلغاء
                </button>
                <button type="submit" className="ms-btn">
                  تأكيد الإضافة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
