// ============================================================================
// reflexoes.js
// CRUD da coleção 'reflexoes'.
// Reflexões podem estar ligadas a um registo (registoId) ou ser soltas.
// ============================================================================

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

import { db, auth, serverTimestamp } from "./firebase-config.js";

const COLECAO = "reflexoes";

// ----------------------------------------------------------------------------
// Validação
// ----------------------------------------------------------------------------

function validarReflexao(dados) {
  const erros = [];

  if (!dados.titulo || typeof dados.titulo !== "string") {
    erros.push("Título é obrigatório.");
  } else if (dados.titulo.length < 3 || dados.titulo.length > 120) {
    erros.push("Título deve ter entre 3 e 120 caracteres.");
  }

  if (!dados.texto || typeof dados.texto !== "string") {
    erros.push("Texto é obrigatório.");
  } else if (dados.texto.length < 20 || dados.texto.length > 5000) {
    erros.push("Texto deve ter entre 20 e 5000 caracteres.");
  }

  const sem = Number(dados.semestre);
  if (!Number.isInteger(sem) || sem < 1 || sem > 4) {
    erros.push("Semestre deve ser 1, 2, 3 ou 4.");
  }

  if (!["rascunho", "publicado"].includes(dados.estado)) {
    erros.push("Estado deve ser 'rascunho' ou 'publicado'.");
  }

  if (!(dados.data instanceof Date) && !(dados.data instanceof Timestamp)) {
    erros.push("Data é obrigatória.");
  }

  if (erros.length) throw new Error(erros.join(" "));
}

// ----------------------------------------------------------------------------
// Leitura — Vista pública
// ----------------------------------------------------------------------------

/**
 * Subscreve reflexões publicadas.
 */
export function observarReflexoesPublicadas(callback) {
  const q = query(
    collection(db, COLECAO),
    where("estado", "==", "publicado"),
    orderBy("data", "desc")
  );
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (erro) => {
      console.error("observarReflexoesPublicadas:", erro);
      callback([]);
    }
  );
}

/**
 * Lê reflexões publicadas ligadas a um registo específico.
 * Útil para mostrar no modal de detalhe.
 */
export function observarReflexoesDoRegisto(registoId, callback) {
  const q = query(
    collection(db, COLECAO),
    where("registoId", "==", registoId),
    where("estado", "==", "publicado"),
    orderBy("data", "desc")
  );
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (erro) => {
      console.error("observarReflexoesDoRegisto:", erro);
      callback([]);
    }
  );
}

// ----------------------------------------------------------------------------
// Leitura — Vista privada
// ----------------------------------------------------------------------------

/**
 * Subscreve TODAS as reflexões do dono.
 */
export function observarReflexoesDoDono(callback) {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    callback([]);
    return () => {};
  }
  const q = query(
    collection(db, COLECAO),
    where("ownerId", "==", uid),
    orderBy("data", "desc")
  );
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (erro) => {
      console.error("observarReflexoesDoDono:", erro);
      callback([]);
    }
  );
}

export async function lerReflexaoDoDono(id) {
  exigirAuth();
  const d = await getDoc(doc(db, COLECAO, id));
  if (!d.exists()) return null;
  const dados = { id: d.id, ...d.data() };
  if (dados.ownerId !== auth.currentUser.uid) return null;
  return dados;
}

// ----------------------------------------------------------------------------
// Escrita
// ----------------------------------------------------------------------------

export async function criarReflexao(dados) {
  exigirAuth();
  validarReflexao(dados);
  const payload = construirPayload(dados, /* novo */ true);
  const ref = await addDoc(collection(db, COLECAO), payload);
  return ref.id;
}

export async function atualizarReflexao(id, dados) {
  exigirAuth();
  validarReflexao(dados);
  const payload = construirPayload(dados, /* novo */ false);
  await updateDoc(doc(db, COLECAO, id), payload);
}

export async function apagarReflexao(id) {
  exigirAuth();
  await deleteDoc(doc(db, COLECAO, id));
}

// ----------------------------------------------------------------------------
// Auxiliares
// ----------------------------------------------------------------------------

function construirPayload(dados, novo) {
  const dataTs = dados.data instanceof Timestamp
    ? dados.data
    : Timestamp.fromDate(dados.data);

  const payload = {
    titulo:    dados.titulo.trim(),
    texto:     dados.texto.trim(),
    registoId: dados.registoId || null,
    semestre:  Number(dados.semestre),
    data:      dataTs,
    estado:    dados.estado
  };

  if (novo) {
    payload.criadoEm = serverTimestamp();
    payload.ownerId  = auth.currentUser.uid;
  }

  return payload;
}

function exigirAuth() {
  if (!auth.currentUser) {
    throw new Error("É preciso ter sessão iniciada.");
  }
}
