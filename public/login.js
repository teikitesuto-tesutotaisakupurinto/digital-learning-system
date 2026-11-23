import { Client, Account } from "https://cdn.jsdelivr.net/npm/appwrite@17.0.0/+esm";

const client = new Client()
  .setEndpoint("https://sgp.cloud.appwrite.io/v1")
  .setProject("6b03d796003d1c4e4943");
const account = new Account(client);
const form = document.querySelector("#login-form");
const button = document.querySelector("#login-button");
const message = document.querySelector("#login-message");
const pathParts = location.pathname.split("/").filter(Boolean);
const schoolSlug = pathParts.length === 2 && pathParts[1] === "login" ? pathParts[0] : "";
if (schoolSlug) {
  fetch("/api/public/schools/" + encodeURIComponent(schoolSlug), { cache: "no-store" })
    .then(r => r.ok ? r.json() : Promise.reject(new Error("学校情報を取得できません。")))
    .then(data => {
      document.querySelector(".brand").textContent = data.school.name + "｜デジタル問題演習";
      document.title = "ログイン | " + data.school.name;
    })
    .catch(() => { message.textContent = "学校専用ログインURLを確認してください。"; button.disabled = true; });
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  const email = document.querySelector("#email").value.trim().toLowerCase();
  const password = document.querySelector("#password").value;
  button.disabled = true;
  button.textContent = "ログイン中…";
  message.textContent = "";
  try {
    try { await account.get(); await account.deleteSession("current"); } catch {}
    await account.createEmailPasswordSession(email, password);
    const jwt = await account.createJWT();
    const response = await fetch("/api/me", {
      headers: {
        Authorization: "Bearer " + jwt.jwt,
        ...(schoolSlug ? { "X-School-Slug": schoolSlug } : {})
      },
      cache: "no-store"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "このアカウントは利用できません。");
    if (data.user.role === "teacher") location.replace("/teacher/dashboard.html");
    else if (data.user.role === "student") location.replace("/student/dashboard.html");
    else throw new Error("アカウントの権限を確認できません。");
  } catch (error) {
    message.textContent = error.code === 401
      ? "メールアドレスまたはパスワードが正しくありません。"
      : (error.message || "ログインできませんでした。");
    try { await account.deleteSession("current"); } catch {}
    button.disabled = false;
    button.textContent = "ログイン";
  }
});
