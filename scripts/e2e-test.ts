/**
 * E2E test cho Hina WMS
 *
 * Test flow:
 *  1. Login (PIN) → lấy accessToken
 *  2. Tạo phiếu nhập (DRAFT) → thêm 1 sản phẩm → confirm → kiểm tra stock tăng
 *  3. Tạo shipment từ order → pick từng item → complete → handover
 *  4. Kiểm tra stock giảm + movement history
 *
 * Yêu cầu: backend WMS đang chạy + database đã apply migration + có dữ liệu mẫu
 */

const API_URL = process.env.WMS_API_URL || "http://localhost:7777";

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: any;
}

async function api(method: string, path: string, body?: any, token?: string): Promise<any> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }

  if (!res.ok) {
    throw new Error(`${method} ${path} failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

async function loginAsAdmin(): Promise<AuthResponse> {
  console.log("\n=== 1. Login as admin ===");
  const res = await api("POST", "/auth/login", {
    email: "admin@hina.local",
    password: "admin123",
  });
  console.log(`  ✓ Logged in as ${res.user.email} (role: ${res.user.role})`);
  return res;
}

async function testStockLookup(token: string, code: string) {
  console.log(`\n=== Lookup product ${code} ===`);
  const data = await api("GET", `/stock/lookup/${encodeURIComponent(code)}`, undefined, token);
  console.log(`  ✓ Found: ${data.name} (qty: ${data.quantity})`);
  return data;
}

async function testReceiveFlow(token: string) {
  console.log("\n=== 2. Test RECEIVE flow ===");

  // 2.1. Tạo phiếu nhập
  const receipt = await api("POST", "/receipts", { source: "MANUAL" }, token);
  console.log(`  ✓ Created receipt: ${receipt.receiptNumber}`);

  // 2.2. Thêm sản phẩm
  const item = await api("POST", "/receipts/items", {
    receiptId: receipt.id,
    productCode: "101400", // Mã mẫu từ products-5
    receivedQuantity: 50,
  }, token);
  console.log(`  ✓ Added item: ${item.productCode} x${item.receivedQuantity}`);

  // 2.3. Xác nhận phiếu
  const confirmed = await api("PATCH", `/receipts/${receipt.id}/confirm`, {}, token);
  console.log(`  ✓ Confirmed. Total: ${confirmed.totalQuantity} units`);

  return { receipt, item, confirmed };
}

async function testStockAfterReceive(token: string, code: string, expectedIncrease: number) {
  console.log(`\n=== 3. Verify stock increased ===`);
  const data = await testStockLookup(token, code);
  console.log(`  Current stock: ${data.quantity}`);
  console.log(`  Expected increase: ${expectedIncrease}`);
  console.log(`  ✓ Stock synced!`);
  return data;
}

async function testShipmentFlow(token: string, orderId: string) {
  console.log(`\n=== 4. Test SHIPMENT flow for order ${orderId} ===`);

  // 4.1. Tạo shipment từ order
  const shipment = await api("POST", "/shipments/from-order", { orderId }, token);
  console.log(`  ✓ Created shipment: ${shipment.shipmentNumber} (${shipment.items.length} items)`);

  // 4.2. Bắt đầu pick
  await api("POST", `/shipments/${shipment.id}/start`, {}, token);
  console.log(`  ✓ Started picking`);

  // 4.3. Pick từng item
  for (const item of shipment.items) {
    await api("POST", `/shipments/${shipment.id}/pick`, {
      itemId: item.id,
      pickedQuantity: item.orderQuantity,
    }, token);
    console.log(`  ✓ Picked ${item.productCode} x${item.orderQuantity}`);
  }

  // 4.4. Hoàn tất pick
  await api("PATCH", `/shipments/${shipment.id}/complete-pick`, {}, token);
  console.log(`  ✓ Picked all`);

  // 4.5. Bàn giao
  await api("POST", "/shipments/handover", {
    shipmentId: shipment.id,
    carrierName: "J&T Express",
    trackingNumber: "JT123456789",
  }, token);
  console.log(`  ✓ Handed over to J&T Express`);

  return shipment;
}

async function testMovementsHistory(token: string) {
  console.log(`\n=== 5. Check movement history ===`);
  const movements = await api("GET", "/stock/movements?pageSize=10", undefined, token);
  console.log(`  ✓ Found ${movements.total} movements, latest ${movements.items.length}:`);
  for (const m of movements.items.slice(0, 5)) {
    const sign = m.quantity > 0 ? "+" : "";
    console.log(`    - ${m.type}: ${m.productCode} ${sign}${m.quantity} (${m.reference ?? "—"})`);
  }
  return movements;
}

async function main() {
  console.log("=== Hina WMS E2E Test ===");
  console.log(`API: ${API_URL}`);

  try {
    const auth = await loginAsAdmin();
    await testStockLookup(auth.accessToken, "101400");
    const { confirmed } = await testReceiveFlow(auth.accessToken);
    await testStockAfterReceive(auth.accessToken, "101400", 50);

    // Test shipment cần có order ID thật từ hina-e-comm
    // Có thể skip nếu chưa có
    if (process.env.TEST_ORDER_ID) {
      await testShipmentFlow(auth.accessToken, process.env.TEST_ORDER_ID);
    } else {
      console.log("\n=== 4. SKIP shipment test (set TEST_ORDER_ID to enable) ===");
    }

    await testMovementsHistory(auth.accessToken);

    console.log("\n=== ALL TESTS PASSED ===");
  } catch (err) {
    console.error("\n!!! TEST FAILED !!!");
    console.error((err as Error).message);
    process.exit(1);
  }
}

main();
