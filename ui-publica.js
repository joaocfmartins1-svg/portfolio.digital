// ============================================================================
// ui-publica.js
// ----------------------------------------------------------------------------
// Renderiza a vista pública a partir dos dados do Firestore:
//   - Bloco 1: Hero (frase pessoal + nome)
//   - Bloco 2: "No início" (1.ª reflexão final + duas imagens em destaque do 1.º semestre)
//   - Bloco 3: Evolução (4 capítulos, um por semestre)
//   - Bloco 4: Quem sou hoje (perfil)
//   - Bloco 5: Portfólio completo (timeline com filtros)
//
// Mais: modal de detalhe de registo, sincronizado com URL (?registo=ID).
// ============================================================================

import { observarPerfil, tituloSemestre, reflexaoFinalSemestre } from "./perfil.js";
import { observarRegistosPublicados, lerRegistoPublicado }      from "./portfolio.js";
import { observarReflexoesPublicadas }                          from "./reflexoes.js";
import { observarDisciplinas }                                  from "./disciplinas.js";
import { ativarObserver }                                       from "./animacoes.js";
import { abrirModal, fecharModal }                              from "./app.js";

// ----------------------------------------------------------------------------
// Estado em memória
// ----------------------------------------------------------------------------

const estado = {
  perfil:      null,
  registos:    [],
  reflexoes:   [],
  disciplinas: [],

  // mapas auxiliares construídos a partir dos arrays
  disciplinasPorId: new Map(),

  // filtros do bloco 5
  filtros: {
    pesquisa:        "",
    semestre:        "todos",
    categoria:       "todas",
    destaquesOnly:   false
  }
};

// Cache de unsubscribers para limpeza em caso de re-init
let unsubs = [];

// ----------------------------------------------------------------------------
// API pública
// ----------------------------------------------------------------------------

/**
 * Inicia a vista pública. Subscreve todas as fontes e renderiza quando
 * tem dados suficientes. Devolve uma Promise que resolve assim que a
 * primeira renderização completa estiver pronta.
 */
export async function iniciarVistaPublica() {
  limparSubscricoes();

  // Subscrever todas as fontes em paralelo. Cada uma triggera um re-render.
  let registosOk = false, reflexoesOk = false, disciplinasOk = false, perfilOk = false;
  let resolveInicial;
  const promessaInicial = new Promise((r) => (resolveInicial = r));

  const tentarResolverInicial = () => {
    if (registosOk && reflexoesOk && disciplinasOk && perfilOk) {
      resolveInicial();
    }
  };

  unsubs.push(observarPerfil((p) => {
    estado.perfil = p;
    perfilOk = true;
    renderizarTudo();
    tentarResolverInicial();
  }));

  unsubs.push(observarRegistosPublicados((lista) => {
    estado.registos = lista;
    registosOk = true;
    renderizarTudo();
    tentarResolverInicial();
  }));

  unsubs.push(observarReflexoesPublicadas((lista) => {
    estado.reflexoes = lista;
    reflexoesOk = true;
    renderizarTudo();
    tentarResolverInicial();
  }));

  unsubs.push(observarDisciplinas((lista) => {
    estado.disciplinas = lista;
    estado.disciplinasPorId = new Map(lista.map((d) => [d.id, d]));
    disciplinasOk = true;
    renderizarTudo();
    tentarResolverInicial();
  }));

  // Ligar filtros e modal de registo (uma única vez)
  ligarFiltros();
  ligarModalRegisto();

  // Timeout defensivo: se algo falhar, deixar render parcial após 5s
  setTimeout(() => resolveInicial(), 5000);

  await promessaInicial;
}

export function limparSubscricoes() {
  unsubs.forEach((u) => { try { u(); } catch (_) {} });
  unsubs = [];
}

// ============================================================================
// RENDERIZAÇÃO
// ============================================================================

function renderizarTudo() {
  renderizarHero();
  renderizarInicio();
  renderizarEvolucao();
  renderizarQuemSou();
  renderizarPortfolioCompleto();

  // Re-ativar IntersectionObserver para conteúdo recém-criado
  ativarObserver();
}

// ----------------------------------------------------------------------------
// Bloco 1: Hero
// ----------------------------------------------------------------------------

function renderizarHero() {
  const fraseEl     = document.querySelector(".hero__frase");
  const nomeEl      = document.querySelector(".hero__nome");
  const anosEl      = document.querySelector(".hero__anos");

  if (!estado.perfil) return; // mantém o mock até dados chegarem

  if (fraseEl && estado.perfil.frasePessoal) {
    // A frase pode conter palavras a destacar com itálico — convenção:
    // o autor pode usar *palavra* para marcar partes a italicizar.
    fraseEl.innerHTML = formatarFrasePessoal(estado.perfil.frasePessoal);
  }
  if (nomeEl && estado.perfil.nome) {
    nomeEl.textContent = estado.perfil.nome;
  }
  if (anosEl && estado.perfil.anoInicio && estado.perfil.anoFim) {
    anosEl.textContent = `${estado.perfil.anoInicio} — ${estado.perfil.anoFim}`;
  }
}

/** Converte *palavra* em <em>palavra</em> (markdown leve). */
function formatarFrasePessoal(texto) {
  return escaparHtml(texto).replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

/**
 * Como formatarFrasePessoal mas para textos longos: divide por \n\n
 * em parágrafos visuais usando <span class="paragrafo">. Não usa <p> porque
 * será inserido dentro de elementos que já são <p> (caso .semestre__reflexao).
 * Cada parágrafo suporta *...* para itálico.
 */
function formatarTextoMultiparagrafo(texto) {
  if (!texto) return "";
  const partes = texto.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (partes.length === 1) {
    // Texto simples: aplicar markdown leve, suportar quebras simples como <br>
    return escaparHtml(partes[0])
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/\n/g, "<br>");
  }
  return partes
    .map((p, i) => {
      const html = escaparHtml(p)
        .replace(/\*([^*]+)\*/g, "<em>$1</em>")
        .replace(/\n/g, "<br>");
      // Separadores entre parágrafos: dois <br> dão respiração tipográfica
      return (i > 0 ? '<br><br>' : '') + html;
    })
    .join("");
}

// ----------------------------------------------------------------------------
// Bloco 2: No início
// ----------------------------------------------------------------------------

function renderizarInicio() {
  const corpoEl    = document.querySelector(".reflexao-destaque__corpo");
  const corposEls  = document.querySelectorAll(".reflexao-destaque__corpo");
  const galeria    = document.querySelector(".inicio__galeria");

  // Reflexão final do 1.º semestre vem do perfil (campo reflexoesFinaisSemestres)
  if (estado.perfil) {
    const reflexao = reflexaoFinalSemestre(estado.perfil, 1);
    if (reflexao) {
      const partes = reflexao.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

      if (partes.length === 0) return;

      // Primeiro parágrafo recebe o capitular
      if (corpoEl) {
        const primeiro = partes[0];
        const html = escaparHtml(primeiro)
          .replace(/\*([^*]+)\*/g, "<em>$1</em>");
        // Inserir capitular no início (a primeira letra fica visualmente separada)
        const primeiraLetra = html.charAt(0);
        const resto = html.slice(1);
        corpoEl.innerHTML = `<span class="reflexao-destaque__capitular">${primeiraLetra}</span>${resto}`;
      }

      // Restantes parágrafos vão para o segundo .reflexao-destaque__corpo
      // (e os que vierem a seguir são adicionados como novos)
      const segundoCorpo = corposEls[1];
      if (segundoCorpo) {
        if (partes.length > 1) {
          segundoCorpo.style.display = "";
          // Re-criar conteúdo: o segundo elemento original recebe o segundo
          // parágrafo, mas se houver mais, anexamos novos depois.
          segundoCorpo.innerHTML = escaparHtml(partes[1])
            .replace(/\*([^*]+)\*/g, "<em>$1</em>");

          // Remover quaisquer parágrafos extra que tenham sido adicionados antes
          let extra = segundoCorpo.nextElementSibling;
          while (extra && extra.classList.contains("reflexao-destaque__corpo--extra")) {
            const next = extra.nextElementSibling;
            extra.remove();
            extra = next;
          }
          // Adicionar novos parágrafos extra para partes[2]+
          for (let i = 2; i < partes.length; i++) {
            const p = document.createElement("p");
            p.className = "reflexao-destaque__corpo reflexao-destaque__corpo--extra";
            p.innerHTML = escaparHtml(partes[i]).replace(/\*([^*]+)\*/g, "<em>$1</em>");
            segundoCorpo.parentNode.insertBefore(p, segundoCorpo.nextSibling);
          }
        } else {
          segundoCorpo.style.display = "none";
        }
      }
    }
  }

  // Galeria: primeiras duas imagens publicadas do 1.º semestre, em destaque
  if (galeria) {
    const dois = estado.registos
      .filter((r) => r.semestre === 1 && r.imagemCapaUrl)
      .slice(0, 2);

    if (dois.length) {
      galeria.innerHTML = dois.map((r, i) => `
        <figure class="inicio__figura inicio__figura--${i === 0 ? 'alta' : 'baixa'}" data-anim="fade-up">
          <img src="${escaparAttr(r.imagemCapaUrl)}" alt="${escaparAttr(r.titulo)}" loading="lazy" />
          <figcaption>${escaparHtml(r.titulo)}</figcaption>
        </figure>
      `).join("");
    }
    // Se não houver imagens, deixar os placeholders coloridos do mock (boa fallback estética).
  }
}

// ----------------------------------------------------------------------------
// Bloco 3: Evolução (4 capítulos)
// ----------------------------------------------------------------------------

function renderizarEvolucao() {
  for (let s = 1; s <= 4; s++) {
    renderizarSemestre(s);
  }
}

function renderizarSemestre(numero) {
  const seccao = document.querySelector(`[data-semestre="${numero}"]`);
  if (!seccao) return;

  // Cabeçalho
  const tituloEl   = seccao.querySelector(".semestre__titulo");
  const reflexEl   = seccao.querySelector(".semestre__reflexao");

  if (tituloEl && estado.perfil) {
    tituloEl.textContent = tituloSemestre(estado.perfil, numero);
  }
  if (reflexEl && estado.perfil) {
    const r = reflexaoFinalSemestre(estado.perfil, numero);
    if (r) {
      reflexEl.innerHTML = formatarTextoMultiparagrafo(r);
    }
  }

  // Registos (apenas destaques, máximo 6)
  const registosEl = seccao.querySelector(".semestre__registos");
  if (!registosEl) return;

  const destaques = estado.registos
    .filter((r) => r.semestre === numero && r.destaque)
    .slice(0, 6);

  if (destaques.length === 0) {
    // Se não há destaques mas há registos, mostrar os 2 mais recentes
    const recentes = estado.registos
      .filter((r) => r.semestre === numero)
      .slice(0, 2);
    if (recentes.length === 0) {
      registosEl.innerHTML = "";
      return;
    }
    registosEl.innerHTML = recentes.map((r) => cardHtml(r)).join("");
  } else {
    registosEl.innerHTML = destaques.map((r) => cardHtml(r)).join("");
  }
}

function cardHtml(registo) {
  const disciplina = estado.disciplinasPorId.get(registo.disciplinaId);
  const corBadge = disciplina?.cor || "#d49a4a";
  const nomeDisc = disciplina?.nome || "Disciplina";
  const cat = registo.categoria === "teoria" ? "Teoria" : "Prática";

  const imagemHtml = registo.imagemCapaUrl
    ? `<img src="${escaparAttr(registo.imagemCapaUrl)}" alt="" loading="lazy" />`
    : `<div class="placeholder-imagem placeholder-imagem--${corPlaceholder(registo.disciplinaId)}" aria-hidden="true"></div>`;

  return `
    <a class="card" href="?registo=${encodeURIComponent(registo.id)}" data-card-registo data-anim="fade-up">
      <div class="card__imagem">
        ${imagemHtml}
        <span class="card__categoria card__categoria--${registo.categoria}">${cat}</span>
      </div>
      <div class="card__corpo">
        <span class="card__disciplina" style="--badge: ${escaparAttr(corBadge)}">${escaparHtml(nomeDisc)}</span>
        <h3 class="card__titulo">${escaparHtml(registo.titulo)}</h3>
        <p class="card__excerto">${escaparHtml(excerto(registo.descricao, 140))}</p>
      </div>
    </a>
  `;
}

/** Escolhe um placeholder rotativo baseado no id da disciplina. */
function corPlaceholder(id) {
  const cores = ["ocre", "terracota", "musgo"];
  if (!id) return cores[0];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i)) % cores.length;
  return cores[h];
}

// ----------------------------------------------------------------------------
// Bloco 4: Quem sou hoje
// ----------------------------------------------------------------------------

function renderizarQuemSou() {
  if (!estado.perfil) return;

  const nomeEl   = document.querySelector(".hero__nome"); // já tratado
  const bioEl    = document.querySelector(".quem-sou__bio");
  const tituloEl = document.querySelector(".quem-sou__titulo");
  const metaEl   = document.querySelector(".quem-sou__meta");
  const retrato  = document.querySelector(".quem-sou__retrato");

  if (bioEl && estado.perfil.bio) bioEl.textContent = estado.perfil.bio;

  if (metaEl) {
    metaEl.innerHTML = `
      <div>
        <dt>Instituição</dt>
        <dd>${escaparHtml(estado.perfil.instituicao || "—")}</dd>
      </div>
      <div>
        <dt>Curso</dt>
        <dd>${escaparHtml(estado.perfil.curso || "—")}</dd>
      </div>
      <div>
        <dt>Anos</dt>
        <dd>${estado.perfil.anoInicio || ""} — ${estado.perfil.anoFim || ""}</dd>
      </div>
    `;
  }

  // Foto de perfil — substitui o placeholder se houver URL
  if (retrato && estado.perfil.fotoUrl) {
    retrato.innerHTML = `
      <img src="${escaparAttr(estado.perfil.fotoUrl)}"
           alt="${escaparAttr(estado.perfil.nome || 'Foto de perfil')}"
           class="retrato-imagem"
           loading="lazy" />
    `;
  }
}

// ----------------------------------------------------------------------------
// Bloco 5: Portfólio completo (timeline + filtros)
// ----------------------------------------------------------------------------

function renderizarPortfolioCompleto() {
  const timelineEl = document.querySelector("[data-timeline]");
  const vazioEl    = document.querySelector("[data-estado-vazio]");
  if (!timelineEl) return;

  const filtrados = aplicarFiltros(estado.registos);

  if (filtrados.length === 0) {
    timelineEl.innerHTML = "";
    if (vazioEl) vazioEl.hidden = false;
    return;
  }
  if (vazioEl) vazioEl.hidden = true;

  timelineEl.innerHTML = filtrados.map((r) => itemTimelineHtml(r)).join("");
}

function itemTimelineHtml(r) {
  const disciplina = estado.disciplinasPorId.get(r.disciplinaId);
  const corBadge   = disciplina?.cor || "#d49a4a";
  const nomeDisc   = disciplina?.nome || "Disciplina";
  const cat        = r.categoria === "teoria" ? "Teoria" : "Prática";

  return `
    <li class="timeline__item" data-timeline-item data-semestre="${r.semestre}" data-categoria="${r.categoria}">
      <div class="timeline__marca" aria-hidden="true"><span></span></div>
      <a class="timeline__link" href="?registo=${encodeURIComponent(r.id)}" data-card-registo>
        <article class="timeline__card">
          <header class="timeline__cabecalho">
            <time datetime="${dataIso(r.data)}">${dataMesAno(r.data)}</time>
            <span class="timeline__semestre">${r.semestre}.º Sem.</span>
          </header>
          <h3>${escaparHtml(r.titulo)}</h3>
          <p>${escaparHtml(excerto(r.descricao, 180))}</p>
          <footer>
            <span class="timeline__disciplina" style="--badge: ${escaparAttr(corBadge)}">${escaparHtml(nomeDisc)}</span>
            <span class="timeline__categoria">${cat}</span>
          </footer>
        </article>
      </a>
    </li>
  `;
}

// ----------------------------------------------------------------------------
// FILTROS — pesquisa, semestre, categoria, destaques
// ----------------------------------------------------------------------------

function ligarFiltros() {
  const pesquisa = document.querySelector("[data-filtro='pesquisa']");
  if (pesquisa) {
    pesquisa.addEventListener("input", debounce((ev) => {
      estado.filtros.pesquisa = ev.target.value || "";
      renderizarPortfolioCompleto();
    }, 200));
  }

  document.querySelectorAll("[data-filtro-semestre]").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("[data-filtro-semestre]").forEach((c) => c.classList.remove("filtros__chip--ativo"));
      chip.classList.add("filtros__chip--ativo");
      estado.filtros.semestre = chip.dataset.filtroSemestre;
      renderizarPortfolioCompleto();
    });
  });

  document.querySelectorAll("[data-filtro-categoria]").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("[data-filtro-categoria]").forEach((c) => c.classList.remove("filtros__chip--ativo"));
      chip.classList.add("filtros__chip--ativo");
      estado.filtros.categoria = chip.dataset.filtroCategoria;
      renderizarPortfolioCompleto();
    });
  });

  const destaquesOnly = document.querySelector("[data-filtro='destaques-only']");
  if (destaquesOnly) {
    destaquesOnly.addEventListener("change", (ev) => {
      estado.filtros.destaquesOnly = ev.target.checked;
      renderizarPortfolioCompleto();
    });
  }

  // Botão exportar PDF — injeta cabeçalho de impressão antes de print
  const exportar = document.querySelector("[data-action='exportar-pdf']");
  if (exportar) {
    exportar.addEventListener("click", () => imprimirPortfolio());
  }
}

/**
 * Prepara a página para impressão: injeta um cabeçalho com nome, curso e ano,
 * dispara window.print(), depois limpa o cabeçalho.
 */
function imprimirPortfolio() {
  const portfolioCompleto = document.querySelector(".portfolio-completo");
  if (!portfolioCompleto) {
    window.print();
    return;
  }

  // Construir cabeçalho com dados do perfil (ou fallbacks neutros)
  const p = estado.perfil;
  const totalRegistos = estado.registos.length;
  const dataHoje = new Date().toLocaleDateString("pt-PT", {
    day: "numeric", month: "long", year: "numeric"
  });

  const cabecalho = document.createElement("header");
  cabecalho.className = "cabecalho-impressao";
  cabecalho.innerHTML = `
    <span class="cabecalho-impressao__etiqueta">Portfólio · Educação Infantil</span>
    <h1 class="cabecalho-impressao__titulo">Portfólio completo</h1>
    ${p?.nome ? `<p class="cabecalho-impressao__autor">${escaparHtml(p.nome)}</p>` : ""}
    <p class="cabecalho-impressao__meta">
      ${p?.instituicao ? escaparHtml(p.instituicao) + " · " : ""}${p?.curso ? escaparHtml(p.curso) + " · " : ""}${p?.anoInicio || ""} — ${p?.anoFim || ""}
      <br>${totalRegistos} trabalho${totalRegistos === 1 ? "" : "s"} · gerado em ${dataHoje}
    </p>
  `;

  // Inserir antes da timeline (dentro de .portfolio-completo, antes do header
  // existente, que será escondido por print.css)
  portfolioCompleto.insertBefore(cabecalho, portfolioCompleto.firstChild);

  // Listener para remover o cabeçalho após o print (independente de OK/Cancel)
  const limparCabecalho = () => {
    if (cabecalho.parentNode) cabecalho.parentNode.removeChild(cabecalho);
    window.removeEventListener("afterprint", limparCabecalho);
  };
  window.addEventListener("afterprint", limparCabecalho);

  // Pequeno timeout para o browser aplicar o DOM antes de abrir o diálogo
  setTimeout(() => window.print(), 50);

  // Fallback: se afterprint não disparar (raro), limpar após 30s
  setTimeout(limparCabecalho, 30000);
}

function aplicarFiltros(lista) {
  const f = estado.filtros;
  let res = lista;

  if (f.semestre !== "todos") {
    res = res.filter((r) => r.semestre === Number(f.semestre));
  }
  if (f.categoria !== "todas") {
    res = res.filter((r) => r.categoria === f.categoria);
  }
  if (f.destaquesOnly) {
    res = res.filter((r) => r.destaque);
  }
  if (f.pesquisa.trim()) {
    const termo = removerAcentos(f.pesquisa.toLowerCase().trim());
    res = res.filter((r) => {
      const blob = removerAcentos(
        `${r.titulo} ${r.descricao}`.toLowerCase()
      );
      return blob.includes(termo);
    });
  }
  return res;
}

// ----------------------------------------------------------------------------
// MODAL DE DETALHE DE REGISTO — sincronizado com URL ?registo=ID
// ----------------------------------------------------------------------------

function ligarModalRegisto() {
  const modal = document.querySelector("[data-modal-registo]");

  // Cliques em cards/timeline → abrir modal e atualizar URL
  document.addEventListener("click", (ev) => {
    const link = ev.target.closest("[data-card-registo]");
    if (!link) return;

    ev.preventDefault();
    const url = new URL(link.href, window.location.origin);
    const id = url.searchParams.get("registo");
    if (id) abrirRegisto(id, /* pushHistory */ true);
  });

  // Fechar modal: também limpa o ?registo da URL
  document.addEventListener("click", (ev) => {
    if (ev.target.matches(".modal-registo [data-modal-fechar]") ||
        ev.target.closest(".modal-registo [data-modal-fechar]")) {
      fecharRegisto(/* pushHistory */ true);
    }
  });

  // ESC fecha
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && modal && !modal.hidden) {
      fecharRegisto(true);
    }
  });

  // Botões back/forward do browser → ler URL e abrir/fechar conforme
  window.addEventListener("popstate", () => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("registo");
    if (id) abrirRegisto(id, /* pushHistory */ false);
    else fecharRegisto(/* pushHistory */ false);
  });

  // Carregamento inicial: se URL já tem ?registo=, abrir (após dados estarem prontos)
  const params = new URLSearchParams(window.location.search);
  const idInicial = params.get("registo");
  if (idInicial) {
    // Esperar que os dados estejam carregados antes de tentar
    setTimeout(() => abrirRegisto(idInicial, false), 1500);
  }
}

async function abrirRegisto(id, pushHistory) {
  const modal = document.querySelector("[data-modal-registo]");
  if (!modal) return;

  // Tentar primeiro o cache local
  let registo = estado.registos.find((r) => r.id === id);
  if (!registo) {
    try {
      registo = await lerRegistoPublicado(id);
    } catch (_) { registo = null; }
  }

  if (!registo) {
    preencherModalErro("Registo não encontrado.");
  } else {
    preencherModalRegisto(registo);
  }

  abrirModal(modal);

  if (pushHistory) {
    const url = new URL(window.location);
    url.searchParams.set("registo", id);
    window.history.pushState({ registo: id }, "", url);
  }
}

function fecharRegisto(pushHistory) {
  const modal = document.querySelector("[data-modal-registo]");
  if (!modal) return;
  fecharModal(modal);

  if (pushHistory) {
    const url = new URL(window.location);
    url.searchParams.delete("registo");
    window.history.pushState({}, "", url);
  }
}

function preencherModalRegisto(r) {
  const conteudo = document.querySelector(".modal-registo__conteudo");
  const titulo   = document.getElementById("modal-registo-titulo");
  if (!conteudo) return;

  const disciplina = estado.disciplinasPorId.get(r.disciplinaId);
  const nomeDisc   = disciplina?.nome || "Disciplina";
  const cat        = r.categoria === "teoria" ? "Teoria" : "Prática";

  if (titulo) titulo.textContent = r.titulo;

  // Reflexões ligadas a este registo
  const reflexoesLigadas = estado.reflexoes.filter((rf) => rf.registoId === r.id);

  conteudo.innerHTML = `
    <header class="modal-registo__cabecalho">
      <span class="modal-registo__semestre">${r.semestre}.º Semestre · ${nomeDisc} · ${cat}</span>
      <h2 id="modal-registo-titulo">${escaparHtml(r.titulo)}</h2>
      <time class="modal-registo__data" datetime="${dataIso(r.data)}">${dataMesAno(r.data)}</time>
    </header>
    ${r.imagemCapaUrl ? `
      <figure class="modal-registo__imagem">
        <img src="${escaparAttr(r.imagemCapaUrl)}" alt="${escaparAttr(r.titulo)}" />
      </figure>
    ` : ""}
    <div class="modal-registo__descricao">
      ${escaparHtml(r.descricao).split("\n").filter(Boolean).map((p) => `<p>${p}</p>`).join("")}
    </div>
    ${(Array.isArray(r.linksEvidencia) && r.linksEvidencia.length) ? `
      <section class="modal-registo__evidencias">
        <h3>Evidências</h3>
        <ul>
          ${r.linksEvidencia.map((l) => `
            <li><a href="${escaparAttr(l.url)}" target="_blank" rel="noopener noreferrer">${escaparHtml(l.titulo)}</a></li>
          `).join("")}
        </ul>
      </section>
    ` : ""}
    ${reflexoesLigadas.length ? `
      <section class="modal-registo__reflexoes">
        <h3>Reflexões</h3>
        ${reflexoesLigadas.map((rf) => `
          <article class="modal-registo__reflexao">
            <h4>${escaparHtml(rf.titulo)}</h4>
            <div>${escaparHtml(rf.texto).split("\n").filter(Boolean).map((p) => `<p>${p}</p>`).join("")}</div>
          </article>
        `).join("")}
      </section>
    ` : ""}
  `;
}

function preencherModalErro(mensagem) {
  const conteudo = document.querySelector(".modal-registo__conteudo");
  if (!conteudo) return;
  conteudo.innerHTML = `<p class="modal-registo__erro">${escaparHtml(mensagem)}</p>`;
}

// ============================================================================
// UTILITÁRIOS
// ============================================================================

function escaparHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escaparAttr(s) {
  return escaparHtml(s);
}

function excerto(texto, max) {
  if (!texto) return "";
  if (texto.length <= max) return texto;
  const cortado = texto.slice(0, max).replace(/\s+\S*$/, "");
  return cortado + "…";
}

function removerAcentos(s) {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function dataIso(d) {
  if (!d) return "";
  if (d instanceof Date) return d.toISOString();
  if (d.toDate) return d.toDate().toISOString();
  if (d.seconds) return new Date(d.seconds * 1000).toISOString();
  return "";
}

function dataMesAno(d) {
  let date;
  if (!d) return "";
  if (d instanceof Date) date = d;
  else if (d.toDate) date = d.toDate();
  else if (d.seconds) date = new Date(d.seconds * 1000);
  else return "";

  const meses = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                 "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  return `${meses[date.getMonth()]} ${date.getFullYear()}`;
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
