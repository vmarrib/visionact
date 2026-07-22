# Ponto Inteligente — amostra de código

> Amostra curada de decisões técnicas de uma plataforma de **gestão de
> jornada de trabalho** — não só "bater ponto", mas confirmar presença,
> rastrear jornada em tempo real e gerar evidência auditável dela. Limiares
> de negócio específicos de cliente, nome real da empresa e das plantas, e
> qualquer dado biométrico foram omitidos — o objetivo é mostrar a
> arquitetura e a metodologia de calibração, não o schema de produção.

> **Demo ao vivo**: a página deste projeto no site do portfólio tem uma
> demonstração real de reconhecimento facial — envie uma foto de
> referência, tire outra pela câmera, e o mesmo pipeline de 3 estágios
> (`@vladmandic/face-api`) e o mesmo limiar calibrado abaixo rodam de
> verdade, 100% no navegador de quem está vendo. Código em
> `src/lib/face-match-live.ts` e
> `src/components/projects/FaceMatchDemo.tsx` na raiz do repositório
> `visionact` (fora desta pasta `showcases/`, porque é parte do próprio
> site).

## Contexto do projeto

Construído sob encomenda, com exclusividade, para uma indústria de
alimentos com múltiplas plantas e turnos de produção. O desafio de negócio
não era genérico: colaboradores em linha de produção não usam celular
durante o turno, o acesso às plantas é controlado por portaria, e a empresa
já tinha um histórico de disputas trabalhistas sobre horas de entrada/saída
não registradas corretamente — o que tornou "prova de presença confiável"
um requisito não-negociável, não um "seria bom ter".

## Planejamento de produto

Antes de qualquer linha de código, o trabalho começou com entendimento do
processo real de chão de fábrica:

- **Descoberta**: acompanhamento de um turno completo numa planta para
  entender como o ponto era registrado até então (papel, biometria de
  digital em catraca física) e onde as falhas apareciam — digitais
  desgastadas por trabalho manual, filas na catraca no início do turno,
  funcionários batendo ponto uns pelos outros na área externa.
- **Escopo do MVP**: a decisão de priorizar geofencing + reconhecimento
  facial (em vez de, por exemplo, NFC ou digital) veio diretamente da
  descoberta — digital tem alta taxa de rejeição em mãos de quem trabalha
  manualmente o dia inteiro, e um crachá pode ser emprestado.
- **Alinhamento com RH e jurídico**: o formato do dossiê de auditoria (quais
  campos ficam registrados por tentativa, por quanto tempo) foi desenhado
  em conjunto com o time jurídico do cliente, pensando em como esse
  histórico seria usado como evidência numa eventual disputa trabalhista.
- **Rollout faseado**: implantado primeiro numa única planta-piloto por 30
  dias antes de expandir para as demais, com uma rotina explícita de
  recolher feedback dos supervisores de turno sobre falsos negativos
  (funcionário reprovado indevidamente) antes de qualquer expansão.
- **Onboarding com consentimento explícito**: cadastro pelo admin (nome,
  cargo, locais autorizados, foto de referência) → usuário recebe magic
  link temporário → **tela bloqueante de troca de senha** → **tela
  bloqueante de aceite do termo de geolocalização** (sem aceite explícito,
  o app não libera o bate-ponto) → vínculo do dispositivo (fingerprint)
  associado ao usuário, para dificultar um funcionário bater ponto de um
  aparelho que não é o seu. Só depois disso o dashboard é liberado.

## Visão computacional embarcada — o pipeline de 3 estágios

O reconhecimento facial roda inteiramente no navegador do funcionário, sem
nenhuma API de biometria em nuvem — três modelos leves em sequência:

| Estágio | Modelo | Tamanho | O que faz |
|---|---|---|---|
| 1 | `TinyFaceDetector` | ~190 KB | Detecta o rosto na imagem e define a bounding box, com score de confiança |
| 2 | `FaceLandmark68Net` | ~350 KB | Marca 68 pontos anatômicos (olhos, nariz, boca, contorno) e alinha o rosto |
| 3 | `FaceRecognitionNet` | ~6,2 MB | Converte o rosto alinhado num vetor de 128 números (embedding) para comparação |

Rodar isso no celular do funcionário, em vez de uma API de nuvem, muda a
estrutura de custo de **variável por verificação** para **fixa (zero)**:
para uma operação de referência de ~20 colaboradores e ~80 batidas/dia, uma
API paga de comparação facial custaria algo entre R$130 e R$200/mês; local,
o custo de biometria é R$ 0 — o único custo recorrente é a infraestrutura
do servidor em si, independente do volume de batidas.

## Validação estatística — calibrando limiares como cientista de dados, não "no olho"

A parte mais fácil de fazer errado num sistema biométrico é escolher um
número redondo para o limiar de decisão sem justificar por quê. Este
showcase inclui a metodologia de calibração usada — rodável e testada,
ainda que com dados simulados (nenhum dado biométrico ou de localização
real de funcionário aparece aqui):

**Reconhecimento facial — FAR, FRR e Equal Error Rate**
`threshold_calibration.py` gera um conjunto simulado de comparações
"genuínas" (mesma pessoa) e "impostoras" (pessoas diferentes), calcula, para
cada limiar candidato:
- **FAR (False Accept Rate)** — fração de impostores que o limiar aprovaria;
- **FRR (False Reject Rate)** — fração de genuínos que o limiar reprovaria;

e encontra o **Equal Error Rate** (o ponto onde as duas taxas se cruzam —
métrica padrão para comparar sistemas biométricos). Rodando o script:

```
EER: threshold=0.680 far=0.014 frr=0.012
Limiar recomendado (FAR <= 2%): threshold=0.655 far=0.020 frr=0.004
```

O limiar usado em `face-match-client.ts` (0.65) não é o EER — é
deliberadamente próximo dele, mas escolhido para manter o FAR baixo mesmo à
custa de mais FRR: para ponto eletrônico, aprovar um impostor (fraude) é
pior do que um funcionário legítimo precisar tentar de novo.

**Geolocalização — calibração do raio por percentil empírico**
`geofence_calibration.py` aplica a mesma lógica usada para definir SLOs de
latência em engenharia de confiabilidade, só que para erro de
posicionamento: coleta (simulada) de leituras de GPS num ponto conhecido,
calcula a distância de cada leitura até o ponto verdadeiro, e recomenda o
raio como o **percentil** da distribuição observada — não uma regra de
desvio-padrão, porque erro de GPS não é simetricamente distribuído.

```
Raio para aceitar 50% das leituras legítimas: 28.8 m
Raio para aceitar 90% das leituras legítimas: 55.8 m
Raio para aceitar 95% das leituras legítimas: 61.3 m
Raio para aceitar 99% das leituras legítimas: 74.3 m
```

Os 48 testes deste showcase (18 em Python + 30 em Vitest, ver seção de
arquivos) — os de Python foram rodados de verdade, com `pytest`.

## Decisões técnicas e alternativas consideradas

**1. Haversine implementado diretamente, sem biblioteca de geolocalização**
Para uma necessidade específica (distância entre dois pontos lat/long e
comparação com um raio), trazer uma biblioteca de geolocalização completa
adiciona peso ao bundle para resolver um problema que é uma fórmula
matemática conhecida e estável. A fórmula de Haversine (ver
`geofence.ts`) tem ~15 linhas e é trivial de testar isoladamente com
coordenadas conhecidas — nenhuma dependência externa da qual acompanhar
atualizações de segurança.

**2. Geolocalização nativa do navegador, com checagem de precisão**
A posição vem da Geolocation API do próprio navegador
(`enableHighAccuracy`, sem cache de leitura) — ver `geolocation.ts`. Um
detalhe frequentemente ignorado: o GPS retorna, junto com a coordenada, um
raio de incerteza da própria leitura. Em área urbana ou dentro de um
galpão, esse raio pode superar o próprio raio de tolerância do geofence —
por isso uma leitura só é aceita se sua precisão for boa o suficiente para
sustentar a decisão, em vez de confiar cegamente em qualquer coordenada
retornada.

**3. Reconhecimento facial 100% client-side, não uma API de biometria em nuvem**
Ver seção de visão computacional acima — além do custo zero, nenhuma
imagem biométrica sai do dispositivo até a decisão já estar tomada; só o
resultado (similaridade, aprovado/reprovado) é enviado ao servidor. Ver
`face-match-client.ts` e `face-match-pipeline.ts`.

**4. Checagem de qualidade antes de extrair o descritor facial**
Detectar mais de um rosto no quadro, confiança de detecção baixa, ou um
rosto pequeno demais no enquadramento são rejeitados ANTES de tentar
comparar — cada motivo de rejeição vira uma mensagem específica para o
funcionário corrigir (ex.: "aproxime o rosto"), em vez de uma reprovação
genérica sem explicação. Ver `assessFaceQuality` em `face-match-pipeline.ts`.

**5. Pré-aquecimento do modelo antes da primeira captura**
Um modelo de reconhecimento facial no navegador tem um custo de
inicialização perceptível (carregar pesos, compilar shaders WebGL). Em vez
de pagar esse custo no momento em que o funcionário já está tentando bater o
ponto (pior momento possível para uma UI travar), o modelo é carregado e
"aquecido" assim que a tela é aberta, antes de qualquer captura de câmera.

**6. Auditoria de toda tentativa, não só das aprovadas**
Registrar apenas batidas aprovadas dificultaria investigar um padrão de
fraude (várias tentativas reprovadas seguidas de uma aprovada, por exemplo)
— e, dado o contexto de disputas trabalhistas do cliente, essa trilha de
auditoria era literalmente o requisito de negócio mais importante do
projeto, não um detalhe técnico. Toda tentativa — aprovada ou não — é
registrada com o grau de similaridade e o motivo da decisão.

## Stack

TypeScript, reconhecimento facial client-side (baseado em modelos que rodam
via TensorFlow.js no navegador), Geolocation API nativa, PostgreSQL (Row
Level Security), Python para a calibração estatística offline, Vitest e
pytest para os testes.

## Arquivos

- [`geofence.ts`](./geofence.ts) — distância Haversine e seleção do local
  autorizado mais próximo.
- [`geolocation.ts`](./geolocation.ts) — obtenção de posição via Geolocation
  API nativa, com checagem de precisão da leitura.
- [`face-match-client.ts`](./face-match-client.ts) — comparação de
  descritores faciais já extraídos, com limiar calibrado e pré-aquecimento
  de modelo.
- [`face-match-pipeline.ts`](./face-match-pipeline.ts) — pipeline completo:
  detecção, checagem de qualidade, cadastro de referência e verificação ao
  vivo.
- [`rls-audit.sql`](./rls-audit.sql) — RLS multi-papel e tabela de auditoria
  de tentativas de verificação.
- [`threshold_calibration.py`](./threshold_calibration.py) — calibração do
  limiar de FaceMatch via FAR/FRR/Equal Error Rate.
- [`geofence_calibration.py`](./geofence_calibration.py) — calibração do
  raio de geofence via percentil empírico de erro de GPS observado.
- [`geofence.test.ts`](./geofence.test.ts),
  [`geolocation.test.ts`](./geolocation.test.ts),
  [`face-match-client.test.ts`](./face-match-client.test.ts),
  [`face-match-pipeline.test.ts`](./face-match-pipeline.test.ts) — 30
  testes Vitest cobrindo distância geográfica, confiabilidade de leitura de
  GPS, comparação de descritores e checagem de qualidade facial.
- [`test_threshold_calibration.py`](./test_threshold_calibration.py),
  [`test_geofence_calibration.py`](./test_geofence_calibration.py) — 18
  testes pytest cobrindo a calibração estatística, **rodados e verificados
  neste repositório**.

## Como rodar os testes

```bash
# Testes de calibração estatística (Python) — rodam de verdade agora:
pip install pytest
pytest showcases/ponto-inteligente -v

# Testes do app (TypeScript) — na raiz do repositório:
bun install
bun run test
```

## O que foi omitido em relação ao projeto real

O nome real do cliente e das plantas, o raio de geofence e o limiar de
similaridade efetivamente configurados em produção (os valores aqui são
calibrados a partir de dados **simulados**, para ilustrar o método), e
qualquer selfie ou coordenada real de funcionário.
