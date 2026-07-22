import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  analyzeLiveFrame,
  compareDescriptors,
  describeChallenge,
  describeQualityIssue,
  detectFace,
  evaluateChallenge,
  loadFaceMatchModels,
  pickRandomChallenge,
  type FaceMatchResult,
  type FaceQualityIssue,
  type LiveFrameAnalysis,
  type LivenessChallenge,
} from "@/lib/face-match-live";

type Phase = "idle" | "loading_models" | "ready";
type LivenessStatus = "idle" | "hold_still" | "waiting_challenge" | "checking" | "failed";

interface SideIssue {
  side: "reference" | "capture";
  issue: FaceQualityIssue;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function captureFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
}

export function FaceMatchDemo() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [loadError, setLoadError] = useState<string | null>(null);

  const [referenceUrl, setReferenceUrl] = useState<string | null>(null);
  const [referenceReady, setReferenceReady] = useState(false);
  const referenceImgRef = useRef<HTMLImageElement>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [captured, setCaptured] = useState(false);
  const [capturedAnalysis, setCapturedAnalysis] = useState<LiveFrameAnalysis | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [livenessStatus, setLivenessStatus] = useState<LivenessStatus>("idle");
  const [currentChallenge, setCurrentChallenge] = useState<LivenessChallenge | null>(null);
  const [livenessMessage, setLivenessMessage] = useState<string | null>(null);

  const [comparing, setComparing] = useState(false);
  const [sideIssue, setSideIssue] = useState<SideIssue | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [result, setResult] = useState<FaceMatchResult | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function handleStart() {
    setPhase("loading_models");
    setLoadError(null);
    try {
      await loadFaceMatchModels();
      setPhase("ready");
    } catch {
      setLoadError("Não foi possível carregar os modelos (rede instável?). Tente de novo.");
      setPhase("idle");
    }
  }

  function handleReferenceChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (referenceUrl) URL.revokeObjectURL(referenceUrl);
    setReferenceReady(false);
    setResult(null);
    setSideIssue(null);
    setReferenceUrl(URL.createObjectURL(file));
  }

  async function handleActivateCamera() {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraActive(true);
      setCaptured(false);
    } catch {
      setCameraError("Acesso à câmera negado ou indisponível neste dispositivo.");
    }
  }

  function handleStopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraActive(false);
    setCaptured(false);
    setLivenessStatus("idle");
  }

  /**
   * Prova de vivacidade por desafio de movimento — motivada por um teste
   * real desta demo em que uma FOTO estática, aproximada da câmera, foi
   * aprovada como "mesma pessoa". Detecta um quadro-base (neutro), pede uma
   * ação aleatória (sorrir, abrir a boca, virar o rosto), captura um
   * segundo quadro e só aceita a captura se a mudança observada bater com
   * o que foi pedido — uma foto ou um vídeo em loop não reage sob comando.
   */
  async function handleVerifyAndCapture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    setResult(null);
    setSideIssue(null);
    setCompareError(null);
    setLivenessMessage(null);
    setLivenessStatus("hold_still");

    const baselineCanvas = document.createElement("canvas");
    captureFrame(video, baselineCanvas);
    const baselineOutcome = await analyzeLiveFrame(baselineCanvas);

    if (baselineOutcome.qualityIssue) {
      setLivenessMessage(describeQualityIssue(baselineOutcome.qualityIssue));
      setLivenessStatus("failed");
      return;
    }

    const challenge = pickRandomChallenge();
    setCurrentChallenge(challenge);
    setLivenessStatus("waiting_challenge");

    await wait(2500);

    captureFrame(video, canvas);
    setLivenessStatus("checking");
    const attemptOutcome = await analyzeLiveFrame(canvas);

    if (attemptOutcome.qualityIssue) {
      setLivenessMessage(describeQualityIssue(attemptOutcome.qualityIssue));
      setLivenessStatus("failed");
      setCurrentChallenge(null);
      return;
    }

    const passed = evaluateChallenge(challenge, baselineOutcome.analysis.metrics, attemptOutcome.analysis.metrics);

    if (!passed) {
      setLivenessMessage("Não conseguimos confirmar que é uma pessoa ao vivo. Tente de novo.");
      setLivenessStatus("failed");
      setCurrentChallenge(null);
      return;
    }

    setCapturedAnalysis(attemptOutcome.analysis);
    setCaptured(true);
    setLivenessStatus("idle");
    setCurrentChallenge(null);
  }

  function handleRetake() {
    setCaptured(false);
    setCapturedAnalysis(null);
    setResult(null);
    setSideIssue(null);
    setLivenessStatus("idle");
    setLivenessMessage(null);
    setCurrentChallenge(null);
  }

  async function handleCompare() {
    if (!referenceImgRef.current || !capturedAnalysis) return;

    setComparing(true);
    setResult(null);
    setSideIssue(null);
    setCompareError(null);

    try {
      const referenceOutcome = await detectFace(referenceImgRef.current);

      if (referenceOutcome.qualityIssue) {
        setSideIssue({ side: "reference", issue: referenceOutcome.qualityIssue });
        return;
      }

      setResult(compareDescriptors(referenceOutcome.descriptor, capturedAnalysis.descriptor));
    } catch {
      setCompareError("Não foi possível analisar as imagens. Tente tirar a foto de novo.");
    } finally {
      setComparing(false);
    }
  }

  const verifyingLiveness = livenessStatus !== "idle" && livenessStatus !== "failed";
  const canCompare = referenceReady && captured && !comparing;

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="mb-1 font-mono text-xs uppercase tracking-widest text-primary">Demo ao vivo</p>
      <h3 className="mb-3 text-lg font-semibold text-foreground">
        Reconhecimento facial rodando no seu navegador, agora
      </h3>

      {phase === "idle" && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-sm text-muted-foreground">
            Envie uma foto de referência e tire outra pela câmera — o mesmo pipeline de 3 estágios
            (detecção → landmarks → descritor) documentado no showcase roda aqui de verdade, 100%
            no seu navegador. A captura ao vivo passa por um desafio de vivacidade (sorrir, abrir a
            boca ou virar o rosto, escolhido ao acaso) antes de ser aceita — uma foto estática não
            reage sob comando. Nenhuma imagem é enviada a um servidor. Isso baixa ~7 MB de modelos
            na primeira vez.
          </p>
          <button
            onClick={handleStart}
            className="mt-3 rounded-md bg-foreground px-4 py-2 font-mono text-sm text-background transition-opacity hover:opacity-90"
          >
            Iniciar demonstração
          </button>
          {loadError && <p className="mt-2 text-sm text-negative">{loadError}</p>}
        </div>
      )}

      {phase === "loading_models" && (
        <p className="text-sm text-muted-foreground">Carregando modelos (~7 MB)…</p>
      )}

      {phase === "ready" && (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Referência */}
            <div className="rounded-lg border border-border p-3">
              <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Foto de referência
              </p>
              <div className="mb-2 flex aspect-square items-center justify-center overflow-hidden rounded-md border border-dashed border-border bg-surface">
                {referenceUrl ? (
                  <img
                    ref={referenceImgRef}
                    src={referenceUrl}
                    alt="Referência"
                    onLoad={() => setReferenceReady(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="p-4 text-center text-xs text-muted-foreground">
                    Nenhuma foto selecionada
                  </span>
                )}
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={handleReferenceChange}
                className="w-full text-xs text-muted-foreground file:mr-2 file:rounded-md file:border file:border-border file:bg-secondary file:px-2 file:py-1 file:text-xs file:text-secondary-foreground"
              />
            </div>

            {/* Câmera */}
            <div className="rounded-lg border border-border p-3">
              <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Captura ao vivo
              </p>
              <div className="relative mb-2 aspect-square overflow-hidden rounded-md border border-dashed border-border bg-surface">
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className={`h-full w-full object-cover ${cameraActive && !captured ? "" : "hidden"}`}
                />
                <canvas
                  ref={canvasRef}
                  className={`h-full w-full object-cover ${captured ? "" : "hidden"}`}
                />
                {!cameraActive && (
                  <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
                    Câmera desativada
                  </div>
                )}
                {verifyingLiveness && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/80 p-4 text-center">
                    <p className="font-mono text-sm font-semibold text-foreground">
                      {livenessStatus === "hold_still" && "Fique parado(a) um instante…"}
                      {livenessStatus === "waiting_challenge" &&
                        currentChallenge &&
                        `Agora: ${describeChallenge(currentChallenge)}`}
                      {livenessStatus === "checking" && "Verificando…"}
                    </p>
                  </div>
                )}
              </div>

              {!cameraActive && (
                <button
                  onClick={handleActivateCamera}
                  className="w-full rounded-md border border-border px-3 py-1.5 font-mono text-xs text-foreground transition-colors hover:bg-secondary"
                >
                  Ativar câmera
                </button>
              )}
              {cameraActive && !captured && (
                <button
                  onClick={handleVerifyAndCapture}
                  disabled={verifyingLiveness}
                  className="w-full rounded-md bg-foreground px-3 py-1.5 font-mono text-xs text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {verifyingLiveness ? "Verificando vivacidade…" : "Verificar e tirar foto"}
                </button>
              )}
              {cameraActive && captured && (
                <div className="flex gap-2">
                  <button
                    onClick={handleRetake}
                    className="flex-1 rounded-md border border-border px-3 py-1.5 font-mono text-xs text-foreground transition-colors hover:bg-secondary"
                  >
                    Tirar outra
                  </button>
                  <button
                    onClick={handleStopCamera}
                    className="flex-1 rounded-md border border-border px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-secondary"
                  >
                    Desativar câmera
                  </button>
                </div>
              )}
              {cameraError && <p className="mt-2 text-xs text-negative">{cameraError}</p>}
              {livenessStatus === "failed" && livenessMessage && (
                <p className="mt-2 text-xs text-negative">{livenessMessage}</p>
              )}
              {captured && (
                <p className="mt-2 text-xs text-positive">✓ Vivacidade confirmada</p>
              )}
            </div>
          </div>

          <button
            onClick={handleCompare}
            disabled={!canCompare}
            className="rounded-md bg-foreground px-4 py-2 font-mono text-sm text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {comparing ? "Comparando…" : "Comparar"}
          </button>

          {compareError && <p className="text-sm text-negative">{compareError}</p>}

          {sideIssue && (
            <p className="text-sm text-negative">
              Na foto de referência: {describeQualityIssue(sideIssue.issue)}
            </p>
          )}

          {result && (
            <div
              className={`flex flex-wrap items-center justify-between gap-3 rounded-md border p-4 ${
                result.approved
                  ? "border-positive/30 bg-positive/10"
                  : "border-negative/30 bg-negative/10"
              }`}
            >
              <span
                className={`font-mono text-sm font-semibold ${result.approved ? "text-positive" : "text-negative"}`}
              >
                {result.approved ? "Aprovado — mesma pessoa" : "Reprovado — pessoas diferentes"}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                similaridade = <span className="font-semibold text-foreground">{result.similarity.toFixed(3)}</span>{" "}
                (limiar: 0.400 — distância euclidiana ≤ 0.6, padrão dlib/face-api.js)
              </span>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Processamento 100% local — nenhuma foto ou descritor facial sai do seu navegador.
          </p>
        </div>
      )}
    </div>
  );
}
