// ============================================================================
// animacoes.js
// ----------------------------------------------------------------------------
// Animações de entrada baseadas em IntersectionObserver + revelação
// palavra-a-palavra do hero. Respeita prefers-reduced-motion: reduce.
// ============================================================================

const PREFERE_MOVIMENTO_REDUZIDO =
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let observador = null;

// ----------------------------------------------------------------------------
// API pública
// ----------------------------------------------------------------------------

/**
 * Inicia (ou re-inicia) o IntersectionObserver para todos os elementos
 * com [data-anim]. Pode ser chamado múltiplas vezes — elementos já marcados
 * como visíveis são ignorados.
 */
export function ativarObserver() {
  // Se reduced-motion está ativo, marcar tudo de imediato e não observar.
  if (PREFERE_MOVIMENTO_REDUZIDO) {
    document.querySelectorAll("[data-anim]").forEach((el) =>
      el.classList.add("e-visivel")
    );
    return;
  }

  // Sem IntersectionObserver (browsers muito antigos): tudo visível.
  if (!("IntersectionObserver" in window)) {
    document.querySelectorAll("[data-anim]").forEach((el) =>
      el.classList.add("e-visivel")
    );
    return;
  }

  if (!observador) {
    observador = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("e-visivel");
            observador.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.05, rootMargin: "0px 0px -5% 0px" }
    );
  }

  document.querySelectorAll("[data-anim]:not(.e-visivel)").forEach((el) => {
    // Se já está dentro do viewport no momento da chamada, marcar de imediato
    // (cobre o caso de a página abrir já com scroll a meio — refresh, âncora).
    const r = el.getBoundingClientRect();
    const dentro = r.top < window.innerHeight && r.bottom > 0;
    if (dentro) {
      el.classList.add("e-visivel");
    } else {
      observador.observe(el);
    }
  });
}

/**
 * Anima a frase principal do hero, palavra a palavra, com timing variável
 * (palavras mais longas = pequena pausa extra) para um ritmo musical.
 * Preserva tags <em> contidas na frase.
 */
export function animarHero() {
  const frase = document.querySelector(".hero__frase");
  if (!frase) return;

  // Tokenizar respeitando <em>...</em>: cada token é uma palavra (ou tag em
  // bloco) ou whitespace puro.
  const html = frase.innerHTML;
  const tokens = html.match(/<em[^>]*>[^<]*<\/em>|\S+|\s+/g) || [];

  frase.innerHTML = tokens
    .map((t) => (/^\s+$/.test(t) ? t : `<span class="palavra">${t}</span>`))
    .join("");

  const palavras = frase.querySelectorAll(".palavra");

  if (PREFERE_MOVIMENTO_REDUZIDO) {
    palavras.forEach((p) => p.classList.add("e-visivel"));
    return;
  }

  palavras.forEach((p, i) => {
    const base = 250;
    const extra = Math.min(40, (p.textContent.length || 0) * 4);
    const passo = 110 + extra;
    setTimeout(() => p.classList.add("e-visivel"), base + i * passo);
  });
}

/**
 * Reaplicar animações em conteúdo recém-renderizado (após dados carregarem).
 * Útil para chamar após renderização dinâmica de novos elementos com [data-anim].
 */
export function reaplicarAnimacoesEm(elemento) {
  if (!elemento) return;
  ativarObserver(); // re-observar elementos novos não-visíveis ainda
}

// ----------------------------------------------------------------------------
// Parallax subtil nas figuras do bloco "início"
// ----------------------------------------------------------------------------
//
// Cada figura desloca-se com velocidade ligeiramente diferente do scroll,
// criando uma sensação de profundidade calma. Apenas em viewports >= 768px
// (em mobile o efeito é confuso pelo scroll natural). Desativado em
// prefers-reduced-motion.
//
// Implementação: rAF tied to scroll, com transform translateY pequeno.
// ----------------------------------------------------------------------------

let parallaxTicking = false;
let parallaxFigs = null;

export function ativarParallax() {
  if (PREFERE_MOVIMENTO_REDUZIDO) return;
  if (window.innerWidth < 768) return;

  parallaxFigs = document.querySelectorAll(".inicio__figura");
  if (!parallaxFigs.length) return;

  // Cada figura tem uma "velocidade" diferente. A figura alta sobe um pouco
  // mais devagar, a baixa mais depressa, criando paralaxe.
  parallaxFigs.forEach((fig, i) => {
    fig.dataset.parallaxSpeed = i === 0 ? "0.04" : "-0.03";
  });

  window.addEventListener("scroll", agendarParallax, { passive: true });
  // Disparo inicial
  agendarParallax();
}

function agendarParallax() {
  if (parallaxTicking) return;
  parallaxTicking = true;
  requestAnimationFrame(aplicarParallax);
}

function aplicarParallax() {
  if (!parallaxFigs) { parallaxTicking = false; return; }

  parallaxFigs.forEach((fig) => {
    const r = fig.getBoundingClientRect();
    // Só processar se está perto do viewport
    if (r.bottom < -200 || r.top > window.innerHeight + 200) return;

    const speed = parseFloat(fig.dataset.parallaxSpeed || "0");
    // Centro da figura relativo ao centro do viewport
    const centro = r.top + r.height / 2 - window.innerHeight / 2;
    const deslocamento = centro * speed;

    // Preserva a rotação que já tinha (definida via inline em CSS) usando translateY apenas
    // CSS define rotate(); aqui adicionamos translate via transform composto sem perder rotação.
    // Solução simples: definir custom property que o CSS combina com a rotação.
    fig.style.setProperty("--parallax-y", `${deslocamento.toFixed(2)}px`);
  });

  parallaxTicking = false;
}
