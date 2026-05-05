// ============================================================================
// storage.js
// Upload e remoção de imagens no Firebase Storage.
// Estrutura de paths:
//   /portfolio/{userId}/registos/{registoId}/{nomeFicheiro}
//   /portfolio/{userId}/perfil/{nomeFicheiro}
// ============================================================================

import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";

import { storage, auth } from "./firebase-config.js";

// ----------------------------------------------------------------------------
// Validação
// ----------------------------------------------------------------------------

const TAMANHO_MAX_BYTES = 2 * 1024 * 1024;          // 2MB
const TIPOS_PERMITIDOS  = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/**
 * Valida ficheiro antes de upload. Lança Error com mensagem em PT.
 */
export function validarImagem(ficheiro) {
  if (!ficheiro) {
    throw new Error("Nenhum ficheiro selecionado.");
  }
  if (!TIPOS_PERMITIDOS.includes(ficheiro.type)) {
    throw new Error("Formato não suportado. Usa JPEG, PNG, WebP ou GIF.");
  }
  if (ficheiro.size > TAMANHO_MAX_BYTES) {
    const mb = (ficheiro.size / 1024 / 1024).toFixed(1);
    throw new Error(`Imagem demasiado grande (${mb}MB). Máximo 2MB.`);
  }
}

// ----------------------------------------------------------------------------
// Upload
// ----------------------------------------------------------------------------

/**
 * Faz upload de uma imagem de capa para um registo.
 * @returns {Promise<{url: string, path: string}>}
 */
export async function uploadImagemRegisto(registoId, ficheiro) {
  validarImagem(ficheiro);
  const userId = exigirUid();
  const nome = nomeFicheiroSeguro(ficheiro.name);
  const path = `portfolio/${userId}/registos/${registoId}/${nome}`;
  return await uploadParaPath(path, ficheiro);
}

/**
 * Faz upload da foto de perfil.
 * @returns {Promise<{url: string, path: string}>}
 */
export async function uploadFotoPerfil(ficheiro) {
  validarImagem(ficheiro);
  const userId = exigirUid();
  const nome = nomeFicheiroSeguro(ficheiro.name);
  const path = `portfolio/${userId}/perfil/${nome}`;
  return await uploadParaPath(path, ficheiro);
}

async function uploadParaPath(path, ficheiro) {
  const referencia = ref(storage, path);
  await uploadBytes(referencia, ficheiro, { contentType: ficheiro.type });
  const url = await getDownloadURL(referencia);
  return { url, path };
}

// ----------------------------------------------------------------------------
// Remoção
// ----------------------------------------------------------------------------

/**
 * Apaga um ficheiro pelo path do Storage. Silencioso se não existir.
 */
export async function apagarFicheiro(path) {
  if (!path) return;
  try {
    await deleteObject(ref(storage, path));
  } catch (erro) {
    // object-not-found é aceitável (já apagado, ou criado sem upload)
    if (erro?.code !== "storage/object-not-found") {
      console.warn("Erro a apagar ficheiro:", path, erro);
    }
  }
}

// ----------------------------------------------------------------------------
// Auxiliares
// ----------------------------------------------------------------------------

function exigirUid() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("É preciso ter sessão iniciada para enviar imagens.");
  return uid;
}

/**
 * Sanitiza nome de ficheiro: remove acentos, caracteres especiais, espaços.
 * Adiciona timestamp para evitar colisões e cache stale.
 */
function nomeFicheiroSeguro(nomeOriginal) {
  const ts = Date.now();
  const baseSemAcentos = (nomeOriginal || "imagem")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
  return `${ts}-${baseSemAcentos}`;
}
