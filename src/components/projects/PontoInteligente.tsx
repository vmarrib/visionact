import { ProjectHeader } from "@/components/ProjectHeader";
import { Section } from "@/components/Section";
import { FlowDiagram } from "@/components/FlowDiagram";
import { TechStack } from "@/components/TechStack";
import { FeatureCards, BulletList } from "@/components/FeatureCards";
import { projects } from "@/lib/projects";

const meta = projects.find((p) => p.slug === "ponto-inteligente")!;

export function PontoInteligente() {
  return (
    <>
      <ProjectHeader
        index={meta.index}
        name={meta.name}
        tagline={meta.tagline}
        domain={meta.domain}
        problem="Equipes de campo precisam registrar ponto de forma confiável: confirmar que a pessoa está fisicamente no local autorizado e que é de fato ela batendo o ponto. O Ponto Inteligente valida cada registro com geofencing e reconhecimento facial, com rastreamento de jornada e um fluxo administrativo completo de aprovação e alertas."
        stack={meta.stack}
        github={meta.github}
      />

      <Section label="Geolocalização" title="Geofencing com Haversine, implementado do zero">
        <p className="text-muted-foreground">
          A distância entre a posição do funcionário e cada local autorizado é calculada com a
          fórmula de Haversine implementada diretamente no código, sem depender de biblioteca
          externa — a busca escolhe o local ativo cujo raio mais próximo contém o ponto.
        </p>
      </Section>

      <Section label="Biometria" title="Reconhecimento facial 100% client-side">
        <FeatureCards
          features={[
            {
              title: "Sem API paga de biometria",
              body: (
                <p>
                  Detecção, landmarks e descritor facial rodam inteiramente no navegador, com
                  comparação por distância euclidiana normalizada — nenhum dado biométrico
                  trafega para um serviço de terceiros.
                </p>
              ),
            },
            {
              title: "Otimização de UX",
              body: (
                <p>
                  Os modelos e shaders WebGL são pré-aquecidos antes da primeira captura, reduzindo
                  a latência percebida no momento da batida de ponto.
                </p>
              ),
            },
            {
              title: "Segurança em camadas",
              body: (
                <>
                  <p className="mb-2">Defesa em profundidade, não só uma checagem:</p>
                  <BulletList
                    items={[
                      "RLS com função SECURITY DEFINER anti-recursão",
                      "Middleware server-side validando JWT em toda escrita administrativa",
                      "Checagem de papel repetida na aplicação",
                    ]}
                  />
                </>
              ),
            },
            {
              title: "Auditoria de biometria",
              body: (
                <p>
                  Toda tentativa de validação facial — aprovada ou não — é registrada com o grau
                  de similaridade e o motivo, permitindo investigação posterior.
                </p>
              ),
            },
          ]}
        />
      </Section>

      <Section label="Arquitetura" title="Da selfie ao registro auditado">
        <FlowDiagram
          steps={[
            "Selfie + GPS",
            "face-api.js (client-side)",
            "Validação de geofence",
            "Supabase (RLS)",
            "Registro auditado",
          ]}
          caption="Parâmetros operacionais (raio, limiar de similaridade) ficam numa tabela de configuração, ajustáveis sem novo deploy."
        />
        <div className="mt-6">
          <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Tecnologias
          </p>
          <TechStack items={meta.stack} />
        </div>
      </Section>
    </>
  );
}
