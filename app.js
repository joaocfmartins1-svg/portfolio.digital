// ============================================================================
// app.js — entry point
// ----------------------------------------------------------------------------
// Decide o que mostrar com base em (1) URL e (2) estado de autenticação:
//   - vista pública  -> ui-publica.js   (sempre, mesmo para o aluno)
//   - vista privada  -> ui-privada.js   (apenas se autenticado E ?vista=privada)
// ============================================================================

import { observarAuth, entrar }                     from "./auth.js";
import { iniciarVistaPublica, limparSubscricoes as limparPublica } from "./ui-publica.js";
import { iniciarVistaPrivada, limparSubscricoes as limparPrivada } from "./ui-privada.js";
import { animarHero, ativarObserver, ativarParallax } from "./animacoes.js";

// ----------------------------------------------------------------------------
// Bootstrap
// ----------------------------------------------------------------------------

let estadoAuth = { user: null, conhecido: false };
let vistaAtual = null; // "publica" | "privada"

document.addEventListener("DOMContentLoaded", () => {
  // 1. Modais e botão de acesso aluno
  ligarModais();

  // 2. Subscrever auth — primeira chamada decide qual vista carregar
  observarAuth((user) => {
    const eraConhecido = estadoAuth.conhecido;
    const userAnterior = estadoAuth.user;
    estadoAuth = { user, conhecido: true };
    atualizarBotaoAcesso(user);

    if (!eraConhecido) {
      // Primeira deteção — escolher vista
      decidirVista(user);
    } else if ((!userAnterior && user) || (userAnterior && !user)) {
      // Mudança de auth — re-decidir
      decidirVista(user);
    }
  });
});

function decidirVista(user) {
  const params = new URLSearchParams(window.location.search);
  const querVistaPrivada = params.get("vista") === "privada";

  if (querVistaPrivada && user) {
    mostrarVistaPrivada();
  } else {
    if (querVistaPrivada && !user) {
      // Pede privada mas não autenticado — limpar URL e cair na pública
      const url = new URL(window.location);
      url.searchParams.delete("vista");
      window.history.replaceState({}, "", url);
    }
    mostrarVistaPublica();
  }
}

function mostrarVistaPublica() {
  if (vistaAtual === "publica") return;
  vistaAtual = "publica";
  document.body.dataset.vista = "publica";

  // Re-esconder o container privado
  const div = document.querySelector('[data-area="privada"]');
  if (div) div.hidden = true;

  // Limpar subscrições da privada se estavam ativas
  try { limparPrivada(); } catch (_) {}

  // Animações + dados
  animarHero();
  ativarObserver();
  iniciarVistaPublica().then(() => {
    // Parallax depende de figuras renderizadas — só ativar depois de dados
    ativarParallax();
  }).catch((erro) => {
    console.error("Falha a iniciar vista pública:", erro);
  });
}

function mostrarVistaPrivada() {
  if (vistaAtual === "privada") return;
  vistaAtual = "privada";
  document.body.dataset.vista = "privada";

  // Remover hidden do container privado (HTML inicial tem hidden)
  const div = document.querySelector('[data-area="privada"]');
  if (div) div.hidden = false;

  // Limpar subscrições da pública
  try { limparPublica(); } catch (_) {}

  iniciarVistaPrivada().catch((erro) => {
    console.error("Falha a iniciar vista privada:", erro);
  });
}

// ----------------------------------------------------------------------------
// Botão "Acesso aluno"
// ----------------------------------------------------------------------------

function atualizarBotaoAcesso(user) {
  const botao = document.querySelector(".acesso-aluno");
  if (!botao) return;
  const label = botao.querySelector("span");
  if (user) {
    if (label) label.textContent = "Dashboard";
    botao.dataset.action = "ir-dashboard";
    botao.setAttribute("aria-label", "Abrir dashboard");
  } else {
    if (label) label.textContent = "Acesso aluno";
    botao.dataset.action = "abrir-login";
    botao.setAttribute("aria-label", "Acesso restrito do aluno");
  }
}

// ----------------------------------------------------------------------------
// Modais (login)
// ----------------------------------------------------------------------------

function ligarModais() {
  const modalLogin    = document.querySelector("[data-modal-login]");
  const modalRegisto  = document.querySelector("[data-modal-registo]");
  const formLogin     = document.querySelector("[data-form-login]");
  const erroLogin     = document.querySelector("[data-login-erro]");

  // Botão de acesso → abre modal de login OU vai para dashboard
  document.addEventListener("click", (ev) => {
    const alvo = ev.target.closest("[data-action]");
    if (!alvo) return;
    const action = alvo.dataset.action;
    if (action === "abrir-login") {
      abrirModal(modalLogin);
    } else if (action === "ir-dashboard") {
      const url = new URL(window.location);
      url.searchParams.set("vista", "privada");
      window.history.pushState({}, "", url);
      mostrarVistaPrivada();
    }
  });

  // Fechar modais (fundo ou X) — só os modais de login e registo aqui;
  // o modal-form e modal-confirma são geridos por ui-privada.js
  document.addEventListener("click", (ev) => {
    const alvoFechar = ev.target.matches("[data-modal-fechar]")
                    || ev.target.closest(".modal-login [data-modal-fechar], .modal-login__fundo,"
                                       + " .modal-registo [data-modal-fechar], .modal-registo__fundo");
    if (!alvoFechar) return;
    const dentroLogin   = ev.target.closest(".modal-login");
    const dentroRegisto = ev.target.closest(".modal-registo");
    if (dentroLogin)   fecharModal(modalLogin);
    if (dentroRegisto) fecharModal(modalRegisto);
  });

  // ESC fecha modais de login (registo é gerido por ui-publica)
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      if (modalLogin && !modalLogin.hidden) fecharModal(modalLogin);
    }
  });

  // Submit do formulário de login
  if (formLogin) {
    formLogin.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      ocultarErro(erroLogin);

      const fd = new FormData(formLogin);
      const email    = fd.get("email")?.toString() || "";
      const password = fd.get("password")?.toString() || "";

      const submit = formLogin.querySelector("button[type=submit]");
      if (submit) {
        submit.disabled = true;
        submit.textContent = "A entrar…";
      }

      try {
        await entrar(email, password);
        formLogin.reset();
        fecharModal(modalLogin);
        // Atualizar URL e ir direto para vista privada.
        // O observarAuth também vai disparar mas chega depois.
        const url = new URL(window.location);
        url.searchParams.set("vista", "privada");
        window.history.pushState({}, "", url);
        mostrarVistaPrivada();
      } catch (erro) {
        mostrarErro(erroLogin, erro.message);
      } finally {
        if (submit) {
          submit.disabled = false;
          submit.textContent = "Entrar";
        }
      }
    });
  }

  // Botão back/forward do browser → re-decidir vista
  window.addEventListener("popstate", () => {
    decidirVista(estadoAuth.user);
  });
}

// ----------------------------------------------------------------------------
// Helpers de modal partilhados
// ----------------------------------------------------------------------------

export function abrirModal(modal) {
  if (!modal) return;
  modal.hidden = false;
  document.body.style.overflow = "hidden";
  const primeiro = modal.querySelector("input, button, [tabindex]:not([tabindex='-1'])");
  if (primeiro) requestAnimationFrame(() => primeiro.focus());
}

export function fecharModal(modal) {
  if (!modal) return;
  modal.hidden = true;
  document.body.style.overflow = "";
}

function mostrarErro(el, mensagem) {
  if (!el) return;
  el.textContent = mensagem;
  el.hidden = false;
}

function ocultarErro(el) {
  if (!el) return;
  el.textContent = "";
  el.hidden = true;
}

export { estadoAuth };
