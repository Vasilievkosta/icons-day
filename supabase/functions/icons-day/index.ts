import "@supabase/functions-js/edge-runtime.d.ts";
import { Bot } from "grammy";
import { withSupabase } from "@supabase/server";

const bot = new Bot(Deno.env.get("BOT_TOKEN") ?? "");
const botInit = bot.init();

bot.command("start", (ctx) =>
  ctx.reply(
    "Добро пожаловать! 🕊️\n\n" +
      "Нажмите /today, чтобы увидеть иконы на сегодня.",
  )
);

bot.command("today", async (ctx) => {
  try {
    const icons = await getAzbykaIcons();

    for (const icon of icons) {
      const photo = icon.imgLarge || icon.img;

      if (!photo) {
        continue;
      }

      await ctx.replyWithPhoto(photo, { caption: icon.title });
    }
  } catch (error) {
    console.error("icons-day today error:", error);
    await ctx.reply("Не удалось получить иконы дня. Попробуйте позже.");
  }
});

async function saveTelegramUser(
  supabaseAdmin: { from: (table: string) => any },
  from: { id: number; username?: string; first_name?: string },
) {
  const now = new Date().toISOString();
  const user = {
    username: from.username ?? null,
    first_name: from.first_name ?? null,
    last_seen_at: now,
  };

  const { data, error: selectError } = await supabaseAdmin
    .from("telegram_users")
    .select("id")
    .eq("telegram_id", from.id)
    .maybeSingle();

  if (selectError) {
    throw selectError;
  }

  if (data) {
    const { error } = await supabaseAdmin
      .from("telegram_users")
      .update(user)
      .eq("telegram_id", from.id);

    if (error) {
      throw error;
    }

    return data.id;
  }

  const { data: inserted, error } = await supabaseAdmin
    .from("telegram_users")
    .insert({
      telegram_id: from.id,
      ...user,
      first_seen_at: now,
    })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return inserted.id;
}

async function saveBotRequest(
  supabaseAdmin: { from: (table: string) => any },
  userId: number,
  requestType: "start" | "today",
) {
  const { error } = await supabaseAdmin
    .from("bot_requests")
    .insert({
      user_id: userId,
      request_type: requestType,
    });

  if (error) {
    throw error;
  }
}

function isStartCommand(update: {
  message?: {
    text?: string;
    from?: {
      id: number;
      username?: string;
      first_name?: string;
    };
  };
}) {
  const text = update.message?.text;

  return typeof text === "string" && /^\/start(?:@\w+)?(?:\s|$)/.test(text);
}

function isTodayCommand(update: {
  message?: {
    text?: string;
    from?: {
      id: number;
      username?: string;
      first_name?: string;
    };
  };
}) {
  const text = update.message?.text;

  return typeof text === "string" && /^\/today(?:@\w+)?(?:\s|$)/.test(text);
}

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
  fetch: withSupabase({ auth: ["none"] }, async (req, ctx) => {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    try {
      const update = await req.json();

      if (isStartCommand(update) && update.message?.from) {
        const userId = await saveTelegramUser(
          ctx.supabaseAdmin,
          update.message.from,
        );

        await saveBotRequest(ctx.supabaseAdmin, userId, "start");
      }

      if (isTodayCommand(update) && update.message?.from) {
        const userId = await saveTelegramUser(
          ctx.supabaseAdmin,
          update.message.from,
        );

        await saveBotRequest(ctx.supabaseAdmin, userId, "today");
      }

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
