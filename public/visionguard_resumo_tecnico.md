# VisionGuard AI — Resumo Técnico (End-to-End)
### Documento para Cientista de Dados Sênior
*Reconhecimento facial em fotos e vídeos com cadastro de pessoas conhecidas, identificação multi-modelo e geração de relatório.*

---

## 1. Problema e objetivo

**Objetivo de negócio:** dado um conjunto de pessoas conhecidas (cadastradas a partir de fotos), determinar — em novas **fotos e vídeos** — se cada rosto detectado **pertence ou não** à lista cadastrada, e produzir um **relatório auditável**.

**Formalização (ML):** o problema é **open-set face recognition**, não classificação fechada.
- *Closed-set:* todo rosto de teste pertence obrigatoriamente a uma das N classes conhecidas.
- *Open-set (nosso caso):* o rosto pode ser de alguém **fora** da galeria → precisamos de um mecanismo de **rejeição** (`desconhecido`).

Essa distinção é a decisão de design mais importante do projeto: ela implica que **não usamos um classificador softmax treinado nas N pessoas**, e sim **verificação por similaridade** (embeddings + distância + threshold). Cadastrar uma pessoa nova passa a ser "adicionar um vetor", sem re-treino.

---

## 2. Visão geral da arquitetura (pipeline)

```
            ┌──────────────── CADASTRO (offline) ────────────────┐
 fotos  →   │ Detecção → Alinhamento → Embedding → Galeria (vetores por pessoa) │
            └─────────────────────────────────────────────────────┘

            ┌──────────────── ANÁLISE (inferência) ───────────────┐
fotos/vídeo →│ (vídeo→frames) → Detecção → Embedding → Matching → Threshold → Decisão │
            └──────────────────────────────────────────────────────────────────────┘
                                                                      │
                                                              Relatório (CSV + resumo)
```

O reconhecimento facial é decomposto em **3 estágios independentes**, cada um com decisões próprias:

| Estágio | O que faz | Por que é separado |
|---|---|---|
| **Detecção** | Localiza rostos (bounding box) na imagem | Erro aqui (não achar o rosto) limita todo o resto |
| **Embedding** | Converte o recorte do rosto num vetor (assinatura) | É o coração discriminativo; onde os 3 modelos diferem |
| **Matching** | Compara o vetor com a galeria via distância + threshold | Define a fronteira conhecido/desconhecido |

**Decisão:** manter os estágios desacoplados via uma interface única (`modelo.embeddings(imagem) -> [vetores]`). Isso permite trocar/comparar modelos sem mexer no restante do código (princípio de baixo acoplamento, essencial para experimentação).

---

## 3. Estágio 1 — Detecção facial

Cada modelo traz seu próprio detector, e isso é **intencional** (não é acidente de implementação):

- **face_recognition** → detector **HOG** (dlib). Rápido em CPU, robusto para rostos frontais; perde rostos muito pequenos/de perfil.
- **FaceNet** → detector **MTCNN** (cascata de CNNs). Bom em escala e pose variada; faz também *landmark detection* para alinhamento.
- **ArcFace/InsightFace** → detector **SCRFD** (embutido no `buffalo_l`). Estado da arte em recall, lida bem com multidão e rostos pequenos.

**Decisão:** não unificar o detector. Como o objetivo é **comparar modelos de ponta a ponta**, cada pipeline deve rodar com o detector com que foi treinado/otimizado. Forçar um detector único introduziria viés e mascararia diferenças reais de desempenho.

**Alinhamento facial:** MTCNN e SCRFD alinham o rosto (rotacionam/recortam por landmarks) antes do embedding. Isso reduz variância por pose e melhora a qualidade do vetor — é uma das razões pelas quais FaceNet/ArcFace tendem a superar o baseline HOG em cenários difíceis.

---

## 4. Estágio 2 — Embeddings (os 3 modelos)

Um **embedding** mapeia o rosto para `R^d` de modo que **mesma pessoa → vetores próximos** e **pessoas diferentes → vetores distantes**. Treinados com perdas metric-learning (triplet / ArcFace margin) que otimizam diretamente essa propriedade geométrica.

| # | Modelo | Backbone / treino | Dim | Métrica natural | Threshold default |
|---|---|---|---|---|---|
| 1 | **face_recognition** | dlib ResNet-29 (triplet) | 128 | Euclidiana | `0.60` |
| 2 | **FaceNet** | InceptionResnetV1, VGGFace2 | 512 | Cosseno | `0.40` |
| 3 | **ArcFace** | buffalo_l (SCRFD+ArcFace) | 512 | Cosseno | `0.45` |

### Por que 3 modelos e não 1?
1. **Avaliação honesta:** cada modelo erra de forma diferente (viés por etnia, idade, iluminação, pose). Rodar os três no mesmo dataset permite **medir** qual generaliza melhor para *o seu* domínio, em vez de confiar em benchmarks públicos (LFW, etc.) que podem não refletir seu cenário.
2. **Trade-off explícito:** o modelo "certo" depende do caso de uso. Segurança (controle de acesso) prioriza **baixo falso positivo**; conveniência (marcação de fotos) tolera mais erro. Ter três candidatos torna o trade-off uma escolha baseada em dados.
3. **Ensemble por consenso:** com os três rodando, podemos exigir que **≥2 concordem** na mesma identidade — isso derruba drasticamente o falso positivo a um custo pequeno de recall. É uma alavanca que só existe com múltiplos modelos.

### Decisão sobre métrica de distância
- **face_recognition** usa **distância euclidiana** (foi treinado assim; thresholds da literatura giram em ~0.6).
- **FaceNet e ArcFace** usam **distância de cosseno** (`1 − cos θ`), porque foram treinados com objetivos angulares; a magnitude do vetor não carrega informação de identidade, só a **direção**. Normalizamos os vetores antes de comparar.

Usar a métrica errada para cada modelo degrada o desempenho — por isso a métrica é uma propriedade **do modelo**, não global.

---

## 5. Estágio 3 — Matching e decisão (open-set)

Para cada rosto de teste, em cada modelo:

1. Calcula-se a distância do embedding a **todas as fotos cadastradas** de cada pessoa.
2. Estratégia **min-distance**: a distância da pessoa = a **menor** distância entre suas fotos de referência. (Robusto a fotos de cadastro variadas; uma boa referência basta para reconhecer.)
3. Escolhe-se a pessoa mais próxima (`nearest neighbor`).
4. **Regra de rejeição:** se a menor distância `> threshold` → `desconhecido`. É isso que torna o sistema open-set.

**Por que min-distance e não a média/centróide?** Com poucas fotos por pessoa e alta variância (óculos, barba, iluminação), a média "borra" a identidade. O mínimo é mais tolerante a variação intra-classe. (Em produção com muitas fotos, um k-NN com k>1 ou centróide robusto pode ser preferível — fica como ponto de evolução.)

### O threshold é o hiperparâmetro crítico
- **Baixo demais** → exige proximidade altíssima → muitos **falsos negativos** (não reconhece quem é cadastrado).
- **Alto demais** → aceita qualquer rosto parecido → muitos **falsos positivos** (confunde desconhecido com cadastrado).

Cada modelo tem **escala própria**, por isso cada um tem seu threshold. Eles estão expostos como configuração (`THRESHOLDS`) justamente para **calibração com dados reais** (ver §8).

---

## 6. Cadastro de pessoas (`cadastrar_pessoas`)

**Entrada:** estrutura de pastas `cadastro/<NOME>/*.jpg` (uma subpasta por pessoa).

**Decisões:**
- **Múltiplas fotos por pessoa** são incentivadas — cada foto vira uma linha na matriz de embeddings da pessoa, capturando ângulos/luz diferentes → matching mais robusto.
- A galeria é **por modelo**: `galeria[modelo][pessoa] = matriz (n_fotos × d)`. Os três espaços vetoriais são incompatíveis entre si (vetores de modelos diferentes **não** se comparam), então são mantidos separados.
- **Sem re-treino:** cadastrar/remover pessoa = adicionar/remover vetores. Custo O(1) operacional, propriedade desejável do approach baseado em verificação.

**Trade-off de escala:** matching é busca linear na galeria (O(N_pessoas × N_fotos)). Suficiente para dezenas/centenas de pessoas. Para milhares+, trocar por **índice vetorial** (FAISS / HNSW / banco vetorial) — é exatamente o "banco vetorial" previsto na arquitetura conceitual do produto.

---

## 7. Análise e relatório (`analisar`)

**Entrada:** pasta com **fotos e vídeos** misturados.

**Vídeo → frames:** vídeos são amostrados (`VIDEO_FRAME_STEP`, ex. 1 frame a cada 15 ≈ 2 fps em vídeo de 30 fps).
- **Por quê?** Processar 30 fps é redundante (frames adjacentes quase idênticos) e caro. Amostrar reduz custo ~15× com perda mínima de informação. O passo é configurável conforme o trade-off custo × granularidade temporal.

**Saída — relatório:** uma linha por **(rosto detectado × modelo)** com:
`arquivo, tipo (foto/vídeo), frame, rosto_idx, modelo, métrica, pessoa_identificada, distancia, threshold, eh_conhecido`.

**Decisão de granularidade:** registrar no nível mais fino (rosto×modelo) em vez de já agregar. Dados crus permitem **qualquer** análise posterior (por modelo, por pessoa, consenso, curva ROC) sem reprocessar os vídeos. Agregações (resumo por pessoa/modelo) são derivadas em cima disso.

O CSV é salvo em `utf-8-sig` (compatível com Excel/PT-BR) e baixado automaticamente no Colab.

---

## 8. Avaliação (o próximo passo metodológico)

O sistema foi construído **para ser medido**. Com um conjunto de teste rotulado (verdade conhecida de quem é quem, incluindo impostores fora da galeria):

**Métricas (open-set):**
- **FAR (False Acceptance Rate):** % de desconhecidos aceitos como cadastrados → risco de segurança.
- **FRR / FNMR (False Rejection Rate):** % de cadastrados não reconhecidos → atrito de usabilidade.
- **Acurácia / F1** na identificação correta da pessoa certa.
- **TAR @ fixed FAR:** taxa de acerto a um falso-positivo fixo (métrica padrão da indústria).

**Protocolo recomendado:**
1. Rodar os 3 modelos no mesmo conjunto de teste (já é a saída do `analisar`).
2. Comparar `pessoa_identificada` vs rótulo verdadeiro.
3. Varrer o threshold de cada modelo → traçar **curva ROC / DET** por modelo.
4. Escolher o ponto de operação pelo trade-off do caso de uso (ex.: FAR ≤ 0.1%).
5. Avaliar **ensemble por consenso (≥2 modelos)** vs melhor modelo isolado.
6. **Slice analysis:** medir por subgrupos (iluminação, pose, demografia) para detectar viés — etapa de fairness frequentemente ignorada e crítica em reconhecimento facial.

**Anti-vazamento:** fotos de cadastro e de teste devem ser **disjuntas** (mesma pessoa, imagens diferentes). Caso contrário as métricas ficam otimistas e inúteis.

---

## 9. Decisões-chave (resumo executivo)

| Decisão | Alternativa descartada | Justificativa |
|---|---|---|
| Verificação por embedding + threshold | Classificador softmax N-classes | Suporta open-set e cadastro sem re-treino |
| 3 modelos em paralelo | 1 modelo "melhor" do paper | Comparação empírica no domínio real + ensemble |
| Detector nativo de cada modelo | Detector único global | Evita viés; mede pipeline ponta a ponta |
| Métrica por modelo (eucl./cosseno) | Métrica global | Cada embedding tem geometria própria |
| Min-distance no matching | Centróide/média | Robusto a alta variância intra-classe com poucas fotos |
| Amostragem de frames em vídeo | Todos os frames | ~15× menos custo, perda mínima |
| Relatório no nível rosto×modelo | Agregado direto | Permite qualquer análise posterior sem reprocessar |
| Threshold exposto/configurável | Threshold fixo no código | Calibração baseada em dados é obrigatória |

---

## 10. Limitações e evolução

- **Escala:** busca linear na galeria → migrar para índice vetorial (FAISS/HNSW) acima de ~1k identidades.
- **Robustez:** sem **anti-spoofing / liveness** — uma foto da pessoa engana o sistema. Essencial antes de uso em controle de acesso real.
- **Tracking em vídeo:** hoje cada frame é independente. Adicionar *face tracking* (associar o mesmo rosto entre frames) daria identidade por pessoa-na-cena e suavizaria decisões por votação temporal.
- **Qualidade de cadastro:** garantir fotos nítidas, frontais e variadas; filtrar automaticamente cadastros de baixa qualidade (blur/score do detector).
- **Calibração:** os thresholds default vêm da literatura; **devem** ser recalibrados no dataset alvo (§8).
- **Fairness & compliance:** medir viés por subgrupo e tratar dados biométricos conforme LGPD (base legal, consentimento, retenção, finalidade).

---

*Implementação de referência: `public/visionguard_reconhecimento_facial.py` (Colab-ready, célula única, com `cadastrar_pessoas()` e `analisar()`).*
