# =============================================================================
# VisionGuard AI — Reconhecimento Facial com 3 Modelos (Colab-ready)
# =============================================================================
# OBJETIVO
#   1) cadastrar_pessoas(...)  -> recebe FOTOS de pessoas conhecidas e cria
#                                 uma "galeria" de embeddings (assinaturas faciais).
#   2) analisar(...)           -> recebe FOTOS e VIDEOS, identifica se o rosto
#                                 pertence a alguém cadastrado e gera um RELATORIO.
#
# METODOLOGIA (visão de cientista de dados sênior)
#   - Reconhecimento facial = 3 etapas:
#       (a) DETECÇÃO   -> achar o rosto na imagem (bounding box)
#       (b) EMBEDDING  -> transformar o rosto num vetor numérico (assinatura)
#       (c) MATCHING   -> comparar o vetor com a galeria via distância
#                         (cosseno/euclidiana) e aplicar um THRESHOLD.
#
#   - Usamos 3 MODELOS DIFERENTES de embedding para depois COMPARAR resultados.
#     Cada modelo tem viés/erro distinto; rodar os três no mesmo dataset nos
#     permite escolher o melhor (ou fazer ensemble) com base em métricas reais.
#
#       MODELO 1: face_recognition (dlib ResNet-29, 128-d)
#                 -> simples, robusto, ótimo baseline. Distância euclidiana.
#       MODELO 2: FaceNet (facenet-pytorch, InceptionResnetV1 VGGFace2, 512-d)
#                 -> embeddings muito usados academicamente. Distância cosseno.
#       MODELO 3: InsightFace / ArcFace (buffalo_l, 512-d)
#                 -> estado da arte em produção. Distância cosseno.
#
#   - Por que 3 e não 1? Para AVALIAR. Depois rodamos o mesmo conjunto de teste
#     nos três e medimos: acurácia, falso positivo (FAR) e falso negativo (FRR).
#     O modelo certo depende do trade-off do caso de uso (segurança x conveniência).
#
#   - THRESHOLD é o parâmetro crítico: baixo demais => mais falsos positivos;
#     alto demais => mais falsos negativos. Cada modelo tem escala própria,
#     por isso cada um tem seu threshold default (calibrável depois).
#
# COMO USAR (Google Colab)
#   1) Cole TUDO numa única célula e rode (Runtime > Run all).
#   2) Faça upload das fotos de cadastro em pastas: /content/cadastro/<NOME>/*.jpg
#      (uma subpasta por pessoa; pode ter várias fotos por pessoa = mais robusto).
#   3) Faça upload do material a analisar em: /content/analisar/  (fotos e vídeos).
#   4) Rode:  galeria = cadastrar_pessoas("/content/cadastro")
#             relatorio = analisar("/content/analisar", galeria)
#   5) Saída: relatorio CSV em /content/visionguard_relatorio.csv (+ download).
# =============================================================================

# ----------------------------------------------------------------------------
# 0) INSTALAÇÃO DE DEPENDÊNCIAS
#    (rode só uma vez por sessão; no Colab pode levar alguns minutos)
# ----------------------------------------------------------------------------
import sys, subprocess

def _pip(*pkgs):
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", *pkgs], check=False)

# dlib/face_recognition (MODELO 1)
_pip("face_recognition")
# FaceNet (MODELO 2)
_pip("facenet-pytorch")
# InsightFace / ArcFace (MODELO 3) + onnxruntime (inferência dos modelos .onnx)
_pip("insightface", "onnxruntime")
# Utilitários
_pip("opencv-python-headless", "numpy", "pandas", "scikit-learn", "tqdm")

# ----------------------------------------------------------------------------
# 1) IMPORTS
# ----------------------------------------------------------------------------
import os
import glob
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional

import cv2
import numpy as np
import pandas as pd
from tqdm import tqdm

# ----------------------------------------------------------------------------
# 2) CONFIGURAÇÃO GLOBAL
# ----------------------------------------------------------------------------
# Extensões aceitas
EXT_IMAGENS = (".jpg", ".jpeg", ".png", ".bmp", ".webp")
EXT_VIDEOS  = (".mp4", ".mov", ".avi", ".mkv", ".webm")

# Em vídeos, analisamos 1 frame a cada N (para não processar 30 fps inteiros).
# Ex.: VIDEO_FRAME_STEP=15 ~ analisa ~2 frames/seg num vídeo de 30fps.
VIDEO_FRAME_STEP = 15

# Thresholds default por modelo (CALIBRÁVEIS depois com dados de teste).
#  - face_recognition: distância EUCLIDIANA; <= 0.6 costuma ser "match".
#  - facenet / arcface: distância COSSENO; quanto MENOR, mais parecido.
THRESHOLDS = {
    "face_recognition": 0.60,   # euclidiana
    "facenet":          0.40,   # cosseno
    "arcface":          0.45,   # cosseno
}

ARQ_RELATORIO = "/content/visionguard_relatorio.csv"

# ----------------------------------------------------------------------------
# 3) MÉTRICAS DE DISTÂNCIA
# ----------------------------------------------------------------------------
def dist_euclidiana(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.linalg.norm(a - b))

def dist_cosseno(a: np.ndarray, b: np.ndarray) -> float:
    # distância = 1 - similaridade do cosseno  (0 = idênticos)
    a = a / (np.linalg.norm(a) + 1e-10)
    b = b / (np.linalg.norm(b) + 1e-10)
    return float(1.0 - np.dot(a, b))

# ----------------------------------------------------------------------------
# 4) WRAPPERS DOS 3 MODELOS DE EMBEDDING
#    Cada wrapper expõe a MESMA interface: .embeddings(imagem_bgr) -> List[vec]
#    Assim o restante do código não precisa saber qual modelo está rodando.
# ----------------------------------------------------------------------------

class ModeloFaceRecognition:
    """MODELO 1 — dlib ResNet (128-d). Detecção HOG + embedding. Distância euclidiana."""
    nome = "face_recognition"
    metrica = "euclidiana"

    def __init__(self):
        import face_recognition
        self._fr = face_recognition

    def embeddings(self, img_bgr: np.ndarray) -> List[np.ndarray]:
        # face_recognition trabalha em RGB
        rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        boxes = self._fr.face_locations(rgb, model="hog")
        if not boxes:
            return []
        encs = self._fr.face_encodings(rgb, boxes)
        return [np.asarray(e, dtype=np.float32) for e in encs]


class ModeloFaceNet:
    """MODELO 2 — FaceNet (InceptionResnetV1, VGGFace2, 512-d). MTCNN p/ detecção. Cosseno."""
    nome = "facenet"
    metrica = "cosseno"

    def __init__(self):
        import torch
        from facenet_pytorch import MTCNN, InceptionResnetV1
        self._torch = torch
        self._device = "cuda" if torch.cuda.is_available() else "cpu"
        # keep_all=True -> detecta múltiplos rostos por imagem
        self._mtcnn = MTCNN(keep_all=True, device=self._device)
        self._net = InceptionResnetV1(pretrained="vggface2").eval().to(self._device)

    def embeddings(self, img_bgr: np.ndarray) -> List[np.ndarray]:
        rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        faces = self._mtcnn(rgb)  # tensor [n,3,160,160] ou None
        if faces is None:
            return []
        if faces.ndim == 3:
            faces = faces.unsqueeze(0)
        with self._torch.no_grad():
            vecs = self._net(faces.to(self._device)).cpu().numpy()
        return [np.asarray(v, dtype=np.float32) for v in vecs]


class ModeloArcFace:
    """MODELO 3 — InsightFace ArcFace (buffalo_l, 512-d). Detecção SCRFD embutida. Cosseno."""
    nome = "arcface"
    metrica = "cosseno"

    def __init__(self):
        from insightface.app import FaceAnalysis
        self._app = FaceAnalysis(name="buffalo_l")
        # ctx_id=0 usa GPU se disponível; -1 força CPU
        self._app.prepare(ctx_id=0, det_size=(640, 640))

    def embeddings(self, img_bgr: np.ndarray) -> List[np.ndarray]:
        faces = self._app.get(img_bgr)  # InsightFace já espera BGR
        return [np.asarray(f.embedding, dtype=np.float32) for f in faces]


def carregar_modelos() -> List[object]:
    """Tenta carregar os 3 modelos; se algum falhar, segue com os demais."""
    modelos = []
    for cls in (ModeloFaceRecognition, ModeloFaceNet, ModeloArcFace):
        try:
            print(f"  carregando modelo: {cls.nome} ...")
            modelos.append(cls())
        except Exception as e:
            print(f"  [aviso] modelo {cls.nome} indisponível: {e}")
    if not modelos:
        raise RuntimeError("Nenhum modelo de embedding pôde ser carregado.")
    return modelos

# ----------------------------------------------------------------------------
# 5) ESTRUTURA DA GALERIA
#    Para cada modelo guardamos: { pessoa -> matriz de embeddings (n_fotos x dim) }
# ----------------------------------------------------------------------------
@dataclass
class Galeria:
    # estrutura: galeria[modelo_nome][pessoa] = np.ndarray (n, dim)
    por_modelo: Dict[str, Dict[str, np.ndarray]] = field(default_factory=dict)
    modelos: List[object] = field(default_factory=list)

# ----------------------------------------------------------------------------
# 6) FUNÇÃO 1 — CADASTRO DE PESSOAS CONHECIDAS (recebe FOTOS)
# ----------------------------------------------------------------------------
def cadastrar_pessoas(pasta_cadastro: str, modelos: Optional[List[object]] = None) -> Galeria:
    """
    Lê /pasta_cadastro/<NOME_DA_PESSOA>/*.jpg e cria a galeria de embeddings.

    Estrutura esperada:
        cadastro/
          ├── Joao/   (foto1.jpg, foto2.jpg, ...)
          ├── Maria/  (foto1.jpg, ...)
          └── ...

    Várias fotos por pessoa = MELHOR (capturam ângulos/luz diferentes ->
    matching mais robusto). Cada modelo gera sua própria galeria.
    """
    if modelos is None:
        print("Carregando os 3 modelos...")
        modelos = carregar_modelos()

    galeria = Galeria(modelos=modelos)
    for m in modelos:
        galeria.por_modelo[m.nome] = {}

    pessoas = sorted(
        d for d in os.listdir(pasta_cadastro)
        if os.path.isdir(os.path.join(pasta_cadastro, d))
    )
    if not pessoas:
        raise RuntimeError(
            f"Nenhuma subpasta de pessoa encontrada em {pasta_cadastro}. "
            "Crie uma subpasta por pessoa com as fotos dentro."
        )

    print(f"\nCadastrando {len(pessoas)} pessoa(s)...")
    for pessoa in pessoas:
        arquivos = []
        for ext in EXT_IMAGENS:
            arquivos += glob.glob(os.path.join(pasta_cadastro, pessoa, f"*{ext}"))
        if not arquivos:
            print(f"  [aviso] {pessoa}: sem fotos válidas, ignorando.")
            continue

        # acumula embeddings por modelo
        buffers = {m.nome: [] for m in modelos}
        for arq in arquivos:
            img = cv2.imread(arq)
            if img is None:
                continue
            for m in modelos:
                embs = m.embeddings(img)
                # numa foto de cadastro esperamos 1 rosto; se houver vários,
                # usamos todos (caso a pessoa apareça mais de uma vez é raro).
                for e in embs:
                    buffers[m.nome].append(e)

        for m in modelos:
            if buffers[m.nome]:
                galeria.por_modelo[m.nome][pessoa] = np.vstack(buffers[m.nome])
        achou = {m.nome: len(buffers[m.nome]) for m in modelos}
        print(f"  {pessoa}: {len(arquivos)} foto(s) | rostos detectados por modelo -> {achou}")

    print("\nCadastro concluído.")
    return galeria

# ----------------------------------------------------------------------------
# 7) MATCHING — compara um embedding com a galeria de um modelo
# ----------------------------------------------------------------------------
def _melhor_match(emb: np.ndarray, galeria_modelo: Dict[str, np.ndarray],
                  metrica: str, threshold: float):
    """Retorna (pessoa, distancia, eh_match). Usa a MENOR distância entre todas
    as fotos cadastradas da pessoa (estratégia 'min distance')."""
    if not galeria_modelo:
        return ("desconhecido", float("inf"), False)

    fn = dist_euclidiana if metrica == "euclidiana" else dist_cosseno
    melhor_pessoa, melhor_dist = "desconhecido", float("inf")
    for pessoa, matriz in galeria_modelo.items():
        d = min(fn(emb, ref) for ref in matriz)
        if d < melhor_dist:
            melhor_pessoa, melhor_dist = pessoa, d

    eh_match = melhor_dist <= threshold
    return (melhor_pessoa if eh_match else "desconhecido", melhor_dist, eh_match)

# ----------------------------------------------------------------------------
# 8) FUNÇÃO 2 — ANÁLISE (recebe FOTOS e VÍDEOS) + RELATÓRIO
# ----------------------------------------------------------------------------
def _registrar_linha(linhas, arquivo, tipo, frame, n_rosto, galeria, embs):
    """Para cada rosto detectado, roda os 3 modelos e registra 1 linha por modelo."""
    for m in galeria.modelos:
        # embs vem pré-computado por modelo para reaproveitar detecção quando possível;
        # aqui cada modelo já forneceu sua própria lista de embeddings (ver loop chamador).
        pass  # placeholder não usado (mantido por clareza)

def analisar(pasta_analise: str, galeria: Galeria,
             thresholds: Dict[str, float] = THRESHOLDS,
             salvar_csv: str = ARQ_RELATORIO) -> pd.DataFrame:
    """
    Percorre fotos e vídeos em /pasta_analise, detecta rostos, gera embeddings
    com os 3 modelos e compara com a galeria. Produz um RELATÓRIO (DataFrame/CSV).

    Cada linha = 1 rosto detectado avaliado por 1 modelo, com:
       arquivo, tipo (foto/video), frame, rosto_idx, modelo, pessoa_identificada,
       distancia, threshold, eh_conhecido.
    """
    modelos = galeria.modelos
    arquivos = []
    for ext in EXT_IMAGENS + EXT_VIDEOS:
        arquivos += glob.glob(os.path.join(pasta_analise, f"*{ext}"))
    arquivos = sorted(arquivos)
    if not arquivos:
        raise RuntimeError(f"Nenhuma foto/vídeo encontrada em {pasta_analise}.")

    linhas = []

    def processar_frame(img, arquivo, tipo, frame_idx):
        for m in modelos:
            embs = m.embeddings(img)
            thr = thresholds.get(m.nome, 0.5)
            for i, e in enumerate(embs):
                pessoa, dist, eh_match = _melhor_match(
                    e, galeria.por_modelo.get(m.nome, {}), m.metrica, thr
                )
                linhas.append({
                    "arquivo": os.path.basename(arquivo),
                    "tipo": tipo,
                    "frame": frame_idx,
                    "rosto_idx": i,
                    "modelo": m.nome,
                    "metrica": m.metrica,
                    "pessoa_identificada": pessoa,
                    "distancia": round(dist, 4),
                    "threshold": thr,
                    "eh_conhecido": eh_match,
                })

    print(f"\nAnalisando {len(arquivos)} arquivo(s)...")
    for arq in tqdm(arquivos):
        ext = os.path.splitext(arq)[1].lower()

        if ext in EXT_IMAGENS:
            img = cv2.imread(arq)
            if img is None:
                continue
            processar_frame(img, arq, "foto", 0)

        elif ext in EXT_VIDEOS:
            cap = cv2.VideoCapture(arq)
            frame_idx = 0
            while True:
                ok, frame = cap.read()
                if not ok:
                    break
                if frame_idx % VIDEO_FRAME_STEP == 0:
                    processar_frame(frame, arq, "video", frame_idx)
                frame_idx += 1
            cap.release()

    df = pd.DataFrame(linhas)
    if df.empty:
        print("Nenhum rosto detectado no material analisado.")
        return df

    # ------------------------------------------------------------------
    # RESUMO EXECUTIVO (por arquivo): quem foi reconhecido e por quantos modelos.
    # 'consenso' = nº de modelos (de 3) que concordaram na MESMA pessoa por frame.
    # Em produção: exigir consenso >= 2 reduz drasticamente falso positivo.
    # ------------------------------------------------------------------
    df.to_csv(salvar_csv, index=False, encoding="utf-8-sig")
    print(f"\nRelatório detalhado salvo em: {salvar_csv}  ({len(df)} linhas)")

    print("\n===== RESUMO POR PESSOA / MODELO =====")
    resumo = (
        df[df["eh_conhecido"]]
        .groupby(["pessoa_identificada", "modelo"])
        .size()
        .reset_index(name="deteccoes")
        .sort_values(["pessoa_identificada", "modelo"])
    )
    print(resumo.to_string(index=False) if not resumo.empty else "  (ninguém reconhecido)")

    # Download automático no Colab
    try:
        from google.colab import files  # type: ignore
        files.download(salvar_csv)
    except Exception:
        pass

    return df

# ----------------------------------------------------------------------------
# 9) EXECUÇÃO DE EXEMPLO (descomente após subir suas fotos/vídeos)
# ----------------------------------------------------------------------------
# galeria   = cadastrar_pessoas("/content/cadastro")
# relatorio = analisar("/content/analisar", galeria)
# relatorio.head()
#
# DICA DE AVALIAÇÃO (próximo passo, com dados de teste rotulados):
#   - Monte um conjunto de teste com rótulo verdadeiro (quem é quem).
#   - Compare 'pessoa_identificada' vs rótulo para cada modelo.
#   - Calcule: acurácia, FAR (falso positivo) e FRR (falso negativo).
#   - Varie os THRESHOLDS e trace a curva ROC por modelo para escolher o ponto.
# =============================================================================
