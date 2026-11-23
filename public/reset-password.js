import {Client,Account} from "https://cdn.jsdelivr.net/npm/appwrite@17.0.0/+esm";
const client=new Client().setEndpoint("https://sgp.cloud.appwrite.io/v1").setProject("6b03d796003d1c4e4943");
const account=new Account(client);
const params=new URLSearchParams(location.search);
const userId=params.get("userId"),secret=params.get("secret");
const form=document.querySelector("#reset-form"),button=document.querySelector("#reset-button"),message=document.querySelector("#reset-message");
if(!userId||!secret){form.hidden=true;message.textContent="再設定リンクが無効か、必要な情報がありません。ログイン画面から再設定メールをもう一度送信してください。";}
form.addEventListener("submit",async e=>{e.preventDefault();const password=document.querySelector("#password").value,confirm=document.querySelector("#confirm").value;if(password.length<8){message.textContent="パスワードは8文字以上で入力してください。";return;}if(password!==confirm){message.textContent="2つのパスワードが一致しません。";return;}button.disabled=true;button.textContent="更新しています…";try{await account.updateRecovery(userId,secret,password);message.style.color="#137653";message.textContent="パスワードを更新しました。ログイン画面からログインしてください。";form.reset();button.textContent="更新完了";}catch(err){message.textContent=err.code===401?"リンクの有効期限が切れているか、既に使用されています。再設定メールをもう一度送信してください。":"更新に失敗しました。入力内容と再設定リンクを確認してください。";button.disabled=false;button.textContent="パスワードを更新";}});
