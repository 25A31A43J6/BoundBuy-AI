import { PRODUCT_IMAGE_REGISTRY, getProductImageUrl, getProductSvgFallback } from '../src/lib/productImages.ts';
import { store } from '../server/src/services/store.ts';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    process.exit(1);
  }
}

async function runTests() {
  console.log('🧪 Running Catalog Image & Fallback Verification Suite...\n');

  // Test 1: Wall-Mounted Hanging File Organizer image is valid and relevant
  console.log('Test 1: Verify 5-Tier Heavy Mesh Metal Wall Mounted Hanging File Organizer');
  const organizerId = 'prod_stor_wall_mounted_hanging_file_organizer_5';
  const organizerMeta = PRODUCT_IMAGE_REGISTRY[organizerId];
  assert(Boolean(organizerMeta), `Product ${organizerId} must exist in registry`);
  assert(
    organizerMeta.url.includes('photo-1538688525198-9b88f6f53126'),
    `Organizer must use verified organizer image photo-1538688525198-9b88f6f53126, got: ${organizerMeta.url}`
  );
  console.log(`  ✓ Verified organizer photo URL: ${organizerMeta.url}`);

  // Test 2: Fallback SVG NEVER contains a success checkmark
  console.log('\nTest 2: Ensure SVG visual fallbacks never contain a checkmark icon');
  const fallbackSvgEncoded = getProductSvgFallback(organizerId, '5-Tier Organizer', 'storage_organization');
  const decodedSvg = decodeURIComponent(fallbackSvgEncoded);
  // Check for the old checkmark vector coordinates
  assert(!decodedSvg.includes('M192 130 L198 136 L210 124'), 'SVG fallback must not contain checkmark path');
  // Check that it contains category-specific organizer tiers
  assert(decodedSvg.includes('Outer Organizer Frame') || decodedSvg.includes('Shelf Tiers'), 'SVG must contain organizer illustration');
  console.log('  ✓ Verified SVG fallback renders technical schematic illustration, zero checkmarks');

  // Test 3: Test fallback across all 10 categories
  console.log('\nTest 3: Verify fallback illustrations across all 10 categories');
  const categories = [
    'office_stationery',
    'college_education',
    'eco_friendly',
    'technology_workspace',
    'event_supplies',
    'shipping_packaging',
    'workplace_cleaning',
    'storage_organization',
    'safety_accessories',
    'hospitality_breakroom',
  ];
  for (const cat of categories) {
    const svg = decodeURIComponent(getProductSvgFallback('dummy_test_sku', 'Test Product', cat));
    assert(!svg.includes('M192 130 L198 136 L210 124'), `Category ${cat} fallback must not contain checkmark`);
    assert(svg.includes('SKU: dummy_test_sku'), `Category ${cat} must include SKU metadata`);
  }
  console.log('  ✓ Verified all 10 categories render distinctive category schematic vectors');

  // Test 4: Registry completeness for all 140 catalog items
  console.log('\nTest 4: Verify 140 catalog products in database');
  const products = store.getProducts();
  assert(products.length === 140, `Store must have 140 products, got: ${products.length}`);
  
  let validUrlsCount = 0;
  for (const p of products) {
    assert(Boolean(p.imageUrl), `Product ${p.id} must have non-empty imageUrl`);
    assert(p.imageUrl.startsWith('http://') || p.imageUrl.startsWith('https://') || p.imageUrl.startsWith('/'), `Product ${p.id} must have valid URL format`);
    validUrlsCount++;
  }
  assert(validUrlsCount === 140, `All 140 products must have valid image URLs`);
  console.log(`  ✓ All 140 products in store have valid imageUrl attributes`);

  // Test 5: getProductImageUrl helper logic
  console.log('\nTest 5: Verify getProductImageUrl fallback resolution');
  const defaultFallback = getProductImageUrl('non_existent_id');
  assert(Boolean(defaultFallback), 'Must provide reliable fallback for unknown ID');
  const customFallback = getProductImageUrl('non_existent_id', 'https://example.com/custom.jpg');
  assert(customFallback === 'https://example.com/custom.jpg', 'Must respect custom fallback URL');
  console.log('  ✓ Fallback resolution helper functions properly');

  // Test 6: Verify database state preservation
  console.log('\nTest 6: Verify zero regression to orders and pacts');
  const orders = store.getAllOrders();
  const pacts = store.getAllPacts();
  assert(orders.length >= 20, 'Order records must remain intact');
  assert(pacts.length >= 20, 'Purchase pact records must remain intact');
  console.log(`  ✓ Preserved ${orders.length} orders and ${pacts.length} purchase pacts in database`);

  console.log('\n🎉 ALL CATALOG IMAGE & LAYOUT TESTS PASSED!\n');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
