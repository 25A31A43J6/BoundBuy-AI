import crypto from 'crypto';
import type {
  PurchasePact,
  PactItem,
  PolicyRuleEvaluation,
  StructuredPurchaseIntent,
  CatalogProduct,
} from '../types/index.ts';
import { store } from './store.ts';

export class PolicyEngine {
  /**
   * Generates a deterministic canonical JSON string of the authorized purchase terms
   * and computes a SHA-256 cryptographic hash.
   */
  public static computeCanonicalSnapshotHash(pact: {
    items: PactItem[];
    subtotal: number;
    shippingCost: number;
    estimatedTax: number;
    grandTotal: number;
    currency: string;
    maxBudget: number;
    shippingDeadlineDays: number | null;
    allowSubstitutions: boolean;
    buyerEmail?: string;
  }): string {
    // Sort items deterministically by productId
    const sortedItems = [...pact.items]
      .sort((a, b) => a.productId.localeCompare(b.productId))
      .map((item) => ({
        productId: item.productId,
        supplierId: item.supplierId,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice.toFixed(2)),
        itemTotal: Number(item.itemTotal.toFixed(2)),
      }));

    const canonicalTerms = {
      allowSubstitutions: pact.allowSubstitutions,
      currency: pact.currency.toUpperCase(),
      estimatedTax: Number(pact.estimatedTax.toFixed(2)),
      grandTotal: Number(pact.grandTotal.toFixed(2)),
      items: sortedItems,
      maxBudget: Number(pact.maxBudget.toFixed(2)),
      shippingCost: Number(pact.shippingCost.toFixed(2)),
      shippingDeadlineDays: pact.shippingDeadlineDays,
      subtotal: Number(pact.subtotal.toFixed(2)),
    };

    const canonicalString = JSON.stringify(canonicalTerms);
    return crypto.createHash('sha256').update(canonicalString).digest('hex');
  }

  /**
   * Calculates subtotal, shipping, tax, and grand total independently on the server.
   * Never trusts client-side numbers.
   */
  public static calculateTotals(items: { productId: string; quantity: number }[]): {
    pactItems: PactItem[];
    subtotal: number;
    shippingCost: number;
    estimatedTax: number;
    grandTotal: number;
  } {
    const pactItems: PactItem[] = [];
    const supplierShippingRates: Record<string, number> = {};

    let subtotal = 0;

    for (const item of items) {
      const product = store.getProductById(item.productId);
      if (!product) {
        throw new Error(`Catalog product not found: ${item.productId}`);
      }

      const unitPrice = Number(product.unitPrice);
      const qty = Math.max(1, Math.floor(item.quantity));
      const itemTotal = Number((unitPrice * qty).toFixed(2));
      subtotal += itemTotal;

      // Group shipping by supplier flat rate
      if (
        supplierShippingRates[product.supplierId] === undefined ||
        product.shippingFlatRate > supplierShippingRates[product.supplierId]
      ) {
        supplierShippingRates[product.supplierId] = product.shippingFlatRate;
      }

      pactItems.push({
        productId: product.id,
        productName: product.name,
        supplierId: product.supplierId,
        supplierName: product.supplierName,
        unitPrice,
        quantity: qty,
        itemTotal,
        shippingRate: product.shippingFlatRate,
        deliveryDays: product.estimatedDeliveryDays,
      });
    }

    // Total shipping across participating suppliers
    const totalShipping = Object.values(supplierShippingRates).reduce(
      (sum, val) => sum + val,
      0
    );

    const roundedSubtotal = Number(subtotal.toFixed(2));
    const roundedShipping = Number(totalShipping.toFixed(2));
    const roundedTax = 0.00; // Tax calculation placeholder or 0 for exempt/standard demo
    const grandTotal = Number((roundedSubtotal + roundedShipping + roundedTax).toFixed(2));

    return {
      pactItems,
      subtotal: roundedSubtotal,
      shippingCost: roundedShipping,
      estimatedTax: roundedTax,
      grandTotal,
    };
  }

  /**
   * Evaluates all policy rules against the current catalog state and intent limits.
   */
  public static evaluatePolicyRules(
    items: PactItem[],
    grandTotal: number,
    maxBudget: number,
    deadlineDays: number | null,
    allowSubstitutions: boolean,
    intent?: StructuredPurchaseIntent
  ): {
    evaluations: PolicyRuleEvaluation[];
    isCompliant: boolean;
  } {
    const evaluations: PolicyRuleEvaluation[] = [];

    // Rule 1: Budget Ceiling Check
    const isWithinBudget = grandTotal <= maxBudget;
    evaluations.push({
      ruleId: 'RULE_BUDGET_CEILING',
      ruleName: 'Budget Boundary Check',
      passed: isWithinBudget,
      severity: 'blocking',
      message: isWithinBudget
        ? `Grand total of $${grandTotal.toFixed(2)} is within authorized budget limit of $${maxBudget.toFixed(2)}.`
        : `Grand total of $${grandTotal.toFixed(2)} EXCEEDS the authorized maximum budget of $${maxBudget.toFixed(2)} by $${(grandTotal - maxBudget).toFixed(2)}.`,
      details: { grandTotal, maxBudget, variance: grandTotal - maxBudget },
    });

    // Rule 2: Catalog Stock Verification
    let stockPassed = true;
    const stockIssues: string[] = [];
    for (const item of items) {
      const currentProduct = store.getProductById(item.productId);
      if (!currentProduct) {
        stockPassed = false;
        stockIssues.push(`Product ${item.productName} (${item.productId}) is no longer in catalog.`);
      } else if (currentProduct.stockQuantity < item.quantity) {
        stockPassed = false;
        stockIssues.push(
          `${currentProduct.name}: requested ${item.quantity}, but only ${currentProduct.stockQuantity} currently in stock.`
        );
      }
    }
    evaluations.push({
      ruleId: 'RULE_STOCK_AVAILABILITY',
      ruleName: 'Live Catalog Stock Verification',
      passed: stockPassed,
      severity: 'blocking',
      message: stockPassed
        ? `All ${items.length} items have verified sufficient stock in the supplier catalog.`
        : `Stock constraints violated: ${stockIssues.join('; ')}`,
      details: { stockIssues },
    });

    // Rule 3: Delivery Deadline Compliance
    let deliveryPassed = true;
    let maxDeliveryDays = 0;
    for (const item of items) {
      if (item.deliveryDays > maxDeliveryDays) {
        maxDeliveryDays = item.deliveryDays;
      }
    }
    if (deadlineDays !== null && deadlineDays > 0) {
      if (maxDeliveryDays > deadlineDays) {
        deliveryPassed = false;
      }
      evaluations.push({
        ruleId: 'RULE_DELIVERY_DEADLINE',
        ruleName: 'Shipping Timeline Constraint',
        passed: deliveryPassed,
        severity: 'blocking',
        message: deliveryPassed
          ? `Estimated longest delivery of ${maxDeliveryDays} days is comfortably within buyer deadline of ${deadlineDays} days.`
          : `Delivery timeline violation: Slowest supplier requires ${maxDeliveryDays} business days, exceeding deadline of ${deadlineDays} days.`,
        details: { maxDeliveryDays, requestedDeadlineDays: deadlineDays },
      });
    } else {
      evaluations.push({
        ruleId: 'RULE_DELIVERY_DEADLINE',
        ruleName: 'Shipping Timeline Constraint',
        passed: true,
        severity: 'info',
        message: `No hard delivery deadline specified by buyer. Standard fulfillment (${maxDeliveryDays} days).`,
        details: { maxDeliveryDays },
      });
    }

    // Rule 4: Zero Unauthorized Substitutions
    evaluations.push({
      ruleId: 'RULE_SUBSTITUTION_INTEGRITY',
      ruleName: 'Product Substitution Boundary',
      passed: true,
      severity: 'blocking',
      message: allowSubstitutions
        ? 'Buyer explicitly permitted intelligent item substitutions if stock fluctuates.'
        : 'Buyer strictly disallows substitutions. Exact catalog SKUs must be supplied.',
      details: { allowSubstitutions },
    });

    // Rule 5: Quantities Fulfill Intent (if intent supplied)
    if (intent && intent.requiredItems && intent.requiredItems.length > 0) {
      let quantityPassed = true;
      const totalUnitsSelected = items.reduce((sum, it) => sum + it.quantity, 0);
      const totalUnitsRequired = intent.requiredItems.reduce((sum, req) => sum + req.quantity, 0);

      if (totalUnitsSelected < totalUnitsRequired) {
        quantityPassed = false;
      }

      evaluations.push({
        ruleId: 'RULE_QUANTITY_MATCH',
        ruleName: 'Requirements Quantity Coverage',
        passed: quantityPassed,
        severity: quantityPassed ? 'info' : 'warning',
        message: quantityPassed
          ? `Cart contains ${totalUnitsSelected} units, fulfilling the required ${totalUnitsRequired} units.`
          : `Cart contains ${totalUnitsSelected} units, which is fewer than the requested ${totalUnitsRequired} units.`,
        details: { totalUnitsSelected, totalUnitsRequired },
      });
    }

    const isCompliant = evaluations
      .filter((r) => r.severity === 'blocking')
      .every((r) => r.passed);

    return { evaluations, isCompliant };
  }

  /**
   * Revalidates an existing Purchase Pact against current catalog data and previous snapshot hash.
   * If any material term has changed (prices, stock, shipping) or rule broken,
   * invalidates approval!
   */
  public static revalidatePact(pactId: string): {
    pact: PurchasePact;
    isStillValid: boolean;
    invalidationReason: string | null;
  } {
    const pact = store.getPact(pactId);
    if (!pact) {
      throw new Error(`Pact with ID ${pactId} not found`);
    }

    // 1. Recalculate totals from live catalog
    const { pactItems, subtotal, shippingCost, estimatedTax, grandTotal } =
      this.calculateTotals(
        pact.items.map((it) => ({ productId: it.productId, quantity: it.quantity }))
      );

    // 2. Evaluate policy rules
    const { evaluations, isCompliant } = this.evaluatePolicyRules(
      pactItems,
      grandTotal,
      pact.maxBudget,
      pact.shippingDeadlineDays,
      pact.allowSubstitutions
    );

    // 3. Compute live snapshot hash
    const currentHash = this.computeCanonicalSnapshotHash({
      items: pactItems,
      subtotal,
      shippingCost,
      estimatedTax,
      grandTotal,
      currency: pact.currency,
      maxBudget: pact.maxBudget,
      shippingDeadlineDays: pact.shippingDeadlineDays,
      allowSubstitutions: pact.allowSubstitutions,
    });

    let isStillValid = true;
    let invalidationReason: string | null = null;

    // Check compliance
    if (!isCompliant) {
      isStillValid = false;
      const failed = evaluations.find((e) => e.severity === 'blocking' && !e.passed);
      invalidationReason = failed ? failed.message : 'One or more mandatory policy rules failed.';
    }

    // If pact was previously approved, verify canonical hash matches
    if (pact.approvalStatus === 'approved') {
      if (pact.canonicalSnapshotHash !== currentHash) {
        isStillValid = false;
        invalidationReason =
          'Cryptographic integrity mismatch: catalog terms or prices changed since buyer approved this Pact.';
      }
    }

    // Update pact with live numbers and evaluations
    pact.items = pactItems;
    pact.subtotal = subtotal;
    pact.shippingCost = shippingCost;
    pact.estimatedTax = estimatedTax;
    pact.grandTotal = grandTotal;
    pact.ruleEvaluations = evaluations;
    pact.isCompliant = isCompliant;
    pact.lastValidatedAt = new Date().toISOString();

    if (!isStillValid && pact.approvalStatus === 'approved') {
      pact.approvalStatus = 'invalidated_by_changes';
      pact.invalidationReason = invalidationReason;

      store.recordAuditEvent({
        eventType: 'APPROVAL_INVALIDATED',
        entityId: pact.id,
        actor: 'BoundBuy Guardrail Engine',
        summary: `Purchase Pact ${pact.id} approval invalidated: ${invalidationReason}`,
        details: {
          previousHash: pact.canonicalSnapshotHash,
          currentHash,
          invalidationReason,
        },
      });
    }

    store.savePact(pact);
    return { pact, isStillValid, invalidationReason };
  }

  /**
   * Helper to simulate a supplier price change for interactive guardrail demonstration.
   */
  public static simulateSupplierPriceChange(
    pactId: string,
    priceMultiplier: number
  ): {
    pact: PurchasePact;
    previousGrandTotal: number;
    newGrandTotal: number;
    affectedProduct: CatalogProduct;
  } {
    const pact = store.getPact(pactId);
    if (!pact) {
      throw new Error(`Pact ${pactId} not found`);
    }

    if (pact.items.length === 0) {
      throw new Error('Pact has no items to modify');
    }

    const previousGrandTotal = pact.grandTotal;
    const targetItem = pact.items[0];
    const product = store.getProductById(targetItem.productId);
    if (!product) {
      throw new Error(`Product ${targetItem.productId} not found in catalog`);
    }

    const oldPrice = product.unitPrice;
    const newPrice = Number((oldPrice * priceMultiplier).toFixed(2));
    product.unitPrice = newPrice;
    store.updateProduct(product);

    store.recordAuditEvent({
      eventType: 'PRICE_CHANGE_SIMULATED',
      entityId: pact.id,
      actor: 'Guardrail Simulation Lab',
      summary: `Simulated price change: Supplier "${product.supplierName}" modified "${product.name}" price from $${oldPrice.toFixed(2)} to $${newPrice.toFixed(2)}.`,
      details: {
        productId: product.id,
        oldPrice,
        newPrice,
        pactId,
      },
    });

    // Revalidate and invalidate the pact
    const revalidation = this.revalidatePact(pactId);

    return {
      pact: revalidation.pact,
      previousGrandTotal,
      newGrandTotal: revalidation.pact.grandTotal,
      affectedProduct: product,
    };
  }
}
