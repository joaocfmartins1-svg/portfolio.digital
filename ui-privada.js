// ============================================================================
// ui-privada.js
// ----------------------------------------------------------------------------
// Vista privada (dashboard). 5 tabs:
//   1. Registos     — listar/criar/editar/apagar/destacar/publicar
//   2. Reflexões    — listar/criar/editar/apagar
//   3. Objetivos    — metas com checkbox por semestre
//   4. Disciplinas  — gestão simples + cor
//   5. Perfil       — formulário do perfil + títulos e reflexões finais
//
// Toda a renderização é client-side, com escape de HTML em todos os pontos.
// Os módulos de dados (./registos, ./reflexoes, etc.) já fazem validação.
// ============================================================================

import { sair, observarAuth }                        from "./auth.js";
import { Timestamp }                                 from "./firebase-config.js";
import {
  observarRegistosDoDono, lerRegistoDoDono,
  criarRegisto, atualizarRegisto, apagarRegisto,
  alternarDestaque, alternarPublicado
}                                                    from "./portfolio.js";
import {
  observarReflexoesDoDono,
  criarReflexao, atualizarReflexao, apagarReflexao
}                                                    from "./reflexoes.js";
import {
  observarTodosObjetivos, guardarObjetivos, novaMeta
}                                                    from "./objetivos.js";
import {
  observarDisciplinas,
  criarDisciplina, atualizarDisciplina, apagarDisciplina
}                                                    from "./disciplinas.js";
import {
  observarPerfil, guardarPerfil
}                                                    from "./perfil.js";
import {
  uploadImagemRegisto, uploadFotoPerfil, validarImagem
}                                                    from "./storage.js";

// ----------------------------------------------------------------------------
// Estado em memória
// ----------------------------------------------------------------------------

const estado = {
  user: null,
  perfil: null,
  registos: [],
  reflexoes: [],
  objetivos: [],     // sempre 4 itens (1..4)
  disciplinas: [],

  // mapas auxiliares
  disciplinasPorId: new Map(),

  // tab ativa
  tabAtiva: "registos",

  // filtros do tab registos
  filtroRegistos: {
    pesquisa: "",
    semestre: "todos",
    estado:   "todos"
  }
};

let unsubs = [];

// ----------------------------------------------------------------------------
// Entry point — chamado por app.js
// ----------------------------------------------------------------------------

export async function iniciarVistaPrivada() {
  // Subscrever todas as fontes (com auth)
  limparSubscricoes();

  unsubs.push(observarPerfil((p) => {
    estado.perfil = p;
    if (p?.nome) {
      const el = document.querySelector("[data-dashboard-autor]");
      if (el) el.textContent = p.nome;
    }
    re_renderTabAtual();
  }));

  unsubs.push(observarRegistosDoDono((lista) => {
    estado.registos = lista;
    re_renderTabAtual();
  }));

  unsubs.push(observarReflexoesDoDono((lista) => {
    estado.reflexoes = lista;
    re_renderTabAtual();
  }));

  unsubs.push(observarTodosObjetivos((lista) => {
    estado.objetivos = lista;
    re_renderTabAtual();
  }));

  unsubs.push(observarDisciplinas((lista) => {
    estado.disciplinas = lista;
    estado.disciplinasPorId = new Map(lista.map((d) => [d.id, d]));
    re_renderTabAtual();
  }));

  // Ligar interações da sidebar
  ligarSidebar();
  ligarModaisGenericos();

  // Render inicial
  selecionarTab(estado.tabAtiva);
}

export function limparSubscricoes() {
  unsubs.forEach((u) => { try { u(); } catch (_) {} });
  unsubs = [];
}

// ============================================================================
// SIDEBAR e ROUTING DE TABS
// ============================================================================

function ligarSidebar() {
  document.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => selecionarTab(btn.dataset.tab));
  });

  document.querySelectorAll("[data-action='sair']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await sair();
        // app.js vai detetar mudança de auth e voltar para vista pública
        window.location.search = "?";
      } catch (e) {
        toast("Não foi possível sair: " + e.message, true);
      }
    });
  });
}

function selecionarTab(nome) {
  estado.tabAtiva = nome;

  // Atualizar visualmente o tab ativo
  document.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.classList.toggle("dashboard__tab--ativa", btn.dataset.tab === nome);
  });

  re_renderTabAtual();
}

function re_renderTabAtual() {
  const conteudo = document.querySelector("[data-dashboard-conteudo]");
  if (!conteudo) return;

  switch (estado.tabAtiva) {
    case "registos":    renderTabRegistos(conteudo); break;
    case "reflexoes":   renderTabReflexoes(conteudo); break;
    case "objetivos":   renderTabObjetivos(conteudo); break;
    case "disciplinas": renderTabDisciplinas(conteudo); break;
    case "perfil":      renderTabPerfil(conteudo); break;
    default:            conteudo.innerHTML = "<p>Tab desconhecido.</p>";
  }
}

// ============================================================================
// TAB 1: REGISTOS
// ============================================================================

function renderTabRegistos(container) {
  const filtrados = aplicarFiltrosRegistos(estado.registos);

  container.innerHTML = `
    <header class="tab-cabecalho">
      <div>
        <h1>Registos</h1>
        <p>${estado.registos.length} no total · ${estado.registos.filter(r=>r.estado==="publicado").length} publicados</p>
      </div>
      <button type="button" class="botao-primario" data-novo-registo>
        + Novo registo
      </button>
    </header>

    <div class="dashboard-filtros">
      <input type="search" placeholder="Pesquisar por título ou descrição…"
             value="${escAttr(estado.filtroRegistos.pesquisa)}" data-fr-pesquisa />
      <select data-fr-semestre>
        <option value="todos" ${estado.filtroRegistos.semestre==='todos'?'selected':''}>Todos os semestres</option>
        <option value="1" ${estado.filtroRegistos.semestre==='1'?'selected':''}>1.º Semestre</option>
        <option value="2" ${estado.filtroRegistos.semestre==='2'?'selected':''}>2.º Semestre</option>
        <option value="3" ${estado.filtroRegistos.semestre==='3'?'selected':''}>3.º Semestre</option>
        <option value="4" ${estado.filtroRegistos.semestre==='4'?'selected':''}>4.º Semestre</option>
      </select>
      <select data-fr-estado>
        <option value="todos" ${estado.filtroRegistos.estado==='todos'?'selected':''}>Todos os estados</option>
        <option value="publicado" ${estado.filtroRegistos.estado==='publicado'?'selected':''}>Publicados</option>
        <option value="rascunho" ${estado.filtroRegistos.estado==='rascunho'?'selected':''}>Rascunhos</option>
      </select>
    </div>

    ${filtrados.length === 0 ? `
      <div class="estado-vazio-tab">
        <h3>${estado.registos.length === 0 ? 'Sem registos ainda' : 'Sem resultados'}</h3>
        <p>${estado.registos.length === 0 ? 'Cria o teu primeiro registo do portfólio.' : 'Tenta limpar os filtros.'}</p>
        ${estado.registos.length === 0 ? '<button type="button" class="botao-primario" data-novo-registo>+ Novo registo</button>' : ''}
      </div>
    ` : `
      <div class="lista-itens">
        ${filtrados.map((r) => itemRegistoHtml(r)).join("")}
      </div>
    `}
  `;

  // Wire up
  container.querySelectorAll("[data-novo-registo]").forEach((b) =>
    b.addEventListener("click", () => abrirFormRegisto(null)));

  container.querySelector("[data-fr-pesquisa]")?.addEventListener("input",
    debounce((e) => { estado.filtroRegistos.pesquisa = e.target.value; re_renderTabAtual(); }, 200));
  container.querySelector("[data-fr-semestre]")?.addEventListener("change",
    (e) => { estado.filtroRegistos.semestre = e.target.value; re_renderTabAtual(); });
  container.querySelector("[data-fr-estado]")?.addEventListener("change",
    (e) => { estado.filtroRegistos.estado = e.target.value; re_renderTabAtual(); });

  container.querySelectorAll("[data-acao]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      manejarAcaoRegisto(btn.dataset.acao, btn.dataset.id);
    });
  });
}

function aplicarFiltrosRegistos(lista) {
  const f = estado.filtroRegistos;
  let res = lista;
  if (f.semestre !== "todos") res = res.filter((r) => r.semestre === Number(f.semestre));
  if (f.estado !== "todos")   res = res.filter((r) => r.estado === f.estado);
  if (f.pesquisa.trim()) {
    const termo = remAcentos(f.pesquisa.toLowerCase().trim());
    res = res.filter((r) => remAcentos(`${r.titulo} ${r.descricao}`.toLowerCase()).includes(termo));
  }
  return res;
}

function itemRegistoHtml(r) {
  const disc = estado.disciplinasPorId.get(r.disciplinaId);
  const corBadge = disc?.cor || "#d49a4a";
  return `
    <article class="item-card">
      <div class="item-card__corpo">
        <h3>${escHtml(r.titulo)}</h3>
        <div class="item-card__meta">
          <span>${r.semestre}.º Semestre</span>
          <span style="background: ${escAttr(corBadge)}; color: white; padding: 2px 8px; border-radius: 999px; font-size: 0.7em;">${escHtml(disc?.nome || 'Disciplina')}</span>
          <span>${r.categoria === "teoria" ? "Teoria" : "Prática"}</span>
          <span>${dataPt(r.data)}</span>
          ${r.estado === "rascunho" ? '<span class="pendente">Rascunho</span>' : ''}
          ${r.destaque ? '<span style="color: var(--cor-ocre-escuro);">★ Destaque</span>' : ''}
        </div>
        <p class="item-card__excerto">${escHtml(excerto(r.descricao, 180))}</p>
      </div>
      <div class="item-card__acoes">
        <button type="button" class="acao-icone ${r.estado==='publicado'?'acao-icone--ativa':''}"
                title="${r.estado==='publicado'?'Publicado · clicar para tornar rascunho':'Rascunho · clicar para publicar'}"
                data-acao="publicar" data-id="${r.id}">
          ${r.estado === 'publicado' ? '◉' : '○'}
        </button>
        <button type="button" class="acao-icone ${r.destaque?'acao-icone--ativa':''}"
                title="${r.destaque?'Em destaque':'Marcar como destaque'}"
                data-acao="destaque" data-id="${r.id}">★</button>
        <button type="button" class="acao-icone" title="Editar"
                data-acao="editar" data-id="${r.id}">✎</button>
        <button type="button" class="acao-icone acao-icone--destrutiva" title="Apagar"
                data-acao="apagar" data-id="${r.id}">×</button>
      </div>
    </article>
  `;
}

async function manejarAcaoRegisto(acao, id) {
  const registo = estado.registos.find((r) => r.id === id);
  if (!registo) return;

  try {
    switch (acao) {
      case "publicar":
        await alternarPublicado(id, registo.estado);
        toast(registo.estado === "publicado" ? "Convertido em rascunho." : "Publicado.");
        break;
      case "destaque":
        await alternarDestaque(id, registo.destaque);
        toast(registo.destaque ? "Removido dos destaques." : "Adicionado aos destaques.");
        break;
      case "editar":
        abrirFormRegisto(registo);
        break;
      case "apagar":
        confirmar(
          "Apagar registo?",
          `"${registo.titulo}" será removido permanentemente, junto com a imagem associada. Esta ação não pode ser desfeita.`,
          async () => {
            try {
              await apagarRegisto(id);
              toast("Registo apagado.");
            } catch (e) { toast(e.message, true); }
          }
        );
        break;
    }
  } catch (e) {
    toast(e.message, true);
  }
}

// ----- Form de registo -----

function abrirFormRegisto(registo) {
  const ePropoEdicao = !!registo;
  const r = registo || {
    titulo: "", semestre: 1, disciplinaId: "", categoria: "pratica",
    descricao: "", data: new Date(), destaque: false, estado: "rascunho",
    linksEvidencia: [], imagemCapaUrl: null, imagemCapaPath: null
  };

  abrirModalForm(ePropoEdicao ? "Editar registo" : "Novo registo", `
    <form data-form-registo class="form-grid" novalidate>
      <div class="campo">
        <label for="reg-titulo">Título</label>
        <input id="reg-titulo" name="titulo" type="text" required maxlength="120" minlength="3"
               value="${escAttr(r.titulo)}" />
        <span class="campo__contador" data-contador="titulo">0/120</span>
      </div>

      <div class="form-grid form-grid--2col">
        <div class="campo">
          <label for="reg-semestre">Semestre</label>
          <select id="reg-semestre" name="semestre">
            ${[1,2,3,4].map((s) => `<option value="${s}" ${r.semestre===s?'selected':''}>${s}.º Semestre</option>`).join("")}
          </select>
        </div>
        <div class="campo">
          <label for="reg-categoria">Categoria</label>
          <select id="reg-categoria" name="categoria">
            <option value="teoria" ${r.categoria==='teoria'?'selected':''}>Teoria</option>
            <option value="pratica" ${r.categoria==='pratica'?'selected':''}>Prática</option>
          </select>
        </div>
      </div>

      <div class="form-grid form-grid--2col">
        <div class="campo">
          <label for="reg-disciplina">Disciplina</label>
          <select id="reg-disciplina" name="disciplinaId" required data-disciplinas-do-semestre>
            <option value="">— escolher —</option>
          </select>
          <span class="campo__ajuda">Filtrada pelo semestre escolhido. Se a lista estiver vazia, cria a disciplina primeiro na tab "Disciplinas".</span>
        </div>
        <div class="campo">
          <label for="reg-data">Data</label>
          <input id="reg-data" name="data" type="date" required value="${dataIso(r.data)}" />
        </div>
      </div>

      <div class="campo">
        <label for="reg-descricao">Descrição</label>
        <textarea id="reg-descricao" name="descricao" required minlength="10" maxlength="2000" rows="6">${escHtml(r.descricao)}</textarea>
        <span class="campo__contador" data-contador="descricao">0/2000</span>
      </div>

      <div class="campo">
        <span class="campo__label">Imagem de capa</span>
        <div class="upload-imagem">
          <div class="upload-imagem__preview" data-preview>
            ${r.imagemCapaUrl ? `<img src="${escAttr(r.imagemCapaUrl)}" alt="" />` : '<span class="upload-imagem__preview-vazio">Sem imagem</span>'}
          </div>
          <div class="upload-imagem__controlos">
            <input type="file" id="reg-imagem" name="imagem" accept="image/jpeg,image/png,image/webp,image/gif" />
            <label for="reg-imagem" class="botao-secundario">Escolher imagem…</label>
            ${r.imagemCapaUrl ? '<button type="button" class="botao-secundario" data-remover-imagem>Remover</button>' : ''}
          </div>
          <span class="campo__ajuda">JPEG, PNG, WebP ou GIF · máximo 2MB</span>
        </div>
      </div>

      <div class="campo">
        <span class="campo__label">Links de evidência</span>
        <div class="lista-evidencias" data-lista-evidencias>
          ${(r.linksEvidencia || []).map((l, i) => itemEvidenciaHtml(l, i)).join("")}
        </div>
        <button type="button" class="lista-evidencias__adicionar" data-adicionar-evidencia>+ Adicionar link</button>
      </div>

      <div class="form-grid form-grid--2col">
        <label class="campo campo--toggle">
          <span class="campo__label">Destaque</span>
          <input type="checkbox" name="destaque" ${r.destaque?'checked':''} hidden />
          <span class="toggle"></span>
        </label>
        <label class="campo campo--toggle">
          <span class="campo__label">Publicado</span>
          <input type="checkbox" name="publicado" ${r.estado==='publicado'?'checked':''} hidden />
          <span class="toggle"></span>
        </label>
      </div>

      <p class="campo__erro" data-form-erro hidden></p>

      <div class="form-acoes">
        <button type="button" class="botao-secundario" data-modal-fechar>Cancelar</button>
        <button type="submit" class="botao-primario">${ePropoEdicao?'Guardar alterações':'Criar registo'}</button>
      </div>
    </form>
  `);

  // Inicializar disciplinas para o semestre atual
  refrescarDisciplinasNoSelect(r.semestre, r.disciplinaId);

  const form = document.querySelector("[data-form-registo]");

  // Refresh disciplinas quando muda semestre
  form.querySelector("[name='semestre']").addEventListener("change", (e) => {
    refrescarDisciplinasNoSelect(Number(e.target.value), null);
  });

  // Contadores
  ligarContador(form, "titulo", 120);
  ligarContador(form, "descricao", 2000);

  // Lista evidencias
  ligarListaEvidencias(form);

  // Upload preview
  ligarUploadPreview(form);

  // Submit
  form.addEventListener("submit", (ev) => submeterRegisto(ev, registo));
}

function itemEvidenciaHtml(l = { titulo: "", url: "" }, idx) {
  return `
    <div class="lista-evidencias__item" data-evid-idx="${idx}">
      <input type="text" placeholder="Título" value="${escAttr(l.titulo)}" data-evid-titulo />
      <input type="url" placeholder="https://…" value="${escAttr(l.url)}" data-evid-url />
      <button type="button" class="lista-evidencias__remover" aria-label="Remover" data-evid-remover>×</button>
    </div>
  `;
}

function refrescarDisciplinasNoSelect(semestre, idSelecionado) {
  const select = document.querySelector("[data-disciplinas-do-semestre]");
  if (!select) return;
  const ds = estado.disciplinas.filter((d) => d.semestre === Number(semestre));
  select.innerHTML = `<option value="">— escolher —</option>` +
    ds.map((d) => `<option value="${escAttr(d.id)}" ${d.id===idSelecionado?'selected':''}>${escHtml(d.nome)}</option>`).join("");
}

function ligarListaEvidencias(form) {
  const lista = form.querySelector("[data-lista-evidencias]");
  const adicionar = form.querySelector("[data-adicionar-evidencia]");
  let proximoIdx = lista.children.length;

  adicionar.addEventListener("click", () => {
    const div = document.createElement("div");
    div.innerHTML = itemEvidenciaHtml({ titulo: "", url: "" }, proximoIdx++);
    lista.appendChild(div.firstElementChild);
  });

  lista.addEventListener("click", (e) => {
    if (e.target.matches("[data-evid-remover]") || e.target.closest("[data-evid-remover]")) {
      const item = e.target.closest(".lista-evidencias__item");
      if (item) item.remove();
    }
  });
}

function ligarUploadPreview(form) {
  const input = form.querySelector("input[type='file']");
  const preview = form.querySelector("[data-preview]");
  if (!input || !preview) return;

  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      validarImagem(file);
    } catch (e) {
      toast(e.message, true);
      input.value = "";
      return;
    }
    const url = URL.createObjectURL(file);
    preview.innerHTML = `<img src="${url}" alt="" />`;
  });

  const remover = form.querySelector("[data-remover-imagem]");
  if (remover) {
    remover.addEventListener("click", () => {
      preview.innerHTML = '<span class="upload-imagem__preview-vazio">Sem imagem</span>';
      input.value = "";
      input.dataset.removerExistente = "true";
    });
  }
}

async function submeterRegisto(ev, registoExistente) {
  ev.preventDefault();
  const form = ev.target;
  const erroEl = form.querySelector("[data-form-erro]");
  const submit = form.querySelector("button[type=submit]");
  const original = submit.textContent;
  submit.disabled = true; submit.textContent = "A guardar…";
  ocultarErro(erroEl);

  try {
    const fd = new FormData(form);
    const linksEvidencia = Array.from(form.querySelectorAll(".lista-evidencias__item"))
      .map((it) => ({
        titulo: it.querySelector("[data-evid-titulo]").value.trim(),
        url:    it.querySelector("[data-evid-url]").value.trim()
      }))
      .filter((l) => l.titulo && l.url);

    const dataValor = fd.get("data");
    const dados = {
      titulo:        fd.get("titulo")?.toString() || "",
      semestre:      Number(fd.get("semestre")),
      disciplinaId:  fd.get("disciplinaId")?.toString() || "",
      categoria:     fd.get("categoria")?.toString() || "",
      descricao:     fd.get("descricao")?.toString() || "",
      data:          dataValor ? new Date(dataValor) : new Date(),
      destaque:      fd.get("destaque") === "on",
      estado:        fd.get("publicado") === "on" ? "publicado" : "rascunho",
      linksEvidencia,
      imagemCapaUrl: registoExistente?.imagemCapaUrl || null,
      imagemCapaPath:registoExistente?.imagemCapaPath || null
    };

    // Se utilizador clicou "Remover" na imagem
    const inputFile = form.querySelector("input[type='file']");
    if (inputFile?.dataset.removerExistente === "true") {
      dados.imagemCapaUrl = null;
      dados.imagemCapaPath = null;
    }

    let id;
    let pathAntigo = registoExistente?.imagemCapaPath || null;

    if (registoExistente) {
      // Atualizar (sem imagem nova ainda)
      await atualizarRegisto(registoExistente.id, dados, { pathAntigo: null });
      id = registoExistente.id;
    } else {
      id = await criarRegisto(dados);
    }

    // Se há nova imagem, fazer upload e atualizar paths
    const novoFicheiro = inputFile?.files?.[0];
    if (novoFicheiro) {
      submit.textContent = "A enviar imagem…";
      const { url, path } = await uploadImagemRegisto(id, novoFicheiro);
      await atualizarRegisto(id, { ...dados, imagemCapaUrl: url, imagemCapaPath: path },
                             { pathAntigo });
    } else if (registoExistente && pathAntigo &&
               (dados.imagemCapaUrl === null && dados.imagemCapaPath === null)) {
      // Pediu remoção sem substituir — apagar ficheiro antigo
      await atualizarRegisto(id, dados, { pathAntigo });
    }

    toast(registoExistente ? "Registo guardado." : "Registo criado.");
    fecharModalForm();
  } catch (e) {
    mostrarErro(erroEl, e.message);
    submit.disabled = false;
    submit.textContent = original;
  }
}

// ============================================================================
// TAB 2: REFLEXÕES
// ============================================================================

function renderTabReflexoes(container) {
  container.innerHTML = `
    <header class="tab-cabecalho">
      <div>
        <h1>Reflexões</h1>
        <p>${estado.reflexoes.length} no total · ${estado.reflexoes.filter(r=>r.estado==="publicado").length} publicadas</p>
      </div>
      <button type="button" class="botao-primario" data-nova-reflexao>+ Nova reflexão</button>
    </header>

    ${estado.reflexoes.length === 0 ? `
      <div class="estado-vazio-tab">
        <h3>Sem reflexões ainda</h3>
        <p>Cria reflexões livres ou ligadas a registos específicos.</p>
        <button type="button" class="botao-primario" data-nova-reflexao>+ Nova reflexão</button>
      </div>
    ` : `
      <div class="lista-itens">
        ${estado.reflexoes.map((r) => itemReflexaoHtml(r)).join("")}
      </div>
    `}
  `;

  container.querySelectorAll("[data-nova-reflexao]").forEach((b) =>
    b.addEventListener("click", () => abrirFormReflexao(null)));

  container.querySelectorAll("[data-acao-rf]").forEach((btn) => {
    btn.addEventListener("click", () => {
      manejarAcaoReflexao(btn.dataset.acaoRf, btn.dataset.id);
    });
  });
}

function itemReflexaoHtml(r) {
  const ligadoA = r.registoId ? estado.registos.find((reg) => reg.id === r.registoId) : null;
  return `
    <article class="item-card">
      <div class="item-card__corpo">
        <h3>${escHtml(r.titulo)}</h3>
        <div class="item-card__meta">
          <span>${r.semestre}.º Semestre</span>
          <span>${dataPt(r.data)}</span>
          ${ligadoA ? `<span>↗ ${escHtml(ligadoA.titulo)}</span>` : ''}
          ${r.estado === "rascunho" ? '<span class="pendente">Rascunho</span>' : ''}
        </div>
        <p class="item-card__excerto">${escHtml(excerto(r.texto, 180))}</p>
      </div>
      <div class="item-card__acoes">
        <button type="button" class="acao-icone" title="Editar"
                data-acao-rf="editar" data-id="${r.id}">✎</button>
        <button type="button" class="acao-icone acao-icone--destrutiva" title="Apagar"
                data-acao-rf="apagar" data-id="${r.id}">×</button>
      </div>
    </article>
  `;
}

async function manejarAcaoReflexao(acao, id) {
  const reflexao = estado.reflexoes.find((r) => r.id === id);
  if (!reflexao) return;

  if (acao === "editar") {
    abrirFormReflexao(reflexao);
  } else if (acao === "apagar") {
    confirmar(
      "Apagar reflexão?",
      `"${reflexao.titulo}" será removida permanentemente.`,
      async () => {
        try { await apagarReflexao(id); toast("Reflexão apagada."); }
        catch (e) { toast(e.message, true); }
      }
    );
  }
}

function abrirFormReflexao(reflexao) {
  const ePropoEdicao = !!reflexao;
  const r = reflexao || { titulo: "", texto: "", semestre: 1, registoId: "",
                          data: new Date(), estado: "rascunho" };

  abrirModalForm(ePropoEdicao ? "Editar reflexão" : "Nova reflexão", `
    <form data-form-reflexao class="form-grid" novalidate>
      <div class="campo">
        <label for="rf-titulo">Título</label>
        <input id="rf-titulo" name="titulo" type="text" required maxlength="120" minlength="3"
               value="${escAttr(r.titulo)}" />
        <span class="campo__contador" data-contador="titulo">0/120</span>
      </div>

      <div class="form-grid form-grid--2col">
        <div class="campo">
          <label for="rf-semestre">Semestre</label>
          <select id="rf-semestre" name="semestre">
            ${[1,2,3,4].map((s) => `<option value="${s}" ${r.semestre===s?'selected':''}>${s}.º Semestre</option>`).join("")}
          </select>
        </div>
        <div class="campo">
          <label for="rf-data">Data</label>
          <input id="rf-data" name="data" type="date" required value="${dataIso(r.data)}" />
        </div>
      </div>

      <div class="campo">
        <label for="rf-registo">Ligar a registo (opcional)</label>
        <select id="rf-registo" name="registoId">
          <option value="">— sem ligação —</option>
          ${estado.registos.map((reg) =>
            `<option value="${escAttr(reg.id)}" ${reg.id===r.registoId?'selected':''}>${escHtml(reg.titulo)}</option>`
          ).join("")}
        </select>
      </div>

      <div class="campo">
        <label for="rf-texto">Texto</label>
        <textarea id="rf-texto" name="texto" required minlength="20" maxlength="5000" rows="12">${escHtml(r.texto)}</textarea>
        <span class="campo__contador" data-contador="texto">0/5000</span>
        <span class="campo__ajuda">Pode usar *palavra* para destacar em itálico ocre. Linha em branco separa parágrafos.</span>
      </div>

      <label class="campo campo--toggle">
        <span class="campo__label">Publicada</span>
        <input type="checkbox" name="publicado" ${r.estado==='publicado'?'checked':''} hidden />
        <span class="toggle"></span>
      </label>

      <p class="campo__erro" data-form-erro hidden></p>
      <div class="form-acoes">
        <button type="button" class="botao-secundario" data-modal-fechar>Cancelar</button>
        <button type="submit" class="botao-primario">${ePropoEdicao?'Guardar alterações':'Criar reflexão'}</button>
      </div>
    </form>
  `);

  const form = document.querySelector("[data-form-reflexao]");
  ligarContador(form, "titulo", 120);
  ligarContador(form, "texto", 5000);
  form.addEventListener("submit", (ev) => submeterReflexao(ev, reflexao));
}

async function submeterReflexao(ev, reflexaoExistente) {
  ev.preventDefault();
  const form = ev.target;
  const erroEl = form.querySelector("[data-form-erro]");
  const submit = form.querySelector("button[type=submit]");
  const original = submit.textContent;
  submit.disabled = true; submit.textContent = "A guardar…";
  ocultarErro(erroEl);

  try {
    const fd = new FormData(form);
    const dataValor = fd.get("data");
    const dados = {
      titulo:    fd.get("titulo")?.toString() || "",
      texto:     fd.get("texto")?.toString() || "",
      semestre:  Number(fd.get("semestre")),
      registoId: fd.get("registoId")?.toString() || null,
      data:      dataValor ? new Date(dataValor) : new Date(),
      estado:    fd.get("publicado") === "on" ? "publicado" : "rascunho"
    };

    if (reflexaoExistente) {
      await atualizarReflexao(reflexaoExistente.id, dados);
    } else {
      await criarReflexao(dados);
    }
    toast(reflexaoExistente ? "Reflexão guardada." : "Reflexão criada.");
    fecharModalForm();
  } catch (e) {
    mostrarErro(erroEl, e.message);
    submit.disabled = false;
    submit.textContent = original;
  }
}

// ============================================================================
// TAB 3: OBJETIVOS
// ============================================================================

function renderTabObjetivos(container) {
  container.innerHTML = `
    <header class="tab-cabecalho">
      <div>
        <h1>Objetivos</h1>
        <p>Metas pessoais por semestre. <strong>Privadas</strong> — não aparecem na vista pública.</p>
      </div>
    </header>

    <div class="objetivos-grid">
      ${estado.objetivos.map((o) => cardObjetivosHtml(o)).join("")}
    </div>
  `;

  // Wire up cada card
  estado.objetivos.forEach((o) => {
    const card = container.querySelector(`[data-obj-card="${o.semestre}"]`);
    if (!card) return;
    ligarObjetivosCard(card, o);
  });
}

function cardObjetivosHtml(o) {
  const totais = (o.metas || []).length;
  const concluidas = (o.metas || []).filter((m) => m.concluida).length;
  return `
    <article class="objetivos-card" data-obj-card="${o.semestre}">
      <header class="objetivos-card__cabecalho">
        <h3>${o.semestre}.º Semestre</h3>
        <span class="objetivos-card__progresso">${concluidas} / ${totais}</span>
      </header>

      <ul class="objetivos-card__lista">
        ${(o.metas || []).map((m, i) => `
          <li class="objetivo-meta ${m.concluida?'objetivo-meta--concluida':''}" data-meta-idx="${i}">
            <input type="checkbox" class="objetivo-meta__check" ${m.concluida?'checked':''} data-meta-check />
            <input type="text" class="objetivo-meta__texto" value="${escAttr(m.texto)}" data-meta-texto maxlength="300" />
            <button type="button" class="objetivo-meta__remover" aria-label="Remover" data-meta-remover>×</button>
          </li>
        `).join("")}
      </ul>

      <div class="objetivos-card__nova">
        <input type="text" placeholder="Nova meta…" data-meta-nova maxlength="300" />
        <button type="button" data-meta-adicionar>Adicionar</button>
      </div>

      <div class="objetivos-card__rodape">
        <button type="button" class="botao-primario" data-meta-guardar>Guardar</button>
      </div>
    </article>
  `;
}

function ligarObjetivosCard(card, objetivos) {
  // Buffer local de edição (até "Guardar")
  let buffer = JSON.parse(JSON.stringify(objetivos.metas || []));

  const adicionarBtn = card.querySelector("[data-meta-adicionar]");
  const novaInput = card.querySelector("[data-meta-nova]");
  const guardarBtn = card.querySelector("[data-meta-guardar]");

  function adicionar() {
    const texto = novaInput.value.trim();
    if (texto.length < 5) {
      toast("Meta muito curta (mínimo 5 caracteres).", true);
      return;
    }
    buffer.push(novaMeta(texto));
    novaInput.value = "";
    redesenhar();
  }

  function redesenhar() {
    // Re-render só este card sem perder estado dos outros
    const lista = card.querySelector(".objetivos-card__lista");
    lista.innerHTML = buffer.map((m, i) => `
      <li class="objetivo-meta ${m.concluida?'objetivo-meta--concluida':''}" data-meta-idx="${i}">
        <input type="checkbox" class="objetivo-meta__check" ${m.concluida?'checked':''} data-meta-check />
        <input type="text" class="objetivo-meta__texto" value="${escAttr(m.texto)}" data-meta-texto maxlength="300" />
        <button type="button" class="objetivo-meta__remover" aria-label="Remover" data-meta-remover>×</button>
      </li>
    `).join("");

    // Atualizar progresso
    card.querySelector(".objetivos-card__progresso").textContent =
      `${buffer.filter(m=>m.concluida).length} / ${buffer.length}`;
  }

  adicionarBtn.addEventListener("click", adicionar);
  novaInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); adicionar(); } });

  card.addEventListener("click", (e) => {
    const li = e.target.closest("[data-meta-idx]");
    if (!li) return;
    const idx = Number(li.dataset.metaIdx);

    if (e.target.matches("[data-meta-check]")) {
      buffer[idx].concluida = e.target.checked;
      li.classList.toggle("objetivo-meta--concluida", e.target.checked);
      card.querySelector(".objetivos-card__progresso").textContent =
        `${buffer.filter(m=>m.concluida).length} / ${buffer.length}`;
    }
    if (e.target.matches("[data-meta-remover]") || e.target.closest("[data-meta-remover]")) {
      buffer.splice(idx, 1);
      redesenhar();
    }
  });

  card.addEventListener("input", (e) => {
    if (e.target.matches("[data-meta-texto]")) {
      const li = e.target.closest("[data-meta-idx]");
      if (!li) return;
      const idx = Number(li.dataset.metaIdx);
      buffer[idx].texto = e.target.value;
    }
  });

  guardarBtn.addEventListener("click", async () => {
    guardarBtn.disabled = true;
    const original = guardarBtn.textContent;
    guardarBtn.textContent = "A guardar…";
    try {
      // Filtrar metas com texto vazio antes de guardar
      const metasValidas = buffer.filter((m) => m.texto && m.texto.trim().length >= 5);
      await guardarObjetivos(objetivos.semestre, { metas: metasValidas });
      toast(`Objetivos do ${objetivos.semestre}.º semestre guardados.`);
    } catch (e) {
      toast(e.message, true);
    } finally {
      guardarBtn.disabled = false;
      guardarBtn.textContent = original;
    }
  });
}

// ============================================================================
// TAB 4: DISCIPLINAS
// ============================================================================

function renderTabDisciplinas(container) {
  container.innerHTML = `
    <header class="tab-cabecalho">
      <div>
        <h1>Disciplinas</h1>
        <p>${estado.disciplinas.length} no total. As cores aparecem nos cards e na timeline.</p>
      </div>
      <button type="button" class="botao-primario" data-nova-disciplina>+ Nova disciplina</button>
    </header>

    ${estado.disciplinas.length === 0 ? `
      <div class="estado-vazio-tab">
        <h3>Sem disciplinas</h3>
        <p>Adiciona disciplinas para depois associares aos teus registos.</p>
        <button type="button" class="botao-primario" data-nova-disciplina>+ Nova disciplina</button>
      </div>
    ` : [1,2,3,4].map((s) => {
      const ds = estado.disciplinas.filter((d) => d.semestre === s);
      if (ds.length === 0) return "";
      return `
        <section style="margin-bottom: var(--e-6);">
          <h2 style="font-size: var(--t-pequeno); letter-spacing: 0.2em; text-transform: uppercase; color: var(--cor-tinta-leve); font-weight: 500; margin-bottom: var(--e-3);">
            ${s}.º Semestre
          </h2>
          <div class="disciplinas-grid">
            ${ds.map((d) => itemDisciplinaHtml(d)).join("")}
          </div>
        </section>
      `;
    }).join("")}
  `;

  container.querySelectorAll("[data-nova-disciplina]").forEach((b) =>
    b.addEventListener("click", () => abrirFormDisciplina(null)));

  container.querySelectorAll("[data-acao-d]").forEach((btn) => {
    btn.addEventListener("click", () => manejarAcaoDisciplina(btn.dataset.acaoD, btn.dataset.id));
  });
}

function itemDisciplinaHtml(d) {
  return `
    <article class="disciplina-card">
      <span class="disciplina-card__cor" style="background: ${escAttr(d.cor || '#d49a4a')};"></span>
      <div class="disciplina-card__corpo">
        <p class="disciplina-card__nome">${escHtml(d.nome)}</p>
        <span class="disciplina-card__sem">${d.semestre}.º Semestre</span>
      </div>
      <button type="button" class="acao-icone" data-acao-d="editar" data-id="${d.id}" title="Editar">✎</button>
      <button type="button" class="acao-icone acao-icone--destrutiva" data-acao-d="apagar" data-id="${d.id}" title="Apagar">×</button>
    </article>
  `;
}

async function manejarAcaoDisciplina(acao, id) {
  const disciplina = estado.disciplinas.find((d) => d.id === id);
  if (!disciplina) return;

  if (acao === "editar") {
    abrirFormDisciplina(disciplina);
  } else if (acao === "apagar") {
    const usadaEm = estado.registos.filter((r) => r.disciplinaId === id);
    const aviso = usadaEm.length > 0
      ? `Atenção: esta disciplina é usada em ${usadaEm.length} registo${usadaEm.length===1?'':'s'}, que ficarão sem disciplina associada.`
      : "Esta disciplina não está em uso.";
    confirmar(
      "Apagar disciplina?",
      `"${disciplina.nome}" será removida. ${aviso}`,
      async () => {
        try { await apagarDisciplina(id); toast("Disciplina apagada."); }
        catch (e) { toast(e.message, true); }
      }
    );
  }
}

function abrirFormDisciplina(disciplina) {
  const ePropoEdicao = !!disciplina;
  const d = disciplina || { nome: "", semestre: 1, cor: "#d49a4a" };

  abrirModalForm(ePropoEdicao ? "Editar disciplina" : "Nova disciplina", `
    <form data-form-disciplina class="form-grid" novalidate>
      <div class="campo">
        <label for="d-nome">Nome</label>
        <input id="d-nome" name="nome" type="text" required maxlength="100" minlength="2"
               value="${escAttr(d.nome)}" />
      </div>

      <div class="form-grid form-grid--2col">
        <div class="campo">
          <label for="d-semestre">Semestre</label>
          <select id="d-semestre" name="semestre">
            ${[1,2,3,4].map((s) => `<option value="${s}" ${d.semestre===s?'selected':''}>${s}.º Semestre</option>`).join("")}
          </select>
        </div>
        <div class="campo">
          <label for="d-cor">Cor (badge)</label>
          <input id="d-cor" name="cor" type="color" value="${escAttr(d.cor || '#d49a4a')}" />
        </div>
      </div>

      <p class="campo__erro" data-form-erro hidden></p>
      <div class="form-acoes">
        <button type="button" class="botao-secundario" data-modal-fechar>Cancelar</button>
        <button type="submit" class="botao-primario">${ePropoEdicao?'Guardar alterações':'Criar disciplina'}</button>
      </div>
    </form>
  `);

  const form = document.querySelector("[data-form-disciplina]");
  form.addEventListener("submit", (ev) => submeterDisciplina(ev, disciplina));
}

async function submeterDisciplina(ev, existente) {
  ev.preventDefault();
  const form = ev.target;
  const erroEl = form.querySelector("[data-form-erro]");
  const submit = form.querySelector("button[type=submit]");
  const original = submit.textContent;
  submit.disabled = true; submit.textContent = "A guardar…";
  ocultarErro(erroEl);

  try {
    const fd = new FormData(form);
    const dados = {
      nome:     fd.get("nome")?.toString() || "",
      semestre: Number(fd.get("semestre")),
      cor:      fd.get("cor")?.toString() || null
    };
    if (existente) {
      await atualizarDisciplina(existente.id, dados);
    } else {
      await criarDisciplina(dados);
    }
    toast(existente ? "Disciplina guardada." : "Disciplina criada.");
    fecharModalForm();
  } catch (e) {
    mostrarErro(erroEl, e.message);
    submit.disabled = false;
    submit.textContent = original;
  }
}

// ============================================================================
// TAB 5: PERFIL
// ============================================================================

function renderTabPerfil(container) {
  const p = estado.perfil || {
    nome: "", bio: "", instituicao: "", curso: "",
    anoInicio: new Date().getFullYear() - 4,
    anoFim:    new Date().getFullYear(),
    frasePessoal: "",
    titulosSemestres: {},
    reflexoesFinaisSemestres: {},
    fotoUrl: null, fotoPath: null
  };

  container.innerHTML = `
    <header class="tab-cabecalho">
      <div>
        <h1>Perfil</h1>
        <p>Estes dados aparecem na vista pública. Atualizam em tempo real.</p>
      </div>
    </header>

    <form data-form-perfil class="form-grid" novalidate style="max-width: 800px;">
      <div class="form-grid form-grid--2col">
        <div class="campo">
          <label for="p-nome">Nome</label>
          <input id="p-nome" name="nome" type="text" required maxlength="200" value="${escAttr(p.nome)}" />
        </div>
        <div class="campo">
          <span class="campo__label">Foto de perfil</span>
          <div class="upload-imagem">
            <div class="upload-imagem__preview" data-preview style="aspect-ratio: 1; border-radius: 50%; max-width: 120px;">
              ${p.fotoUrl ? `<img src="${escAttr(p.fotoUrl)}" alt="" style="border-radius: 50%;" />` : '<span class="upload-imagem__preview-vazio">—</span>'}
            </div>
            <div class="upload-imagem__controlos">
              <input type="file" id="p-foto" name="foto" accept="image/jpeg,image/png,image/webp" />
              <label for="p-foto" class="botao-secundario">Escolher…</label>
            </div>
          </div>
        </div>
      </div>

      <div class="campo">
        <label for="p-frase">Frase pessoal (hero)</label>
        <input id="p-frase" name="frasePessoal" type="text" maxlength="200"
               value="${escAttr(p.frasePessoal || '')}" placeholder="Ensinar é primeiro *aprender a olhar*." />
        <span class="campo__contador" data-contador="frasePessoal">0/200</span>
        <span class="campo__ajuda">Aparece em destaque no topo do portfólio. Use *palavra* para itálico ocre.</span>
      </div>

      <div class="campo">
        <label for="p-bio">Bio (Quem sou hoje)</label>
        <textarea id="p-bio" name="bio" required minlength="50" maxlength="500" rows="6">${escHtml(p.bio || '')}</textarea>
        <span class="campo__contador" data-contador="bio">0/500</span>
      </div>

      <div class="form-grid form-grid--2col">
        <div class="campo">
          <label for="p-inst">Instituição</label>
          <input id="p-inst" name="instituicao" type="text" required maxlength="200" value="${escAttr(p.instituicao || '')}" />
        </div>
        <div class="campo">
          <label for="p-curso">Curso</label>
          <input id="p-curso" name="curso" type="text" required maxlength="200" value="${escAttr(p.curso || '')}" />
        </div>
      </div>

      <div class="form-grid form-grid--2col">
        <div class="campo">
          <label for="p-anoi">Ano de início</label>
          <input id="p-anoi" name="anoInicio" type="number" required min="2000" max="2100" value="${p.anoInicio || ''}" />
        </div>
        <div class="campo">
          <label for="p-anof">Ano de fim</label>
          <input id="p-anof" name="anoFim" type="number" required min="2000" max="2100" value="${p.anoFim || ''}" />
        </div>
      </div>

      <fieldset style="border: 1px solid rgba(61,44,30,0.1); border-radius: 8px; padding: var(--e-5);">
        <legend style="padding: 0 var(--e-3); font-size: var(--t-micro); letter-spacing: 0.2em; text-transform: uppercase; color: var(--cor-tinta-leve); font-weight: 500;">
          Títulos dos capítulos por semestre
        </legend>
        <div class="form-grid">
          ${[1,2,3,4].map((s) => `
            <div class="campo">
              <label for="p-titulo-${s}">${s}.º Semestre · título</label>
              <input id="p-titulo-${s}" name="titulo-${s}" type="text" maxlength="100"
                     value="${escAttr(p.titulosSemestres?.[s] || '')}"
                     placeholder="ex: Os primeiros passos" />
            </div>
          `).join("")}
        </div>
      </fieldset>

      <fieldset style="border: 1px solid rgba(61,44,30,0.1); border-radius: 8px; padding: var(--e-5);">
        <legend style="padding: 0 var(--e-3); font-size: var(--t-micro); letter-spacing: 0.2em; text-transform: uppercase; color: var(--cor-tinta-leve); font-weight: 500;">
          Reflexões finais por semestre
        </legend>
        <div class="form-grid">
          ${[1,2,3,4].map((s) => `
            <div class="campo">
              <label for="p-reflexao-${s}">${s}.º Semestre · reflexão</label>
              <textarea id="p-reflexao-${s}" name="reflexao-${s}" rows="3" maxlength="2000"
                        placeholder="O semestre em que percebi que…">${escHtml(p.reflexoesFinaisSemestres?.[s] || '')}</textarea>
              <span class="campo__ajuda">Aparece como introdução do capítulo. Use *palavra* para itálico. Linha em branco separa parágrafos.</span>
            </div>
          `).join("")}
        </div>
      </fieldset>

      <p class="campo__erro" data-form-erro hidden></p>

      <div class="form-acoes">
        <button type="submit" class="botao-primario">Guardar perfil</button>
      </div>
    </form>
  `;

  const form = container.querySelector("[data-form-perfil]");
  ligarContador(form, "frasePessoal", 200);
  ligarContador(form, "bio", 500);
  ligarUploadPreview(form);
  form.addEventListener("submit", (ev) => submeterPerfil(ev, p));
}

async function submeterPerfil(ev, perfilExistente) {
  ev.preventDefault();
  const form = ev.target;
  const erroEl = form.querySelector("[data-form-erro]");
  const submit = form.querySelector("button[type=submit]");
  const original = submit.textContent;
  submit.disabled = true; submit.textContent = "A guardar…";
  ocultarErro(erroEl);

  try {
    const fd = new FormData(form);
    const titulos = {};
    const reflexoes = {};
    for (const s of [1,2,3,4]) {
      const t = fd.get(`titulo-${s}`)?.toString().trim();
      const r = fd.get(`reflexao-${s}`)?.toString().trim();
      if (t) titulos[String(s)] = t;
      if (r) reflexoes[String(s)] = r;
    }

    const dados = {
      nome:         fd.get("nome")?.toString() || "",
      bio:          fd.get("bio")?.toString() || "",
      instituicao:  fd.get("instituicao")?.toString() || "",
      curso:        fd.get("curso")?.toString() || "",
      anoInicio:    Number(fd.get("anoInicio")),
      anoFim:       Number(fd.get("anoFim")),
      frasePessoal: fd.get("frasePessoal")?.toString() || "",
      titulosSemestres: titulos,
      reflexoesFinaisSemestres: reflexoes,
      fotoUrl:  perfilExistente?.fotoUrl  || null,
      fotoPath: perfilExistente?.fotoPath || null
    };

    let pathAntigo = perfilExistente?.fotoPath || null;

    // Se há nova foto, upload primeiro
    const inputFile = form.querySelector("input[type='file']");
    const novaFoto = inputFile?.files?.[0];
    if (novaFoto) {
      submit.textContent = "A enviar foto…";
      const { url, path } = await uploadFotoPerfil(novaFoto);
      dados.fotoUrl = url;
      dados.fotoPath = path;
    }

    await guardarPerfil(dados, { pathAntigo });
    toast("Perfil guardado.");
  } catch (e) {
    mostrarErro(erroEl, e.message);
  } finally {
    submit.disabled = false;
    submit.textContent = original;
  }
}

// ============================================================================
// MODAIS GENÉRICOS, TOAST, CONFIRMAÇÃO
// ============================================================================

function ligarModaisGenericos() {
  document.addEventListener("click", (ev) => {
    if (ev.target.matches("[data-modal-fechar]") || ev.target.closest(".modal-form [data-modal-fechar], .modal-form__fundo")) {
      // Só fecha o form se o click foi dentro do modal-form
      const dentroForm = ev.target.closest(".modal-form");
      if (dentroForm) fecharModalForm();
    }
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      const formEl = document.querySelector("[data-modal-form]");
      const confEl = document.querySelector("[data-modal-confirma]");
      if (confEl && !confEl.hidden) confEl.hidden = true;
      else if (formEl && !formEl.hidden) fecharModalForm();
    }
  });
}

function abrirModalForm(titulo, html) {
  const modal = document.querySelector("[data-modal-form]");
  const tituloEl = document.getElementById("modal-form-titulo");
  const corpo = document.querySelector("[data-modal-form-corpo]");
  if (!modal || !corpo) return;

  if (tituloEl) tituloEl.textContent = titulo;
  corpo.innerHTML = html;
  modal.hidden = false;
  document.body.style.overflow = "hidden";

  const primeiro = corpo.querySelector("input, textarea, select, button");
  if (primeiro) requestAnimationFrame(() => primeiro.focus());
}

function fecharModalForm() {
  const modal = document.querySelector("[data-modal-form]");
  if (!modal) return;
  modal.hidden = true;
  document.body.style.overflow = "";
}

function confirmar(titulo, mensagem, onConfirmar) {
  const modal = document.querySelector("[data-modal-confirma]");
  if (!modal) return;
  modal.querySelector("[data-confirma-titulo]").textContent = titulo;
  modal.querySelector("[data-confirma-mensagem]").textContent = mensagem;
  modal.hidden = false;

  const ok = modal.querySelector("[data-confirma-ok]");
  const cancel = modal.querySelector("[data-confirma-cancelar]");
  const fundo = modal.querySelector(".modal-confirma__fundo");

  function fechar() {
    modal.hidden = true;
    ok.removeEventListener("click", confirmou);
    cancel.removeEventListener("click", fechar);
    fundo.removeEventListener("click", fechar);
  }
  function confirmou() { fechar(); onConfirmar(); }

  ok.addEventListener("click", confirmou);
  cancel.addEventListener("click", fechar);
  fundo.addEventListener("click", fechar);
}

let toastTimer = null;
function toast(mensagem, eErro = false) {
  const el = document.querySelector("[data-toast]");
  if (!el) return;
  el.textContent = mensagem;
  el.classList.toggle("toast--erro", eErro);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, eErro ? 4500 : 2500);
}

// ============================================================================
// HELPERS DE FORMULÁRIO
// ============================================================================

function ligarContador(form, nomeCampo, max) {
  const input = form.querySelector(`[name="${nomeCampo}"]`);
  const contador = form.querySelector(`[data-contador="${nomeCampo}"]`);
  if (!input || !contador) return;

  const atualizar = () => {
    const len = (input.value || "").length;
    contador.textContent = `${len}/${max}`;
    contador.classList.toggle("campo__contador--alerta", len > max - 30);
  };
  input.addEventListener("input", atualizar);
  atualizar();
}

function mostrarErro(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
}
function ocultarErro(el) {
  if (!el) return;
  el.textContent = "";
  el.hidden = true;
}

// ============================================================================
// UTILITÁRIOS
// ============================================================================

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function escAttr(s) { return escHtml(s); }

function excerto(s, max) {
  if (!s) return "";
  if (s.length <= max) return s;
  return s.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

function remAcentos(s) { return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }

function dataIso(d) {
  let date;
  if (!d) return "";
  if (d instanceof Date) date = d;
  else if (d.toDate) date = d.toDate();
  else if (d.seconds) date = new Date(d.seconds * 1000);
  else return "";
  return date.toISOString().slice(0, 10); // YYYY-MM-DD para input type=date
}

function dataPt(d) {
  let date;
  if (!d) return "";
  if (d instanceof Date) date = d;
  else if (d.toDate) date = d.toDate();
  else if (d.seconds) date = new Date(d.seconds * 1000);
  else return "";
  const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${meses[date.getMonth()]} ${date.getFullYear()}`;
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
