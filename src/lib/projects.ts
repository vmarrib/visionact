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
    tagline: "Inteligência de mercado com NLP",
    description:
      "Crawler distribuído + pipeline de NLP que transforma milhares de avaliações de e-commerce em sentimento, reclamações, elogios e resumo executivo.",
    domain: "Data Engineering · NLP",
    stack: ["Python", "Scrapy", "Kafka", "PostgreSQL", "Airflow", "Transformers"],
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
];

export const profile = {
  name: "Vanessa M. Ribeiro",
  role: "Engenheira & Cientista de Dados",
  summary:
    "Construo sistemas de dados de ponta a ponta — da coleta e infraestrutura ao machine learning em produção. Foco em arquiteturas escaláveis, NLP, visão computacional e produtos guiados por IA.",
  email: "vanessa.ribeiro@example.com",
  github: "https://github.com/vanessaribeiro",
  linkedin: "https://linkedin.com/in/vanessaribeiro",
};
