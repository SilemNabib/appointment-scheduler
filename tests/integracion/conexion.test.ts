import { sql } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { db, enTransaccion } from "@/servidor/db/cliente";

describe("conexión con la rama efímera", () => {
  test("select 1 con db() (HTTP)", async () => {
    const resultado = await db().execute(sql`select 1 as uno`);
    expect(resultado.rows).toEqual([{ uno: 1 }]);
  });

  test("select 1 con enTransaccion() (WebSocket), en read committed", async () => {
    const resultado = await enTransaccion(async (tx) => ({
      uno: (await tx.execute(sql`select 1 as uno`)).rows,
      aislamiento: (await tx.execute(sql`show transaction_isolation`)).rows,
    }));
    expect(resultado).toEqual({
      uno: [{ uno: 1 }],
      aislamiento: [{ transaction_isolation: "read committed" }],
    });
  });

  test("la rama tiene aplicada la cadena de migraciones", async () => {
    const resultado = await db().execute(
      sql`select domain_name from information_schema.domains
           where domain_schema = 'public' order by domain_name`,
    );
    expect(resultado.rows).toEqual([
      { domain_name: "clave_funcionalidad" },
      { domain_name: "clave_limite" },
    ]);
  });
});
