module.exports = {
  schema: './db/schema.cjs', out: './db/migrations', dialect: 'postgresql',
  dbCredentials: { url: process.env.DELIVERY_DATABASE_URL_UNPOOLED || '' },
  migrations: { table: 'pause90_pdf_migrations', schema: 'drizzle' },
};
