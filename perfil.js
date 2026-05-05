// ============================================================================
// perfil.js
// Leitura e escrita do documento único 'perfil/dados'.
//
// Leitura pública (faz parte da capa do portfólio).
// Escrita restrita ao dono.
//
// Inclui campos opcionais que vivem no perfil por serem parte da narrativa
// pública: titulosSemestres, reflexoesFinaisSemestres, frasePessoal.
// ============================================================================

import {
  doc,
  getDoc,
  setDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

import { db, auth, serverTimestamp } from "./firebase-config.js";
import { apagarFicheiro } from "./storage.js";

const ID_DOC = "dados"; // sempre "perfil/dados"

// ----------------------------------------------------------------------------
// Validação
// ----------------------------------------------------------------------------

function validarPerfil(dados) {
  const erros = [];

  if (!dados.nome || typeof dados.nome !== "string" || !dados.nome.trim()) {
    erros.push("Nome é obrigatório.");
  } else if (dados.nome.length > 200) {
    erros.push("Nome demasiado longo.");
  }

  if (!dados.bio || typeof dados.bio !== "string") {
    erros.push("Bio é obrigatória.");
  } else if (dados.bio.length < 50 || dados.bio.length > 500) {
    erros.push("Bio deve ter entre 50 e 500 caracteres.");
  }

  if (!dados.instituicao || typeof dados.instituicao !== "string" || !dados.instituicao.trim()) {
    erros.push("Instituição é obrigatória.");
  }
  if (!dados.curso || typeof dados.curso !== "string" || !dados.curso.trim()) {
    erros.push("Curso é obrigatório.");
  }

  const ai = Number(dados.anoInicio);
  const af = Number(dados.anoFim);
  if (!Number.isInteger(ai)) erros.push("Ano de início inválido.");
  if (!Number.isInteger(af)) erros.push("Ano de fim inválido.");
  if (Number.isInteger(ai) && Number.isInteger(af) && af < ai) {
    erros.push("Ano de fim não pode ser anterior ao ano de início.");
  }

  if (dados.frasePessoal && typeof dados.frasePessoal === "string"
      && dados.frasePessoal.length > 200) {
    erros.push("Frase pessoal não pode exceder 200 caracteres.");
  }

  if (dados.titulosSemestres && typeof dados.titulosSemestres !== "object") {
    erros.push("Títulos de semestres devem ser um objeto.");
  }
  if (dados.reflexoesFinaisSemestres && typeof dados.reflexoesFinaisSemestres !== "object") {
    erros.push("Reflexões finais devem ser um objeto.");
  }

  if (erros.length) throw new Error(erros.join(" "));
}

// ----------------------------------------------------------------------------
// Leitura
// ----------------------------------------------------------------------------

/**
 * Lê o perfil uma vez. Devolve null se ainda não foi criado.
 */
export async function lerPerfil() {
  const d = await getDoc(doc(db, "perfil", ID_DOC));
  if (!d.exists()) return null;
  return { id: d.id, ...d.data() };
}

/**
 * Subscreve mudanças no perfil. Chama callback(perfil|null).
 */
export function observarPerfil(callback) {
  return onSnapshot(
    doc(db, "perfil", ID_DOC),
    (snap) => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    (erro) => {
      console.error("observarPerfil:", erro);
      callback(null);
    }
  );
}

// ----------------------------------------------------------------------------
// Escrita (só o dono)
// ----------------------------------------------------------------------------

/**
 * Guarda o perfil. Cria se não existir, atualiza se existir.
 * Se a foto foi substituída, apaga a antiga do Storage.
 */
export async function guardarPerfil(dados, opcoes = {}) {
  exigirAuth();
  validarPerfil(dados);

  const payload = {
    nome:         dados.nome.trim(),
    bio:          dados.bio.trim(),
    fotoUrl:      dados.fotoUrl || null,
    fotoPath:     dados.fotoPath || null,
    instituicao:  dados.instituicao.trim(),
    curso:        dados.curso.trim(),
    anoInicio:    Number(dados.anoInicio),
    anoFim:       Number(dados.anoFim),
    frasePessoal: dados.frasePessoal ? dados.frasePessoal.trim() : null,
    titulosSemestres:        sanitizarMapaSemestres(dados.titulosSemestres),
    reflexoesFinaisSemestres: sanitizarMapaSemestres(dados.reflexoesFinaisSemestres),
    atualizadoEm: serverTimestamp(),
    ownerId:      auth.currentUser.uid
  };

  await setDoc(doc(db, "perfil", ID_DOC), payload, { merge: false });

  if (opcoes.pathAntigo && opcoes.pathAntigo !== dados.fotoPath) {
    await apagarFicheiro(opcoes.pathAntigo);
  }
}

// ----------------------------------------------------------------------------
// Auxiliares
// ----------------------------------------------------------------------------

/**
 * Garante que mapa só tem chaves "1".."4" e valores string.
 * Devolve {} se input inválido (em vez de gravar lixo).
 */
function sanitizarMapaSemestres(mapa) {
  if (!mapa || typeof mapa !== "object") return {};
  const limpo = {};
  for (const k of ["1", "2", "3", "4"]) {
    const v = mapa[k] ?? mapa[Number(k)];
    if (typeof v === "string" && v.trim()) {
      limpo[k] = v.trim();
    }
  }
  return limpo;
}

/**
 * Devolve o título do semestre, com fallback "1.º Semestre".
 */
export function tituloSemestre(perfil, semestre) {
  const k = String(semestre);
  return perfil?.titulosSemestres?.[k] || `${semestre}.º Semestre`;
}

/**
 * Devolve a reflexão final do semestre ou string vazia.
 */
export function reflexaoFinalSemestre(perfil, semestre) {
  const k = String(semestre);
  return perfil?.reflexoesFinaisSemestres?.[k] || "";
}

function exigirAuth() {
  if (!auth.currentUser) {
    throw new Error("É preciso ter sessão iniciada.");
  }
}
