import { ProjectHeader } from "@/components/ProjectHeader";
import { Section } from "@/components/Section";
import { FlowDiagram } from "@/components/FlowDiagram";
import { TechStack } from "@/components/TechStack";
import { CodeBlock } from "@/components/CodeBlock";
import { FeatureCards, BulletList } from "@/components/FeatureCards";
import { FaceMatchDemo } from "./FaceMatchDemo";
import { projects } from "@/lib/projects";

const meta = projects.find((p) => p.slug === "ponto-inteligente")!;

const cvPipeline = [
  { stage: "1", model: "TinyFaceDetector", size: "~190 KB", does: "Detecta o rosto e define a bounding box, com score de confiança" },
  { stage: "2", model: "FaceLandmark68Net", size: "~350 KB", does: "Marca 68 pontos anatômicos e alinha o rosto" },
  { stage: "3", model: "FaceRecognitionNet", size: "~6,2 MB", does: "Converte o rosto alinhado num vetor de 128 números (embedding)" },
];

const costComparison = [
  { service: "AWS Rekognition CompareFaces", pricing: "US$ 1,00 / 1.000 chamadas", monthly: "~R$ 132/mês" },
  { service: "Azure Face API", pricing: "US$ 1,00 / 1.000 chamadas", monthly: "~R$ 132/mês" },
  { service: "Google Cloud Vision", pricing: "US$ 1,50 / 1.000 chamadas", monthly: "~R$ 198/mês" },
  { service: "face-api local (este projeto)", pricing: "sem chamadas de API", monthly: "R$ 0,00/mês" },
];

export function PontoInteligente() {
  return (
    <>
      <ProjectHeader
        index={meta.index}
        name={meta.name}
        tagline={meta.tagline}
        domain={meta.domain}
        problem="Construído para uma indústria de alimentos com vendedores e trabalhadores externos, em múltiplos locais e turnos. A exigência era dupla: uma prova de presença que resistisse a uma disputa trabalhista (digital falha com trabalho manual, crachá pode ser emprestado, papel não resiste) e geolocalização confiável para quem trabalha fora da planta, não só dentro dela. O sistema confirma, na mesma batida, que a pessoa está fisicamente no local certo e que é ela mesma — cada tentativa, aprovada ou não, registrada e armazenada de forma segura."
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
              title: "Onboarding com consentimento",
              body: (
                <p>
                  Cadastro pelo admin → magic link → troca de senha (bloqueante) → aceite explícito
                  do termo de geolocalização (bloqueante, sem ele o app não libera) → vínculo do
                  dispositivo ao usuário.
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

      <Section label="Visão computacional" title="Reconhecimento facial embarcado, em 3 estágios">
        <p className="mb-4 text-muted-foreground">
          Todo o pipeline roda no navegador do funcionário — nenhuma imagem biométrica sai do
          dispositivo até a decisão já estar tomada.
        </p>
        <div className="mb-6 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-surface font-mono text-xs uppercase tracking-widest text-muted-foreground">
                <th className="px-4 py-3 font-medium">Estágio</th>
                <th className="px-4 py-3 font-medium">Modelo</th>
                <th className="px-4 py-3 font-medium">Tamanho</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">O que faz</th>
              </tr>
            </thead>
            <tbody>
              {cvPipeline.map((row) => (
                <tr key={row.stage} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-3 font-mono font-semibold text-primary">{row.stage}</td>
                  <td className="px-4 py-3 font-mono text-foreground">{row.model}</td>
                  <td className="px-4 py-3 font-mono text-foreground">{row.size}</td>
                  <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">{row.does}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Custo — cenário de referência (~20 colaboradores, ~80 batidas/dia)
        </p>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-surface font-mono text-xs uppercase tracking-widest text-muted-foreground">
                <th className="px-4 py-3 font-medium">Serviço</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Cobrança</th>
                <th className="px-4 py-3 font-medium">Custo mensal</th>
              </tr>
            </thead>
            <tbody>
              {costComparison.map((row) => (
                <tr key={row.service} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-3 text-foreground">{row.service}</td>
                  <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">{row.pricing}</td>
                  <td className="px-4 py-3 font-mono font-semibold text-foreground">{row.monthly}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section label="Demo" title="Experimente o pipeline acima, ao vivo">
        <p className="mb-4 text-muted-foreground">
          Envie uma foto de referência e tire outra pela câmera — os mesmos 3 modelos da tabela
          acima rodam de verdade no seu navegador. Antes de aceitar a captura, o sistema pede uma
          ação aleatória (sorrir, abrir a boca, virar o rosto) e só segue adiante se a mudança
          entre o quadro neutro e o quadro do desafio bater com o que foi pedido — uma foto
          estática não reage sob comando. O limiar de decisão usado aqui{" "}
          <strong>não é</strong> o número simulado da seção de validação estatística abaixo — é o
          padrão real de mercado para este modelo (distância euclidiana ≤ 0.6). Explico o porquê
          logo ali embaixo. Código em{" "}
          <code className="rounded bg-secondary px-1 py-0.5 text-xs">src/lib/face-match-live.ts</code>{" "}
          e{" "}
          <code className="rounded bg-secondary px-1 py-0.5 text-xs">src/lib/liveness-challenge.ts</code>.
        </p>
        <FaceMatchDemo />
      </Section>

      <Section label="Validação estatística" title="Como os limiares de decisão foram calibrados">
        <p className="mb-4 text-muted-foreground">
          A parte mais fácil de fazer errado num sistema biométrico é escolher um número redondo
          para o limiar de decisão sem justificar por quê. Os dois limiares centrais deste projeto
          foram calibrados com metodologia estatística, sobre dados simulados (nenhum dado
          biométrico ou de localização real de funcionário é usado).
        </p>
        <FeatureCards
          features={[
            {
              title: "FaceMatch: FAR, FRR e Equal Error Rate",
              body: (
                <>
                  <p className="mb-2">
                    Para cada limiar candidato: FAR (fração de impostores aprovados) e FRR (fração
                    de genuínos reprovados). O EER é onde as duas se cruzam — métrica padrão de
                    sistemas biométricos.
                  </p>
                </>
              ),
            },
            {
              title: "Geofence: percentil empírico de erro de GPS",
              body: (
                <p>
                  Mesma técnica usada para SLOs de latência em SRE, aplicada a erro de
                  posicionamento: o raio recomendado é um percentil da distribuição de distâncias
                  observadas, não uma regra de desvio-padrão.
                </p>
              ),
            },
          ]}
        />
        <div className="mt-4">
          <CodeBlock
            filename="saída real de threshold_calibration.py"
            code={`EER: threshold=0.680 far=0.014 frr=0.012
Limiar recomendado (FAR <= 2%): threshold=0.655 far=0.020 frr=0.004`}
          />
        </div>
        <div className="mt-4">
          <CodeBlock
            filename="saída real de geofence_calibration.py"
            code={`Raio para aceitar 50% das leituras legítimas: 28.8 m
Raio para aceitar 90% das leituras legítimas: 55.8 m
Raio para aceitar 95% das leituras legítimas: 61.3 m
Raio para aceitar 99% das leituras legítimas: 74.3 m`}
          />
        </div>
        <div className="mt-4 rounded-md border border-neutral/30 bg-neutral/10 p-4">
          <p className="mb-2 font-mono text-xs uppercase tracking-widest text-neutral">
            Correção registrada em produção
          </p>
          <p className="text-sm text-foreground">
            A calibração acima roda sobre uma distribuição <strong>simulada</strong>, criada só
            para ensinar o método FAR/FRR/EER de forma abstrata — nunca foi uma medição real do{" "}
            <code className="text-xs">@vladmandic/face-api</code>. A demo ao vivo inicialmente
            reaproveitou o número que saiu dali (0.65), e isso causou falsos negativos reais: a
            mesma pessoa sendo reprovada com similaridade ~0.50. O limiar em produção foi
            corrigido para <strong>0.4</strong> (distância euclidiana ≤ 0.6), a referência real
            adotada pela comunidade dlib/face-api.js para descritores de 128 dimensões — bem mais
            permissiva que a calibração simulada. Para contexto de mercado: sistemas bancários
            miram FAR de 0,001%–0,1% com modelos proprietários multi-modais (infravermelho, prova
            de vida); um descritor de 128 números rodando no navegador é classe
            controle-de-acesso/ponto, não classe bancária — e isso é documentado aqui, não
            escondido.
          </p>
        </div>
        <div className="mt-4 rounded-md border border-neutral/30 bg-neutral/10 p-4">
          <p className="mb-2 font-mono text-xs uppercase tracking-widest text-neutral">
            Segunda correção: ataque de apresentação
          </p>
          <p className="text-sm text-foreground">
            Um segundo teste real expôs outra lacuna: segurar uma <strong>foto estática</strong> em
            frente à câmera também era aprovada como "mesma pessoa" — o FaceMatch confirma quem
            está na imagem, mas nunca verificava se a captura vinha de uma pessoa viva. É uma
            vulnerabilidade conhecida em biometria facial (ataque de apresentação). A contramedida
            foi um desafio de movimento aleatório: sorrir, abrir a boca ou virar o rosto, escolhido
            na hora, comparando um quadro neutro com um quadro depois do desafio — uma foto ou um
            vídeo em loop não reage sob comando aleatório. Não é infalível (um vídeo preparado com
            todas as reações poderia, em teoria, ser sincronizado), mas eleva o custo do ataque bem
            além de "segurar uma foto", que é o vetor mais barato e mais comum.
          </p>
        </div>
      </Section>

      <Section label="Biometria" title="Checagem de qualidade e segurança em camadas">
        <FeatureCards
          features={[
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
              title: "Prova de vivacidade",
              body: (
                <p>
                  Antes de aceitar a captura, um desafio de movimento aleatório (sorrir, abrir a
                  boca, virar o rosto) confirma que é uma pessoa real ao vivo — contramedida a foto
                  ou vídeo estático, adicionada depois de um teste real expor essa brecha.
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
              title: "Vínculo de dispositivo",
              body: (
                <p>
                  Um fingerprint do dispositivo é salvo e associado ao usuário no onboarding —
                  dificulta um funcionário bater ponto de um aparelho que não é o seu.
                </p>
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
          caption="Os dois limiares (raio e similaridade) vêm de calibração estatística, não de um valor arbitrário — e ficam numa tabela de configuração, ajustáveis sem novo deploy."
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
