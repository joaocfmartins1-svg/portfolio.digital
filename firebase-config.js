// ============================================================================
// firebase-config.js
// Inicialização do Firebase via CDN ESM (sem build step, sem npm).
// ----------------------------------------------------------------------------
// IMPORTANTE: a firebaseConfig é, por design, pública. A segurança vive nas
// firestore.rules + storage.rules + lista de domínios autorizados na consola
// Firebase Auth. Não tentar esconder a config.
// ============================================================================

import { initializeApp } from
  "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";

import {
  getFirestore,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

import {
  getAuth,
  browserLocalPersistence,
  setPersistence
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

import { getStorage } from
  "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";

// ----------------------------------------------------------------------------
// PREENCHER COM OS DADOS DO TEU PROJETO Firebase.
// (Consola Firebase → Definições do projeto → As tuas apps → Web).
// ----------------------------------------------------------------------------
export const firebaseConfig = {
  apiKey:            "REPLACE_API_KEY",
  authDomain:        "https://portfolio-b9038-default-rtdb.europe-west1.firebasedatabase.app/",
  projectId:         "REPLACE_PROJECT_ID",
  storageBucket:     "REPLACE_PROJECT.appspot.com",
  messagingSenderId: "REPLACE_SENDER_ID",
  appId:             "REPLACE_APP_ID"
};

// ----------------------------------------------------------------------------
// Inicialização
// ----------------------------------------------------------------------------
export const app  = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

// Persistência local (sessão sobrevive a refresh).
// Erro silencioso: em alguns contextos (modo privado, file://) pode falhar;
// nesse caso o Firebase cai para sessão em memória.
setPersistence(auth, browserLocalPersistence).catch((erro) => {
  console.warn("Persistência local indisponível:", erro?.code || erro);
});

// Re-exportar utilitários úteis aos outros módulos.
export { serverTimestamp, Timestamp };
