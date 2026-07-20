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
    slug: "due-check",
    index: "02",
    name: "Due Check",
    tagline: "Due diligence e KYC multi-tenant",
    description:
      "Plataforma B2B para avaliar contrapartes antes de fechar negócio: matrizes de risco configuráveis, integração resiliente com 8+ fontes públicas brasileiras (Receita, CGU, CNJ, sanções) e dossiês auditáveis em PDF/Excel.",
    domain: "Data Engineering · Risk & Compliance",
    stack: ["TanStack Start", "React", "Supabase", "PostgreSQL", "Row Level Security", "jsPDF"],
    accent: "Regulatory grade",
    github: "https://github.com/vmarrib/visionact/tree/main/showcases/due-check",
  },
  {
    slug: "ponto-inteligente",
    index: "03",
    name: "Ponto Inteligente",
    tagline: "Ponto eletrônico com geofencing e biometria",
    description:
      "Controle de ponto para equipes de campo: geofencing calculado via Haversine e verificação facial 100% client-side (sem custo de API de biometria em nuvem), com auditoria completa de cada tentativa de validação.",
    domain: "Data Engineering · Applied AI",
    stack: ["React", "TanStack Start", "Supabase", "PostgreSQL", "Row Level Security", "face-api.js"],
    accent: "Field workforce",
    github: "https://github.com/vmarrib/visionact/tree/main/showcases/ponto-inteligente",
  },
];

export const profile = {
  name: "Vanessa M. Ribeiro",
  role: "Engenheira & Cientista de Dados",
  summary:
    "Construo sistemas de dados de ponta a ponta para domínios sensíveis do mundo real — saúde, compliance e biometria — com modelagem de acesso rigorosa (Row Level Security não-trivial) desde o design do schema. Três projetos em produção: unificação de dados de saúde com IA de contexto, due diligence B2B integrando múltiplas fontes públicas de risco, e controle de ponto com geofencing e reconhecimento facial.",
  email: "vanessamarrib@gmail.com",
  github: "https://github.com/vmarrib",
  linkedin: "https://www.linkedin.com/in/vanessamarrib/",
};
