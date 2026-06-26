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
        formats: [
          {
            type: "json",
            prompt:
              "Extraia o nome do produto, a nota média (0 a 5), o total de avaliações e TODAS as opiniões/avaliações de clientes visíveis na página. Para cada opinião, retorne o texto completo do comentário e a quantidade de estrelas (1 a 5). Inclua o máximo de comentários possível.",
            schema: {
              type: "object",
              properties: {
                productName: { type: "string" },
                averageRating: { type: "number" },
                totalReviews: { type: "number" },
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

      const report = buildReport(
        json?.productName?.trim() || "Produto",
        reviews,
        typeof json?.averageRating === "number" ? json.averageRating : null,
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
