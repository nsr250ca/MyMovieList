import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function readEnv() {
  const env = {};
  const content = readFileSync(".env.local", "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index);
    const value = trimmed.slice(index + 1).replace(/^['"]|['"]$/g, "");
    env[key] = value;
  }

  return env;
}

const email = process.argv[2] ?? "demo.moviejournal@example.com";
const password = process.argv[3] ?? "MovieJournal2026!";
const env = readEnv();

if (!env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
}

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

const hasServiceRole = Boolean(env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = hasServiceRole
  ? await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    })
  : await supabase.auth.signUp({ email, password });

if (error) {
  if (hasServiceRole && /already registered|already been registered|already exists/i.test(error.message)) {
    const { data: users, error: listError } = await supabase.auth.admin.listUsers();

    if (listError) {
      console.error(
        JSON.stringify(
          {
            ok: false,
            error: listError.message,
            status: listError.status
          },
          null,
          2
        )
      );
      process.exit(1);
    }

    const existing = users.users.find((user) => user.email === email);

    if (existing) {
      const { error: updateError } = await supabase.auth.admin.updateUserById(existing.id, {
        password,
        email_confirm: true
      });

      if (!updateError) {
        console.log(
          JSON.stringify(
            {
              ok: true,
              mode: "updated_existing_user",
              email,
              password,
              userId: existing.id,
              sessionCreated: false,
              needsEmailConfirmation: false
            },
            null,
            2
          )
        );
        process.exit(0);
      }

      console.error(
        JSON.stringify(
          {
            ok: false,
            error: updateError.message,
            status: updateError.status
          },
          null,
          2
        )
      );
      process.exit(1);
    }
  }

  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error.message,
        status: error.status
      },
      null,
      2
    )
  );
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      mode: hasServiceRole ? "admin_created_confirmed_user" : "public_signup",
      email,
      password,
      userId: data.user?.id ?? null,
      sessionCreated: "session" in data ? Boolean(data.session) : false,
      needsEmailConfirmation: hasServiceRole ? false : Boolean(data.user && !data.session)
    },
    null,
    2
  )
);
