# ============================================================================
# MARKET SENTIMENT INTELLIGENCE PLATFORM
# Coletor de produtos + características + resumo de IA + comentários (Mercado Livre)
# ----------------------------------------------------------------------------
# Autora: Vanessa M. Ribeiro — Engenheira & Cientista de Dados
#
# OBJETIVO (conforme briefing):
#   1. Pesquisar uma palavra-chave e clicar em um produto.
#   2. Coletar TODAS as características do produto e gravar em UMA ÚNICA coluna
#      (texto concatenado), para análises posteriores.
#   3. Coletar o resumo de opiniões gerado por IA do próprio Mercado Livre.
#   4. Coletar TODOS os comentários e a avaliação (estrelas) de cada comentário.
#   5. Repetir o percurso para 30 PRODUTOS.
#   6. Se abrir uma janela/modal (Meli+, cadastro, cookies, etc.) -> fechar.
#   7. Salvar tudo em CSV para análise posterior.
#
# POR QUE PLAYWRIGHT (e não requests/BeautifulSoup)?
#   O Mercado Livre renderiza características, resumo de IA e comentários via
#   JavaScript e bloqueia tráfego de datacenter (Google Colab) quando detecta
#   `requests`. Um navegador real (Chromium headless) executa o JS, mantém
#   cookies/sessão e consegue fechar os modais — exatamente como um usuário.
#
# COMO USAR NO GOOGLE COLAB:
#   - Cole TUDO em UMA célula e execute (Runtime > Run all).
#   - Ajuste KEYWORD e MAX_PRODUTOS abaixo se quiser.
#   - Ao final baixa automaticamente o CSV no Colab.
# ============================================================================

# ---------------------------------------------------------------------------
# 1) INSTALAÇÃO DE DEPENDÊNCIAS (executa só uma vez por sessão)
# ---------------------------------------------------------------------------
import sys, subprocess

def _pip(*pkgs):
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", *pkgs], check=True)

_pip("playwright", "nest_asyncio", "pandas")
# baixa o Chromium + dependências de sistema que o Playwright precisa
subprocess.run([sys.executable, "-m", "playwright", "install", "chromium"], check=True)
subprocess.run([sys.executable, "-m", "playwright", "install-deps", "chromium"], check=False)

# ---------------------------------------------------------------------------
# 2) IMPORTS
# ---------------------------------------------------------------------------
import re
import asyncio
import unicodedata
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Optional

import nest_asyncio
import pandas as pd
from playwright.async_api import async_playwright, TimeoutError as PWTimeout

nest_asyncio.apply()  # permite rodar asyncio dentro do kernel do Colab/Jupyter

# ---------------------------------------------------------------------------
# 3) CONFIGURAÇÃO
# ---------------------------------------------------------------------------
KEYWORD       = "fone de ouvido bluetooth"  # palavra-chave da busca
MAX_PRODUTOS  = 30                           # quantos produtos percorrer
MAX_PAGINAS_COMENTARIOS = 40                 # trava de segurança p/ paginação de reviews
HEADLESS      = True                         # True no Colab
TIMEOUT_MS    = 30000

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

# ---------------------------------------------------------------------------
# 4) ESTRUTURA DE DADOS — uma linha por COMENTÁRIO (com dados do produto repetidos)
# ---------------------------------------------------------------------------
@dataclass
class Linha:
    produto_id: str
    produto_nome: str
    produto_url: str
    # TODAS as características concatenadas numa única coluna (chave: valor | chave: valor ...)
    caracteristicas: str
    resumo_ia: str
    comentario: str
    estrelas: Optional[int]

# ---------------------------------------------------------------------------
# 5) HELPERS
# ---------------------------------------------------------------------------
def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s).strip().lower()

async def fechar_popups(page):
    """Fecha qualquer modal/janela: Meli+, cadastro, cookies, newsletter, etc.
    Estratégia em camadas: botões de fechar conhecidos -> 'em outro momento' ->
    aria-label de fechar -> tecla Escape."""
    seletores = [
        # cookies
        "button[data-testid='action:understood-button']",
        "button:has-text('Entendi')",
        # Meli+ / promo: 'Em outro momento'
        "button:has-text('Em outro momento')",
        "a:has-text('Em outro momento')",
        # botões de fechar genéricos do ML
        "button.andes-modal__close",
        "button[aria-label='Fechar']",
        "button[aria-label='Close']",
        "[class*='close']",
        # cadastro / login
        "button:has-text('Agora não')",
        "button:has-text('Depois')",
    ]
    for sel in seletores:
        try:
            loc = page.locator(sel).first
            if await loc.is_visible(timeout=600):
                await loc.click(timeout=1200)
                await page.wait_for_timeout(400)
        except Exception:
            pass
    # último recurso: Escape fecha a maioria dos modais andes do ML
    try:
        await page.keyboard.press("Escape")
    except Exception:
        pass

async def coletar_links_produtos(page, keyword: str, alvo: int) -> List[str]:
    """Vai na busca e coleta URLs de produtos até atingir o alvo (paginando)."""
    links: List[str] = []
    vistos = set()
    pagina = 1
    while len(links) < alvo and pagina <= 8:
        url = f"https://lista.mercadolivre.com.br/{keyword.replace(' ', '-')}"
        if pagina > 1:
            offset = (pagina - 1) * 50 + 1
            url = f"{url}_Desde_{offset}"
        await page.goto(url, timeout=TIMEOUT_MS, wait_until="domcontentloaded")
        await fechar_popups(page)
        await page.wait_for_timeout(1500)

        anchors = await page.locator("a.ui-search-link, a.poly-component__title, "
                                     "a[href*='/p/MLB'], a[href*='produto.mercadolivre']").all()
        for a in anchors:
            href = await a.get_attribute("href")
            if not href:
                continue
            href = href.split("#")[0].split("?")[0]
            if ("/p/MLB" in href or "produto.mercadolivre" in href or "/MLB-" in href) \
               and href not in vistos:
                vistos.add(href)
                links.append(href)
                if len(links) >= alvo:
                    break
        pagina += 1
    return links[:alvo]

async def coletar_caracteristicas(page) -> str:
    """Extrai TODAS as características/especificações e devolve em UMA string.
    Cobre tanto os destaques (ícones 'É sem fio: Sim') quanto as tabelas
    'Características do produto' (Marca, Linha, Modelo, Som, Bateria...)."""
    pares: Dict[str, str] = {}

    # 5.1 — destaques com ícones (highlighted specs)
    try:
        itens = await page.locator(
            ".ui-pdp-highlighted-specs-res .ui-pdp-color--BLACK, "
            ".ui-vpp-highlighted-specs__attribute-columns p, "
            "[class*='highlighted-specs'] p"
        ).all_inner_texts()
        for t in itens:
            if ":" in t:
                k, v = t.split(":", 1)
                pares.setdefault(k.strip(), v.strip())
    except Exception:
        pass

    # 5.2 — tabelas de especificações (andes-table / striped specs)
    try:
        rows = await page.locator(
            ".andes-table__row, tr.andes-table__row, "
            ".ui-vpp-striped-specs__row, table tr"
        ).all()
        for r in rows:
            try:
                th = await r.locator("th, .andes-table__header, .ui-vpp-striped-specs__key").first.inner_text(timeout=500)
                td = await r.locator("td, .andes-table__column, .ui-vpp-striped-specs__value").first.inner_text(timeout=500)
                if th and td:
                    pares.setdefault(th.strip(), td.strip())
            except Exception:
                continue
    except Exception:
        pass

    # concatena tudo em UMA única coluna -> "chave: valor | chave: valor | ..."
    return " | ".join(f"{k}: {v}" for k, v in pares.items() if k and v)

async def coletar_resumo_ia(page) -> str:
    """Coleta o 'Resumo de opiniões gerado por IA' exibido pelo Mercado Livre."""
    seletores = [
        "[class*='ai-review'] p",
        "[class*='reviews-summary'] p",
        "div:has(> *:has-text('gerado por IA')) p",
        ".ui-review-capability__summary p",
    ]
    for sel in seletores:
        try:
            txt = await page.locator(sel).first.inner_text(timeout=1500)
            if txt and len(txt) > 40:
                return re.sub(r"\s+", " ", txt).strip()
        except Exception:
            continue
    return ""

def _estrelas_de_texto(txt: str) -> Optional[int]:
    m = re.search(r"([1-5])\s*(de|/)\s*5", txt)
    if m:
        return int(m.group(1))
    m = re.search(r"Qualifica\w*\s*([1-5])", txt, re.I)
    return int(m.group(1)) if m else None

async def coletar_comentarios(page) -> List[Dict]:
    """Abre a seção de opiniões e coleta TODOS os comentários + estrelas,
    rolando/paginando até esgotar."""
    comentarios: List[Dict] = []
    vistos = set()

    # tenta abrir o modal completo de opiniões ("Mostrar todas as opiniões")
    for sel in ["button:has-text('opiniões')", "a:has-text('opiniões')",
                "button:has-text('Mostrar')", "[data-testid='see-more']"]:
        try:
            loc = page.locator(sel).first
            if await loc.is_visible(timeout=800):
                await loc.click(timeout=1500)
                await page.wait_for_timeout(1500)
                await fechar_popups(page)
                break
        except Exception:
            continue

    pagina = 0
    while pagina < MAX_PAGINAS_COMENTARIOS:
        pagina += 1
        # cada review costuma estar em um article/li com texto e estrelas
        artigos = await page.locator(
            "article.ui-review-capability-comments__comment, "
            ".ui-review-capability-comments__comment, "
            "[class*='review'][class*='comment'], "
            "article[class*='comment']"
        ).all()

        novos = 0
        for art in artigos:
            try:
                texto = (await art.inner_text(timeout=500)).strip()
            except Exception:
                continue
            corpo = re.sub(r"\s+", " ", texto)
            chave = corpo[:120]
            if not corpo or chave in vistos:
                continue
            vistos.add(chave)

            # estrelas: tenta atributo aria-label, senão parse do texto
            estrelas = None
            try:
                aria = await art.locator("[aria-label*='estrela'], [aria-label*='star'], "
                                         "[class*='rating']").first.get_attribute("aria-label", timeout=400)
                if aria:
                    estrelas = _estrelas_de_texto(aria)
            except Exception:
                pass
            if estrelas is None:
                try:
                    cheias = await art.locator("svg[class*='star'][class*='full'], "
                                               "[class*='star--full'], [class*='filled']").count()
                    if 1 <= cheias <= 5:
                        estrelas = cheias
                except Exception:
                    pass

            comentarios.append({"comentario": corpo, "estrelas": estrelas})
            novos += 1

        # tenta avançar página de comentários; se não houver, rola; se nada mudou, encerra
        avancou = False
        for sel in ["button.andes-pagination__button--next:not([disabled])",
                    "a[title='Seguinte']", "button:has-text('Seguinte')",
                    "li.andes-pagination__button--next a"]:
            try:
                nxt = page.locator(sel).first
                if await nxt.is_visible(timeout=600):
                    await nxt.click(timeout=1500)
                    await page.wait_for_timeout(1400)
                    await fechar_popups(page)
                    avancou = True
                    break
            except Exception:
                continue

        if not avancou:
            await page.mouse.wheel(0, 4000)
            await page.wait_for_timeout(1200)
            if novos == 0:
                break
    return comentarios

# ---------------------------------------------------------------------------
# 6) PERCURSO PRINCIPAL
# ---------------------------------------------------------------------------
async def rodar() -> pd.DataFrame:
    linhas: List[Linha] = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=HEADLESS, args=["--no-sandbox"])
        ctx = await browser.new_context(user_agent=UA, locale="pt-BR",
                                        viewport={"width": 1366, "height": 900})
        page = await ctx.new_page()

        print(f"🔎 Buscando produtos para: '{KEYWORD}' ...")
        links = await coletar_links_produtos(page, KEYWORD, MAX_PRODUTOS)
        print(f"   {len(links)} produtos encontrados.\n")

        for i, url in enumerate(links, 1):
            try:
                print(f"[{i}/{len(links)}] {url}")
                await page.goto(url, timeout=TIMEOUT_MS, wait_until="domcontentloaded")
                await fechar_popups(page)
                await page.wait_for_timeout(1200)

                # nome
                try:
                    nome = await page.locator("h1.ui-pdp-title, h1").first.inner_text(timeout=3000)
                except Exception:
                    nome = ""
                # id do produto
                m = re.search(r"(MLB-?\d+)", url)
                pid = m.group(1).replace("-", "") if m else url

                caracteristicas = await coletar_caracteristicas(page)
                resumo_ia       = await coletar_resumo_ia(page)
                comentarios     = await coletar_comentarios(page)

                print(f"      caract.: {len(caracteristicas)} chars | "
                      f"resumo IA: {'sim' if resumo_ia else 'não'} | "
                      f"comentários: {len(comentarios)}")

                if not comentarios:
                    # ainda grava o produto (sem comentário) para análise de características
                    linhas.append(Linha(pid, nome.strip(), url, caracteristicas,
                                        resumo_ia, "", None))
                else:
                    for c in comentarios:
                        linhas.append(Linha(pid, nome.strip(), url, caracteristicas,
                                            resumo_ia, c["comentario"], c["estrelas"]))
            except PWTimeout:
                print("      ⏱️  timeout — pulando produto.")
            except Exception as e:
                print(f"      ⚠️  erro: {e}")

        await browser.close()

    df = pd.DataFrame([asdict(l) for l in linhas])
    return df

# ---------------------------------------------------------------------------
# 7) EXECUÇÃO + SALVAR + RESUMO
# ---------------------------------------------------------------------------
df = asyncio.get_event_loop().run_until_complete(rodar())

ARQ = "mercadolivre_dataset.csv"
df.to_csv(ARQ, index=False, encoding="utf-8-sig")

print("\n" + "=" * 60)
print("RESUMO DA COLETA")
print("=" * 60)
print(f"Produtos distintos : {df['produto_id'].nunique() if not df.empty else 0}")
print(f"Linhas (comentários): {len(df)}")
if not df.empty and df['estrelas'].notna().any():
    print("Distribuição de estrelas:")
    print(df['estrelas'].value_counts(dropna=True).sort_index().to_string())
print(f"\n💾 Salvo em: {ARQ}")

# download automático no Colab
try:
    from google.colab import files
    files.download(ARQ)
except Exception:
    pass

df.head(20)
