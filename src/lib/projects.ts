export type ProjectMeta = {
  slug: string;
  index: string;
  name: string;
  tagline: string;
  description: string;
  domain: string;
  stack: string[];
  accent: string;
  github: string;
};

export const projects: ProjectMeta[] = [
  {
    slug: "pitaia",
    index: "01",
    name: "PitaIA",
    tagline: "Inteligência pessoal de saúde com IA",
    description:
      "Unifica check-ins de humor, sono, treino, nutrição, ciclo menstrual e exames num histórico único, e usa IA com contexto real do usuário para gerar insights — com RLS multi-papel isolando dados íntimos mesmo de profissionais autorizados.",
    domain: "Data Engineering · Applied AI",
    stack: ["React", "Supabase", "PostgreSQL", "Row Level Security", "Edge Functions", "Claude API"],
    accent: "Health data platform",
    github: "https://github.com/vmarrib/visionact/tree/main/showcases/pitaia",
  },
  {
    slug: "checagem-de-risco",
    index: "02",
    name: "Checagem de Risco",
    tagline: "Diligência em lote com PySpark",
    description:
      "Pipeline PySpark que consulta múltiplas fontes de risco em lote (paralelizado, não uma contraparte por vez), aplica regras configuráveis — incluindo um checador de mídia adversa próprio, não um bureau — e gera um dossiê final com score e regras sinalizadas.",
    domain: "Data Engineering · Risk & Compliance",
    stack: ["PySpark", "Python", "YAML", "Batch Processing"],
    accent: "Regulatory grade",
    github: "https://github.com/vmarrib/visionact/tree/main/showcases/checagem-de-risco",
  },
  {
    slug: "ponto-inteligente",
    index: "03",
    name: "Ponto Inteligente",
    tagline: "Gestão de jornada com geolocalização e visão computacional",
    description:
      "Plataforma de gestão de jornada construída sob encomenda para uma indústria de alimentos: geofencing e reconhecimento facial 100% client-side, com limiares calibrados estatisticamente (FAR/FRR/Equal Error Rate para biometria, percentil empírico para o raio de GPS) em vez de escolhidos no olho.",
    domain: "Data Engineering · Applied AI",
    stack: ["React", "TanStack Start", "Supabase", "PostgreSQL", "Row Level Security", "face-api.js", "Python"],
    accent: "Field workforce",
    github: "https://github.com/vmarrib/visionact/tree/main/showcases/ponto-inteligente",
  },
];

export const profile = {
  name: "Vanessa M. Ribeiro",
  role: "Engenheira & Cientista de Dados",
  summary:
    "Construo sistemas de dados de ponta a ponta para domínios sensíveis do mundo real — saúde, compliance e biometria — com modelagem de acesso rigorosa (Row Level Security não-trivial) desde o design do schema. Três projetos em produção: unificação de dados de saúde com IA de contexto, due diligence B2B integrando múltiplas fontes públicas de risco, e gestão de jornada com geolocalização e visão computacional calibradas estatisticamente.",
  email: "contato@visionact.org",
  phone: "+55 48 99167-4257",
  github: "https://github.com/vmarrib/visionact",
  linkedin: "https://www.linkedin.com/in/vanessamarrib/",
};
