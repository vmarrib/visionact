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
        problem="Construído sob encomenda, com exclusividade, para uma indústria de alimentos com múltiplas plantas e turnos de produção: confirmar que a pessoa está fisicamente no local autorizado e que é de fato ela batendo o ponto, num contexto onde o cliente já enfrentava disputas trabalhistas por registro de jornada inconfiável."
        stack={meta.stack}
        github={meta.github}
      />

      <Section label="Planejamento de produto" title="Da descoberta em chão de fábrica ao MVP">
        <p className="mb-4 text-muted-foreground">
          O trabalho começou antes de qualquer linha de código, acompanhando um turno completo
          numa planta para entender onde o processo de ponto até então falhava — digitais
          desgastadas por trabalho manual, filas na catraca no início do turno, e colegas batendo
          ponto uns pelos outros.
        </p>
        <FeatureCards
          features={[
            {
              title: "Escopo do MVP",
              body: (
                <p>
                  Geofencing + reconhecimento facial (não NFC ou digital) foi decisão direta da
                  descoberta: digital tem alta rejeição em mãos de trabalho manual, e um crachá
                  pode ser emprestado.
                </p>
              ),
            },
            {
              title: "Alinhamento jurídico",
              body: (
                <p>
                  O formato do dossiê de auditoria foi desenhado com o time jurídico do cliente,
                  pensando em como esse histórico serviria de evidência numa disputa trabalhista.
                </p>
              ),
            },
            {
              title: "Rollout faseado",
              body: (
                <p>
                  Implantado numa planta-piloto por 30 dias, com coleta ativa de feedback dos
                  supervisores sobre falsos negativos, antes de expandir para as demais plantas.
                </p>
              ),
            },
          ]}
        />
      </Section>

      <Section label="Geolocalização" title="Geofencing com Haversine, e a precisão do GPS importa">
        <p className="text-muted-foreground">
          A distância entre a posição do funcionário e cada local autorizado é calculada com a
          fórmula de Haversine implementada diretamente no código. Mas coordenada sozinha não
          basta: a Geolocation API do navegador retorna também um raio de incerteza da própria
          leitura, e uma leitura imprecisa demais (comum dentro de um galpão) é rejeitada antes de
          basear qualquer decisão de geofence nela — em vez de confiar cegamente em qualquer
          coordenada retornada.
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
              title: "Checagem de qualidade",
              body: (
                <>
                  <p className="mb-2">Rejeitado antes de extrair o descritor, com mensagem específica:</p>
                  <BulletList
                    items={[
                      "Nenhum rosto detectado",
                      "Mais de um rosto no quadro",
                      "Confiança de detecção baixa",
                      "Rosto pequeno demais no enquadramento",
                    ]}
                  />
                </>
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
          ]}
        />
      </Section>

      <Section label="Arquitetura" title="Da selfie ao registro auditado">
        <FlowDiagram
          steps={[
            "Selfie + GPS (com checagem de precisão)",
            "Detecção + checagem de qualidade",
            "face-api.js (descritor, client-side)",
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
