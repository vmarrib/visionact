import { ProjectHeader } from "@/components/ProjectHeader";
import { Section } from "@/components/Section";
import { FlowDiagram } from "@/components/FlowDiagram";
import { TechStack } from "@/components/TechStack";
import { CodeBlock } from "@/components/CodeBlock";
import { FeatureCards, BulletList } from "@/components/FeatureCards";

const stack = [
  "Python",
  "FastAPI",
  "Pydantic",
  "PostgreSQL",
  "Redis",
  "Airflow",
  "httpx",
  "Docker",
  "Kubernetes",
];

const methodologies = [
  {
    sigla: "KYC",
    nome: "Know Your Customer",
    alvo: "Cliente (PF/PJ)",
    desc: "Identificação e verificação do cliente: validação cadastral, PEP, sanções, mídia adversa e capacidade financeira.",
  },
  {
    sigla: "KYE",
    nome: "Know Your Employee",
    alvo: "Colaborador / contratado",
    desc: "Background check de funcionários: antecedentes, conflitos de interesse, vínculos societários e processos.",
  },
  {
    sigla: "KYS",
    nome: "Know Your Supplier",
    alvo: "Fornecedor / terceiro",
    desc: "Due diligence de cadeia de suprimentos: idoneidade, trabalho análogo a escravo, embargos ambientais e CEIS/CNEP.",
  },
  {
    sigla: "KYP",
    nome: "Know Your Partner",
    alvo: "Sócio / parceiro de negócio",
    desc: "Análise de beneficiário final (UBO), estrutura societária, exposição reputacional e risco de terceiros.",
  },
];

const bureaus = [
  { nome: "Trilia (ex-Neoway)", escopo: "Nacional", uso: "Grafo societário, quadro de sócios, UBO e risco PJ" },
  { nome: "BigDataCorp", escopo: "Nacional", uso: "Cadastral PF/PJ, vínculos, score e enriquecimento em massa" },
  { nome: "Serasa Experian", escopo: "Nacional", uso: "Score de crédito, negativações, protestos e capacidade financeira" },
  { nome: "CIAL Dun & Bradstreet", escopo: "Internacional", uso: "D-U-N-S, perfil corporativo e crédito cross-border" },
  { nome: "LSEG (Refinitiv World-Check)", escopo: "Internacional", uso: "PEP, listas de sanções (OFAC/UE/ONU), mídia adversa" },
  { nome: "Receita Federal / CGU", escopo: "Nacional", uso: "Situação cadastral, CEIS, CNEP e CEPIM (fontes oficiais)" },
];

export function ComplianceRisk() {
  return (
    <>
      <ProjectHeader
        index="04"
        name="Compliance Risk Intelligence"
        tagline="Análise de risco de compliance (KYC/KYE/KYS/KYP)"
        domain="Risk · Compliance · Data"
        problem="Áreas de compliance precisam decidir, com rastreabilidade regulatória, se um CPF ou CNPJ pode ser onboarded. O desafio é unificar múltiplos bureaus, normalizar respostas heterogêneas e produzir um score auditável de risco."
        stack={stack}
      />

      <Section label="Conceito" title="Quatro lentes de due diligence">
        <p className="mb-5 text-muted-foreground">
          Compliance não é um único processo, e sim um conjunto de metodologias
          aplicadas a relações diferentes. O motor separa explicitamente cada
          lente porque o risco, as fontes e os pesos mudam conforme o vínculo
          analisado.
        </p>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-surface font-mono text-xs uppercase tracking-widest text-muted-foreground">
                <th className="px-4 py-3 font-medium">Metodologia</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Alvo</th>
                <th className="px-4 py-3 font-medium">O que avalia</th>
              </tr>
            </thead>
            <tbody>
              {methodologies.map((m) => (
                <tr key={m.sigla} className="border-b border-border last:border-b-0 align-top">
                  <td className="px-4 py-3">
                    <span className="font-mono font-semibold text-primary">{m.sigla}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{m.nome}</span>
                  </td>
                  <td className="hidden px-4 py-3 font-mono text-xs text-foreground sm:table-cell">
                    {m.alvo}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{m.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section label="Regra de roteamento" title="CPF e CNPJ definem o pipeline">
        <p className="mb-3 text-muted-foreground">
          O primeiro passo é classificar o documento. CPF (11 dígitos, pessoa
          física) e CNPJ (14 dígitos, pessoa jurídica) seguem validação de
          dígitos verificadores e roteiam para consultas distintas: pessoa física
          prioriza PEP, sanções e capacidade financeira; pessoa jurídica abre o
          grafo societário até o beneficiário final.
        </p>
        <CodeBlock
          filename="risk_engine/routing.py"
          code={`def route(documento: str) -> Pipeline:
    doc = re.sub(r"\\D", "", documento)
    if len(doc) == 11 and valida_cpf(doc):
        return Pipeline.PESSOA_FISICA   # KYC-PF / KYE
    if len(doc) == 14 and valida_cnpj(doc):
        return Pipeline.PESSOA_JURIDICA # KYC-PJ / KYS / KYP
    raise DocumentoInvalido(doc)`}
        />
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 font-mono text-xs text-muted-foreground">CPF, pessoa física</p>
            <CodeBlock code={`{
  "tipo": "PF",
  "fontes": ["Serasa", "BigDataCorp", "World-Check"],
  "checks": ["PEP", "sancoes", "midia_adversa"]
}`} />
          </div>
          <div>
            <p className="mb-2 font-mono text-xs text-muted-foreground">CNPJ, pessoa jurídica</p>
            <CodeBlock code={`{
  "tipo": "PJ",
  "fontes": ["Trilia", "CIAL", "Receita"],
  "checks": ["UBO", "CEIS_CNEP", "situacao"]
}`} />
          </div>
        </div>
      </Section>

      <Section label="Fontes de dados" title="Orquestração de bureaus nacionais e internacionais">
        <p className="mb-5 text-muted-foreground">
          Nenhum bureau cobre tudo. A estratégia é compor fontes complementares,
          tratar cada uma como conector plugável (mesma interface, contratos
          via Pydantic) e cair em fonte secundária quando a primária falha ou
          expira o SLA.
        </p>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-surface font-mono text-xs uppercase tracking-widest text-muted-foreground">
                <th className="px-4 py-3 font-medium">Bureau</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Escopo</th>
                <th className="px-4 py-3 font-medium">Uso no motor</th>
              </tr>
            </thead>
            <tbody>
              {bureaus.map((b) => (
                <tr key={b.nome} className="border-b border-border last:border-b-0 align-top">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-foreground">{b.nome}</td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    <span className="rounded-md bg-accent px-2 py-0.5 font-mono text-[11px] text-accent-foreground">
                      {b.escopo}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{b.uso}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-6">
          <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Tecnologias
          </p>
          <TechStack items={stack} />
        </div>
      </Section>

      <Section label="Arquitetura" title="Do documento ao parecer auditável">
        <FlowDiagram
          steps={[
            "Documento (CPF/CNPJ)",
            "Validação & Roteamento",
            "Orquestrador de Bureaus",
            "Normalização (Pydantic)",
            "Motor de Score",
            "Decisão & Parecer",
            "Trilha de Auditoria",
          ]}
          caption="Cada consulta a bureau é persistida com payload bruto, timestamp e versão da regra, garantindo reprodutibilidade do parecer para auditoria regulatória."
        />
      </Section>

      <Section label="Modelo de risco" title="Variáveis e score ponderado">
        <p className="mb-5 text-muted-foreground">
          O score combina sinais determinísticos (listas restritivas são veto) e
          probabilísticos (capacidade, reputação), com pesos calibrados por tipo
          de relação. A saída é uma faixa de risco com justificativa rastreável,
          não uma caixa-preta.
        </p>
        <FeatureCards
          features={[
            {
              title: "Sinais de veto (hard block)",
              body: (
                <BulletList
                  items={[
                    "Sanções OFAC / UE / ONU (World-Check)",
                    "CEIS / CNEP (inidoneidade e punições)",
                    "Documento inválido ou inexistente na Receita",
                  ]}
                />
              ),
            },
            {
              title: "Sinais ponderados (score)",
              body: (
                <BulletList
                  items={[
                    "Exposição PEP e mídia adversa",
                    "Saúde financeira e negativações",
                    "Opacidade societária / UBO oculto",
                    "Idade cadastral e consistência de dados",
                  ]}
                />
              ),
            },
          ]}
        />
        <div className="mt-4">
          <CodeBlock
            filename="risk_engine/score.py"
            code={`risco = (
    0.40 * sancoes_pep      # veto se > 0
  + 0.25 * societario       # opacidade / UBO
  + 0.20 * financeiro       # capacidade
  + 0.15 * reputacional     # midia adversa
)
faixa = classifica(risco)   # BAIXO | MEDIO | ALTO | VETO`}
          />
        </div>
      </Section>

      <Section label="Fundamentação técnica" title="Decisões de arquitetura documentadas">
        <p className="mb-5 text-muted-foreground">
          Documento aqui as decisões conceituais que sustentam o sistema, com a
          razão técnica e o trade-off de cada uma.
        </p>
        <div className="grid gap-4">
          <FeatureCards
            features={[
              {
                title: "Por que separar KYC/KYE/KYS/KYP",
                body: (
                  <p>
                    Cada vínculo tem risco e fontes distintas. Tratar tudo como
                    um único fluxo geraria falsos positivos e desperdício de
                    consultas pagas. A separação permite pesos e SLAs por
                    metodologia.
                  </p>
                ),
              },
              {
                title: "Por que múltiplos bureaus",
                body: (
                  <p>
                    Cobertura e redundância. Trilia e BigDataCorp cobrem o
                    nacional; CIAL e LSEG cobrem o internacional. Conectores
                    plugáveis evitam lock-in e habilitam fallback automático.
                  </p>
                ),
              },
              {
                title: "Por que trilha de auditoria imutável",
                body: (
                  <p>
                    Compliance é regulado. Persistir payload bruto, versão da
                    regra e timestamp torna todo parecer reproduzível e
                    defensável perante auditoria e reguladores.
                  </p>
                ),
              },
              {
                title: "Como evitar falsos positivos",
                body: (
                  <p>
                    Match probabilístico de nomes (homônimos de PEP) com
                    desambiguação por data de nascimento e documento, além de
                    revisão humana obrigatória na faixa de risco médio.
                  </p>
                ),
              },
            ]}
          />
        </div>
      </Section>

      <Section label="Repositório" title="Pronto para importar no GitHub">
        <p className="mb-3 text-muted-foreground">
          O motor está estruturado como pacote Python instalável, com conectores
          de bureau isolados, validadores de CPF/CNPJ e testes. O arquivo de
          referência acompanha o portfólio.
        </p>
        <CodeBlock
          filename="compliance-risk-intelligence/"
          code={`compliance-risk-intelligence
├── README.md
├── pyproject.toml
├── .gitignore
├── risk_engine
│   ├── __init__.py
│   ├── validators.py      # CPF / CNPJ
│   ├── routing.py         # PF vs PJ
│   ├── methodologies.py   # KYC / KYE / KYS / KYP
│   ├── score.py           # modelo de risco
│   └── bureaus
│       ├── base.py        # interface do conector
│       ├── trilia.py
│       ├── bigdatacorp.py
│       ├── serasa.py
│       ├── cial.py
│       └── lseg.py
└── tests`}
        />
        <a
          href="/compliance_risk_intelligence.py"
          download
          className="mt-4 inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 font-mono text-sm text-foreground transition-colors hover:bg-secondary"
        >
          ↓ baixar arquivo do motor (.py)
        </a>
      </Section>
    </>
  );
}
