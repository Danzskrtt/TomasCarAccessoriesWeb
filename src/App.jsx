import { useEffect, useRef, useState } from "react";
import atomeCardQr from "../qrcode/atomecard.jpg";
import gcashQr from "../qrcode/gcash.jpg";
import mariBankQr from "../qrcode/maribank.jpg";
import mayaQr from "../qrcode/maya.jpg";

const initialSubtitle = "Enter your details to access your workspace.";
const paymentQrCodes = {
  Card: atomeCardQr,
  GCash: gcashQr,
  Maya: mayaQr,
  MariBank: mariBankQr,
};

function saveSession() {
  window.location.assign("/dashboard");
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Something went wrong.");
  return result;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Something went wrong.");
  return result;
}

function Login() {
  const [view, setView] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [email, setEmail] = useState("");
  const [activeEmail, setActiveEmail] = useState("");
  const [code, setCode] = useState(Array(6).fill(""));
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const codeRefs = useRef([]);

  useEffect(() => {
    if (!seconds) return undefined;
    const timer = window.setInterval(
      () => setSeconds((value) => value - 1),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [seconds]);

  const submitLogin = async (event) => {
    event.preventDefault();
    setMessage(null);
    if (!username.trim() || !password)
      return setMessage({
        text: "Enter your username and password.",
        type: "error",
      });
    setBusy(true);
    try {
      const result = await postJson("/api/auth/login", {
        username: username.trim(),
        password,
      });
      saveSession();
    } catch (error) {
      setMessage({ text: error.message, type: "error" });
    } finally {
      setBusy(false);
    }
  };

  const requestCode = async (event, isResend = false) => {
    event?.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    setMessage(null);
    if (!/^[^\s@]+@gmail\.com$/i.test(normalizedEmail))
      return setMessage({
        text:
          view === "forgot"
            ? "This Gmail address is not registered."
            : "Enter a valid Gmail address.",
        type: "error",
      });
    setBusy(true);
    try {
      const reset = view === "forgot";
      await postJson(reset ? "/api/auth/request-reset-code" : "/api/auth/request-code", { email: normalizedEmail });
      setActiveEmail(normalizedEmail);
      setCode(Array(6).fill(""));
      setView(reset ? "reset" : "otp");
      setSeconds(60);
      setMessage({
        text: "Check your inbox for the six-digit code.",
        type: "success",
      });
      window.setTimeout(() => codeRefs.current[0]?.focus(), 0);
    } catch (error) {
      setMessage({ text: error.message, type: "error" });
    } finally {
      setBusy(false);
    }
    return isResend;
  };

  const updateCode = (index, value) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    setCode((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? digit : item)),
    );
    if (digit && index < 5) codeRefs.current[index + 1]?.focus();
  };

  const handleCodeKey = (event, index) => {
    if (event.key === "Backspace" && !code[index] && index > 0)
      codeRefs.current[index - 1]?.focus();
  };

  const handlePaste = (event) => {
    const pasted = event.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);
    if (!pasted) return;
    event.preventDefault();
    setCode(pasted.split("").concat(Array(6).fill("")).slice(0, 6));
    codeRefs.current[Math.min(pasted.length, 6) - 1]?.focus();
  };

  const verifyCode = async (event) => {
    event.preventDefault();
    if (code.join("").length !== 6)
      return setMessage({ text: "Enter all six digits.", type: "error" });
    setBusy(true);
    try {
      const result = await postJson("/api/auth/verify-code", {
        email: activeEmail,
        code: code.join(""),
      });
      saveSession();
    } catch (error) {
      setMessage({ text: error.message, type: "error" });
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async (event) => {
    event.preventDefault();
    if (code.join("").length !== 6)
      return setMessage({ text: "Enter all six digits.", type: "error" });
    if (newPassword.length < 8)
      return setMessage({ text: "Password must be at least 8 characters.", type: "error" });
    setBusy(true);
    try {
      await postJson("/api/auth/reset-password", {
        email: activeEmail,
        code: code.join(""),
        password: newPassword,
      });
      setEmail(activeEmail);
      setNewPassword("");
      setView("login");
      setMessage({ text: "Password reset. You can sign in now.", type: "success" });
    } catch (error) {
      setMessage({ text: error.message, type: "error" });
    } finally {
      setBusy(false);
    }
  };

  const showLogin = () => {
    setView("login");
    setMessage(null);
  };
  const showEmail = () => {
    setView("email");
    setMessage(null);
  };
  const showForgot = () => {
    setView("forgot");
    setMessage(null);
  };
  const title =
    view === "otp"
      ? "Enter your verification code"
      : view === "forgot"
        ? "Reset your password"
        : view === "reset"
          ? "Choose a new password"
          : "Sign in to your workspace";
  const subtitle =
    view === "otp"
      ? "We sent a six-digit code to your Gmail address."
      : view === "forgot"
        ? "Enter your Gmail address to receive a reset code."
        : view === "reset"
          ? "Enter the code from Gmail and your new password."
      : initialSubtitle;

  return (
    <main className="page-shell">
      <section
        className="visual-panel"
        aria-label="Tomas Car Accessories showroom"
      />
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-card">
          <div className="mobile-brand" aria-hidden="true">
            <span className="brand-mark">T</span>
            <span>
              Tomas <strong>Car Accessories</strong>
            </span>
          </div>
          <div className="login-heading">
            <img
              className="login-logo"
              src="/images/tomas-logo.png"
              alt="Tomas Car Accessories"
            />
            <h2 id="login-title">{title}</h2>
            <p>{subtitle}</p>
          </div>
          {view === "login" && (
            <form onSubmit={submitLogin} autoComplete="off">
              <div className="field-group">
                <label htmlFor="username">Username</label>
                <div className="input-wrap">
                  <span className="input-icon" aria-hidden="true">
                    @
                  </span>
                  <input
                    id="username"
                    autoComplete="off"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="Enter your username"
                    required
                  />
                </div>
              </div>
              <div className="field-group password-field">
                <label htmlFor="password">Password</label>
                <div className="input-wrap">
                  <span className="input-icon password-icon" aria-hidden="true">
                    &#128274;&#xfe0e;
                  </span>
                  <input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    required
                  />
                </div>
              </div>
              <div className="login-options">
                <label className="remember-row">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(event) => setRemember(event.target.checked)}
                  />
                  <span className="custom-checkbox" aria-hidden="true" />
                  Remember me
                </label>
                <button className="forgot-button" type="button" onClick={showForgot}>
                  Forgot password?
                </button>
              </div>
              <button className="submit-button" type="submit" disabled={busy}>
                <span>{busy ? "Signing in..." : "Login now"}</span>
                <span className="button-arrow" aria-hidden="true">
                  -&gt;
                </span>
              </button>
              <button className="gmail-button" type="button" onClick={showEmail}>
                <span className="gmail-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M3.5 5.5h17v13h-17z" fill="#fff" />
                    <path d="m4 6 8 6 8-6" stroke="#d93025" strokeWidth="2" />
                    <path d="M4 18.5V6l8 6 8-6v12.5" stroke="#ea4335" strokeWidth="2" />
                  </svg>
                </span>
                Or sign in with Gmail
              </button>
            </form>
          )}
          {view === "email" && (
            <form onSubmit={requestCode}>
              <div className="field-group">
                <label htmlFor="email">Email verification address</label>
                <div className="input-wrap">
                  <span className="input-icon" aria-hidden="true">
                    @
                  </span>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@gmail.com"
                    required
                  />
                </div>
              </div>
              <button className="submit-button" type="submit" disabled={busy}>
                <span>{busy ? "Sending..." : "Send verification code"}</span>
                <span className="button-arrow" aria-hidden="true">
                  -&gt;
                </span>
              </button>
              <button
                className="text-button muted-button"
                type="button"
                onClick={showLogin}
              >
                Back to login
              </button>
            </form>
          )}
          {view === "forgot" && (
            <form onSubmit={requestCode}>
              <div className="field-group">
                <label htmlFor="reset-email">Gmail address</label>
                <div className="input-wrap">
                  <span className="input-icon" aria-hidden="true">@</span>
                  <input
                    id="reset-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@gmail.com"
                    required
                  />
                </div>
              </div>
              <button className="submit-button" type="submit" disabled={busy}>
                <span>{busy ? "Sending..." : "Send reset code"}</span>
                <span className="button-arrow" aria-hidden="true">-&gt;</span>
              </button>
              <button className="text-button muted-button" type="button" onClick={showLogin}>
                Back to login
              </button>
            </form>
          )}
          {view === "reset" && (
            <form onSubmit={resetPassword}>
              <div className="field-group">
                <label htmlFor="reset-code">Verification code</label>
                <div className="input-wrap">
                  <span className="input-icon" aria-hidden="true">#</span>
                  <input
                    id="reset-code"
                    inputMode="numeric"
                    maxLength="6"
                    value={code.join("")}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6).split(""))}
                    placeholder="Enter six-digit code"
                    required
                  />
                </div>
              </div>
              <div className="field-group">
                <label htmlFor="new-password">New password</label>
                <div className="input-wrap">
                  <span className="input-icon password-icon" aria-hidden="true">&#128274;&#xfe0e;</span>
                  <input
                    id="new-password"
                    type="password"
                    minLength="8"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="At least 8 characters"
                    required
                  />
                </div>
              </div>
              <button className="submit-button" type="submit" disabled={busy}>
                <span>{busy ? "Updating..." : "Reset password"}</span>
                <span className="button-arrow" aria-hidden="true">-&gt;</span>
              </button>
              <button className="text-button muted-button" type="button" onClick={showForgot}>
                Request a new code
              </button>
            </form>
          )}
          {view === "otp" && (
            <form onSubmit={verifyCode}>
              <p className="code-sent">
                Code sent to <strong>{activeEmail}</strong>
              </p>
              <div
                className="code-inputs"
                aria-label="Six digit verification code"
              >
                {code.map((digit, index) => (
                  <input
                    key={index}
                    ref={(element) => {
                      codeRefs.current[index] = element;
                    }}
                    value={digit}
                    inputMode="numeric"
                    maxLength="1"
                    aria-label={`Digit ${index + 1}`}
                    onChange={(event) => updateCode(index, event.target.value)}
                    onKeyDown={(event) => handleCodeKey(event, index)}
                    onPaste={handlePaste}
                  />
                ))}
              </div>
              <button className="submit-button" type="submit" disabled={busy}>
                <span>{busy ? "Verifying..." : "Verify code"}</span>
                <span className="button-arrow" aria-hidden="true">
                  -&gt;
                </span>
              </button>
              <button
                className="text-button"
                type="button"
                onClick={(event) => requestCode(event, true)}
                disabled={busy || seconds > 0}
              >
                Resend code {seconds ? `(${seconds}s)` : ""}
              </button>
              <button
                className="text-button muted-button"
                type="button"
                onClick={showEmail}
              >
                Use a different email
              </button>
            </form>
          )}
          {message && (
            <p
              className={`form-message ${message.type}`}
              role="status"
              aria-live="polite"
            >
              {message.text}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const seedTransactions = [];
const seedSalesHistory = [
  { date: startOfDay(new Date(Date.now() - 86400000)), revenue: 0, transactions: 0 },
  { date: startOfDay(new Date()), revenue: 0, transactions: 0 },
];

function trendPercent(current, previous) {
  return previous === 0 ? null : ((current - previous) / previous) * 100;
}

function Trend({ value }) {
  const className = value === null ? "neutral" : value >= 0 ? "up" : "down";
  return <em className={className}>{value === null ? "—" : `${value >= 0 ? "↑" : "↓"} ${Math.abs(value).toFixed(1)}%`}</em>;
}

function Icon({ name }) {
  const paths = {
    dashboard: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
    inventory: "M4 7h16v13H4zM8 7V4h8v3M4 11h16",
    cart: "M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 1.9-1.4L21 8H6M10 20h.01M18 20h.01",
    search: "m21 21-4.3-4.3M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4",
    bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
    plus: "M12 5v14M5 12h14",
    edit: "M4 20h4L19 9l-4-4L4 16zM13 6l4 4",
    trash: "M5 7h14M10 11v5M14 11v5M7 7l1 13h8l1-13M9 7V4h6v3",
    close: "M6 6l12 12M18 6 6 18",
    arrow: "M5 12h14m-6-6 6 6-6 6",
  };
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}

const money = (amount) => `₱${Math.abs(amount).toLocaleString("en-PH")}`;
function getDisplayUsername(session) {
  return (session?.username || session?.email?.split("@")[0] || "user").split("@")[0];
}

function getRole(session) {
  const role = String(session?.role || "cashier").trim().toLowerCase();
  if (["admin", "administrator"].includes(role)) return "admin";
  if (role === "manager") return "manager";
  return "cashier";
}

function getRoleLabel(session) {
  const role = getRole(session);
  return role === "admin" ? "Administrator" : role === "manager" ? "Manager" : "Cashier";
}

function getAllowedModules(session) {
  const role = getRole(session);
  if (role === "admin") return ["dashboard", "inventory", "reports", "pos"];
  if (role === "manager") return ["inventory", "reports"];
  return ["pos"];
}

function getDefaultModule(session) {
  return getAllowedModules(session)[0];
}

function Status({ product }) {
  const status =
    product.quantity === 0
      ? "Out of Stock"
      : product.quantity <= product.reorder
        ? "Low Stock"
        : "In Stock";
  return (
    <span
      className={`status-badge ${status.toLowerCase().replaceAll(" ", "-")}`}
    >
      {status}
    </span>
  );
}
function Sidebar({ active, setActive, session }) {
  const username = getDisplayUsername(session);
  const allowedModules = getAllowedModules(session);
  const labels = { dashboard: "Dashboard", inventory: "Inventory", reports: "Reports", pos: "POS" };
  return (
    <aside className="admin-sidebar">
      <div className="tomas-logo">
        <img src="/images/tomas-logo.png" alt="Tomas Car Accessories" />
      </div>
      <p className="nav-label">Workspace</p>
      <nav>
        {allowedModules.map((id) => (
          <button
            key={id}
            className={active === id ? "active" : ""}
            onClick={() => setActive(id)}
          >
            <Icon
              name={
                id === "pos"
                  ? "cart"
                  : id === "reports"
                    ? "dashboard"
                  : id === "inventory"
                    ? "inventory"
                    : "dashboard"
              }
            />
            {labels[id]}
            {id === "inventory" && <span className="nav-count">8</span>}
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div className="avatar">{username.slice(0, 2).toUpperCase()}</div>
        <div>
          <strong>{username}</strong>
          <small>{getRoleLabel(session)}</small>
        </div>
        <button
          aria-label="Sign out"
          className="sidebar-logout"
          onClick={() => {
            fetch("/api/auth/logout", { method: "POST" })
              .finally(() => window.location.replace("/"));
          }}
        >
          ↪
        </button>
      </div>
    </aside>
  );
}

function DashboardHome({ products, transactions, setActive, username, salesHistory }) {
  const alerts = products.filter(
    (product) => product.quantity <= product.reorder,
  );
  const [range, setRange] = useState("7");
  const periodLength = Number(range);
  const currentPeriod = salesHistory.slice(-periodLength);
  const previousPeriod = salesHistory.slice(-(periodLength * 2), -periodLength);
  const sum = (items, key) => items.reduce((total, item) => total + item[key], 0);
  const currentRevenue = sum(currentPeriod, "revenue");
  const previousRevenue = sum(previousPeriod, "revenue");
  const revenueTrend = trendPercent(currentRevenue, previousRevenue);
  const currentTransactions = sum(currentPeriod, "transactions");
  const previousTransactions = sum(previousPeriod, "transactions");
  const transactionTrend = trendPercent(currentTransactions, previousTransactions);
  const chart = currentPeriod.map((item) => Math.min(94, (item.revenue / 50000) * 100));
  const chartLabels = currentPeriod.map((item) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(item.date));
  const todayStats = salesHistory[salesHistory.length - 1];
  const yesterdayStats = salesHistory[salesHistory.length - 2];
  const todayRevenueTrend = trendPercent(todayStats.revenue, yesterdayStats.revenue);
  const todayTransactionTrend = trendPercent(todayStats.transactions, yesterdayStats.transactions);
  const today = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{today}</p>
          <h1>
            Good morning, {username} <span>↗</span>
          </h1>
          <p>Here’s what’s happening at your store today.</p>
        </div>
        <button className="primary-button" onClick={() => setActive("pos")}>
          <Icon name="plus" /> New sale
        </button>
      </div>
      <div className="kpi-grid">
        <article>
          <span className="kpi-icon red">₱</span>
          <div>
            <small>Today's revenue</small>
            <strong>{money(todayStats.revenue)}</strong>
            <Trend value={todayRevenueTrend} />
          </div>
          <i>vs. yesterday</i>
        </article>
        <article>
          <span className="kpi-icon blue">#</span>
          <div>
            <small>Total transactions</small>
            <strong>{todayStats.transactions}</strong>
            <Trend value={todayTransactionTrend} />
          </div>
          <i>vs. yesterday</i>
        </article>
        <article>
          <span className="kpi-icon orange">!</span>
          <div>
            <small>Low stock items</small>
            <strong>
              {
                products.filter(
                  (p) => p.quantity > 0 && p.quantity <= p.reorder,
                ).length
              }
            </strong>
            <em className="warning">Needs attention</em>
          </div>
          <i>items to reorder</i>
        </article>
        <article>
          <span className="kpi-icon dark">×</span>
          <div>
            <small>Out of stock</small>
            <strong>{products.filter((p) => p.quantity === 0).length}</strong>
            <em className="danger">Action required</em>
          </div>
          <i>items unavailable</i>
        </article>
      </div>
      <div className="dashboard-columns">
        <article className="panel sales-panel">
          <div className="panel-header">
            <div>
              <h2>Sales overview</h2>
              <p>Revenue performance</p>
            </div>
            <div className="segmented">
              <button
                className={range === "7" ? "selected" : ""}
                onClick={() => setRange("7")}
              >
                7 days
              </button>
              <button
                className={range === "30" ? "selected" : ""}
                onClick={() => setRange("30")}
              >
                30 days
              </button>
            </div>
          </div>
          <div className="chart">
            <div className="chart-y">
              <span>₱50k</span>
              <span>₱30k</span>
              <span>₱10k</span>
              <span>₱0</span>
            </div>
            <div className="chart-area">
              <div className="grid-lines">
                <i />
                <i />
                <i />
                <i />
              </div>
              <svg viewBox="0 0 700 240" preserveAspectRatio="none">
                <path
                  className="chart-fill"
                  d={`M0 ${240 - chart[0] * 2.5} ${chart.map((value, index) => `L${index * (700 / (chart.length - 1))} ${240 - value * 2.5}`).join(" ")} L700 240 L0 240Z`}
                />
                <path
                  className="chart-line"
                  d={chart
                    .map(
                      (value, index) =>
                        `${index ? "L" : "M"}${index * (700 / (chart.length - 1))} ${240 - value * 2.5}`,
                    )
                    .join(" ")}
                />
              </svg>
              <div className="chart-x">
                {chartLabels.map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
            </div>
          </div>
          <div className="chart-total">
            <span>
              {money(currentRevenue)} <small>Total revenue</small>
            </span>
            <Trend value={revenueTrend} />
          </div>
        </article>
        <article className="panel alerts-panel">
          <div className="panel-header">
            <div>
              <h2>Inventory alerts</h2>
              <p>Items that need your attention</p>
            </div>
            <button
              className="link-button"
              onClick={() => setActive("inventory")}
            >
              View inventory <Icon name="arrow" />
            </button>
          </div>
          <div className="alert-list">
            {alerts.length ? (
              alerts.map((product) => (
                <div className="alert-row" key={product.id}>
                  <span
                    className={`alert-symbol ${product.quantity === 0 ? "empty" : ""}`}
                  >
                    {product.quantity === 0 ? "×" : "!"}
                  </span>
                  <div>
                    <strong>{product.name}</strong>
                    <small>
                      {product.quantity === 0
                        ? "Out of stock"
                        : `${product.quantity} units left`}{" "}
                      · Reorder at {product.reorder}
                    </small>
                  </div>
                  <button onClick={() => setActive("inventory")}>
                    Restock
                  </button>
                </div>
              ))
            ) : (
              <div className="empty-state">
                No low stock items - inventory is healthy
              </div>
            )}
          </div>
        </article>
      </div>
      <article className="panel transactions-panel">
        <div className="panel-header">
          <div>
            <h2>Recent transactions</h2>
            <p>Latest activity from your store</p>
          </div>
          <button className="link-button" onClick={() => setActive("pos")}>
            View all <Icon name="arrow" />
          </button>
        </div>
        <TransactionTable transactions={transactions} />
      </article>
    </>
  );
}

function TransactionTable({ transactions }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Receipt no.</th>
            <th>Time</th>
            <th>Cashier</th>
            <th>Items</th>
            <th>Total</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((transaction) => (
            <tr key={transaction.receipt}>
              <td>
                <strong>{transaction.receipt}</strong>
              </td>
              <td>{transaction.time}</td>
              <td>{transaction.cashier}</td>
              <td>
                {transaction.items} {transaction.items === 1 ? "item" : "items"}
              </td>
              <td className={transaction.total < 0 ? "negative" : ""}>
                {transaction.total < 0 ? "-" : ""}
                {money(transaction.total)}
              </td>
              <td>
                <span
                  className={`table-status ${transaction.type.toLowerCase()}`}
                >
                  {transaction.type}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Inventory({ products, onCreateProduct, onUpdateProduct, onDeleteProduct, onAdjustStock }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All items");
  const [modal, setModal] = useState(false);
  const [editingProductId, setEditingProductId] = useState(null);
  const [error, setError] = useState("");
  const [stockModal, setStockModal] = useState(false);
  const [stockForm, setStockForm] = useState({ productId: "", delta: "", reason: "Stock count correction" });
  const [form, setForm] = useState({
    name: "",
    sku: "",
    category: "Interior",
    quantity: 0,
    price: 0,
    reorder: 5,
    imageData: null,
  });
  const categories = [
    "All items",
    "Tires",
    "Lighting",
    "Interior",
    "Exterior",
    "Tools",
  ];
  const filtered = products.filter(
    (p) =>
      (category === "All items" || p.category === category) &&
      `${p.name} ${p.sku}`.toLowerCase().includes(query.toLowerCase()),
  );
  const saveProduct = async (event) => {
    event.preventDefault();
    const product = {
      ...form,
      quantity: Number(form.quantity),
      price: Number(form.price),
      reorder: Number(form.reorder),
      imageData: form.imageData,
    };
    try {
      if (editingProductId === null) {
        await onCreateProduct(product);
      } else {
        await onUpdateProduct(editingProductId, product);
      }
      setModal(false);
      setEditingProductId(null);
      setError("");
      setForm({
        name: "",
        sku: "",
        category: "Interior",
        quantity: 0,
        price: 0,
        reorder: 5,
        imageData: null,
      });
    } catch (saveError) {
      setError(saveError.message);
    }
  };
  const openAddModal = () => {
    setEditingProductId(null);
    setError("");
    setForm({
      name: "",
      sku: "",
      category: "Interior",
      quantity: 0,
      price: 0,
      reorder: 5,
      imageData: null,
    });
    setModal(true);
  };
  const openEditModal = (product) => {
    setEditingProductId(product.id);
    setError("");
    setForm({
      name: product.name,
      sku: product.sku,
      category: product.category,
      quantity: product.quantity,
      price: product.price,
      reorder: product.reorder,
      imageData: product.imageData || null,
    });
    setModal(true);
  };
  const handleImageChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.match(/^image\/(png|jpeg|webp|gif)$/i) || file.size > 1.5 * 1024 * 1024) {
      setError("Choose a PNG, JPEG, WebP, or GIF image smaller than 1.5 MB.");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm((current) => ({ ...current, imageData: reader.result }));
      setError("");
    };
    reader.readAsDataURL(file);
  };
  const deleteProduct = async (productId) => {
    try {
      await onDeleteProduct(productId);
    } catch (deleteError) {
      setError(deleteError.message);
      setModal(true);
    }
  };
  const adjustStock = async (event) => {
    event.preventDefault();
    try {
      await onAdjustStock(stockForm.productId, { delta: Number(stockForm.delta), reason: stockForm.reason });
      setStockModal(false);
      setStockForm({ productId: "", delta: "", reason: "Stock count correction" });
      setError("");
    } catch (stockError) {
      setError(stockError.message);
    }
  };
  const exportCsv = () => {
    const headers = ["Product name", "SKU", "Category", "On hand", "Reorder at", "Unit price", "Status"];
    const escapeCsv = (value) => `"${String(value).replaceAll('"', '""')}"`;
    const rows = filtered.map((product) => [
      product.name,
      product.sku,
      product.category,
      product.quantity,
      product.reorder,
      product.price,
      product.quantity === 0 ? "Out of Stock" : product.quantity <= product.reorder ? "Low Stock" : "In Stock",
    ]);
    const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "tomas-inventory.csv";
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Catalog management</p>
          <h1>Inventory</h1>
          <p>Keep every shelf ready for the next customer.</p>
        </div>
        <button className="primary-button" onClick={openAddModal}>
          <Icon name="plus" /> Add new item
        </button>
      </div>
      <div className="inventory-toolbar">
        <div className="search-box">
          <Icon name="search" />
          <input
            placeholder="Search by name or SKU..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <button className="secondary-button" onClick={() => setStockModal(true)}>Adjust stock</button>
        <button className="secondary-button" onClick={exportCsv}>Export CSV</button>
      </div>
      <div className="category-tabs">
        {categories.map((item) => (
          <button
            className={category === item ? "selected" : ""}
            onClick={() => setCategory(item)}
            key={item}
          >
            {item}
          </button>
        ))}
      </div>
      <article className="panel inventory-table">
        <div className="table-meta">
          <strong>{filtered.length} products</strong>
          <span>Last updated just now</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product name</th>
                <th>SKU</th>
                <th>Category</th>
                <th>On hand</th>
                <th>Reorder at</th>
                <th>Unit price</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((product) => (
                <tr key={product.id}>
                  <td>
                    {product.imageData && (
                      <img className="inventory-product-image" src={product.imageData} alt="" />
                    )}
                    <strong>{product.name}</strong>
                  </td>
                  <td className="muted-cell">{product.sku}</td>
                  <td>{product.category}</td>
                  <td>
                    <strong>{product.quantity}</strong>
                  </td>
                  <td>{product.reorder}</td>
                  <td>{money(product.price)}</td>
                  <td>
                    <Status product={product} />
                  </td>
                  <td>
                    <div className="row-actions">
                      <button title="Edit" onClick={() => openEditModal(product)}>
                        <Icon name="edit" />
                      </button>
                      <button
                        title="Delete"
                        onClick={() => deleteProduct(product.id)}
                      >
                        <Icon name="trash" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && (
            <div className="empty-state">No products match your search.</div>
          )}
        </div>
      </article>
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(false)}>
          <form
            className="modal"
            onSubmit={saveProduct}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">Catalog</p>
                <h2>{editingProductId === null ? "Add new item" : "Edit item"}</h2>
              </div>
              <button
                type="button"
                aria-label="Close"
                className="icon-button"
                onClick={() => setModal(false)}
              >
                <Icon name="close" />
              </button>
            </div>
            {error && <p className="form-message error">{error}</p>}
            <label>
              Product image
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleImageChange} />
            </label>
            {form.imageData && <img className="product-image-preview" src={form.imageData} alt="Product preview" />}
            {[
              ["name", "Product name"],
              ["sku", "SKU"],
              ["category", "Category"],
              ["quantity", "Quantity on hand"],
              ["price", "Unit price"],
              ["reorder", "Reorder threshold"],
            ].map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  required={key !== "quantity"}
                  type={
                    ["quantity", "price", "reorder"].includes(key)
                      ? "number"
                      : "text"
                  }
                  value={form[key]}
                  onChange={(event) =>
                    setForm({ ...form, [key]: event.target.value })
                  }
                />
              </label>
            ))}
            <button className="primary-button" type="submit">
              {editingProductId === null ? "Save item" : "Save changes"}
            </button>
          </form>
        </div>
      )}
      {stockModal && (
        <div className="modal-backdrop" onClick={() => setStockModal(false)}>
          <form className="modal" onSubmit={adjustStock} onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div><p className="eyebrow">Inventory</p><h2>Adjust stock</h2></div>
              <button type="button" aria-label="Close" className="icon-button" onClick={() => setStockModal(false)}><Icon name="close" /></button>
            </div>
            {error && <p className="form-message error">{error}</p>}
            <label>Product<select required value={stockForm.productId} onChange={(event) => setStockForm({ ...stockForm, productId: event.target.value })}>
              <option value="">Select a product</option>
              {products.map((product) => <option key={product.id} value={product.id}>{product.name} ({product.quantity} on hand)</option>)}
            </select></label>
            <label>Quantity change<input required type="number" value={stockForm.delta} onChange={(event) => setStockForm({ ...stockForm, delta: event.target.value })} placeholder="e.g. 10 or -2" /></label>
            <label>Reason<input required value={stockForm.reason} onChange={(event) => setStockForm({ ...stockForm, reason: event.target.value })} /></label>
            <button className="primary-button" type="submit">Save adjustment</button>
          </form>
        </div>
      )}
    </>
  );
}

function POS({ products, transactions, setTransactions, setProducts }) {
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [payment, setPayment] = useState("Cash");
  const [tendered, setTendered] = useState("");
  const [taxRate, setTaxRate] = useState(12);
  const [discountType, setDiscountType] = useState("None");
  const [discountId, setDiscountId] = useState("");
  const [receipt, setReceipt] = useState(null);
  const [returns, setReturns] = useState(false);
  const available = products.filter(
    (p) =>
      `${p.name} ${p.sku} ${p.category}`
        .toLowerCase()
        .includes(search.toLowerCase()) && p.quantity > 0,
  );
  const add = (product) => setCart((current) => {
    const existing = current.find((item) => item.id === product.id);
    if (existing && existing.count >= product.quantity) return current;
    return existing
      ? current.map((item) => item.id === product.id ? { ...item, count: item.count + 1 } : item)
      : [...current, { ...product, count: 1 }];
  });
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.count, 0);
  const discount = discountType === "None" ? 0 : subtotal * 0.2;
  const taxable = Math.max(0, subtotal - discount);
  const tax = taxable * (taxRate / 100);
  const total = taxable + tax;
  const searchInput = useRef(null);
  const completeSale = () => {
    if (!cart.length || (payment === "Cash" && Number(tendered || 0) < total)) return;
    const receiptNumber = `TOM-${10483 + transactions.length}`;
    setTransactions((current) => [
      {
        receipt: receiptNumber,
        time: "Just now",
        cashier: "M. Santos",
        total,
        items: cart.length,
        type: "Sale",
      },
      ...current,
    ]);
    setProducts((current) => current.map((product) => {
      const line = cart.find((item) => item.id === product.id);
      return line ? { ...product, quantity: product.quantity - line.count } : product;
    }));
    setReceipt({ receiptNumber, items: cart, subtotal, tax, discount, total, payment });
    setCart([]);
    setTendered("");
    setDiscountId("");
  };
  useEffect(() => {
    const handleShortcut = (event) => {
      if (event.key === "F2") { event.preventDefault(); completeSale(); }
      if (event.key === "Escape") { event.preventDefault(); setCart([]); setDiscountId(""); }
      if (event.key === "Enter" && document.activeElement === searchInput.current && available[0]) { event.preventDefault(); add(available[0]); setSearch(""); }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Sales terminal</p>
          <h1>Point of sale</h1>
          <p>Build a sale, attach a customer, and check out in seconds.</p>
        </div>
        <div className="mode-switch">
          <button
            className={!returns ? "selected" : ""}
            onClick={() => setReturns(false)}
          >
            New sale
          </button>
          <button
            className={returns ? "selected" : ""}
            onClick={() => setReturns(true)}
          >
            Returns & refunds
          </button>
        </div>
      </div>
      {returns ? (
        <article className="panel returns-panel">
          <span className="kpi-icon orange">↩</span>
          <h2>Find a transaction to refund</h2>
          <p>
            Search by receipt number or customer to start a return. Refunds are
            logged for audit review.
          </p>
          <div className="search-box">
            <Icon name="search" />
            <input placeholder="e.g. TOM-10482 or customer name" />
          </div>
          <div className="empty-state">
            Enter a receipt number to view returnable items.
          </div>
        </article>
      ) : (
        <div className="pos-layout">
          <section className="pos-products">
            <div className="search-box">
              <Icon name="search" />
              <input
                ref={searchInput}
                placeholder="Search products by name, SKU, or category..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="product-grid">
              {available.map((product) => (
                <button
                  className="product-card"
                  key={product.id}
                  onClick={() => add(product)}
                >
                  <span className="product-thumb">
                    {product.imageData ? (
                      <img src={product.imageData} alt="" />
                    ) : product.category === "Lighting"
                      ? "✦"
                      : product.category === "Tires"
                        ? "◉"
                        : product.category === "Tools"
                          ? "⌁"
                          : "▦"}
                  </span>
                  <small>{product.category}</small>
                  <strong>{product.name}</strong>
                  <span>
                    {money(product.price)} <i>{product.quantity} in stock</i>
                  </span>
                </button>
              ))}
            </div>
          </section>
          <aside className="panel cart-panel">
            <div className="panel-header">
              <div>
                <h2>Current sale</h2>
                <p>{cart.length} line items</p>
              </div>
              <button className="link-button" onClick={() => setCart([])}>
                Clear
              </button>
            </div>
            {cart.length ? (
              <div className="cart-lines">
                {cart.map((item) => (
                  <div className="cart-line" key={item.id}>
                    <div>
                      <strong>{item.name}</strong>
                      <small>{money(item.price)} each</small>
                    </div>
                    <div className="qty">
                      <button
                        onClick={() =>
                          setCart((current) =>
                            current.map((line) =>
                              line.id === item.id
                                ? {
                                    ...line,
                                    count: Math.max(1, line.count - 1),
                                  }
                                : line,
                            ),
                          )
                        }
                      >
                        −
                      </button>
                      <span>{item.count}</span>
                      <button
                        onClick={() =>
                          setCart((current) =>
                            current.map((line) =>
                              line.id === item.id
                                ? { ...line, count: line.count + 1 }
                                : line,
                            ),
                          )
                        }
                      >
                        +
                      </button>
                    </div>
                    <strong>{money(item.price * item.count)}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state cart-empty">
                Your cart is empty.
                <br />
                <small>Click a product to add it here.</small>
              </div>
            )}
            <div className="customer-field">
              <label>
                Customer <span>Optional</span>
              </label>
              <input placeholder="Search name or phone..." />
            </div>
            <div className="pos-options">
              <label>Tax rate<select value={taxRate} onChange={(event) => setTaxRate(Number(event.target.value))}>{[12, 16, 20].map((rate) => <option key={rate} value={rate}>{rate}%</option>)}</select></label>
              <label>Discount<select value={discountType} onChange={(event) => setDiscountType(event.target.value)}><option>None</option><option>PWD</option><option>Senior Citizen</option></select></label>
              {discountType !== "None" && <label>ID number<input value={discountId} onChange={(event) => setDiscountId(event.target.value)} /></label>}
            </div>
            <div className="totals">
              <span>
                Subtotal <b>{money(subtotal)}</b>
              </span>
              <span>
                Tax ({taxRate}%) <b>{money(tax)}</b>
              </span>
              <span>
                Discount {discountType !== "None" ? `(${discountType})` : ""}<b>{money(discount)}</b>
              </span>
              <strong>
                Total <b>{money(total)}</b>
              </strong>
            </div>
            <div className="payment-methods">
              {["Cash", "Card", "GCash", "Maya", "MariBank"].map((method) => (
                <button
                  className={payment === method ? "selected" : ""}
                  onClick={() => setPayment(method)}
                  key={method}
                >
                  {method}
                </button>
              ))}
            </div>
            <label className="tendered">
              Amount tendered
              <input
                type="number"
                value={tendered}
                onChange={(event) => setTendered(event.target.value)}
                placeholder="0.00"
              />
            </label>
            <div className="change-row">
              <span>Change</span>
              <strong>
                {money(Math.max(0, Number(tendered || 0) - total))}
              </strong>
            </div>
            <button
              className="checkout-button"
              onClick={completeSale}
              disabled={!cart.length || (payment === "Cash" && Number(tendered || 0) < total) || (discountType !== "None" && !discountId.trim())}
            >
              Complete sale <span>F2</span><Icon name="arrow" />
            </button>
            {payment !== "Cash" && <div className="qr-preview" aria-label={`${payment} QR code`}><img className="qr-image" src={paymentQrCodes[payment]} alt={`${payment} QR code`} /><strong>Scan to pay via {payment}</strong><small>Display-only QR for cashier reference</small></div>}
          </aside>
        </div>
      )}
      {receipt && <div className="modal-backdrop" onClick={() => setReceipt(null)}><article className="modal receipt-modal" onClick={(event) => event.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">Soft-copy receipt</p><h2>{receipt.receiptNumber}</h2></div><button className="icon-button" onClick={() => setReceipt(null)}><Icon name="close" /></button></div>{receipt.items.map((item) => <div className="receipt-line" key={item.id}><span>{item.name} x{item.count}</span><strong>{money(item.price * item.count)}</strong></div>)}<div className="totals receipt-totals"><span>Subtotal <b>{money(receipt.subtotal)}</b></span><span>Tax <b>{money(receipt.tax)}</b></span><span>Discount <b>-{money(receipt.discount)}</b></span><strong>Total <b>{money(receipt.total)}</b></strong></div><p className="receipt-note">Paid via {receipt.payment}. Thank you for shopping with Tomas Car Accessories.</p></article></div>}
    </>
  );
}

function Reports({ transactions }) {
  const sales = transactions.filter((transaction) => transaction.type === "Sale");
  const revenue = sales.reduce((total, transaction) => total + transaction.total, 0);
  const refunds = transactions.filter((transaction) => transaction.type === "Refund").reduce((total, transaction) => total + Math.abs(transaction.total), 0);
  return (
    <>
      <div className="page-heading">
        <div><p className="eyebrow">Manager workspace</p><h1>Reports</h1><p>Review sales activity and store performance.</p></div>
      </div>
      <div className="kpi-grid">
        <article><span className="kpi-icon red">₱</span><div><small>Sales revenue</small><strong>{money(revenue)}</strong><em className="up">Recorded sales</em></div></article>
        <article><span className="kpi-icon blue">#</span><div><small>Transactions</small><strong>{sales.length}</strong><em className="up">Completed sales</em></div></article>
        <article><span className="kpi-icon orange">↩</span><div><small>Refunds</small><strong>{money(refunds)}</strong><em className="warning">Review required</em></div></article>
        <article><span className="kpi-icon dark">=</span><div><small>Net income</small><strong>{money(revenue - refunds)}</strong><em className="up">Revenue - refunds</em></div></article>
      </div>
      <article className="panel transactions-panel"><div className="panel-header"><div><h2>Sales report</h2><p>Filterable transaction summary</p></div></div><TransactionTable transactions={transactions} /></article>
    </>
  );
}

function Dashboard() {
  const [session, setSession] = useState(null);
  const [active, setActive] = useState("dashboard");
  const [products, setProducts] = useState([]);
  const [transactions, setTransactions] = useState(seedTransactions);
  const [salesHistory, setSalesHistory] = useState(seedSalesHistory);
  useEffect(() => {
    fetch("/api/auth/session")
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((user) => {
        setSession(user);
        setActive(getDefaultModule(user));
        return fetch("/api/products");
      })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((loadedProducts) => setProducts(loadedProducts))
      .catch(() => {
        window.location.replace("/");
      });
  }, []);
  const createProduct = async (product) => {
    const createdProduct = await requestJson("/api/products", {
      method: "POST",
      body: JSON.stringify(product),
    });
    setProducts((current) => [...current, createdProduct]);
  };
  const updateProduct = async (productId, product) => {
    const updatedProduct = await requestJson(`/api/products/${productId}`, {
      method: "PUT",
      body: JSON.stringify(product),
    });
    setProducts((current) =>
      current.map((item) => item.id === productId ? updatedProduct : item),
    );
  };
  const deleteProduct = async (productId) => {
    await requestJson(`/api/products/${productId}`, { method: "DELETE" });
    setProducts((current) => current.filter((item) => item.id !== productId));
  };
  const adjustStock = async (productId, adjustment) => {
    const updatedProduct = await requestJson(`/api/products/${productId}/stock`, {
      method: "POST",
      body: JSON.stringify(adjustment),
    });
    setProducts((current) => current.map((item) => item.id === updatedProduct.id ? updatedProduct : item));
  };
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notifications = products.filter(
    (product) => product.quantity <= product.reorder,
  );
  if (!session) return null;
  const username = getDisplayUsername(session);
  const titles = {
    dashboard: "Dashboard",
    inventory: "Inventory",
    pos: "Point of sale",
    reports: "Reports",
  };
  return (
    <main className="admin-app">
      <Sidebar active={active} setActive={setActive} session={session} />
      <section className="admin-main">
        <header className="admin-header">
          <div className="breadcrumbs">
            Tomas <span>/</span> <strong>{titles[active]}</strong>
          </div>
          <div className="header-actions">
            {getAllowedModules(session).includes("inventory") && <div className="notification-wrap">
              <button
                aria-label="Notifications"
                aria-expanded={notificationsOpen}
                className="header-icon"
                onClick={() => setNotificationsOpen((open) => !open)}
              >
                <Icon name="bell" />
                {notifications.length > 0 && <i />}
              </button>
              {notificationsOpen && (
                <div className="notification-popover">
                  <div>
                    <strong>Notifications</strong>
                    <small>{notifications.length} items need attention</small>
                  </div>
                  {notifications.length ? (
                    notifications.slice(0, 4).map((product) => (
                      <button
                        className="notification-item"
                        key={product.id}
                        onClick={() => {
                          setNotificationsOpen(false);
                          setActive("inventory");
                        }}
                      >
                        <span
                          className={`alert-symbol ${product.quantity === 0 ? "empty" : ""}`}
                        >
                          {product.quantity === 0 ? "×" : "!"}
                        </span>
                        <span>
                          <strong>{product.name}</strong>
                          <small>
                            {product.quantity === 0
                              ? "Out of stock"
                              : `${product.quantity} units left`}
                          </small>
                        </span>
                        <Icon name="arrow" />
                      </button>
                    ))
                  ) : (
                    <div className="notification-empty">
                      You’re all caught up.
                    </div>
                  )}
                  <button
                    className="notification-footer"
                    onClick={() => {
                      setNotificationsOpen(false);
                      setActive("inventory");
                    }}
                  >
                    View inventory alerts
                  </button>
                </div>
              )}
            </div>}
            <div className="header-user">
              <span className="avatar">
                {username.slice(0, 2).toUpperCase()}
              </span>
              <span>
                <strong>{username}</strong>
                <small>{getRoleLabel(session)}</small>
              </span>
            </div>
          </div>
        </header>
        <div className="content-area">
          {active === "dashboard" && (
            <DashboardHome
              products={products}
              transactions={transactions}
              setActive={setActive}
              username={username}
              salesHistory={salesHistory}
            />
          )}
          {active === "inventory" && (
            <Inventory
              products={products}
              onCreateProduct={createProduct}
              onUpdateProduct={updateProduct}
              onDeleteProduct={deleteProduct}
              onAdjustStock={adjustStock}
            />
          )}
          {active === "pos" && (
            <POS
              products={products}
              transactions={transactions}
              setTransactions={setTransactions}
              setProducts={setProducts}
            />
          )}
          {active === "reports" && getAllowedModules(session).includes("reports") && (
            <Reports transactions={transactions} />
          )}
        </div>
      </section>
    </main>
  );
}

export default function App() {
  return window.location.pathname === "/dashboard" ||
    window.location.pathname === "/dashboard.html" ? (
    <Dashboard />
  ) : (
    <Login />
  );
}
