# Ponto Inteligente — amostra de código

> Amostra curada de decisões técnicas do Ponto Inteligente, um sistema de
> ponto eletrônico com geofencing e verificação facial. Limiares de negócio
> específicos de cliente, nomes reais de local e dados biométricos foram
> omitidos — o objetivo é mostrar a arquitetura, não o schema de produção.

## Problema

Equipes de campo precisam registrar ponto de forma confiável: confirmar que
a pessoa está fisicamente no local certo e que é de fato ela batendo o
ponto — sem depender só da palavra do funcionário. O Ponto Inteligente
valida cada registro com geofencing e reconhecimento facial no momento da
batida, com auditoria completa de cada tentativa.

## Decisões técnicas e alternativas consideradas

**1. Haversine implementado diretamente, sem biblioteca de geolocalização**
Para uma necessidade específica (distância entre dois pontos lat/long e
comparação com um raio), trazer uma biblioteca de geolocalização completa
adiciona peso ao bundle para resolver um problema que é uma fórmula
matemática conhecida e estável. A fórmula de Haversine (ver
`geofence.ts`) tem ~15 linhas e é trivial de testar isoladamente com
coordenadas conhecidas — nenhuma dependência externa da qual acompanhar
atualizações de segurança.

**2. Reconhecimento facial 100% client-side, não uma API de biometria em nuvem**
A alternativa mais comum é enviar a selfie para uma API de terceiros que
retorna "é a mesma pessoa? sim/não". Isso tem dois custos: dinheiro (cobrança
por verificação) e privacidade (a foto trafega para fora do controle da
aplicação). Rodando o modelo de detecção/comparação facial no navegador do
próprio usuário, nenhuma imagem biométrica sai do dispositivo até a decisão
já estar tomada — só o resultado (similaridade, aprovado/reprovado) é
enviado ao servidor. Ver `face-match-client.ts`.

**3. Pré-aquecimento do modelo antes da primeira captura**
Um modelo de reconhecimento facial no navegador tem um custo de
inicialização perceptível (carregar pesos, compilar shaders WebGL). Em vez
de pagar esse custo no momento em que o funcionário já está tentando bater o
ponto (pior momento possível para uma UI travar), o modelo é carregado e
"aquecido" assim que a tela é aberta, antes de qualquer captura de câmera.

**4. Auditoria de toda tentativa, não só das aprovadas**
Registrar apenas batidas aprovadas dificultaria investigar um padrão de
fraude (várias tentativas reprovadas seguidas de uma aprovada, por exemplo).
Toda tentativa — aprovada ou não — é registrada com o grau de similaridade e
o motivo da decisão, o que trata biometria como algo auditável desde o
schema, não como um "sim/não" descartado depois de decidido.

## Stack

TypeScript, reconhecimento facial client-side (baseado em modelos que rodam
via TensorFlow.js no navegador), PostgreSQL (Row Level Security).

## Arquivos

- [`geofence.ts`](./geofence.ts) — distância Haversine e seleção do local
  autorizado mais próximo.
- [`face-match-client.ts`](./face-match-client.ts) — comparação de
  descritores faciais no cliente, com pré-aquecimento de modelo.
- [`rls-audit.sql`](./rls-audit.sql) — RLS multi-papel e tabela de auditoria
  de tentativas de verificação.

## O que foi omitido em relação ao projeto real

Nomes reais de local/cliente, o limiar de similaridade e o raio de geofence
configurados em produção, e qualquer selfie ou coordenada real de
funcionário.
