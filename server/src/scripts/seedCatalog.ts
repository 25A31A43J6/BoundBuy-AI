import { store } from '../services/store.ts';

async function main() {
  console.log('🌱 [BoundBuy AI] Running Idempotent Catalog Seeder...\n');

  const beforeStorage = store.getStorageInfo();
  const ordersBefore = beforeStorage.ordersCount;
  const pactsBefore = beforeStorage.pactsCount;

  console.log(`Initial Status:`);
  console.log(`  - Products: ${beforeStorage.productsCount}`);
  console.log(`  - Orders: ${ordersBefore}`);
  console.log(`  - Pacts: ${pactsBefore}\n`);

  // Run idempotent seed
  const result = store.seedCatalog(false);

  console.log(`Seed Execution Result:`);
  console.log(`  - Newly Added Products: ${result.addedProducts}`);
  console.log(`  - Newly Added Suppliers: ${result.addedSuppliers}`);
  console.log(`  - Total Products in Database: ${result.totalProducts}`);
  console.log(`  - Total Suppliers in Database: ${result.totalSuppliers}\n`);

  // Verify orders, pacts, and data integrity
  const afterStorage = store.getStorageInfo();
  if (afterStorage.ordersCount !== ordersBefore || afterStorage.pactsCount !== pactsBefore) {
    console.error('❌ CRITICAL ERROR: Order or Pact history was altered during catalog seeding!');
    process.exit(1);
  }

  // Check categories breakdown
  const products = store.getProducts();
  const categoryMap: Record<string, number> = {};
  for (const p of products) {
    categoryMap[p.category] = (categoryMap[p.category] || 0) + 1;
  }

  console.log('Category Distribution:');
  for (const [cat, count] of Object.entries(categoryMap)) {
    console.log(`  - ${cat}: ${count} products`);
  }

  // Idempotency check: running seed again should add 0 products
  const rerun = store.seedCatalog(false);
  console.log(`\nIdempotency Verification:`);
  console.log(`  - Second run added products: ${rerun.addedProducts} (Expected: 0)`);
  console.log(`  - Second run added suppliers: ${rerun.addedSuppliers} (Expected: 0)`);

  if (rerun.addedProducts !== 0 || rerun.addedSuppliers !== 0) {
    console.error('❌ Seeding is NOT idempotent!');
    process.exit(1);
  }

  console.log('\n✅ Catalog seeding completed successfully with zero regression to order history.');
}

main().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
