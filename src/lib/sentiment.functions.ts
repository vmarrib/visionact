import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  buildReport,
  type ProductAttribute,
  type ReviewInput,
  type SentimentReport,
} from "./sentiment.server";

const inputSchema = z.object({
  url: z.string().trim().url().max(2048),
});

export type AnalyzeResult =
  | { success: true; report: SentimentReport; sourceUrl: string }
  | { success: false; error: string };

export const analisarProduto = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<AnalyzeResult> => {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      return { success: false, error: "Serviço de coleta indisponível no momento." };
    }

    try {
      const { default: Firecrawl } = await import("@mendable/firecrawl-js");
      const firecrawl = new Firecrawl({ apiKey });

      const result = await firecrawl.scrape(data.url, {
        onlyMainContent: false,
        waitFor: 2500,
        // Drive the page like a real user: open the full reviews modal and
        // scroll to the bottom so ALL opinions (not just the first ones) load
        // before extraction.
        actions: [
          { type: "wait", milliseconds: 2000 },
          // Click "Mostrar todas as opiniões" (best-effort; ignored if absent).
          { type: "click", selector: "[data-testid='see-more'], a[href*='reviews'], button" },
          { type: "wait", milliseconds: 2000 },
          // Scroll down repeatedly to trigger lazy-loading of more reviews.
          { type: "scroll", direction: "down" },
          { type: "wait", milliseconds: 1200 },
          { type: "scroll", direction: "down" },
          { type: "wait", milliseconds: 1200 },
          { type: "scroll", direction: "down" },
          { type: "wait", milliseconds: 1200 },
          { type: "scroll", direction: "down" },
          { type: "wait", milliseconds: 1200 },
          { type: "scroll", direction: "down" },
          { type: "wait", milliseconds: 1500 },
        ],
        formats: [

          {
            type: "json",
            prompt:
              "Extraia: (1) o nome do produto; (2) a nota média (0 a 5); (3) o total de avaliações; (4) as principais características técnicas/especificações do produto (ex.: marca, potência, bateria, conectividade, dimensões, cor) como pares rótulo/valor; (5) TODAS as opiniões/avaliações de clientes visíveis na página, com o texto completo do comentário e a quantidade de estrelas (1 a 5). Inclua o máximo de comentários possível.",
            schema: {
              type: "object",
              properties: {
                productName: { type: "string" },
                averageRating: { type: "number" },
                totalReviews: { type: "number" },
                attributes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      label: { type: "string" },
                      value: { type: "string" },
                    },
                  },
                },
                reviews: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      text: { type: "string" },
                      rating: { type: "number" },
                    },
                  },
                },
              },
              required: ["productName", "reviews"],
            },
          },
        ],
      });

      const json = (result as { json?: unknown }).json as
        | {
            productName?: string;
            averageRating?: number;
            totalReviews?: number;
            attributes?: { label?: string; value?: string }[];
            reviews?: { text?: string; rating?: number }[];
          }
        | undefined;

      const reviews: ReviewInput[] = (json?.reviews ?? [])
        .map((r) => ({
          text: typeof r.text === "string" ? r.text : "",
          rating: typeof r.rating === "number" ? r.rating : null,
        }))
        .filter((r) => r.text || r.rating != null);

      if (reviews.length === 0) {
        return {
          success: false,
          error:
            "Não encontrei avaliações nesta página. Use o link direto de um produto com opiniões de clientes.",
        };
      }

      const attributes: ProductAttribute[] = (json?.attributes ?? [])
        .filter((a) => a && typeof a.label === "string" && typeof a.value === "string")
        .map((a) => ({ label: a.label as string, value: a.value as string }));

      const report = buildReport(
        json?.productName?.trim() || "Produto",
        reviews,
        typeof json?.averageRating === "number" ? json.averageRating : null,
        attributes,
      );

      return { success: true, report, sourceUrl: data.url };
    } catch (err) {
      console.error("[analisarProduto] erro:", err);
      return {
        success: false,
        error: "Não foi possível analisar este link agora. Tente novamente em instantes.",
      };
    }
  });
