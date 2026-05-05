// ============================================================================
// portfolio.js
// CRUD da coleção 'registos'.
//
// Vista pública: query filtrada por estado == "publicado" (obrigatório pelas
// rules — anónimos só conseguem ler docs nesse estado).
// Vista privada: dono autenticado vê tudo (rascunhos incluídos).
// ============================================================================

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

import { db, auth, serverTimestamp } from "./firebase-config.js";
import { apagarFicheiro } from "./storage.js";

const COLECAO = "registos";

// ----------------------------------------------------------------------------
// Validação
// ----------------------------------------------------------------------------

function validarRegisto(dados) {
  const erros = [];

  if (!dados.titulo || typeof dados.titulo !== "string") {
    erros.push("Título é obrigatório.");
  } else if (dados.titulo.length < 3 || dados.titulo.length > 120) {
    erros.push("Título deve ter entre 3 e 120 caracteres.");
  }

  const sem = Number(dados.semestre);
  if (!Number.isInteger(sem) || sem < 1 || sem > 4) {
    erros.push("Semestre deve ser 1, 2, 3 ou 4.");
  }

  if (!dados.disciplinaId || typeof dados.disciplinaId !== "string") {
    erros.push("Disciplina é obrigatória.");
  }

  if (!["teoria", "pratica"].includes(dados.categoria)) {
    erros.push("Categoria deve ser 'teoria' ou 'pratica'.");
  }

  if (!dados.descricao || typeof dados.descricao !== "string") {
    erros.push("Descrição é obrigatória.");
  } else if (dados.descricao.length < 10 || dados.descricao.length > 2000) {
    erros.push("Descrição deve ter entre 10 e 2000 caracteres.");
  }

  if (!["rascunho", "publicado"].includes(dados.estado)) {
    erros.push("Estado deve ser 'rascunho' ou 'publicado'.");
  }

  if (typeof dados.destaque !== "boolean") {
    erros.push("Destaque deve ser verdadeiro ou falso.");
  }

  if (!(dados.data instanceof Date) && !(dados.data instanceof Timestamp)) {
    erros.push("Data é obrigatória.");
  }

  if (dados.linksEvidencia && !Array.isArray(dados.linksEvidencia)) {
    erros.push("Links de evidência têm de ser uma lista.");
  } else if (dados.linksEvidencia && dados.linksEvidencia.length > 10) {
    erros.push("Máximo 10 links de evidência.");
  }

  if (erros.length) throw new Error(erros.join(" "));
}

// ----------------------------------------------------------------------------
// Leitura — Vista pública
// ----------------------------------------------------------------------------

/**
 * Subscreve registos publicados, ordenados por data (mais recente primeiro).
 * Esta query é segura para anónimos (filtra por estado == "publicado").
 */
export function observarRegistosPublicados(callback) {
  const q = query(
    collection(db, COLECAO),
    where("estado", "==", "publicado"),
    orderBy("data", "desc")
  );
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (erro) => {
      console.error("observarRegistosPublicados:", erro);
      callback([]);
    }
  );
}

/**
 * Lê um único registo publicado pelo seu id.
 * Devolve null se não existir ou não estiver publicado.
 */
export async function lerRegistoPublicado(id) {
  const d = await getDoc(doc(db, COLECAO, id));
  if (!d.exists()) return null;
  const dados = { id: d.id, ...d.data() };
  // Se o utilizador não está autenticado e o registo é rascunho, o getDoc
  // já teria falhado pelas rules; este check é defensivo.
  if (dados.estado !== "publicado" && auth.currentUser?.uid !== dados.ownerId) {
    return null;
  }
  return dados;
}

// ----------------------------------------------------------------------------
// Leitura — Vista privada (dono autenticado)
// ----------------------------------------------------------------------------

/**
 * Subscreve TODOS os registos do dono autenticado (incluindo rascunhos).
 */
export function observarRegistosDoDono(callback) {
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
      console.error("observarRegistosDoDono:", erro);
      callback([]);
    }
  );
}

/**
 * Lê um registo do dono pelo id (sem filtro de estado).
 */
export async function lerRegistoDoDono(id) {
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

/**
 * Cria um registo. A imagem de capa (se houver) deve ser enviada via
 * `storage.js > uploadImagemRegisto` antes de chamar esta função, e os
 * resultados (url + path) devem ser passados em `dados.imagemCapaUrl`
 * e `dados.imagemCapaPath`.
 *
 * Como o uploadImagemRegisto requer um registoId, o fluxo recomendado é:
 *   1. criar o registo sem imagem
 *   2. fazer upload usando o id devolvido
 *   3. atualizarRegisto() com as urls
 *
 * @returns {Promise<string>} id do registo criado
 */
export async function criarRegisto(dados) {
  exigirAuth();
  validarRegisto(dados);
  const payload = construirPayload(dados, /* novo */ true);
  const ref = await addDoc(collection(db, COLECAO), payload);
  return ref.id;
}

/**
 * Atualiza um registo. Se a imagem foi substituída (novo path diferente
 * do antigo), o ficheiro antigo é apagado do Storage.
 */
export async function atualizarRegisto(id, dados, opcoes = {}) {
  exigirAuth();
  validarRegisto(dados);
  const payload = construirPayload(dados, /* novo */ false);
  await updateDoc(doc(db, COLECAO, id), payload);

  if (opcoes.pathAntigo && opcoes.pathAntigo !== dados.imagemCapaPath) {
    await apagarFicheiro(opcoes.pathAntigo);
  }
}

/**
 * Apaga um registo e a imagem de capa associada (se existir).
 */
export async function apagarRegisto(id) {
  exigirAuth();
  const d = await getDoc(doc(db, COLECAO, id));
  if (d.exists()) {
    const path = d.data()?.imagemCapaPath;
    if (path) await apagarFicheiro(path);
  }
  await deleteDoc(doc(db, COLECAO, id));
}

/**
 * Alterna o destaque (para uso rápido na lista do dashboard).
 */
export async function alternarDestaque(id, valorAtual) {
  exigirAuth();
  await updateDoc(doc(db, COLECAO, id), {
    destaque:     !valorAtual,
    atualizadoEm: serverTimestamp()
  });
}

/**
 * Alterna o estado entre "rascunho" e "publicado".
 */
export async function alternarPublicado(id, estadoAtual) {
  exigirAuth();
  const novo = estadoAtual === "publicado" ? "rascunho" : "publicado";
  await updateDoc(doc(db, COLECAO, id), {
    estado:       novo,
    atualizadoEm: serverTimestamp()
  });
}

// ----------------------------------------------------------------------------
// Auxiliares
// ----------------------------------------------------------------------------

function construirPayload(dados, novo) {
  const dataTs = dados.data instanceof Timestamp
    ? dados.data
    : Timestamp.fromDate(dados.data);

  const payload = {
    titulo:        dados.titulo.trim(),
    semestre:      Number(dados.semestre),
    disciplinaId:  dados.disciplinaId,
    categoria:     dados.categoria,
    descricao:     dados.descricao.trim(),
    imagemCapaUrl: dados.imagemCapaUrl || null,
    imagemCapaPath:dados.imagemCapaPath || null,
    linksEvidencia: Array.isArray(dados.linksEvidencia)
      ? dados.linksEvidencia
          .filter((l) => l && l.url && l.titulo)
          .slice(0, 10)
          .map((l) => ({ titulo: String(l.titulo).trim(),
                         url:    String(l.url).trim() }))
      : [],
    data:          dataTs,
    destaque:      Boolean(dados.destaque),
    estado:        dados.estado,
    atualizadoEm:  serverTimestamp()
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
