import { Client, Account } from "https://cdn.jsdelivr.net/npm/appwrite@17.0.0/+esm";

const ENDPOINT = "https://sgp.cloud.appwrite.io/v1";
const PROJECT_ID = "6b03d796003d1c4e4943";
const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID);
const account = new Account(client);

const form = document.querySelector("#login-form");
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const loginButton = document.querySelector("#login-button");
const message = document.querySelector("#login-message");
const togglePassword = document.querySelector("#toggle-password");
const forgotButton = document.querySelector("#forgot-button");

function showMessage(text, type = "error") {
  message.textContent = text;
  message.className = "form-message " + type;
}
function setLoading(loading) {
  loginButton.disabled = loading;
  loginButton.classList.toggle("loading", loading);
  loginButton.querySelector("span").textContent = loading ? "確認しています" : "ログイン";
}
async function requestRole() {
  const jwt = await account.createJWT();
  const response = await fetch("/api/me", {
    headers: { Authorization: "Bearer " + jwt.jwt },
    cache: "no-store"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "このアカウントの利用権限を確認できません。");
  return data.user;
}

togglePassword.addEventListener("click", () => {
  const visible = passwordInput.type === "password";
  passwordInput.type = visible ? "text" : "password";
  togglePassword.setAttribute("aria-label", visible ? "パスワードを隠す" : "パスワードを表示");
});

forgotButton.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  if (!email) {
    emailInput.focus();
    showMessage("先にメールアドレスを入力してください。");
    return;
  }
  forgotButton.disabled = true;
  try {
    await account.createRecovery(email, location.origin + "/reset-password.html");
    showMessage("パスワード再設定用のメールを送信しました。メールをご確認ください。", "success");
  } catch (error) {
    showMessage(error.code === 429 ? "しばらく待ってからもう一度お試しください。" : "再設定メールを送信できませんでした。入力したメールアドレスをご確認ください。");
  } finally {
    forgotButton.disabled = false;
  }
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;
  if (!email || !password) {
    showMessage("メールアドレスとパスワードを入力してください。");
    return;
  }

  setLoading(true);
  message.textContent = "";
  message.className = "form-message";
  try {
    await account.createEmailPasswordSession(email, password);
    const user = await requestRole();
    const destinations = {
      admin: "/admin/dashboard.html",
      teacher: "/teacher/dashboard.html",
      student: "/student/dashboard.html"
    };
    const destination = destinations[user.role];
    if (!destination) throw new Error("アカウントの権限が正しく設定されていません。管理者にお問い合わせください。");
    location.replace(destination);
  } catch (error) {
    let text = error.message || "ログインできませんでした。";
    if (error.code === 401) text = "メールアドレスまたはパスワードが正しくありません。";
    if (error.code === 429) text = "試行回数が多すぎます。少し時間をおいて再度お試しください。";
    showMessage(text);
    try { await account.deleteSession("current"); } catch {}
    setLoading(false);
  }
});

(async () => {
  try {
    const status = await fetch("/api/system/status", { cache: "no-store" }).then(r => r.json());
    if (status.maintenance) {
      document.querySelector(".form-heading h2").textContent = "メンテナンス中です";
      document.querySelector(".form-heading>p:last-child").textContent = "現在、システムメンテナンスを実施しています。終了までしばらくお待ちください。";
      form.classList.add("hidden");
      forgotButton.disabled = true;
    }
  } catch {}
  emailInput.focus({ preventScroll: true });
})();
