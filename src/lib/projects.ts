export type ProjectMeta = {
  slug: string;
  index: string;
  name: string;
  tagline: string;
  description: string;
  domain: string;
  stack: string[];
  accent: string;
};

export const projects: ProjectMeta[] = [
  {
    slug: "market-sentiment",
    index: "01",
    name: "Market Sentiment Intelligence Platform",
    tagline: "Análise de sentimento de reviews por link",
    description:
      "Cole o link de um produto: o scraper varre todas as opiniões e estrelas, um modelo de sentimento classifica cada comentário e o sistema gera um relatório quantitativo (estrelas, % de sentimento, elogios e reclamações).",
    domain: "Data Engineering · NLP",
    stack: ["Python", "Playwright", "FastAPI", "Transformers", "Docker"],
    accent: "Market intelligence",
  },
  {
    slug: "visionguard",
    index: "02",
    name: "VisionGuard AI",
    tagline: "Reconhecimento facial em tempo real",
    description:
      "Detecção de objetos, embeddings faciais e busca vetorial para identificar pessoas conhecidas e desconhecidas, com eventos enviados em tempo real.",
    domain: "Computer Vision · MLOps",
    stack: ["FastAPI", "OpenCV", "YOLO", "FaceNet", "Qdrant", "Kubernetes"],
    accent: "Real-time vision",
  },
  {
    slug: "pitaia",
    index: "03",
    name: "PitaIA Digital Health Ecosystem",
    tagline: "Saúde digital com IA clínica",
    description:
      "Ecossistema de saúde mental: check-in emocional, insights clínicos gerados por IA e análise comportamental consentida. Pensamento de produto, não só código.",
    domain: "Product · Applied AI",
    stack: ["React", "Supabase", "Edge Functions", "OpenAI", "PostgreSQL"],
    accent: "Founder mindset",
  },
  {
    slug: "compliance-risk",
    index: "04",
    name: "Compliance Risk Intelligence",
    tagline: "Análise de risco de compliance (KYC/KYE/KYS/KYP)",
    description:
      "Motor de risco que orquestra múltiplos bureaus nacionais e internacionais, valida CPF e CNPJ e calcula score de risco para due diligence de compliance com trilha de auditoria.",
    domain: "Risk · Compliance · Data",
    stack: ["Python", "FastAPI", "Pydantic", "PostgreSQL", "Airflow", "Redis"],
    accent: "Regulatory grade",
  },
];

export const profile = {
  name: "Vanessa M. Ribeiro",
  role: "Engenheira & Cientista de Dados",
  summary:
    "Construo sistemas de dados de ponta a ponta, da coleta e infraestrutura ao machine learning em produção. Foco em arquiteturas escaláveis, NLP, visão computacional, risco de compliance e produtos guiados por IA.",
  email: "vanessa.ribeiro@example.com",
  github: "https://github.com/vanessamarrib",
  linkedin: "https://www.linkedin.com/in/vanessamarrib/",
};
