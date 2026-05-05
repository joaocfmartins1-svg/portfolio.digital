// ============================================================================
// auth.js
// Autenticação Email/Password. Login via modal. Sem registo público.
// Mensagens de erro traduzidas para PT.
// ============================================================================

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

import { auth } from "./firebase-config.js";

// ----------------------------------------------------------------------------
// API pública
// ----------------------------------------------------------------------------

/**
 * Inicia sessão com email e palavra-passe.
 * @returns {Promise<import('firebase/auth').User>}
 * @throws {Error} com `.message` em PT pronto a mostrar ao utilizador
 */
export async function entrar(email, password) {
  if (!email || !password) {
    throw new Error("Preenche o email e a palavra-passe.");
  }
  try {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    return cred.user;
  } catch (erro) {
    throw new Error(traduzirErroAuth(erro));
  }
}

/**
 * Termina sessão.
 */
export async function sair() {
  await signOut(auth);
}

/**
 * Subscreve mudanças de estado de autenticação.
 * Chama callback(user|null) imediatamente com o estado atual e em cada mudança.
 * Devolve função de unsubscribe.
 */
export function observarAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

/**
 * Devolve o utilizador atual ou null. Não espera por inicialização —
 * usar observarAuth() para a primeira leitura fiável.
 */
export function utilizadorAtual() {
  return auth.currentUser;
}

// ----------------------------------------------------------------------------
// Tradução de códigos de erro Firebase Auth
// ----------------------------------------------------------------------------

function traduzirErroAuth(erro) {
  const codigo = erro?.code || "";
  switch (codigo) {
    case "auth/invalid-email":
      return "Email inválido. Verifica o formato.";
    case "auth/user-disabled":
      return "Esta conta está desativada. Contacta o administrador.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
      return "Credenciais inválidas. Verifica o email e a palavra-passe.";
    case "auth/too-many-requests":
      return "Demasiadas tentativas. Tenta novamente daqui a alguns minutos.";
    case "auth/network-request-failed":
      return "Sem ligação à rede. Verifica a tua internet e tenta de novo.";
    case "auth/operation-not-allowed":
      return "Login por email/palavra-passe está desativado no projeto.";
    default:
      // Mensagem genérica — nunca mostrar o código cru ao utilizador.
      console.warn("Erro Firebase Auth não traduzido:", codigo, erro);
      return "Não foi possível iniciar sessão. Tenta novamente.";
  }
}
