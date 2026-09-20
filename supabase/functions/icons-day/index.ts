import "@supabase/functions-js/edge-runtime.d.ts";
import { Bot } from "grammy";
import { withSupabase } from "@supabase/server";

const bot = new Bot(Deno.env.get("BOT_TOKEN") ?? "");
const botInit = bot.init();

bot.command("start", (ctx) => ctx.reply("Icons of the Day работает!"));

async function getAzbykaIcons() {
  const response = await fetch(
    "https://azbyka.ru/days/widgets/presentations.json?image=1",
  );

  if (!response.ok) {
    throw new Error(`Azbyka returned ${response.status}`);
  }

  const data = await response.json();

  return data.imgs.map((html: string) => {
    const title = html.match(/title="([^"]+)"/)?.[1] ?? "";
    const img = html.match(/<img[^>]+src="([^"]+)"/)?.[1] ?? "";
    const imgLarge = html.match(/srcset="([^"]+)\s+2x"/)?.[1] ?? "";
    const href = html.match(/href="([^"]+)"/)?.[1] ?? "";

    return {
      title,
      img,
      imgLarge,
      href,
    };
  });
}

export default {
  fetch: withSupabase({ auth: ["none"] }, async (req) => {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    try {
      const update = await req.json();
      await botInit;
      await bot.handleUpdate(update);

      return new Response("OK");
    } catch (error) {
      console.error("icons-day webhook error:", error);
      return Response.json(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        { status: 500 },
      );
    }
  }),
};
