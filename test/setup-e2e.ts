// globalSetup de jest-e2e: corre UNA vez antes de todos los specs.
// ConfigModule.forRoot() en AppModule ya carga el .env, asi que aqui solo
// marcamos NODE_ENV=test para que el resto del codigo pueda diferenciar
// el contexto si lo necesita.
//
// Los specs se apoyan en la DB de dev (migraciones aplicadas + admin sembrado)
// y limpian sus propios datos en afterAll. Es suficiente para el alcance del
// MVP. Para aislamiento total, en el futuro: apuntar DATABASE_URL_TEST a una
// DB separada y correr `prisma migrate deploy` aqui.

export default async function globalSetup(): Promise<void> {
  process.env.NODE_ENV ??= 'test';
}
