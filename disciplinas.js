// ============================================================================
// disciplinas.js
// CRUD da coleção 'disciplinas'.
// Disciplinas são metadados visuais — leitura pública sem filtro de estado.
// ============================================================================

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

import { db, auth, serverTimestamp } from "./firebase-config.js";

const COLECAO = "disciplinas";

// ----------------------------------------------------------------------------
// Validação
// ----------------------------------------------------------------------------

const REGEX_HEX = /^#[0-9a-fA-F]{6}$/;

function validarDisciplina(dados) {
  const erros = [];
  if (!dados.nome || typeof dados.nome !== "string") {
    erros.push("Nome é obrigatório.");
  } else if (dados.nome.length < 2 || dados.nome.length > 100) {
    erros.push("Nome deve ter entre 2 e 100 caracteres.");
  }
  const sem = Number(dados.semestre);
  if (!Number.isInteger(sem) || sem < 1 || sem > 4) {
    erros.push("Semestre deve ser 1, 2, 3 ou 4.");
  }
  if (dados.cor && !REGEX_HEX.test(dados.cor)) {
    erros.push("Cor deve estar no formato #rrggbb.");
  }
  if (erros.length) throw new Error(erros.join(" "));
}

// ----------------------------------------------------------------------------
// Leitura
// ----------------------------------------------------------------------------

/**
 * Subscreve todas as disciplinas, ordenadas por semestre + nome.
 * @param {(disciplinas: Array) => void} callback
 * @returns {() => void} função de unsubscribe
 */
export function observarDisciplinas(callback) {
  const q = query(
    collection(db, COLECAO),
    orderBy("semestre", "asc"),
    orderBy("nome", "asc")
  );
  return onSnapshot(
    q,
    (snap) => {
      const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(lista);
    },
    (erro) => {
      console.error("observarDisciplinas:", erro);
      callback([]);
    }
  );
}

/**
 * Lê todas as disciplinas uma vez (sem subscrição).
 */
export async function listarDisciplinas() {
  const q = query(
    collection(db, COLECAO),
    orderBy("semestre", "asc"),
    orderBy("nome", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Lê disciplinas de um semestre específico.
 */
export async function listarDisciplinasDoSemestre(semestre) {
  const q = query(
    collection(db, COLECAO),
    where("semestre", "==", Number(semestre)),
    orderBy("nome", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ----------------------------------------------------------------------------
// Escrita (requer autenticação)
// ----------------------------------------------------------------------------

/**
 * Cria uma disciplina. Devolve o id atribuído.
 */
export async function criarDisciplina(dados) {
  exigirAuth();
  validarDisciplina(dados);
  const payload = {
    nome:      dados.nome.trim(),
    semestre:  Number(dados.semestre),
    cor:       dados.cor || null,
    criadoEm:  serverTimestamp(),
    ownerId:   auth.currentUser.uid
  };
  const ref = await addDoc(collection(db, COLECAO), payload);
  return ref.id;
}

/**
 * Atualiza uma disciplina existente.
 */
export async function atualizarDisciplina(id, dados) {
  exigirAuth();
  validarDisciplina(dados);
  await updateDoc(doc(db, COLECAO, id), {
    nome:     dados.nome.trim(),
    semestre: Number(dados.semestre),
    cor:      dados.cor || null
  });
}

/**
 * Apaga uma disciplina.
 * NOTA: a app deve avisar o utilizador se houver registos a usá-la,
 * pois eles ficarão com `disciplinaId` órfão. Ver ui-privada.js.
 */
export async function apagarDisciplina(id) {
  exigirAuth();
  await deleteDoc(doc(db, COLECAO, id));
}

// ----------------------------------------------------------------------------
// Auxiliares
// ----------------------------------------------------------------------------

function exigirAuth() {
  if (!auth.currentUser) {
    throw new Error("É preciso ter sessão iniciada.");
  }
}
