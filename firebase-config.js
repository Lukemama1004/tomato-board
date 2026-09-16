// ① 到 Firebase 主控台 → 專案設定 → 一般 → 你的應用程式 → 網頁應用程式,
//    複製 firebaseConfig 的內容貼到下面(這些值本來就是公開的,不是密碼)。
export const FIREBASE_CONFIG = {
  apiKey: "請填入 apiKey",
  authDomain: "請填入 authDomain",
  projectId: "請填入 projectId",
  storageBucket: "請填入 storageBucket",
  messagingSenderId: "請填入 messagingSenderId",
  appId: "請填入 appId"
};

// ② 管理者帳號的 Email(在 Firebase Authentication 建立的那一個)。
//    必須和 firestore.rules 裡的 Email 完全相同。
export const MANAGER_EMAIL = "manager@example.com";
