import { ProjectHeader } from "@/components/ProjectHeader";
import { Section } from "@/components/Section";
import { FlowDiagram } from "@/components/FlowDiagram";
import { TechStack } from "@/components/TechStack";
import { QA } from "@/components/QA";
import { CodeBlock } from "@/components/CodeBlock";
import { FeatureCards, BulletList } from "@/components/FeatureCards";
import { VisionGuardDemo } from "@/components/projects/VisionGuardDemo";

const stack = [
  "Python",
  "FastAPI",
  "OpenCV",
  "YOLO",
  "FaceNet",
  "Qdrant",
  "PostgreSQL",
  "RabbitMQ",
  "Docker",
  "Kubernetes",
];

export function VisionGuard() {
  return (
    <>
      <ProjectHeader
        index="02"
        name="VisionGuard AI"
        tagline="Reconhecimento facial em tempo real"
        domain="Computer Vision · MLOps"
        problem="Monitorar ambientes e identificar, em tempo real, pessoas conhecidas e desconhecidas — com notificação imediata dos eventos relevantes."
        stack={stack}
      />

      <Section label="Demo ao vivo" title="Reconhecimento facial no navegador">
        <p className="mb-5 text-muted-foreground">
          Cadastre pessoas conhecidas com fotos e depois envie imagens ou vídeos. O
          reconhecimento roda 100% no seu navegador (nenhuma imagem sai do dispositivo) e
          retorna se cada rosto é <strong>conhecido</strong> ou{" "}
          <strong>não conhecido</strong>, com as variáveis usadas e a exatidão de cada modelo.
        </p>
        <VisionGuardDemo />
      </Section>


      <Section label="Arquitetura" title="Da câmera ao alerta">
        <FlowDiagram
          steps={[
            "Câmera",
            "API Upload",
            "Object Detection",
            "Face Embedding",
            "Banco Vetorial",
            "Reconhecimento",
            "Evento",
            "Fila",
            "WhatsApp",
          ]}
          caption="Embeddings indexados em banco vetorial permitem busca por similaridade em milissegundos."
        />
        <div className="mt-6">
          <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Tecnologias
          </p>
          <TechStack items={stack} />
        </div>
      </Section>

      <Section label="Estrutura" title="Cadastro e pipeline de eventos">
        <p className="mb-3 text-muted-foreground">
          No cadastro, a imagem é recebida, o embedding facial é extraído e
          persistido junto à identidade da pessoa.
        </p>
        <CodeBlock
          filename="POST /cadastro"
          code={`{
  "id": 1,
  "nome": "João",
  "embedding": [ ... ]
}`}
        />
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 font-mono text-xs text-muted-foreground">
              Pessoa conhecida
            </p>
            <CodeBlock code={`{ "tipo": "known" }`} />
          </div>
          <div>
            <p className="mb-2 font-mono text-xs text-muted-foreground">
              Pessoa desconhecida
            </p>
            <CodeBlock code={`{ "tipo": "unknown" }`} />
          </div>
        </div>
      </Section>

      <Section label="Mensageria" title="Duas abordagens de entrega de eventos">
        <p className="mb-5 text-muted-foreground">
          Mostro duas arquiteturas — porque a melhor escolha depende do contexto,
          e recrutadores valorizam quem entende os trade-offs.
        </p>
        <FeatureCards
          features={[
            {
              title: "Convencional · WhatsApp Business API",
              body: (
                <>
                  <p className="mb-2 text-foreground">Prós</p>
                  <BulletList items={["Mais simples de implementar", "Mais barata"]} />
                </>
              ),
            },
            {
              title: "MCP · Servidor de eventos especializado",
              body: (
                <>
                  <p className="mb-2 text-foreground">Prós</p>
                  <BulletList
                    items={["Mais modular", "Mais preparada para agentes"]}
                  />
                </>
              ),
            },
          ]}
        />
      </Section>

      <Section label="Entrevista" title="Decisões técnicas que defendo">
        <QA
          area="Computer Vision"
          question="Como evitar falsos positivos?"
          answers={[
            "Threshold de similaridade calibrado",
            "Múltiplas imagens por pessoa",
            "Ensemble de embeddings",
          ]}
        />
      </Section>
    </>
  );
}
