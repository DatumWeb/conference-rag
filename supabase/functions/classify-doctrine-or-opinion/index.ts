import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";

type ContextTalk = { title: string; speaker: string; text: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authResult = await requireAuth(req);
  if ("error" in authResult) return authResult.error;

  try {
    const { statement, context_talks } = await req.json();

    if (!statement || typeof statement !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'statement' field" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!context_talks || !Array.isArray(context_talks)) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'context_talks' field" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const contextText = (context_talks as ContextTalk[])
      .map((talk) => `"${talk.title}" by ${talk.speaker}:\n${talk.text}`)
      .join("\n\n---\n\n");

    const systemPrompt = `You are an assistant analyzing statements in light of General Conference talks from The Church of Jesus Christ of Latter-day Saints. Given a statement and excerpts from talks below, choose ONE verdict that best fits:

- **Aligns with doctrine**: The statement matches or is clearly supported by official teaching, scripture, or prophetic doctrine in the excerpts.
- **Personal opinion**: The statement matches the speaker's own views, experiences, or "in my opinion" style content in the excerpts.
- **Not supported**: The statement contradicts the excerpts, is not found in them, or the excerpts do not support it. (Use this when the statement is wrong or not doctrinal according to the talks.)

Format your response as: "Verdict: [exactly one of: Aligns with doctrine / Personal opinion / Not supported]", then a brief explanation, then "Quotes:" followed by 2–4 relevant quoted sentences with the talk title in parentheses. Use ONLY the provided excerpts.`;

    const userPrompt = `Statement to analyze:\n"${statement}"\n\n---\n\nTalk excerpts:\n\n${contextText}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const msg = (err as { error?: { message?: string } }).error?.message || "OpenAI API error";
      return new Response(
        JSON.stringify({ error: msg }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content ?? "";

    return new Response(
      JSON.stringify({ answer }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
