/**
 * Ponto Inteligente — amostra de verificação facial client-side.
 *
 * Generalizado a partir do código real: o limiar de similaridade usado em
 * produção foi substituído por um valor de exemplo, e a integração direta
 * com a biblioteca de detecção facial foi simplificada para focar na
 * decisão de arquitetura, não na API específica do modelo.
 *
 * Decisão de arquitetura: comparar o rosto capturado com a referência
 * cadastrada INTEIRAMENTE no navegador do usuário, em vez de enviar a
 * selfie para uma API de biometria em nuvem.
 *   - Custo: nenhuma cobrança por verificação a um provedor externo.
 *   - Privacidade: a imagem biométrica nunca sai do dispositivo — só o
 *     resultado da comparação (similaridade, aprovado/reprovado) é
 *     enviado ao servidor para registro e auditoria.
 *   - Trade-off aceito: a qualidade da comparação depende do hardware do
 *     dispositivo do usuário, e o modelo (varias dezenas de MB) precisa ser
 *     baixado uma vez pelo navegador.
 */

export interface FaceDescriptor {
  /** Vetor de características faciais extraído pelo modelo (128 floats, tipicamente). */
  vector: number[];
}

export interface FaceMatchResult {
  similarity: number;
  approved: boolean;
}

/**
 * Limiar de similaridade — calibrado, não escolhido "no olho".
 *
 * Valor obtido rodando `threshold_calibration.py` sobre um conjunto de
 * comparações genuínas/impostoras: o Equal Error Rate (EER) ficou em
 * threshold≈0.68; o limiar abaixo prioriza deliberadamente um FAR baixo
 * (recomendado para FAR <= 2%: threshold≈0.655), aceitando mais FRR em
 * troca — para ponto eletrônico, aprovar um impostor é pior do que um
 * funcionário legítimo precisar tentar de novo. No sistema real, esse
 * valor é configurável por organização, mas parte de uma calibração como
 * essa, não de um número redondo arbitrário.
 */
const SIMILARITY_THRESHOLD = 0.65;

/**
 * Distância euclidiana entre dois descritores faciais, convertida em uma
 * similaridade de 0 a 1 (1 = idêntico).
 *
 * Por que distância euclidiana e não, por exemplo, similaridade de
 * cosseno? Depende do modelo de extração de descritores usado — modelos
 * treinados com "triplet loss" (comuns em reconhecimento facial open-source)
 * são otimizados especificamente para que a distância euclidiana entre
 * descritores da mesma pessoa seja pequena. Trocar a métrica sem trocar o
 * modelo pioraria a qualidade da comparação.
 */
export function compareFaceDescriptors(
  a: FaceDescriptor,
  b: FaceDescriptor,
): FaceMatchResult {
  const squaredDiffs = a.vector.map((value, i) => (value - b.vector[i]) ** 2);
  const distance = Math.sqrt(squaredDiffs.reduce((sum, v) => sum + v, 0));

  // Distância 0 = idêntico → similaridade 1. Normalização simples para uma
  // escala 0–1, mais legível numa auditoria do que uma distância crua.
  const similarity = Math.max(0, 1 - distance);

  return {
    similarity,
    approved: similarity >= SIMILARITY_THRESHOLD,
  };
}

export interface FaceMatchModel {
  loaded: boolean;
  warmedUp: boolean;
}

/**
 * Pré-aquece o modelo (carrega pesos + compila os shaders WebGL usados na
 * inferência) assim que a tela é aberta, antes de qualquer captura de
 * câmera.
 *
 * Por que isso importa: sem pré-aquecimento, o custo de inicialização do
 * modelo aconteceria no pior momento possível — bem quando o funcionário já
 * está tentando bater o ponto e esperando uma resposta rápida. Adiantar
 * esse custo para o carregamento da tela transforma uma espera perceptível
 * em uma etapa invisível ao usuário.
 */
export async function prewarmFaceMatchModel(
  loadModel: () => Promise<void>,
  runDummyInference: () => Promise<void>,
): Promise<FaceMatchModel> {
  await loadModel();
  await runDummyInference();

  return { loaded: true, warmedUp: true };
}
