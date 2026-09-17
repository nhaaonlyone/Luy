import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  deleteDoc,
  doc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-storage.js";
import { firebaseConfig, isFirebaseConfigured } from "./firebase-config.js";

const setupScreen = document.getElementById("setup-screen");
const authScreen = document.getElementById("auth-screen");
const appScreen = document.getElementById("app-screen");
const authForm = document.getElementById("auth-form");
const authError = document.getElementById("auth-error");
const expenseForm = document.getElementById("expense-form");
const formError = document.getElementById("form-error");
const expenseList = document.getElementById("expense-list");
const filterDate = document.getElementById("filter-date");
const expenseDate = document.getElementById("expense-date");
const currencySelect = document.getElementById("currency-select");

const CURRENCY_KEY = "luy-currency";
const KHR_PER_USD = 4100;

let db;
let storage;
let auth;
let currentUser = null;
let allExpenses = [];
let unsubscribeExpenses = null;

function todayIso() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function show(screen) {
  setupScreen.classList.add("hidden");
  authScreen.classList.add("hidden");
  appScreen.classList.add("hidden");
  screen.classList.remove("hidden");
}

function showError(el, message) {
  if (!message) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = message;
}

function formatMoney(amount, currency) {
  const value = Number(amount) || 0;
  if (currency === "KHR") {
    return `៛${Math.round(value).toLocaleString("en-US")}`;
  }
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function toDisplayAmount(expense, currency) {
  if (expense.currency === currency) return Number(expense.amount) || 0;
  if (currency === "KHR") return (Number(expense.amount) || 0) * KHR_PER_USD;
  return (Number(expense.amount) || 0) / KHR_PER_USD;
}

function monthPrefix(isoDate) {
  return isoDate.slice(0, 7);
}

function render() {
  const currency = currencySelect.value;
  const selectedDay = filterDate.value || todayIso();
  const month = monthPrefix(todayIso());
  const today = todayIso();

  const dayItems = allExpenses.filter((item) => item.date === selectedDay);
  const todayTotal = allExpenses
    .filter((item) => item.date === today)
    .reduce((sum, item) => sum + toDisplayAmount(item, currency), 0);
  const monthTotal = allExpenses
    .filter((item) => monthPrefix(item.date) === month)
    .reduce((sum, item) => sum + toDisplayAmount(item, currency), 0);
  const dayTotal = dayItems.reduce((sum, item) => sum + toDisplayAmount(item, currency), 0);

  document.getElementById("stat-today").textContent = formatMoney(todayTotal, currency);
  document.getElementById("stat-month").textContent = formatMoney(monthTotal, currency);
  document.getElementById("stat-count").textContent = String(allExpenses.length);
  document.getElementById("day-total").textContent = dayItems.length
    ? `${dayItems.length} item${dayItems.length === 1 ? "" : "s"} · ${formatMoney(dayTotal, currency)}`
    : "No spending yet";

  expenseList.innerHTML = "";
  if (!dayItems.length) return;

  dayItems.forEach((item) => {
    const li = document.createElement("li");
    const meta = document.createElement("div");
    meta.innerHTML = `<strong>${item.category}</strong><small>${item.note || "No note"} · ${item.currency}</small>`;

    const amount = document.createElement("div");
    amount.innerHTML = `<strong>${formatMoney(toDisplayAmount(item, currency), currency)}</strong>`;

    const actions = document.createElement("div");
    if (item.receiptUrl) {
      const link = document.createElement("a");
      link.href = item.receiptUrl;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "Receipt";
      actions.appendChild(link);
    }

    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn danger";
    del.textContent = "Delete";
    del.addEventListener("click", () => deleteExpense(item));
    actions.appendChild(del);

    li.append(meta, amount, actions);
    expenseList.appendChild(li);
  });
}

function listenToExpenses(uid) {
  if (unsubscribeExpenses) unsubscribeExpenses();
  const expensesRef = collection(db, "users", uid, "expenses");
  const expensesQuery = query(expensesRef, orderBy("date", "desc"));
  unsubscribeExpenses = onSnapshot(
    expensesQuery,
    (snapshot) => {
      allExpenses = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      render();
    },
    (error) => {
      showError(formError, error.message);
    }
  );
}

async function uploadReceipt(file, uid) {
  const safeName = `${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
  const fileRef = ref(storage, `users/${uid}/receipts/${safeName}`);
  await uploadBytes(fileRef, file);
  const url = await getDownloadURL(fileRef);
  return { url, path: fileRef.fullPath };
}

async function deleteExpense(item) {
  if (!currentUser) return;
  const ok = window.confirm("Delete this expense?");
  if (!ok) return;
  await deleteDoc(doc(db, "users", currentUser.uid, "expenses", item.id));
  if (item.receiptPath) {
    try {
      await deleteObject(ref(storage, item.receiptPath));
    } catch {
      // Receipt may already be gone; the Firestore record is the source of truth.
    }
  }
}

if (!isFirebaseConfigured()) {
  show(setupScreen);
} else {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);

  currencySelect.value = localStorage.getItem(CURRENCY_KEY) || "USD";
  expenseDate.value = todayIso();
  filterDate.value = todayIso();

  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (!user) {
      if (unsubscribeExpenses) unsubscribeExpenses();
      allExpenses = [];
      show(authScreen);
      return;
    }
    show(appScreen);
    listenToExpenses(user.uid);
  });

  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    showError(authError);
    const email = document.getElementById("auth-email").value.trim();
    const password = document.getElementById("auth-password").value;
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      showError(authError, error.message);
    }
  });

  document.getElementById("sign-up-btn").addEventListener("click", async () => {
    showError(authError);
    const email = document.getElementById("auth-email").value.trim();
    const password = document.getElementById("auth-password").value;
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (error) {
      showError(authError, error.message);
    }
  });

  document.getElementById("sign-out-btn").addEventListener("click", () => signOut(auth));

  currencySelect.addEventListener("change", () => {
    localStorage.setItem(CURRENCY_KEY, currencySelect.value);
    render();
  });

  filterDate.addEventListener("change", render);

  expenseForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    showError(formError);
    if (!currentUser) return;

    const saveBtn = document.getElementById("save-btn");
    saveBtn.disabled = true;
    try {
      const amount = Number(document.getElementById("expense-amount").value);
      if (!Number.isFinite(amount) || amount < 0) {
        throw new Error("Enter a valid amount.");
      }

      const receiptFile = document.getElementById("expense-receipt").files[0];
      let receiptUrl = "";
      let receiptPath = "";
      if (receiptFile) {
        const uploaded = await uploadReceipt(receiptFile, currentUser.uid);
        receiptUrl = uploaded.url;
        receiptPath = uploaded.path;
      }

      await addDoc(collection(db, "users", currentUser.uid, "expenses"), {
        amount,
        currency: currencySelect.value,
        category: document.getElementById("expense-category").value,
        note: document.getElementById("expense-note").value.trim(),
        date: document.getElementById("expense-date").value,
        receiptUrl,
        receiptPath,
        createdAt: serverTimestamp(),
      });

      expenseForm.reset();
      expenseDate.value = filterDate.value || todayIso();
      document.getElementById("expense-category").value = "Food";
    } catch (error) {
      showError(formError, error.message);
    } finally {
      saveBtn.disabled = false;
    }
  });
}
