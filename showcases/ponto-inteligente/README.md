# Ponto Inteligente — amostra de código

> Amostra curada de decisões técnicas do Ponto Inteligente, um sistema de
> ponto eletrônico com geofencing e verificação facial. Limiares de negócio
> específicos de cliente, nomes reais de local e dados biométricos foram
> omitidos — o objetivo é mostrar a arquitetura, não o schema de produção.

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
A alternativa mais comum é enviar a selfie para uma API de terceiros que
retorna "é a mesma pessoa? sim/não". Isso tem dois custos: dinheiro (cobrança
por verificação) e privacidade (a foto trafega para fora do controle da
aplicação). Rodando o modelo de detecção/comparação facial no navegador do
próprio usuário, nenhuma imagem biométrica sai do dispositivo até a decisão
já estar tomada — só o resultado (similaridade, aprovado/reprovado) é
enviado ao servidor. Ver `face-match-client.ts` e `face-match-pipeline.ts`.

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
Level Security), Vitest para os testes.

## Arquivos

- [`geofence.ts`](./geofence.ts) — distância Haversine e seleção do local
  autorizado mais próximo.
- [`geolocation.ts`](./geolocation.ts) — obtenção de posição via Geolocation
  API nativa, com checagem de precisão da leitura.
- [`face-match-client.ts`](./face-match-client.ts) — comparação de
  descritores faciais já extraídos, com pré-aquecimento de modelo.
- [`face-match-pipeline.ts`](./face-match-pipeline.ts) — pipeline completo:
  detecção, checagem de qualidade, cadastro de referência e verificação ao
  vivo.
- [`rls-audit.sql`](./rls-audit.sql) — RLS multi-papel e tabela de auditoria
  de tentativas de verificação.
- [`geofence.test.ts`](./geofence.test.ts),
  [`geolocation.test.ts`](./geolocation.test.ts),
  [`face-match-client.test.ts`](./face-match-client.test.ts),
  [`face-match-pipeline.test.ts`](./face-match-pipeline.test.ts) — testes
  (sintaxe Vitest) cobrindo distância geográfica, confiabilidade de
  leitura de GPS, comparação de descritores e checagem de qualidade
  facial. As coordenadas de teste usam um valor de referência calculado e
  verificado de forma independente (ver comentário em `geofence.test.ts`),
  não um número "chutado".

## Como rodar os testes

```bash
npm install --save-dev vitest
npx vitest run
```

## O que foi omitido em relação ao projeto real

O nome real do cliente e das plantas, o limiar de similaridade e o raio de
geofence configurados em produção, e qualquer selfie ou coordenada real de
funcionário.
