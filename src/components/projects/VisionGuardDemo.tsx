import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import {
  Loader2,
  UserPlus,
  Upload,
  Trash2,
  CheckCircle2,
  HelpCircle,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// =============================================================================
// VisionGuard — Demo ao vivo (reconhecimento facial real no navegador)
// Usa @vladmandic/face-api (SSD MobileNet + Landmarks 68 + ResNet-34 embedding)
// rodando 100% client-side. Pesos carregados via CDN.
// =============================================================================

const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model";

// Distância euclidiana entre embeddings de 128-d. <= THRESHOLD => "conhecido".
const THRESHOLD = 0.55;

// Frames amostrados por vídeo (1 a cada ~N seg, limitado para resposta rápida).
const MAX_VIDEO_FRAMES = 12;

type KnownPerson = {
  id: string;
  name: string;
  descriptors: Float32Array[];
  photoUrl: string;
  photos: number;
};

type DetectedFace = {
  thumbnail: string;
  name: string;
  known: boolean;
  distance: number;
  similarity: number;
  frameTime?: number;
};

type AnalysisResult = {
  fileName: string;
  type: "foto" | "vídeo";
  faces: DetectedFace[];
};

// Benchmark de acurácia (LFW) — referência pública dos modelos do pipeline.
const MODEL_BENCH = [
  { modelo: "dlib ResNet-29", acc: 99.38, live: false, dim: "128-d", metrica: "Euclidiana" },
  { modelo: "face-api ResNet-34", acc: 99.38, live: true, dim: "128-d", metrica: "Euclidiana" },
  { modelo: "FaceNet (VGGFace2)", acc: 99.63, live: false, dim: "512-d", metrica: "Cosseno" },
  { modelo: "ArcFace (buffalo_l)", acc: 99.83, live: false, dim: "512-d", metrica: "Cosseno" },
];

export function VisionGuardDemo() {
  const faceapiRef = useRef<typeof import("@vladmandic/face-api") | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [progressTxt, setProgressTxt] = useState("Carregando modelos de IA...");
  const [busy, setBusy] = useState(false);

  const [people, setPeople] = useState<KnownPerson[]>([]);
  const [results, setResults] = useState<AnalysisResult[]>([]);

  // Diálogo de cadastro
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [cadastrando, setCadastrando] = useState(false);
  const [cadastroErro, setCadastroErro] = useState("");

  const analyzeInputRef = useRef<HTMLInputElement>(null);

  // ---- Carregamento dos modelos (somente no cliente) -----------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const faceapi = await import("@vladmandic/face-api");
        if (cancelled) return;
        faceapiRef.current = faceapi;
        setProgressTxt("Detector facial (SSD MobileNet)...");
        await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
        setProgressTxt("Pontos faciais (68 landmarks)...");
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
        setProgressTxt("Embeddings faciais (ResNet-34)...");
        await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
        if (cancelled) return;
        setStatus("ready");
      } catch (e) {
        console.error(e);
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Utilitários ---------------------------------------------------------
  const fileToImage = (file: File): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });

  const cropFace = useCallback(
    (source: CanvasImageSource, box: { x: number; y: number; width: number; height: number }) => {
      const pad = 0.2;
      const px = box.width * pad;
      const py = box.height * pad;
      const c = document.createElement("canvas");
      const w = box.width + px * 2;
      const h = box.height + py * 2;
      c.width = 112;
      c.height = 112;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(source, Math.max(0, box.x - px), Math.max(0, box.y - py), w, h, 0, 0, 112, 112);
      return c.toDataURL("image/jpeg", 0.8);
    },
    [],
  );

  const matchDescriptor = useCallback(
    (descriptor: Float32Array): { name: string; distance: number; known: boolean } => {
      const faceapi = faceapiRef.current!;
      let bestName = "Desconhecido";
      let bestDist = Infinity;
      for (const p of people) {
        for (const ref of p.descriptors) {
          const d = faceapi.euclideanDistance(descriptor, ref);
          if (d < bestDist) {
            bestDist = d;
            bestName = p.name;
          }
        }
      }
      const known = bestDist <= THRESHOLD;
      return { name: known ? bestName : "Desconhecido", distance: bestDist, known };
    },
    [people],
  );

  // ---- Cadastro de pessoa conhecida ---------------------------------------
  const handleCadastrar = async () => {
    const faceapi = faceapiRef.current;
    if (!faceapi) return;
    if (!newName.trim()) {
      setCadastroErro("Informe o nome da pessoa.");
      return;
    }
    if (newFiles.length === 0) {
      setCadastroErro("Selecione ao menos uma foto.");
      return;
    }
    setCadastrando(true);
    setCadastroErro("");
    try {
      const descriptors: Float32Array[] = [];
      let thumb = "";
      for (const file of newFiles) {
        const img = await fileToImage(file);
        const dets = await faceapi
          .detectAllFaces(img)
          .withFaceLandmarks()
          .withFaceDescriptors();
        if (dets[0]) {
          descriptors.push(dets[0].descriptor);
          if (!thumb) thumb = cropFace(img, dets[0].detection.box);
        }
      }
      if (descriptors.length === 0) {
        setCadastroErro("Nenhum rosto detectado nas fotos enviadas. Tente fotos mais nítidas e frontais.");
        setCadastrando(false);
        return;
      }
      setPeople((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          name: newName.trim(),
          descriptors,
          photoUrl: thumb,
          photos: descriptors.length,
        },
      ]);
      setNewName("");
      setNewFiles([]);
      setDialogOpen(false);
    } catch (e) {
      console.error(e);
      setCadastroErro("Erro ao processar as fotos.");
    } finally {
      setCadastrando(false);
    }
  };

  // ---- Análise de imagens e vídeos ----------------------------------------
  const analyzeImage = async (file: File): Promise<AnalysisResult> => {
    const faceapi = faceapiRef.current!;
    const img = await fileToImage(file);
    const dets = await faceapi.detectAllFaces(img).withFaceLandmarks().withFaceDescriptors();
    const faces: DetectedFace[] = dets.map((d) => {
      const m = matchDescriptor(d.descriptor);
      return {
        thumbnail: cropFace(img, d.detection.box),
        name: m.name,
        known: m.known,
        distance: m.distance,
        similarity: Math.max(0, Math.round((1 - m.distance) * 100)),
      };
    });
    return { fileName: file.name, type: "foto", faces };
  };

  const analyzeVideo = async (file: File): Promise<AnalysisResult> => {
    const faceapi = faceapiRef.current!;
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    await new Promise<void>((res, rej) => {
      video.onloadedmetadata = () => res();
      video.onerror = () => rej(new Error("vídeo inválido"));
    });
    const duration = Math.max(0.1, video.duration || 1);
    const frames = Math.min(MAX_VIDEO_FRAMES, Math.max(2, Math.ceil(duration)));
    const interval = duration / frames;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d")!;

    // Mantém o melhor rosto (menor distância) por pessoa identificada.
    const bestByKey = new Map<string, DetectedFace>();

    for (let i = 0; i < frames; i++) {
      const t = i * interval;
      video.currentTime = t;
      await new Promise<void>((res) => {
        video.onseeked = () => res();
      });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dets = await faceapi
        .detectAllFaces(canvas)
        .withFaceLandmarks()
        .withFaceDescriptors();
      for (const d of dets) {
        const m = matchDescriptor(d.descriptor);
        const key = m.known ? m.name : `desconhecido-${Math.round(d.detection.box.x)}`;
        const candidate: DetectedFace = {
          thumbnail: cropFace(canvas, d.detection.box),
          name: m.name,
          known: m.known,
          distance: m.distance,
          similarity: Math.max(0, Math.round((1 - m.distance) * 100)),
          frameTime: Math.round(t * 10) / 10,
        };
        const existing = bestByKey.get(key);
        if (!existing || candidate.distance < existing.distance) {
          bestByKey.set(key, candidate);
        }
      }
    }
    URL.revokeObjectURL(url);
    return { fileName: file.name, type: "vídeo", faces: Array.from(bestByKey.values()) };
  };

  const handleAnalyze = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    if (people.length === 0) {
      alert("Cadastre ao menos uma pessoa conhecida antes de analisar.");
      return;
    }
    setBusy(true);
    const out: AnalysisResult[] = [];
    for (const file of files) {
      try {
        if (file.type.startsWith("video/")) out.push(await analyzeVideo(file));
        else out.push(await analyzeImage(file));
      } catch (err) {
        console.error(err);
        out.push({ fileName: file.name, type: "foto", faces: [] });
      }
    }
    setResults((prev) => [...out, ...prev]);
    setBusy(false);
  };

  // ---- Render --------------------------------------------------------------
  return (
    <div className="space-y-8">
      {/* Status de carregamento */}
      {status === "loading" && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          {progressTxt}
        </div>
      )}
      {status === "error" && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Não foi possível carregar os modelos de IA. Verifique a conexão e recarregue a página.
        </div>
      )}

      {/* Ações */}
      <div className="flex flex-wrap gap-3">
        <Button
          onClick={() => setDialogOpen(true)}
          disabled={status !== "ready"}
          className="gap-2"
        >
          <UserPlus className="h-4 w-4" />
          Adicionar pessoa conhecida
        </Button>
        <Button
          variant="secondary"
          onClick={() => analyzeInputRef.current?.click()}
          disabled={status !== "ready" || busy}
          className="gap-2"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Analisar imagens / vídeos
        </Button>
        <input
          ref={analyzeInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={handleAnalyze}
        />
      </div>

      {/* Galeria de pessoas cadastradas */}
      {people.length > 0 && (
        <div>
          <p className="mb-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Galeria de referência ({people.length})
          </p>
          <div className="flex flex-wrap gap-3">
            {people.map((p) => (
              <div
                key={p.id}
                className="group relative flex w-28 flex-col items-center rounded-lg border border-border bg-card p-2"
              >
                {p.photoUrl ? (
                  <img
                    src={p.photoUrl}
                    alt={p.name}
                    className="h-20 w-20 rounded-md object-cover"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-md bg-secondary text-2xl">
                    {p.name[0]}
                  </div>
                )}
                <p className="mt-2 w-full truncate text-center text-xs font-medium text-foreground">
                  {p.name}
                </p>
                <p className="text-[10px] text-muted-foreground">{p.photos} embedding(s)</p>
                <button
                  onClick={() => setPeople((prev) => prev.filter((x) => x.id !== p.id))}
                  className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label={`Remover ${p.name}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resultados */}
      {results.length > 0 && (
        <div>
          <p className="mb-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Resultados da análise
          </p>
          <div className="space-y-4">
            {results.map((r, idx) => (
              <div key={idx} className="rounded-lg border border-border bg-card p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium text-foreground">{r.fileName}</p>
                  <Badge variant="outline" className="shrink-0 font-mono text-[10px] uppercase">
                    {r.type}
                  </Badge>
                </div>
                {r.faces.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum rosto detectado.</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {r.faces.map((f, i) => (
                      <div
                        key={i}
                        className={`flex items-center gap-3 rounded-md border p-2.5 ${
                          f.known
                            ? "border-primary/40 bg-primary/5"
                            : "border-border bg-secondary/40"
                        }`}
                      >
                        <img
                          src={f.thumbnail}
                          alt={f.name}
                          className="h-14 w-14 shrink-0 rounded-md object-cover"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            {f.known ? (
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                            ) : (
                              <HelpCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            )}
                            <span className="truncate text-sm font-semibold text-foreground">
                              {f.name}
                            </span>
                          </div>
                          <p
                            className={`text-xs font-medium ${
                              f.known ? "text-primary" : "text-muted-foreground"
                            }`}
                          >
                            {f.known ? "Conhecido" : "Não conhecido"} · {f.similarity}%
                          </p>
                          <p className="font-mono text-[10px] text-muted-foreground">
                            dist {f.distance.toFixed(3)} / thr {THRESHOLD}
                            {f.frameTime != null && ` · t=${f.frameTime}s`}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Variáveis analisadas + gráfico de acurácia dos modelos */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-5">
          <p className="mb-3 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-primary">
            <ShieldCheck className="h-4 w-4" /> Variáveis analisadas
          </p>
          <dl className="space-y-2.5 text-sm">
            {[
              ["Detecção", "SSD MobileNet v1 (bounding box + score)"],
              ["Alinhamento", "68 landmarks faciais"],
              ["Embedding (ao vivo)", "ResNet-34 · vetor de 128 dimensões"],
              ["Métrica de decisão", `Distância euclidiana ≤ ${THRESHOLD}`],
              ["Estratégia de match", "Menor distância vs. galeria (min-distance)"],
              ["Robustez", "Múltiplas fotos por pessoa = múltiplos embeddings"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-border/60 pb-2 last:border-0">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="text-right font-medium text-foreground">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <p className="mb-1 font-mono text-xs uppercase tracking-widest text-primary">
            Exatidão por modelo
          </p>
          <p className="mb-4 text-xs text-muted-foreground">
            Acurácia de verificação no benchmark LFW. O modelo em destaque roda ao vivo nesta página.
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={MODEL_BENCH}
              layout="vertical"
              margin={{ left: 8, right: 36, top: 4, bottom: 4 }}
            >
              <CartesianGrid horizontal={false} strokeOpacity={0.15} />
              <XAxis
                type="number"
                domain={[98.5, 100]}
                tickFormatter={(v) => `${v}%`}
                fontSize={11}
                stroke="hsl(var(--muted-foreground))"
              />
              <YAxis
                type="category"
                dataKey="modelo"
                width={130}
                fontSize={11}
                stroke="hsl(var(--muted-foreground))"
              />
              <Bar dataKey="acc" radius={[0, 4, 4, 0]}>
                {MODEL_BENCH.map((m, i) => (
                  <Cell
                    key={i}
                    fill={m.live ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"}
                    fillOpacity={m.live ? 1 : 0.45}
                  />
                ))}
                <LabelList
                  dataKey="acc"
                  position="right"
                  formatter={(v: number) => `${v}%`}
                  fontSize={11}
                  fill="hsl(var(--foreground))"
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-2 flex items-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-primary" /> Ao vivo no navegador
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-muted-foreground/45" /> Pipeline Python (Colab)
            </span>
          </div>
        </div>
      </div>

      {/* Diálogo de cadastro */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar pessoa conhecida</DialogTitle>
            <DialogDescription>
              Informe o nome e envie uma ou mais fotos nítidas e frontais. Cada foto vira um
              embedding facial de referência.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="vg-name">Nome</Label>
              <Input
                id="vg-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex.: Maria Silva"
                maxLength={60}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vg-photos">Fotos</Label>
              <Input
                id="vg-photos"
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setNewFiles(Array.from(e.target.files ?? []))}
              />
              {newFiles.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {newFiles.length} foto(s) selecionada(s)
                </p>
              )}
            </div>
            {cadastroErro && <p className="text-sm text-destructive">{cadastroErro}</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={cadastrando}>
              Cancelar
            </Button>
            <Button onClick={handleCadastrar} disabled={cadastrando} className="gap-2">
              {cadastrando && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar pessoa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
